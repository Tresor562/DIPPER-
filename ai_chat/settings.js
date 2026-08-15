'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  enabled: true,
  onlyTag: false,
  ownerOnly: false,
  groups: true,
  private: true
});

const safeSessionId = value => String(value || 'default').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120) || 'default';

function fileFor(sessionId) {
  return path.join(process.cwd(), 'data', 'exaucee', 'sessions', safeSessionId(sessionId), 'settings.json');
}

function loadSettings(sessionId, env = process.env) {
  const envEnabled = String(env.EXAUCEE_ENABLED ?? 'true').toLowerCase() !== 'false';
  const base = { ...DEFAULTS, enabled: envEnabled };
  try {
    const parsed = JSON.parse(fs.readFileSync(fileFor(sessionId), 'utf8'));
    return { ...base, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch (_) {
    return base;
  }
}

function saveSettings(sessionId, patch) {
  const next = { ...loadSettings(sessionId), ...(patch || {}) };
  const file = fileFor(sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, file);
  return next;
}

function resetSettings(sessionId) {
  const file = fileFor(sessionId);
  try { fs.unlinkSync(file); } catch (_) {}
  return loadSettings(sessionId);
}

module.exports = { DEFAULTS, loadSettings, saveSettings, resetSettings, fileFor, safeSessionId };
