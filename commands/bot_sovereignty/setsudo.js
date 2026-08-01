/**
 * SetSudo Command - 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * Accorde l'accès bot à un utilisateur précis
 * (toutes commandes sauf catégorie souveraineté)
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
  name: 'setsudo',
  aliases: ['addsudo', 'sudo', 'autoriser'],
  category: '👑 Owner',
  ownerOnly: true,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴄᴄᴏʀᴅᴇ ʟ\'ᴀᴄᴄᴇ̀s ʙᴏᴛ ᴀ̀ ᴜɴ ᴜᴛɪʟɪsᴀᴛᴇᴜʀ',
  usage: `${prefix}setsudo @user`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isSupremeOwner: isSuperMe, toSmallCaps, from } = extra;
    if (!isOwner && !isSuperMe) return;

    const supremeNumbers = (config.supremeOwners || []).map(n => String(n).replace(/\D/g, ''));
    const ownerNumbers   = (config.ownerNumber   || []).map(n => String(n).replace(/\D/g, ''));

    const target = extractTarget(msg, args);
    if (!target) {
      return reply(
        `*〆 ${toSmallCaps('mentionne ou reponds a une ame')} !*\n` +
        `*${toSmallCaps('usage')} : \`${prefix}setsudo @user\`*`
      );
    }

    const targetNumber = target.split('@')[0].split(':')[0].replace(/\D/g, '');

    if (supremeNumbers.includes(targetNumber) || ownerNumbers.includes(targetNumber)) {
      return reply(
        `*🛡️ ${toSmallCaps('ce rang est deja superieur au sudo')} !*\n` +
        extra.phrases.footer()
      );
    }

    const existing = database.getUser?.(target) || database.getUserSettings?.(target) || {};
    if (existing?.isSudo) {
      return reply(
        `*⚠️ @${targetNumber} ${toSmallCaps('possede deja le rang sudo')}.*`,
        { mentions: [target] }
      );
    }

    try {
      if (database.updateUser)           database.updateUser(target, { isSudo: true });
      else if (database.setUserSettings) database.setUserSettings(target, { isSudo: true });
    } catch (e) {
      return reply(`*〆 ${toSmallCaps('erreur db')} : ${e.message}*`);
    }

    await sock.sendMessage(from, {
      text:
        `╭━≪• *⚜️ sᴜᴅᴏ ɢʀᴀɴᴛᴇᴅ* •≫━╾╮\n` +
        `┃ 👤 *ᴇɴᴛɪᴛᴇ́* : @${targetNumber}\n` +
        `┃ 🔓 *ʀᴀɴɢ* : ⚜️ sᴜᴅᴏ\n` +
        `┃ ✅ *${toSmallCaps('acces accorde')}*\n` +
        `┃ ${toSmallCaps('peut utiliser les commandes de 𝐃𝐈𝐏𝐏𝐄𝐑 a present')}\n` +
        `┃ ${toSmallCaps('sauf la categorie souverainete.')}\n` +
        `╰━━━━━━━━━━━━━━━━━━━╯\n` +
        extra.phrases.footer(),
      mentions: [target]
    }, { quoted: msg });
  }
};
