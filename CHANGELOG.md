# Changelog

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
