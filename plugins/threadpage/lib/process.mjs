// SPDX-License-Identifier: Apache-2.0
// What Node may carry into the process that holds a session's keys. The launcher passes on only the
// NODE_OPTIONS that change no code the process runs; the server refuses to hold a key when an inspector or a preload
// could read its memory anyway (started some other way than through the launcher).
import inspector from 'node:inspector';

/** NODE_OPTIONS the server keeps: certificate stores and the heap size. NODE_EXTRA_CA_CERTS passes as a variable. */
const KEPT = [/^--use-system-ca$/, /^--use-openssl-ca$/, /^--max[-_]old[-_]space[-_]size=[0-9]+$/];
const INSPECTOR = /^--inspect/;
const PRELOAD = /^(?:-r|--require|--import|--loader|--experimental-loader)(?:=|$)/;

/** NODE_OPTIONS split as Node splits it: on spaces, with double quotes around a value that has them. */
export function nodeOptionTokens(value = '') {
  const tokens = [];
  let token = '', quoted = false, started = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '\\' && quoted && index + 1 < value.length) { token += value[++index]; continue; }
    if (char === '"') { quoted = !quoted; started = true; continue; }
    if (/\s/.test(char) && !quoted) { if (started) tokens.push(token); token = ''; started = false; continue; }
    token += char; started = true;
  }
  if (started) tokens.push(token);
  return tokens;
}

/** The server's NODE_OPTIONS from the session's: `kept` joined as Node reads it, `dropped` as they stood. */
export function childNodeOptions(value = '') {
  const kept = [], dropped = [];
  for (const token of nodeOptionTokens(value)) (KEPT.some(pattern => pattern.test(token)) ? kept : dropped).push(token);
  return { kept: kept.join(' '), dropped };
}

/** Why this process must not hold a key, or null: `inspector` or `preload`, with the flags that say so. */
export function unsafeProcess({ execArgv = process.execArgv, env = process.env, inspectorUrl = inspector.url() } = {}) {
  const flags = [...execArgv, ...nodeOptionTokens(env.NODE_OPTIONS || '')];
  if (inspectorUrl || flags.some(flag => INSPECTOR.test(flag))) return { reason: 'inspector', flags: flags.filter(flag => INSPECTOR.test(flag)) };
  const preload = flags.filter(flag => PRELOAD.test(flag));
  return preload.length ? { reason: 'preload', flags: preload } : null;
}

/** What the person changes so the session can connect. */
export function unsafeMessage(found) {
  if (found.reason === 'inspector') return "ThreadPage won't connect: Node's inspector is on in its process. Remove --inspect from how this session starts programs (NODE_OPTIONS, CLAUDE_CODE_SHELL_PREFIX), then restart the session.";
  return `ThreadPage won't connect: Node loads other code into its process (${found.flags.join(' ')}). Remove it from how this session starts programs (NODE_OPTIONS, CLAUDE_CODE_SHELL_PREFIX), then restart the session.`;
}
