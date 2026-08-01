/**
 * aimoderator / aidetect / aianalyzegc — THE BIG DIPPER
 * Modération IA et analyse de groupe.
 */
'use strict';

const config = require('../../config');
const { askAI } = require('../../utils/aiEngine');
const sessionContext = require('../../utils/sessionContext');

const prefix = config.prefix || '.';

function toSC(t) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

// Mots suspects courants (complément local, sans appel IA)
const SPAM_PATTERNS = [
  /(.)\1{6,}/,              // caractères répétés
  /https?:\/\/\S+/gi,       // liens
  /(rejoins?|join|click|clique|gagne|prize|gagner|porn|xxx)/i,
];

const INSULT_LIST = [
  'idiot','imbécile','débile','connard','salope','enculé',
  'bâtard','con ','fdp','pd ','ntm','ta gueule',
];

function detectSpam(text) {
  return SPAM_PATTERNS.some(p => p.test(text));
}

function detectInsult(text) {
  const lower = text.toLowerCase();
  return INSULT_LIST.some(w => lower.includes(w));
}

function detectFlood(jid, groupId) {
  const key = sessionContext.scopeKey(`${groupId}:${jid}`);
  const now  = Date.now();
  if (!floodMap.has(key)) floodMap.set(key, []);
  const times = floodMap.get(key);
  times.push(now);
  // Garder seulement les 10 dernières secondes
  const recent = times.filter(t => now - t < 10000);
  floodMap.set(key, recent);
  return recent.length >= 5; // 5 messages en 10s = flood
}

const floodMap = new Map();

// Nettoyer floodMap toutes les 5 min pour éviter la fuite mémoire
// Référence gardée pour pouvoir l'annuler si nécessaire
const _floodCleanupTimer = setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [key, times] of floodMap.entries()) {
    if (!times.some(t => t > cutoff)) floodMap.delete(key);
  }
}, 5 * 60 * 1000);
if (_floodCleanupTimer.unref) _floodCleanupTimer.unref(); // Ne pas bloquer la fermeture du process

module.exports = [

  // ── .aimoderator ──────────────────────────────────────────────
  {
    name    : 'aimoderator',
    aliases : ['aimod', 'modai', 'moderateuia'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴍᴏᴅᴇ́ʀᴀᴛɪᴏɴ ɪᴀ ᴅᴜ ɢʀᴏᴜᴘᴇ (ᴏɴ/ᴏꜰꜰ)',
    usage   : `${prefix}aimoderator on | off`,
    groupOnly: true, adminOnly: true, botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, from, sender, isOwner, phrases } = extra;

      const sub = (args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(sub)) {
        return reply(`*📋 ${toSC('usage')}* : \`${prefix}aimoderator on\` | \`${prefix}aimoderator off\`\n\n${phrases.footer()}`);
      }

      const { updateGroupSettings } = require('../../database');
      updateGroupSettings(from, { aiModerator: sub === 'on' });

      return reply(
        `╭━≪• *🤖 ${toSC('moderateur ia')}* •≫━╮\n` +
        `┃ ${sub === 'on' ? '✅ *ᴀᴄᴛɪᴠᴇ́*' : '⛔ *ᴅᴇ́ꜱᴀᴄᴛɪᴠᴇ́*'}\n` +
        `┃\n` +
        `┃ 🔍 *${toSC('detection spam')}* : ✅\n` +
        `┃ 🔍 *${toSC('detection insultes')}* : ✅\n` +
        `┃ 🔍 *${toSC('detection flood')}* : ✅\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },

  // ── .aidetect ─────────────────────────────────────────────────
  {
    name    : 'aidetect',
    aliases : ['detectai', 'detectsuspect'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇ́ᴛᴇᴄᴛɪᴏɴ ɪɴᴛᴇʟʟɪɢᴇɴᴛᴇ ᴅᴇ ᴄᴏᴍᴘᴛᴇs sᴜsᴘᴇᴄᴛs',
    usage   : `${prefix}aidetect`,
    groupOnly: true, adminOnly: true, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from, sender, isOwner, phrases } = extra;

      await reply(`*🔍 ${toSC('analyse des membres en cours')}...*`);

      let meta;
      try { meta = await sock.groupMetadata(from); }
      catch { return reply(`*❌ ${toSC('impossible de lire les membres')}*`); }

      const suspects = [];
      for (const p of meta.participants) {
        const num = p.id.split('@')[0].split(':')[0];
        const flags = [];
        // Numéro trop court (bot potentiel)
        if (num.length < 7) flags.push(toSC('numero trop court'));
        // Numéro commençant par 0 (format suspect)
        if (num.startsWith('00')) flags.push(toSC('format numero suspect'));
        // Pas de nom visible (souvent les bots)
        if (flags.length > 0) suspects.push({ num, flags: flags.join(', ') });
      }

      if (suspects.length === 0) {
        return reply(
          `╭━≪• *🛡️ ${toSC('analyse terminee')}* •≫━╮\n` +
          `┃ ✅ *${toSC('aucun compte suspect detecte')}*\n` +
          `┃ 👥 *${toSC('membres analyses')}* : ${meta.participants.length}\n` +
          `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
      }

      const lines = suspects.slice(0, 10).map(s =>
        `┃ ⚠️ *+${s.num}* — ${s.flags}`
      ).join('\n');

      return reply(
        `╭━≪• *🔍 ${toSC('comptes suspects')} (${suspects.length})* •≫━╮\n` +
        `┃\n${lines}\n┃\n` +
        `┃ 👥 *${toSC('analyses')}* : ${meta.participants.length}\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },

  // ── .aianalyzegc ──────────────────────────────────────────────
  {
    name    : 'aianalyzegc',
    aliases : ['analyzegroup', 'analysegroupe', 'gcanalyze'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀɴᴀʟʏsᴇ ɪᴀ ᴄᴏᴍᴘʟᴇ̀ᴛᴇ ᴅᴜ ɢʀᴏᴜᴘᴇ',
    usage   : `${prefix}aianalyzegc`,
    groupOnly: true, adminOnly: true, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from, sender, isOwner, phrases } = extra;

      await reply(`*🤖 ${toSC('analyse ia en cours')}...*`);

      let meta;
      try { meta = await sock.groupMetadata(from); }
      catch { return reply(`*❌ ${toSC('erreur de lecture du groupe')}*`); }

      const totalMembers = meta.participants.length;
      const admins = meta.participants.filter(p => p.admin).length;

      const prompt =
        `Tu es un expert en analyse de groupes WhatsApp. Analyse ce groupe et fournis un rapport structuré en français.\n\n` +
        `Nom: ${meta.subject}\n` +
        `Description: ${meta.desc || 'aucune'}\n` +
        `Membres: ${totalMembers}\n` +
        `Admins: ${admins}\n` +
        `Annonces seulement: ${meta.announce ? 'oui' : 'non'}\n\n` +
        `Fournis: 1) Évaluation de la structure (sur 10), 2) Points forts, 3) Risques identifiés, 4) Recommandations concrètes. Sois concis (max 200 mots).`;

      let aiResponse = null;
      try {
        aiResponse = await askAI(prompt);
      } catch (aiErr) {
        console.warn(`[aianalyzegc] IA indisponible, repli local : ${aiErr.message}`);
        aiResponse = null;
      }

      if (!aiResponse) {
        // Analyse locale sans IA si l'API n'est pas disponible
        const ratio = (admins / totalMembers * 100).toFixed(1);
        return reply(
          `╭━≪• *🤖 ${toSC('rapport groupe')}* •≫━╮\n` +
          `┃ 📛 *${meta.subject}*\n` +
          `┃\n` +
          `┃ 👥 *${toSC('membres')}* : ${totalMembers}\n` +
          `┃ 👑 *${toSC('admins')}* : ${admins} (${ratio}%)\n` +
          `┃ 📢 *${toSC('mode annonces')}* : ${meta.announce ? '✅' : '❌'}\n` +
          `┃\n` +
          `┃ 💡 *${toSC('recommandation')}* :\n` +
          `┃ ${ratio > 30 ? `⚠️ ${toSC('trop d admins risque de conflits')}` : `✅ ${toSC('ratio admins correct')}`}\n` +
          `┃ ${totalMembers > 200 ? `⚠️ ${toSC('groupe tres grand attention aux spams')}` : `✅ ${toSC('taille correcte')}`}\n` +
          `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
      }

      return reply(
        `╭━≪• *🤖 ${toSC('analyse ia')}* •≫━╮\n` +
        `┃ 📛 *${meta.subject}*\n┃\n` +
        `${aiResponse.split('\n').map(l => `┃ ${l}`).join('\n')}\n┃\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },
];

// Export de fonctions pour handler.js (auto-modération)
module.exports.detectSpam   = detectSpam;
module.exports.detectInsult = detectInsult;
module.exports.detectFlood  = detectFlood;
