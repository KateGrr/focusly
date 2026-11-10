// Автопауза: таймер идёт → «нет ввода 15 мин» → «ввод вернулся» → должно появиться окно «You were away».
// Потом то же самое через блокировку экрана (lock → unlock).
const { _electron } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
fs.mkdirSync('test-output', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const cfg = path.join(os.tmpdir(), 'fa-' + Date.now(), 'Focusly');
  fs.mkdirSync(cfg, { recursive: true });
  const now = Date.now();
  fs.writeFileSync(path.join(cfg, 'focusly-data.json'), JSON.stringify({
    version: 1,
    settings: { lang: 'en', idleOn: true, idleMinutes: 10, lockPause: true, notRunningOn: false, remindersOn: false, eodOn: false, workDays: [0, 1, 2, 3, 4, 5, 6] },
    clients: [{ id: 'c1', name: 'AA', color: '#e07a5f' }],
    tasks: [{ id: 't1', clientId: 'c1', name: 'Sync' }, { id: 't2', clientId: 'c1', name: 'Call' }],
    days: {}, entries: [
      { id: 'old', taskId: 't2', start: now - 7200e3, end: now - 7000e3 },
      { id: 'run', taskId: 't1', start: now - 30 * 60e3, end: null, lastCheck: now },
    ], lastSeen: now,
  }));
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [path.join(__dirname, '..'), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, FOCUSLY_USER_DATA: cfg },
  });
  const win = await app.firstWindow();
  win.on('pageerror', (e) => console.log('[renderer error]', e.message));
  const results = {};
  const setIdle = (sec) => app.evaluate(({ powerMonitor }, s) => { powerMonitor.getSystemIdleTime = () => s; }, sec);
  const state = () => win.evaluate(() => { const r = running(); return { popupKind, away: !!away, running: !!r, idleStart: r && r.idleStart ? Math.round((Date.now() - r.idleStart) / 60000) + 'min ago' : null }; });
  const popupText = async () => { const p = app.windows().find((w) => w.url().endsWith('popup.html')); return p ? (await p.innerText('body')).replace(/\n+/g, ' | ') : null; };

  // --- 1. бездействие ---
  await setIdle(3); await sleep(7000);
  console.log('start', JSON.stringify(await state()));
  await setIdle(15 * 60); await sleep(7000);                // «15 минут без ввода»
  console.log('idle 15min', JSON.stringify(await state()));
  await setIdle(2); await sleep(8000);                      // вернулась
  console.log('back', JSON.stringify(await state()));
  results.idlePopup = await popupText();
  console.log('IDLE POPUP:', results.idlePopup);
  const p = app.windows().find((w) => w.url().endsWith('popup.html'));
  if (p) { await p.screenshot({ path: 'test-output/away.png' }); await p.click('text=Discard & continue', { noWaitAfter: true }).catch(() => {}); await sleep(1500); }
  const entries = await win.evaluate(() => data.entries.filter((e) => e.taskId === 't1').map((e) => ({ min: Math.round(((e.end || Date.now()) - e.start) / 60000), open: e.end == null })));
  console.log('after discard', JSON.stringify(entries));
  results.discardOk = entries.length === 2 && entries[0].min <= 16 && entries[1].open;

  // --- 2. блокировка экрана ---
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('lock-screen'));
  await sleep(7000); // проверка бездействия видит ввод 2 сек назад — пауза при этом НЕ должна сниматься
  console.log('locked +7s', JSON.stringify(await state()));
  results.lockHolds = (await state()).away === true;
  // имитируем, что прошло 2 минуты: сдвигаем начало отсутствия
  await win.evaluate(() => { const r = running(); if (r && r.idleStart) r.idleStart -= 120e3; if (away) away.start -= 120e3; });
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('unlock-screen'));
  await sleep(2500);
  console.log('unlocked', JSON.stringify(await state()));
  results.lockPopup = await popupText();
  console.log('LOCK POPUP:', results.lockPopup);

  const lp = app.windows().find((w) => w.url().endsWith('popup.html'));
  if (lp) { await lp.click('text=Keep', { noWaitAfter: true }).catch(() => {}); await sleep(1500); }

  // --- 3. сон ---
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('suspend'));
  await sleep(7000); // до пробуждения пауза держится, даже если проверка видит недавний ввод
  console.log('suspended +7s', JSON.stringify(await state()));
  results.sleepHolds = (await state()).away === true;
  await win.evaluate(() => { const r = running(); if (r && r.idleStart) r.idleStart -= 40 * 60e3; if (away) away.start -= 40 * 60e3; });
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'));
  await sleep(7000);
  console.log('resumed', JSON.stringify(await state()));
  results.sleepPopup = await popupText();
  console.log('SLEEP POPUP:', results.sleepPopup);

  const diag = await win.evaluate(() => diagnostics());
  fs.writeFileSync('test-output/diagnostics-autopause.json', diag);
  await app.close();
  const ok = results.idlePopup && results.idlePopup.includes('You were away') && results.discardOk && results.lockHolds && results.lockPopup && results.lockPopup.includes('You were away') && results.sleepHolds && results.sleepPopup && results.sleepPopup.includes('You were away');
  console.log(ok ? 'AUTOPAUSE OK' : 'AUTOPAUSE FAILED', JSON.stringify(results));
  if (!ok) process.exit(1);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
