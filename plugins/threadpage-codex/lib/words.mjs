// SPDX-License-Identifier: Apache-2.0
// What the session says about its connection.
import { AGENT } from './agent.mjs';

export const NOT_CONNECTED = `This session isn't connected to ThreadPage. Connect it to read and add notes: ${AGENT.connect}.`;

/** `@name` on Pro, where the tag is a handle; the bare name on Free. */
export const who = session => (session?.handle ? `@${session.handle}` : session?.name || 'This session');

export function connectedLine(session) {
  return `Connected as ${who(session)} · ${session.level === 'inbox' ? 'Adds to your Inbox' : 'Read and add'}.`;
}

function clock(at) {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? 'just now' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** The one sentence for a session key ThreadPage ended (401 `session_ended`). */
export function endedSentence(details = {}, session = null) {
  const name = details.name ? (session?.handle ? `@${details.name}` : details.name) : who(session);
  const computer = details.computer || session?.computer?.name || 'another computer';
  switch (details.reason) {
    case 'replaced':
    case 'moved':
      return `${name} was taken by another session on ${computer} at ${clock(details.at)}. If that wasn't you, open ThreadPage → Connections → ${computer} → Remove computer….`;
    case 'disconnected':
      return `${name} was disconnected in ThreadPage.`;
    case 'device_removed':
      return `${computer} was removed in ThreadPage, so ${name} isn't connected here anymore.`;
    case 'workspace_reset':
      return `The ThreadPage workspace was reset, so ${name} isn't connected anymore. Connect again: ${AGENT.connect}`;
    case 'copy_detected':
      return `A copy of ${name}'s session key was used, so ThreadPage took it offline. Connect again: ${AGENT.connect}`;
    case 'expired':
      return `${name} had no contact with ThreadPage for a day, so its key ended. Connect again: ${AGENT.connect}`;
    default:
      return `ThreadPage no longer accepts ${name}'s session key. Connect again: ${AGENT.connect}`;
  }
}
