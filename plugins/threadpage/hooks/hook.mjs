// SPDX-License-Identifier: Apache-2.0
// The ThreadPage plugin's hooks. Identity never depends on them; they hold no key.
// - The Stop guard: when the owner stops a request this session holds, the plugin's server writes
//   ~/.threadpage/sessions/<Claude Code pid>.json. PreToolUse then refuses the session's tool calls until its turn ends
//   (stop-guard.sh removes the file on Stop); a prompt the person types ends it too. It is the person's own Stop.
// - SessionStart after /clear or /resume: the server keeps the session id it was started with, so the new one is left
//   in ~/.threadpage/sessions/<pid>.ref.json for it to send to ThreadPage (`ref`).
// - A permission prompt: PermissionRequest marks the call Claude Code is about to ask about in
//   ~/.threadpage/sessions/<pid>.prompts/<call>.json, with the start time of the Claude Code process (a later process
//   with the same pid is not taken for it); PromptEnded (PostToolUse, PostToolUseFailure of that same call) unmarks it.
// Usage: node hook.mjs <Event>, with Claude Code's hook input on stdin.
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { alive, list, paths, readJson, remove, writeJson } from '../lib/local.mjs';
import { processStart, WAKE } from '../lib/waker.mjs';

const pid = Number(process.env.CLAUDE_PID);
const out = value => process.stdout.write(JSON.stringify(value));

function preToolUse() {
  const stop = readJson(paths().stop(pid));
  if (!stop) return;
  out({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `The owner stopped ThreadPage request ${stop.request_id}. Make no more tool calls this turn: say what you stopped and end the turn.` } });
}

// What starts a turn without the person: a channel event of any server, a finished background task, ThreadPage's own
// wake (lib/waker.mjs). A post to the inbox socket reaches this hook as its raw text, unwrapped (seen on Claude Code
// 2.1.316), so the wake is the marker and nothing else; a person's sentence that mentions it is a typed prompt.
const NOT_TYPED = [/^\s*<(?:channel|task-notification)[\s>]/, WAKE];

function userPromptSubmit(input) {
  // Only a prompt the person types ends the Stop early: the person is back, and the stopped work is not resumed by it.
  const prompt = String(input.prompt || '');
  if (!NOT_TYPED.some(form => form.test(prompt))) remove(paths().stop(pid));
}

function sessionStart(input) {
  const { sessions, ref } = paths();
  for (const name of list(sessions)) {
    const owner = Number(name.split('.')[0]);
    if (Number.isInteger(owner) && owner !== pid && !alive(owner)) remove(`${sessions}/${name}`);
  }
  if (/^[A-Za-z0-9_-]{1,128}$/.test(input.session_id || '')) writeJson(ref(pid), { agent_ref: input.session_id, source: input.source });
}

/** JSON with object keys in order: the same call gives the same mark whatever the key order of its input. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
/** A call's mark: its tool and input (PermissionRequest carries no tool_use_id). */
const mark = input => join(paths().prompts(pid), `${createHash('sha256').update(canonical({ tool: input.tool_name, input: input.tool_input })).digest('hex').slice(0, 32)}.json`);

function permissionRequest(input) {
  writeJson(mark(input), { start: processStart(pid) });
}

function promptEnded(input) {
  remove(mark(input));
  if (!list(paths().prompts(pid)).length) remove(paths().prompts(pid));
}

const HANDLERS = { PreToolUse: preToolUse, UserPromptSubmit: userPromptSubmit, SessionStart: sessionStart, PermissionRequest: permissionRequest, PromptEnded: promptEnded };

async function main() {
  const handler = HANDLERS[process.argv[2]];
  if (!handler || !Number.isInteger(pid) || pid <= 1) return;
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try { input = JSON.parse(raw || '{}'); } catch { return; }
  handler(input);
}

await main();
