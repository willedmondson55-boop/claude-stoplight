// Service worker: polls the bridge, owns the badge, notifications, and
// storage. All persistent state lives in chrome.storage.local because MV3
// workers are killed and restarted constantly.
//
// Design note: an earlier version held an SSE connection in an offscreen
// document, but offscreen documents proved unreliable in managed/enterprise
// Chrome while service-worker fetches to 127.0.0.1 demonstrably work. So the
// worker polls every 2s and keeps itself alive by touching chrome APIs on
// every tick; a 1-minute alarm resurrects it if Chrome kills it anyway.

importScripts('shared.js');

const WATCHDOG_ALARM = 'stoplight-watchdog';
const STALE_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
const FETCH_TIMEOUT_MS = 1500;

let pollTimer = null;

function badgeFor(state) {
  chrome.action.setBadgeBackgroundColor({ color: STOPLIGHT_COLORS[state] || STOPLIGHT_COLORS.grey });
  chrome.action.setBadgeText({ text: ' ' });
  chrome.action.setTitle({
    title: `Claude Code: ${STOPLIGHT_LABELS[state] || state}`,
  });
}

function notifyTransition(state, detail) {
  const messages = {
    yellow: { title: 'Claude Code needs you', priority: 2 },
    red: { title: 'Claude Code finished', priority: 1 },
  };
  const cfg = messages[state];
  if (!cfg) return;
  chrome.notifications.create(`stoplight-${state}-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: cfg.title,
    message: detail || STOPLIGHT_LABELS[state],
    priority: cfg.priority,
  });
}

async function applyState(snapshot) {
  const { current } = await chrome.storage.local.get('current');
  const prevState = current?.state;
  const changed =
    snapshot.state !== prevState ||
    snapshot.detail !== current?.detail ||
    snapshot.since !== current?.since;

  badgeFor(snapshot.state);
  if (changed) await chrome.storage.local.set({ current: snapshot });

  // Notify only on transitions INTO yellow/red, never on repeats.
  if (snapshot.state !== prevState && (snapshot.state === 'yellow' || snapshot.state === 'red')) {
    notifyTransition(snapshot.state, snapshot.detail);
  }
}

async function pollOnce() {
  const { settings } = await chrome.storage.local.get('settings');
  const port = settings?.port || STOPLIGHT_DEFAULTS.port;
  // The storage read above doubles as the keepalive: touching a chrome.* API
  // every tick resets the worker's idle shutdown timer.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/state`, {
      cache: 'no-store',
      signal: abort.signal,
    });
    if (!res.ok) throw new Error(res.status);
    await applyState(await res.json());
  } catch {
    await applyState({
      state: 'grey',
      session: null,
      detail: 'bridge unreachable',
      since: Date.now(),
      updatedAt: Date.now(),
    });
  } finally {
    clearTimeout(timer);
  }
}

function startPolling() {
  if (pollTimer) return;
  pollOnce();
  pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
}

async function ensureWatchdog() {
  const existing = await chrome.alarms.get(WATCHDOG_ALARM);
  if (!existing) chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== WATCHDOG_ALARM) return;
  // If Chrome killed the worker, this alarm restarts it and polling resumes.
  startPolling();
  const { current } = await chrome.storage.local.get('current');
  if (current && current.state !== 'grey' && Date.now() - current.updatedAt > STALE_MS) {
    await applyState({
      ...current,
      state: 'grey',
      detail: 'stale (no updates for 15 minutes)',
      since: Date.now(),
      updatedAt: current.updatedAt,
    });
  }
});

async function boot() {
  await ensureWatchdog();
  const { current } = await chrome.storage.local.get('current');
  badgeFor(current?.state || 'grey');
  startPolling();
}

chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
boot();
