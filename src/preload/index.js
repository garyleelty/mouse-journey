'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const channels = [
  'state:update', 'state:full', 'journey:event', 'achievement', 'health:reminder', 'reminder:show'
];

const api = {
  /* ---- 查询 ---- */
  getState: () => ipcRenderer.invoke('state:get'),
  statsRange: (days) => ipcRenderer.invoke('stats:range', { days }),
  displays: () => ipcRenderer.invoke('displays:list'),
  calibrationPreview: (args) => ipcRenderer.invoke('calibration:preview', args),
  calibrationDone: () => ipcRenderer.invoke('calibration:done'),
  exportData: (args) => ipcRenderer.invoke('data:export', args),
  accessibility: () => ipcRenderer.invoke('platform:accessibility'),

  /* ---- 设置 ---- */
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),

  /* ---- 旅程 ---- */
  setJourneyMode: (mode, routeId) => ipcRenderer.invoke('journey:setMode', { mode, routeId }),
  reroll: () => ipcRenderer.invoke('journey:reroll'),

  /* ---- 健康 ---- */
  snooze: () => ipcRenderer.invoke('health:snooze'),
  rest: () => ipcRenderer.invoke('health:rest'),
  testReminder: () => ipcRenderer.invoke('health:test'),
  reminderAck: (action) => ipcRenderer.invoke('reminder:ack', action),

  /* ---- 悬浮窗 ---- */
  setOpacity: (v) => ipcRenderer.invoke('float:setOpacity', v),
  setCollapsed: (v) => ipcRenderer.invoke('float:setCollapsed', v),
  hideFloat: () => ipcRenderer.invoke('float:hide'),

  /* ---- 其它 ---- */
  pause: (paused) => ipcRenderer.invoke('tracker:pause', paused),
  showMain: () => ipcRenderer.invoke('window:showMain'),
  openUrl: (url) => ipcRenderer.invoke('window:openUrl', url),
  resetDay: () => ipcRenderer.invoke('data:resetDay'),
  openFolder: () => ipcRenderer.invoke('data:openFolder'),
  quit: () => ipcRenderer.invoke('app:quit'),

  /* ---- 事件订阅 ---- */
  on: (channel, cb) => {
    // 白名单之外一律拒绝订阅，渲染层代码不能借此监听任意 IPC 通道
    if (!channels.includes(channel)) {
      console.warn('[preload] 拒绝订阅未授权的事件通道:', channel);
      return () => {};
    }
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
};

contextBridge.exposeInMainWorld('api', api);
