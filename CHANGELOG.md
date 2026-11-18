# Changelog

All notable changes to Focusly. The newest version is at the top.

## 1.0.15

**Fixed**
- Auto-pause missed long breaks when the laptop lid was closed: Windows reports "sleep", "lock" and "wake" almost at once,
  and waking up was mistaken for you coming back. A locked screen now always counts as being away until you unlock it,
  and waking up no longer counts as coming back — only real mouse or keyboard input afterwards does.
- Focusly now also notices when the computer slept without sending any signal (a gap in time) and asks about it.
- "Timer is not running" no longer appears after the end of your workday.
- Switching between the mini bar and the full window is instant and smooth.

**Changed**
- One stable Focusly button on the taskbar: in mini mode the window is minimized there, and clicking the button expands it.
- The close button (✕) now quits Focusly. If a timer is running, it asks: stop the timer and quit,
  quit and keep the timer running, or cancel. Minimize (–) keeps it on the taskbar.
- More detailed event log for diagnostics (when Focusly decided you were away or back, and why).

## 1.0.14

- Mini bar and window follow a "half of the screen" rule: in the lower half the window grows upwards and collapses back
  to the bottom edge, in the upper half the other way round.
- Reminders in mini mode: "Choose task" / "Switch" expand the window in place (no duplicate) and collapse back once a task starts.
- Screen lock or sleep shorter than the away threshold (10 min by default) counts as work.

## 1.0.13

- Focusly always has a taskbar icon, including in mini mode.
- Window and mini bar stay in place when switching between them.
- Event log in diagnostics; the window reloads itself if it ever crashes.

## 1.0.12

- Auto-pause on screen lock and sleep now works (previously it was cancelled a few seconds after Win+L).

## 1.0.11

- Drag a time interval (⠿) onto another task to move it.

## 1.0.10

- New tasks appear at the top of the day list.

## 1.0.9

- Compact Hide and delete (⊖) buttons; "Copy diagnostics" became a small link.

## 1.0.8

- "Copy diagnostics" in Settings → About.
- Settings save while typing.
- Reminder checks are isolated, so one error can't disable the others.

## 1.0.7

- Reminders appear on the monitor where the mouse cursor is.

## 1.0.6

- Quiet updates: a green dot on ⚙ instead of a pop-up.

## 1.0.5

- macOS and Linux builds.

## 1.0.3 – 1.0.4

- Delete clients and tasks (with confirmation).
- Week table fits a narrow window: empty days off are hidden, Total is always visible.
- Hover states in the header, new mini mode icons.

## 1.0.2

- First public release.
