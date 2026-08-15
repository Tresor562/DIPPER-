'use strict';

const fs = require('fs');
const path = require('path');

const sanitize = (v) => String(v || '').replace(/[^a-zA-Z0-9_@.+:-]/g, '_').slice(0, 180);

class MemoryStore {
  constructor({ root = path.join(process.cwd(), 'data', 'exaucee') } = {}) {
    this.root = root;
    this.cache = new Map();
  }

  _scope(sessionId, chatId, userId) {
    return [sanitize(sessionId || 'default'), sanitize(chatId || 'private'), sanitize(userId || 'shared')].join('__');
  }

  _file(scope) { return path.join(this.root, `${scope}.json`); }

  _load(scope) {
    if (this.cache.has(scope)) return this.cache.get(scope);
    let value = { facts: [], episodes: [], preferences: {}, summary: '', summaryTurns: 0, updatedAt: 0 };
    try { value = { ...value, ...JSON.parse(fs.readFileSync(this._file(scope), 'utf8')) }; } catch (_) {}
    this.cache.set(scope, value);
    return value;
  }

  getContext(ids) { return structuredClone(this._load(this._scope(ids.sessionId, ids.chatId, ids.userId))); }

  remember(ids, item) {
    if (!item || !item.value) return false;
    const scope = this._scope(ids.sessionId, ids.chatId, ids.userId);
    const state = this._load(scope);
    const bucket = item.type === 'episode' ? 'episodes' : 'facts';
    const value = String(item.value).slice(0, 3000);
    const duplicate = state[bucket].slice(-30).some(x => String(x.value) === value);
    if (!duplicate) state[bucket].push({ value, source: item.source || 'conversation', ts: Date.now() });
    state[bucket] = state[bucket].slice(bucket === 'episodes' ? -400 : -250);
    state.updatedAt = Date.now();
    this._persist(scope, state);
    return true;
  }

  setPreference(ids, key, value) {
    const scope = this._scope(ids.sessionId, ids.chatId, ids.userId);
    const state = this._load(scope);
    state.preferences[sanitize(key)] = value;
    state.updatedAt = Date.now();
    this._persist(scope, state);
  }

  updateSummary(ids, userText, assistantText) {
    const scope = this._scope(ids.sessionId, ids.chatId, ids.userId);
    const state = this._load(scope);
    state.summaryTurns = Number(state.summaryTurns || 0) + 1;

    // Résumé extractif local, sans appel réseau. Il conserve les éléments les plus
    // récents et importants lorsque la conversation devient longue. Le LLM/local
    // model reçoit ainsi une mémoire stable sans réinjecter des centaines de tours.
    const important = [];
    const u = String(userText || '').replace(/\s+/g, ' ').trim();
    const a = String(assistantText || '').replace(/\s+/g, ' ').trim();
    if (u) important.push(`U: ${u.slice(0, 420)}`);
    if (a) important.push(`E: ${a.slice(0, 420)}`);

    const previous = String(state.summary || '').split('\n').filter(Boolean);
    const combined = [...previous, ...important];
    state.summary = combined.slice(-28).join('\n').slice(-9000);
    state.updatedAt = Date.now();
    this._persist(scope, state);
    return state.summary;
  }

  clearConversation(ids, { keepFacts = true } = {}) {
    const scope = this._scope(ids.sessionId, ids.chatId, ids.userId);
    const state = this._load(scope);
    state.episodes = [];
    state.summary = '';
    state.summaryTurns = 0;
    if (!keepFacts) state.facts = [];
    state.updatedAt = Date.now();
    this._persist(scope, state);
  }

  _persist(scope, state) {
    fs.mkdirSync(this.root, { recursive: true });
    const target = this._file(scope);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, target);
  }
}

module.exports = { MemoryStore };
