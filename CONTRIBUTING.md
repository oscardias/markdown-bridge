# Contributing

Thanks for taking a look. Issues and pull requests are both welcome.

## Getting set up

```bash
npm install
npm start
npm test
```

Two environment quirks worth knowing before you file a bug about them:

- **Wayland.** On some Wayland sessions Electron crashes with `SIGSEGV` on startup. Use
  the x11 variants: `npm run start:x11`, `npm run test:x11`.
- **VS Code integrated terminal.** The extension host exports `ELECTRON_RUN_AS_NODE=1`,
  which makes `require('electron')` return a path string instead of the API, so the test
  fails with `Cannot read properties of undefined (reading 'whenReady')`. Run
  `env -u ELECTRON_RUN_AS_NODE npm test`, or use a normal terminal.

## Code style

There is no build step, no framework and no bundler, and the goal is to keep it that way
— the renderer loads its four dependencies as UMD files from `node_modules`. Plain
CommonJS in the main process, plain ES2022 in the renderer.

Comments explain **why**, not what. If a piece of code looks odd but is deliberate (the
`input`-event trick that prevents a sync feedback loop, the custom turndown list rule),
the comment should say what would break without it.

## Before opening a pull request

- `npm test` passes — all checks, not just the ones near your change.
- If you touched the UI, run `npm run screenshot` and commit the regenerated
  `assets/*.png`.
- New behaviour in the conversion, paste or context-menu paths gets a check added to
  [test/smoke.js](test/smoke.js). It is a single file and easy to extend.
- Anything that accepts external content (paste handlers, the preview, exported HTML)
  must keep going through `DOMPurify`. See [SECURITY.md](SECURITY.md).

## Reporting a bug

Include your OS and desktop session (X11 or Wayland), the Node and app versions, and —
when the bug is about conversion — the exact input that reproduces it. For paste bugs,
say which application you copied from; clipboard `text/html` differs wildly between Word,
Google Docs, browsers and chat apps, and that detail is usually the whole story.
