'use strict';

// Preload for the standalone profile picker / manager window.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
  list:     ()              => ipcRenderer.invoke('picker:list'),
  create:   (data)          => ipcRenderer.invoke('picker:create', data),
  update:   (data)          => ipcRenderer.invoke('picker:update', data),
  remove:   (id)            => ipcRenderer.invoke('picker:delete', id),
  getPrefs: ()              => ipcRenderer.invoke('picker:get-prefs'),
  setPrefs: (patch)         => ipcRenderer.invoke('picker:set-prefs', patch),
  choose:   (id, makeDefault) => ipcRenderer.invoke('picker:choose', { id, makeDefault }),
  incognito: ()             => ipcRenderer.invoke('picker:incognito'),
  close:    ()              => ipcRenderer.send('picker:close-window'),
});
