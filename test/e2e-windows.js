// Окна: мини-полоска встаёт туда, где был верх окна; окно раскрывается от полоски;
// у края экрана окно сдвигается, чтобы влезть; крестик сворачивает (Windows), а не прячет.
const { _electron } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
fs.mkdirSync('test-output', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const cfg = path.join(os.tmpdir(), 'fw-' + Date.now(), 'Focusly');
  fs.mkdirSync(cfg, { recursive: true });
  fs.writeFileSync(path.join(cfg, 'focusly-data.json'), JSON.stringify({
    version: 1, settings: { lang: 'en', notRunningOn: false, remindersOn: false, eodOn: false, idleOn: false },
    clients: [{ id: 'c1', name: 'AA', color: '#e07a5f' }], tasks: [{ id: 't1', clientId: 'c1', name: 'Sync' }],
    days: {}, entries: [], lastSeen: Date.now(),
  }));
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [path.join(__dirname, '..'), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, FOCUSLY_USER_DATA: cfg },
  });
  const win = await app.firstWindow();
  await win.waitForSelector('#miniBtn');
  await sleep(1000);
  const wins = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => ({
    url: w.webContents.getURL().split('/').pop(), visible: w.isVisible(), minimized: w.isMinimized(), b: w.getBounds() })));
  const get = async (name) => (await wins()).find((w) => w.url === name);
  const wa = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const checks = [];
  const check = (name, ok, info) => { checks.push({ name, ok }); console.log(ok ? 'OK  ' : 'FAIL', name, JSON.stringify(info || '')); };

  // 1. окно в (100, 60) → Mini → полоска там же
  await app.evaluate(({ BrowserWindow }, p) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('index.html'));
    w.setBounds({ x: p.x, y: p.y, width: 460, height: 600 });
  }, { x: wa.x + 100, y: wa.y + 60 });
  await sleep(500);
  await win.click('#miniBtn');
  await sleep(2000);
  let mini = await get('mini.html'), main = await get('index.html');
  check('mini appears at the top of the window', mini && Math.abs(mini.b.x - (wa.x + 100)) <= 2 && Math.abs(mini.b.y - (wa.y + 60)) <= 2, { mini: mini && mini.b });
  check('main window hidden in mini mode', main && !main.visible, main);

  // 2. передвинули полоску → развернули → окно раскрылось от полоски
  await app.evaluate(({ BrowserWindow }, p) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('mini.html'));
    w.setPosition(p.x, p.y);
  }, { x: wa.x + 300, y: wa.y + 40 });
  await sleep(500);
  const mp = app.windows().find((w) => w.url().endsWith('mini.html'));
  await mp.click('#expand', { noWaitAfter: true }).catch(() => {});
  await sleep(1500);
  main = await get('index.html');
  check('main opens where the mini bar was', main && main.visible && Math.abs(main.b.x - (wa.x + 300)) <= 2 && Math.abs(main.b.y - (wa.y + 40)) <= 2, main && main.b);

  // 3. полоска у нижнего края → окно сдвигается вверх, чтобы влезть
  await win.click('#miniBtn');
  await sleep(1500);
  await app.evaluate(({ BrowserWindow }, p) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('mini.html'));
    w.setPosition(p.x, p.y);
  }, { x: wa.x + 200, y: wa.y + wa.height - 40 });
  await sleep(500);
  const mp2 = app.windows().find((w) => w.url().endsWith('mini.html'));
  await mp2.click('#expand', { noWaitAfter: true }).catch(() => {});
  await sleep(1500);
  main = await get('index.html');
  check('main fits on screen near the bottom edge', main && main.b.y + main.b.height <= wa.y + wa.height + 1 && main.b.y >= wa.y && Math.abs(main.b.x - (wa.x + 200)) <= 2, { main: main && main.b, wa });

  // 4. крестик: Windows — свернуть (иконка остаётся на панели задач), приложение живо
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('index.html')).close());
  await sleep(1000);
  main = await get('index.html');
  if (process.platform === 'win32') check('close button minimizes, window still exists', main && main.minimized, main);
  else check('close button keeps the app running', !!main, main);

  const diag = JSON.parse(await win.evaluate(() => diagnostics()));
  console.log('LOG TAIL:\n' + diag.main.log.slice(-12).join('\n'));
  check('event log records mini/close events', diag.main.log.some((l) => l.includes('mini:open mini-button')) && diag.main.log.some((l) => l.includes('close-button')));
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  const failed = checks.filter((c) => !c.ok);
  console.log(failed.length ? `WINDOWS FAILED (${failed.length})` : 'WINDOWS OK');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
