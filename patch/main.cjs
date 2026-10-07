'use strict';
const path = require('node:path');

try {
  const { ipcMain } = require('electron');
  const { blameLine } = require('./orca-git-blame-blame.cjs');
  // why: um git blame por editor por vez; o pedido novo aborta o anterior, cujo resultado a janela descartaria de qualquer jeito.
  const inflight = new Map();
  ipcMain.handle('orca-git-blame:line', async (event, request) => {
    const key = `${event.sender.id}:${request?.editorId ?? ''}`;
    inflight.get(key)?.abort();
    const controller = new AbortController();
    inflight.set(key, controller);
    try {
      return await blameLine(request ?? {}, { signal: controller.signal });
    } finally {
      if (inflight.get(key) === controller) inflight.delete(key);
    }
  });
} catch (error) {
  // why: falha no blame nunca pode impedir o Orca de abrir; o original é carregado de qualquer jeito.
  console.error('[orca-git-blame] failed to register IPC handler:', error);
}

// invariant: o placeholder abaixo é substituído pelo instalador pelo "main" original do package.json do Orca.
require(path.join(__dirname, '..', '..', '__ORIGINAL_MAIN__'));
