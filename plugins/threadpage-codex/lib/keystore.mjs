// SPDX-License-Identifier: Apache-2.0
// Where the computer key (`tpd_…`) lives, by record service `ThreadPage` and account = the ThreadPage origin:
// - macOS: the Keychain, through /usr/bin/security;
// - Linux with a Secret Service: secret-tool;
// - Linux and WSL without one: a 0600 file $XDG_STATE_HOME/threadpage/device in a 0700 folder;
// - anywhere nothing lasts between sessions (a Claude Code cloud session) or no store is known: this process's memory.
// A key reaches those tools on stdin, never on a command line. Only a computer key is ever stored: save() refuses
// anything else, so the session key (`tps_…`) cannot land here by mistake.
import { execFileSync } from 'node:child_process';
import { accessSync, constants, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeJson } from './local.mjs';

const SERVICE = 'ThreadPage';
export const DEVICE_KEY = /^tpd_[A-Za-z0-9_-]{32,60}$/;
export const MEMORY_ONLY = 'This environment keeps nothing between sessions, so ThreadPage asks in the browser each time.';

const quoted = value => `"${String(value).replace(/["\\]/g, '\\$&')}"`;
const memory = new Map();

function onPath(command, env) {
  return String(env.PATH || '').split(':').some(dir => {
    try { return !!dir && (accessSync(join(dir, command), constants.X_OK), true); } catch { return false; }
  });
}

export function stateFile(env = process.env) {
  return join(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state'), 'threadpage', 'device');
}

/** The store this environment uses: `keychain`, `secret-service`, `file` or `memory`. THREADPAGE_KEYSTORE=file|memory
 *  chooses one of the two that need no system service (a locked or absent keychain). */
export function storeKind({ env = process.env, platform = process.platform } = {}) {
  if (env.THREADPAGE_KEYSTORE === 'file' || env.THREADPAGE_KEYSTORE === 'memory') return env.THREADPAGE_KEYSTORE;
  if (env.CLAUDE_CODE_REMOTE_SESSION_ID) return 'memory';
  if (platform === 'darwin') return 'keychain';
  if (platform === 'linux') return env.DBUS_SESSION_BUS_ADDRESS && onPath('secret-tool', env) ? 'secret-service' : 'file';
  return 'memory';
}

/** The computer key store for one ThreadPage origin. `run` stands in for execFileSync in tests. */
export function keyStore(account, { env = process.env, platform = process.platform, run = execFileSync } = {}) {
  let kind = storeKind({ env, platform });
  const quiet = { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 };

  function readFile() {
    try { return JSON.parse(readFileSync(stateFile(env), 'utf8'))[account] || null; } catch { return null; }
  }
  function writeFile(key) {
    let all = {};
    try { all = JSON.parse(readFileSync(stateFile(env), 'utf8')); } catch { /* first key */ }
    writeJson(stateFile(env), { ...all, [account]: key });
  }

  function system(command, args) {
    try { return String(run(command, args, quiet)).trim() || null; } catch { return null; }
  }

  function read() {
    if (memory.has(account)) return memory.get(account);
    if (kind === 'keychain') return system('/usr/bin/security', ['find-generic-password', '-s', SERVICE, '-a', account, '-w']);
    // A Secret Service that refused a key earlier left it in the file.
    if (kind === 'secret-service') return system('secret-tool', ['lookup', 'service', SERVICE, 'account', account]) || readFile();
    return kind === 'file' ? readFile() : null;
  }

  function save(key) {
    if (!DEVICE_KEY.test(String(key))) throw new Error('Only a ThreadPage computer key is stored.');
    try {
      if (kind === 'keychain') {
        // `security -i` reads its command from stdin: the key never appears in a process list.
        run('/usr/bin/security', ['-i'], { input: `add-generic-password -U -s ${quoted(SERVICE)} -a ${quoted(account)} -w ${quoted(key)}\n`, stdio: ['pipe', 'ignore', 'pipe'], timeout: 5000 });
        return;
      }
      if (kind === 'secret-service') {
        try {
          run('secret-tool', ['store', `--label=${SERVICE}`, 'service', SERVICE, 'account', account], { input: key, stdio: ['pipe', 'ignore', 'pipe'], timeout: 5000 });
          return;
        } catch { kind = 'file'; }
      }
      if (kind === 'file') { writeFile(key); return; }
    } catch { kind = 'memory'; }
    memory.set(account, key);
  }

  return { get kind() { return kind; }, read, save };
}
