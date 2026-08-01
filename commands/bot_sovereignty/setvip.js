/**
 * setvip — Ajouter un utilisateur VIP
 * Réservé au Supreme Owner uniquement
 */
'use strict';

const { addVip, getVipInfo } = require('../../utils/vipDB');
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
  name    : 'setvip',
  aliases : ['addvip', 'vip+', 'gievevip'],
  category: '👑 Owner',
  ownerOnly: true,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴊᴏᴜᴛᴇ ᴜɴ ᴜᴛɪʟɪsᴀᴛᴇᴜʀ ᴠɪᴘ',
  usage: `${prefix}setvip @mention [jours]`,
  groupOnly: false, adminOnly: false, botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, phrases, sender, from } = extra;

    if (!isOwner) {
      return reply(`*⛔ ${toSC('reserve au supreme owner')}*\n\n${phrases.footer()}`);
    }

    // Extraire le numéro cible
    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quotedJid     = msg.message?.extendedTextMessage?.contextInfo?.participant;
    let target = mentionedJids[0] || quotedJid;

    if (!target && args[0]) {
      target = args[0].replace(/\D/g, '') + '@s.whatsapp.net';
    }

    if (!target) {
      return reply(
        `*📌 ${toSC('usage')} :* \`${prefix}setvip @mention [jours]\`\n` +
        `_${toSC('ou réponds à un message')}_\n\n${phrases.footer()}`
      );
    }

    // Nombre de jours (0 = illimité)
    const daysArg = parseInt(args.find(a => /^\d+$/.test(a))) || 0;

    // Vérifier si déjà VIP
    const existing = getVipInfo(target);
    if (existing) {
      return reply(
        `*ℹ️ ${toSC('deja vip')}*\n` +
        `_${target.split('@')[0]}_\n` +
        `_${toSC('expiration')} : ${existing.expiresAt ? new Date(existing.expiresAt).toLocaleDateString('fr-FR') : toSC('illimite')}_\n\n` +
        phrases.footer()
      );
    }

    addVip(target, daysArg, sender);
    const num = target.split('@')[0];

    return reply(
      `╭━≪• *👑 ${toSC('vip active')}* •≫━╮\n` +
      `┃ 👤 *${toSC('utilisateur')}* : @${num}\n` +
      `┃ 📅 *${toSC('duree')}* : ${daysArg > 0 ? `${daysArg} ${toSC('jours')}` : toSC('illimitee')}\n` +
      `┃ ✅ *${toSC('acces vip active')}*\n` +
      `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
      // mention
    );
  },
};
