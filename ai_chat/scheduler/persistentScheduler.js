'use strict';

const fs = require('fs');
const path = require('path');

class PersistentScheduler {
  constructor({ file = path.join(process.cwd(), 'data', 'exaucee', 'tasks.json') } = {}) {
    this.file = file;
    this.tasks = new Map();
    this._load();
  }
  _load() {
    try {
      for (const task of JSON.parse(fs.readFileSync(this.file, 'utf8'))) this.tasks.set(task.id, task);
    } catch (_) {}
  }
  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify([...this.tasks.values()], null, 2));
  }
  schedule(task) {
    if (!task?.id || !task.runAt || !task.action) throw new Error('Tâche invalide');
    const normalized = { status: 'pending', attempts: 0, createdAt: Date.now(), ...task };
    this.tasks.set(task.id, normalized);
    this._save();
    return normalized;
  }
  cancel(id) {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.status = 'cancelled';
    task.cancelledAt = Date.now();
    this._save();
    return true;
  }
  due(now = Date.now()) {
    return [...this.tasks.values()].filter(t => t.status === 'pending' && Number(t.runAt) <= now);
  }
  markDone(id, result) {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.status = 'done';
    task.completedAt = Date.now();
    task.result = result || null;
    this._save();
    return true;
  }
}

module.exports = { PersistentScheduler };
