// Окна и мини-режим:
//  - правило половины экрана: вверху окно раскрывается вниз и сворачивается на верхний край,
//    внизу — раскрывается вверх и сворачивается на нижний край; полоска возвращается на своё место;
//  - «Choose task» из мини: окно раскрывается на месте полоски (без дубля) и после запуска задачи
//    само сворачивается обратно;
//  - крестик сворачивает окно на панель задач (Windows), приложение живо; события пишутся в журнал.
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
    clients: [{ id: 'c1', name: 'AA', color: '#e07a5f' }],
    tasks: [{ id: 't1', clientId: 'c1', name: 'Sync' }, { id: 't2', clientId: 'c1', name: 'Call' }],
    days: {}, entries: [{ id: 'e0', taskId: 't2', start: Date.now() - 7200e3, end: Date.now() - 7000e3 }], lastSeen: Date.now(),
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
  const setBounds = (name, b) => app.evaluate(({ BrowserWindow }, p) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith(p.name));
    w.setBounds(p.b);
  }, { name, b });
  const miniPage = () => app.windows().find((w) => w.url().endsWith('mini.html'));
  const expand = async () => { await miniPage().click('#expand', { noWaitAfter: true }).catch(() => {}); await sleep(1500); };
  const collapse = async () => { await win.click('#miniBtn'); await sleep(1800); };
  const wa = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const H = 520; // высота окна в тесте (влезает и в экран раннера 1024×768)
  const checks = [];
  const near = (a, b) => Math.abs(a - b) <= 2;
  const check = (name, ok, info) => { checks.push({ name, ok }); console.log(ok ? 'OK  ' : 'FAIL', name, JSON.stringify(info || '')); };

  // 1. окно в верхней половине → сворачивается на верхний край → раскрывается вниз туда же
  await setBounds('index.html', { x: wa.x + 100, y: wa.y + 20, width: 460, height: H });
  await sleep(500);
  await collapse();
  let mini = await get('mini.html'), main = await get('index.html');
  check('top half: mini on the top edge', mini && near(mini.b.x, wa.x + 100) && near(mini.b.y, wa.y + 20), mini && mini.b);
  check('main hidden in mini mode', main && !main.visible);
  await expand();
  main = await get('index.html');
  check('top half: expands down from the bar', main && main.visible && near(main.b.y, wa.y + 20), main && main.b);

  // 2. полоска внизу (у панели задач) → раскрывается вверх → сворачивается обратно вниз, на то же место
  await collapse();
  const barY = wa.y + wa.height - 40;
  await setBounds('mini.html', { x: wa.x + 200, y: barY, width: 340, height: 40 });
  await sleep(600);
  await expand();
  main = await get('index.html');
  check('bottom half: expands up, bottom edge at the bar', main && near(main.b.y + main.b.height, barY + 40) && near(main.b.x, wa.x + 200), main && main.b);
  await collapse();
  mini = await get('mini.html');
  check('bottom half: collapses back to the same place', mini && near(mini.b.y, barY) && near(mini.b.x, wa.x + 200), mini && mini.b);

  // 3. развернули внизу, перетащили окно наверх → сворачивается на верхний край
  await expand();
  await setBounds('index.html', { x: wa.x + 50, y: wa.y + 10, width: 460, height: H });
  await sleep(500);
  await collapse();
  mini = await get('mini.html');
  check('moved to the top: collapses to the top edge', mini && near(mini.b.y, wa.y + 10), mini && mini.b);

  // 4. «Choose task» из мини: без дубля, после запуска задачи — обратно в мини
  await win.evaluate(() => openPopup('notRunning', { title: 'Timer is not running', body: '', activeMs: 60000, lastTask: null }));
  await sleep(2000);
  const pop = app.windows().find((w) => w.url().endsWith('popup.html'));
  check('reminder shown', !!pop);
  if (pop) await pop.click('text=Choose task', { noWaitAfter: true }).catch(() => {});
  await sleep(1800);
  mini = await get('mini.html'); main = await get('index.html');
  check('choose task: full window, no mini duplicate', main && main.visible && !mini, { main: main && main.visible, mini: !!mini });
  await win.evaluate(() => { startTask('t1'); render(); });
  await sleep(2500);
  mini = await get('mini.html'); main = await get('index.html');
  check('after starting a task: back to mini automatically', mini && mini.visible && main && !main.visible, { mini: mini && mini.b, main: main && main.visible });

  // 5. крестик: Windows — свернуть на панель задач, приложение живо
  await expand();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('index.html')).close());
  await sleep(1000);
  main = await get('index.html');
  if (process.platform === 'win32') check('close button minimizes, window still exists', main && main.minimized, main);
  else check('close button keeps the app running', !!main, main);

  const diag = JSON.parse(await win.evaluate(() => diagnostics()));
  console.log('LOG TAIL:\n' + diag.main.log.slice(-14).join('\n'));
  check('event log records actions', diag.main.log.some((l) => l.includes('mini:open mini-button')) && diag.main.log.some((l) => l.includes('auto-return-after-start')) && diag.main.log.some((l) => l.includes('close-button')));
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  const failed = checks.filter((c) => !c.ok);
  console.log(failed.length ? `WINDOWS FAILED (${failed.length})` : 'WINDOWS OK');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
