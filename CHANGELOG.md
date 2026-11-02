# Changelog

## v1.8.0 — 2026-11-02

- First release: connect a Claude Code or Codex session to ThreadPage under its own @name.
- A note you address to a session reaches it on its own, and its answer comes back as a note. In Claude Code it arrives through the session's inbox: an idle session starts a turn, a busy one reads it between tool calls. In Codex it starts after the running turn.
- /threadpage:next (Claude Code) and $threadpage:next (Codex) take a request that waits, also one that Claude Code's "Messages from your other sessions" (crossSessionInbound) held or refused.
