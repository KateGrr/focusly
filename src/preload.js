const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, payload) => cb(payload));

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  dataPath: () => ipcRenderer.invoke('data:path'),
  openDataFolder: () => ipcRenderer.invoke('data:openFolder'),

  // всплывающее окно
  showPopup: (payload) => ipcRenderer.invoke('popup:show', payload),
  closePopup: () => ipcRenderer.invoke('popup:close'),
  answerPopup: (answer) => ipcRenderer.invoke('popup:answer', answer),
  onPopupAnswer: on('popup:answer'),
  onPopupData: on('popup:data'),
  onPopupClosed: on('popup:closed'),

  // трей и окно
  updateTray: (state) => ipcRenderer.invoke('tray:update', state),
  showWindow: () => ipcRenderer.invoke('window:show'),
  onCommand: on('cmd'),

  // мини-режим
  setMini: (onOff, source) => ipcRenderer.invoke('mini:set', onOff, source),
  log: (type, details) => ipcRenderer.invoke('log', type, details),
  miniMenu: () => ipcRenderer.invoke('mini:menu'),
  miniCmd: (cmd) => ipcRenderer.invoke('mini:cmd', cmd),
  onMiniState: on('mini:state'),

  // системные события
  onIdle: on('sys:idle'),
  onLock: on('sys:lock'),
  onUnlock: on('sys:unlock'),
  onSuspend: on('sys:suspend'),
  onResume: on('sys:resume'),

  // версия и обновления
  getVersion: () => ipcRenderer.invoke('app:version'),
  diagMain: () => ipcRenderer.invoke('diag:main'),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openReleases: () => ipcRenderer.invoke('update:open'),
  onUpdateStatus: on('update:status'),

  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: (on) => ipcRenderer.invoke('autostart:set', on),

  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  exportCsv: (defaultName, content) => ipcRenderer.invoke('export:csv', { defaultName, content }),
});
