# ThreadPage for Codex

Connects a Codex session to your ThreadPage (https://thread.page) under its own name. On ThreadPage Pro with Sync on, the session can read your threads, add notes, and take the requests you address to its @name. On Free, or on Pro without Sync, it can only add notes to your Inbox: it doesn't read your notes and takes no requests. A name first connected on Free, or without Sync, keeps that access after you move to Pro or turn on Sync. To take requests, connect the session under a new name (`$threadpage:connect as <name>`).

## Use

```sh
codex plugin marketplace add ThreadPage/threadpage-companion
codex plugin add threadpage@threadpage
```

Then start a new Codex session, send it any message, then type `$threadpage:connect` (or `$threadpage:connect as <name>`). You approve each connection in ThreadPage in your browser. `$threadpage:next` takes the oldest request that waits for the session. To give a session only its own name, start it with `codex --disable apps`, so the ChatGPT apps connector doesn't add a second ThreadPage connection.

Runs on macOS, Linux and Windows through WSL, with Node.js 22.20 or later on Node 22, or 24.8 or later. Native Windows isn't supported.

## Requests

Only you, the account's owner, can address a request to your sessions, and ThreadPage makes a request only of a note you wrote yourself. A request starts in the session once it has no running turn, as if you had typed it, with the session's own sandbox and approval settings, and it doesn't wait for anyone at the terminal: `Live` in ThreadPage means the session is loaded, not that anyone is looking at it. Under `--ask-for-approval never` the session carries it out without asking. To stop requests from starting in a session, Disconnect it in ThreadPage → Settings → Connections.

## What it runs

- **A local MCP server:** `.mcp.json` starts `node ./server/launch.mjs` in this plugin's folder, with `THREADPAGE_AGENT=codex` and, besides Codex's minimal environment, only the variables it lists. The launcher checks the Node version and starts `server/server.mjs` without Node's inspector, preloads or `NODE_TLS_REJECT_UNAUTHORIZED`; on an older Node it offers only a tool that says what to update.
- **Network:** HTTPS to `https://thread.page` only (`/api/v1/agent-sessions/…` and `/mcp`), never following a redirect. `THREADPAGE_ORIGIN` may point it at a development copy of ThreadPage on this computer, over loopback http only. It fetches nothing else.
- **Approval in the browser:** every connection opens ThreadPage in your browser (`open`, `xdg-open`, `wslview` or `$BROWSER`), and the server listens once on `127.0.0.1` for the answer. Without a browser on this computer (SSH, Linux without a display) it shows a code to approve elsewhere and asks you for the two digits ThreadPage then shows. A Codex session never reconnects by itself.
- **Programs:** `/usr/bin/security` (macOS) or `secret-tool` (Linux) to keep this computer's key, and `ps` (macOS) to tell its own processes apart.
- **The waker:** a request addressed to the session becomes `codex queue --thread <this session's thread> --message "ThreadPage request <id>"`, run without a shell: a turn that starts after the running one and names only the request, never the note's text. The session claims the request from ThreadPage and does it with its own permissions. It queues only while the thread is loaded here and is the one opened last, so a request never runs in a thread you can't see.
- No hooks. When you stop a request in ThreadPage, ThreadPage refuses the session's ThreadPage tools for it; the session may finish its current step.

## What it keeps and sends

- The session's key lives only in the server's memory. This computer's key, which only connects sessions, is in the macOS Keychain, the Linux Secret Service, or the file `~/.local/state/threadpage/device`.
- `~/.threadpage` keeps the names your folders used (by the folder's path), the name each thread held (by its id, for 30 days) and one file for each loaded Codex thread; no keys and no note content. It stays on this computer.
- ThreadPage receives, when a session connects, this computer's name (its hostname) and the session's name and thread id; with each call, the plugin's and Codex's versions; while the session is connected, whether a request went into it; and the calls of its tools.

Details: [SECURITY.md](https://github.com/ThreadPage/threadpage-companion/blob/main/SECURITY.md) and the [privacy policy](https://thread.page/privacy).
