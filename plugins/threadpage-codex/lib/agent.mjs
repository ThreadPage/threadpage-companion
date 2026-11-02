// SPDX-License-Identifier: Apache-2.0
// Which agent runs this copy of the session server. Claude Code and Codex start the same launcher and
// server: the Codex plugin's .mcp.json sets THREADPAGE_AGENT=codex, and everything that differs between the two agents
// hangs on this one switch — the agent's id and product for ThreadPage, its own words and commands, and how a request
// reaches the session (in Claude Code its inbox socket; in Codex its own queue, lib/waker.mjs).
export const CODEX = process.env.THREADPAGE_AGENT === 'codex';

export const AGENT = CODEX
  ? { id: 'codex', product: 'codex', name: 'Codex', connect: '$threadpage:connect', next: '$threadpage:next', update: 'codex plugin marketplace upgrade threadpage' }
  : { id: 'claude_code', product: 'claude-code', name: 'Claude Code', connect: '/threadpage:connect', next: '/threadpage:next', update: 'claude plugin update threadpage@threadpage' };
