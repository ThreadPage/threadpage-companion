# ThreadPage for Claude Code

Connects a Claude Code session to your ThreadPage (https://thread.page) under its own name. On ThreadPage Pro with Sync on, the session can read your threads, add notes, and take the requests you address to its @name. On Free, or on Pro without Sync, it can only add notes to your Inbox: it doesn't read your notes and takes no requests. A name first connected on Free, or without Sync, keeps that access after you move to Pro: connect the session under a new name (`/threadpage:connect as <name>`) to read and take requests.

## Use

```sh
claude plugin install threadpage --marketplace ThreadPage/threadpage-companion
```

Then, in a Claude Code session, `/threadpage:connect` connects the session under a name suggested from its folder; `/threadpage:connect as <name>` picks one. You approve it in ThreadPage in your browser. `/threadpage:next` takes the oldest request that waits for the session.

Runs on macOS, Linux and Windows through WSL, with Node.js 22.20 or later on Node 22, or 24.8 or later. Native Windows isn't supported: the hooks need `sh`.

## Requests

Only you, the account's owner, can address a request to your sessions, and ThreadPage makes a request only of a note you wrote yourself. A request runs in the session as if you had typed it, with the session's own mode, rules and approvals, and it doesn't wait for anyone at the terminal: an idle session starts it by itself, and a busy one reads it between tool calls. A session that skips approval prompts (for example in bypass permissions mode) carries it out without asking.

To keep requests from starting by themselves, set "Messages from your other sessions" (`crossSessionInbound`) in Claude Code's `/config` to `hold` or `refuse`. This holds or refuses the messages of your other Claude Code sessions as well. `/threadpage:next` then takes each request when you type it.

## What it runs

- **A local MCP server:** `node "${CLAUDE_PLUGIN_ROOT}/server/launch.mjs"`. The launcher checks the Node version and starts `server/server.mjs` without Node's inspector, preloads or `NODE_TLS_REJECT_UNAUTHORIZED`; on an older Node it offers only a tool that says what to update.
- **Network:** HTTPS to `https://thread.page` only (`/api/v1/agent-sessions/…` and `/mcp`), never following a redirect. `THREADPAGE_ORIGIN` may point it at a development copy of ThreadPage on this computer, over loopback http only. It fetches nothing else.
- **Approval in the browser:** connecting opens ThreadPage in your browser (`open`, `xdg-open`, `wslview` or `$BROWSER`), and the server listens once on `127.0.0.1` for the answer. Without a browser on this computer (SSH, Linux without a display, a cloud session) it shows a code to approve elsewhere and asks you for the two digits ThreadPage then shows.
- **Reconnecting by itself:** when Claude Code starts the server again in a conversation that held a name in the last 30 days (after `/resume`, a `/mcp` reconnect or a restart), the server asks ThreadPage for that name again without a command from you, with this computer's key and what any connection sends (below). ThreadPage gives the name back without the browser only to the computer that held it, within 18 hours of its last use or approval, and records each return in the session's activity. Otherwise nothing opens until you type `/threadpage:connect`.
- **Programs:** `/usr/bin/security` (macOS) or `secret-tool` (Linux) to keep this computer's key, and `ps` (macOS) to read when the Claude Code process started.
- **Hooks** (`hooks/hooks.json`, each `sh` or `node` with a script of this plugin):
  - `PreToolUse`, `UserPromptSubmit`, `Stop` (`stop-guard.sh`): when you stop a request the session claimed, its tool calls are refused until its turn ends or you type. A typed prompt or the end of the turn also clears the approval marks below. Otherwise they only check for a file and exit.
  - `PermissionRequest`, `PostToolUse`, `PostToolUseFailure` (`prompt.sh`): a tool call Claude Code asks you to approve is marked, by a hash of the call, until it ends, so ThreadPage can show that the session waits for your approval.
  - `SessionStart` after `/clear` or `/resume` (`hook.mjs`): leaves the session's new id for the server, and removes the files of Claude Code sessions that have ended.
- **The wake:** a request addressed to the session goes into the session's own inbox socket, `CLAUDE_CODE_MESSAGING_SOCKET`, which Claude Code gives the server. The server writes two JSON lines there: an auth line with `CLAUDE_CODE_MESSAGING_TOKEN`, the per-session token Claude Code gives its session's own processes for posting to that socket, and the message `ThreadPage request <id>`, never the note's text. The token is read from the server's environment and kept only in its memory: it is never sent to ThreadPage, written to disk or passed to a program the server starts. The session then claims the request from ThreadPage.

## What it keeps and sends

- The session's key lives only in the server's memory. This computer's key, which only connects sessions, is in the macOS Keychain, the Linux Secret Service, or the file `~/.local/state/threadpage/device`; in a cloud session, in memory only.
- `~/.threadpage` keeps the names your folders used (by the folder's path), the name each conversation held (by its id, for 30 days), your Stop, the approval marks and a session's new id after `/clear`; no keys and no note content. It stays on this computer.
- ThreadPage receives, when a session connects or returns to its name, this computer's name (its hostname) and the session's name and id; with each call, the plugin's and Claude Code's versions; while the session is connected, whether it waits for your approval and whether a request went into it; and the calls of its tools.

Details: [SECURITY.md](https://github.com/ThreadPage/threadpage-companion/blob/main/SECURITY.md) and the [privacy policy](https://thread.page/privacy).
