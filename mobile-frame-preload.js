const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('privooMobileFrame', {
  markMobileWebview: (id, device) => ipcRenderer.send('mark-mobile-webview', id, device),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (patch) => ipcRenderer.invoke('set-settings', patch),
});
