// Production hosted server
const SERVER_URL = 'https://mentro-lucid-dust-3580.fly.dev';

const tabBar = document.getElementById('tab-bar');
const tabStatus = document.getElementById('tab-status');
const tabSettings = document.getElementById('tab-settings');
const tabOnboarding = document.getElementById('tab-onboarding');

let tick = null;

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function showOnboarding() {
  tabBar.style.display = 'none';
  tabStatus.style.display = 'none';
  tabSettings.style.display = 'none';
  tabOnboarding.style.display = 'block';
}

function showMain(tab) {
  tabBar.style.display = 'flex';
  tabOnboarding.style.display = 'none';
  switchTab(tab || 'status');
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function switchTab(name) {
  tabStatus.style.display = name === 'status' ? 'block' : 'none';
  tabSettings.style.display = name === 'settings' ? 'block' : 'none';
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
}

document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => switchTab(t.dataset.tab));
});

// ---------------------------------------------------------------------------
// Status rendering
// ---------------------------------------------------------------------------
function render(current, settings) {
  const state = current?.state || 'grey';
  document.getElementById('dot').style.background = STOPLIGHT_COLORS[state];
  document.getElementById('label').textContent = STOPLIGHT_LABELS[state] || state;
  document.getElementById('detail').textContent = current?.detail || '';
  document.getElementById('session').textContent = current?.session
    ? `session ${current.session}`
    : '';
  document.getElementById('overlay-toggle').checked =
    settings?.overlayVisible ?? STOPLIGHT_DEFAULTS.overlayVisible;
  document.getElementById('notif-toggle').checked =
    settings?.notifications !== false;

  // Show nudge if state has never left grey (no session recorded yet)
  const neverHeard = state === 'grey' && !current?.session;
  document.getElementById('nudge').style.display = neverHeard ? '' : 'none';

  const durationEl = document.getElementById('duration');
  if (tick) clearInterval(tick);
  const update = () => {
    durationEl.textContent = current?.since
      ? `for ${stoplightFormatDuration(Date.now() - current.since)}`
      : '';
  };
  update();
  tick = setInterval(update, 1000);
}

// ---------------------------------------------------------------------------
// Hooks config generation
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
// Load config into onboarding
// ---------------------------------------------------------------------------
async function loadConfig() {
  try {
    const token = await ensureToken();
    const config = generateHooksConfig(token);
    document.getElementById('onboarding-config').value = config;
  } catch (err) {
    document.getElementById('onboarding-config').value = '';
    document.getElementById('onboarding-status').textContent = `Can't reach server: ${err.message}`;
    document.getElementById('onboarding-status').className = 'status-msg error';
  }
}

// ---------------------------------------------------------------------------
// Copy config (onboarding)
// ---------------------------------------------------------------------------
document.getElementById('onboarding-copy').addEventListener('click', async () => {
  const onboardingStatus = document.getElementById('onboarding-status');
  const onboardingConfig = document.getElementById('onboarding-config');
  try {
    await navigator.clipboard.writeText(onboardingConfig.value);
    onboardingStatus.textContent = 'Copied!';
    onboardingStatus.className = 'status-msg';
  } catch {
    onboardingConfig.select();
    document.execCommand('copy');
    onboardingStatus.textContent = 'Copied!';
    onboardingStatus.className = 'status-msg';
  }
});

// ---------------------------------------------------------------------------
// Onboarding done → mark complete, show main view
// ---------------------------------------------------------------------------
document.getElementById('onboarding-done').addEventListener('click', async () => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({
    settings: { ...STOPLIGHT_DEFAULTS, ...(settings || {}), onboarded: true },
  });
  showMain('status');
});

// ---------------------------------------------------------------------------
// Toggle handlers
// ---------------------------------------------------------------------------
document.getElementById('overlay-toggle').addEventListener('change', async (e) => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({
    settings: { ...STOPLIGHT_DEFAULTS, ...(settings || {}), overlayVisible: e.target.checked },
  });
});

document.getElementById('notif-toggle').addEventListener('change', async (e) => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({
    settings: { ...STOPLIGHT_DEFAULTS, ...(settings || {}), notifications: e.target.checked },
  });
});

// ---------------------------------------------------------------------------
// Nudge link → switch to settings tab
// ---------------------------------------------------------------------------
document.getElementById('nudge-link').addEventListener('click', () => {
  switchTab('settings');
});

// ---------------------------------------------------------------------------
// Open full options page
// ---------------------------------------------------------------------------
document.getElementById('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ---------------------------------------------------------------------------
// Storage listener for live updates
// ---------------------------------------------------------------------------
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.current || changes.settings)) loadState();
});

// ---------------------------------------------------------------------------
// Load state
// ---------------------------------------------------------------------------
async function loadState() {
  const { current, settings } = await chrome.storage.local.get(['current', 'settings']);
  render(current, settings);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  const { settings } = await chrome.storage.local.get('settings');
  const onboarded = settings?.onboarded;

  await loadConfig();
  await loadState();

  if (!onboarded) {
    showOnboarding();
  } else {
    showMain('status');
  }
}

boot();
