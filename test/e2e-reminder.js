const { _electron } = require('playwright-core');
const fs = require('fs');
fs.mkdirSync('test-output', { recursive: true });
(async () => {
  const cfg = require('path').join(require('os').tmpdir(), 'ft-' + Date.now());
  fs.mkdirSync(cfg + '/Focusly', { recursive: true });
  const now = Date.now();
  fs.writeFileSync(cfg + '/Focusly/focusly-data.json', JSON.stringify({
    version: 1, settings: { lang: 'en', notRunningOn: true, notRunningMinutes: 1, workDays: [0,1,2,3,4,5,6] },
    clients: [{ id: 'c1', name: 'AA', color: '#e07a5f' }], tasks: [{ id: 't1', clientId: 'c1', name: 'Sync' }],
    days: {}, entries: [{ id: 'e1', taskId: 't1', start: now - 3600e3, end: now - 3000e3 }], lastSeen: now,
  }));
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [require('path').join(__dirname, '..'), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, FOCUSLY_USER_DATA: cfg + '/Focusly' },
  });
  app.on('console', (m) => console.log('[main]', m.text()));
  // имитируем активного пользователя: система «видит» ввод 3 секунды назад
  await app.evaluate(({ powerMonitor }) => { powerMonitor.getSystemIdleTime = () => 3; });
  const win = await app.firstWindow();
  win.on('console', (m) => console.log('[renderer]', m.type(), m.text()));
  win.on('pageerror', (e) => console.log('[renderer error]', e.message));
  const t0 = Date.now();
  let found = false;
  for (let i = 0; i < 9; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const urls = app.windows().map((w) => w.url().split('/').pop());
    const st = await win.evaluate(() => ({ min: data.settings.notRunningMinutes, popupKind, activeSince: activeSince && Math.round((Date.now() - activeSince) / 1000), away: !!away, running: !!running() }));
    console.log(`${Math.round((Date.now() - t0) / 1000)}s windows=${urls.join(',')} state=${JSON.stringify(st)}`);
    if (urls.includes('popup.html')) {
      const pop = app.windows().find((w) => w.url().endsWith('popup.html'));
      await pop.screenshot({ path: 'test-output/popup.png' });
      console.log('POPUP TEXT:', (await pop.innerText('body')).replace(/\n+/g, ' | '));
      const info = await app.evaluate(({ BrowserWindow, screen }) => ({
        displays: screen.getAllDisplays().map((d) => ({ bounds: d.bounds, workArea: d.workArea, primary: d.id === screen.getPrimaryDisplay().id })),
        windows: BrowserWindow.getAllWindows().map((w) => ({ url: w.webContents.getURL().split('/').pop(), visible: w.isVisible(), minimized: w.isMinimized(), onTop: w.isAlwaysOnTop(), bounds: w.getBounds(), opacity: w.getOpacity() })),
      }));
      console.log('WINDOW INFO:', JSON.stringify(info, null, 1));
      fs.writeFileSync('test-output/info.json', JSON.stringify(info, null, 1));
      found = true;
      break;
    }
  }
  await app.close();
  if (!found) { console.error('NO POPUP within 90s'); process.exit(1); }
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
