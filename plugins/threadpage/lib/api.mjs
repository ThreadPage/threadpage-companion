// SPDX-License-Identifier: Apache-2.0
// ThreadPage as this process calls it: the agent-session routes (connect, token, events, status, ref, end) and the
// hosted MCP endpoint. Calls go only to the origin of lib/origin.mjs, through fetch's keep-alive pool, and never follow
// a redirect. The computer key goes only to `connect`; the session key to everything else.
import { existsSync, readFileSync } from 'node:fs';
import { AGENT } from './agent.mjs';

// The plugin's own manifest: .claude-plugin in the Claude Code plugin, .codex-plugin in the Codex one.
const MANIFEST = ['../.claude-plugin/plugin.json', '../.codex-plugin/plugin.json'].map(path => new URL(path, import.meta.url)).find(url => existsSync(url));
export const PLUGIN_VERSION = JSON.parse(readFileSync(MANIFEST, 'utf8')).version;
export const MCP_PROTOCOL = '2025-11-25';

export class ApiError extends Error {
  constructor(status, body, retryAfter = null) {
    super(body?.message || `ThreadPage answered ${status}.`);
    this.status = status;
    this.code = body?.code || `http_${status}`;
    this.details = body?.details || {};
    const seconds = Number(this.details.retry_after ?? retryAfter);
    this.retryAfter = Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }
}

async function parsed(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

/** The answer of a streamable-HTTP POST: plain JSON, or the message with `id` in an event stream. */
async function rpcAnswer(response, id) {
  if (!String(response.headers.get('content-type') || '').includes('text/event-stream')) return parsed(response);
  const text = await response.text();
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    try { const message = JSON.parse(data); if (message?.id === id) return message; } catch { /* not this one */ }
  }
  return null;
}

/** `agentVersion()`: the version the agent gave in MCP `initialize`. */
export function client({ origin, agentVersion = () => 'unknown' }) {
  const header = () => `threadpage/${PLUGIN_VERSION} ${AGENT.product}/${agentVersion()}`;

  async function call(method, path, { key, body, query, timeout = 15, signal } = {}) {
    const url = new URL(`/api/v1/agent-sessions/${path}`, origin);
    for (const [name, value] of Object.entries(query || {})) if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
    const headers = { Accept: 'application/json', 'ThreadPage-Client': header() };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const timer = AbortSignal.timeout(timeout * 1000);
    const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timer]) : timer, redirect: 'error' });
    const answer = await parsed(response);
    if (!response.ok) throw new ApiError(response.status, answer, response.headers.get('retry-after'));
    return answer;
  }

  let counter = 0;
  /** One JSON-RPC request to the hosted /mcp; the JSON-RPC message comes back as it is, `result` or `error`. */
  async function mcp(method, params, { key, signal, timeout = 300 } = {}) {
    const id = `tp-${++counter}`;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': MCP_PROTOCOL, 'ThreadPage-Client': header() };
    if (key) headers.Authorization = `Bearer ${key}`;
    const timer = AbortSignal.timeout(timeout * 1000);
    const response = await fetch(new URL('/mcp', origin), { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }), signal: signal ? AbortSignal.any([signal, timer]) : timer, redirect: 'error' });
    if (!response.ok) throw new ApiError(response.status, await parsed(response), response.headers.get('retry-after'));
    const message = await rpcAnswer(response, id);
    if (!message || (!('result' in message) && !('error' in message))) throw new ApiError(502, { code: 'bad_answer', message: 'ThreadPage sent no answer to this call.' });
    return message;
  }

  return {
    header,
    connect: (body, deviceKey) => call('POST', 'connect', { key: deviceKey || undefined, body }),
    token: body => call('POST', 'token', { body }),
    /** The long poll. Each look says how this session takes its requests (`delivery`: push | pull) and whether it
     *  waits at a permission prompt (`approval`: pending | ready), so the owner's line says `Waiting for
     *  /threadpage:next` or `Waiting for your approval` only while true. */
    events: (key, { after, wait, nonce, delivery, approval, signal }) => call('GET', 'events', { key, signal, timeout: wait + 20, query: { after, wait, nonce, delivery, approval } }),
    /** The session's state from ThreadPage's fixed list (`queued` after the waker put a request into the session). */
    status: (key, body) => call('POST', 'status', { key, body }),
    ref: (key, agentRef) => call('POST', 'ref', { key, body: { agent_ref: agentRef } }),
    end: key => call('POST', 'end', { key, body: {}, timeout: 3 }),
    /** The hosted server's instructions, read with the session key: /mcp answers no one without a key. */
    async instructions(key) {
      const message = await mcp('initialize', { protocolVersion: MCP_PROTOCOL, capabilities: {}, clientInfo: { name: 'threadpage-plugin', version: PLUGIN_VERSION } }, { key, timeout: 5 });
      return typeof message.result?.instructions === 'string' ? message.result.instructions : '';
    },
    async tools(key) {
      const tools = [];
      let cursor;
      for (let page = 0; page < 20; page += 1) {
        const message = await mcp('tools/list', cursor ? { cursor } : {}, { key, timeout: 15 });
        if (message.error) throw new ApiError(502, { code: 'tools_unavailable', message: message.error.message });
        tools.push(...(message.result?.tools || []));
        cursor = message.result?.nextCursor;
        if (!cursor) break;
      }
      return tools;
    },
    callTool: (key, params, signal) => mcp('tools/call', params, { key, signal }),
  };
}
