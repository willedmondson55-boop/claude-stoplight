// Production hosted server
const SERVER_URL = 'https://mentro-lucid-dust-3580.fly.dev';

const statusEl = document.getElementById('status');
const configOutput = document.getElementById('configOutput');
const connectedBanner = document.getElementById('connected-banner');
const connectedDetail = document.getElementById('connected-detail');
const advancedToggle = document.getElementById('advancedToggle');
const advancedSection = document.getElementById('advancedSection');

function showStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.className = isError ? 'error' : '';
  setTimeout(() => (statusEl.textContent = ''), 4000);
}

// ---------------------------------------------------------------------------
// Advanced toggle
// ---------------------------------------------------------------------------
advancedToggle.addEventListener('click', () => {
  const open = advancedSection.style.display === 'block';
  advancedSection.style.display = open ? 'none' : 'block';
  advancedToggle.textContent = open ? '▶ Advanced options' : '▼ Advanced options';
});

// ---------------------------------------------------------------------------
// Hooks config generation (inline curl)
// ---------------------------------------------------------------------------
function generateHooksConfig(token) {
  const endpoint = `${SERVER_URL}/api/stoplight/state`;

  function curlCmd(state, detail) {
    return `curl -s -X POST "${endpoint}" -H "Content-Type: application/json" -H "Authorization: Bearer ${token}" --max-time 3 -d "{\\"state\\":\\"${state}\\",\\"detail\\":\\"${detail}\\"}" >/dev/null 2>&1 || true`;
  }

  return JSON.stringify({
    hooks: {
      SessionStart: [{
        hooks: [{ type: 'command', command: curlCmd('green', 'session started'), async: true }]
      }],
      UserPromptSubmit: [{
        hooks: [{ type: 'command', command: curlCmd('green', 'working on your prompt'), async: true }]
      }],
      PreToolUse: [{
        hooks: [{ type: 'command', command: curlCmd('green', 'running tools'), async: true }]
      }],
      PostToolUse: [{
        hooks: [{ type: 'command', command: curlCmd('green', 'running tools'), async: true }]
      }],
      PermissionRequest: [{
        hooks: [{ type: 'command', command: curlCmd('yellow', 'Claude needs your permission'), async: true }]
      }],
      Notification: [{
        matcher: 'permission_prompt|idle_prompt|elicitation_dialog|agent_needs_input',
        hooks: [{ type: 'command', command: curlCmd('yellow', 'waiting for you'), async: true }]
      }],
      Stop: [{
        hooks: [{ type: 'command', command: curlCmd('red', 'finished responding'), async: true }]
      }],
      SessionEnd: [{
        hooks: [{ type: 'command', command: curlCmd('grey', 'session ended'), async: true }]
      }]
    }
  }, null, 2);
}

function generateLocalHooksConfig(port) {
  function curlCmd(state, detail) {
    return `curl -s -X POST "http://127.0.0.1:${port}/state" -H "Content-Type: application/json" --max-time 1 -d "{\\"state\\":\\"${state}\\",\\"detail\\":\\"${detail}\\"}" >/dev/null 2>&1 || true`;
  }

  return JSON.stringify({
    hooks: {
      SessionStart: [{
        hooks: [{ type: 'command', command: curlCmd('green', 'session started'), async: true }]
      }],
      UserPromptSubmit: [{
        hooks: [{ type: 'command', command: curlCmd('green', 'working on your prompt'), async: true }]
      }],
      PreToolUse: [{
        hooks: [{ type: 'command', command: curlCmd('green', 'running tools'), async: true }]
      }],
      PostToolUse: [{
        hooks: [{ type: 'command', command: curlCmd('green', 'running tools'), async: true }]
      }],
      PermissionRequest: [{
        hooks: [{ type: 'command', command: curlCmd('yellow', 'Claude needs your permission'), async: true }]
      }],
      Notification: [{
        matcher: 'permission_prompt|idle_prompt|elicitation_dialog|agent_needs_input',
        hooks: [{ type: 'command', command: curlCmd('yellow', 'waiting for you'), async: true }]
      }],
      Stop: [{
        hooks: [{ type: 'command', command: curlCmd('red', 'finished responding'), async: true }]
      }],
      SessionEnd: [{
        hooks: [{ type: 'command', command: curlCmd('grey', 'session ended'), async: true }]
      }]
    }
  }, null, 2);
}

// ---------------------------------------------------------------------------
// Auto-register: silently gets a token if we don't have one
// ---------------------------------------------------------------------------
async function ensureToken() {
  const { settings } = await chrome.storage.local.get('settings');
  if (settings?.hostedToken) return settings.hostedToken;

  const res = await fetch(`${SERVER_URL}/api/stoplight/register`, { method: 'POST' });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const data = await res.json();
  const token = data.token;

  await chrome.storage.local.set({
    settings: {
      ...STOPLIGHT_DEFAULTS,
      ...(settings || {}),
      hostedUrl: SERVER_URL,
      hostedToken: token,
      useLocal: false,
    },
  });

  return token;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
function showConnected(token) {
  connectedBanner.style.display = 'block';
  connectedDetail.textContent = `Token: ${token.slice(0, 8)}…`;
}

function showLocalConnected() {
  connectedBanner.style.display = 'block';
  connectedDetail.textContent = 'Local bridge mode';
}

// ---------------------------------------------------------------------------
// Copy config
// ---------------------------------------------------------------------------
document.getElementById('copyConfig').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(configOutput.value);
    showStatus('Copied!');
  } catch {
    configOutput.select();
    document.execCommand('copy');
    showStatus('Copied!');
  }
});

// ---------------------------------------------------------------------------
// Settings save
// ---------------------------------------------------------------------------
document.getElementById('saveSettings').addEventListener('click', async () => {
  const notifications = document.getElementById('notifications').checked;
  const useLocal = document.getElementById('useLocal').checked;
  const port = parseInt(document.getElementById('port').value, 10) || 4747;

  if (useLocal && port !== 4747) {
    const granted = await chrome.permissions.request({
      origins: ['http://127.0.0.1/*'],
    });
    if (!granted) {
      showStatus('Permission for that port was declined', true);
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
    settings: { ...STOPLIGHT_DEFAULTS, ...(settings || {}), notifications, overlaySites, useLocal, port },
  });

  // Update the config output to reflect the mode
  if (useLocal) {
    showLocalConnected();
    configOutput.value = generateLocalHooksConfig(port);
  } else {
    const cfg = { ...STOPLIGHT_DEFAULTS, ...(settings || {}) };
    if (cfg.hostedToken) {
      showConnected(cfg.hostedToken);
      configOutput.value = generateHooksConfig(cfg.hostedToken);
    }
  }

  showStatus('Saved');
});

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
async function load() {
  const { settings } = await chrome.storage.local.get('settings');
  const cfg = { ...STOPLIGHT_DEFAULTS, ...(settings || {}) };

  document.getElementById('sites').value = cfg.overlaySites.join('\n');
  document.getElementById('notifications').checked = cfg.notifications !== false;
  document.getElementById('useLocal').checked = cfg.useLocal || false;
  document.getElementById('port').value = cfg.port || 4747;

  if (cfg.useLocal) {
    showLocalConnected();
    configOutput.value = generateLocalHooksConfig(cfg.port || 4747);
  } else {
    // Auto-register if needed, then show config
    try {
      const token = await ensureToken();
      showConnected(token);
      configOutput.value = generateHooksConfig(token);
    } catch (err) {
      configOutput.value = '';
      showStatus(`Can't reach server: ${err.message}`, true);
    }
  }
}

load();
