# Claude Code Stoplight

A Chrome extension + local bridge that shows what your Claude Code session is doing,
at a glance, without switching windows.

| Light | Meaning |
| --- | --- |
| 🟢 Green | Claude Code is actively working (running tools, generating) |
| 🟡 Yellow | Waiting on you (permission prompt, question, idle after asking) |
| 🔴 Red | Task finished / stopped responding |
| ⚪ Grey | No active session (or bridge unreachable / state stale) |

You get four signals: a tinted toolbar badge, a small draggable stoplight overlay on
web pages, a system notification on transitions into yellow/red, and a popup with
detail + duration.

## How it fits together

```
Claude Code hooks ──curl──▶ bridge (127.0.0.1:4747) ──SSE/poll──▶ extension
                                                                   ├─ badge
                                                                   ├─ overlay
                                                                   ├─ notifications
                                                                   └─ popup
```

- `bridge/` — zero-dependency Node server. `POST /state`, `GET /state`, `GET /events`
  (Server-Sent Events). Auto-expires to grey after 15 minutes without updates.
- `hooks/` — reporter script + a `settings.json` snippet for Claude Code.
- `extension/` — Manifest V3 extension, vanilla JS/CSS, no dependencies.

## Install

### 1. Run the bridge

```sh
cd bridge
npm start
```

It binds to `127.0.0.1:4747` only. Keep it running (a login item, tmux pane, or
`launchd` job all work fine — it's a single ~150-line script).

### 2. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select the `extension/` folder
4. Pin the "Claude Code Stoplight" action to the toolbar

The badge shows the current color immediately; the overlay appears on pages after a
reload of those tabs (defaults to all sites — trim the list in Options).

### 3. Wire up the Claude Code hooks

This repo is expected at `~/claude-stoplight`. If you cloned it elsewhere, adjust
the paths in the snippet.

Merge `hooks/settings-snippet.json` into `~/.claude/settings.json` (create the file
with just that content if you don't have one; if you already have a `"hooks"` key,
merge the event entries into it). Then restart any running Claude Code sessions —
hooks are captured at startup.

The mapping:

| Hook event | State | Why |
| --- | --- | --- |
| `SessionStart` | green | session came up |
| `UserPromptSubmit` | green | you sent a prompt, Claude is working |
| `PreToolUse` | green | about to run a tool |
| `PostToolUse` | green | tool finished, still working (see note below) |
| `Notification` | yellow | Claude is waiting on you |
| `Stop` | red | Claude finished responding |
| `SessionEnd` | grey | session closed |

All hooks go through `hooks/report-state.sh`, which reads the hook payload on
stdin, extracts `session_id` (and the human-readable `message` for notifications,
shown in the popup/notification), and curls the bridge with `--max-time 1`, always
exiting 0 — a dead bridge can never block or break Claude Code. The snippet also
sets `"async": true` on every hook so Claude Code doesn't wait on them at all.

**Hook names verified against the current docs** (code.claude.com/docs/en/hooks).
All six events you'd expect exist with exactly these names — nothing needed
renaming. Two deliberate additions to the requested mapping:

- **`PostToolUse` → green.** Without it, approving a permission prompt leaves the
  light stuck on yellow until the *next* tool call, because `PreToolUse` for the
  approved tool has already fired. `PostToolUse` snaps it back to green as soon as
  the tool completes.
- **`Notification` matcher.** The Notification event also fires for things like
  auth success. The snippet's matcher limits yellow to the "needs you" types:
  `permission_prompt`, `idle_prompt`, `elicitation_dialog`, `agent_needs_input`.

Semantics note: `Stop` fires at the end of *every* assistant response, so the light
goes red each time Claude finishes a turn and green again when you reply. That
matches "task finished / waiting for nothing in particular." If you'd rather treat
post-turn idle as yellow, delete the `Stop` entry — the `idle_prompt` notification
will turn the light yellow when Claude has been waiting on you for a while.

## Verify without a real session

With the bridge running and the extension loaded:

```sh
./test-state.sh
```

Walks the bridge through green → yellow → red (3s apart; pass a number for a
different delay). You should see the badge and overlay change color and get system
notifications for the yellow and red transitions.

## Extension architecture (and MV3 constraints)

**The service worker polls the bridge directly.** MV3 workers are killed after
~30s idle, so the worker keeps itself alive by touching a `chrome.storage` API on
every 2-second poll tick (chrome API activity resets the idle timer), and a
1-minute `chrome.alarms` watchdog restarts polling if Chrome kills the worker
anyway — worst case the badge is ~1 minute stale after a worker death, typically
it's live within 2 seconds. Polls carry a 1.5s abort timeout so a hung request
(common behind corporate proxies) degrades to an explicit "bridge unreachable"
grey instead of a silent stall.

Design history: v1 held an SSE `EventSource` in an offscreen document (the
textbook MV3 pattern for long-lived connections). In managed/enterprise Chrome
the offscreen document's networking proved unreliable while service-worker
fetches to 127.0.0.1 worked fine, so the offscreen layer was removed entirely —
fewer moving parts, one less permission, and 2s polling against a loopback
server is effectively free.

The worker owns badge + notifications and writes each snapshot to
`chrome.storage.local`; the popup and content-script overlay just react to
`storage.onChanged` — page contexts never touch the network, so the only host
permission is `http://127.0.0.1:4747/*`. Notifications fire only on *transitions*
into yellow/red (previous state is compared in the worker). `chrome.action.openPopup`
is never called — it requires a user gesture; notifications + overlay cover the
"interrupt me" path.

The content script is registered for http/https pages but exits immediately unless
the page's hostname matches the allowlist you set in Options (runtime gating —
`host_permissions` itself stays limited to the bridge).

## Options

- **Bridge port** — default 4747. Changing it prompts for an optional
  `http://127.0.0.1/*` permission (the install-time grant covers only 4747). Start
  the bridge with `STOPLIGHT_PORT=<port> npm start` to match, and export
  `STOPLIGHT_PORT` where Claude Code runs so the hook script posts to the same port.
- **Overlay sites** — hostnames (one per line) where the floating stoplight
  appears. `*` = everywhere; `github.com` also matches subdomains. The badge and
  notifications work regardless.
- **Show overlay** — quick toggle in the popup.

## Privacy

Everything stays on your machine. The extension's only network access is to the
bridge you run yourself on `127.0.0.1`; it collects no data, has no analytics, and
contacts no external servers. Unofficial project — not affiliated with or endorsed
by Anthropic.

## Files

```
bridge/server.js          the bridge (Node built-ins only)
hooks/report-state.sh     hook → bridge reporter
hooks/settings-snippet.json  paste-ready hooks config
extension/manifest.json   MV3 manifest
extension/background.js   service worker: badge, notifications, watchdog
extension/overlay.*       floating stoplight content script
extension/popup.*         toolbar popup
extension/options.*       port + site allowlist
tools/gen-icons.js        regenerates extension/icons/*.png
store-assets/             Chrome Web Store listing pack
test-state.sh             green → yellow → red demo
```
