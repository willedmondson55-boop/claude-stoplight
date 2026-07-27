// Service worker: owns the badge, notifications, and the offscreen document
// lifecycle. All persistent state lives in chrome.storage.local because MV3
// workers are killed and restarted constantly.

importScripts('shared.js');

const OFFSCREEN_URL = 'offscreen.html';
const WATCHDOG_ALARM = 'stoplight-watchdog';
const STALE_MS = 15 * 60 * 1000;

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (contexts.length > 0) return;
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WORKERS'],
      justification:
        'Keeps a Server-Sent Events connection to the local Claude Code bridge alive; MV3 service workers cannot hold long-lived connections.',
    });
  } catch (e) {
    // A concurrent call may have created it already.
    if (!String(e).includes('single offscreen')) console.warn('offscreen create failed', e);
  }
}

async function ensureWatchdog() {
  const existing = await chrome.alarms.get(WATCHDOG_ALARM);
  if (!existing) chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 1 });
}

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

  badgeFor(snapshot.state);
  await chrome.storage.local.set({ current: snapshot });

  // Notify only on transitions INTO yellow/red, never on repeats.
  if (snapshot.state !== prevState && (snapshot.state === 'yellow' || snapshot.state === 'red')) {
    notifyTransition(snapshot.state, snapshot.detail);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'stoplight-state' && msg.data) {
    applyState(msg.data);
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== WATCHDOG_ALARM) return;
  await ensureOffscreen();
  // Belt-and-braces staleness check in case both the bridge and the offscreen
  // document died without reporting anything.
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
  await ensureOffscreen();
  await ensureWatchdog();
  const { current } = await chrome.storage.local.get('current');
  badgeFor(current?.state || 'grey');
}

chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
boot();
