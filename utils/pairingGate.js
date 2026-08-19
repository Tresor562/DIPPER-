'use strict';

const GLOBAL_MAX = Number(process.env.WA_PAIRING_MAX_CONCURRENT || 3);
const LOCK_TIMEOUT_MS = Number(process.env.WA_PAIRING_LOCK_TIMEOUT_MS || 90000);
const locks = new Map();
let active = 0;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function normalize(value) { return String(value || '').replace(/\D/g, ''); }

async function acquire(phoneNumber) {
  const key = normalize(phoneNumber);
  if (!key) throw new Error('pairingGate: numéro invalide');
  const started = Date.now();

  while (true) {
    const existing = locks.get(key);
    const expired = existing && Date.now() - existing.startedAt > LOCK_TIMEOUT_MS;
    if (expired) {
      locks.delete(key);
      active = Math.max(0, active - 1);
    }

    if (!locks.has(key) && active < GLOBAL_MAX) {
      const token = Symbol(key);
      locks.set(key, { token, startedAt: Date.now() });
      active++;
      return () => {
        const current = locks.get(key);
        if (current?.token === token) {
          locks.delete(key);
          active = Math.max(0, active - 1);
        }
      };
    }

    if (Date.now() - started > LOCK_TIMEOUT_MS) {
      const err = new Error('Une autre connexion est déjà en préparation. Réessaie dans un instant.');
      err.code = 'PAIRING_BUSY';
      throw err;
    }
    await sleep(250);
  }
}

function stats() {
  return { active, maxConcurrent: GLOBAL_MAX, lockedNumbers: locks.size };
}

module.exports = { acquire, stats };
