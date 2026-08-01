/**
 * groupstats / activity — 𝐃𝐚𝐫𝐤
 * Statistiques du groupe basées sur utils/groupstats.js, seule source de
 * vérité pour les statistiques (alimentée en temps réel par handler.js,
 * ligne ~1058 : addMessage(from, sender) à chaque message de groupe).
 *
 * [FIX] Cette commande maintenait auparavant son propre Map en mémoire
 * (activityStore), jamais alimenté par handler.js → .groupstats/.activity
 * affichaient toujours des données vides. Corrigé en lisant directement
 * getStats()/getAllStats() de utils/groupstats.js. Aucune donnée non
 * disponible dans ce système (ex. lastSeen individuel) n'est affichée.
 *
 * [FIX] Restriction Premium retirée — démantèlement progressif du système
 * Premium déjà décidé pour le projet.
 */
'use strict';

const config = require('../../config');
const { getStats, getAllStats } = require('../../utils/groupstats');

const prefix = config.prefix || '.';

function toSC(t) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

function buildBar(val, max, len = 8) {
  const fill = Math.round((val / Math.max(max, 1)) * len);
  return '█'.repeat(fill) + '░'.repeat(len - fill);
}

// Agrège les compteurs par utilisateur sur tout l'historique retenu
// (utils/groupstats.js purge automatiquement les jours de plus de 30 jours).
function aggregateUsers(allStats) {
  const totals = {};
  for (const day of Object.values(allStats)) {
    for (const [jid, count] of Object.entries(day.users || {})) {
      totals[jid] = (totals[jid] || 0) + count;
    }
  }
  return totals;
}

module.exports = [

  // ── .groupstats ───────────────────────────────────────────────
  {
    name    : 'groupstats',
    aliases : ['gcstats', 'statgroupe', 'statsgroupe'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ sᴛᴀᴛɪsᴛɪǫᴜᴇs ᴅᴜ ɢʀᴏᴜᴘᴇ',
    usage   : `${prefix}groupstats`,
    groupOnly: true, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from, phrases } = extra;

      let meta;
      try { meta = await sock.groupMetadata(from); }
      catch { return reply(`*❌ ${toSC('impossible de lire les informations du groupe')}*`); }

      const today     = getStats(from);
      const allStats  = getAllStats(from);
      const days      = Object.keys(allStats);
      const totalAll  = Object.values(allStats).reduce((s, d) => s + (d.total || 0), 0);
      const userTotals = aggregateUsers(allStats);
      const top3 = Object.entries(userTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([jid, count]) => {
          const num = jid.split('@')[0].split(':')[0];
          return `┃   📌 *+${num}* — ${count} msg`;
        }).join('\n');

      return reply(
        `╭━≪• *📊 ${toSC('statistiques du groupe')}* •≫━╮\n` +
        `┃\n` +
        `┃ 📛 *${meta.subject}*\n` +
        `┃ 👥 *${toSC('membres')}* : ${meta.participants.length}\n` +
        `┃ 💬 *${toSC('messages aujourd hui')}* : ${today?.total || 0}\n` +
        `┃ 🗓️ *${toSC('messages sur la periode retenue')}* : ${totalAll}\n` +
        `┃ ✅ *${toSC('membres actifs aujourd hui')}* : ${today ? Object.keys(today.users).length : 0}\n` +
        `┃ 📆 *${toSC('jours de donnees disponibles')}* : ${days.length}\n` +
        `┃\n` +
        `┃ 🏆 *${toSC('top 3 membres')}* :\n` +
        `${top3 || `┃   _${toSC('aucune donnee disponible')}_`}\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },

  // ── .activity ─────────────────────────────────────────────────
  {
    name    : 'activity',
    aliases : ['classement', 'ranking', 'topactifs'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄʟᴀssᴇᴍᴇɴᴛ ᴅ\'ᴀᴄᴛɪᴠɪᴛᴇ́ ᴅᴇs ᴍᴇᴍʙʀᴇs',
    usage   : `${prefix}activity`,
    groupOnly: true, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from, phrases } = extra;

      const today      = getStats(from);
      const allStats   = getAllStats(from);
      const userTotals = aggregateUsers(allStats);
      const users      = Object.entries(userTotals).sort((a, b) => b[1] - a[1]);

      if (users.length === 0) {
        return reply(
          `*📊 ${toSC('aucune donnee d activite disponible')}*\n` +
          `_${toSC('les donnees se collectent au fil des messages')}_\n\n${phrases.footer()}`
        );
      }

      const max = users[0][1];
      const medals = ['🥇', '🥈', '🥉'];
      const top10 = users.slice(0, 10);
      const activeToday = new Set(today ? Object.keys(today.users) : []);

      const lines = top10.map(([jid, count], i) => {
        const num = jid.split('@')[0].split(':')[0];
        const bar = buildBar(count, max);
        const medal = medals[i] || `${i + 1}.`;
        const active = activeToday.has(jid) ? '🟢' : '⚪';
        return `┃ ${medal} ${active} *+${num}*\n┃    ${bar} ${count} msg`;
      }).join('\n');

      return reply(
        `╭━≪• *🏆 ${toSC('classement d activite')}* •≫━╮\n` +
        `┃\n` +
        `${lines}\n` +
        `┃\n` +
        `┃ 🟢 ${toSC('actif aujourd hui')} | ⚪ ${toSC('inactif aujourd hui')}\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },

];
