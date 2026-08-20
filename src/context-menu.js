'use strict';

/**
 * Builds the right-click editing context menu.
 *
 * It is a pure function — it takes the `params` from Electron's `context-menu`
 * event plus the clipboard state and returns a menu template. Every item comes
 * back with `enabled` already resolved: cut/copy only light up with a selection,
 * paste only in an editable field that has something to paste.
 *
 * @param {Electron.ContextMenuParams} params
 * @param {{ hasText?: boolean, hasHtml?: boolean }} [clipboardState]
 * @returns {Electron.MenuItemConstructorOptions[]}
 */
function buildContextMenuTemplate(params = {}, clipboardState = {}) {
  const flags = params.editFlags || {};
  const editable = Boolean(params.isEditable);
  const hasSelection = Boolean(params.selectionText && params.selectionText.trim());
  const hasClipboard = Boolean(clipboardState.hasText || clipboardState.hasHtml);

  // `inputFieldType === 'plainText'` means a textarea/input; the HTML pane is a
  // contenteditable, where "paste as plain text" is worth offering separately.
  const richField = editable && params.inputFieldType !== 'plainText';

  const template = [
    { role: 'undo', label: 'Undo', enabled: editable && flags.canUndo !== false },
    { role: 'redo', label: 'Redo', enabled: editable && flags.canRedo !== false },
    { type: 'separator' },
    { role: 'cut', label: 'Cut', enabled: editable && hasSelection && flags.canCut !== false },
    { role: 'copy', label: 'Copy', enabled: hasSelection && flags.canCopy !== false },
    { role: 'paste', label: 'Paste', enabled: editable && hasClipboard && flags.canPaste !== false },
  ];

  if (richField) {
    template.push({
      role: 'pasteAndMatchStyle',
      label: 'Paste as plain text',
      enabled: Boolean(clipboardState.hasText) && flags.canPaste !== false,
    });
  }

  template.push(
    { type: 'separator' },
    { role: 'selectAll', label: 'Select all', enabled: flags.canSelectAll !== false }
  );

  return template;
}

module.exports = { buildContextMenuTemplate };
