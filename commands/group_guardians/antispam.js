/**
 * Antispam Command - 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * Détecte et supprime les spams dans les groupes
 * Ban l'auteur automatiquement
 * Configurable : seuil de messages, fenêtre de temps
 * FIX: extra n'était pas disponible dans checkSpam (hors execute)
 */

const config = require('../../config');
const prefix = config.prefix || '.';
const fs     = require('fs');
const path   = require('path');

// ── Fichier de configuration ──
const STATE_FILE = path.join(process.cwd(), 'utils', 'antispam_state.json');

// ── Suivi des messages en mémoire ──
const tracker = {};

// [PERF] Nettoyage périodique du tracker pour éviter la fuite mémoire
// Sans ça, le tracker grandit indéfiniment avec chaque utilisateur de chaque groupe
setInterval(() => {
  const cutoff = Date.now() - 120000; // supprimer les entrées > 2 min
  for (const groupId of Object.keys(tracker)) {
    for (const jid of Object.keys(tracker[groupId] || {})) {
      tracker[groupId][jid] = (tracker[groupId][jid] || []).filter(t => t > cutoff);
      if (tracker[groupId][jid].length === 0) delete tracker[groupId][jid];
    }
    if (Object.keys(tracker[groupId] || {}).length === 0) delete tracker[groupId];
  }
}, 5 * 60 * 1000).unref();

// ── Paramètres par défaut ──
const DEFAULT_SEUIL   = 5;
const DEFAULT_FENETRE = 5;

// ==========================================
// PERSISTANCE
// ==========================================
// [PERF] Cache en mémoire pour éviter la lecture disque sur chaque message
// Invalidé automatiquement après 5s et lors de chaque écriture
let _stateCache    = null;
let _stateCacheTs  = 0;
const STATE_CACHE_TTL = 5000; // 5 secondes

function loadState() {
  const now = Date.now();
  if (_stateCache && (now - _stateCacheTs) < STATE_CACHE_TTL) {
    return _stateCache; // Retourner le cache si récent
  }
  try {
    if (fs.existsSync(STATE_FILE)) {
      _stateCache   = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      _stateCacheTs = now;
      return _stateCache;
    }
  } catch (_) {}
  return {};
}

function saveState(data) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf8');
    _stateCache = data; _stateCacheTs = Date.now(); // Invalider le cache
  } catch (_) {}
}

// ==========================================
// VÉRIFICATION SPAM
// FIX: extra n'est pas disponible ici — on construit le footer directement
// ==========================================
async function checkSpam(sock, msg, groupId, senderJid) {
  // [PRÉPARATION — liste blanche .allow]
  // Ce fichier n'a pas encore été audité individuellement. Quand ce sera fait,
  // ajouter ici un bypass pour les utilisateurs autorisés, cohérent avec les
  // autres protections (voir utils/jidHelpers.js → isAllowedUser) :
  //   const settings = database.getGroupSettings(groupId);
  //   if (isAllowedUser(senderJid, settings)) return false;
  // Aucune logique ci-dessous n'a été modifiée pour l'instant.
  const state = loadState();
  const gData = state[groupId];

  if (!gData || !gData.actif) return false;

  const seuil   = gData.seuil   || DEFAULT_SEUIL;
  const fenetre = gData.fenetre || DEFAULT_FENETRE;
  const now     = Date.now();

  if (!tracker[groupId]) tracker[groupId] = {};
  if (!tracker[groupId][senderJid]) tracker[groupId][senderJid] = [];

  tracker[groupId][senderJid].push(now);
  tracker[groupId][senderJid] = tracker[groupId][senderJid].filter(
    t => now - t < fenetre * 1000
  );

  const count = tracker[groupId][senderJid].length;

  if (count >= seuil) {
    tracker[groupId][senderJid] = [];

    const numero = senderJid.split('@')[0];

    try {
      await sock.sendMessage(groupId, { delete: msg.key });
    } catch (_) {}

    try {
      await sock.sendMessage(groupId, {
        text:
          `╭━≪• *🚨 sᴘᴀᴍ ᴅᴇ́ᴛᴇᴄᴛᴇ́* •≫━╾╮\n` +
          `┃ 👤 *ᴀᴜᴛᴇᴜʀ* : @${numero}\n` +
          `┃ 📨 *ᴍᴇssᴀɢᴇs* : ${count}\n` +
          `┃ ⏱️ *ᴇɴ* : ${fenetre}s\n` +
          `┃ ⚖️ *sᴀɴᴄᴛɪᴏɴ* : ᴇxᴘᴜʟsɪᴏɴ\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n` +
          `> *𝐃𝐈𝐏𝐏𝐄𝐑 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́*`,
        mentions: [senderJid]
      });
    } catch (_) {}

    try {
      await sock.groupParticipantsUpdate(groupId, [senderJid], 'remove');
    } catch (_) {}

    return true;
  }

  return false;
}

// ==========================================
// COMMANDE PRINCIPALE
// ==========================================
module.exports = {
  name: 'antispam',
  aliases: ['nospam', 'antiflood'],
  category: '🛡️ Protections',
  ownerOnly: false,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ sᴜᴘᴘʀɪᴍᴇ ʟᴇs sᴘᴀᴍs ᴇᴛ ʙᴀɴ ʟ\'ᴀᴜᴛᴇᴜʀ',
  usage: `${prefix}antispam on/off | ${prefix}antispam seuil 5 | ${prefix}antispam fenetre 5`,

  checkSpam,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, isBotAdmin, from, phrases } = extra;

    if (!from.endsWith('@g.us')) {
      return reply(`*〆 ᴄᴏᴍᴍᴀɴᴅᴇ ᴜɴɪǫᴜᴇᴍᴇɴᴛ ᴅᴀɴs ᴜɴ ɢʀᴏᴜᴘᴇ !*\n\n${phrases.footer()}`);
    }

    if (!isOwner && !isAdmin) {
      return reply(`*⛔ ᴛᴜ ᴅᴏɪs ᴇ̂ᴛʀᴇ ᴀᴅᴍɪɴ ᴏᴜ ᴏᴡɴᴇʀ*\n\n${phrases.footer()}`);
    }

    if (!isBotAdmin) {
      return reply(`*⛔ ʟᴇ ʙᴏᴛ ᴅᴏɪᴛ ᴇ̂ᴛʀᴇ ᴀᴅᴍɪɴ !*\n\n${phrases.footer()}`);
    }

    const state = loadState();
    if (!state[from]) state[from] = { actif: false, seuil: DEFAULT_SEUIL, fenetre: DEFAULT_FENETRE };

    const action = (args[0] || '').toLowerCase();

    if (action === 'on') {
      state[from].actif = true;
      saveState(state);
      return reply(
        `╭━≪• *✅ ᴀɴᴛɪsᴘᴀᴍ ᴀᴄᴛɪᴠᴇ́* •≫━╾╮\n` +
        `┃ 📨 *sᴇᴜɪʟ* : ${state[from].seuil} ᴍsɢs\n` +
        `┃ ⏱️ *ꜰᴇɴᴇ̂ᴛʀᴇ* : ${state[from].fenetre}s\n` +
        `┃ ⚖️ *sᴀɴᴄᴛɪᴏɴ* : ʙᴀɴ\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    }

    if (action === 'off') {
      state[from].actif = false;
      saveState(state);
      return reply(
        `╭━≪• *🔴 ᴀɴᴛɪsᴘᴀᴍ ᴅᴇ́sᴀᴄᴛɪᴠᴇ́* •≫━╾╮\n` +
        `┃ ʟᴇ sᴘᴀᴍ ɴ'ᴇsᴛ ᴘʟᴜs ʙʟᴏǫᴜᴇ́\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    }

    if (action === 'seuil') {
      const val = parseInt(args[1]);
      if (!val || val < 2 || val > 20) {
        return reply(`*⚠️ sᴇᴜɪʟ ᴇɴᴛʀᴇ 2 ᴇᴛ 20*\n\`${prefix}antispam seuil 5\``);
      }
      state[from].seuil = val;
      saveState(state);
      return reply(`*✅ sᴇᴜɪʟ ᴍɪs ᴀ̀ ᴊᴏᴜʀ : ${val} ᴍᴇssᴀɢᴇs*\n\n${phrases.footer()}`);
    }

    if (action === 'fenetre') {
      const val = parseInt(args[1]);
      if (!val || val < 2 || val > 30) {
        return reply(`*⚠️ ꜰᴇɴᴇ̂ᴛʀᴇ ᴇɴᴛʀᴇ 2 ᴇᴛ 30 sᴇᴄᴏɴᴅᴇs*\n\`${prefix}antispam fenetre 5\``);
      }
      state[from].fenetre = val;
      saveState(state);
      return reply(`*✅ ꜰᴇɴᴇ̂ᴛʀᴇ ᴍɪsᴇ ᴀ̀ ᴊᴏᴜʀ : ${val}s*\n\n${phrases.footer()}`);
    }

    const statut = state[from].actif ? '🟢 ᴀᴄᴛɪꜰ' : '🔴 ɪɴᴀᴄᴛɪꜰ';
    return reply(
      `╭━≪• *🚨 ᴀɴᴛɪsᴘᴀᴍ sᴛᴀᴛᴜs* •≫━╾╮\n` +
      `┃ ⚙️ *ᴇ́ᴛᴀᴛ* : ${statut}\n` +
      `┃ 📨 *sᴇᴜɪʟ* : ${state[from].seuil} ᴍsɢs\n` +
      `┃ ⏱️ *ꜰᴇɴᴇ̂ᴛʀᴇ* : ${state[from].fenetre}s\n` +
      `╰━━━━━━━━━━━━━━━━━╯\n\n` +
      `*📌 ᴄᴏᴍᴍᴀɴᴅᴇs :*\n` +
      `\`${prefix}antispam on/off\`\n` +
      `\`${prefix}antispam seuil 5\`\n` +
      `\`${prefix}antispam fenetre 5\`\n\n` +
      phrases.footer()
    );
  }
};
