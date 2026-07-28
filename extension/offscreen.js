// Offscreen document: the one long-lived extension context. Holds the SSE
// connection to the bridge (falling back to polling) and forwards snapshots
// to the service worker, which owns badge/notifications/storage.

let es = null;
let pollTimer = null;
let sseRetryTimer = null;
let lastSent = '';
let port = STOPLIGHT_DEFAULTS.port;

const POLL_INTERVAL_MS = 2000;
const SSE_RETRY_MS = 30 * 1000;

function base() {
  return `http://127.0.0.1:${port}`;
}

function send(snapshot) {
  const key = JSON.stringify([snapshot.state, snapshot.detail, snapshot.since]);
  if (key === lastSent) return;
  lastSent = key;
  chrome.runtime.sendMessage({ type: 'stoplight-state', data: snapshot }).catch(() => {});
}

function reportUnreachable() {
  send({
    state: 'grey',
    session: null,
    detail: 'bridge unreachable',
    since: Date.now(),
    updatedAt: Date.now(),
  });
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function pollOnce() {
  // AbortController timeout: in managed/proxied Chrome a blocked localhost
  // request can hang forever rather than fail — treat >1.5s as unreachable.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 1500);
  try {
    const res = await fetch(`${base()}/state`, { cache: 'no-store', signal: abort.signal });
    if (!res.ok) throw new Error(res.status);
    send(await res.json());
  } catch {
    reportUnreachable();
  } finally {
    clearTimeout(timer);
  }
}

function startPolling() {
  if (pollTimer) return;
  pollOnce();
  pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
  // Periodically try to upgrade back to SSE.
  if (!sseRetryTimer) {
    sseRetryTimer = setInterval(connectSSE, SSE_RETRY_MS);
  }
}

function connectSSE() {
  if (es) return;
  const candidate = new EventSource(`${base()}/events`);
  // If the connection neither opens nor errors within 5s (hung by a proxy),
  // give up on it and fall back to polling.
  const connectWatchdog = setTimeout(() => {
    if (es !== candidate) {
      candidate.close();
      startPolling();
    }
  }, 5000);
  candidate.onopen = () => {
    clearTimeout(connectWatchdog);
    es = candidate;
    stopPolling();
    if (sseRetryTimer) clearInterval(sseRetryTimer);
    sseRetryTimer = null;
  };
  candidate.onmessage = (ev) => {
    try {
      send(JSON.parse(ev.data));
    } catch {}
  };
  candidate.onerror = () => {
    candidate.close();
    if (es === candidate) es = null;
    startPolling();
  };
}

function reconnect() {
  if (es) {
    es.close();
    es = null;
  }
  stopPolling();
  lastSent = '';
  connectSSE();
  // If SSE cannot connect, onerror fires and polling takes over.
}

chrome.storage.local.get('settings').then(({ settings }) => {
  if (settings?.port) port = settings.port;
  connectSSE();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  const newPort = changes.settings.newValue?.port || STOPLIGHT_DEFAULTS.port;
  if (newPort !== port) {
    port = newPort;
    reconnect();
  }
});
