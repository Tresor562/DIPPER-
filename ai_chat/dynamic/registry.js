'use strict';

class DynamicCommandRegistry {
  constructor({ store = new Map() } = {}) { this.store = store; }
  _key(sessionId, name) { return `${sessionId || 'default'}:${String(name || '').toLowerCase()}`; }
  define(sessionId, spec) {
    if (!spec?.name || !spec?.workflow) throw new Error('Commande dynamique invalide');
    const record = {
      sessionId: sessionId || 'default',
      name: String(spec.name).toLowerCase(),
      workflow: structuredClone(spec.workflow),
      groupId: spec.groupId || null,
      expiresAt: spec.expiresAt || null,
      version: 1,
      createdAt: Date.now()
    };
    this.store.set(this._key(sessionId, record.name), record);
    return structuredClone(record);
  }
  get(sessionId, name, { groupId = null } = {}) {
    const record = this.store.get(this._key(sessionId, name));
    if (!record) return null;
    if (record.expiresAt && Date.now() >= record.expiresAt) return null;
    if (record.groupId && record.groupId !== groupId) return null;
    return structuredClone(record);
  }
}

module.exports = { DynamicCommandRegistry };
