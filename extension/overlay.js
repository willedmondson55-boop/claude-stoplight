// Content script: floating stoplight overlay. Reads state from
// chrome.storage.local (written by the service worker) — no network access
// from page contexts. Gated at runtime by the options-page site allowlist.

(() => {
  const DEFAULTS = { overlayVisible: true, overlaySites: ['*'] };
  let overlay = null;
  let dragging = false;

  function siteAllowed(sites) {
    if (!Array.isArray(sites) || sites.length === 0) return false;
    const host = location.hostname;
    return sites.some((entry) => {
      const s = String(entry).trim().toLowerCase();
      if (!s) return false;
      if (s === '*') return true;
      return host === s || host.endsWith(`.${s}`);
    });
  }

  function applyState(state) {
    if (!overlay) return;
    overlay.classList.remove(
      'claude-stoplight-green',
      'claude-stoplight-yellow',
      'claude-stoplight-red',
      'claude-stoplight-grey'
    );
    overlay.classList.add(`claude-stoplight-${state || 'grey'}`);
    const labels = { green: 'working', yellow: 'needs you', red: 'finished', grey: 'no session' };
    overlay.title = `Claude Code: ${labels[state] || 'unknown'}`;
  }

  function applyPosition(pos) {
    if (!overlay || dragging) return;
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
      overlay.style.left = `${clamp(pos.x, 0, window.innerWidth - overlay.offsetWidth)}px`;
      overlay.style.top = `${clamp(pos.y, 0, window.innerHeight - overlay.offsetHeight)}px`;
      overlay.style.right = 'auto';
    }
  }

  function clamp(v, lo, hi) {
    return Math.min(Math.max(v, lo), Math.max(lo, hi));
  }

  function makeDraggable(el) {
    let startX = 0;
    let startY = 0;
    let origX = 0;
    let origY = 0;

    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      el.classList.add('claude-stoplight-dragging');
      el.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      e.preventDefault();
    });

    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const x = clamp(origX + (e.clientX - startX), 0, window.innerWidth - el.offsetWidth);
      const y = clamp(origY + (e.clientY - startY), 0, window.innerHeight - el.offsetHeight);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.right = 'auto';
    });

    el.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('claude-stoplight-dragging');
      el.releasePointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      chrome.storage.local.set({ overlayPos: { x: rect.left, y: rect.top } });
    });
  }

  function mount() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'claude-stoplight-overlay';
    for (const color of ['red', 'yellow', 'green']) {
      const lamp = document.createElement('div');
      lamp.className = `claude-stoplight-lamp claude-stoplight-lamp-${color}`;
      overlay.appendChild(lamp);
    }
    makeDraggable(overlay);
    document.documentElement.appendChild(overlay);
  }

  function unmount() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  async function sync() {
    const { settings, current, overlayPos } = await chrome.storage.local.get([
      'settings',
      'current',
      'overlayPos',
    ]);
    const cfg = { ...DEFAULTS, ...(settings || {}) };
    if (!cfg.overlayVisible || !siteAllowed(cfg.overlaySites)) {
      unmount();
      return;
    }
    mount();
    applyState(current?.state);
    applyPosition(overlayPos);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      sync();
      return;
    }
    if (changes.current) applyState(changes.current.newValue?.state);
    if (changes.overlayPos) applyPosition(changes.overlayPos.newValue);
  });

  sync();
})();
