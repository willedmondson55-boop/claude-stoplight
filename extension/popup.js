let tick = null;

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

async function load() {
  const { current, settings } = await chrome.storage.local.get(['current', 'settings']);
  render(current, settings);
}

document.getElementById('overlay-toggle').addEventListener('change', async (e) => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({
    settings: { ...STOPLIGHT_DEFAULTS, ...(settings || {}), overlayVisible: e.target.checked },
  });
});

document.getElementById('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.current || changes.settings)) load();
});

load();
