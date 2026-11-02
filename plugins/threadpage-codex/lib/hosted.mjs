// SPDX-License-Identifier: Apache-2.0
// What the hosted ThreadPage serves a session, bundled with the plugin: its MCP instructions (hosted-instructions.md,
// the text ThreadPage's /mcp serves) and its tool catalog (catalog.json, as ThreadPage lists it for a connected session
// on Pro). /mcp answers no one without a key, so the session server serves the instructions itself. Codex reads a
// server's tools once, when its session starts, so a Codex session also lists the catalog from the start (Claude Code
// reads the tools again once connected): a note tool called before connecting says to connect first, and after
// connecting every call goes to the hosted /mcp. The hosted list and instructions are compared with the bundle then,
// and a difference is said, never hidden: tools are not dropped.
import { readFileSync } from 'node:fs';

const PRODUCTION = 'https://thread.page';
const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

export const CATALOG = JSON.parse(read('catalog.json')).tools;
const INSTRUCTIONS = read('hosted-instructions.md');

/** The bundled instructions as ThreadPage at `origin` serves them: it writes its own address for thread.page. */
export const instructionsAt = origin => INSTRUCTIONS.replaceAll(PRODUCTION, origin || PRODUCTION).trim();

/** JSON with object keys in order, so two equal definitions compare equal whatever their key order. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** The definition of a tool as it reaches the agent, with ThreadPage's own address written as thread.page. */
const definition = (tool, origin) => canonical(JSON.parse(JSON.stringify(tool).replaceAll(origin, PRODUCTION)));

/** The hosted tools the bundle lacks or holds otherwise: their names. A bundled tool the hosted list leaves out is
 *  the tag's level or plan, not drift. */
export function toolDrift(hosted, origin) {
  const bundled = new Map(CATALOG.map(tool => [tool.name, canonical(tool)]));
  return hosted.filter(tool => bundled.get(tool.name) !== definition(tool, origin)).map(tool => tool.name);
}

/** Whether the hosted instructions differ from the bundled ones. */
export const instructionsDrift = (hosted, origin) => typeof hosted === 'string' && hosted.trim() !== instructionsAt(origin);
