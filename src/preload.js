'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** Channels the main process is allowed to push to the renderer. */
const MENU_CHANNELS = [
  'menu:new',
  'menu:open',
  'menu:save',
  'menu:save-as',
  'menu:export-html',
  'menu:copy-markdown',
  'menu:copy-rich',
  'menu:copy-html-source',
  'menu:toggle-theme',
  'menu:toggle-scroll-sync',
  'doc:loaded',
];

contextBridge.exposeInMainWorld('api', {
  newDoc: () => ipcRenderer.invoke('doc:new'),
  open: () => ipcRenderer.invoke('doc:open'),
  save: (markdown, options) => ipcRenderer.invoke('doc:save', markdown, options),
  exportHtml: (html) => ipcRenderer.invoke('doc:export-html', html),
  setDirty: (dirty) => ipcRenderer.send('doc:dirty', dirty),

  /** Subscribes to events coming from the menu / main process. */
  on: (channel, listener) => {
    if (!MENU_CHANNELS.includes(channel)) return () => {};
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});
