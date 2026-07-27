# Chrome Web Store listing — copy-paste pack

Everything the Developer Dashboard asks for, in the order it asks.
Upload package: `dist/claude-stoplight-1.0.0.zip`

## Store listing tab

**Name** (comes from the manifest): Claude Code Stoplight

> Naming note: "Claude" is Anthropic's trademark. To stay clear of the store's
> impersonation policy, the description below states the extension is unofficial.
> If review bounces on the name, fall back to "Code Agent Stoplight (for Claude
> Code)" — change `name` in manifest.json, re-zip, re-upload.

**Summary** (max 132 chars — this is the manifest `description`):

    At-a-glance stoplight for your Claude Code session: green = working, yellow = needs you, red = done, grey = no session.

**Description**:

    Know what your Claude Code session is doing without switching windows.

    A stoplight for your coding agent:
    🟢 Green — Claude is actively working (running tools, generating)
    🟡 Yellow — waiting on you (permission prompt, question, idle)
    🔴 Red — finished responding
    ⚪ Grey — no active session

    You get four signals:
    • Toolbar badge tinted to the current state, always visible
    • A small draggable stoplight overlay on pages you choose
    • A desktop notification the moment Claude needs you or finishes
    • A popup with the current state, how long it's been there, and why

    HOW IT WORKS
    This extension is a display for YOUR OWN local machine. It talks only to a
    tiny bridge server you run yourself on 127.0.0.1:4747 (source in the repo
    below). Claude Code hooks report state changes to the bridge; the extension
    listens over Server-Sent Events. Nothing leaves your machine — the extension
    makes no network requests except to 127.0.0.1 and collects no data at all.

    SETUP (required — the extension does nothing without it)
    1. Clone the repo and run the bridge: cd bridge && npm start
    2. Add the provided hooks snippet to ~/.claude/settings.json
    3. Full instructions in the README:
       https://github.com/willedmondson55-boop/claude-stoplight

    Unofficial: this project is not affiliated with or endorsed by Anthropic.
    Claude is a trademark of Anthropic, PBC.

**Category**: Developer Tools
**Language**: English

**Store icon** (128×128): `extension/icons/icon128.png`
**Screenshots** (1280×800): `store-assets/screenshot-1.png`
(Global promo images: optional, skip.)

## Privacy tab

**Single purpose description**:

    Displays the live status of the user's own local Claude Code session
    (working / needs input / finished / no session) as a toolbar badge, page
    overlay, and desktop notification, by reading state from a bridge server
    the user runs on their own machine at 127.0.0.1.

**Permission justifications**:

- `storage` —

      Persists the last known session state for the badge and popup, the user's
      settings (bridge port, overlay site list, overlay visibility), and the
      dragged position of the overlay.

- `notifications` —

      Shows a desktop notification when the session transitions to "needs your
      input" or "finished", which is the extension's core alerting feature.

- `offscreen` —

      Maintains the Server-Sent Events connection to the user's local bridge at
      127.0.0.1. MV3 service workers are short-lived and cannot hold a
      long-lived connection.

- `alarms` —

      A once-per-minute watchdog that recreates the offscreen document if the
      browser discarded it and marks the state stale (grey) if no update has
      arrived in 15 minutes.

- Host permission `http://127.0.0.1:4747/*` —

      The extension's only network access: reading session state from the
      bridge server the user runs on their own machine. No other hosts are
      contacted.

- Optional host permission `http://127.0.0.1/*` —

      Requested only if the user changes the bridge port away from the default
      4747 in the options page. Still restricted to the local machine.

- Content scripts on `http://*/*` and `https://*/*` —

      Renders the small floating stoplight overlay. The script exits
      immediately unless the page's hostname is on the user's allowlist
      (configured in options), reads state from chrome.storage only, and makes
      no network requests from pages.

**Remote code**: No, I am not using remote code.

**Data usage**: check "I do not collect or use any user data". The extension
collects nothing, transmits nothing off-machine, and has no analytics.

**Privacy policy URL**: not required when no data is collected. If the form
insists, point it at the repo README's Privacy section:
https://github.com/willedmondson55-boop/claude-stoplight#privacy

## Distribution tab

- **Visibility**: Unlisted (recommended — installable by anyone with the link,
  invisible in search; you can flip to Public later without resubmitting from
  scratch). Private works too but requires listing tester accounts.
- **Pricing**: Free. **Regions**: all.
