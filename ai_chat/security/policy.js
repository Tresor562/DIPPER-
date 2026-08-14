'use strict';

const REDACT_KEYS = /(token|secret|password|session|credential|cookie|authorization|api[_-]?key)/i;

function redact(value, depth = 0) {
  if (depth > 5) return '[MAX_DEPTH]';
  if (Array.isArray(value)) return value.slice(0, 50).map(v => redact(v, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = REDACT_KEYS.test(k) ? '[REDACTED]' : redact(v, depth + 1);
  return out;
}

function assertPermission({ actor = {}, tool = {} }) {
  const role = actor.isSuperMe ? 'supreme' : actor.isOwner ? 'owner' : actor.isSudo ? 'sudo' : actor.isAdmin ? 'admin' : 'user';
  const allowed = tool.allowedRoles || ['supreme', 'owner'];
  if (!allowed.includes(role)) {
    const err = new Error(`Permission refusée pour ${tool.name || 'outil'}`);
    err.code = 'EXAUCEE_PERMISSION_DENIED';
    throw err;
  }
  if (tool.destructive && !actor.confirmed) {
    const err = new Error('Confirmation explicite requise');
    err.code = 'EXAUCEE_CONFIRMATION_REQUIRED';
    throw err;
  }
  return true;
}

module.exports = { redact, assertPermission };
