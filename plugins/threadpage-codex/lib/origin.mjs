// SPDX-License-Identifier: Apache-2.0
// The ThreadPage this plugin talks to: always thread.page. A development stack on this computer may
// take its place through THREADPAGE_ORIGIN, and only over loopback http: a project's settings could set the variable,
// and an address off this computer would receive the computer key. A program running as this user can read that key
// anyway, so a loopback address gives it nothing more.
export const PRODUCTION = 'https://thread.page';
const LOOPBACK = /^(?:127\.0\.0\.1|localhost|\[::1\])$/i;

export function origin(env = process.env) {
  const raw = String(env.THREADPAGE_ORIGIN || '').trim();
  if (!raw) return PRODUCTION;
  let url;
  try { url = new URL(raw); } catch { throw new Error(`THREADPAGE_ORIGIN is not a URL: ${raw}`); }
  if (url.protocol !== 'http:' || !LOOPBACK.test(url.hostname) || url.pathname !== '/' || url.search || url.username) {
    throw new Error('THREADPAGE_ORIGIN takes only a development stack on this computer (http on 127.0.0.1, localhost or [::1]).');
  }
  return url.origin;
}

/** Whether a page the server names belongs to this ThreadPage: its origin, or, for a development stack, any loopback
 *  http address (its web app may run on a port of its own). The plugin opens no other page. */
export function trustedPage(value, base) {
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.origin === base) return true;
  const stack = new URL(base);
  return stack.protocol === 'http:' && LOOPBACK.test(stack.hostname) && url.protocol === 'http:' && LOOPBACK.test(url.hostname);
}
