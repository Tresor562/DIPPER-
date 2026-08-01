/**
 * Purification Command - 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * Système de défense absolue du sanctuaire
 * Protection spam, flood, messages suspects, stabilisation bot
 */

const config = require('../../config');
const prefix = config.prefix || '.';
const fs     = require('fs');
const path   = require('path');
const sessionContext = require('../../utils/sessionContext');

// [PHASE 2] Isolation par session : avant, STATE_FILE/LOG_FILE pointaient
// vers deux fichiers uniques sous utils/, partagés par TOUTES les sessions
// (paramètres purification, journal de violations et liste des JIDs
// temporairement bloqués mélangés entre tous les utilisateurs du serveur).
// Réutilise le même dossier database/sessions/<sessionId>/ que database.js
// (Phase 1) — aucun nouveau mécanisme de stockage inventé.
function sessionStorageDir() {
  return path.join(process.cwd(), 'database', 'sessions', sessionContext.getCurrentSessionId());
}
function statePath() { return path.join(sessionStorageDir(), 'purification_state.json'); }
function logPath()   { return path.join(sessionStorageDir(), 'purification_logs.json'); }

// Migration non destructive des anciens fichiers globaux vers la session
// "default" (comportement identique pour le bot legacy mono-session).
let _legacyMigrationDone = false;
function migrateLegacyOnce() {
  if (_legacyMigrationDone) return;
  _legacyMigrationDone = true;
  try {
    if (sessionContext.getCurrentSessionId() !== sessionContext.DEFAULT_SESSION_ID) return;
    const dir = sessionStorageDir();
    const legacyState = path.join(process.cwd(), 'utils', 'purification_state.json');
    const legacyLog    = path.join(process.cwd(), 'utils', 'purification_logs.json');
    if (!fs.existsSync(legacyState) && !fs.existsSync(legacyLog)) return;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(legacyState) && !fs.existsSync(statePath())) fs.copyFileSync(legacyState, statePath());
    if (fs.existsSync(legacyLog) && !fs.existsSync(logPath()))     fs.copyFileSync(legacyLog, logPath());
    console.log('[purification] Migration : état/journal → sessions/default/');
  } catch (err) {
    console.error('[purification] migration échouée:', err.message);
  }
}

// ── Tracker flood en mémoire ──
const floodTracker  = {}; // { groupId: { jid: [timestamps] } }

// [PERF] Nettoyage périodique du floodTracker
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const groupId of Object.keys(floodTracker)) {
    for (const jid of Object.keys(floodTracker[groupId] || {})) {
      floodTracker[groupId][jid] = (floodTracker[groupId][jid] || []).filter(t => t > cutoff);
      if (floodTracker[groupId][jid].length === 0) delete floodTracker[groupId][jid];
    }
    if (Object.keys(floodTracker[groupId] || {}).length === 0) delete floodTracker[groupId];
  }
}, 5 * 60 * 1000).unref();
const warnTracker   = {}; // { groupId: { jid: warnCount } }
const blockedJids   = {}; // { groupId: Set<jid> }

// Paramètres par défaut
const FLOOD_SEUIL   = 7;   // 7 messages
const FLOOD_FENETRE = 5;   // en 5 secondes
const SPAM_LONGUEUR = 1500; // caractères max par message
const WARN_MAX      = 2;   // avertissements avant expulsion

// [PERF] Cache en mémoire pour éviter la lecture disque sur chaque message.
// Clé = chemin de fichier résolu (donc déjà isolé par session, comme database.js).
const _stateCache   = {}; // { filePath: { data, ts } }
const STATE_CACHE_TTL = 5000;

function loadState() {
  migrateLegacyOnce();
  const file = statePath();
  const now = Date.now();
  const cached = _stateCache[file];
  if (cached && (now - cached.ts) < STATE_CACHE_TTL) return cached.data;
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      _stateCache[file] = { data, ts: now };
      return data;
    }
  }
  catch (_) {}
  return {};
}
function saveState(data) {
  try {
    migrateLegacyOnce();
    const file = statePath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    _stateCache[file] = { data, ts: Date.now() };
  } catch (_) {}
}
function logActivity(groupId, jid, raison) {
  try {
    migrateLegacyOnce();
    const file = logPath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const logs = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    logs.push({ groupId, jid, raison, heure: new Date().toISOString() });
    // Garder seulement les 500 dernières entrées
    if (logs.length > 500) logs.splice(0, logs.length - 500);
    fs.writeFileSync(file, JSON.stringify(logs, null, 2), 'utf8');
  } catch (_) {}
}

// ==========================================
// MESSAGES VARIÉS (mêmes sens, mots différents)
// ==========================================
const MSGS_WARN = [
  (n) => `⚠️ @${n} — ᴄᴏᴍᴘᴏʀᴛᴇᴍᴇɴᴛ ᴀɴᴏʀᴍᴀʟ ᴅᴇ́ᴛᴇᴄᴛᴇ́. ᴜɴ ᴀᴜᴛʀᴇ ɪɴᴄɪᴅᴇɴᴛ ᴇɴᴛʀᴀɪ̂ɴᴇʀᴀ ᴛᴏɴ ᴇxᴘᴜʟsɪᴏɴ.`,
  (n) => `🚨 @${n} — ʟᴇ sʏsᴛᴇ̀ᴍᴇ ᴛ'ᴀ ʀᴇᴘᴇ́ʀᴇ́. ᴘʀᴏᴄʜᴀɪɴᴇ ᴠɪᴏʟᴀᴛɪᴏɴ = ᴇxᴘᴜʟsɪᴏɴ.`,
  (n) => `🛡️ @${n} — ᴀʟᴇʀᴛᴇ ᴀᴄᴛɪᴠᴇ́ᴇ. ᴍᴏᴅᴇʀᴇ ᴛᴏɴ ᴄᴏᴍᴘᴏʀᴛᴇᴍᴇɴᴛ ᴏᴜ ǫᴜɪᴛᴛᴇ ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ.`,
];
const MSGS_BAN = [
  (n) => `⚔️ @${n} ᴀ ᴇ́ᴛᴇ́ ɴᴇᴜᴛʀᴀʟɪsᴇ́ ᴘᴀʀ ʟᴇ sʏsᴛᴇ̀ᴍᴇ ᴅᴇ ᴘᴜʀɪꜰɪᴄᴀᴛɪᴏɴ.`,
  (n) => `🗡️ @${n} ᴀ ᴇ́ᴛᴇ́ ᴇxᴘᴜʟsᴇ́ ᴀᴜᴛᴏᴍᴀᴛɪǫᴜᴇᴍᴇɴᴛ ᴘᴏᴜʀ ᴄᴏᴍᴘᴏʀᴛᴇᴍᴇɴᴛ ᴀɴᴏᴍᴀʟ.`,
  (n) => `🔥 @${n} ᴀ ᴇ́ᴛᴇ́ ʙᴀɴɴɪ ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ. ʟᴀ ᴘᴜʀɪꜰɪᴄᴀᴛɪᴏɴ ᴀ ᴘᴀʀʟᴇ́.`,
];

function randomMsg(arr, n) {
  return arr[Math.floor(Math.random() * arr.length)](n);
}

// ==========================================
// DÉTECTION DE MESSAGE SUSPECT
// ==========================================
function estSuspect(texte) {
  if (!texte) return false;
  // Trop long
  if (texte.length > SPAM_LONGUEUR) return { raison: 'ᴍᴇssᴀɢᴇ ᴀɴᴏʀᴍᴀʟᴇᴍᴇɴᴛ ʟᴏɴɢ', type: 'longueur' };
  // Caractères répétés excessivement (ex: aaaaaaaaaa)
  if (/(.)\1{20,}/.test(texte)) return { raison: 'ᴄᴀʀᴀᴄᴛᴇ̀ʀᴇs ʀᴇ́ᴘᴇ́ᴛᴇ́s', type: 'repetition' };
  // Liens de groupes WhatsApp envoyés massivement
  const liens = (texte.match(/chat\.whatsapp\.com\/\S+/g) || []);
  if (liens.length > 3) return { raison: 'ʟɪᴇɴs ᴍᴜʟᴛɪᴘʟᴇs', type: 'liens' };
  return false;
}

// ==========================================
// VÉRIFICATION PRINCIPALE (appelée par handler.js)
// ==========================================
async function checkPurification(sock, msg, groupId, senderJid) {
  const state = loadState();
  const gData = state[groupId];
  if (!gData || !gData.actif) return false;

  const numero = senderJid.split('@')[0];
  const now    = Date.now();
  // [PHASE 2] floodTracker/warnTracker/blockedJids sont des objets en
  // mémoire au niveau du module — partagés par TOUTES les sessions du
  // processus. `gid` préfixe la clé avec la session courante pour que
  // deux bots différents ne mélangent jamais leurs trackers, même s'ils
  // ont par hasard le même groupId (un groupe WhatsApp peut contenir
  // deux bots issus de deux sessions distinctes).
  const gid = sessionContext.scopeKey(groupId);

  // Initialiser les trackers
  if (!floodTracker[gid]) floodTracker[gid] = {};
  if (!warnTracker[gid])  warnTracker[gid]  = {};
  if (!blockedJids[gid])  blockedJids[gid]  = new Set();

  // Ignorer si déjà bloqué temporairement
  if (blockedJids[gid].has(senderJid)) return true;

  const texte = msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption || '';

  // ── 1. Détection message suspect ──
  const suspect = estSuspect(texte);
  if (suspect) {
    logActivity(groupId, senderJid, suspect.raison);
    try { await sock.sendMessage(groupId, { delete: msg.key }); } catch (_) {}
    await gererViolation(sock, groupId, senderJid, numero, suspect.raison);
    return true;
  }

  // ── 2. Détection flood ──
  if (!floodTracker[gid][senderJid]) floodTracker[gid][senderJid] = [];
  floodTracker[gid][senderJid].push(now);
  floodTracker[gid][senderJid] = floodTracker[gid][senderJid]
    .filter(t => now - t < FLOOD_FENETRE * 1000);

  const count = floodTracker[gid][senderJid].length;

  if (count >= FLOOD_SEUIL) {
    floodTracker[gid][senderJid] = [];
    logActivity(groupId, senderJid, `ꜰʟᴏᴏᴅ ᴅᴇ́ᴛᴇᴄᴛᴇ́ (${count} ᴍsɢs/${FLOOD_FENETRE}s)`);
    try { await sock.sendMessage(groupId, { delete: msg.key }); } catch (_) {}
    await gererViolation(sock, groupId, senderJid, numero, 'flood');
    return true;
  }

  return false;
}

// ==========================================
// GÉRER UNE VIOLATION (warn ou ban)
// ==========================================
async function gererViolation(sock, groupId, senderJid, numero, raison) {
  const gid = sessionContext.scopeKey(groupId); // cf. checkPurification
  if (!warnTracker[gid]) warnTracker[gid] = {};
  if (!warnTracker[gid][senderJid]) warnTracker[gid][senderJid] = 0;

  warnTracker[gid][senderJid]++;
  const warns = warnTracker[gid][senderJid];

  if (warns >= WARN_MAX) {
    // ── BAN ──
    warnTracker[gid][senderJid] = 0;
    blockedJids[gid]?.add(senderJid);
    // Débloquer après 10 min (au cas où l'expulsion échoue)
    setTimeout(() => blockedJids[gid]?.delete(senderJid), 10 * 60 * 1000);

    try {
      await sock.sendMessage(groupId, {
        text: randomMsg(MSGS_BAN, numero),
        mentions: [senderJid]
      });
    } catch (_) {}
    try {
      await sock.groupParticipantsUpdate(groupId, [senderJid], 'remove');
    } catch (_) {}
  } else {
    // ── AVERTISSEMENT ──
    try {
      await sock.sendMessage(groupId, {
        text:
          randomMsg(MSGS_WARN, numero) +
          `\n_⚠️ ᴀᴠᴇʀᴛɪssᴇᴍᴇɴᴛ ${warns}/${WARN_MAX} — ʀᴀɪsᴏɴ : ${raison}_`,
        mentions: [senderJid]
      });
    } catch (_) {}
  }
}

// ==========================================
// NETTOYAGE SYSTÈME
// ==========================================
function nettoyerSysteme() {
  // [PHASE 2] Avant : Object.keys(floodTracker).forEach(...) videait les
  // trackers de TOUTES les sessions dès qu'un seul admin lançait
  // `.purification clean` sur son propre bot. On ne vide maintenant que
  // les clés appartenant à la session courante.
  const ownPrefix = `${sessionContext.getCurrentSessionId()}::`;
  const isOwn = (k) => k.startsWith(ownPrefix);
  Object.keys(floodTracker).filter(isOwn).forEach(k => { floodTracker[k] = {}; });
  Object.keys(warnTracker).filter(isOwn).forEach(k => { warnTracker[k] = {}; });
  Object.keys(blockedJids).filter(isOwn).forEach(k => { blockedJids[k] = new Set(); });

  // Nettoyer le cache temp WhatsApp
  // [PHASE 2 — SUITE] tmp/<sessionId>/ — avant, process.cwd()/tmp était
  // partagé par toutes les sessions ; nettoyer ici pouvait supprimer un
  // fichier temporaire en cours d'utilisation par une AUTRE session.
  const tmpDir = path.join(process.cwd(), 'tmp', sessionContext.getCurrentSessionId());
  if (fs.existsSync(tmpDir)) {
    fs.readdirSync(tmpDir).forEach(f => {
      try { fs.unlinkSync(path.join(tmpDir, f)); } catch (_) {}
    });
  }
  return true;
}

// ==========================================
// COMMANDE PRINCIPALE
// ==========================================
module.exports = {
  name: 'purification',
  aliases: ['purify', 'defense', 'shield', 'purif'],
  category: '🛡️ Protections',
  ownerOnly: false,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ sʏsᴛᴇ̀ᴍᴇ ᴅᴇ ᴅᴇ́ꜰᴇɴsᴇ ᴀʙsᴏʟᴜᴇ ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ',
  usage: `${prefix}purification on/off/status/clean/logs`,

  // Exporté pour handler.js
  checkPurification,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, isBotAdmin, from, sender } = extra;

    if (!isOwner && !isAdmin) {
      return reply(`*⛔ ᴛᴜ ᴅᴏɪs ᴇ̂ᴛʀᴇ ᴀᴅᴍɪɴ ᴏᴜ ᴏᴡɴᴇʀ*\n\n> *⚜️ ᴘᴜʀɪꜰɪᴄᴀᴛɪᴏɴ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑*`);
    }

    const state  = loadState();
    const action = (args[0] || '').toLowerCase();
    const isGroup = from.endsWith('@g.us');
    const target  = isGroup ? from : null;

    // ── STATUS GLOBAL (IB ou groupe) ──
    if (!action || action === 'status') {
      const actif = target ? state[target]?.actif : Object.values(state).some(g => g.actif);
      return reply(
        `╔══════════════════════╗\n` +
        `        🛡️ *ᴘᴜʀɪꜰɪᴄᴀᴛɪᴏɴ — sᴛᴀᴛᴜs* 🛡️\n` +
        `╚══════════════════════╝\n\n` +
        `🟢 *sᴜʀᴠᴇɪʟʟᴀɴᴄᴇ* : ${actif ? 'ᴀᴄᴛɪᴠᴇ' : 'ɪɴᴀᴄᴛɪᴠᴇ'}\n` +
        `🟢 *sᴇ́ᴄᴜʀɪᴛᴇ́* : ʀᴇɴꜰᴏʀᴄᴇ́ᴇ\n` +
        `🟢 *ᴅᴇ́ᴛᴇᴄᴛɪᴏɴ ꜰʟᴏᴏᴅ* : ${FLOOD_SEUIL} ᴍsɢs / ${FLOOD_FENETRE}s\n` +
        `🟢 *ᴅᴇ́ᴛᴇᴄᴛɪᴏɴ sᴜsᴘᴇᴄᴛ* : ${SPAM_LONGUEUR} ᴄᴀʀ. ᴍᴀx\n` +
        `🟢 *ᴀᴠᴇʀᴛɪssᴇᴍᴇɴᴛs ᴀᴠᴀɴᴛ ʙᴀɴ* : ${WARN_MAX}\n` +
        `🟢 *ᴘʀᴏᴛᴇᴄᴛɪᴏɴ* : ɪʙ + ɢʀᴏᴜᴘᴇs\n\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `*📌 ᴄᴏᴍᴍᴀɴᴅᴇs :*\n` +
        `\`${prefix}purification on\` — ᴀᴄᴛɪᴠᴇʀ\n` +
        `\`${prefix}purification off\` — ᴅᴇ́sᴀᴄᴛɪᴠᴇʀ\n` +
        `\`${prefix}purification clean\` — ɴᴇᴛᴛᴏʏᴇʀ\n` +
        `\`${prefix}purification logs\` — ᴊᴏᴜʀɴᴀʟ\n\n` +
        `⚜️ _"ᴛᴏᴜᴛᴇ ᴀɴᴏᴍᴀʟɪᴇ sᴇʀᴀ ᴅᴇ́ᴛᴇᴄᴛᴇ́ᴇ.\nᴛᴏᴜᴛᴇ ᴄᴏʀʀᴜᴘᴛɪᴏɴ sᴇʀᴀ ᴘᴜʀɪꜰɪᴇ́ᴇ."_ ⚜️\n\n` +
        `> *⚜️ ᴘᴜʀɪꜰɪᴄᴀᴛɪᴏɴ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ⚜️*`
      );
    }

    // ── ON ──
    if (action === 'on') {
      if (!target) {
        return reply(`*〆 ᴀᴄᴛɪᴠᴇ ᴅᴀɴs ᴜɴ ɢʀᴏᴜᴘᴇ*\n\n> *⚜️ ᴘᴜʀɪꜰɪᴄᴀᴛɪᴏɴ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ⚜️*`);
      }
      state[target] = { actif: true };
      saveState(state);
      // Activer aussi mode admin-only si bot admin
      if (isBotAdmin) {
        try { await sock.groupSettingUpdate(target, 'announcement'); } catch (_) {}
        setTimeout(async () => {
          try { await sock.groupSettingUpdate(target, 'not_announcement'); } catch (_) {}
        }, 30000); // 30 secondes de mode admin-only
      }
      return reply(
        `╔══════════════════════╗\n` +
        `        🛡️ *ᴘᴜʀɪꜰɪᴄᴀᴛɪᴏɴ ᴀᴄᴛɪᴠᴇ́ᴇ* 🛡️\n` +
        `╚══════════════════════╝\n\n` +
        `✅ *sᴜʀᴠᴇɪʟʟᴀɴᴄᴇ* : ᴀᴄᴛɪᴠᴇ\n` +
        `✅ *ᴀɴᴛɪ-ꜰʟᴏᴏᴅ* : ᴀᴄᴛɪᴠᴇ́\n` +
        `✅ *ᴀɴᴛɪ-sᴜsᴘᴇᴄᴛ* : ᴀᴄᴛɪᴠᴇ́\n` +
        `✅ *ᴊᴏᴜʀɴᴀʟ* : ᴀᴄᴛɪᴠᴇ́\n` +
        `✅ *ᴍᴏᴅᴇ ᴀᴅᴍɪɴ* : 30s\n\n` +
        `⚜️ _"ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ ᴇsᴛ ᴘʀᴏᴛᴇ́ɢᴇ́."_ ⚜️\n\n` +
        `> *⚜️ ᴘᴜʀɪꜰɪᴄᴀᴛɪᴏɴ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ⚜️*`
      );
    }

    // ── OFF ──
    if (action === 'off') {
      if (target && state[target]) {
        state[target].actif = false;
        saveState(state);
      }
      return reply(
        `╔══════════════════════╗\n` +
        `        🔴 *ᴘᴜʀɪꜰɪᴄᴀᴛɪᴏɴ ᴅᴇ́sᴀᴄᴛɪᴠᴇ́ᴇ* 🔴\n` +
        `╚══════════════════════╝\n\n` +
        `_ʟᴀ sᴜʀᴠᴇɪʟʟᴀɴᴄᴇ ᴇsᴛ ᴇɴ ᴠᴇɪʟʟᴇ._\n\n` +
        `> *⚜️ ᴘᴜʀɪꜰɪᴄᴀᴛɪᴏɴ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ⚜️*`
      );
    }

    // ── CLEAN ──
    if (action === 'clean') {
      nettoyerSysteme();
      return reply(
        `╔══════════════════════╗\n` +
        `        🧹 *ɴᴇᴛᴛᴏʏᴀɢᴇ ᴇꜰꜰᴇᴄᴛᴜᴇ́* 🧹\n` +
        `╚══════════════════════╝\n\n` +
        `✅ ᴛʀᴀᴄᴋᴇʀs ᴠɪᴅᴇ́s\n` +
        `✅ ᴄᴀᴄʜᴇ ɴᴇᴛᴛᴏʏᴇ́\n` +
        `✅ ꜰɪʟᴇs ᴛᴇᴍᴘ sᴜᴘᴘʀɪᴍᴇ́ᴇs\n` +
        `✅ sʏsᴛᴇ̀ᴍᴇ sᴛᴀʙɪʟɪsᴇ́\n\n` +
        `⚜️ _"ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ ᴇsᴛ ᴘᴜʀɪꜰɪᴇ́."_ ⚜️\n\n` +
        `> *⚜️ ᴘᴜʀɪꜰɪᴄᴀᴛɪᴏɴ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ⚜️*`
      );
    }

    // ── LOGS ──
    if (action === 'logs') {
      try {
        const file = logPath();
        const logs = fs.existsSync(file)
          ? JSON.parse(fs.readFileSync(file, 'utf8'))
          : [];
        if (logs.length === 0) {
          return reply(`*📋 ᴊᴏᴜʀɴᴀʟ ᴠɪᴅᴇ — ᴀᴜᴄᴜɴᴇ ᴀᴄᴛɪᴠɪᴛᴇ́ sᴜsᴘᴇᴄᴛᴇ.*\n\n> *⚜️ ᴘᴜʀɪꜰɪᴄᴀᴛɪᴏɴ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ⚜️*`);
        }
        const derniers = logs.slice(-10).reverse();
        let txt = `*📋 ᴊᴏᴜʀɴᴀʟ ᴅᴇ sᴜʀᴠᴇɪʟʟᴀɴᴄᴇ (${logs.length} ᴇɴᴛʀᴇ́ᴇs)* :\n\n`;
        derniers.forEach((l, i) => {
          const h = new Date(l.heure).toLocaleString('fr-FR', { timeZone: 'Africa/Porto-Novo' });
          txt += `*${i+1}.* +${l.jid.split('@')[0]}\n   ↳ ${l.raison}\n   ↳ ${h}\n\n`;
        });
        txt += `> *⚜️ ᴘᴜʀɪꜰɪᴄᴀᴛɪᴏɴ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ⚜️*`;
        return reply(txt);
      } catch (_) {
        return reply(`*❌ ɪᴍᴘᴏssɪʙʟᴇ ᴅᴇ ʟɪʀᴇ ʟᴇ ᴊᴏᴜʀɴᴀʟ*`);
      }
    }

    // ── AIDE ──
    return reply(
      `*📌 ᴄᴏᴍᴍᴀɴᴅᴇs :*\n` +
      `\`${prefix}purification on\`\n` +
      `\`${prefix}purification off\`\n` +
      `\`${prefix}purification status\`\n` +
      `\`${prefix}purification clean\`\n` +
      `\`${prefix}purification logs\`\n\n` +
      `> *⚜️ ᴘᴜʀɪꜰɪᴄᴀᴛɪᴏɴ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ⚜️*`
    );
  }
};
