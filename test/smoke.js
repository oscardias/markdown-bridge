// Smoke test: loads the real window in a hidden BrowserWindow and exercises
// conversion in both directions, rich paste and sanitization.
//
//   npm test
//
// On Wayland sessions where Electron will not start, use:
//   npm run test:x11

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { buildContextMenuTemplate } = require('../src/context-menu');

const ROOT = path.join(__dirname, '..');
const consoleLogs = [];

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(ROOT, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // In-memory partition: every run starts with no saved draft.
      partition: 'smoke-test',
    },
  });

  win.webContents.on('console-message', (event) => {
    consoleLogs.push(`[${event.level}] ${event.message} (line ${event.lineNumber})`);
  });

  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await new Promise((r) => setTimeout(r, 700));

  const r = await win.webContents.executeJavaScript(String.raw`(async () => {
    const out = {};
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const md = document.getElementById('markdown');
    const pv = document.getElementById('preview');
    const edit = (el) => el.dispatchEvent(new Event('input', { bubbles: true }));

    out.libs = {
      marked: typeof marked, turndown: typeof TurndownService,
      gfm: typeof turndownPluginGfm, purify: typeof DOMPurify, api: typeof window.api,
    };
    out.bootHtml = pv.innerHTML;

    // markdown -> HTML
    md.value = '# T\n\nSome **strong** text and a [link](https://x.dev)\n\n- one\n- two\n';
    edit(md);
    await sleep(250);
    out.htmlFromMarkdown = pv.innerHTML.trim();
    out.sourceAfterMdEdit = document.getElementById('status-source').textContent;
    out.counts = document.getElementById('status-counts').textContent;

    // edited HTML -> markdown
    pv.innerHTML = '<h2>Coming from HTML</h2><ul><li><em>one</em></li><li>two</li></ul>' +
      '<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>';
    edit(pv);
    await sleep(350);
    out.markdownFromHtml = md.value;
    out.sourceAfterHtmlEdit = document.getElementById('status-source').textContent;

    // pasting formatted content (rich text coming from another application)
    pv.innerHTML = '';
    pv.focus();
    const dt = new DataTransfer();
    dt.setData('text/html',
      '<p>Text <b>pasted</b> with <i>formatting</i></p>' +
      '<script>alert(1)<\/script><p style="color:red" onclick="x()">dirty</p>');
    dt.setData('text/plain', 'Text pasted with formatting');
    pv.dispatchEvent(new ClipboardEvent('paste',
      { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(350);
    out.markdownFromPaste = md.value;
    out.htmlAfterPaste = pv.innerHTML;

    // pasting plain text into the markdown pane
    md.focus();
    md.value = '';
    const dt2 = new DataTransfer();
    dt2.setData('text/plain', '## Pasted as text');
    md.dispatchEvent(new ClipboardEvent('paste',
      { clipboardData: dt2, bubbles: true, cancelable: true }));
    await sleep(250);
    out.markdownAfterTextPaste = md.value;
    out.htmlAfterTextPaste = pv.innerHTML.trim();

    // hostile markdown neither runs scripts nor keeps javascript: in links
    md.value = '<script>window.__pwned = true<\/script>\n\n[x](javascript:alert(1))\n';
    edit(md);
    await sleep(250);
    out.pwned = Boolean(window.__pwned);
    out.htmlFromEvilMarkdown = pv.innerHTML.trim();

    return out;
  })()`);

  check('libraries loaded', Object.values(r.libs).every((t) => t !== 'undefined'), r.libs);
  check('sample document rendered', /<h1/.test(r.bootHtml) && /<table/.test(r.bootHtml));
  check(
    'markdown -> HTML',
    /<h1>T<\/h1>/.test(r.htmlFromMarkdown) &&
      /<strong>strong<\/strong>/.test(r.htmlFromMarkdown) &&
      /<a href="https:\/\/x.dev">link<\/a>/.test(r.htmlFromMarkdown),
    r.htmlFromMarkdown
  );
  check('edit source = markdown', r.sourceAfterMdEdit === 'editing: markdown', r.sourceAfterMdEdit);
  check('counters updated', /words/.test(r.counts), r.counts);
  check(
    'HTML -> markdown (headings, lists, table)',
    r.markdownFromHtml.startsWith('## Coming from HTML') &&
      /^- \*one\*$/m.test(r.markdownFromHtml) &&
      /\| a \| b \|/.test(r.markdownFromHtml),
    r.markdownFromHtml
  );
  check(
    'edit source = HTML',
    r.sourceAfterHtmlEdit === 'editing: formatted HTML',
    r.sourceAfterHtmlEdit
  );
  check(
    'formatted paste becomes markdown',
    /Text \*\*pasted\*\* with \*formatting\*/.test(r.markdownFromPaste),
    r.markdownFromPaste
  );
  check(
    'formatted paste is sanitized',
    !/alert\(1\)|onclick|style=/.test(r.htmlAfterPaste) && /pasted/.test(r.htmlAfterPaste),
    r.htmlAfterPaste
  );
  check(
    'plain-text paste into the markdown pane',
    r.markdownAfterTextPaste === '## Pasted as text' && /<h2>/.test(r.htmlAfterTextPaste),
    { md: r.markdownAfterTextPaste, html: r.htmlAfterTextPaste }
  );
  check('script in markdown does not run', r.pwned === false);
  check(
    'script/javascript: stripped from the preview',
    !/<script|javascript:/i.test(r.htmlFromEvilMarkdown),
    r.htmlFromEvilMarkdown
  );
  check('renderer console free of errors', consoleLogs.length === 0, consoleLogs);

  // ---- context menu (right click) -----------------------------------------

  const ctx = (params, clip) => {
    const items = buildContextMenuTemplate(params, clip);
    const byRole = Object.fromEntries(items.filter((i) => i.role).map((i) => [i.role, i]));
    return { items, byRole };
  };
  const FLAGS_ON = {
    canUndo: true, canRedo: true, canCut: true, canCopy: true, canPaste: true, canSelectAll: true,
  };

  const noSelection = ctx(
    { isEditable: true, inputFieldType: 'plainText', selectionText: '', editFlags: FLAGS_ON },
    { hasText: true }
  );
  check(
    'no selection: cut/copy disabled, paste enabled',
    noSelection.byRole.cut.enabled === false &&
      noSelection.byRole.copy.enabled === false &&
      noSelection.byRole.paste.enabled === true &&
      noSelection.byRole.selectAll.enabled === true,
    noSelection.items
  );

  const withSelection = ctx(
    { isEditable: true, inputFieldType: 'plainText', selectionText: 'abc', editFlags: FLAGS_ON },
    { hasText: false, hasHtml: false }
  );
  check(
    'selection with empty clipboard: cut/copy enabled, paste disabled',
    withSelection.byRole.cut.enabled === true &&
      withSelection.byRole.copy.enabled === true &&
      withSelection.byRole.paste.enabled === false,
    withSelection.items
  );

  const notEditable = ctx(
    { isEditable: false, selectionText: 'abc', editFlags: { ...FLAGS_ON, canCut: false } },
    { hasText: true }
  );
  check(
    'outside an editable field: only copy/select all enabled',
    notEditable.byRole.copy.enabled === true &&
      notEditable.byRole.cut.enabled === false &&
      notEditable.byRole.paste.enabled === false &&
      notEditable.byRole.undo.enabled === false,
    notEditable.items
  );

  const rich = ctx(
    { isEditable: true, inputFieldType: 'none', selectionText: '', editFlags: FLAGS_ON },
    { hasText: true, hasHtml: true }
  );
  check(
    'HTML pane gets "paste as plain text"; the textarea does not',
    Boolean(rich.byRole.pasteAndMatchStyle) &&
      rich.byRole.pasteAndMatchStyle.enabled === true &&
      !noSelection.byRole.pasteAndMatchStyle,
    rich.items.map((i) => i.role || i.type)
  );

  check(
    'every item carries a label',
    noSelection.items.every((i) => i.type === 'separator' || typeof i.label === 'string'),
    noSelection.items
  );

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? '✓' : '✗'} ${c.name}`);
    if (!c.ok) console.log('   →', JSON.stringify(c.detail));
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);

  app.exit(failed.length ? 1 : 0);
});
