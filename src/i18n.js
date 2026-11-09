// Переводы интерфейса (RU / EN). Используется и в окнах, и в главном процессе (трей, уведомления).
(function (root) {
  const dict = {
    en: {
      locale: 'en-GB', decimal: '.', csvSep: ',',
      // вкладки и шапка
      tabClients: 'Clients', searchPh: 'Search clients and tasks…', addClient: '+ Client',
      tasksN: '{n} tasks', tasks1: '1 task', clientNameLabel: 'Name', archive: 'Hide', archiveSection: 'Hidden ({n})', archivedTasks: 'Hidden tasks ({n})',
      noActiveTasks: 'No active tasks', noMatches: 'Nothing found', renameTitle: 'Click to rename',
      lastUsedTitle: 'Total time · last used', archiveTask: 'Hide task', archiveTaskTitle: 'Hide this task from quick pick (history is kept)',
      sAbout: 'About', version: 'v{v}', updCheck: 'Check for updates', updChecking: 'Checking for updates…',
      updNone: 'You have the latest version', updAvailable: 'Downloading version {v}…', updDownloaded: 'Version {v} is ready to install',
      updInstall: 'Restart and update', updError: 'Could not check for updates (no internet?)', updDev: 'Updates work in the installed version',
      updRestart: 'Restart now', updLater: 'Later', updReady: 'Focusly {v} is ready to install',
      updDetail: 'The app will restart. Your data stays in place. If you choose “Later”, the update installs the next time you quit.',
      tabDay: 'Day', tabWeek: 'Week', mini: '▭ Mini', miniTitle: 'Mini mode: one line on top of all windows (Ctrl+M)', settings: 'Settings',
      stop: 'Stop', start: 'Start',
      // день
      today: 'Today', yesterday: 'Yesterday', prevDay: 'Previous day', nextDay: 'Next day',
      total: 'Total: {t}', noTasks: 'No tasks yet — add the first one below',
      clickToEdit: 'Click to edit time', newClient: '+ client', clientName: 'Client name',
      taskPlaceholder: 'Task name…', addClientFirst: 'Add a client first',
      addStart: 'Add and start (Enter)', addOnly: 'Just add to the list', addToDay: 'Add to day',
      // интервалы
      forgotTitle: 'Forgot to stop? Enter when you finished — the timer will stop at that time',
      running: 'running', deleteInterval: 'Delete interval', now: 'now',
      confirmDelete: 'Delete interval {a}–{b}?', noIntervals: 'No intervals', add: 'Add',
      editHint: 'Edit the time right in the fields', removeFromDay: 'Remove from day',
      confirmRemove: 'Remove the task from this day? All its intervals for the day will be deleted.',
      errStart: 'Invalid start time', errEnd: 'Invalid end time', errOrder: 'End must be after start',
      errFuture: 'Time cannot be in the future', errOverlap: 'Overlaps another interval', errFill: 'Fill in start and end',
      // неделя
      thisWeek: 'This week', clientTask: 'Client / task', totalCol: 'Total', grandTotal: 'Total', openDay: 'Open day',
      weekTotal: 'Total: {t} ({h} h)', noWeek: 'No entries this week',
      copyTable: 'Copy table', exportCsv: 'Export CSV (detailed)',
      copied: 'Copied — paste into Google Sheets or Excel', savedTo: 'Saved: {p}',
      weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      colClient: 'Client', colTask: 'Task', colTotalHm: 'Total (h:mm)', colTotalH: 'Total (hours)',
      colDate: 'Date', colStart: 'Start', colEnd: 'End', colDuration: 'Duration', colHours: 'Hours',
      // настройки
      sLanguage: 'Language',
      sReminders: 'Reminders', sAskEvery: 'Ask “still on it?” every', min: 'min',
      sNotRunning: 'Remind if the timer is not running after', sNotRunningTail: 'min of work',
      sEod: 'End of workday at',
      sWorkDays: 'Work days:', sWorkDaysHint: 'On days off there are no “timer not running” and “end of workday” reminders.',
      sAutopause: 'Auto-pause', sIdle: 'Pause if no mouse or keyboard for', sLock: 'Pause immediately when the screen is locked (Win+L)',
      sNotifications: 'Notifications', sSound: 'Sound', sSystem: 'Windows system notifications', sTest: 'Test reminder',
      sApp: 'App', sAutostart: 'Start on login (in tray)',
      sClients: 'Clients', noClients: 'No clients yet', hide: 'Hide', restore: 'Show',
      hideTitle: 'Hide from quick pick (history is kept)', restoreTitle: 'Back to the list',
      sData: 'Data', openFolder: 'Open data folder',
      // всплывающие окна
      pReminderTitle: 'Still on it?', pRunningFor: 'Timer running for {d}', pContinue: 'Continue', pSwitch: 'Switch',
      pStopAt: 'I stepped away — stop at {t}',
      pAwayTitle: 'You were away for {d}', pWhatToDo: 'What should happen to this time?',
      pDiscardContinue: 'Discard & continue', pDiscardStop: 'Discard & stop', pKeep: 'Keep — I was working',
      pAssignTo: 'Log this time to…', pAssign: 'Log',
      pNotRunningTitle: 'Timer is not running', pNotRunningBody: 'You are working, but time is not being tracked',
      pActiveFor: 'You’ve been at the computer for {d}, but time isn’t being tracked.',
      pChoose: 'Choose task', pLater: 'Later',
      pEodTitle: 'End of workday', pTodayWorked: 'Worked today: {d}', pTodayShort: 'Today: {t}',
      pStillRunning: 'Timer still running: {t}', pStop: 'Stop', pMore30: '+30 min', pOpen: 'Open',
      pGoodEvening: 'Have a nice evening!', pOpenReport: 'Open report', pOk: 'OK',
      pTestTitle: 'This is how a reminder looks', pTestBody: 'Sound and notification check',
      h: 'h', m: 'min', close: 'Close',
      // мини
      miniIdle: 'Timer stopped · pick a task', miniPick: 'Click to switch task', miniStartLast: 'Start: {t}', miniPickTitle: 'Pick a task', miniExpand: 'Full window',
      // трей и меню
      trayIdle: 'Focusly — timer not running', trayNotRunning: 'Timer not running', trayStart: 'Start:',
      trayMini: 'Mini mode (on top)', trayOpen: 'Open window', trayQuit: 'Quit',
      menuSwitchTo: 'Switch to:', menuNewTask: 'New task…', menuFull: 'Open full window',
      bgTitle: 'Focusly keeps running', bgBody: 'Its icon is next to the clock on the taskbar. Right-click it to quit.',
      saveCsv: 'CSV',
    },
    ru: {
      locale: 'ru-RU', decimal: ',', csvSep: ';',
      tabClients: 'Клиенты', searchPh: 'Поиск клиентов и задач…', addClient: '+ Клиент',
      tasksN: 'задач: {n}', tasks1: 'задач: 1', clientNameLabel: 'Название', archive: 'Скрыть', archiveSection: 'Скрытые ({n})', archivedTasks: 'Скрытые задачи ({n})',
      noActiveTasks: 'Нет активных задач', noMatches: 'Ничего не найдено', renameTitle: 'Нажми, чтобы переименовать',
      lastUsedTitle: 'Всего времени · последний раз', archiveTask: 'Скрыть задачу', archiveTaskTitle: 'Убрать задачу из быстрого выбора (история сохранится)',
      sAbout: 'О приложении', version: 'v{v}', updCheck: 'Проверить обновления', updChecking: 'Проверяю обновления…',
      updNone: 'Установлена последняя версия', updAvailable: 'Скачиваю версию {v}…', updDownloaded: 'Версия {v} готова к установке',
      updInstall: 'Перезапустить и обновить', updError: 'Не удалось проверить обновления (нет интернета?)', updDev: 'Обновления работают в установленной версии',
      updRestart: 'Перезапустить', updLater: 'Позже', updReady: 'Focusly {v} готов к установке',
      updDetail: 'Приложение перезапустится, данные останутся на месте. Если выбрать «Позже», обновление установится при следующем выходе.',
      tabDay: 'День', tabWeek: 'Неделя', mini: '▭ Мини', miniTitle: 'Мини-режим: одна строка поверх всех окон (Ctrl+M)', settings: 'Настройки',
      stop: 'Стоп', start: 'Старт',
      today: 'Сегодня', yesterday: 'Вчера', prevDay: 'Предыдущий день', nextDay: 'Следующий день',
      total: 'Итого: {t}', noTasks: 'Задач пока нет — добавь первую ниже',
      clickToEdit: 'Нажми, чтобы поправить время', newClient: '+ клиент', clientName: 'Название клиента',
      taskPlaceholder: 'Название задачи…', addClientFirst: 'Сначала добавь клиента',
      addStart: 'Добавить и запустить (Enter)', addOnly: 'Только добавить в список', addToDay: 'Добавить в день',
      forgotTitle: 'Таймер остался включён? Укажи время окончания — он остановится на нём',
      running: 'идёт', deleteInterval: 'Удалить интервал', now: 'сейчас',
      confirmDelete: 'Удалить интервал {a}–{b}?', noIntervals: 'Интервалов нет', add: 'Добавить',
      editHint: 'Время можно поправить прямо в полях', removeFromDay: 'Убрать из дня',
      confirmRemove: 'Убрать задачу из этого дня? Все её интервалы за день будут удалены.',
      errStart: 'Неверное время начала', errEnd: 'Неверное время окончания', errOrder: 'Окончание должно быть позже начала',
      errFuture: 'Время не может быть в будущем', errOverlap: 'Пересекается с другим интервалом', errFill: 'Заполни начало и окончание',
      thisWeek: 'Эта неделя', clientTask: 'Клиент / задача', totalCol: 'Итого', grandTotal: 'Всего', openDay: 'Открыть день',
      weekTotal: 'Итого: {t} ({h} ч)', noWeek: 'За эту неделю записей нет',
      copyTable: 'Копировать таблицу', exportCsv: 'Экспорт CSV (подробно)',
      copied: 'Скопировано — вставь в Google Sheets или Excel', savedTo: 'Сохранено: {p}',
      weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
      colClient: 'Клиент', colTask: 'Задача', colTotalHm: 'Итого (ч:мм)', colTotalH: 'Итого (часы)',
      colDate: 'Дата', colStart: 'Начало', colEnd: 'Конец', colDuration: 'Длительность', colHours: 'Часы',
      sLanguage: 'Язык',
      sReminders: 'Напоминания', sAskEvery: 'Спрашивать «продолжаем?» каждые', min: 'мин',
      sNotRunning: 'Напоминать, если таймер не запущен, через', sNotRunningTail: 'мин работы',
      sEod: 'Конец рабочего дня в',
      sWorkDays: 'Рабочие дни:', sWorkDaysHint: 'В выходные не будет напоминаний «таймер не запущен» и «конец рабочего дня».',
      sAutopause: 'Автопауза', sIdle: 'Пауза, если нет мыши и клавиатуры', sLock: 'Пауза сразу при блокировке экрана (Win+L)',
      sNotifications: 'Уведомления', sSound: 'Звуковой сигнал', sSystem: 'Системные уведомления Windows', sTest: 'Проверить напоминание',
      sApp: 'Приложение', sAutostart: 'Запускать при входе в систему (в трее)',
      sClients: 'Клиенты', noClients: 'Клиентов пока нет', hide: 'Скрыть', restore: 'Показать',
      hideTitle: 'Скрыть из быстрого выбора (история сохранится)', restoreTitle: 'Вернуть в список',
      sData: 'Данные', openFolder: 'Открыть папку с данными',
      pReminderTitle: 'Продолжаем?', pRunningFor: 'Таймер идёт уже {d}', pContinue: 'Продолжаем', pSwitch: 'Сменить',
      pStopAt: 'Меня не было — остановить в {t}',
      pAwayTitle: 'Тебя не было {d}', pWhatToDo: 'Что сделать с этим временем?',
      pDiscardContinue: 'Убрать и продолжить', pDiscardStop: 'Убрать и стоп', pKeep: 'Оставить — время рабочее',
      pAssignTo: 'Записать это время на…', pAssign: 'Записать',
      pNotRunningTitle: 'Таймер не запущен', pNotRunningBody: 'Ты работаешь, а время не считается',
      pActiveFor: 'Ты за компьютером уже {d}, а время не считается.',
      pChoose: 'Выбрать задачу', pLater: 'Позже',
      pEodTitle: 'Конец рабочего дня', pTodayWorked: 'Сегодня отработано: {d}', pTodayShort: 'Сегодня: {t}',
      pStillRunning: 'Таймер ещё идёт: {t}', pStop: 'Остановить', pMore30: 'Ещё 30 мин', pOpen: 'Открыть',
      pGoodEvening: 'Хорошего вечера!', pOpenReport: 'Открыть отчёт', pOk: 'OK',
      pTestTitle: 'Так выглядит напоминание', pTestBody: 'Проверка звука и уведомления',
      h: 'ч', m: 'мин', close: 'Закрыть',
      miniIdle: 'Таймер стоит · выбрать задачу', miniPick: 'Нажми, чтобы переключить задачу', miniStartLast: 'Запустить: {t}', miniPickTitle: 'Выбрать задачу', miniExpand: 'Полное окно',
      trayIdle: 'Focusly — таймер не запущен', trayNotRunning: 'Таймер не запущен', trayStart: 'Запустить:',
      trayMini: 'Мини-режим (поверх окон)', trayOpen: 'Открыть окно', trayQuit: 'Выход',
      menuSwitchTo: 'Переключиться на:', menuNewTask: 'Новая задача…', menuFull: 'Открыть полное окно',
      bgTitle: 'Focusly работает в фоне', bgBody: 'Иконка — у часов на панели задач. Выход — правый клик по ней.',
      saveCsv: 'CSV',
    },
  };

  function makeT(lang) {
    const d = dict[lang] || dict.en;
    const t = (key, params) => {
      let s = d[key] ?? dict.en[key] ?? key;
      if (params && typeof s === 'string') for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(v);
      return s;
    };
    t.lang = dict[lang] ? lang : 'en';
    return t;
  }
  // «45 min» / «1 h 05 min»
  function durWords(t, ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(m / 60);
    return h ? `${h} ${t('h')} ${String(m % 60).padStart(2, '0')} ${t('m')}` : `${m} ${t('m')}`;
  }
  // проставить тексты в разметке: data-i18n (текст), data-i18n-title, data-i18n-ph (placeholder)
  function applyDom(t, rootEl) {
    const r = rootEl || document;
    r.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
    r.querySelectorAll('[data-i18n-title]').forEach((e) => { e.title = t(e.dataset.i18nTitle); });
    r.querySelectorAll('[data-i18n-ph]').forEach((e) => { e.placeholder = t(e.dataset.i18nPh); });
    if (r.documentElement) r.documentElement.lang = t.lang;
  }

  const api = { makeT, durWords, applyDom, languages: [['en', 'English'], ['ru', 'Русский']] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.I18N = api;
})(typeof window !== 'undefined' ? window : globalThis);
