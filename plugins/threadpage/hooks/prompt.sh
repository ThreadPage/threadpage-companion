#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Waiting for your approval. Claude Code is about to ask the person to approve a tool call (PermissionRequest:
# open), or a call ended (PostToolUse, PostToolUseFailure: closed). hook.mjs marks the call in
# ~/.threadpage/sessions/<Claude Code pid>.prompts/ and unmarks it when that same call ends, so a call running beside
# it never clears it; stop-guard.sh unmarks them all on a typed prompt or the end of the turn. The session's ThreadPage
# server says approval=pending on its long poll while a mark of this Claude Code process is there. Nothing here decides
# the prompt, and nothing is printed; without a mark a closed call ends at this one test.
prompts="${HOME}/.threadpage/sessions/${CLAUDE_PID:-none}.prompts"
if [ "$1" = open ]; then exec node "$(dirname "$0")/hook.mjs" PermissionRequest; fi
[ -d "$prompts" ] || exit 0
exec node "$(dirname "$0")/hook.mjs" PromptEnded
