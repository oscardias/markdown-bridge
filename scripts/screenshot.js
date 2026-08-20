// Generates the README screenshots from the real app, so they cannot silently
// drift from the UI:
//
//   npm run screenshot        (or: npm run screenshot:x11 on Wayland)
//
// Writes assets/screenshot-dark.png and assets/screenshot-light.png.

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets');
const SIZE = { width: 1280, height: 800 };

// The document shown in the screenshots. Kept here rather than reusing the
// app's built-in sample so marketing copy and first-run copy can differ.
const DOC = `# Markdown Bridge

Paste a **Word** selection, an **AI answer** or a chunk of a **web page** into
the right pane — it lands on the left as clean markdown.

## Why the right pane matters

Most converters hand you a box full of \`<p>\` and \`<strong>\`. This one shows
the *rendered document*, so the clipboard does the work:

1. paste formatted content on the right → markdown on the left;
2. press \`Ctrl+Shift+H\` → paste into Gmail or Word, formatting intact.

| Shortcut | Action |
| --- | --- |
| \`Ctrl+E\` | export a standalone HTML file |
| \`Ctrl+Shift+C\` | copy the markdown |
| \`Ctrl+Shift+H\` | copy as formatted text |

> Both panes are editable, and only the one you typed in last dictates the
> content — so there is no feedback loop between them.

\`\`\`js
const markdown = turndown.turndown(DOMPurify.sanitize(pastedHtml));
\`\`\`
`;

app.whenReady().then(async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const win = new BrowserWindow({
    ...SIZE,
    show: false,
    useContentSize: true,
    webPreferences: {
      preload: path.join(ROOT, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // In-memory partition: no leftover draft, theme or split from real use.
      partition: 'screenshot',
    },
  });

  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await new Promise((r) => setTimeout(r, 800));

  for (const theme of ['dark', 'light']) {
    await win.webContents.executeJavaScript(`(() => {
      document.documentElement.dataset.theme = ${JSON.stringify(theme)};
      const md = document.getElementById('markdown');
      md.value = ${JSON.stringify(DOC)};
      md.dispatchEvent(new Event('input', { bubbles: true }));
      md.blur();
    })()`);
    await new Promise((r) => setTimeout(r, 600));

    const image = await win.webContents.capturePage();
    const png = image.toPNG();
    const file = path.join(OUT_DIR, `screenshot-${theme}.png`);
    await fs.writeFile(file, png);

    // A blank capture still produces a valid — but tiny — PNG, so fail loudly.
    if (png.length < 20_000) {
      console.error(`✗ ${path.relative(ROOT, file)} looks blank (${png.length} bytes)`);
      app.exit(1);
      return;
    }
    console.log(`✓ ${path.relative(ROOT, file)} (${Math.round(png.length / 1024)} KB)`);
  }

  app.exit(0);
});
