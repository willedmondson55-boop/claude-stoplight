const statusEl = document.getElementById('status');

function showStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.className = isError ? 'error' : '';
  setTimeout(() => (statusEl.textContent = ''), 4000);
}

async function load() {
  const { settings } = await chrome.storage.local.get('settings');
  const cfg = { ...STOPLIGHT_DEFAULTS, ...(settings || {}) };
  document.getElementById('port').value = cfg.port;
  document.getElementById('sites').value = cfg.overlaySites.join('\n');
}

document.getElementById('save').addEventListener('click', async () => {
  const port = parseInt(document.getElementById('port').value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    showStatus('Invalid port', true);
    return;
  }

  // The default host permission only covers 4747; other ports need the
  // optional broader 127.0.0.1 permission (this click is the user gesture).
  if (port !== 4747) {
    const granted = await chrome.permissions.request({
      origins: ['http://127.0.0.1/*'],
    });
    if (!granted) {
      showStatus('Permission for that port was declined — keeping saved port', true);
      return;
    }
  }

  const overlaySites = document
    .getElementById('sites')
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({
    settings: { ...STOPLIGHT_DEFAULTS, ...(settings || {}), port, overlaySites },
  });
  showStatus('Saved');
});

load();
