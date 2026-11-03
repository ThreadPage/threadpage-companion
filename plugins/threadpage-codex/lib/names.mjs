// SPDX-License-Identifier: Apache-2.0
// Which name a session suggests, from a map on this computer that ThreadPage never sees: per ThreadPage
// origin, folder → the tags it held, conversation (CLAUDE_CODE_SESSION_ID) → its tag, and tag → the Claude Code
// process holding it now. A folder is offered back only a tag it held itself; otherwise its name, with -2, -3… past a
// name another folder here holds, so ~/work/api and ~/oss/api become api and api-2. It holds no secret.
import { basename } from 'node:path';
import { alive, paths, readJson, writeJson } from './local.mjs';

export const HANDLE = /^[\p{L}\p{N}_-]{1,32}$/u;
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const KEEP_SESSIONS_MS = 30 * 24 * 3600_000;

/** A folder name as a tag: letters, digits, _ and -, at most 32, lowercase. */
export function slug(name) {
  const cleaned = String(name || '').normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/-{2,}/g, '-').replace(/^[-_]+|[-_]+$/g, '');
  return cleaned.slice(0, 32).replace(/[-_]+$/, '') || 'session';
}

export function numbered(base, n) {
  if (n <= 1) return base;
  const suffix = `-${n}`;
  return `${base.slice(0, 32 - suffix.length).replace(/[-_]+$/, '')}${suffix}`;
}

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

export function nameMap(origin, env = process.env) {
  const file = paths(env).names;
  const load = () => {
    const all = readJson(file, {}) || {};
    const mine = all[origin] || {};
    return { all, mine: { folders: mine.folders || {}, sessions: mine.sessions || {}, live: mine.live || {} } };
  };
  const save = (all, mine) => writeJson(file, { ...all, [origin]: mine });
  const liveElsewhere = (mine, tag, pid) => Object.entries(mine.live).some(([name, holder]) => same(name, tag) && holder.pid !== pid && alive(holder.pid));

  return {
    /** The names to try in turn: this folder's own tags no other session here holds, then the folder's name. */
    *suggestions(folder, pid) {
      const { mine } = load();
      const own = mine.folders[folder] || [];
      for (const tag of own) if (!liveElsewhere(mine, tag, pid)) yield tag;
      const others = Object.entries(mine.folders).filter(([path]) => path !== folder).flatMap(([, tags]) => tags);
      const base = slug(basename(folder));
      for (let n = 1; n < 100; n += 1) {
        const name = numbered(base, n);
        if (own.some(tag => same(tag, name)) || others.some(tag => same(tag, name)) || liveElsewhere(mine, name, pid)) continue;
        yield name;
      }
    },
    /** The tag this conversation held in the last 30 days, for a server restarted in the same conversation. */
    forSession(sessionId) {
      const entry = SESSION_ID.test(sessionId || '') ? load().mine.sessions[sessionId] : null;
      return entry?.tag && Date.now() - Date.parse(entry.at) <= KEEP_SESSIONS_MS ? entry.tag : null;
    },
    /** This folder and conversation now hold `tag`, in Claude Code process `pid`. */
    hold(tag, { folder, sessionIds = [], pid }) {
      const { all, mine } = load();
      const now = Date.now();
      mine.folders[folder] = [tag, ...(mine.folders[folder] || []).filter(name => !same(name, tag))].slice(0, 8);
      for (const id of sessionIds) if (SESSION_ID.test(id || '')) mine.sessions[id] = { tag, at: new Date(now).toISOString() };
      for (const [id, entry] of Object.entries(mine.sessions)) if (now - Date.parse(entry.at) > KEEP_SESSIONS_MS) delete mine.sessions[id];
      for (const [name, holder] of Object.entries(mine.live)) if (!alive(holder.pid) || holder.pid === pid) delete mine.live[name];
      mine.live[tag] = { pid };
      save(all, mine);
    },
    /** This process no longer holds `tag`. */
    release(tag, pid) {
      const { all, mine } = load();
      if (mine.live[tag]?.pid !== pid) return;
      delete mine.live[tag];
      save(all, mine);
    },
  };
}
