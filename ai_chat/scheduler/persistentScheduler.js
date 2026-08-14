'use strict';

const fs = require('fs');
const path = require('path');

class PersistentScheduler {
  constructor({ file = path.join(process.cwd(), 'data', 'exaucee', 'tasks.json'), pollMs = 5000 } = {}) {
    this.file = file;
    this.pollMs = Math.max(1000, Number(pollMs) || 5000);
    this.tasks = new Map();
    this.runner = null;
    this.timer = null;
    this.running = false;
    this._load();
  }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const task of Array.isArray(raw) ? raw : []) {
        if (task?.id) this.tasks.set(task.id, task);
      }
    } catch (_) {}
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...this.tasks.values()], null, 2));
    fs.renameSync(tmp, this.file);
  }

  schedule(task) {
    if (!task?.id || !task.runAt || !task.action) throw new Error('Tâche invalide');
    const normalized = {
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      createdAt: Date.now(),
      ...task,
      runAt: Number(task.runAt)
    };
    this.tasks.set(task.id, normalized);
    this._save();
    return structuredClone(normalized);
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
    return [...this.tasks.values()]
      .filter(t => t.status === 'pending' && Number(t.runAt) <= now)
      .sort((a, b) => Number(a.runAt) - Number(b.runAt));
  }

  markDone(id, result) {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.status = 'done';
    task.completedAt = Date.now();
    task.result = result ?? null;
    task.lastError = null;
    this._save();
    return true;
  }

  markFailed(id, error) {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.attempts = Number(task.attempts || 0) + 1;
    task.lastAttemptAt = Date.now();
    task.lastError = String(error?.message || error || 'unknown error').slice(0, 1000);
    if (task.attempts >= Number(task.maxAttempts || 3)) {
      task.status = 'failed';
      task.failedAt = Date.now();
    } else {
      const retryDelay = Math.min(60000, 1000 * (2 ** task.attempts));
      task.runAt = Date.now() + retryDelay;
    }
    this._save();
    return true;
  }

  async tick() {
    if (this.running || typeof this.runner !== 'function') return;
    this.running = true;
    try {
      for (const task of this.due()) {
        try {
          const result = await this.runner(structuredClone(task));
          this.markDone(task.id, result);
        } catch (error) {
          this.markFailed(task.id, error);
        }
      }
    } finally {
      this.running = false;
    }
  }

  ensureRunner(runner) {
    if (typeof runner === 'function') this.runner = runner;
    if (this.timer) return this.timer;
    this.timer = setInterval(() => this.tick().catch(() => {}), this.pollMs);
    if (this.timer.unref) this.timer.unref();
    this.tick().catch(() => {});
    return this.timer;
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  list({ status = null } = {}) {
    const all = [...this.tasks.values()];
    return structuredClone(status ? all.filter(t => t.status === status) : all);
  }
}

module.exports = { PersistentScheduler };
