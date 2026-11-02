// SPDX-License-Identifier: Apache-2.0
// How a request reaches a session: a fixed marker and the request id, which the session claims through ThreadPage.
//
// Codex. `codex queue --thread <id> --message <text>` starts a turn in an open session as if the person typed it, with
// the session's own permissions; a turn that is running finishes first. Queued text can't be told apart from typing,
// so the waker sends only a fixed marker and the request id, `ThreadPage request <uuid>`: the session claims the
// request through ThreadPage, where the owner's note is. A queue into a closed session would wait and run at its next
// `codex resume`, so the waker queues only while its session is loaded here: Codex starts one such process per thread
// and ends it when it unloads the thread. A loaded thread may be on no screen: after /new or /resume the previous
// thread stays loaded about a minute. A request must never run in a thread the person can't see, so only the thread
// opened last in this Codex takes requests: Codex starts a new server process when the person opens a thread, each
// process takes the next number of a sequence under the Codex process's pid (siblings()), and an older one lets its
// tag go. Without that registry nothing is taken.
//
// Claude Code. The session's own inbox socket takes one JSON line and starts a turn, or is read between tool calls,
// as a message from another session. The socket is documented; the line's format is not, and Claude Code's inbound
// controls (crossSessionInbound) drop or hold a message without a word, so a post that worked proves nothing.
// sessionInbox() therefore says push only while its posts look answered, and pull, the plain truth of
// /threadpage:next, as soon as one goes unclaimed.
import { execFile, execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { alive, ensureDir, paths, readJson, remove } from './local.mjs';

export const MARKER = 'ThreadPage request';
const UUID_TEXT = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const UUID = new RegExp(`^${UUID_TEXT}$`, 'i');
/** The marker as a whole prompt: what Claude Code's UserPromptSubmit hook gets for a post to the inbox socket. */
export const WAKE = new RegExp(`^${MARKER} ${UUID_TEXT}$`, 'i');

/** Why this process may not wake its session now, or null. `startPpid` is its parent when it started and `ppid` its
 *  parent now; `agentAlive`: the agent's process lives; `stdinOpen`: the agent still talks to it; `closing`: it is
 *  ending; `opened` (Codex): siblings().state(), `superseded` once Codex opened another thread, `no_registry` without a
 *  registry. */
export function notLive({ startPpid, ppid, agentAlive, stdinOpen, closing, opened }) {
  if (closing) return 'closing';
  if (!stdinOpen) return 'stdin_closed';
  if (ppid !== startPpid) return 'parent_changed';
  if (!agentAlive) return 'parent_gone';
  if (opened) return opened;
  return null;
}

/** When the process `pid` started, as the system says it, or null: what tells a live sibling from a process that got
 *  its pid after it ended. */
export function processStart(pid, platform = process.platform) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    if (platform === 'linux') return readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').pop().split(' ')[19] || null;
    if (platform === 'win32') {
      return String(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).StartTime.ToUniversalTime().Ticks`], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, windowsHide: true })).trim() || null;
    }
    return String(execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 })).trim() || null;
  } catch {
    return null;
  }
}

/** The session server processes of one Codex process (`agentPid`), in ~/.threadpage/sessions/codex-<agentPid>/: one
 *  per loaded thread. Each takes the next number of a sequence by creating `<n>.json` exclusively (two that start
 *  together get two numbers; no clock decides), with its pid and that process's start time. The highest live number is
 *  the thread opened last. Nothing in them is a secret. */
export function siblings(agentPid, { pid = process.pid, env = process.env, startOf = processStart } = {}) {
  const dir = join(paths(env).sessions, `codex-${agentPid}`);
  const numbers = () => readdirSync(dir).map(name => Number(name.match(/^([0-9]+)\.json$/)?.[1])).filter(Number.isInteger);
  let own = null;
  const self = {
    get sequence() { return own?.sequence ?? null; },
    /** Takes this process's number; false when there is no registry to take it in, or no start time to prove who. */
    register() {
      const start = startOf(pid);
      if (!start) return false;
      try {
        ensureDir(dir);
        for (let sequence = Math.max(0, ...numbers()) + 1, tries = 0; tries < 1000; sequence += 1, tries += 1) {
          try {
            writeFileSync(join(dir, `${sequence}.json`), JSON.stringify({ pid, start }), { flag: 'wx', mode: 0o600 });
            own = { sequence, start };
            return true;
          } catch (error) {
            if (error.code !== 'EEXIST') return false;
          }
        }
      } catch { /* no registry */ }
      return false;
    },
    release() { if (own) remove(join(dir, `${own.sequence}.json`)); },
    /** Why this process's thread may not take requests: `no_registry` (fail closed), `superseded` (a live sibling took
     *  a higher number: Codex opened a thread after this one), or null. An entry whose pid is gone, or now belongs to a
     *  process that started at another time, is cleared. */
    state() {
      if (!own) return 'no_registry';
      let taken;
      try { taken = numbers(); } catch { return 'no_registry'; }
      const mine = readJson(join(dir, `${own.sequence}.json`));
      if (mine?.pid !== pid || mine.start !== own.start) return 'no_registry';
      for (const sequence of taken.filter(number => number > own.sequence)) {
        const entry = readJson(join(dir, `${sequence}.json`));
        // Being written by a server that just started: it is newer.
        if (!entry) return 'superseded';
        if (alive(entry.pid) && startOf(entry.pid) === entry.start) return 'superseded';
        remove(join(dir, `${sequence}.json`));
      }
      return null;
    },
  };
  return self;
}

/** How `codex queue` runs here. Elsewhere: argv, no shell. On Windows `codex` is often npm's codex.cmd, which runs only
 *  through the shell, so the line is quoted there; it can hold only the fixed marker and two UUIDs (checked again). */
export function queueCommand(target, id, platform = process.platform) {
  if (!UUID.test(String(target)) || !UUID.test(String(id))) throw new Error('Only a thread id and a request id are queued.');
  const args = ['queue', '--thread', target, '--message', `${MARKER} ${id}`];
  return platform === 'win32'
    ? { file: 'codex', args: args.map(arg => (arg.includes(' ') ? `"${arg}"` : arg)), options: { shell: true } }
    : { file: 'codex', args, options: {} };
}

/**
 * The waker of one session process. `live()`: notLive() now; `post(id)`: puts the marker into the session, and answers
 * { result: 'queued' | 'not_queued' | 'no_turn' | 'failed', reason? }; `queued(id)`: tells ThreadPage the request waits
 * in the session (status `queued`). Each request is tried at most once, one at a time, in the order they came. `last` is
 * the latest outcome, for threadpage_status.
 */
export function waker({ live, post, queued }) {
  const tried = new Set();
  let chain = Promise.resolve();
  const self = { last: null, wake };

  function wake(requestId) {
    if (!UUID.test(String(requestId)) || tried.has(requestId)) return chain;
    tried.add(requestId);
    chain = chain.then(() => once(requestId)).catch(() => {});
    return chain;
  }

  async function once(id) {
    const reason = live();
    if (reason) { self.last = { id, result: 'not_queued', reason }; return; }
    self.last = { id, ...await post(id) };
    if (self.last.result === 'queued') await queued(id);
  }

  return self;
}

/** waker's `post` for Codex. `thread()`: the session's own Codex thread id (from its first tools/call). */
export function codexQueue({ thread, env = process.env, run = execFile, platform = process.platform }) {
  return id => new Promise(resolve => {
    const target = thread();
    if (!UUID.test(String(target))) { resolve({ result: 'not_queued', reason: 'no_thread' }); return; }
    const command = queueCommand(target, id, platform); // the marker and two ids, nothing the owner or anyone else wrote
    run(command.file, command.args, { env, timeout: 60_000, windowsHide: true, ...command.options }, (error, _stdout, stderr) => {
      if (!error) resolve({ result: 'queued' });
      else if (/no rollout found/i.test(String(stderr))) resolve({ result: 'no_turn' });
      else resolve({ result: 'failed', reason: error.code === 'ENOENT' ? 'no_codex' : 'exit' });
    });
  });
}

/** What goes down the inbox socket for one request: the fixed marker and the id, nothing the owner or anyone else
 *  wrote. Native Windows requires the auth line, and it proves an own child after process evidence is gone. */
export function inboxLines(id, token) {
  if (!UUID.test(String(id))) throw new Error('Only a request id is posted.');
  const message = JSON.stringify({ type: 'user', message: { role: 'user', content: `${MARKER} ${id}` } });
  return `${token ? `${JSON.stringify({ type: 'auth', token })}\n` : ''}${message}\n`;
}

/** One connection, opened now that the lines are ready (Claude Code closes one silent for 30 s), for those lines only.
 *  Answers null, or an error code: never a message or a path, and never the lines, which may hold the token. */
function sendLines(socket, lines, timeout = 5000) {
  return new Promise(resolve => {
    let sent = false;
    const connection = createConnection(socket);
    const done = failure => { clearTimeout(timer); connection.destroy(); resolve(failure); };
    const timer = setTimeout(() => done(sent ? null : 'timeout'), timeout);
    connection.on('connect', () => connection.end(lines, () => { sent = true; }));
    connection.on('error', error => done(error.code || 'error'));
    connection.on('close', () => done(sent ? null : 'closed'));
  });
}

/**
 * How long a posted request may stay unclaimed before the session says pull again: 10 minutes. A busy session reads a
 * message only between tool calls and an idle one at once, so this has to outlast the longest ordinary wait: a
 * foreground Bash call ends within 10 minutes by default, and Claude Code's approval dialog for a held message closes
 * after 5. Waiting longer only prolongs a wrong `Queued in the session` for a session that dropped the message. Waiting
 * too little (a foreground subagent can run longer) costs one line that says `/threadpage:next` early: typing it takes
 * the request once, the late marker's claim then refuses, and that claim brings push back.
 */
export const UNCLAIMED_FOR = 10 * 60_000;

/**
 * The inbox socket of one Claude Code session. `socket` and `token`: what Claude Code exported to this process;
 * `held()`: the owner's Stop holds the session, so a turn could not claim anything; `unclaimed(id)`: a posted request
 * went UNCLAIMED_FOR without a claim. `delivery` is what each look says: push while it has an inbox, the last post
 * worked and no posted request went unclaimed since a claim last proved the way. `doubted` is the request that went unclaimed.
 */
export function sessionInbox({ socket, token, held, unclaimed, unclaimedFor = UNCLAIMED_FOR, send = sendLines }) {
  const posted = new Map(); // request id → { timer, looked }, until its claim
  let worked = !!socket; // a session with an inbox says push from its first look: a wrong word lasts one UNCLAIMED_FOR

  async function attempt(id) {
    if (!socket) return { result: 'failed', reason: 'no_inbox' };
    if (held()) return { result: 'not_queued', reason: 'stopped' };
    const failure = await send(socket, inboxLines(id, token));
    return failure ? { result: 'failed', reason: failure } : { result: 'queued' };
  }

  const self = {
    doubted: null,
    get delivery() { return worked && !self.doubted ? 'push' : 'pull'; },
    async post(id) {
      const outcome = await attempt(id).catch(() => ({ result: 'failed', reason: 'error' }));
      worked = outcome.result === 'queued';
      if (worked) {
        const timer = setTimeout(() => { self.doubted = id; void unclaimed(id); }, unclaimedFor);
        timer.unref();
        posted.set(id, { timer, looked: false });
      }
      return outcome;
    },
    /** The session listed its requests: what it claims next it found by looking (/threadpage:next), not by the marker. */
    looked() { for (const entry of posted.values()) entry.looked = true; },
    /** The session called claim_request for `id`, whatever the answer. Only a claim of a posted request, not found by
     *  looking, shows that a marker arrived. */
    claimed(id) {
      const entry = posted.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      posted.delete(id);
      if (!entry.looked) self.doubted = null;
    },
  };
  return self;
}

/** threadpage_status's line about the latest request the waker saw. */
export function wakeLine(last, next) {
  if (!last) return null;
  if (last.result === 'queued') return `Request ${last.id} went into this session's queue as "${MARKER} ${last.id}": that turn claims it with claim_request.`;
  if (last.result === 'no_turn') return `Request ${last.id} waits: Codex takes a queued request into a session only after its first turn. Send any message here, then ${next}.`;
  if (last.result === 'not_queued' && last.reason === 'no_thread') return `Request ${last.id} waits: Codex didn't name this session to ThreadPage, so it can't be woken. Take it here with ${next}.`;
  if (last.result === 'not_queued' && last.reason === 'no_registry') return `Request ${last.id} was not queued: ThreadPage can't tell which Codex thread is open here (no ~/.threadpage/sessions), so this session takes no requests.`;
  if (last.result === 'not_queued' && last.reason === 'superseded') return `Request ${last.id} was not queued: this Codex thread is no longer the one open, so the request waits for the thread you connect.`;
  if (last.result === 'not_queued') return `Request ${last.id} was not queued: this Codex session is no longer loaded here.`;
  return `Request ${last.id} waits: codex queue didn't take it${last.reason === 'no_codex' ? ' (no codex on PATH)' : ''}. Take it here with ${next}.`;
}

/** threadpage_status's line about the latest request a Claude Code session's inbox saw. */
export function inboxLine(last, doubted, next) {
  if (doubted) return `Request ${doubted} went to this session and wasn't claimed in ${UNCLAIMED_FOR / 60_000} minutes, so requests wait for ${next}: Claude Code may hold or refuse messages from other sessions here (crossSessionInbound).`;
  if (!last) return null;
  if (last.result === 'queued') return `Request ${last.id} went to this session as a message from another session, "${MARKER} ${last.id}": that claims it with claim_request. If nothing comes of it, take it here with ${next}.`;
  if (last.result === 'not_queued' && last.reason === 'stopped') return `Request ${last.id} waits: the owner's Stop holds this session until its turn ends or you type. Take it here with ${next}.`;
  if (last.result === 'not_queued') return `Request ${last.id} was not sent: this session is ending.`;
  if (last.reason === 'no_inbox') return `Request ${last.id} waits: this Claude Code gives ThreadPage no inbox to wake it through (an older version, or messaging is off). Take it here with ${next}.`;
  return `Request ${last.id} waits: this session's inbox didn't take it. Take it here with ${next}.`;
}
