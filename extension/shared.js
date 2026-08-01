// Shared constants/helpers. Loaded by popup/options/offscreen via <script>;
// background.js imports it with importScripts.

const STOPLIGHT_DEFAULTS = {
  port: 4747,
  hostedUrl: 'https://mentro-lucid-dust-3580.fly.dev',
  hostedToken: '',
  notifications: true,
  overlayVisible: true,
  // Site allowlist for the overlay. Entries are hostname suffixes
  // ("github.com" matches gist.github.com too). "*" means every site.
  overlaySites: ['*'],
};

const STOPLIGHT_COLORS = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
  grey: '#9ca3af',
};

const STOPLIGHT_LABELS = {
  green: 'Working',
  yellow: 'Needs you',
  red: 'Finished',
  grey: 'No session',
};

function stoplightFormatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// Allow use from importScripts (service worker) and plain <script> pages alike.
if (typeof self !== 'undefined') {
  self.STOPLIGHT_DEFAULTS = STOPLIGHT_DEFAULTS;
  self.STOPLIGHT_COLORS = STOPLIGHT_COLORS;
  self.STOPLIGHT_LABELS = STOPLIGHT_LABELS;
  self.stoplightFormatDuration = stoplightFormatDuration;
}
