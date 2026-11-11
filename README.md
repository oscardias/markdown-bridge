# Markdown Bridge

[![CI](https://github.com/oscardias/markdown-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/oscardias/markdown-bridge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A side-by-side Markdown editor where the right pane is **formatted text, not tags**.

Most markdown ⇄ HTML tools convert to and from HTML *source* — you paste `<p>` and
`<strong>` in, you get `<p>` and `<strong>` out. But you rarely have the HTML. What you
have is the *content*: a paragraph from Word, an answer from an AI assistant, a chunk of
a web page. Markdown Bridge renders the right pane instead of printing it, so the
clipboard does the work in both directions — a plain copy and paste is the whole
workflow.

![Markdown Bridge, dark theme](assets/screenshot-dark.png)

## What it is good for

- **AI output → repo docs.** Copy a formatted answer out of a chat, paste it on the
  right, get clean markdown on the left, save as `.md`.
- **Word or Google Docs → wiki.** Select in the document, paste on the right. Headings,
  bold, lists, links and tables survive; the styling noise does not.
- **Web page → notes.** Select part of a page, paste, keep the structure.
- **Markdown → email.** Write on the left, press `Ctrl+Shift+H`, paste into Gmail,
  Outlook or Word with the formatting intact.

Both panes are editable and stay in sync in both directions. Scrolling is mirrored
proportionally (and can be turned off).

## Download

Grab the file for your system from the
[latest release](https://github.com/oscardias/markdown-bridge/releases/latest):

| System | File | Notes |
| --- | --- | --- |
| Windows 10/11 | `markdown-bridge-<version>-setup-x64.exe` | installer, adds a Start menu entry |
| Windows (no install) | `markdown-bridge-<version>-portable-x64.exe` | runs from anywhere, e.g. a USB stick |
| macOS, Apple Silicon (M1–M4) | `markdown-bridge-<version>-arm64.dmg` | |
| macOS, Intel | `markdown-bridge-<version>-x64.dmg` | |
| Linux, Debian/Ubuntu | `markdown-bridge-<version>-amd64.deb` | `sudo apt install ./markdown-bridge-*.deb` |
| Linux, any distro | `markdown-bridge-<version>-x86_64.AppImage` | `chmod +x` it, then run it |

### About the security warning on first launch

The installers are **not code-signed** yet — signing certificates cost money and this
is a free project. The app is the same either way, but your system cannot tell who
built it, so it warns you the first time. This is expected; here is how to get past it.

**Windows — "Windows protected your PC" (SmartScreen).** Click **More info**, then
**Run anyway**. Some browsers also flag the download as uncommon: choose **Keep**.

**macOS — "Markdown Bridge can't be opened" / "Apple could not verify…".** Drag the app
to *Applications*, try to open it once, then go to **System Settings → Privacy &
Security**, scroll down and click **Open Anyway**. On older macOS versions,
right-click (or Control-click) the app and choose **Open** instead.
If macOS says the app **"is damaged and can't be opened"**, that is the quarantine
flag on an unsigned download, not real damage. Clear it from Terminal:

```bash
xattr -dr com.apple.quarantine "/Applications/Markdown Bridge.app"
```

**Linux.** No warning. For the AppImage, mark it executable first
(`chmod +x markdown-bridge-*.AppImage`); on Ubuntu 22.04+ it may also need
`sudo apt install libfuse2`.

### Checking the download

Each release lists SHA-256 checksums (`SHA256SUMS-linux.txt`, `SHA256SUMS-win32.txt`,
`SHA256SUMS-darwin.txt`), produced by the same job that built the files. Compare them
with what you downloaded:

```bash
sha256sum -c SHA256SUMS-linux.txt --ignore-missing      # Linux
shasum -a 256 -c SHA256SUMS-darwin.txt --ignore-missing # macOS
```

```powershell
Get-FileHash .\markdown-bridge-*-setup-x64.exe -Algorithm SHA256   # Windows
```

### Updates

The app checks GitHub for a newer release once a day at startup. When there is one, it
offers to open the download page — download the new file and install it over the
current version; your settings and draft are kept. You can also check any time with
**Help → Check for updates…**, or turn the automatic check off in the same menu.

The check is a single anonymous request to the GitHub API
(`api.github.com/repos/oscardias/markdown-bridge/releases/latest`); nothing about you or
your documents is sent. Updates are not installed automatically: unsigned apps cannot
replace themselves safely on macOS, so the app only tells you and lets you decide.

## Run from source

Requires Node.js 20 or newer.

```bash
git clone https://github.com/oscardias/markdown-bridge.git
cd markdown-bridge
npm install
npm start
```

On Wayland sessions where Electron crashes on startup:

```bash
npm run start:x11    # electron --ozone-platform=x11 --disable-gpu .
```

When running from source the update check only runs from the Help menu.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` / `Ctrl+O` | new / open markdown |
| `Ctrl+S` / `Ctrl+Shift+S` | save / save as |
| `Ctrl+E` | export HTML (standalone, styled document) |
| `Ctrl+Shift+C` | copy markdown |
| `Ctrl+Shift+H` | copy **formatted** HTML (pastes with formatting into Word/Gmail) |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+K` | bold / italic / link (markdown pane) |
| `Ctrl+D` | toggle light/dark theme |
| `Ctrl+L` | toggle synced scrolling |

Drag the middle divider to resize the panes; double-click resets it to 50/50.

Right-clicking either pane opens an editing menu — undo/redo, cut, copy, paste, select
all, plus the app's copy actions. Items are enabled to match the click context: cut needs
a selection *and* an editable field, copy only needs a selection, paste needs an editable
field *and* something on the clipboard, and "paste as plain text" only appears in the
HTML pane. Pasting through the menu goes through the same handling as the keyboard:
plain text in the markdown pane, sanitized HTML in the formatted one.

## How the sync works

Only one pane dictates the content at a time — whichever received the user's last edit:

- editing **markdown** → `marked` produces the HTML → sanitized by `DOMPurify` → preview;
- editing or pasting into **HTML** → `turndown` (+ GFM plugin) produces the markdown.

Because programmatic updates (`value` / `innerHTML`) do not fire an `input` event, there
is no feedback loop between the panes and no "I am updating" flag to keep in sync — and
the caret in the pane being edited is never moved by an update from the other side.

The markdown being edited is kept in `localStorage` as a draft and restored on launch.

## Project layout

| File | Role |
| --- | --- |
| [main.js](main.js) | main process: window, menus, file dialogs, IPC |
| [src/preload.js](src/preload.js) | the `window.api` bridge (contextIsolation on, no Node in the renderer) |
| [src/context-menu.js](src/context-menu.js) | right-click menu template (pure function, tested) |
| [src/update-check.js](src/update-check.js) | version comparison and release parsing for the update check (pure, tested) |
| [src/index.html](src/index.html) | pane layout and library loading |
| [src/renderer.js](src/renderer.js) | conversion, sync, paste, copy, theme, divider |
| [src/styles.css](src/styles.css) | light/dark themes and preview typography |
| [scripts/screenshot.js](scripts/screenshot.js) | regenerates the README screenshots from the real app |
| [scripts/icon.js](scripts/icon.js) | renders `build/icon.png` from an inline SVG |
| [scripts/checksums.js](scripts/checksums.js) | writes `dist/SHA256SUMS-<platform>.txt` for the release |
| [test/smoke.js](test/smoke.js) | end-to-end smoke test |

No build step, no framework, no bundler — the renderer loads `marked`, `turndown`,
`turndown-plugin-gfm` and `dompurify` as UMD files straight from `node_modules`.

## Tests

```bash
npm test          # or: npm run test:x11
```

The test opens the real window hidden and checks markdown → HTML, HTML → markdown,
formatted paste, plain-text paste, hostile-content sanitization, the context-menu
rules and the update-check version logic.

## Building

```bash
npm run dist          # every target for the current platform
npm run dist:linux    # AppImage + deb
npm run screenshot    # regenerate assets/screenshot-*.png
npm run icon          # regenerate build/icon.png
```

Artifacts land in `dist/`.

### Releasing

1. Bump `version` in `package.json`, commit, then tag and push: `git tag v1.1.0 && git push --tags`.
2. [The release workflow](.github/workflows/release.yml) builds every platform, adds
   the checksum files and creates a **draft** release.
3. Review the draft on GitHub, write the notes (they appear in the in-app update
   dialog) and click **Publish release**. Drafts are invisible to users and to the
   update check.

## Security

`nodeIntegration` off, `contextIsolation` on, a restrictive CSP, and every piece of HTML
— rendered or pasted — goes through `DOMPurify` before it reaches the preview: `script`,
`style`, `on*` handlers and `javascript:` URLs are stripped. External links open in the
default browser, never inside the app. See [SECURITY.md](SECURITY.md).

## Contributing

Bug reports and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Oscar Dias
