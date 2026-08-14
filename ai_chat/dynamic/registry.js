'use strict';

const fs = require('fs');
const path = require('path');

class DynamicCommandRegistry {
  constructor({ file = path.join(process.cwd(), 'data', 'exaucee', 'dynamic-commands.json') } = {}) {
    this.file = file;
    this.store = new Map();
    this._load();
  }

  _key(sessionId, name) {
    return `${sessionId || 'default'}:${String(name || '').toLowerCase()}`;
  }

  _load() {
    try {
      const rows = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const record of Array.isArray(rows) ? rows : []) {
        if (record?.name) this.store.set(this._key(record.sessionId, record.name), record);
      }
    } catch (_) {}
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...this.store.values()], null, 2));
    fs.renameSync(tmp, this.file);
  }

  define(sessionId, spec) {
    if (!spec?.name || !spec?.workflow) throw new Error('Commande dynamique invalide');
    const key = this._key(sessionId, spec.name);
    const previous = this.store.get(key);
    const record = {
      sessionId: sessionId || 'default',
      name: String(spec.name).toLowerCase(),
      workflow: structuredClone(spec.workflow),
      groupId: spec.groupId || null,
      expiresAt: spec.expiresAt || null,
      version: Number(previous?.version || 0) + 1,
      createdAt: previous?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    this.store.set(key, record);
    this._save();
    return structuredClone(record);
  }

  get(sessionId, name, { groupId = null } = {}) {
    const key = this._key(sessionId, name);
    const record = this.store.get(key);
    if (!record) return null;
    if (record.expiresAt && Date.now() >= record.expiresAt) {
      this.store.delete(key);
      this._save();
      return null;
    }
    if (record.groupId && record.groupId !== groupId) return null;
    return structuredClone(record);
  }

  remove(sessionId, name) {
    const removed = this.store.delete(this._key(sessionId, name));
    if (removed) this._save();
    return removed;
  }

  list(sessionId, { groupId = null } = {}) {
    const prefix = `${sessionId || 'default'}:`;
    const now = Date.now();
    const rows = [];
    let dirty = false;
    for (const [key, record] of this.store.entries()) {
      if (!key.startsWith(prefix)) continue;
      if (record.expiresAt && now >= record.expiresAt) {
        this.store.delete(key);
        dirty = true;
        continue;
      }
      if (record.groupId && record.groupId !== groupId) continue;
      rows.push(structuredClone(record));
    }
    if (dirty) this._save();
    return rows;
  }
}

module.exports = { DynamicCommandRegistry };
