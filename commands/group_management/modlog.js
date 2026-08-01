/**
 * modlog — 𝐃𝐚𝐫𝐤
 * Journal administratif du groupe.
 * Tier : Premium
 *
 * Interface d'affichage uniquement. Le stockage/l'écriture/la lecture
 * sont désormais entièrement gérés par utils/modlog.js (source officielle
 * unique — voir PROGRESS.md, décision OPTION A2).
 */
'use strict';

const config = require('../../config');
const { isPremium } = require('../../utils/premiumDB');
const { getEntries } = require('../../utils/modlog');

const prefix = config.prefix || '.';

function toSC(t) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

const ICONS = {
  kick   : '🚫', promote: '⬆️', demote: '⬇️', warn: '⚠️',
  delete : '🗑️', ban: '⛔', mute: '🔇', unmute: '🔊',
  add    : '➕', link: '🔗', setting: '⚙️',
  approve: '✅', reject: '🚫', resetwarn: '♻️',
};

module.exports = {
  name    : 'modlog',
  aliases : ['adminlog', 'journal', 'historique'],
  category: '⚙️ Gestion de groupe',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴊᴏᴜʀɴᴀʟ ᴀᴅᴍɪɴɪsᴛʀᴀᴛɪꜰ ᴅᴜ ɢʀᴏᴜᴘᴇ',
  usage   : `${prefix}modlog [nombre]`,
  groupOnly: true, adminOnly: true, botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, from, sender, isOwner, phrases } = extra;

    if (!isOwner && !isPremium(sender)) {
      return reply(
        `╭╼≪• *👑 ᴘʀᴇᴍɪᴜᴍ ʀᴇǫᴜɪs* •≫╾╮\n┃ 🔒 *${toSC('commande reservee aux membres premium')}*\n╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    }

    const limit = Math.min(parseInt(args[0]) || 10, 50);
    const entries = getEntries(from);

    if (entries.length === 0) {
      return reply(
        `*📋 ${toSC('journal vide')}*\n_${toSC('aucune action enregistree dans ce groupe')}_\n\n${phrases.footer()}`
      );
    }

    const recent = entries.slice(-limit).reverse();
    const lines  = recent.map(e => {
      const icon = ICONS[e.action] || '📌';
      const date = new Date(e.timestamp).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      const by   = e.by.split('@')[0].split(':')[0];
      const target = e.target ? ` → +${e.target.split('@')[0].split(':')[0]}` : '';
      const reason = e.reason ? ` (${e.reason})` : '';
      return `┃ ${icon} *${e.action}*${target}\n┃    👤 +${by}${reason}\n┃    🕐 ${date}`;
    }).join('\n┃\n');

    return reply(
      `╭━≪• *📋 ${toSC('journal admin')} (${recent.length})* •≫━╮\n┃\n${lines}\n┃\n` +
      `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
    );
  },
};
