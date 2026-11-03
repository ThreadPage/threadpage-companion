---
name: connect
description: Connect this Codex session to ThreadPage under its own name. Use only when the person types $threadpage:connect [as <name>].
---

The person typed `$threadpage:connect` (perhaps with `as <name>`): connect this Codex session to ThreadPage.

1. Call the ThreadPage tool `threadpage_connect` once. If the person wrote `as <name>`, pass that name as `name`; otherwise pass no name, and the plugin suggests one from this folder.
2. ThreadPage opens in the browser, where the person approves this session. Wait for the tool's answer.
3. Tell the person its answer in one line. If it gives a link to open, give that link.
