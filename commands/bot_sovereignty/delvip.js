/**
 * delvip — Retirer un utilisateur VIP
 * Réservé au Supreme Owner uniquement
 */
'use strict';

const { removeVip, getVipInfo } = require('../../utils/vipDB');
const config = require('../../config');
const prefix = config.prefix || '.';

function toSC(t) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

module.exports = {
  name    : 'delvip',
  aliases : ['removevip', 'vip-', 'unvip'],
  category: '👑 Owner',
  ownerOnly: true,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴛɪʀᴇ ʟ\'ᴀᴄᴄᴇ̀s ᴠɪᴘ',
  usage: `${prefix}delvip @mention`,
  groupOnly: false, adminOnly: false, botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, phrases, from } = extra;

    if (!isOwner) {
      return reply(`*⛔ ${toSC('reserve au supreme owner')}*\n\n${phrases.footer()}`);
    }

    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quotedJid     = msg.message?.extendedTextMessage?.contextInfo?.participant;
    let target = mentionedJids[0] || quotedJid;

    if (!target && args[0]) {
      target = args[0].replace(/\D/g, '') + '@s.whatsapp.net';
    }

    if (!target) {
      return reply(
        `*📌 ${toSC('usage')} :* \`${prefix}delvip @mention\`\n\n${phrases.footer()}`
      );
    }

    const existing = getVipInfo(target);
    if (!existing) {
      return reply(
        `*ℹ️ ${toSC('cet utilisateur n est pas vip')}*\n\n${phrases.footer()}`
      );
    }

    removeVip(target);
    const num = target.split('@')[0];

    return reply(
      `╭━≪• *🚫 ${toSC('acces vip retire')}* •≫━╮\n` +
      `┃ 👤 *${toSC('utilisateur')}* : @${num}\n` +
      `┃ ❌ *${toSC('acces vip desactive')}*\n` +
      `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
    );
  },
};
