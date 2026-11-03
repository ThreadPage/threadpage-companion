# Changelog

## v1.11.0 — 2026-11-03

- A session name whose access you never changed follows your plan: once you're on ThreadPage Pro with Sync on, it reads, adds and takes requests; /threadpage:next and $threadpage:next point to Receive requests otherwise.
- When ThreadPage changes a session's access or name, the session reloads its tools on its next check, and its threadpage_status tool names its access level.
- In Claude Code, a Stop holds every request stopped in the turn, and a claim ThreadPage refuses while another call for the same request runs no longer drops that request.
- Listing details for the plugin directories: the Claude Code plugin's display name, links and keywords, and the Codex plugin's short description, icons and support link.

Changes: https://github.com/ThreadPage/threadpage-companion/compare/v1.10.0...v1.11.0

## v1.10.0 — 2026-11-03

- A Stop holds a session for a request it still runs: a re-claim, a needs_input answer and a result that wasn't recorded keep the request held.
- A claim ThreadPage refused no longer leaves a Stop holding a turn of your own.
- /threadpage:next and $threadpage:next say plainly when a session's name takes no requests, and how to connect one that does.
- The READMEs say a name first connected on Free or without Sync keeps that access after you move to Pro or turn on Sync.

Changes: https://github.com/ThreadPage/threadpage-companion/compare/v1.9.0...v1.10.0

## v1.9.0 — 2026-11-03

- On ThreadPage Pro with Sync a session reads, adds and takes requests to its @name; on Free, or Pro without Sync, it adds notes to your Inbox, and /threadpage:next and $threadpage:next say so.
- The READMEs say what runs without you, what the plugins keep and send, and how to keep requests from starting by themselves.
- A Stop holds a Claude Code session only for a request it claimed.
- A listing icon for the Claude Code plugin; LICENSE and NOTICE in each plugin folder.

Changes: https://github.com/ThreadPage/threadpage-companion/compare/v1.8.0...v1.9.0

## v1.8.0 — 2026-11-02

- First release: connect a Claude Code or Codex session to ThreadPage under its own @name.
- A note you address to a session reaches it on its own, and its answer comes back as a note. In Claude Code it arrives through the session's inbox: an idle session starts a turn, a busy one reads it between tool calls. In Codex it starts after the running turn.
- /threadpage:next (Claude Code) and $threadpage:next (Codex) take a request that waits, also one that Claude Code's "Messages from your other sessions" (crossSessionInbound) held or refused.
