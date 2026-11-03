#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# The owner's Stop. While ~/.threadpage/sessions/<Claude Code pid>.json exists, hook.mjs refuses this
# session's tool calls; the end of the turn removes it, with every request it names. Without that file every event
# ends at this one test.
stop="${HOME}/.threadpage/sessions/${CLAUDE_PID:-none}.json"
# A typed prompt or the end of the turn ends every permission prompt (prompt.sh); a tool call doesn't: one may run
# beside a prompt that is still open.
prompts="${HOME}/.threadpage/sessions/${CLAUDE_PID:-none}.prompts"
if [ "$1" != PreToolUse ] && [ -d "$prompts" ]; then rm -f "$prompts"/*.json; rmdir "$prompts" 2>/dev/null; fi
[ -f "$stop" ] || exit 0
if [ "$1" = Stop ]; then rm -f "$stop"; exit 0; fi
exec node "$(dirname "$0")/hook.mjs" "$1"
