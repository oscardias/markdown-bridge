'use strict';

/* global marked, TurndownService, turndownPluginGfm, DOMPurify */

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

const mdEl = $('markdown');
const previewEl = $('preview');
const paneMd = $('pane-md');
const paneHtml = $('pane-html');
const panes = $('panes');
const gutter = $('gutter');
const statusSource = $('status-source');
const statusCounts = $('status-counts');
const statusMsg = $('status-msg');
const chkSync = $('chk-sync');

// ---------------------------------------------------------------------------
// Converters
// ---------------------------------------------------------------------------

marked.setOptions({ gfm: true, breaks: false });

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
  blankReplacement: (content, node) => (node.isBlock ? '\n\n' : ''),
});
turndown.use(turndownPluginGfm.gfm);

// Purely visual elements that would only pollute the markdown.
turndown.remove(['style', 'script', 'meta', 'link']);

// Explicit line break coming from rich editors.
turndown.addRule('lineBreak', {
  filter: 'br',
  replacement: () => '  \n',
});

// Turndown indents lists with 3–4 spaces by default; here we use the lean style
// ("- item" / "1. item") with a 2-space indent on nested levels.
turndown.addRule('tightListItem', {
  filter: 'li',
  replacement: (content, node, options) => {
    const body = content
      .replace(/^\n+/, '')
      .replace(/\n+$/, '\n')
      .replace(/\n/g, '\n  ');

    const parent = node.parentNode;
    let prefix = `${options.bulletListMarker} `;
    if (parent.nodeName === 'OL') {
      const start = Number(parent.getAttribute('start'));
      const index = Array.prototype.indexOf.call(parent.children, node);
      prefix = `${(Number.isFinite(start) && start ? start : 1) + index}. `;
    }

    return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '');
  },
});

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
  FORBID_ATTR: ['style', 'srcset'],
  ALLOW_DATA_ATTR: false,
};

// GFM task-list checkboxes survive sanitization, but read-only.
const PURIFY_CONFIG_PREVIEW = {
  ...PURIFY_CONFIG,
  FORBID_TAGS: PURIFY_CONFIG.FORBID_TAGS.filter((t) => t !== 'input'),
};

const toHtml = (markdown) =>
  DOMPurify.sanitize(marked.parse(markdown ?? ''), PURIFY_CONFIG_PREVIEW);

const toMarkdown = (html) => turndown.turndown(DOMPurify.sanitize(html ?? '', PURIFY_CONFIG)).trim();

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const DRAFT_KEY = 'markdown-bridge:draft';
const THEME_KEY = 'markdown-bridge:theme';
const SPLIT_KEY = 'markdown-bridge:split';
const SYNC_KEY = 'markdown-bridge:scroll-sync';

/** The pane currently dictating the content: 'md' | 'html'. */
let source = 'md';
/** Markdown as of the last save/open, used to flag the document as dirty. */
let savedMarkdown = '';
let scrollSync = true;
let syncingScroll = false;

const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

function setSource(next) {
  if (source === next) return;
  source = next;
  paneMd.classList.toggle('active', next === 'md');
  paneHtml.classList.toggle('active', next === 'html');
  statusSource.textContent = next === 'md' ? 'editing: markdown' : 'editing: formatted HTML';
}

function updateCounts() {
  const text = mdEl.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text ? text.split('\n').length : 0;
  statusCounts.textContent = `${words} words · ${text.length} characters · ${lines} lines`;
}

function markDirty() {
  const dirty = mdEl.value !== savedMarkdown;
  window.api?.setDirty(dirty);
  try {
    localStorage.setItem(DRAFT_KEY, mdEl.value);
  } catch {
    /* the draft is optional */
  }
}

let msgTimer;
function flash(text) {
  statusMsg.textContent = text;
  statusMsg.classList.add('show');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => statusMsg.classList.remove('show'), 1800);
}

// ---------------------------------------------------------------------------
// Content sync
// ---------------------------------------------------------------------------

/** Markdown → HTML. Only rewrites the preview when it is not the edit source. */
function renderPreview() {
  previewEl.innerHTML = toHtml(mdEl.value);
}

/** HTML → Markdown. The textarea is not focused in this flow, so recreating its value is safe. */
function renderMarkdown() {
  mdEl.value = toMarkdown(previewEl.innerHTML);
  updateCounts();
}

const fromMarkdown = debounce(() => {
  if (source !== 'md') return;
  renderPreview();
  markDirty();
}, 120);

const fromHtml = debounce(() => {
  if (source !== 'html') return;
  renderMarkdown();
  markDirty();
}, 180);

// An `input` event can only come from a user edit — programmatic updates
// (innerHTML / value) fire nothing. So whoever receives input becomes the source.
mdEl.addEventListener('input', () => {
  setSource('md');
  updateCounts();
  fromMarkdown();
});

previewEl.addEventListener('input', () => {
  setSource('html');
  fromHtml();
});

mdEl.addEventListener('focus', () => setSource('md'));
previewEl.addEventListener('focus', () => setSource('html'));

/** Loads a whole document (opened file, new file, draft). */
function loadDocument(markdown, { saved = true } = {}) {
  mdEl.value = markdown;
  savedMarkdown = saved ? markdown : savedMarkdown;
  setSource('md');
  renderPreview();
  updateCounts();
  markDirty();
}

// ---------------------------------------------------------------------------
// Pasting
// ---------------------------------------------------------------------------

/**
 * Pasting into the HTML pane preserves formatting: we take the clipboard's
 * text/html, sanitize it and insert it. With no HTML available, fall back to text.
 */
previewEl.addEventListener('paste', (event) => {
  const data = event.clipboardData;
  if (!data) return;

  const html = data.getData('text/html');
  const text = data.getData('text/plain');
  if (!html && !text) return;

  event.preventDefault();
  setSource('html');

  if (html) {
    const clean = DOMPurify.sanitize(html, PURIFY_CONFIG_PREVIEW);
    if (!document.execCommand('insertHTML', false, clean)) insertHtmlAtCaret(clean);
  } else {
    document.execCommand('insertText', false, text);
  }

  renderMarkdown();
  markDirty();
});

/** Fallback for when execCommand is unavailable. */
function insertHtmlAtCaret(html) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) {
    previewEl.insertAdjacentHTML('beforeend', html);
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const fragment = range.createContextualFragment(html);
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) {
    range.setStartAfter(last);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/** In the markdown pane, pasting is always plain text — even from a rich source. */
mdEl.addEventListener('paste', (event) => {
  const text = event.clipboardData?.getData('text/plain');
  if (text == null) return;
  event.preventDefault();
  setSource('md');
  const start = mdEl.selectionStart;
  const end = mdEl.selectionEnd;
  mdEl.setRangeText(text, start, end, 'end');
  updateCounts();
  renderPreview();
  markDirty();
});

// ---------------------------------------------------------------------------
// Editing shortcuts in the textarea
// ---------------------------------------------------------------------------

function wrapSelection(before, after = before) {
  const { selectionStart: start, selectionEnd: end, value } = mdEl;
  const selected = value.slice(start, end);
  mdEl.setRangeText(before + selected + after, start, end, 'select');
  if (start === end) {
    const caret = start + before.length;
    mdEl.setSelectionRange(caret, caret);
  }
  updateCounts();
  renderPreview();
  markDirty();
}

mdEl.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    event.preventDefault();
    mdEl.setRangeText('  ', mdEl.selectionStart, mdEl.selectionEnd, 'end');
    renderPreview();
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'b') {
    event.preventDefault();
    wrapSelection('**');
  } else if (key === 'i') {
    event.preventDefault();
    wrapSelection('*');
  } else if (key === 'k') {
    event.preventDefault();
    wrapSelection('[', '](url)');
  }
});

// ---------------------------------------------------------------------------
// Synced scrolling
// ---------------------------------------------------------------------------

function mirrorScroll(from, to) {
  if (!scrollSync || syncingScroll) return;
  const fromMax = from.scrollHeight - from.clientHeight;
  const toMax = to.scrollHeight - to.clientHeight;
  if (fromMax <= 0 || toMax <= 0) return;
  syncingScroll = true;
  to.scrollTop = (from.scrollTop / fromMax) * toMax;
  requestAnimationFrame(() => {
    syncingScroll = false;
  });
}

mdEl.addEventListener('scroll', () => mirrorScroll(mdEl, previewEl));
previewEl.addEventListener('scroll', () => mirrorScroll(previewEl, mdEl));

chkSync.addEventListener('change', () => {
  scrollSync = chkSync.checked;
  localStorage.setItem(SYNC_KEY, String(scrollSync));
});

// ---------------------------------------------------------------------------
// Draggable divider
// ---------------------------------------------------------------------------

function setSplit(ratio) {
  const clamped = Math.min(0.85, Math.max(0.15, ratio));
  panes.style.gridTemplateColumns = `${clamped}fr 6px ${1 - clamped}fr`;
  localStorage.setItem(SPLIT_KEY, String(clamped));
}

gutter.addEventListener('mousedown', (event) => {
  event.preventDefault();
  document.body.classList.add('dragging');

  const onMove = (e) => {
    const rect = panes.getBoundingClientRect();
    setSplit((e.clientX - rect.left) / rect.width);
  };
  const onUp = () => {
    document.body.classList.remove('dragging');
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
});

gutter.addEventListener('dblclick', () => setSplit(0.5));

gutter.addEventListener('keydown', (event) => {
  const current = parseFloat(localStorage.getItem(SPLIT_KEY) || '0.5');
  if (event.key === 'ArrowLeft') setSplit(current - 0.02);
  else if (event.key === 'ArrowRight') setSplit(current + 0.02);
});

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
}

// ---------------------------------------------------------------------------
// Copying / files
// ---------------------------------------------------------------------------

async function copyMarkdown() {
  await navigator.clipboard.writeText(mdEl.value);
  flash('Markdown copied');
}

async function copyHtmlSource() {
  await navigator.clipboard.writeText(previewEl.innerHTML);
  flash('HTML source copied');
}

/** Copies as rich text: pasting into Word, Gmail or Docs keeps the formatting. */
async function copyRich() {
  const html = previewEl.innerHTML;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([previewEl.innerText], { type: 'text/plain' }),
      }),
    ]);
    flash('Formatted HTML copied');
  } catch {
    // Some environments block ClipboardItem: fall back to selection + execCommand.
    const selection = window.getSelection();
    const previous = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const range = document.createRange();
    range.selectNodeContents(previewEl);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('copy');
    selection.removeAllRanges();
    if (previous) selection.addRange(previous);
    flash('Formatted HTML copied');
  }
}

function standaloneHtml() {
  const css = `
    body { max-width: 820px; margin: 40px auto; padding: 0 20px;
      font: 16px/1.65 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c2128; }
    h1, h2 { border-bottom: 1px solid #d9dee6; padding-bottom: .25em; }
    code { background: #f0f2f6; border-radius: 4px; padding: .12em .35em;
      font: .88em ui-monospace, Menlo, Consolas, monospace; }
    pre { background: #f0f2f6; border-radius: 6px; padding: 12px 14px; overflow: auto; }
    pre code { background: none; padding: 0; }
    blockquote { margin: 0 0 1em; padding: .2em 1em; border-left: 3px solid #d9dee6; color: #5f6b7a; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #d9dee6; padding: 6px 10px; text-align: left; }
    img { max-width: 100%; }`;

  // The exported file's title is the document's first heading, when there is one.
  const heading = previewEl.querySelector('h1, h2, h3')?.textContent?.trim();
  const title = (heading || 'Document').replace(/[<>&]/g, '');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${css}
</style>
</head>
<body>
${previewEl.innerHTML}
</body>
</html>
`;
}

async function save(saveAs = false) {
  const result = await window.api.save(mdEl.value, { saveAs });
  if (result?.saved) {
    savedMarkdown = mdEl.value;
    markDirty();
    flash('Saved');
  }
}

async function exportHtml() {
  const result = await window.api.exportHtml(standaloneHtml());
  if (result?.saved) flash('HTML exported');
}

/** Confirms before throwing away unsaved edits. */
function confirmDiscard() {
  if (mdEl.value === savedMarkdown) return true;
  return window.confirm('You have unsaved changes. Discard them?');
}

function newDocument() {
  if (!confirmDiscard()) return;
  window.api.newDoc();
  loadDocument('');
  mdEl.focus();
}

function openDocument() {
  if (!confirmDiscard()) return;
  window.api.open();
}

// ---------------------------------------------------------------------------
// Buttons and menu
// ---------------------------------------------------------------------------

$('btn-open').addEventListener('click', openDocument);
$('btn-save').addEventListener('click', () => save(false));
$('btn-export').addEventListener('click', exportHtml);
$('btn-copy-md').addEventListener('click', copyMarkdown);
$('btn-copy-rich').addEventListener('click', copyRich);
$('btn-copy-html').addEventListener('click', copyHtmlSource);
$('btn-theme').addEventListener('click', toggleTheme);

// `api` already exists on window (contextBridge), so we use another name here.
const bridge = window.api;
bridge.on('doc:loaded', ({ markdown }) => loadDocument(markdown));
bridge.on('menu:new', newDocument);
bridge.on('menu:open', openDocument);
bridge.on('menu:save', () => save(false));
bridge.on('menu:save-as', () => save(true));
bridge.on('menu:export-html', exportHtml);
bridge.on('menu:copy-markdown', copyMarkdown);
bridge.on('menu:copy-rich', copyRich);
bridge.on('menu:copy-html-source', copyHtmlSource);
bridge.on('menu:toggle-theme', toggleTheme);
bridge.on('menu:toggle-scroll-sync', () => {
  chkSync.checked = !chkSync.checked;
  chkSync.dispatchEvent(new Event('change'));
  flash(chkSync.checked ? 'Scrolling synced' : 'Scrolling independent');
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const SAMPLE = `# Markdown Bridge

Write **markdown** on the left and read the formatted document on the right.
The right pane is not a box full of tags — it is the rendered text, so a plain
copy and paste works in both directions:

- paste an **AI answer**, a **Word** selection or a chunk of a **web page** on
  the right, and it lands here as markdown;
- press \`Ctrl+Shift+H\` to copy the formatted version, then paste it into
  Gmail, Word or Google Docs with the formatting intact.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| \`Ctrl+O\` / \`Ctrl+S\` | open / save markdown |
| \`Ctrl+E\` | export HTML |
| \`Ctrl+Shift+H\` | copy formatted |
| \`Ctrl+B\` / \`Ctrl+I\` | bold / italic |

> Drag the middle divider to resize the panes.

\`\`\`js
console.log('enjoy');
\`\`\`
`;

(function boot() {
  setTheme(localStorage.getItem(THEME_KEY) || 'dark');

  const savedSplit = parseFloat(localStorage.getItem(SPLIT_KEY));
  if (Number.isFinite(savedSplit)) setSplit(savedSplit);

  scrollSync = localStorage.getItem(SYNC_KEY) !== 'false';
  chkSync.checked = scrollSync;

  const draft = localStorage.getItem(DRAFT_KEY);
  loadDocument(draft && draft.trim() ? draft : SAMPLE, { saved: false });
  savedMarkdown = mdEl.value;
  markDirty();

  setSource('html');
  setSource('md');
  mdEl.focus();
})();
