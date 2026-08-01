# Claude Code Stoplight

A Chrome extension that shows what your Claude Code session is doing at a glance —
no window switching needed.

| Light | Meaning |
| --- | --- |
| 🟢 Green | Claude Code is actively working (running tools, generating) |
| 🟡 Yellow | Waiting on you (permission prompt, question, idle after asking) |
| 🔴 Red | Task finished / stopped responding |
| ⚪ Grey | No active session |

You get four signals: a tinted toolbar badge, a small draggable stoplight overlay on
web pages, a system notification on transitions into yellow/red, and a popup with
detail + duration.

## Quick Start

1. **Install the extension** — load `extension/` as an unpacked extension
   (`chrome://extensions` → Developer mode → Load unpacked)
2. **Open the popup** — first launch shows a one-time onboarding screen with your
   hooks config ready to copy
3. **Paste into `~/.claude/settings.json`** — then restart Claude Code
4. Done — the stoplight lights up automatically as Claude works

No local server, no env vars, no scripts to install. The extension talks to a hosted
server that relays state between Claude Code's hooks and the extension.

## How it works

```
Claude Code hooks ──curl──▶ hosted server ──poll──▶ Chrome extension
(inline curl cmds)           /api/stoplight/*        ├─ badge
                                                     ├─ overlay
                                                     ├─ notifications
                                                     └─ popup
```

Claude Code's hook system fires shell commands at key lifecycle events (session start,
tool use, permission prompts, stop). The generated hooks config contains inline `curl`
commands that POST state to the hosted server with a Bearer token. The extension polls
that endpoint every 2 seconds and updates the badge/overlay/notifications.

## Extension Features

- **Toolbar badge** — colored dot always visible, no click needed
- **Floating overlay** — draggable stoplight on any web page (configurable allowlist)
- **System notifications** — fires on transitions to yellow (needs you) or red (done)
- **Popup** — shows state, detail text, duration timer, quick settings
- **Onboarding** — first-run screen auto-generates your token and config
- **Connectivity detection** — graceful handling of server unreachability

## Architecture (MV3)

The service worker polls the server every 2s. MV3 kills workers after ~30s idle, so
the worker keeps itself alive by touching `chrome.storage` on every tick. A 1-minute
`chrome.alarms` watchdog restarts polling if Chrome kills the worker anyway. Polls
carry a 1.5s abort timeout — unreachable server degrades to grey silently.

The popup and overlay read from `chrome.storage.onChanged` — they never touch the
network directly.

## Modes

### Hosted mode (default)

The extension auto-registers a token on first use and talks to the hosted server.
Generated hooks use inline curl with Bearer auth. Zero local setup.

### Local mode (advanced)

For offline use or custom setups, enable "Use local bridge" in the options page.
Run the bridge yourself:

```sh
cd bridge && npm start
```

The bridge is a zero-dependency Node HTTP server (~130 lines) that binds to
`127.0.0.1:4747`. It exposes `POST /state`, `GET /state`, `GET /events` (SSE),
and auto-expires to grey after 15 minutes without updates.

## Hook Events

| Hook event | State | Why |
| --- | --- | --- |
| `SessionStart` | green | session came up |
| `UserPromptSubmit` | green | you sent a prompt, Claude is working |
| `PreToolUse` | green | about to run a tool |
| `PostToolUse` | green | tool finished, still working |
| `PermissionRequest` | yellow | permission prompt waiting |
| `Notification` | yellow | Claude is waiting on you (filtered by matcher) |
| `Stop` | red | Claude finished responding |
| `SessionEnd` | grey | session closed |

The `Notification` hook uses a matcher to limit yellow to "needs you" types:
`permission_prompt`, `idle_prompt`, `elicitation_dialog`, `agent_needs_input`.

## Options Page

- **Overlay sites** — hostnames where the floating stoplight appears (`*` = everywhere)
- **Notifications** — toggle system notifications on yellow/red
- **Hooks config** — view/copy your generated config at any time
- **Advanced: Local mode** — use a local bridge instead of hosted server
- **Advanced: Port** — custom bridge port (default 4747)

## Verify Without a Real Session

With the local bridge running:

```sh
./test-state.sh
```

Walks the bridge through green → yellow → red (3s apart). You should see the badge
and overlay change color.

## Privacy

The extension only communicates with the hosted server (or your local bridge). It
collects no data, has no analytics, and stores nothing beyond your session token and
preferences in `chrome.storage.local`. Unofficial project — not affiliated with or
endorsed by Anthropic.

## Files

```
extension/                Chrome extension (MV3, vanilla JS, no dependencies)
  manifest.json           MV3 manifest
  background.js           Service worker: polling, badge, notifications, watchdog
  shared.js               Shared constants across all extension contexts
  overlay.js / .css       Floating draggable stoplight content script
  popup.html / .js        Toolbar popup (onboarding + status + settings tabs)
  options.html / .js      Full settings page
  icons/                  Generated PNGs

bridge/                   Local bridge (zero-dependency Node server)
  server.js               The entire bridge (~130 lines)
  package.json            npm start convenience

hooks/                    Claude Code hook helpers
  report-state.sh         Dual-mode reporter (local/hosted, stdin JSON parsing)
  settings-snippet.json   Paste-ready hooks config (uses report-state.sh)

tools/
  gen-icons.js            Regenerate extension/icons/*.png

store-assets/             Chrome Web Store listing materials
test-state.sh             green → yellow → red demo (local bridge)
```
