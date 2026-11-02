# ThreadPage for Claude Code

Connects a Claude Code session to your ThreadPage (https://thread.page) under its own name, so it can read your threads, add notes, and take the requests you address to it.

## Use

```sh
claude plugin install threadpage --marketplace ThreadPage/threadpage-companion
```

Then, in a Claude Code session, `/threadpage:connect` connects the session under a name suggested from its folder; `/threadpage:connect as <name>` picks one. You approve it in ThreadPage in your browser. `/threadpage:next` takes the oldest request that waits for the session.

Runs on macOS, Linux and Windows through WSL, with Node.js 22.20 or later on Node 22, or 24.8 or later. Native Windows isn't supported: the hooks need `sh`.

## What it runs

- **A local MCP server:** `node "${CLAUDE_PLUGIN_ROOT}/server/launch.mjs"`. The launcher checks the Node version and starts `server/server.mjs` without Node's inspector, preloads or `NODE_TLS_REJECT_UNAUTHORIZED`; on an older Node it offers only a tool that says what to update.
- **Network:** HTTPS to `https://thread.page` only (`/api/v1/agent-sessions/…` and `/mcp`), never following a redirect. `THREADPAGE_ORIGIN` may point it at a development copy of ThreadPage on this computer, over loopback http only. It fetches nothing else.
- **Approval in the browser:** connecting opens ThreadPage in your browser (`open`, `xdg-open`, `wslview` or `$BROWSER`), and the server listens once on `127.0.0.1` for the answer. Without a browser on this computer (SSH, Linux without a display, a cloud session) it shows a code to approve elsewhere and asks you for the two digits ThreadPage then shows.
- **Programs:** `/usr/bin/security` (macOS) or `secret-tool` (Linux) to keep this computer's key, and `ps` (macOS) to read when the Claude Code process started.
- **Hooks** (`hooks/hooks.json`, each `sh` or `node` with a script of this plugin):
  - `PreToolUse`, `UserPromptSubmit`, `Stop` (`stop-guard.sh`): when you stop a request in ThreadPage, the session's tool calls are refused until its turn ends or you type. Without a Stop they only check for a file and exit.
  - `PermissionRequest`, `PostToolUse`, `PostToolUseFailure` (`prompt.sh`): a tool call Claude Code asks you to approve is marked, by a hash of the call, until it ends, so ThreadPage can show that the session waits for your approval.
  - `SessionStart` after `/clear` or `/resume` (`hook.mjs`): leaves the session's new id for the server.
- **The wake:** a request addressed to the session goes into the session's own inbox socket, which Claude Code gives the server, as one line: `ThreadPage request <id>`, never the note's text. The session claims the request from ThreadPage and does it with its own permissions.

## What it keeps and sends

- The session's key lives only in the server's memory. This computer's key, which only connects sessions, is in the macOS Keychain, the Linux Secret Service, or the file `~/.local/state/threadpage/device`; in a cloud session, in memory only.
- `~/.threadpage` keeps the names your folders and sessions used, your Stop, the approval marks and a session's new id after `/clear`; no keys and no note content.
- ThreadPage receives this computer's name (its hostname), the session's name and id, the plugin's and Claude Code's versions, and the calls of its tools.

Details: [SECURITY.md](https://github.com/ThreadPage/threadpage-companion/blob/main/SECURITY.md) and the [privacy policy](https://thread.page/privacy).
