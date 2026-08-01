/**
 * DelSudo Command - 𝐃𝐚𝐫𝐤-X Edition
 * Révoque l'accès sudo d'un utilisateur
 */

const database = require('../../database');
const config   = require('../../config');
const prefix   = config.prefix || '.';

function extractTarget(msg, args) {
  const ctx       = msg.message?.extendedTextMessage?.contextInfo;
  const mentioned = ctx?.mentionedJid || [];
  if (mentioned.length > 0) return mentioned[0];
  if (ctx?.quotedMessage && ctx?.participant) return ctx.participant;
  if (args[0] && /^\d{8,}$/.test(args[0].replace('@', '')))
    return args[0].replace('@', '') + '@s.whatsapp.net';
  return null;
}

module.exports = {
  name: 'delsudo',
  aliases: ['removesudo', 'sudorm', 'deautoriser', 'revoquer'],
  category: '👑 Owner',
  ownerOnly: true,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴠᴏǫᴜᴇ ʟ\'ᴀᴄᴄᴇ̀s sᴜᴅᴏ ᴅ\'ᴜɴ ᴜᴛɪʟɪsᴀᴛᴇᴜʀ',
  usage: `${prefix}delsudo @user`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isSupremeOwner: isSuperMe, toSmallCaps, from } = extra;
    if (!isOwner && !isSuperMe) return;

    const target = extractTarget(msg, args);
    if (!target) {
      return reply(
        `*〆 ${toSmallCaps('mentionne ou reponds a une ame')} !*\n` +
        `*${toSmallCaps('usage')} : \`${prefix}delsudo @user\`*`
      );
    }

    const targetNumber = target.split('@')[0].split(':')[0].replace(/\D/g, '');

    const existing = database.getUser?.(target) || database.getUserSettings?.(target) || {};
    if (!existing?.isSudo) {
      return reply(
        `*⚠️ @${targetNumber} ${toSmallCaps('ne possede pas le rang sudo')}.*`,
        { mentions: [target] }
      );
    }

    try {
      if (database.updateUser)           database.updateUser(target, { isSudo: false });
      else if (database.setUserSettings) database.setUserSettings(target, { isSudo: false });
    } catch (e) {
      return reply(`*〆 ${toSmallCaps('erreur db')} : ${e.message}*`);
    }

    await sock.sendMessage(from, {
      text:
        `╭━≪• *🔒 sᴜᴅᴏ ʀᴇᴠᴏᴋᴇᴅ* •≫━╾╮\n` +
        `┃ 👤 *ᴇɴᴛɪᴛᴇ́* : @${targetNumber}\n` +
        `┃ 🔐 *ʀᴀɴɢ* : ᴜᴛɪʟɪsᴀᴛᴇᴜʀ\n` +
        `┃ ❌ *${toSmallCaps('acces sudo retire')}*\n` +
        `┃ ${toSmallCaps('retour au rang utilisateur.')}\n` +
       `╰━━━━━━━━━━━━━━━━━━━━╯\n` +
        extra.phrases.footer(),
      mentions: [target]
    }, { quoted: msg });
  }
};
