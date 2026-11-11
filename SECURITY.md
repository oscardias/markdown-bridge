# Security Policy

Markdown Bridge exists to accept content from arbitrary sources — web pages, email,
Word documents, AI assistants — so pasted input is treated as hostile by default.

## Threat model

The app is a local desktop editor. It has no accounts and stores nothing but a local
draft in `localStorage` and a small `settings.json` in the user data folder. Its only
network request is the update check: an anonymous `GET` to
`https://api.github.com/repos/oscardias/markdown-bridge/releases/latest`, made from the
main process (never the renderer), at most once a day in packaged builds, and possible
to turn off under **Help**. Nothing about the user or their documents is sent, and the
response is only used to compare version numbers; the download link it carries is opened
in the browser only if it points back at this repository's releases. The realistic risk is **content
injection**: a crafted `text/html` payload on the clipboard, or markdown with embedded
HTML, executing script inside the renderer.

Mitigations in place:

- `nodeIntegration: false` and `contextIsolation: true` — the renderer has no Node
  access; it talks to the main process only through the narrow `window.api` bridge in
  [src/preload.js](src/preload.js), which whitelists the channels it will forward.
- A restrictive CSP in [src/index.html](src/index.html): `default-src 'none'`,
  `script-src 'self'` — no remote code, no `eval`.
- Every path into the preview goes through `DOMPurify`: markdown rendered by `marked`,
  HTML pasted from the clipboard, and HTML typed directly. `script`, `style`, `iframe`,
  `object`, `embed`, `form`, `on*` handlers, inline `style` attributes and `javascript:`
  URLs are removed.
- External links are opened with `shell.openExternal` in the default browser and never
  navigated to inside the window.

The smoke test covers this directly: pasting `<script>alert(1)</script>` and rendering
markdown containing `[x](javascript:alert(1))` must leave the preview clean and the
renderer un-executed.

## Known limitations

- Released binaries are **not code-signed or notarized**. SHA-256 checksums are
  published with each release instead (see the README's *Checking the download*).
  Updates are never installed automatically — the app only links to the release page.
- Exported HTML (`Ctrl+E`) is sanitized, but it is still a document you may republish
  elsewhere — review it before publishing content that came from an untrusted source.

## Reporting a vulnerability

Please report security issues privately through
[GitHub Security Advisories](https://github.com/oscardias/markdown-bridge/security/advisories/new)
rather than a public issue. Include a reproduction — for injection bugs, the exact
clipboard payload or markdown input. Expect a first response within a few days.
