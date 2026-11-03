# Security

Report a vulnerability through GitHub's private vulnerability reporting on this repository. We answer within 3 working days. Only the latest release is supported.

## What the ThreadPage plugins for Claude Code and Codex keep and do
- **Keeps this computer's ThreadPage key**, which only connects sessions, under the service `ThreadPage` and the account `https://thread.page`:
  - macOS: in the login Keychain, through `/usr/bin/security`. The plugin stores and reads it through that tool, so any program running as your user can read it the same way, without a prompt.
  - Linux with `secret-tool` and a D-Bus session: in the Secret Service.
  - Linux and WSL without one, or when the Secret Service refuses it: in `~/.local/state/threadpage/device` (under `$XDG_STATE_HOME` when that is set), readable by your user only.
  - A Claude Code cloud session or native Windows: in memory only, so ThreadPage asks in the browser each time.
  - `THREADPAGE_KEYSTORE=file` or `THREADPAGE_KEYSTORE=memory` chooses the file or memory instead.

  A session's own key is never written anywhere: it lives in the memory of that session's ThreadPage process, which starts without Node's inspector, preloads, debugging options or `NODE_TLS_REJECT_UNAUTHORIZED`. So does the token Claude Code gives that process for its session's own inbox socket (`CLAUDE_CODE_MESSAGING_TOKEN`), which goes only to that socket.
- **Keeps in `~/.threadpage`**, a folder only your user can open, no keys and no note content:
  - `names.json`: for each ThreadPage address, the names each folder held (by the folder's path), the name each conversation held (by its id, for 30 days) and which process holds a name now.
  - `sessions/<pid>.json`: your Stop for a running Claude Code session, until its turn ends or you type.
  - `sessions/<pid>.ref.json`: a Claude Code session's new id after `/clear` or `/resume`, until its ThreadPage process reads it.
  - `sessions/<pid>.prompts/`: one file for each tool call Claude Code asks you to approve, named by a hash of the call and holding only when the Claude Code process started, until the call ends, you type or the turn ends. This happens in every Claude Code session with the plugin enabled, connected or not.
  - The files of a Claude Code session that ended before removing them (it crashed or was killed) stay until a session on this computer runs `/clear` or `/resume`, which removes them.
  - `sessions/codex-<pid>/<n>.json`: one for each loaded Codex thread, with its ThreadPage process's id and start time. A process removes its own file when it exits; the folders of Codex processes that ended stay until you remove them.
- **Sends ThreadPage**, besides the calls of its tools: when a session connects or returns to its name, this computer's name (its hostname), the session's name (suggested from its folder's name, never the path) and the session's id in Claude Code or Codex; with each call, the plugin's and the agent's versions; while it is connected, whether it waits for your approval and whether a request went into it.
- **Can:** connect a session under a name you approve in ThreadPage, then read and add notes with that session's access and learn the ids of requests addressed to it. A Claude Code session that this computer connected in the last 30 days may return to its name by itself, without the browser, when Claude Code restarts its ThreadPage process; ThreadPage allows that only within 18 hours of the name's last use or approval and records each return.
- **Cannot:** take a new name, take a name from another computer or renew the computer key without your click in ThreadPage. It restricts Claude Code or Codex in one way only: when you stop a request that a Claude Code session claimed, that session's tool calls are refused until its turn ends or you type. That is your own Stop. Codex has no such hold: ThreadPage refuses the session's ThreadPage tools for that request, and the session may finish its current step.
- **Runs with your permissions.** A ThreadPage request runs in the Claude Code or Codex session you started, with that session's mode, rules and approvals, as if you had typed it, also while no one is at the terminal; each plugin's README says how to keep requests from starting by themselves. In Codex it arrives as a message that names only the request (`ThreadPage request <id>`), queued while the session is loaded on this computer.
- **Revoke:** ThreadPage → Settings → Connections: Disconnect the session, or `Remove computer…` for this computer.
- **Remove local data:** uninstall the plugin, delete `~/.threadpage`, and delete this computer's key: on macOS `security delete-generic-password -s ThreadPage -a https://thread.page`; on Linux `secret-tool clear service ThreadPage account https://thread.page`, or the file `~/.local/state/threadpage/device`.
