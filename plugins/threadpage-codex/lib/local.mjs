// SPDX-License-Identifier: Apache-2.0
// What the plugin keeps in ~/.threadpage (0700, files 0600). Nothing here is a secret: the name map (lib/names.mjs);
// per Claude Code process, the owner's Stop, the session's new id after /clear or /resume and the tool calls waiting
// for approval; per Codex process, its session servers (lib/waker.mjs). The computer key lives in lib/keystore.mjs; a
// session key is never written anywhere.
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const home = (env = process.env) => join(env.HOME || homedir(), '.threadpage');

export function paths(env = process.env) {
  const root = home(env);
  const sessions = join(root, 'sessions');
  return {
    root,
    names: join(root, 'names.json'),
    sessions,
    stop: pid => join(sessions, `${pid}.json`),
    ref: pid => join(sessions, `${pid}.ref.json`),
    /** The tool calls Claude Code asks the person to approve now, one mark each (hooks/prompt.sh). */
    prompts: pid => join(sessions, `${pid}.prompts`),
  };
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  return dir;
}

export function readJson(file, fallback = null) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

/** Written whole or not at all, readable by this user only, in a folder only this user opens. */
export function writeJson(file, value) {
  ensureDir(dirname(file));
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
}

export const remove = file => rmSync(file, { force: true, recursive: true });

export function list(dir) {
  try { return readdirSync(dir); } catch { return []; }
}

export function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

/** The Claude Code process this session runs in: the launcher names its own parent; started directly, our parent. */
export function claudePid(env = process.env) {
  const value = Number(env.THREADPAGE_CLAUDE_PID);
  return Number.isInteger(value) && value > 1 ? value : process.ppid;
}
