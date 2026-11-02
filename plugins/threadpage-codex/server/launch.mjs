// SPDX-License-Identifier: Apache-2.0
// What Claude Code or Codex starts for the ThreadPage plugin. It holds no key: it checks the Node version, and on a
// supported one starts server.mjs without SIGUSR1's inspector, with only the NODE_OPTIONS that load no code, and without
// NODE_TLS_REJECT_UNAUTHORIZED, so the process that holds the keys always checks ThreadPage's certificate
// (NODE_EXTRA_CA_CERTS still adds the certificates it trusts). Then it forwards signals and exits as the server does.
// On an older Node it answers MCP itself with one tool that says what to update. It reads nothing on stdin while the
// server runs: the server has stdin, stdout and stderr as they are.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { childNodeOptions } from '../lib/process.mjs';

const SERVER = fileURLToPath(new URL('./server.mjs', import.meta.url));
const PROTOCOL = '2025-11-25';

/** Node with --disable-sigusr1 out of its experimental stage: 22.20 up to 23, or 24.8 and later. */
export function supported(version) {
  const [major, minor] = String(version).replace(/^v/, '').split('.').map(Number);
  if (major === 22) return minor >= 20;
  if (major === 24) return minor >= 8;
  return major > 24;
}

export const oldNodeMessage = version => `ThreadPage sessions need Node.js 22.20 or later on Node 22, or 24.8 or later; this session runs Node ${version}. Update Node, then restart the session.`;

/** The answer to one MCP message on an older Node: only `threadpage_status`, which says what to update. */
export function oldNodeAnswer(message, version) {
  const { id, method } = message || {};
  if (id === undefined || id === null) return null;
  const text = oldNodeMessage(version);
  const reply = result => ({ jsonrpc: '2.0', id, result });
  if (method === 'initialize') return reply({ protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'threadpage', version: '0' }, instructions: text });
  if (method === 'ping') return reply({});
  if (method === 'tools/list') return reply({ tools: [{ name: 'threadpage_status', description: text, inputSchema: { type: 'object', properties: {}, additionalProperties: false } }] });
  if (method === 'tools/call') return reply({ content: [{ type: 'text', text }], isError: message.params?.name !== 'threadpage_status' });
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
}

function serveOldNode(version) {
  createInterface({ input: process.stdin }).on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const answer = oldNodeAnswer(message, version);
    if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
  }).on('close', () => process.exit(0));
}

/** The server's environment from the session's: `agentPid` is the agent's process, the launcher's parent. */
export function serverEnv(from, agentPid) {
  const { kept, dropped } = childNodeOptions(from.NODE_OPTIONS);
  const env = { ...from, THREADPAGE_CLAUDE_PID: String(agentPid) };
  delete env.NODE_OPTIONS;
  delete env.THREADPAGE_IGNORED_NODE_OPTIONS;
  delete env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (kept) env.NODE_OPTIONS = kept;
  if (dropped.length) env.THREADPAGE_IGNORED_NODE_OPTIONS = dropped.join(' ');
  return env;
}

function launch() {
  const env = serverEnv(process.env, process.ppid);
  const child = spawn(process.execPath, ['--disable-sigusr1', SERVER], { stdio: 'inherit', env });
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => { child.kill(signal); });
  child.on('error', error => { process.stderr.write(`threadpage: ${error.message}\n`); process.exit(1); });
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

const main = (() => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (main) {
  if (supported(process.versions.node)) launch();
  else serveOldNode(process.versions.node);
}
