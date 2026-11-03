// SPDX-License-Identifier: Apache-2.0
// How a session gets its key. The main way is a loopback redirect (RFC 8252) with PKCE S256 and
// a random state: ThreadPage's approval page sends the browser to 127.0.0.1 on this computer, and only this process
// holds the verifier that turns the code into a key. Without a browser here (SSH, Linux without a display, a cloud
// session) it is the device code, finished by number matching: the person types into this session the two digits
// the approval page shows, one try. The computer key goes only to `connect`; a new one from `token` replaces it.
import { spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { accessSync, constants } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { AGENT } from './agent.mjs';
import { ApiError } from './api.mjs';
import { trustedPage } from './origin.mjs';

export const SESSION_KEY = /^tps_[A-Za-z0-9_-]{32,60}$/;
const LOOPBACK = '127.0.0.1';

/** A refusal to show the person as it is. */
export class ConnectError extends Error {}
/** An approval in the browser is needed, and this attempt may not open one (a respawn reconnects only by itself). */
export class NeedsApproval extends Error {}

export function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

const equal = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function onPath(command, env) {
  return String(env.PATH || '').split(':').some(dir => {
    try { return !!dir && (accessSync(join(dir, command), constants.X_OK), true); } catch { return false; }
  });
}

/** Whether no browser can reach this computer's loopback: then the session connects with a device code. */
export function noBrowser(env = process.env, platform = process.platform) {
  if (env.SSH_CONNECTION || env.SSH_TTY || env.CLAUDE_CODE_REMOTE_SESSION_ID) return true;
  return platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY && !onPath('wslview', env);
}

/** Opens `url` in the person's browser: $BROWSER, or open / wslview / xdg-open. False when that failed at once. */
export function openBrowser(url, env = process.env, platform = process.platform) {
  const command = env.BROWSER ? [env.BROWSER]
    : platform === 'darwin' ? ['open']
      : platform === 'win32' ? ['rundll32', 'url.dll,FileProtocolHandler']
        : onPath('wslview', env) ? ['wslview'] : ['xdg-open'];
  return new Promise(resolve => {
    let child;
    try { child = spawn(command[0], [...command.slice(1), url], { stdio: 'ignore', detached: true, env }); } catch { resolve(false); return; }
    // A browser that started and did not fail at once is open: `open` and xdg-open hand the page over and exit 0.
    const timer = setTimeout(() => { child.unref(); resolve(true); }, 500);
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('exit', code => { clearTimeout(timer); resolve(code === 0); });
  });
}

const page = text => `<!doctype html><meta charset="utf-8"><title>ThreadPage</title><body style="font:16px system-ui;margin:3rem auto;max-width:32rem;padding:0 1rem"><p>${text}</p></body>`;

/** A one-use listener on 127.0.0.1 for the approval's redirect. Only `/cb` with this attempt's state counts; anything
 *  else is refused and the wait goes on. */
export async function listen() {
  const state = randomBytes(24).toString('base64url');
  let settle;
  const arrived = new Promise(resolve => { settle = resolve; });
  const server = createServer((request, response) => {
    const url = new URL(request.url, `http://${LOOPBACK}`);
    const reply = (status, text) => response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(page(text));
    if (request.method !== 'GET' || url.pathname !== '/cb') return reply(404, 'Not found.');
    if (!equal(url.searchParams.get('state'), state)) return reply(400, `This link isn't for this ${AGENT.name} session.`);
    const code = url.searchParams.get('code'), error = url.searchParams.get('error');
    if (!code && !error) return reply(400, 'This link has no approval.');
    settle({ code, error, finish: (ok, text) => reply(ok ? 200 : 400, text) });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, LOOPBACK, resolve); });
  const uri = `http://${LOOPBACK}:${server.address().port}/cb`;
  return {
    uri,
    state,
    /** The approval's redirect, or a rejection when it expires or the call is cancelled. */
    wait(ms, signal) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new ConnectError(`The approval expired before it came back. Connect again: ${AGENT.connect}`)), ms);
        signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
        arrived.then(value => { clearTimeout(timer); resolve(value); });
      });
    },
    close() { server.close(); server.closeAllConnections?.(); },
  };
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

/** A TLS failure fetch reports as its cause: a certificate this computer doesn't trust, often a proxy's. */
const CERTIFICATE = /CERT|SELF_SIGNED|UNABLE_TO_(?:GET|VERIFY)/;

/** The words for a refusal of `connect` or `token`. */
export function refusal(error, { name, origin }) {
  if (!(error instanceof ApiError)) {
    const proxy = CERTIFICATE.test(String(error?.cause?.code || '')) ? ' If a proxy on this network inspects HTTPS, give Node its certificate with NODE_EXTRA_CA_CERTS, then restart the session.' : '';
    return `ThreadPage at ${origin} couldn't be reached (${error.message}${error?.cause?.code ? `: ${error.cause.code}` : ''}).${proxy} Try again: ${AGENT.connect}`;
  }
  if (error.code === 'handle_taken') return `The name ${name} is taken in ThreadPage. Choose another: ${AGENT.connect} as <name>`;
  if (error.code === 'invalid_handle') return `${name} can't be a ThreadPage name: use up to 32 letters, digits, _ or -.`;
  if (error.status === 429) return `ThreadPage asks to wait ${error.retryAfter ?? 60} s before connecting again.`;
  if (error.status === 426) return `ThreadPage no longer takes this plugin version. Update it: ${AGENT.update}, then restart the session.`;
  if (error.status === 404) return `ThreadPage at ${origin} doesn't connect ${AGENT.name} sessions yet.`;
  if (error.code === 'invalid_grant') return `This approval didn't go through: it expired or was used. Connect again: ${AGENT.connect}`;
  return `ThreadPage refused to connect (${error.code}): ${error.message}`;
}

const REASONS = {
  new_computer: 'the first connection from this computer',
  renew: "this computer's ThreadPage key needs renewing",
  stale: 'it was offline for a while',
  other_computer: 'it is on another computer',
  live_lease: 'another session holds it for a request',
};

/**
 * Connects as the first name of `names` that ThreadPage takes. `ctx`: { api, store, origin, body (agent, agent_ref,
 * computer), deviceCode, interactive, signal, open(url) → bool, progress(text), waiting(url, opened),
 * askDigits(message) → { answer: Promise<string|null>, cancel() } | null }. Returns { key, session }.
 */
export async function connect(ctx, names, explicit) {
  for (const name of names) {
    try {
      return await attempt(ctx, name);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'handle_taken' && !explicit) continue;
      throw error;
    }
  }
  throw new ConnectError(`No free name is left to suggest. Choose one: ${AGENT.connect} as <name>`);
}

function finish(ctx, answer) {
  if (!SESSION_KEY.test(String(answer?.session_key)) || !answer.session?.name) throw new ConnectError(`ThreadPage sent no session key. Try again: ${AGENT.connect}`);
  if (answer.device_key) ctx.store.save(answer.device_key);
  return { key: answer.session_key, session: answer.session };
}

async function attempt(ctx, name) {
  const deviceKey = ctx.store.read();
  const body = { ...ctx.body, name };
  if (ctx.deviceCode) return deviceCode(ctx, body, deviceKey);
  const listener = await listen();
  try {
    const { verifier, challenge } = pkce();
    const answer = await ctx.api.connect({ ...body, via: 'loopback', redirect_uri: listener.uri, code_challenge: challenge, state: listener.state }, deviceKey);
    if (answer?.result === 'connected') return finish(ctx, answer);
    if (answer?.result !== 'approval_required' || answer.via !== 'loopback') throw new ConnectError(`ThreadPage answered in a way this plugin does not know. Update it: ${AGENT.update}`);
    if (!ctx.interactive) throw new NeedsApproval(answer.reason);
    if (!trustedPage(answer.approve_url, ctx.origin)) throw new ConnectError('ThreadPage named an approval page outside its own address; nothing was opened.');
    const arrival = listener.wait(1000 * (Number(answer.expires_in) || 600), ctx.signal);
    arrival.catch(() => {}); // awaited below; an expiry or a cancel while the browser opens is not unhandled
    const opened = await ctx.open(answer.approve_url);
    ctx.progress(`Approve @${name} in your browser${REASONS[answer.reason] ? ` (${REASONS[answer.reason]})` : ''}: ${answer.approve_url}`);
    ctx.waiting(answer.approve_url, opened);
    const back = await arrival;
    if (back.error) {
      back.finish(false, 'Not connected. You can close this tab.');
      throw new ConnectError(back.error === 'access_denied' ? 'You declined in ThreadPage, so this session is not connected.' : `ThreadPage did not approve (${back.error}).`);
    }
    let token;
    try {
      token = finish(ctx, await ctx.api.token({ connect_id: answer.connect_id, code: back.code, code_verifier: verifier }));
    } catch (error) {
      back.finish(false, `This approval didn't go through. Go back to ${AGENT.name}.`);
      throw error;
    }
    back.finish(true, `This ${AGENT.name} session is connected. You can close this tab.`);
    return token;
  } finally {
    listener.close();
  }
}

async function deviceCode(ctx, body, deviceKey) {
  const answer = await ctx.api.connect({ ...body, via: 'device_code' }, deviceKey);
  if (answer?.result === 'connected') return finish(ctx, answer);
  if (answer?.result !== 'approval_required' || answer.via !== 'device_code') throw new ConnectError(`ThreadPage answered in a way this plugin does not know. Update it: ${AGENT.update}`);
  if (!ctx.interactive) throw new NeedsApproval(answer.reason);
  if (!trustedPage(answer.verification_uri, ctx.origin)) throw new ConnectError('ThreadPage named an approval page outside its own address.');
  const where = `Open ${answer.verification_uri} and enter ${answer.user_code}.`;
  // The digits are asked once, in the dialog that also shows the code: the person approves in the browser, reads the
  // two digits there, and types them here. They are sent only after ThreadPage says the approval waits for them.
  let ask = ctx.askDigits?.(`${where} After you approve there, ThreadPage shows two digits: type them here.`);
  if (!ask) throw new ConnectError(`${where} This session can't ask you for the two digits ThreadPage then shows, so it can't connect without a browser on this computer.`);
  ctx.progress(where);
  let typed;
  ask.answer.then(value => { typed = value; });
  let interval = Number(answer.interval) || 5;
  const deadline = Date.now() + 1000 * (Number(answer.expires_in) || 600);
  try {
    while (Date.now() < deadline) {
      if (typed === null) throw new ConnectError('Not connected: the two digits were not given.');
      await sleep(interval * 1000, ctx.signal);
      try {
        return finish(ctx, await ctx.api.token({ device_code: answer.device_code }));
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        if (error.code === 'authorization_pending') continue;
        if (error.code === 'slow_down') { interval += 5; continue; }
        if (error.code === 'expired_token') break;
        if (error.code === 'access_denied') throw new ConnectError('You declined in ThreadPage, so this session is not connected.');
        if (error.code !== 'digits_required') throw error;
      }
      let digits = await ask.answer;
      // Claude Code does not hold a form to its pattern: a typo is asked again here and costs no try on the server.
      for (let again = 0; digits !== null && !/^[0-9]{2}$/.test(digits) && again < 2; again += 1) {
        ask = ctx.askDigits(`"${digits}" is not two digits. Type the two digits ThreadPage shows, for example 47.`);
        digits = await ask.answer;
      }
      if (!/^[0-9]{2}$/.test(digits || '')) throw new ConnectError(`Not connected: ThreadPage needs the two digits its page shows. Connect again: ${AGENT.connect}`);
      try {
        return finish(ctx, await ctx.api.token({ device_code: answer.device_code, digits }));
      } catch (error) {
        // One try: wrong digits cancel this approval on the server; nothing is sent again.
        if (error instanceof ApiError && error.code === 'access_denied') throw new ConnectError(`Those digits didn't match, so ThreadPage cancelled this approval. Connect again: ${AGENT.connect}`);
        throw error;
      }
    }
    throw new ConnectError(`The approval expired. Connect again: ${AGENT.connect}`);
  } finally {
    ask.cancel();
  }
}
