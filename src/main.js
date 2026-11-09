// Главный процесс: окна, трей, хранение данных, всплывающие окна, системные события (бездействие/блокировка/сон).
const {
  app, BrowserWindow, ipcMain, dialog, screen, shell, clipboard,
  Tray, Menu, nativeImage, Notification, powerMonitor, net,
} = require('electron');
const path = require('path');
const I18N = require('./i18n.js');
const T = () => I18N.makeT(trayState.lang || 'en');
const fs = require('fs');

const DATA_FILE = () => path.join(app.getPath('userData'), 'focusly-data.json');

// Переезд со старого названия «Time Tracker»: копируем данные в новую папку Focusly (старую не трогаем — это бэкап).
function migrateFromTimeTracker() {
  try {
    const oldDir = path.join(app.getPath('appData'), 'Time Tracker');
    const newDir = app.getPath('userData');
    const pairs = [['timetracker-data.json', 'focusly-data.json'], ['ui-state.json', 'ui-state.json']];
    fs.mkdirSync(newDir, { recursive: true });
    for (const [from, to] of pairs) {
      const src = path.join(oldDir, from), dst = path.join(newDir, to);
      if (fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
    }
  } catch (e) { console.error('migration failed', e); }
}
const ICON = (name) => path.join(__dirname, 'icons', name);

let mainWin = null;
let popupWin = null;
let popupPayload = null;
let tray = null;
let trayState = { running: null, recent: [], lang: 'en' };
let isQuitting = false;
let trayHintShown = false;
let miniWin = null;

// ---------- состояние интерфейса (мини-режим, позиция) ----------
const UI_FILE = () => path.join(app.getPath('userData'), 'ui-state.json');
let ui = { mini: false, miniX: null, miniY: null, miniW: 340 };
function loadUi() { try { ui = { ...ui, ...JSON.parse(fs.readFileSync(UI_FILE(), 'utf8')) }; } catch {} }
function saveUi() { try { fs.writeFileSync(UI_FILE(), JSON.stringify(ui)); } catch {} }

// ---------- хранение ----------
function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8')); } catch { return null; }
}
function writeData(data) {
  const file = DATA_FILE();
  const tmp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file); // атомарная замена — файл не побьётся при сбое
}

// ---------- главное окно ----------
function showMain() {
  if (!mainWin) return;
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}

// ---------- мини-режим: одна строка поверх всех окон ----------
const MINI_H = 40;
function miniBounds() {
  const w = Math.max(240, Math.min(700, ui.miniW || 340));
  if (ui.miniX != null && ui.miniY != null) {
    const d = screen.getDisplayMatching({ x: ui.miniX, y: ui.miniY, width: w, height: MINI_H });
    const a = d.workArea;
    // если монитор отключили — вернём полоску на видимый экран
    if (ui.miniX >= a.x - w + 40 && ui.miniX <= a.x + a.width - 40 && ui.miniY >= a.y && ui.miniY <= a.y + a.height - 20) {
      return { x: ui.miniX, y: ui.miniY, width: w, height: MINI_H };
    }
  }
  const a = screen.getPrimaryDisplay().workArea;
  return { x: Math.round(a.x + (a.width - w) / 2), y: a.y + 8, width: w, height: MINI_H };
}
function openMini() {
  ui.mini = true; saveUi();
  if (mainWin) mainWin.hide();
  if (miniWin) { miniWin.showInactive(); return; }
  miniWin = new BrowserWindow({
    ...miniBounds(),
    minWidth: 240, maxWidth: 700, minHeight: MINI_H, maxHeight: MINI_H,
    frame: false, resizable: true, maximizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, show: false,
    title: 'Focusly', icon: ICON('icon.png'), backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  miniWin.setAlwaysOnTop(true, 'screen-saver');
  miniWin.setVisibleOnAllWorkspaces(true);
  miniWin.loadFile(path.join(__dirname, 'mini.html'));
  miniWin.once('ready-to-show', () => { miniWin.webContents.send('mini:state', trayState); miniWin.showInactive(); });
  const remember = () => { if (!miniWin) return; const b = miniWin.getBounds(); ui.miniX = b.x; ui.miniY = b.y; ui.miniW = b.width; saveUi(); };
  miniWin.on('moved', remember);
  miniWin.on('resized', remember);
  miniWin.on('closed', () => { miniWin = null; });
  updateTray();
}
function closeMini() {
  ui.mini = false; saveUi();
  if (miniWin) miniWin.close();
  showMain();
  updateTray();
}
function miniMenu() {
  const items = [];
  const r = trayState.running;
  const t = T();
  if (r) items.push({ label: t('stop'), click: () => send('cmd', { type: 'stop' }) }, { type: 'separator' });
  if (trayState.recent.length) {
    items.push({ label: t('menuSwitchTo'), enabled: false });
    for (const t of trayState.recent) items.push({ label: `   ${t.label}`, click: () => send('cmd', { type: 'start', taskId: t.id }) });
    items.push({ type: 'separator' });
  }
  items.push({ label: t('menuNewTask'), click: () => { closeMini(); send('cmd', { type: 'newTask' }); } });
  items.push({ label: t('menuFull'), click: closeMini });
  Menu.buildFromTemplate(items).popup({ window: miniWin || undefined });
}

function createMainWindow(hidden) {
  mainWin = new BrowserWindow({
    width: 460, height: 720, minWidth: 380, minHeight: 480,
    title: 'Focusly',
    icon: ICON('icon.png'),
    backgroundColor: '#f7f7f5',
    autoHideMenuBar: true,
    show: !hidden,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, // таймер и проверки работают и в свёрнутом окне
    },
  });
  mainWin.loadFile(path.join(__dirname, 'index.html'));
  // крестик — свернуть в трей, приложение продолжает работать
  mainWin.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWin.hide();
    if (!trayHintShown && Notification.isSupported()) {
      trayHintShown = true;
      new Notification({ title: T()('bgTitle'), body: T()('bgBody'), silent: true }).show();
    }
  });
  mainWin.on('closed', () => { mainWin = null; });
}

// ---------- трей ----------
function fmtDur(ms) { const m = Math.floor(ms / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; }
const send = (channel, payload) => { if (mainWin) mainWin.webContents.send(channel, payload); };

function updateTray() {
  if (!tray) return;
  const r = trayState.running;
  tray.setImage(nativeImage.createFromPath(ICON(r ? 'tray-run.png' : 'tray-idle.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip(r ? `▶ ${r.clientName}: ${r.taskName} — ${fmtDur(r.todayMs)}` : T()('trayIdle'));
  const items = [];
  if (r) {
    items.push({ label: `▶ ${r.clientName}: ${r.taskName}  (${fmtDur(r.todayMs)})`, enabled: false });
    items.push({ label: T()('stop'), click: () => send('cmd', { type: 'stop' }) });
  } else {
    items.push({ label: T()('trayNotRunning'), enabled: false });
  }
  if (trayState.recent.length) {
    items.push({ type: 'separator' });
    items.push({ label: T()('trayStart'), enabled: false });
    for (const t of trayState.recent) {
      items.push({ label: `   ${t.label}`, click: () => send('cmd', { type: 'start', taskId: t.id }) });
    }
  }
  items.push({ type: 'separator' });
  if (typeof updateStatus !== 'undefined' && updateStatus.state === 'downloaded') {
    items.push({ label: T()('trayRestartUpdate', { v: updateStatus.version }), click: installUpdate });
    items.push({ type: 'separator' });
  } else if (typeof updateStatus !== 'undefined' && updateStatus.state === 'manual') {
    items.push({ label: T()('trayDownloadUpdate', { v: updateStatus.version }), click: () => shell.openExternal(RELEASES_URL) });
    items.push({ type: 'separator' });
  }
  items.push({ label: T()('trayMini'), type: 'checkbox', checked: !!miniWin, click: () => (miniWin ? closeMini() : openMini()) });
  items.push({ label: T()('trayOpen'), click: () => (miniWin ? closeMini() : showMain()) });
  items.push({ label: T()('trayQuit'), click: () => { isQuitting = true; app.quit(); } });
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON('tray-idle.png')).resize({ width: 16, height: 16 }));
  tray.on('click', () => {
    if (miniWin) { miniWin.showInactive(); return; }
    if (mainWin && mainWin.isVisible() && mainWin.isFocused()) mainWin.hide(); else showMain();
  });
  updateTray();
}

// ---------- всплывающее окно (напоминания, бездействие, конец дня) ----------
const POPUP_H = { reminder: 176, idle: 250, notRunning: 150, endOfDay: 170 };

function showPopup(payload) {
  popupPayload = payload;
  const w = 380, h = POPUP_H[payload.kind] || 200;
  const { workArea } = screen.getPrimaryDisplay();
  const bounds = { x: workArea.x + workArea.width - w - 16, y: workArea.y + workArea.height - h - 16, width: w, height: h };

  if (payload.systemNotify && Notification.isSupported()) {
    const n = new Notification({ title: payload.title, body: payload.body || '', silent: true });
    n.on('click', () => { if (popupWin) popupWin.show(); });
    n.show();
  }
  if (mainWin && !mainWin.isFocused()) mainWin.flashFrame(true);

  if (popupWin) {
    popupWin.setBounds(bounds);
    popupWin.webContents.send('popup:data', payload);
    popupWin.showInactive();
    return;
  }
  popupWin = new BrowserWindow({
    ...bounds,
    frame: false, resizable: false, alwaysOnTop: true, show: false, skipTaskbar: false,
    title: 'Focusly', icon: ICON('icon.png'), backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      autoplayPolicy: 'no-user-gesture-required', // звук без клика
    },
  });
  popupWin.setAlwaysOnTop(true, 'screen-saver');
  popupWin.loadFile(path.join(__dirname, 'popup.html'));
  popupWin.once('ready-to-show', () => {
    popupWin.webContents.send('popup:data', popupPayload);
    popupWin.showInactive(); // не крадём фокус, пока ты печатаешь
  });
  popupWin.on('closed', () => { popupWin = null; });
}

function closePopup() {
  if (popupWin) popupWin.close();
  if (mainWin) mainWin.flashFrame(false);
}

// ---------- IPC ----------
ipcMain.handle('data:load', () => readData());
ipcMain.handle('data:save', (_e, data) => { writeData(data); return true; });
ipcMain.handle('data:path', () => DATA_FILE());
ipcMain.handle('data:openFolder', () => shell.showItemInFolder(DATA_FILE()));

ipcMain.handle('popup:show', (_e, payload) => { showPopup(payload); return true; });
ipcMain.handle('popup:close', () => { closePopup(); return true; });
ipcMain.handle('popup:answer', (_e, answer) => {
  closePopup();
  send('popup:answer', answer);
  if (['switch', 'choose', 'open'].includes(answer.action)) showMain();
  return true;
});

ipcMain.handle('tray:update', (_e, state) => {
  trayState = state;
  updateTray();
  if (miniWin) miniWin.webContents.send('mini:state', state);
  return true;
});
ipcMain.handle('mini:set', (_e, on) => { on ? openMini() : closeMini(); return true; });
ipcMain.handle('mini:menu', () => { miniMenu(); return true; });
ipcMain.handle('mini:cmd', (_e, cmd) => { send('cmd', cmd); return true; });
ipcMain.handle('window:show', () => { showMain(); return true; });

// ---------- автообновление (GitHub Releases) ----------
let updater = null;
let updateStatus = { state: 'idle' }; // idle | checking | none | available | downloaded | error | dev
function sendUpdate() { send('update:status', updateStatus); }
function setupAutoUpdate() {
  if (!app.isPackaged) { updateStatus = { state: 'dev' }; return; } // при npm start обновления не проверяем
  // macOS без платной подписи Apple не умеет ставить обновления сама — только проверяем и предлагаем скачать
  if (process.platform === 'darwin') { setupManualUpdateCheck(); return; }
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch (e) { updateStatus = { state: 'error', message: String(e) }; return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => { updateStatus = { state: 'checking' }; sendUpdate(); });
  updater.on('update-not-available', () => { updateStatus = { state: 'none' }; sendUpdate(); });
  updater.on('update-available', (i) => { updateStatus = { state: 'available', version: i.version }; sendUpdate(); });
  updater.on('error', (e) => { updateStatus = { state: 'error', message: String((e && e.message) || e) }; sendUpdate(); });
  // без всплывающих окон: тихий индикатор (точка на ⚙, About, пункт в трее); если не нажать — поставится при выходе
  updater.on('update-downloaded', (i) => {
    updateStatus = { state: 'downloaded', version: i.version };
    sendUpdate();
    updateTray();
  });
  const check = () => updater.checkForUpdates().catch(() => {});
  setTimeout(check, 15000);
  setInterval(check, 6 * 3600000);
}
const RELEASES_URL = 'https://github.com/KateGrr/focusly/releases/latest';
function newerVersion(a, b) { // a > b ?
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}
function setupManualUpdateCheck() {
  updater = { checkForUpdates: async () => {
    updateStatus = { state: 'checking' }; sendUpdate();
    try {
      const res = await net.fetch('https://api.github.com/repos/KateGrr/focusly/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
      const rel = await res.json();
      const v = String(rel.tag_name || '').replace(/^v/, '');
      updateStatus = v && newerVersion(v, app.getVersion()) ? { state: 'manual', version: v } : { state: 'none' };
    } catch (e) { updateStatus = { state: 'error', message: String(e) }; }
    sendUpdate();
    updateTray();
  } };
  const check = () => updater.checkForUpdates();
  setTimeout(check, 15000);
  setInterval(check, 6 * 3600000);
}
ipcMain.handle('update:open', () => { shell.openExternal(RELEASES_URL); return true; });

function installUpdate() {
  if (!updater || updateStatus.state !== 'downloaded') return;
  isQuitting = true;
  updater.quitAndInstall();
}
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('update:status', () => updateStatus);
ipcMain.handle('update:check', () => { if (updater) updater.checkForUpdates().catch(() => {}); return updateStatus; });
ipcMain.handle('update:install', () => { installUpdate(); return true; });

ipcMain.handle('autostart:get', () => app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin);
ipcMain.handle('autostart:set', (_e, on) => {
  // Windows: запуск с флагом --hidden (сразу в трей); macOS: openAsHidden
  app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'], openAsHidden: true });
  return true;
});

ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(text); return true; });
ipcMain.handle('export:csv', async (_e, { defaultName, content }) => {
  const res = await dialog.showSaveDialog(mainWin, {
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (res.canceled || !res.filePath) return false;
  fs.writeFileSync(res.filePath, '﻿' + content, 'utf8'); // BOM — чтобы Excel понял кириллицу
  return res.filePath;
});

// ---------- системные события ----------
function watchSystem() {
  // раз в 5 секунд сообщаем, сколько секунд не было ввода с мыши/клавиатуры во всей системе
  setInterval(() => send('sys:idle', powerMonitor.getSystemIdleTime()), 5000);
  powerMonitor.on('lock-screen', () => send('sys:lock'));
  powerMonitor.on('unlock-screen', () => send('sys:unlock'));
  powerMonitor.on('suspend', () => send('sys:suspend'));
  powerMonitor.on('resume', () => send('sys:resume'));
}

// для автотестов: отдельная папка данных (в обычной работе не используется)
if (process.env.FOCUSLY_USER_DATA) app.setPath('userData', process.env.FOCUSLY_USER_DATA);

// британская локаль — поля времени в 24-часовом формате, системные меню на английском
app.commandLine.appendSwitch('lang', 'en-GB');

// ---------- запуск ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMain);
  app.whenReady().then(() => {
    // Windows показывает уведомления только «зарегистрированным» приложениям.
    // В собранном .exe это делает установщик; при запуске через npm start используем путь к electron.exe.
    if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? 'app.focusly.desktop' : process.execPath);
    migrateFromTimeTracker();
    loadUi();
    const startHidden = process.argv.includes('--hidden') || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAsHidden);
    createMainWindow(startHidden || ui.mini);
    if (ui.mini) mainWin.webContents.once('did-finish-load', openMini);
    createTray();
    watchSystem();
    setupAutoUpdate();
    app.on('activate', showMain);
  });
  app.on('before-quit', () => { isQuitting = true; });
  app.on('window-all-closed', () => { /* живём в трее */ });
}
