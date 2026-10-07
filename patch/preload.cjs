
;(() => {
  try {
    const { contextBridge, ipcRenderer } = require('electron');
    const api = { blameLine: (request) => ipcRenderer.invoke('orca-git-blame:line', request) };
    if (process.contextIsolated) contextBridge.exposeInMainWorld('orcaGitBlame', api);
    else window.orcaGitBlame = api;
  } catch (error) {
    console.error('[orca-git-blame] preload failed:', error);
  }
})();
