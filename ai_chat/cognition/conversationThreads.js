'use strict';

const DEFAULT_TTL_MS = 4 * 60 * 1000;

class ConversationThreads {
  constructor({ ttlMs = DEFAULT_TTL_MS, max = 2000 } = {}) {
    this.ttlMs = Math.max(30000, Number(ttlMs) || DEFAULT_TTL_MS);
    this.max = Math.max(100, Number(max) || 2000);
    this.items = new Map();
  }

  _key(sessionId, chatId, userId) {
    return `${sessionId || 'default'}::${chatId || ''}::${userId || ''}`;
  }

  touch(sessionId, chatId, userId) {
    if (!chatId || !userId) return false;
    const key = this._key(sessionId, chatId, userId);
    this.items.set(key, Date.now() + this.ttlMs);
    if (this.items.size > this.max) this.prune();
    return true;
  }

  active(sessionId, chatId, userId) {
    const key = this._key(sessionId, chatId, userId);
    const until = this.items.get(key) || 0;
    if (until <= Date.now()) {
      this.items.delete(key);
      return false;
    }
    return true;
  }

  close(sessionId, chatId, userId) {
    return this.items.delete(this._key(sessionId, chatId, userId));
  }

  prune() {
    const now = Date.now();
    for (const [key, until] of this.items) if (until <= now) this.items.delete(key);
    if (this.items.size <= this.max) return;
    const ordered = [...this.items.entries()].sort((a, b) => a[1] - b[1]);
    for (const [key] of ordered.slice(0, this.items.size - this.max)) this.items.delete(key);
  }
}

module.exports = { ConversationThreads, DEFAULT_TTL_MS };
