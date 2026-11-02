// SPDX-License-Identifier: Apache-2.0
// What looks like a credential in text a ThreadPage tool would write. The vectors are public, so this is a guard
// against accidents, not a security control: it asks to remove the value and send again.
const VECTORS = [
  ['ThreadPage token', /\btp[d]?_[A-Za-z0-9_-]{24,}\b/],
  ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ['OpenAI API key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/],
  ['Stripe key', /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
];

function strings(value, found = []) {
  if (typeof value === 'string') found.push(value);
  else if (Array.isArray(value)) value.forEach(item => strings(item, found));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => strings(item, found));
  return found;
}

/** The kind of the first credential-like value in a tool's input, or null. */
export function credentialIn(input) {
  for (const text of strings(input)) for (const [kind, pattern] of VECTORS) if (pattern.test(text)) return kind;
  return null;
}
