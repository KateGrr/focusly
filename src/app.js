'use strict';
/* Логика интерфейса тайм-трекера.
 * Данные:
 *   clients: [{id, name, color, archived}]
 *   tasks:   [{id, clientId, name}]
 *   days:    {'YYYY-MM-DD': [taskId, ...]}     — какие задачи показаны в этот день
 *   entries: [{id, taskId, start, end|null, lastCheck}] — интервалы времени (ms)
 */

const COLORS = ['#e07a5f', '#3d85c6', '#81b29a', '#f2cc8f', '#9b5de5', '#f15bb5', '#00a6a6', '#8d6e63', '#6a994e', '#bc4749'];
const DAY_MS = 86400000;

let data = null;
let tr = I18N.makeT('en');      // переводчик, меняется в настройках
let viewDay = todayKey();      // какой день открыт
let weekStart = mondayOf(todayKey());
let selectedClientId = null;
let expandedTaskId = null;
let lastSeenToday = todayKey();

// ---------- утилиты дат и времени ----------
function pad(n) { return String(n).padStart(2, '0'); }
function keyOf(ts) { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayKey() { return keyOf(Date.now()); }
function startOfKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
function addDays(key, n) { const [y, m, d] = key.split('-').map(Number); return keyOf(new Date(y, m - 1, d + n).getTime()); }
function mondayOf(key) { const dow = (new Date(startOfKey(key)).getDay() + 6) % 7; return addDays(key, -dow); }
function hhmm(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDur(ms, withSec = false) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return withSec ? `${h}:${pad(m)}:${pad(sec)}` : `${h}:${pad(m)}`;
}
function hoursDec(ms) { return (ms / 3600000).toFixed(2).replace('.', tr('decimal')); }
const durWords = (ms) => I18N.durWords(tr, ms);
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function dayTitle(key) {
  const d = new Date(startOfKey(key));
  const s = d.toLocaleDateString(tr('locale'), { weekday: 'short', day: 'numeric', month: 'long' });
  const t = todayKey();
  if (key === t) return `${tr('today')}, ${s}`;
  if (key === addDays(t, -1)) return `${tr('yesterday')}, ${s}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) e.append(c);
  return e;
}
const $ = (id) => document.getElementById(id);

// ---------- данные ----------
function emptyData() {
  return {
    version: 1,
    settings: {
      remindersOn: true, reminderMinutes: 30,      // таймер идёт долго
      notRunningOn: true, notRunningMinutes: 5,    // работаю, а таймер не запущен
      eodOn: true, eodTime: '19:00',               // конец рабочего дня
      workDays: [1, 2, 3, 4, 5],                   // рабочие дни (0 = вс … 6 = сб); в выходные не напоминаем
      idleOn: true, idleMinutes: 10,               // пауза при бездействии
      lockPause: true,                             // пауза при блокировке экрана
      sound: true, systemNotify: true,
      lang: 'en',
    },
    clients: [], tasks: [], days: {}, entries: [], lastClientId: null, lastSeen: null, eodShownDay: null,
  };
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.api.save(data), 150);
}
const client = (id) => data.clients.find((c) => c.id === id);
const task = (id) => data.tasks.find((t) => t.id === id);
const running = () => data.entries.find((e) => e.end == null);
const dayList = (key) => (data.days[key] ||= []);
function entryEnd(e) { return e.end ?? Date.now(); }
function entriesOf(taskId, key) {
  return data.entries.filter((e) => e.taskId === taskId && keyOf(e.start) === key).sort((a, b) => a.start - b.start);
}
function taskDayTotal(taskId, key) { return entriesOf(taskId, key).reduce((s, e) => s + (entryEnd(e) - e.start), 0); }
function dayTotal(key) { return dayList(key).reduce((s, id) => s + taskDayTotal(id, key), 0); }
function addToDay(key, taskId) { const l = dayList(key); if (!l.includes(taskId)) l.push(taskId); }

function findOrCreateClient(name) {
  name = name.trim();
  if (!name) return null;
  let c = data.clients.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (c) { c.archived = false; return c; }
  c = { id: uid(), name, color: COLORS[data.clients.length % COLORS.length], archived: false };
  data.clients.push(c);
  return c;
}
function findOrCreateTask(clientId, name) {
  name = name.trim();
  let t = data.tasks.find((x) => x.clientId === clientId && x.name.toLowerCase() === name.toLowerCase());
  if (!t) { t = { id: uid(), clientId, name }; data.tasks.push(t); }
  else t.archived = false; // снова набрала название из архива — достаём обратно
  return t;
}

// Таймер, перешедший через полночь, режем на части — каждый день считается отдельно и новый день начинается с нуля.
function splitAtMidnight() {
  const r = running();
  if (!r) return false;
  let changed = false;
  let cur = r;
  while (keyOf(cur.start) !== todayKey()) {
    const boundary = startOfKey(addDays(keyOf(cur.start), 1));
    cur.end = boundary;
    const next = { id: uid(), taskId: cur.taskId, start: boundary, end: null, lastCheck: cur.lastCheck || cur.start };
    data.entries.push(next);
    addToDay(keyOf(boundary), cur.taskId);
    cur = next;
    changed = true;
  }
  return changed;
}

// ---------- действия ----------
function stopRunning(at = Date.now()) {
  let r = running();
  if (!r) return;
  at = Math.min(at, Date.now());
  // если остановка «задним числом» раньше полуночного разреза — откатываем и предыдущие части
  while (at < r.start) {
    const prev = data.entries.find((e) => e.taskId === r.taskId && e.end === r.start);
    data.entries.splice(data.entries.indexOf(r), 1);
    if (!prev) { afterStop(); return; }
    r = prev;
  }
  r.end = Math.max(r.start, at);
  delete r.lastCheck; delete r.idleStart; delete r.awayEnd;
  if (r.end - r.start < 1000) data.entries.splice(data.entries.indexOf(r), 1); // пустые клики не копим
  afterStop();
}
function afterStop() {
  if (popupKind === 'reminder' || popupKind === 'idle') closePopup();
  activeSince = Date.now(); // отсчёт «таймер не запущен» — с момента остановки
}
function startTask(taskId, at = Date.now()) {
  const r = running();
  if (r && r.taskId === taskId && !r.idleStart) return;
  stopRunning(at);
  data.entries.push({ id: uid(), taskId, start: at, end: null, lastCheck: at });
  addToDay(keyOf(at), taskId);
  const t = task(taskId);
  if (t) data.lastClientId = t.clientId;
  if (popupKind === 'notRunning') closePopup();
  save();
}
function toggleTask(taskId) {
  const r = running();
  if (r && r.taskId === taskId) stopRunning(); else startTask(taskId);
  save();
  render();
}
// добавить готовый интервал (с разрезом по полуночи)
function addEntrySplit(taskId, s, e) {
  while (s < e) {
    const boundary = startOfKey(addDays(keyOf(s), 1));
    const end = Math.min(e, boundary);
    if (end - s >= 1000) { data.entries.push({ id: uid(), taskId, start: s, end }); addToDay(keyOf(s), taskId); }
    s = end;
  }
}

// ---------- всплывающие окна ----------
// приоритет: бездействие > конец дня > напоминание > «таймер не запущен»
const POPUP_PRIORITY = { idle: 4, endOfDay: 3, reminder: 2, notRunning: 1 };
let popupKind = null;
let away = null;                // { start } — сейчас нет за компьютером
let activeSince = Date.now();   // с какого момента активна за компьютером без таймера
let notRunningSnoozeUntil = 0;
let eodSnoozeUntil = 0;

function openPopup(kind, payload) {
  if (popupKind && POPUP_PRIORITY[popupKind] > POPUP_PRIORITY[kind]) return false;
  popupKind = kind;
  window.api.showPopup({ kind, lang: tr.lang, sound: data.settings.sound, systemNotify: data.settings.systemNotify, ...payload });
  return true;
}
function closePopup() {
  if (popupKind) { popupKind = null; window.api.closePopup(); }
}
function taskLabel(t) { const c = t && client(t.clientId); return t ? `${c ? c.name : '—'}: ${t.name}` : '—'; }
function recentTasks(limit, excludeId) {
  const last = {};
  for (const e of data.entries) last[e.taskId] = Math.max(last[e.taskId] || 0, e.start);
  return data.tasks
    .filter((t) => t.id !== excludeId && last[t.id] && !t.archived && !(client(t.clientId) || {}).archived)
    .sort((a, b) => last[b.id] - last[a.id])
    .slice(0, limit);
}

// 1) таймер идёт долго
function checkLongRunning() {
  const r = running();
  const s = data.settings;
  if (!r || !s.remindersOn || away || r.idleStart || popupKind) return;
  const last = r.lastCheck || r.start;
  if (Date.now() - last < s.reminderMinutes * 60000) return;
  const t = task(r.taskId), c = t && client(t.clientId);
  let since = r.start; // без перерыва, с учётом разреза в полночь
  let prev;
  while ((prev = data.entries.find((e) => e.taskId === r.taskId && e.end === since))) since = prev.start;
  openPopup('reminder', {
    title: tr('pReminderTitle'), body: taskLabel(t),
    taskName: t ? t.name : '—', clientName: c ? c.name : '—',
    elapsedMs: Date.now() - since, lastCheck: last,
  });
}

// 2) работаю, а таймер не запущен
function isWorkDay(ts = Date.now()) {
  const wd = data.settings.workDays;
  return !Array.isArray(wd) || wd.includes(new Date(ts).getDay());
}
function checkNotRunning() {
  const s = data.settings;
  if (!s.notRunningOn || !isWorkDay() || running() || away || popupKind) return;
  if (!activeSince || Date.now() < notRunningSnoozeUntil) return;
  const activeMs = Date.now() - activeSince;
  if (activeMs < s.notRunningMinutes * 60000) return;
  const last = recentTasks(1)[0];
  notRunningSnoozeUntil = Date.now() + 15 * 60000; // если проигнорировать — повтор через 15 мин
  openPopup('notRunning', {
    title: tr('pNotRunningTitle'), body: tr('pNotRunningBody'),
    activeMs, lastTask: last ? { id: last.id, label: last.name } : null,
  });
}

// 3) конец рабочего дня
function checkEndOfDay() {
  const s = data.settings;
  if (!s.eodOn || !isWorkDay() || !/^\d{1,2}:\d{2}$/.test(s.eodTime || '')) return;
  const [h, m] = s.eodTime.split(':').map(Number);
  const due = startOfKey(todayKey()) + (h * 60 + m) * 60000;
  const now = Date.now();
  if (now < due) return;
  const shownToday = data.eodShownDay === todayKey();
  // открыла приложение уже сильно позже конца дня — не пугаем напоминанием
  if (!shownToday && now - due > 2 * 3600000) { data.eodShownDay = todayKey(); save(); return; }
  const r = running();
  // показываем один раз в день; повторно — только если выбрала «ещё 30 мин» и таймер идёт
  if (shownToday && !(r && eodSnoozeUntil && now >= eodSnoozeUntil)) return;
  if (popupKind && POPUP_PRIORITY[popupKind] >= POPUP_PRIORITY.endOfDay) return;
  const t = r && task(r.taskId), c = t && client(t.clientId);
  if (openPopup('endOfDay', {
    title: tr('pEodTitle'), body: tr('pTodayShort', { t: fmtDur(dayTotal(todayKey())) }),
    todayMs: dayTotal(todayKey()), running: r ? { taskName: t ? t.name : '—', clientName: c ? c.name : '—' } : null,
  })) {
    data.eodShownDay = todayKey();
    eodSnoozeUntil = 0;
    save();
  }
}

// 4) бездействие / блокировка / сон
// reason: 'idle' — нет ввода дольше порога; 'lock' — экран заблокирован; 'sleep' — компьютер уснул
function beginAway(start, reason = 'idle') {
  if (away) return;
  away = { start, reason, resumed: false };
  activeSince = null;
  const r = running();
  if (r && !r.idleStart) {
    r.idleStart = Math.max(start, r.start);
    if (popupKind === 'reminder' || popupKind === 'notRunning') closePopup();
    save();
  }
}
function endAway(end) {
  if (!away) return;
  away = null;
  activeSince = end;
  const r = running();
  if (!r || !r.idleStart) return;
  if (end - r.idleStart < 60000) { delete r.idleStart; save(); return; } // отошли на минуту — не спрашиваем
  r.awayEnd = end;
  save();
  showIdlePopup();
}
function showIdlePopup() {
  const r = running();
  if (!r || !r.idleStart) return;
  const t = task(r.taskId);
  openPopup('idle', {
    title: tr('pAwayTitle', { d: durWords(r.awayEnd - r.idleStart) }),
    body: `${hhmm(r.idleStart)} – ${hhmm(r.awayEnd)} · ${taskLabel(t)}`,
    from: r.idleStart, to: r.awayEnd, taskName: taskLabel(t),
    tasks: recentTasks(12, r.taskId).map((x) => ({ id: x.id, label: taskLabel(x) })),
  });
}

let idleTicks = 0, lastIdleSec = null, lastIdleAt = 0;
function onIdleSeconds(sec) { safe('idle', () => onIdleSecondsImpl(sec)); }
function onIdleSecondsImpl(sec) {
  idleTicks++; lastIdleSec = sec; lastIdleAt = Date.now();
  const s = data.settings;
  const now = Date.now();
  if (!away && s.idleOn && sec >= s.idleMinutes * 60) beginAway(now - sec * 1000);
  // вернулась к компьютеру: для бездействия — по движению мыши/клавиатуры;
  // для блокировки — только по разблокировке (иначе пауза снималась через 5 секунд после Win+L);
  // для сна — по движению мыши, но только после пробуждения
  else if (away && sec < 30 && (away.reason === 'idle' || (away.reason === 'sleep' && away.resumed)
    // страховка: если сигнал разблокировки не пришёл, но после блокировки прошло >1 мин и есть ввод — человек вернулся
    || (away.reason === 'lock' && now - sec * 1000 - away.start > 60000))) endAway(now - sec * 1000);
  // учёт активности для «таймер не запущен»
  if (!away) {
    if (sec >= 120) activeSince = null;              // 2+ мин без ввода — не считаем, что работаешь
    else if (!activeSince) activeSince = now - sec * 1000;
  }
}

function onPopupAnswer(a) {
  popupKind = null;
  const r = running();
  const now = Date.now();
  switch (a.kind) {
    case 'reminder':
      if (!r) break;
      if (a.action === 'continue' || a.action === 'dismiss') r.lastCheck = now;
      else if (a.action === 'switch') { r.lastCheck = now; focusAddTask(); }
      else if (a.action === 'stop') stopRunning();
      else if (a.action === 'stopAtLastCheck') stopRunning(r.lastCheck || r.start);
      break;
    case 'idle': {
      if (!r || !r.idleStart) break;
      const from = r.idleStart, to = r.awayEnd || now, taskId = r.taskId;
      if (a.action === 'keep') { delete r.idleStart; delete r.awayEnd; r.lastCheck = now; break; }
      stopRunning(from);
      if (a.action === 'discardContinue') startTask(taskId, to);
      else if (a.action === 'assign' && a.taskId) { addEntrySplit(a.taskId, from, to); startTask(taskId, to); }
      break;
    }
    case 'notRunning':
      if (a.action === 'startLast' && a.taskId) startTask(a.taskId);
      else if (a.action === 'choose') { notRunningSnoozeUntil = now + 5 * 60000; focusAddTask(); }
      else notRunningSnoozeUntil = now + 30 * 60000; // «Позже» / закрыть
      break;
    case 'endOfDay':
      if (a.action === 'stop') stopRunning();
      else if (a.action === 'snooze' || (a.action === 'dismiss' && r)) eodSnoozeUntil = now + 30 * 60000;
      else if (a.action === 'open') { viewDay = todayKey(); setView('day'); }
      break;
  }
  save();
  render();
  // если пока окно было открыто, накопилось что-то ещё — покажем
  setTimeout(runChecks, 500);
}
function focusAddTask() {
  viewDay = todayKey();
  setView('day');
  setTimeout(() => $('taskInput').focus(), 80);
}
// каждая проверка отдельно: ошибка в одной не должна отключать остальные
let lastErrors = [];
function safe(name, fn) {
  try { fn(); } catch (e) {
    lastErrors = [`${new Date().toLocaleTimeString()} ${name}: ${e && e.message}`, ...lastErrors].slice(0, 5);
    try { window.api.log('renderer:error', `${name}: ${e && e.stack}`); } catch {}
    console.error(name, e);
  }
}
function runChecks() {
  safe('endOfDay', checkEndOfDay);
  safe('longRunning', checkLongRunning);
  safe('notRunning', checkNotRunning);
}

// ---------- трей ----------
let lastTrayJson = '';
function pushTray() {
  const r = running();
  const t = r && task(r.taskId), c = t && client(t.clientId);
  const state = {
    running: r ? { taskName: t ? t.name : '—', clientName: c ? c.name : '—', color: c ? c.color : '', away: !!r.idleStart,
                   todayMs: taskDayTotal(r.taskId, todayKey()) } : null,
    recent: recentTasks(6, r && r.taskId).map((x) => ({ id: x.id, label: taskLabel(x) })),
  };
  // перестраиваем только при изменении (минуты, а не секунды); мини-окно досчитывает секунды само от asOf
  state.lang = tr.lang;
  const json = JSON.stringify({ ...state, running: state.running && { ...state.running, todayMs: Math.floor(state.running.todayMs / 60000) } });
  if (json !== lastTrayJson) { lastTrayJson = json; window.api.updateTray({ ...state, asOf: Date.now() }); }
}
function onTrayCommand(cmd) {
  if (cmd.type === 'stop') stopRunning();
  else if (cmd.type === 'start' && cmd.taskId) startTask(cmd.taskId);
  else if (cmd.type === 'newTask') { focusAddTask(); return; }
  save();
  render();
}

// ---------- отрисовка: общее ----------
let currentView = 'day';
function setView(v) {
  currentView = v;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  for (const name of ['day', 'week', 'settings']) $(`view-${name}`).classList.toggle('hidden', name !== v);
  render();
}
function render() {
  renderRunning();
  if (currentView === 'day') renderDay();
  else if (currentView === 'week') renderWeek();
  else renderSettings();
}
function renderRunning() {
  const r = running();
  $('running').classList.toggle('hidden', !r);
  if (!r) { document.title = 'Focusly'; return; }
  const t = task(r.taskId), c = t && client(t.clientId);
  const today = taskDayTotal(r.taskId, todayKey());
  $('runningTime').textContent = fmtDur(today, true);
  $('runningTask').textContent = `${c ? c.name : '—'}: ${t ? t.name : '—'}`;
  $('runningDot').style.background = c ? c.color : '';
  document.title = `▶ ${fmtDur(today)} — ${t ? t.name : ''}`;
}
// лёгкое обновление цифр каждую секунду без перерисовки форм
function tickNumbers() {
  renderRunning();
  const r = running();
  if (currentView === 'day' && r) {
    const row = document.querySelector(`.task[data-id="${r.taskId}"] .task-time`);
    if (row) row.textContent = fmtDur(taskDayTotal(r.taskId, viewDay));
    $('dayTotal').textContent = tr('total', { t: fmtDur(dayTotal(viewDay)) });
    const dur = document.querySelector(`.entry[data-id="${r.id}"] .dur`);
    if (dur) dur.textContent = fmtDur(Date.now() - r.start);
  }
}

// ---------- ДЕНЬ ----------
function renderDay() {
  const isToday = viewDay === todayKey();
  // текущая задача всегда видна в сегодняшнем списке
  const r = running();
  if (r) addToDay(keyOf(r.start), r.taskId);

  $('dayTitle').textContent = dayTitle(viewDay);
  $('dayTotal').textContent = tr('total', { t: fmtDur(dayTotal(viewDay)) });
  $('dayNext').disabled = isToday;
  $('dayNext').style.visibility = isToday ? 'hidden' : 'visible';
  $('dayToday').classList.toggle('hidden', isToday);

  const list = $('taskList');
  list.innerHTML = '';
  const ids = [...dayList(viewDay)].reverse(); // новые задачи — сверху
  $('taskEmpty').classList.toggle('hidden', ids.length > 0);
  for (const id of ids) {
    const t = task(id);
    if (!t) continue;
    const c = client(t.clientId);
    const active = r && r.taskId === id && keyOf(r.start) === viewDay;
    const li = el('li', { class: 'task' + (active ? ' active' : ''), 'data-id': id,
      ondragover: (ev) => { if (dragEntry && dragEntry.fromTaskId !== id) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; li.classList.add('drop-target'); } },
      ondragleave: (ev) => { if (!li.contains(ev.relatedTarget)) li.classList.remove('drop-target'); },
      ondrop: (ev) => { ev.preventDefault(); li.classList.remove('drop-target'); if (dragEntry && dragEntry.fromTaskId !== id) moveEntry(dragEntry.id, id); },
    },
      el('div', { class: 'task-row' },
        el('div', { class: 'task-main', title: tr('clickToEdit'), onclick: () => { expandedTaskId = expandedTaskId === id ? null : id; renderDay(); } },
          el('div', { class: 'task-name' }, t.name),
          el('div', { class: 'task-client' }, el('span', { class: 'dot', style: `background:${c ? c.color : ''}` }), c ? c.name : '—'),
        ),
        el('div', { class: 'task-time' }, fmtDur(taskDayTotal(id, viewDay))),
        isToday ? el('button', { class: 'play', title: active ? tr('stop') : tr('start'), onclick: () => toggleTask(id) }, active ? '■' : '▶') : null,
      ),
    );
    if (expandedTaskId === id) li.append(renderEntriesEditor(id));
    list.append(li);
  }
  renderAddForm();
}

// перенос интервала на другую задачу (перетаскиванием)
let dragEntry = null;
function moveEntry(entryId, toTaskId) {
  const e = data.entries.find((x) => x.id === entryId);
  if (!e || !task(toTaskId)) return;
  e.taskId = toTaskId;
  addToDay(keyOf(e.start), toTaskId);
  if (e.end == null) { e.lastCheck = Date.now(); data.lastClientId = task(toTaskId).clientId; } // идущий таймер теперь считает новую задачу
  expandedTaskId = toTaskId; // раскрываем задачу, куда перенесли, — видно результат
  dragEntry = null;
  document.body.classList.remove('dragging-entry');
  save(); render();
}

function parseTimeOnDay(key, value) {
  if (!/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return startOfKey(key) + (h * 60 + m) * 60000;
}

function renderEntriesEditor(taskId) {
  const box = el('div', { class: 'entries' });
  const err = el('div', { class: 'err' });
  const entries = entriesOf(taskId, viewDay);
  const overlaps = (s, e, selfId) => data.entries.some((x) => x.id !== selfId && x.start < e && entryEnd(x) > s);

  const fail = (msg) => { err.textContent = msg; };

  for (const e of entries) {
    const startIn = el('input', { type: 'time', value: hhmm(e.start) });
    const endIn = e.end == null
      ? el('input', { type: 'time', title: tr('forgotTitle') })
      : el('input', { type: 'time', value: hhmm(e.end) });
    const apply = () => {
      err.textContent = '';
      const s = parseTimeOnDay(viewDay, startIn.value);
      if (s == null) return fail(tr('errStart'));
      let en = null;
      if (e.end != null || endIn.value) {
        en = parseTimeOnDay(viewDay, endIn.value);
        if (en == null) return fail(tr('errEnd'));
        if (en <= s) return fail(tr('errOrder'));
      }
      if ((en ?? Date.now()) > Date.now() + 60000) return fail(tr('errFuture'));
      if (overlaps(s, en ?? Date.now(), e.id)) return fail(tr('errOverlap'));
      e.start = s;
      if (en != null) { e.end = en; if (e.lastCheck) delete e.lastCheck; if (e === running() || !running()) afterStop(); }
      save(); render();
    };
    startIn.addEventListener('change', apply);
    endIn.addEventListener('change', apply);
    // ручка для перетаскивания интервала на другую задачу
    const grip = el('span', { class: 'grip', draggable: 'true', title: tr('dragHint') }, '⠿');
    grip.addEventListener('dragstart', (ev) => {
      dragEntry = { id: e.id, fromTaskId: taskId };
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', e.id);
      ev.dataTransfer.setDragImage(grip.parentElement, 10, 14);
      document.body.classList.add('dragging-entry');
    });
    grip.addEventListener('dragend', () => { dragEntry = null; document.body.classList.remove('dragging-entry'); document.querySelectorAll('.task.drop-target').forEach((x) => x.classList.remove('drop-target')); });
    box.append(el('div', { class: 'entry', 'data-id': e.id },
      grip, startIn, '—', e.end == null ? el('span', { class: 'entry-now' }, endIn) : endIn,
      el('span', { class: 'dur' }, fmtDur(entryEnd(e) - e.start)),
      e.end == null ? el('span', { class: 'small', style: 'color:var(--run)' }, tr('running')) : null,
      el('button', { class: 'ghost', title: tr('deleteInterval'), onclick: () => {
        if (!confirm(tr('confirmDelete', { a: hhmm(e.start), b: e.end ? hhmm(e.end) : tr('now') }))) return;
        if (e.end == null) afterStop();
        data.entries.splice(data.entries.indexOf(e), 1); save(); render();
      } }, '✕'),
    ));
  }
  if (!entries.length) box.append(el('div', { class: 'muted small' }, tr('noIntervals')));

  // ручное добавление интервала
  const ns = el('input', { type: 'time' });
  const ne = el('input', { type: 'time' });
  const addBtn = el('button', { onclick: () => {
    err.textContent = '';
    const s = parseTimeOnDay(viewDay, ns.value), en = parseTimeOnDay(viewDay, ne.value);
    if (s == null || en == null) return fail(tr('errFill'));
    if (en <= s) return fail(tr('errOrder'));
    if (en > Date.now()) return fail(tr('errFuture'));
    if (overlaps(s, en, null)) return fail(tr('errOverlap'));
    data.entries.push({ id: uid(), taskId, start: s, end: en });
    save(); render();
  } }, tr('add'));
  box.append(el('div', { class: 'entry' }, ns, '—', ne, addBtn));

  box.append(err);
  box.append(el('div', { class: 'muted small entries-hint' }, tr('editHint')));
  box.append(el('div', { class: 'entries-actions' },
    el('span', { class: 'spacer' }),
    el('button', { class: 'link', onclick: () => {
      const has = entries.length > 0;
      if (has && !confirm(tr('confirmRemove'))) return;
      if (entries.some((x) => x.end == null)) afterStop();
      data.entries = data.entries.filter((x) => !(x.taskId === taskId && keyOf(x.start) === viewDay));
      data.days[viewDay] = dayList(viewDay).filter((x) => x !== taskId);
      expandedTaskId = null; save(); render();
    } }, tr('removeFromDay')),
    el('button', { class: 'link', title: tr('archiveTaskTitle'), onclick: () => {
      const t = task(taskId); if (!t) return;
      t.archived = true; expandedTaskId = null; save(); render();
    } }, tr('archiveTask')),
  ));
  return box;
}

function renderAddForm() {
  const isToday = viewDay === todayKey();
  $('addStart').classList.toggle('hidden', !isToday);
  $('addOnly').classList.toggle('primary', !isToday);

  const active = data.clients.filter((c) => !c.archived);
  if (!selectedClientId || !client(selectedClientId) || client(selectedClientId).archived) {
    selectedClientId = (client(data.lastClientId) && !client(data.lastClientId).archived) ? data.lastClientId : (active[0] && active[0].id) || null;
  }
  const chips = $('clientChips');
  chips.innerHTML = '';
  for (const c of active) {
    chips.append(el('button', { type: 'button', class: 'chip' + (c.id === selectedClientId ? ' selected' : ''), onclick: () => { selectedClientId = c.id; renderAddForm(); $('taskInput').focus(); } },
      el('span', { class: 'dot', style: `background:${c.color}` }), c.name));
  }
  chips.append(el('button', { type: 'button', class: 'chip add-chip', onclick: () => { $('newClientRow').classList.remove('hidden'); $('newClientInput').focus(); } }, tr('newClient')));

  // подсказки задач выбранного клиента: сначала недавние
  const lastUsed = {};
  for (const e of data.entries) lastUsed[e.taskId] = Math.max(lastUsed[e.taskId] || 0, e.start);
  const clientTasks = data.tasks.filter((t) => t.clientId === selectedClientId && !t.archived).sort((a, b) => (lastUsed[b.id] || 0) - (lastUsed[a.id] || 0));
  const dl = $('taskSuggest');
  dl.innerHTML = '';
  for (const t of clientTasks) dl.append(el('option', { value: t.name }));

  const inDay = new Set(dayList(viewDay));
  const recent = $('recentChips');
  recent.innerHTML = '';
  for (const t of clientTasks.filter((t) => !inDay.has(t.id)).slice(0, 6)) {
    recent.append(el('button', { type: 'button', class: 'chip', title: isToday ? tr('addStart') : tr('addToDay'), onclick: () => {
      addToDay(viewDay, t.id);
      if (isToday) startTask(t.id);
      save(); render();
    } }, (isToday ? '▶ ' : '+ ') + t.name));
  }
  $('taskInput').placeholder = selectedClientId ? tr('taskPlaceholder') : tr('addClientFirst');
  $('taskInput').disabled = !selectedClientId;
}

function submitTask(start) {
  const name = $('taskInput').value.trim();
  if (!name || !selectedClientId) return;
  const t = findOrCreateTask(selectedClientId, name);
  data.lastClientId = selectedClientId;
  addToDay(viewDay, t.id);
  if (start && viewDay === todayKey()) startTask(t.id);
  $('taskInput').value = '';
  save(); render();
  $('taskInput').focus();
}

function saveNewClient() {
  const c = findOrCreateClient($('newClientInput').value);
  $('newClientInput').value = '';
  $('newClientRow').classList.add('hidden');
  if (c) { selectedClientId = c.id; data.lastClientId = c.id; save(); }
  render();
  $('taskInput').focus();
}

// ---------- НЕДЕЛЯ ----------
function weekData() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = startOfKey(days[0]), to = startOfKey(addDays(days[6], 1));
  const rows = {}; // clientId -> {taskId -> [7]}
  const detail = [];
  for (const e of data.entries) {
    if (e.start < from || e.start >= to) continue;
    const t = task(e.taskId);
    if (!t) continue;
    const i = days.indexOf(keyOf(e.start));
    ((rows[t.clientId] ||= {})[t.id] ||= Array(7).fill(0))[i] += entryEnd(e) - e.start;
    detail.push(e);
  }
  return { days, rows, detail: detail.sort((a, b) => a.start - b.start) };
}

function renderWeek() {
  const { days, rows } = weekData();
  const a = new Date(startOfKey(days[0])), b = new Date(startOfKey(days[6]));
  const fmt = (d, o) => d.toLocaleDateString(tr('locale'), o);
  $('weekTitle').textContent = `${fmt(a, { day: 'numeric', month: 'short' })} – ${fmt(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const isThis = weekStart === mondayOf(todayKey());
  $('weekNext').style.visibility = isThis ? 'hidden' : 'visible';
  $('weekThis').classList.toggle('hidden', isThis);
  $('weekMsg').textContent = '';

  const table = $('weekTable');
  table.innerHTML = '';
  const names = tr('weekdays');
  const sum = (arr) => arr.reduce((s, v) => s + v, 0);

  // итоги по дням — чтобы понять, какие колонки показывать
  const totals = Array(7).fill(0);
  for (const cid of Object.keys(rows)) for (const arr of Object.values(rows[cid])) arr.forEach((v, i) => { totals[i] += v; });
  // выходные без записей прячем — таблица помещается в узкое окно
  const vis = days.map((k, i) => i).filter((i) => isWorkDay(startOfKey(days[i])) || totals[i] > 0);
  const pick = (arr) => vis.map((i) => arr[i]);

  const cell = (ms, cls = '') => el('td', { class: cls + (ms ? '' : ' zero') }, ms ? fmtDur(ms) : '–');
  const nameCell = (...kids) => el('td', { class: 'name' }, ...kids);
  const sumCell = (ms) => cell(ms, 'sum');
  table.append(el('tr', {}, el('th', { class: 'name' }, tr('clientTask')),
    vis.map((i) => {
      const k = days[i];
      return el('th', { class: 'day' + (k === todayKey() ? ' today' : ''), title: tr('openDay'), onclick: () => { viewDay = k; setView('day'); } },
        names[i], el('br'), String(new Date(startOfKey(k)).getDate()));
    }),
    el('th', { class: 'sum' }, tr('totalCol'))));

  const clientIds = Object.keys(rows).sort((x, y) => (client(x)?.name || '').localeCompare(client(y)?.name || ''));
  for (const cid of clientIds) {
    const c = client(cid);
    const cSum = Array(7).fill(0);
    for (const arr of Object.values(rows[cid])) arr.forEach((v, i) => { cSum[i] += v; });
    table.append(el('tr', { class: 'client' },
      nameCell(el('span', { class: 'dot', style: `background:${c?.color};margin-right:6px` }), c ? c.name : '—'),
      pick(cSum).map((v) => cell(v)), sumCell(sum(cSum))));
    const tIds = Object.keys(rows[cid]).sort((x, y) => (task(x)?.name || '').localeCompare(task(y)?.name || ''));
    for (const tid of tIds) {
      const arr = rows[cid][tid];
      table.append(el('tr', { class: 'task' }, nameCell(task(tid)?.name || '—'), pick(arr).map((v) => cell(v)), sumCell(sum(arr))));
    }
  }
  table.append(el('tr', { class: 'total' }, nameCell(tr('grandTotal')), pick(totals).map((v) => cell(v)), sumCell(sum(totals))));
  const total = totals.reduce((s, v) => s + v, 0);
  $('weekTotal').textContent = tr('weekTotal', { t: fmtDur(total), h: hoursDec(total) });
  $('weekEmpty').classList.toggle('hidden', clientIds.length > 0);
  table.classList.toggle('hidden', clientIds.length === 0);
}

function weekAsTsv() {
  const { days, rows } = weekData();
  const head = [tr('colClient'), tr('colTask'), ...days.map((k) => k.slice(5).split('-').reverse().join('.')), tr('colTotalHm'), tr('colTotalH')];
  const lines = [head.join('\t')];
  for (const cid of Object.keys(rows)) for (const [tid, arr] of Object.entries(rows[cid])) {
    const sum = arr.reduce((s, v) => s + v, 0);
    lines.push([client(cid)?.name, task(tid)?.name, ...arr.map((v) => (v ? fmtDur(v) : '')), fmtDur(sum), hoursDec(sum)].join('\t'));
  }
  return lines.join('\n');
}
function csvCell(v) { v = String(v ?? ''); return /[";,\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
function weekAsCsv() {
  const { detail } = weekData();
  const sep = tr('csvSep');
  const lines = [[tr('colDate'), tr('colClient'), tr('colTask'), tr('colStart'), tr('colEnd'), tr('colDuration'), tr('colHours')].map(csvCell).join(sep)];
  for (const e of detail) {
    const t = task(e.taskId), c = t && client(t.clientId);
    const d = entryEnd(e) - e.start;
    lines.push([keyOf(e.start), c?.name, t?.name, hhmm(e.start), e.end ? hhmm(e.end) : tr('running'), fmtDur(d), hoursDec(d)].map(csvCell).join(sep));
  }
  return lines.join('\r\n');
}

// ---------- КЛИЕНТЫ И ЗАДАЧИ (архив) ----------
let clExpanded = new Set();
let clShowArchive = false;

function clientStats() {
  const total = {}, last = {};
  for (const e of data.entries) {
    total[e.taskId] = (total[e.taskId] || 0) + (entryEnd(e) - e.start);
    last[e.taskId] = Math.max(last[e.taskId] || 0, e.start);
  }
  return { total, last };
}
function shortDate(ts) {
  return ts ? new Date(ts).toLocaleDateString(tr('locale'), { day: 'numeric', month: 'short' }) : '—';
}

function renderClients() {
  const q = $('clSearch').value.trim().toLowerCase();
  const { total, last } = clientStats();
  const match = (str) => !q || str.toLowerCase().includes(q);

  // клиенты сортируем по последней активности, свежие сверху
  const cLast = (c) => Math.max(0, ...data.tasks.filter((t) => t.clientId === c.id).map((t) => last[t.id] || 0));
  const sorted = [...data.clients].sort((a, b) => cLast(b) - cLast(a) || a.name.localeCompare(b.name));

  const renderClient = (c) => {
    const tasks = data.tasks.filter((t) => t.clientId === c.id)
      .sort((a, b) => (last[b.id] || 0) - (last[a.id] || 0));
    const taskHit = q && tasks.some((t) => match(t.name));
    if (q && !match(c.name) && !taskHit) return null;
    const open = clExpanded.has(c.id) || taskHit;
    const sum = tasks.reduce((s, t) => s + (total[t.id] || 0), 0);
    const activeTasks = tasks.filter((t) => !t.archived);
    const archTasks = tasks.filter((t) => t.archived);

    const head = el('div', { class: 'cl-head', onclick: () => { clExpanded.has(c.id) ? clExpanded.delete(c.id) : clExpanded.add(c.id); renderClients(); } },
      el('span', { class: 'caret' }, open ? '▾' : '▸'),
      el('span', { class: 'dot', style: `background:${c.color}` }),
      el('span', { class: 'cl-title' }, c.name),
      el('span', { class: 'cl-meta' }, `${tr(activeTasks.length === 1 ? 'tasks1' : 'tasksN', { n: activeTasks.length })} · ${fmtDur(sum)}`),
      el('span', { class: 'cl-actions' },
        el('button', { class: 'small-btn', onclick: (e) => { e.stopPropagation(); c.archived = !c.archived; save(); render(); } },
          c.archived ? tr('restore') : tr('archive')),
        delButton((e) => { e.stopPropagation(); deleteClient(c.id); })),
    );
    const li = el('li', { class: 'cl-item' }, head);
    if (open) {
      const body = el('div', { class: 'cl-tasks' });
      const nameIn = el('input', { class: 'cl-name', value: c.name, maxlength: 60, title: tr('renameTitle') });
      nameIn.addEventListener('change', () => { const v = nameIn.value.trim(); if (v) { c.name = v; save(); renderClients(); } else nameIn.value = c.name; });
      body.append(el('div', { class: 'cl-rename' }, el('span', { class: 'muted small' }, tr('clientNameLabel')), nameIn));
      const taskRow = (t) => {
        if (q && !match(t.name) && !match(c.name)) return null;
        const tin = el('input', { value: t.name, maxlength: 120, title: tr('renameTitle') });
        tin.addEventListener('change', () => { const v = tin.value.trim(); if (v) { t.name = v; save(); } else tin.value = t.name; });
        return el('div', { class: 'cl-task' + (t.archived ? ' is-archived' : '') },
          tin,
          el('span', { class: 'cl-meta', title: tr('lastUsedTitle') }, `${fmtDur(total[t.id] || 0)} · ${shortDate(last[t.id])}`),
          el('span', { class: 'cl-actions' },
            el('button', { class: 'small-btn', onclick: () => { t.archived = !t.archived; save(); render(); } }, t.archived ? tr('restore') : tr('archive')),
            delButton(() => deleteTask(t.id))),
        );
      };
      if (!activeTasks.length) body.append(el('div', { class: 'muted small' }, tr('noActiveTasks')));
      activeTasks.forEach((t) => { const r = taskRow(t); if (r) body.append(r); });
      if (archTasks.length) {
        body.append(el('div', { class: 'cl-sub muted small' }, tr('archivedTasks', { n: archTasks.length })));
        archTasks.forEach((t) => { const r = taskRow(t); if (r) body.append(r); });
      }
      li.append(body);
    }
    return li;
  };

  const act = $('clActive'), arch = $('clArchived');
  act.innerHTML = ''; arch.innerHTML = '';
  const activeClients = sorted.filter((c) => !c.archived);
  const archClients = sorted.filter((c) => c.archived);
  let shown = 0;
  for (const c of activeClients) { const li = renderClient(c); if (li) { act.append(li); shown++; } }
  // при поиске архив раскрываем, чтобы находилось и там
  const showArch = clShowArchive || !!q;
  let archShown = 0;
  if (showArch) for (const c of archClients) { const li = renderClient(c); if (li) { arch.append(li); archShown++; } }
  if (!shown && !(q && archShown)) act.append(el('li', { class: 'muted small empty' }, q ? tr('noMatches') : tr('noClients')));
  $('clArchiveToggle').textContent = `${showArch ? '▾' : '▸'} ${tr('archiveSection', { n: archClients.length })}`;
  $('clArchiveToggle').classList.toggle('hidden', !archClients.length || (q && !archShown));
  arch.classList.toggle('hidden', !showArch);
}

let updStatus = { state: 'idle' };
let appVersion = '';
function renderUpdate() {
  $('appVersion').textContent = appVersion ? tr('version', { v: appVersion }) : '';
  const st = updStatus.state;
  const text = {
    dev: tr('updDev'), checking: tr('updChecking'), none: tr('updNone'),
    available: tr('updAvailable', { v: updStatus.version || '' }),
    downloaded: tr('updDownloaded', { v: updStatus.version || '' }),
    manual: tr('updManual', { v: updStatus.version || '' }),
    error: tr('updError'),
  }[st] || '';
  $('updStatus').textContent = text;
  $('updCheck').classList.toggle('hidden', st === 'dev' || st === 'downloaded');
  $('updCheck').disabled = st === 'checking' || st === 'available';
  $('updInstall').classList.toggle('hidden', st !== 'downloaded');
  $('updDownload').classList.toggle('hidden', st !== 'manual');
  // точка на ⚙ — есть обновление
  document.querySelector('.tabs [data-view=settings]').classList.toggle('has-update', st === 'downloaded' || st === 'manual');
}

// почему «таймер не запущен» сейчас не показывается — для диагностики
function reminderBlockers() {
  const s = data.settings, b = [], now = Date.now();
  if (!s.notRunningOn) b.push('notRunningOff');
  if (!isWorkDay()) b.push('dayOff');
  if (running()) b.push('timerRunning');
  if (away) b.push('away(' + Math.round((now - away.start) / 1000) + 's)');
  if (popupKind) b.push('popupOpen:' + popupKind);
  if (!activeSince) b.push('notActive');
  if (now < notRunningSnoozeUntil) b.push('snoozed(' + Math.round((notRunningSnoozeUntil - now) / 1000) + 's)');
  if (activeSince && now - activeSince < s.notRunningMinutes * 60000) b.push('waiting(' + Math.round((s.notRunningMinutes * 60000 - (now - activeSince)) / 1000) + 's)');
  return b;
}
async function diagnostics() {
  const s = data.settings, r = running(), now = Date.now();
  const pick = (keys) => Object.fromEntries(keys.map((k) => [k, s[k]]));
  return JSON.stringify({
    main: await window.api.diagMain(),
    time: new Date().toString(),
    settings: pick(['remindersOn', 'reminderMinutes', 'notRunningOn', 'notRunningMinutes', 'eodOn', 'eodTime', 'workDays', 'idleOn', 'idleMinutes', 'lockPause', 'sound', 'systemNotify', 'lang']),
    state: {
      popupKind, away: away ? { sec: Math.round((now - away.start) / 1000), reason: away.reason, resumed: away.resumed } : null,
      activeSinceSec: activeSince ? Math.round((now - activeSince) / 1000) : null,
      snoozeSec: Math.max(0, Math.round((notRunningSnoozeUntil - now) / 1000)),
      running: r ? { sec: Math.round((now - r.start) / 1000), idleStart: !!r.idleStart, lastCheckSec: r.lastCheck ? Math.round((now - r.lastCheck) / 1000) : null } : null,
      workDay: isWorkDay(), weekday: new Date().getDay(), eodShownDay: data.eodShownDay, eodSnoozeSec: eodSnoozeUntil ? Math.round((eodSnoozeUntil - now) / 1000) : 0,
    },
    idle: { ticks: idleTicks, lastSec: lastIdleSec, lastAgoSec: lastIdleAt ? Math.round((now - lastIdleAt) / 1000) : null },
    blockers: reminderBlockers(),
    errors: lastErrors,
    counts: { clients: data.clients.length, tasks: data.tasks.length, entries: data.entries.length },
  }, null, 1);
}

function renderWorkDays() {
  const box = $('workDays');
  box.innerHTML = '';
  const order = [1, 2, 3, 4, 5, 6, 0]; // с понедельника
  const names = tr('weekdays');
  order.forEach((d, i) => {
    const on = data.settings.workDays.includes(d);
    box.append(el('button', { class: 'chip' + (on ? ' selected' : ''), onclick: () => {
      const set = new Set(data.settings.workDays);
      on ? set.delete(d) : set.add(d);
      data.settings.workDays = [...set].sort();
      if (!isWorkDay() && (popupKind === 'notRunning' || popupKind === 'endOfDay')) closePopup();
      save(); renderWorkDays();
    } }, names[i]));
  });
}

// кнопка удаления: красный минус в кружке, подпись — во всплывающей подсказке
function delButton(onclick) {
  const b = el('button', { class: 'del-btn', title: tr('delete'), 'aria-label': tr('delete'), onclick });
  b.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 10h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  return b;
}

// удаление — необратимо, поэтому с подтверждением и с суммой времени, которое пропадёт
function trackedMs(taskIds) {
  const set = new Set(taskIds);
  return data.entries.filter((e) => set.has(e.taskId)).reduce((s, e) => s + (entryEnd(e) - e.start), 0);
}
function removeTasks(taskIds) {
  const set = new Set(taskIds);
  const r = running();
  data.entries = data.entries.filter((e) => !set.has(e.taskId));
  data.tasks = data.tasks.filter((t) => !set.has(t.id));
  for (const k of Object.keys(data.days)) data.days[k] = data.days[k].filter((id) => !set.has(id));
  if (r && set.has(r.taskId)) afterStop();
  if (set.has(expandedTaskId)) expandedTaskId = null;
}
function deleteTask(id) {
  const t = task(id); if (!t) return;
  const ms = trackedMs([id]);
  const msg = ms ? tr('delTaskConfirm', { name: t.name, t: fmtDur(ms) }) : tr('delTaskEmpty', { name: t.name });
  if (!confirm(msg)) return;
  removeTasks([id]);
  save(); render();
}
function deleteClient(id) {
  const c = client(id); if (!c) return;
  const ids = data.tasks.filter((t) => t.clientId === id).map((t) => t.id);
  const ms = trackedMs(ids);
  const msg = ms ? tr('delClientConfirm', { name: c.name, n: ids.length, t: fmtDur(ms) }) : tr('delClientEmpty', { name: c.name });
  if (!confirm(msg)) return;
  removeTasks(ids);
  data.clients = data.clients.filter((x) => x.id !== id);
  if (selectedClientId === id) selectedClientId = null;
  if (data.lastClientId === id) data.lastClientId = null;
  clExpanded.delete(id);
  save(); render();
}

function saveNewClientFromList() {
  const c = findOrCreateClient($('clNewInput').value);
  $('clNewInput').value = '';
  $('clNewRow').classList.add('hidden');
  if (c) { save(); render(); }
}

// ---------- НАСТРОЙКИ ----------
function setLang(lang) {
  data.settings.lang = lang;
  tr = I18N.makeT(lang);
  I18N.applyDom(tr);
  lastTrayJson = ''; // перестроить меню трея и мини-окно на новом языке
  save();
  render();
  pushTray();
}

async function renderSettings() {
  const sw = $('langSwitch');
  sw.innerHTML = '';
  for (const [code, name] of I18N.languages) {
    sw.append(el('button', { class: 'chip' + (tr.lang === code ? ' selected' : ''), onclick: () => setLang(code) }, name));
  }
  document.querySelectorAll('[data-s]').forEach((inp) => {
    const v = data.settings[inp.dataset.s];
    if (inp.type === 'checkbox') inp.checked = !!v; else inp.value = v;
  });
  $('autostart').checked = await window.api.getAutostart();
  renderWorkDays();
  renderClients();
  renderUpdate();
  $('dataPath').textContent = await window.api.dataPath();
}

// ---------- события ----------
function bind() {
  document.querySelectorAll('.tabs button[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('miniBtn').addEventListener('click', () => window.api.setMini(true, 'mini-button'));
  $('runningStop').addEventListener('click', () => { window.api.log('timer:stop', 'running-card'); stopRunning(); save(); render(); });
  $('runningTask').parentElement.addEventListener('click', () => { const r = running(); if (r) { viewDay = keyOf(r.start); setView('day'); } });

  $('dayPrev').addEventListener('click', () => { viewDay = addDays(viewDay, -1); expandedTaskId = null; render(); });
  $('dayNext').addEventListener('click', () => { if (viewDay < todayKey()) { viewDay = addDays(viewDay, 1); expandedTaskId = null; render(); } });
  $('dayToday').addEventListener('click', () => { viewDay = todayKey(); expandedTaskId = null; render(); });

  $('addForm').addEventListener('submit', (e) => { e.preventDefault(); submitTask(viewDay === todayKey()); });
  $('addOnly').addEventListener('click', () => submitTask(false));
  $('newClientSave').addEventListener('click', saveNewClient);
  $('newClientCancel').addEventListener('click', () => { $('newClientRow').classList.add('hidden'); $('newClientInput').value = ''; });
  $('newClientInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveNewClient(); }
    if (e.key === 'Escape') $('newClientCancel').click();
  });

  $('weekPrev').addEventListener('click', () => { weekStart = addDays(weekStart, -7); render(); });
  $('weekNext').addEventListener('click', () => { weekStart = addDays(weekStart, 7); render(); });
  $('weekThis').addEventListener('click', () => { weekStart = mondayOf(todayKey()); render(); });
  $('weekCopy').addEventListener('click', async () => { await window.api.copy(weekAsTsv()); $('weekMsg').textContent = tr('copied'); });
  $('weekCsv').addEventListener('click', async () => {
    const p = await window.api.exportCsv(`timesheet_${weekStart}.csv`, weekAsCsv());
    $('weekMsg').textContent = p ? tr('savedTo', { p }) : '';
  });

  // настройки: чекбоксы, числа и время с атрибутом data-s
  // настройки сохраняются сразу при вводе (не нужно кликать мимо поля); неверное значение откатывается при уходе из поля
  const onSetting = (inp, evt) => {
    const key = inp.dataset.s;
    if (inp.type === 'checkbox') data.settings[key] = inp.checked;
    else if (inp.type === 'number') {
      const v = Math.round(Number(inp.value));
      if (inp.value !== '' && v >= Number(inp.min) && v <= Number(inp.max)) data.settings[key] = v;
      else if (evt.type === 'change') inp.value = data.settings[key];
      else return;
    } else if (inp.type === 'time') {
      if (/^\d{1,2}:\d{2}$/.test(inp.value)) { data.settings[key] = inp.value; data.eodShownDay = null; }
      else if (evt.type === 'change') inp.value = data.settings[key];
      else return;
    }
    if (!data.settings.remindersOn && popupKind === 'reminder') closePopup();
    if (!data.settings.notRunningOn && popupKind === 'notRunning') closePopup();
    if (key === 'notRunningMinutes' || key === 'notRunningOn') notRunningSnoozeUntil = 0; // новые настройки — сразу в силе
    save();
  };
  document.querySelectorAll('[data-s]').forEach((inp) => {
    inp.addEventListener('change', (e) => onSetting(inp, e));
    if (inp.type !== 'checkbox') inp.addEventListener('input', (e) => onSetting(inp, e));
  });
  $('autostart').addEventListener('change', () => window.api.setAutostart($('autostart').checked));
  $('testPopup').addEventListener('click', () => {
    closePopup(); // если какое-то окно «зависло» — закрываем и показываем тестовое
    openPopup('notRunning', { title: tr('pTestTitle'), body: tr('pTestBody'), activeMs: 5 * 60000, lastTask: null });
  });
  $('clSearch').addEventListener('input', renderClients);
  $('clAdd').addEventListener('click', () => { $('clNewRow').classList.remove('hidden'); $('clNewInput').focus(); });
  $('clNewSave').addEventListener('click', saveNewClientFromList);
  $('clNewCancel').addEventListener('click', () => { $('clNewRow').classList.add('hidden'); $('clNewInput').value = ''; });
  $('clNewInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveNewClientFromList(); }
    if (e.key === 'Escape') $('clNewCancel').click();
  });
  $('clArchiveToggle').addEventListener('click', () => { clShowArchive = !clShowArchive; renderClients(); });
  $('updCheck').addEventListener('click', async () => { updStatus = await window.api.checkUpdate(); renderUpdate(); });
  $('updInstall').addEventListener('click', () => window.api.installUpdate());
  $('updDownload').addEventListener('click', () => window.api.openReleases());
  $('diagCopy').addEventListener('click', async () => { await window.api.copy(await diagnostics()); $('diagMsg').textContent = tr('diagCopied'); });
  window.api.onUpdateStatus((st) => { updStatus = st; renderUpdate(); });
  $('openFolder').addEventListener('click', () => window.api.openDataFolder());

  // горячие клавиши: Ctrl+N — новая задача, Ctrl+M — мини-режим, Ctrl+. — стоп
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); viewDay = todayKey(); setView('day'); $('taskInput').focus(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') { e.preventDefault(); window.api.setMini(true, 'ctrl+m'); }
    if ((e.ctrlKey || e.metaKey) && e.key === '.') { e.preventDefault(); stopRunning(); save(); render(); }
  });

  window.api.onPopupAnswer(onPopupAnswer);
  window.api.onPopupClosed(() => { popupKind = null; });
  window.api.onCommand(onTrayCommand);
  window.api.onIdle(onIdleSeconds);
  window.api.onLock(() => { if (data.settings.lockPause) beginAway(Date.now(), 'lock'); });
  window.api.onUnlock(() => endAway(Date.now()));
  window.api.onSuspend(() => beginAway(Date.now(), 'sleep'));
  // после сна ждём реального движения мыши/клавиатуры — его поймает onIdleSeconds
  window.api.onResume(() => { if (away && away.reason === 'sleep') away.resumed = true; });
}

// ---------- старт ----------
async function init() {
  data = (await window.api.load()) || emptyData();
  const base = emptyData();
  data.settings = { ...base.settings, ...(data.settings || {}) };
  tr = I18N.makeT(data.settings.lang);
  I18N.applyDom(tr);
  for (const k of ['clients', 'tasks', 'entries']) data[k] ||= [];
  data.days ||= {};
  if (splitAtMidnight()) save();
  appVersion = await window.api.getVersion();
  updStatus = await window.api.getUpdateStatus();
  bind();
  setView('day');
  renderUpdate();

  // приложение было закрыто/компьютер выключен, а таймер шёл — спросим, что делать с этим временем
  const r = running();
  const gap = data.lastSeen ? Date.now() - data.lastSeen : 0;
  if (r && (r.idleStart || gap > data.settings.idleMinutes * 60000)) {
    if (!r.idleStart) r.idleStart = Math.max(r.start, data.lastSeen);
    r.awayEnd = Date.now();
    showIdlePopup();
  }
  data.lastSeen = Date.now();
  save();
  let beat = 0;

  setInterval(() => {
    // смена дня: если смотрели «сегодня», переключаемся на новый (пустой) день
    const t = todayKey();
    if (t !== lastSeenToday) {
      const wasToday = viewDay === lastSeenToday;
      lastSeenToday = t;
      splitAtMidnight();
      save();
      if (wasToday) { viewDay = t; expandedTaskId = null; }
      if (weekStart === mondayOf(addDays(t, -1)) && mondayOf(t) !== weekStart) weekStart = mondayOf(t);
      render();
    }
    safe('tick', tickNumbers);
    safe('tray', pushTray);
    if (++beat % 60 === 0) { data.lastSeen = Date.now(); save(); }
    if (beat % 5 === 0) runChecks();
  }, 1000);
}
init();
