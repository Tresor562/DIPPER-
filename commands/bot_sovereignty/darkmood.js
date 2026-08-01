/**
 * DarkMood — 𝐃𝐚𝐫𝐤 Edition v2
 *
 * CHANGEMENTS v2 :
 * - Suppression du groupe ID codé en dur (DARKMOOD_GROUP)
 * - Fonctionne dans TOUS les groupes
 * - Configuration par groupe via database.updateGroupSettings
 * - Nouvelles commandes : setdarkmoodtext / setdarkmoodimage /
 *   setdarkmoodemoji / setdarkmoodinterval
 * - Persistence après redémarrage via database
 * - startDarkmoodScheduler exporté pour index.js (compatible)
 */

'use strict';

const config       = require('../../config');
const sessionContext = require('../../utils/sessionContext');
const prefix       = config.prefix || '.';
const styleManager = require('../../utils/styleManager');
const database     = require('../../database');
const axios        = require('axios');

// UTC offset Bénin
const UTC_OFFSET = 1;

// ── Helpers heure ──────────────────────────────────────────────────────────
function heureBenin() {
  return new Date(Date.now() + UTC_OFFSET * 3600000);
}
function jourSemaine() {
  return heureBenin().getDay();
}
function delaiAvant(heureCible, minuteCible = 0) {
  const maintenant = new Date();
  const cibleUTC   = new Date(maintenant);
  cibleUTC.setUTCHours(heureCible - UTC_OFFSET, minuteCible, 0, 0);
  if (cibleUTC <= maintenant) cibleUTC.setUTCDate(cibleUTC.getUTCDate() + 1);
  return cibleUTC - maintenant;
}

function toSC(t) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

// ── Programme hebdomadaire par défaut ─────────────────────────────────────
const PROGRAMME_DEFAULT = {
  1: { nom: '🌸 Monday — Wallpaper Day',
    texte: `*🌸 ᴡᴀʟʟᴘᴀᴘᴇʀ ᴅᴀʏ !* 🎴\n\n> ᴘᴀʀᴛᴀɢᴇ ᴅᴇs ᴍᴇɪʟʟᴇᴜʀs ꜰᴏɴᴅs ᴅ'ᴇ́ᴄʀᴀɴ ᴀɴɪᴍᴇ/ᴍᴀɴʜᴡᴀ\n\n*📌 ᴛʜᴇ̀ᴍᴇs :*\n• ᴅᴀʀᴋ ᴀᴇsᴛʜᴇᴛɪᴄ • ᴄʏʙᴇʀᴘᴜɴᴋ\n• ʀᴏᴍᴀɴᴄᴇ • sᴀᴍᴏᴜʀᴀɪ̈ • ᴘᴇʀsᴏɴɴᴀɢᴇs` },
  2: { nom: '😂 Tuesday — Troll & Meme Day',
    texte: `*😂 ᴛʀᴏʟʟ & ᴍᴇᴍᴇ ᴅᴀʏ !* 💀\n\n> ᴊᴏᴜʀɴᴇ́ᴇ ᴅᴇ́ᴅɪᴇ́ᴇ ᴀᴜx ᴍᴇᴍᴇs ᴇᴛ ᴛʀᴏʟʟs ᴀɴɪᴍᴇ\n\n⚠️ *ꜰᴜɴ sᴀɴs ɪɴsᴜʟᴛᴇs ɴɪ ᴛᴏxɪᴄɪᴛᴇ́*` },
  3: { nom: '📚 Wednesday — Manhwa Day',
    texte: `*📚 ᴍᴀɴʜᴡᴀ ʀᴇᴄᴏᴍᴍᴇɴᴅᴀᴛɪᴏɴ !*\n\n> ᴄʜᴀǫᴜᴇ ᴍᴇᴍʙʀᴇ ʀᴇᴄᴏᴍᴍᴀɴᴅᴇ ᴜɴ ᴍᴀɴʜᴡᴀ\n\n*📌 ᴅᴏɴɴᴇᴢ :* ɢᴇɴʀᴇ, ᴘᴏᴜʀǫᴜᴏɪ ᴄ'ᴇsᴛ ʙɪᴇɴ, ɴᴏᴛᴇ /10` },
  4: { nom: '📰 Thursday — Anime News',
    texte: `*📰 ᴀɴɪᴍᴇ ɴᴇᴡs ᴅᴀʏ !* 🔥\n\n• 🎬 ɴᴏᴜᴠᴇᴀᴜx ᴇ́ᴘɪsᴏᴅᴇs\n• 📢 ɴᴏᴜᴠᴇʟʟᴇs sᴀɪsᴏɴs\n• 🔥 ᴀɴɴᴏɴᴄᴇs` },
  5: { nom: '🎴 Friday — Sticker Friday',
    texte: `*🎴 sᴛɪᴄᴋᴇʀ ᴘᴀᴄᴋ ꜰʀɪᴅᴀʏ !* 🔥\n\n• ᴘᴀᴄᴋs ᴡʜᴀᴛsᴀᴘᴘ • sᴛɪᴄᴋᴇʀs ᴛʀᴏʟʟs\n• sᴛɪᴄᴋᴇʀs ᴀᴇsᴛʜᴇᴛɪᴄ • ʀᴇ́ᴀᴄᴛɪᴏɴs` },
  6: { nom: '⚔️ Saturday — Character Battle',
    texte: `*⚔️ ᴄʜᴀʀᴀᴄᴛᴇʀ ʙᴀᴛᴛʟᴇ !* 🔥\n\n_Satoru Gojo VS Sung Jin-Woo_\n\n💬 *ᴅᴇ́ʙᴀᴛᴛᴇᴢ ᴇᴛ ᴠᴏᴛᴇᴢ !*` },
  0: { nom: '🌌 Sunday — Otaku Chill Night',
    texte: `*🌌 ᴏᴛᴀᴋᴜ ᴄʜɪʟʟ ɴɪɢʜᴛ !* 🖤\n\n• 🎵 ᴍᴜsɪǫᴜᴇs ᴀɴɪᴍᴇ • 🖼️ ɪᴍᴀɢᴇs\n• 💭 ᴄɪᴛᴀᴛɪᴏɴs • 🎬 ᴇᴅɪᴛs • 📚 ᴅɪsᴄᴜssɪᴏɴs` },
};

// ── Getters config darkmood pour un groupe ─────────────────────────────────
function getDMConfig(groupId) {
  const s = database.getGroupSettings(groupId);
  return {
    actif   : s.darkmoodActif    === true,
    heureOuv: s.darkmoodHeureOuv ?? 6,
    heureFer: s.darkmoodHeureFer ?? 22,
    interval: s.darkmoodInterval ?? null,    // null = 06h/22h, sinon minutes
    texte   : s.darkmoodTexte    || null,    // null = texte hebdo par défaut
    image   : s.darkmoodImage    || null,    // URL image ou null
    emoji   : s.darkmoodEmoji    || '🔥',
  };
}

// ── Timers par groupe { groupId: { timerOuv, timerFer, timerInterval } } ──
const _timers = new Map();

function clearTimers(groupId) {
  const key = sessionContext.scopeKey(groupId);
  const t = _timers.get(key);
  if (!t) return;
  if (t.timerOuv)      clearTimeout(t.timerOuv);
  if (t.timerFer)      clearTimeout(t.timerFer);
  if (t.timerInterval) clearInterval(t.timerInterval);
  _timers.delete(key);
  console.log(`[darkmood] Timers annulés : ${groupId}`);
}

// ── Construire le texte d'ouverture ───────────────────────────────────────
async function buildTexteOuverture(sock, groupId) {
  const cfg   = getDMConfig(groupId);
  const jour  = jourSemaine();
  const prog  = PROGRAMME_DEFAULT[jour] || PROGRAMME_DEFAULT[1];

  let membres = [];
  try {
    const meta = await sock.groupMetadata(groupId);
    membres = meta.participants.map(p => p.id);
  } catch (_) {}

  const textePrincipal = cfg.texte || (
    `╭━≪• *${cfg.emoji} ᴅᴀʀᴋᴍᴏᴏᴅ ᴇsᴛ ᴏᴜᴠᴇʀᴛ !* •≫━╾╮\n` +
    `┃ 🕕 *${String(cfg.heureOuv).padStart(2,'0')}:00* — ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ s'ᴇ́ᴠᴇɪʟʟᴇ\n` +
    `┃ 🗓️ *${prog.nom}*\n` +
    `╰━━━━━━━━━━━━━━━━━╯\n\n` +
    `${prog.texte}\n\n` +
    membres.map(m => `@${m.split('@')[0]}`).join(' ')
  );

  return { texte: textePrincipal, mentions: membres };
}

// ── Ouvrir le groupe ──────────────────────────────────────────────────────
async function ouvrirGroupe(sock, groupId) {
  try {
    await sock.groupSettingUpdate(groupId, 'not_announcement');
    const { texte, mentions } = await buildTexteOuverture(sock, groupId);
    await sock.sendMessage(groupId, { text: texte, mentions });

    const cfg = getDMConfig(groupId);
    if (cfg.image) {
      try {
        const resp = await axios.get(cfg.image, { responseType: 'arraybuffer', timeout: 10000 });
        await sock.sendMessage(groupId, { image: Buffer.from(resp.data), caption: '' });
      } catch (e) {
        console.error(`[darkmood] Image ouverture : ${e.message}`);
      }
    }
    console.log(`[darkmood] ✅ Groupe ouvert : ${groupId}`);
  } catch (err) {
    console.error(`[darkmood] ❌ Ouverture : ${err.message}`);
  }
}

// ── Fermer le groupe ──────────────────────────────────────────────────────
async function fermerGroupe(sock, groupId) {
  try {
    const cfg = getDMConfig(groupId);
    const texte =
      `╭━≪• *🌙 ᴅᴀʀᴋᴍᴏᴏᴅ ꜰᴇʀᴍᴇ́ !* •≫━╾╮\n` +
      `┃ 🕙 *${String(cfg.heureFer).padStart(2,'0')}:00* — ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ sᴇ ʀᴇᴘᴏsᴇ\n` +
      `╰━━━━━━━━━━━━━━━━━╯\n\n` +
      `😴 *ʀᴏᴜᴠᴇʀᴛᴜʀᴇ ᴅᴇᴍᴀɪɴ ᴀ̀ ${String(cfg.heureOuv).padStart(2,'0')}:00*`;

    await sock.sendMessage(groupId, { text: texte });
    await sock.groupSettingUpdate(groupId, 'announcement');
    console.log(`[darkmood] 🌙 Groupe fermé : ${groupId}`);
  } catch (err) {
    console.error(`[darkmood] ❌ Fermeture : ${err.message}`);
  }
}

// ── Planifier ouverture/fermeture quotidienne ─────────────────────────────
function planifier(sock, groupId) {
  clearTimers(groupId);
  const cfg = getDMConfig(groupId);
  if (!cfg.actif) return;

  // Mode interval : envoyer un message toutes les N minutes (sans ouvrir/fermer)
  if (cfg.interval && cfg.interval > 0) {
    const t = setInterval(async () => {
      if (!getDMConfig(groupId).actif) { clearTimers(groupId); return; }
      await ouvrirGroupe(sock, groupId);
    }, cfg.interval * 60 * 1000);
    _timers.set(sessionContext.scopeKey(groupId), { timerInterval: t });
    console.log(`[darkmood] ⏰ Mode interval ${cfg.interval}min — ${groupId}`);
    return;
  }

  // Mode 06h/22h quotidien
  const delaiOuv = delaiAvant(cfg.heureOuv, 0);
  const delaiFer = delaiAvant(cfg.heureFer, 0);

  const fmt = ms => { const h = Math.floor(ms/3600000); const m = Math.floor((ms%3600000)/60000); return `${h}h${String(m).padStart(2,'0')}m`; };
  console.log(`[darkmood] ⏰ ${groupId} — Ouverture dans ${fmt(delaiOuv)} | Fermeture dans ${fmt(delaiFer)}`);

  const timerOuv = setTimeout(async () => {
    await ouvrirGroupe(sock, groupId);
    if (getDMConfig(groupId).actif) planifier(sock, groupId);
  }, delaiOuv);

  const timerFer = setTimeout(async () => {
    await fermerGroupe(sock, groupId);
  }, delaiFer);

  _timers.set(sessionContext.scopeKey(groupId), { timerOuv, timerFer });
}

// ── Démarrage automatique — appelé depuis index.js ──────────────────────
function startDarkmoodScheduler(sock) {
  // Parcourir tous les groupes et relancer ceux qui ont darkmoodActif = true
  try {
    const { readFileSync, existsSync } = require('fs');
    const { join } = require('path');
    const dbPath = join(process.cwd(), 'data', 'groups.json');
    if (!existsSync(dbPath)) return;

    const groups = JSON.parse(readFileSync(dbPath, 'utf8'));
    let count = 0;
    for (const [groupId, settings] of Object.entries(groups)) {
      if (settings?.darkmoodActif === true) {
        planifier(sock, groupId);
        count++;
      }
    }
    if (count > 0) console.log(`[darkmood] 🔥 Reprise automatique — ${count} groupe(s)`);
  } catch (e) {
    console.error(`[darkmood] startDarkmoodScheduler : ${e.message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// COMMANDE PRINCIPALE
// ══════════════════════════════════════════════════════════════════════════
const commandePrincipale = {
  name    : 'darkmood',
  aliases : ['darkmode', 'gestion'],
  category: '👑 Owner',
  groupOnly: true,
  ownerOnly: false,
  adminOnly: false,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɢᴇ̀ʀᴇ ʟ\'ᴏᴜᴠᴇʀᴛᴜʀᴇ/ꜰᴇʀᴍᴇᴛᴜʀᴇ ᴀᴜᴛᴏᴍᴀᴛɪǫᴜᴇ ᴅᴜ ɢʀᴏᴜᴘᴇ',
  usage   : `${prefix}darkmood on|off|status|test`,
  startDarkmoodScheduler,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, isSudo, from, phrases } = extra;

    if (!isOwner && !isAdmin && !isSudo) {
      return reply(`*⛔ ${toSC('admin ou owner requis')}*\n\n${phrases.footer()}`);
    }

    const action  = (args[0] || '').toLowerCase();
    const cfg     = getDMConfig(from);
    const estActif = cfg.actif;

    // ── STATUS ──────────────────────────────────────────────────────────
    if (!action || action === 'status') {
      const fmt = h => `${String(h).padStart(2,'0')}:00`;
      return reply(
        `╭━≪• *🔥 ᴅᴀʀᴋᴍᴏᴏᴅ sᴛᴀᴛᴜs* •≫━╾╮\n` +
        `┃ ⚙️ *${toSC('etat')}*     : ${estActif ? '🟢 ᴀᴄᴛɪꜰ' : '🔴 ɪɴᴀᴄᴛɪꜰ'}\n` +
        `┃ 🕕 *${toSC('ouverture')}*: ${fmt(cfg.heureOuv)}\n` +
        `┃ 🕙 *${toSC('fermeture')}*: ${fmt(cfg.heureFer)}\n` +
        `┃ ${cfg.emoji} *${toSC('emoji')}*     : ${cfg.emoji}\n` +
        `┃ 💬 *${toSC('texte')}*    : ${cfg.texte ? toSC('personnalise') : toSC('par defaut')}\n` +
        `┃ 🖼️ *${toSC('image')}*    : ${cfg.image ? '✅' : toSC('aucune')}\n` +
        `┃ ⏱️ *${toSC('interval')}* : ${cfg.interval ? `${cfg.interval} min` : toSC('mode horaire')}\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    }

    // ── ACTIVER ──────────────────────────────────────────────────────────
    if (action === 'on') {
      if (estActif) return reply(`*⚠️ ${toSC('darkmood est deja actif dans ce groupe')}*\n\n${phrases.footer()}`);
      database.updateGroupSettings(from, { darkmoodActif: true });
      planifier(sock, from);
      return reply(
        `╭━≪• *✅ ᴅᴀʀᴋᴍᴏᴏᴅ ᴀᴄᴛɪᴠᴇ́ !* •≫━╾╮\n` +
        `┃ 🕕 ${toSC('ouverture')} : *${String(getDMConfig(from).heureOuv).padStart(2,'0')}:00*\n` +
        `┃ 🕙 ${toSC('fermeture')} : *${String(getDMConfig(from).heureFer).padStart(2,'0')}:00*\n` +
        `┃ 💾 ${toSC('survit aux redemarrages')}\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    }

    // ── DÉSACTIVER ────────────────────────────────────────────────────────
    if (action === 'off') {
      if (!estActif) return reply(`*⚠️ ${toSC('darkmood est deja inactif')}*\n\n${phrases.footer()}`);
      database.updateGroupSettings(from, { darkmoodActif: false });
      clearTimers(from);
      return reply(
        `╭━≪• *🔴 ᴅᴀʀᴋᴍᴏᴏᴅ ᴅᴇ́sᴀᴄᴛɪᴠᴇ́* •≫━╾╮\n` +
        `┃ ⏹️ ${toSC('timers annules')}\n` +
        `┃ 💾 ${toSC('etat sauvegarde')}\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    }

    // ── TEST ──────────────────────────────────────────────────────────────
    if (action === 'test') {
      await reply(`*⏳ ${toSC('test ouverture en cours')}...*`);
      await ouvrirGroupe(sock, from);
      return;
    }

    // ── AIDE ──────────────────────────────────────────────────────────────
    return reply(
      `*╭━≪• 🔥 ᴅᴀʀᴋᴍᴏᴏᴅ ʜᴇʟᴘ •≫━╾╮*\n` +
      `┃ \`${prefix}darkmood on\` — ᴀᴄᴛɪᴠᴇʀ\n` +
      `┃ \`${prefix}darkmood off\` — ᴅᴇ́sᴀᴄᴛɪᴠᴇʀ\n` +
      `┃ \`${prefix}darkmood status\` — ᴇ́ᴛᴀᴛ\n` +
      `┃ \`${prefix}darkmood test\` — ᴛᴇsᴛᴇʀ\n` +
      `┃ \`${prefix}setdarkmoodtext\` — ᴛᴇxᴛᴇ\n` +
      `┃ \`${prefix}setdarkmoodimage\` — ɪᴍᴀɢᴇ\n` +
      `┃ \`${prefix}setdarkmoodemoji\` — ᴇᴍᴏᴊɪ\n` +
      `┃ \`${prefix}setdarkmoodinterval\` — ɪɴᴛᴇʀᴠᴀʟ\n` +
      `*╰━━━━━━━━━━━━━━━━━╯*\n\n${phrases.footer()}`
    );
  },
};

// ══════════════════════════════════════════════════════════════════════════
// COMMANDES DE CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════
const setdarkmoodtext = {
  name    : 'setdarkmoodtext',
  aliases : ['darkmoodtext','dmtext'],
  category: '👑 Owner',
  groupOnly: true, adminOnly: true,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇ́ꜰɪɴɪᴛ ʟᴇ ᴛᴇxᴛᴇ ᴅ\'ᴏᴜᴠᴇʀᴛᴜʀᴇ ᴅᴀʀᴋᴍᴏᴏᴅ',
  usage   : `${prefix}setdarkmoodtext [texte]`,
  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, from, phrases } = extra;
    if (!isOwner && !isAdmin) return reply(`*⛔ ${toSC('admin requis')}*\n\n${phrases.footer()}`);

    const texte = args.join(' ').trim();
    if (!texte) {
      database.updateGroupSettings(from, { darkmoodTexte: null });
      return reply(`✅ ${toSC('texte darkmood reinitialise au texte par defaut')}\n\n${phrases.footer()}`);
    }
    database.updateGroupSettings(from, { darkmoodTexte: texte });
    return reply(
      `╭━≪• *✅ ${toSC('texte configure')}* •≫━╮\n` +
      `┃ 💬 ${texte.slice(0, 100)}${texte.length > 100 ? '…' : ''}\n` +
      `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
    );
  },
};

const setdarkmoodimage = {
  name    : 'setdarkmoodimage',
  aliases : ['darkmoodimage','dmimage'],
  category: '👑 Owner',
  groupOnly: true, adminOnly: true,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇ́ꜰɪɴɪᴛ ʟ\'ɪᴍᴀɢᴇ ᴅ\'ᴏᴜᴠᴇʀᴛᴜʀᴇ ᴅᴀʀᴋᴍᴏᴏᴅ',
  usage   : `${prefix}setdarkmoodimage [url]`,
  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, from, phrases } = extra;
    if (!isOwner && !isAdmin) return reply(`*⛔ ${toSC('admin requis')}*\n\n${phrases.footer()}`);

    const url = args[0]?.trim();
    if (!url) {
      database.updateGroupSettings(from, { darkmoodImage: null });
      return reply(`✅ ${toSC('image darkmood supprimee')}\n\n${phrases.footer()}`);
    }
    // Vérifier que l'URL est accessible
    try {
      await axios.head(url, { timeout: 5000 });
    } catch {
      return reply(`*❌ ${toSC('url inaccessible ou invalide')}*\n\n${phrases.footer()}`);
    }
    database.updateGroupSettings(from, { darkmoodImage: url });
    return reply(
      `╭━≪• *✅ ${toSC('image configuree')}* •≫━╮\n` +
      `┃ 🖼️ ${url.slice(0, 60)}${url.length > 60 ? '…' : ''}\n` +
      `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
    );
  },
};

const setdarkmoodemoji = {
  name    : 'setdarkmoodemoji',
  aliases : ['darkmoodemoji','dmemoji'],
  category: '👑 Owner',
  groupOnly: true, adminOnly: true,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇ́ꜰɪɴɪᴛ ʟ\'ᴇᴍᴏᴊɪ ᴅᴀʀᴋᴍᴏᴏᴅ',
  usage   : `${prefix}setdarkmoodemoji [emoji]`,
  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, from, phrases } = extra;
    if (!isOwner && !isAdmin) return reply(`*⛔ ${toSC('admin requis')}*\n\n${phrases.footer()}`);

    const emoji = args[0]?.trim();
    if (!emoji) return reply(`*📋 Usage :* \`${prefix}setdarkmoodemoji [emoji]\`\n\n${phrases.footer()}`);
    database.updateGroupSettings(from, { darkmoodEmoji: emoji });
    return reply(`✅ ${toSC('emoji darkmood defini')} : ${emoji}\n\n${phrases.footer()}`);
  },
};

const setdarkmoodinterval = {
  name    : 'setdarkmoodinterval',
  aliases : ['darkmoodinterval','dminterval','setdarkmooddelay'],
  category: '👑 Owner',
  groupOnly: true, adminOnly: true,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇ́ꜰɪɴɪᴛ ʟ\'ɪɴᴛᴇʀᴠᴀʟʟᴇ ᴇɴ ᴍɪɴᴜᴛᴇs (0 = ᴍᴏᴅᴇ 06h/22h)',
  usage   : `${prefix}setdarkmoodinterval [minutes]`,
  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, from, phrases } = extra;
    if (!isOwner && !isAdmin) return reply(`*⛔ ${toSC('admin requis')}*\n\n${phrases.footer()}`);

    const minutes = parseInt(args[0]);
    if (isNaN(minutes) || minutes < 0 || minutes > 1440) {
      return reply(
        `*📋 Usage :* \`${prefix}setdarkmoodinterval [0-1440]\`\n` +
        `_0 = mode horaire 06h/22h par défaut_\n\n${phrases.footer()}`
      );
    }
    database.updateGroupSettings(from, { darkmoodInterval: minutes === 0 ? null : minutes });

    // Replanifier si actif
    if (getDMConfig(from).actif) planifier(sock, from);

    const msg2 = minutes === 0
      ? toSC('mode horaire 06h/22h actif')
      : `${toSC('message toutes les')} ${minutes} ${toSC('minutes')}`;

    return reply(`✅ ${msg2}\n\n${phrases.footer()}`);
  },
};

// Export tableau pour que commandLoader charge toutes les commandes
module.exports = [
  commandePrincipale,
  setdarkmoodtext,
  setdarkmoodimage,
  setdarkmoodemoji,
  setdarkmoodinterval,
];

// Export nommé pour index.js (compatibilité)
module.exports.startDarkmoodScheduler = startDarkmoodScheduler;
