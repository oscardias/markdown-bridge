'use strict';

const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { buildContextMenuTemplate } = require('./src/context-menu');

/** Path of the markdown file open in the window (null = new document). */
let currentPath = null;
/** @type {BrowserWindow | null} */
let win = null;
/** The renderer tells us when the markdown differs from what is on disk. */
let isDirty = false;
/** Keeps us out of the confirmation dialog once the user has already decided. */
let allowClose = false;

const MD_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] },
  { name: 'All files', extensions: ['*'] },
];

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: '#1b1e24',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('close', onClose);
  win.on('closed', () => {
    win = null;
  });

  // External links open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('context-menu', showContextMenu);

  updateTitle(false);
}

/** Right-click context menu, with editing items enabled to match the click context. */
function showContextMenu(event, params) {
  const formats = clipboard.availableFormats();
  const template = buildContextMenuTemplate(params, {
    hasText: formats.some((f) => f.startsWith('text/plain')),
    hasHtml: formats.some((f) => f.startsWith('text/html')),
  });

  template.push(
    { type: 'separator' },
    { label: 'Copy markdown', accelerator: 'CmdOrCtrl+Shift+C', click: () => send('menu:copy-markdown') },
    { label: 'Copy formatted HTML', accelerator: 'CmdOrCtrl+Shift+H', click: () => send('menu:copy-rich') },
    { label: 'Copy HTML source', click: () => send('menu:copy-html-source') }
  );

  Menu.buildFromTemplate(template).popup({ window: win ?? undefined });
}

/** Closing with pending edits offers save, discard or cancel. */
async function onClose(event) {
  if (allowClose || !isDirty || !win) return;
  event.preventDefault();

  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Save', 'Discard', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    message: 'You have unsaved changes.',
    detail: 'Save before closing?',
  });

  if (response === 2) return;
  if (response === 0) {
    const markdown = await win.webContents.executeJavaScript(
      'document.getElementById("markdown").value'
    );
    const result = await saveMarkdown(markdown);
    if (!result.saved) return; // user cancelled the save dialog
  }

  allowClose = true;
  win.close();
}

function updateTitle(dirty) {
  if (!win) return;
  isDirty = Boolean(dirty);
  const name = currentPath ? path.basename(currentPath) : 'Untitled';
  win.setTitle(`${dirty ? '• ' : ''}${name} — Markdown Bridge`);
  win.setDocumentEdited?.(dirty);
  if (currentPath) win.setRepresentedFilename?.(currentPath);
}

function send(channel, payload) {
  win?.webContents.send(channel, payload);
}

async function openPath(filePath) {
  const markdown = await fs.readFile(filePath, 'utf8');
  currentPath = filePath;
  updateTitle(false);
  send('doc:loaded', { markdown, path: filePath });
}

async function openFile() {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Open markdown',
    properties: ['openFile'],
    filters: MD_FILTERS,
  });
  if (canceled || !filePaths.length) return;
  await openPath(filePaths[0]);
}

async function saveMarkdown(markdown, { saveAs = false } = {}) {
  let target = currentPath;
  if (saveAs || !target) {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Save markdown',
      defaultPath: target || 'document.md',
      filters: MD_FILTERS,
    });
    if (canceled || !filePath) return { saved: false };
    target = filePath;
  }
  await fs.writeFile(target, markdown, 'utf8');
  currentPath = target;
  updateTitle(false);
  return { saved: true, path: target };
}

async function exportHtml(html) {
  const defaultName = currentPath
    ? path.basename(currentPath).replace(/\.[^.]+$/, '') + '.html'
    : 'document.html';
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export HTML',
    defaultPath: path.join(currentPath ? path.dirname(currentPath) : app.getPath('documents'), defaultName),
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
  });
  if (canceled || !filePath) return { saved: false };
  await fs.writeFile(filePath, html, 'utf8');
  return { saved: true, path: filePath };
}

function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => send('menu:new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send('menu:open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('menu:save') },
        { label: 'Save as…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('menu:save-as') },
        { label: 'Export HTML…', accelerator: 'CmdOrCtrl+E', click: () => send('menu:export-html') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'pasteAndMatchStyle', label: 'Paste as plain text' },
        { role: 'selectAll', label: 'Select all' },
        { type: 'separator' },
        {
          label: 'Copy markdown',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => send('menu:copy-markdown'),
        },
        {
          label: 'Copy formatted HTML',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => send('menu:copy-rich'),
        },
        {
          label: 'Copy HTML source',
          click: () => send('menu:copy-html-source'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle theme', accelerator: 'CmdOrCtrl+D', click: () => send('menu:toggle-theme') },
        {
          label: 'Synced scrolling',
          accelerator: 'CmdOrCtrl+L',
          click: () => send('menu:toggle-scroll-sync'),
        },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Actual size' },
        { role: 'zoomIn', label: 'Zoom in' },
        { role: 'zoomOut', label: 'Zoom out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Full screen' },
        { role: 'toggleDevTools', label: 'Developer tools' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- IPC ------------------------------------------------------------------

ipcMain.handle('doc:open', () => openFile());
ipcMain.handle('doc:save', (_e, markdown, options) => saveMarkdown(markdown, options));
ipcMain.handle('doc:export-html', (_e, html) => exportHtml(html));
ipcMain.handle('doc:new', () => {
  currentPath = null;
  updateTitle(false);
});
ipcMain.on('doc:dirty', (_e, dirty) => updateTitle(Boolean(dirty)));

// ---- lifecycle ------------------------------------------------------------

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
