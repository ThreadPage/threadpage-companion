# ThreadPage local clients

The ThreadPage plugins for Claude Code and Codex: each session you connect gets its own name in ThreadPage, reads your threads, adds notes, and takes the requests you address to it.

This repository is a read-only mirror. It is updated only from tagged ThreadPage releases, and changes are made only by ThreadPage. To report a security problem, see `SECURITY.md`.

The plugins run on macOS, Linux and Windows through WSL, and need Node.js 22.20 or later on Node 22, or 24.8 or later. Native Windows isn't supported: the Claude Code plugin's hooks need `sh`, and there neither plugin keeps this computer's ThreadPage key between sessions.

## Claude Code

```sh
claude plugin install threadpage --marketplace ThreadPage/threadpage-companion
```

Then, in a Claude Code session, `/threadpage:connect` connects it under a name suggested from its folder (`/threadpage:connect as <name>` picks one); you approve it once in ThreadPage in your browser. A request addressed to the session reaches it through its inbox: an idle session starts a turn, a busy one reads it between tool calls. If "Messages from your other sessions" (`crossSessionInbound`) holds or refuses it, `/threadpage:next` takes it. Requests run with that session's own permissions, so Claude Code asks you for what needs approval, as usual.

## Codex

```sh
codex plugin marketplace add ThreadPage/threadpage-companion
codex plugin add threadpage@threadpage
```

Then start a new Codex session, send it any message, and type `$threadpage:connect` (or `$threadpage:connect as <name>`); you approve each connection in ThreadPage in your browser. A request addressed to the session starts after the running turn, with the session's own permissions; `$threadpage:next` takes the oldest waiting request. `Live` in ThreadPage means the Codex session is loaded, not that anyone is looking at it. To give a Codex session only its own name, start it with `codex --disable apps`, so the ChatGPT apps connector does not add a second ThreadPage connection.

## More

What each plugin runs, sends and keeps: `plugins/threadpage/README.md`, `plugins/threadpage-codex/README.md` and `SECURITY.md`. `RELEASES.json` lists each release and the version of each client in it; `CHANGELOG.md` has each release's notes and, from the second release on, a link to its changes.
