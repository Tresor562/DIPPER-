/**
 * Add Command - 𝐃𝐚𝐫𝐤 Edition
 * FIX: virgule manquante après groupOnly: true
 * FIX: extra.phrases.footer() dans sendPrivateInvite() hors scope → footer passé en paramètre
 */

const config = require('../../config.js');
const prefix = config.prefix || '.';

module.exports = {
  name: 'add',
  aliases: ['ajouter', 'inviter', 'a'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴊᴏᴜᴛᴇ ᴜɴ ᴍᴇᴍʙʀᴇ ᴀᴜ ɢʀᴏᴜᴘᴇ ᴏᴜ ʟᴜɪ ᴇɴᴠᴏɪᴇ ᴜɴᴇ ɪɴᴠɪᴛᴀᴛɪᴏɴ ᴘʀɪᴠᴇ́ᴇ',
  usage: `${prefix}add 229XXXXXXXX`,
  groupOnly: true,    // FIX: virgule manquante ici dans l'original
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, isAdmin, isOwner, from, phrases } = extra;
    const footer = phrases.footer();

    try {
      const hasAccess = isOwner === true || isAdmin === true;

      if (!hasAccess) {
        return reply(
          `*❌ ᴄᴇᴛᴛᴇ ɪɴᴄᴀɴᴛᴀᴛɪᴏɴ ᴇsᴛ ʀᴇ́sᴇʀᴠᴇ́ᴇ ᴀᴜx ᴀᴅᴍɪɴɪsᴛʀᴀᴛᴇᴜʀs !*\n\n${footer}`
        );
      }

      const targetNumber = args[0];

      if (!targetNumber) {
        return reply(
          `*🌑 ʟ'ᴏᴍʙʀᴇ ʀᴇᴊᴇᴛᴛᴇ ᴄᴇᴛ ᴀᴘᴘᴇʟ*\n\n` +
          `*┃* 🔮 *ɪɴᴄᴀɴᴛᴀᴛɪᴏɴ :*\n` +
          `*┃* ᴠᴇᴜɪʟʟᴇᴢ ʀᴇɴsᴇɪɢɴᴇʀ ʟᴇ ɴᴜᴍᴇ́ʀᴏ\n\n` +
          `  \`${prefix}add 229XXXXXXXX\`\n\n` +
          footer
        );
      }

      const cleanedNumber = targetNumber.replace(/[^0-9]/g, '');
      const targetJid     = `${cleanedNumber}@s.whatsapp.net`;

      await reply(`⏳ *ᴛᴇɴᴛᴀᴛɪᴠᴇ ᴅ'ᴀsᴘɪʀᴀᴛɪᴏɴ ᴅ'ᴀ̂ᴍᴇ...*`);

      const freshMetadata = await sock.groupMetadata(from);
      const isAlready     = freshMetadata.participants.some(
        p => p.id === targetJid || p.lid === targetJid
      );

      if (isAlready) {
        return reply(`❌ *ᴄᴇᴛ ɪɴᴅɪᴠɪᴅᴜ ꜰᴀɪᴛ ᴅᴇ́ᴊᴀ̀ ᴘᴀʀᴛɪᴇ ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ !*\n\n${footer}`);
      }

      const isBotAdmin = extra.isBotAdmin;

      if (!isBotAdmin) {
        await reply(`🔮 *ʟ'ᴏᴍʙʀᴇ ɴ'ᴇsᴛ ᴘᴀs ᴀᴅᴍɪɴ ɪᴄɪ. ʙᴀsᴄᴜʟᴇ ᴇɴ ᴍᴏᴅᴇ ɪɴᴠɪᴛᴀᴛɪᴏɴ ᴘʀɪᴠᴇ́ᴇ...*`);
        return sendPrivateInvite(sock, from, targetJid, freshMetadata, reply, footer);
      }

      try {
        const response = await sock.groupParticipantsUpdate(from, [targetJid], 'add');

        if (response && response[0] && response[0].status === '200') {
          return await sock.sendMessage(from, {
            text: `🎯 *@${cleanedNumber}* ᴀ ᴇ́ᴛᴇ́ ᴀsᴘɪʀᴇ́ ᴅᴀɴs ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ !\n\n${footer}`,
            mentions: [targetJid]
          }, { quoted: msg });
        }

        return sendPrivateInvite(sock, from, targetJid, freshMetadata, reply, footer);

      } catch (_) {
        return sendPrivateInvite(sock, from, targetJid, freshMetadata, reply, footer);
      }

    } catch (error) {
      await reply(`❌ *ᴇʀʀᴇᴜʀ :* ${error.message}\n\n${phrases.footer()}`);
    }
  }
};

// FIX: footer passé en paramètre (extra non disponible ici)
async function sendPrivateInvite(sock, from, targetJid, metadata, reply, footer) {
  try {
    const inviteCode = await sock.groupInviteCode(from);
    const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
    const groupName  = metadata.subject;
    const numero     = targetJid.split('@')[0];

    const pvMessage =
      `*╭╼≪• ɪɴᴠɪᴛᴀᴛɪᴏɴ ᴀᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ •≫╾╮*\n` +
      `*┃* 🔮 *ɢʀᴏᴜᴘᴇ* : ${groupName}\n\n` +
      `*┃* sᴀʟᴜᴛᴀᴛɪᴏɴs, ᴇɴᴛɪᴛᴇ́.\n` +
      `*┃* ᴜɴ ɢᴀʀᴅɪᴇɴ ᴀ sᴏᴜʜᴀɪᴛᴇ́ ᴛ'ᴀᴊᴏᴜᴛᴇʀ\n` +
      `*┃* ᴀᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ. ᴠᴏɪᴄɪ ᴛᴏɴ ᴘᴏʀᴛᴀɪʟ :\n\n` +
      `🔗 ${inviteLink}\n\n` +
      footer;

    try {
      await sock.sendMessage(targetJid, { text: pvMessage });
      return reply(`🛡️ *ɪɴᴠɪᴛᴀᴛɪᴏɴ ᴇɴᴠᴏʏᴇ́ᴇ ᴇɴ ᴘʀɪᴠᴇ́ ᴀ̀ @${numero} !*\n\n${footer}`);
    } catch (_) {
      return reply(`🛡️ *ɪᴍᴘᴏssɪʙʟᴇ ᴅ'ᴇ́ᴄʀɪʀᴇ ᴇɴ ᴘʀɪᴠᴇ́. ᴠᴏɪᴄɪ ʟᴇ ʟɪᴇɴ ᴅɪʀᴇᴄᴛ :*\n🔗 ${inviteLink}\n\n${footer}`);
    }

  } catch (_) {
    return reply(`🛡️ *ɪᴍᴘᴏssɪʙʟᴇ ᴅᴇ ɢᴇ́ɴᴇ́ʀᴇʀ ʟᴇ ʟɪᴇɴ ᴅ'ɪɴᴠɪᴛᴀᴛɪᴏɴ.*`);
  }
}
