/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║          𝐃𝐚𝐫𝐤 — Système VIP Database                  ║
 * ║  Sauvegarde JSON locale des utilisateurs VIP            ║
 * ║  Fichier : utils/vipDB.js                               ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Calqué sur premiumDB.js — même architecture, même logique.
 * Fichier : data/vip.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH  = path.join(DATA_DIR, 'vip.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return {};
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch { return {}; }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[vipDB] Erreur sauvegarde:', err.message);
  }
}

function normalizeJid(jid) {
  return String(jid).replace(/:[0-9]+/, '').split('@')[0];
}

function isVip(jid) {
  const db   = loadDB();
  const num  = normalizeJid(jid);
  const user = db[num];
  if (!user) return false;
  if (user.expiresAt && Date.now() > user.expiresAt) {
    delete db[num];
    saveDB(db);
    return false;
  }
  return true;
}

function addVip(jid, days = 0, addedBy = 'unknown') {
  const db        = loadDB();
  const num       = normalizeJid(jid);
  const now       = Date.now();
  const expiresAt = days > 0 ? now + days * 86400000 : null;
  db[num] = {
    jid      : `${num}@s.whatsapp.net`,
    addedAt  : now,
    addedBy  : normalizeJid(addedBy),
    expiresAt,
    days     : days || 'illimité',
  };
  saveDB(db);
  return { success: true, user: db[num] };
}

function removeVip(jid) {
  const db  = loadDB();
  const num = normalizeJid(jid);
  if (!db[num]) return false;
  delete db[num];
  saveDB(db);
  return true;
}

function listVip() {
  const db    = loadDB();
  const now   = Date.now();
  let changed = false;
  for (const num of Object.keys(db)) {
    if (db[num].expiresAt && now > db[num].expiresAt) {
      delete db[num];
      changed = true;
    }
  }
  if (changed) saveDB(db);
  return Object.values(db);
}

function getVipInfo(jid) {
  const db   = loadDB();
  const num  = normalizeJid(jid);
  const user = db[num];
  if (!user) return null;
  if (user.expiresAt && Date.now() > user.expiresAt) {
    delete db[num];
    saveDB(db);
    return null;
  }
  return user;
}

module.exports = { isVip, addVip, removeVip, listVip, getVipInfo };
