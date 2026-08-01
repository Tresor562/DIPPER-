/**
 * Inspect Command - 𝐃𝐚𝐫𝐤 Prestige Edition
 * FIX: guillemet non fermé ligne 31 dans l'original ('2290146202259] → '2290146202259']
 */

const database = require('../../database');
const config   = require('../../config.js');

function toSmallCaps(text) {
  if (!text) return '';
  const normal    = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const smallCaps = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => {
      const i = normal.indexOf(c);
      return i !== -1 ? smallCaps[i] : c;
    }).join('');
}

module.exports = {
  name    : 'inspecter',
  aliases : ['inspect', 'inspecter_whois', 'ins'],
  category: '🔧 Configuration',
  usage: '.inspecter @user',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴇxᴛʀᴀɪᴛ ʟᴇs ɪɴꜰᴏʀᴍᴀᴛɪᴏɴs sᴇᴄʀᴇ̀ᴛᴇs ᴅ\'ᴜɴᴇ ᴀ̂ᴍᴇ',

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, phrases } = extra;
    const chatId = msg.key.remoteJid;

    try {
      // FIX: guillemet fermant ajouté (était '2290146202259] au lieu de '2290146202259'])
      const supremeOwners = ['2290146202259', '2290155745907'];

      let senderJid    = msg.key.fromMe
        ? sock.user.id
        : (msg.key.participant || msg.key.remoteJid);
      const senderNumber = senderJid.split('@')[0].split(':')[0].replace(/\D/g, '');

      if (!supremeOwners.includes(senderNumber) && !isOwner) return;

      let targetJid;
      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;

      if (ctxInfo?.quotedMessage) {
        targetJid = ctxInfo.participant;
      } else if (ctxInfo?.mentionedJid && ctxInfo.mentionedJid.length > 0) {
        targetJid = ctxInfo.mentionedJid[0];
      } else if (args[0]) {
        const cleanNumber = args[0].replace(/\D/g, '');
        if (cleanNumber.length >= 8) targetJid = `${cleanNumber}@s.whatsapp.net`;
      }

      if (!targetJid) {
        return reply(`*⚠️ ${toSmallCaps('identifiez une cible maître')} !*`);
      }

      const targetNumber = targetJid.split('@')[0].split(':')[0].replace(/\D/g, '');

      const userSettings = database.getUserSettings(targetJid);
      const allUsers     = database.getAllUsers();

      const sortedUsers  = allUsers.sort((a, b) => (b.commandCount || 0) - (a.commandCount || 0));
      const rankPosition = sortedUsers.findIndex(u => u.jid === targetJid) + 1;

      const envPrefix  = process.env.PREFIX || process.env.prefix || config.prefix || '.';
      const lastPrefix = userSettings.lastPrefixUsed || envPrefix;

      const targetCount = userSettings.commandCount || 0;
      const isBanned    = userSettings.isBanned || userSettings.banned || false;
      const isPremium   = userSettings.premium || false;

      let activityRank = '🔮 ᴍᴇᴍʙʀᴇ ɴᴇ́ᴏᴘʜʏᴛᴇ';
      if (supremeOwners.includes(targetNumber))   activityRank = '👑 sᴜᴘʀᴇᴍᴇ ᴏᴡɴᴇʀ';
      else if (targetCount > 500)                 activityRank = '💎 ᴀʀᴄʜɪᴍᴀɢᴇ sᴜᴘʀᴇ̂ᴍᴇ';
      else if (targetCount > 100)                 activityRank = '🌑 ᴏᴍʙʀᴇ sᴇɴɪᴏʀ';
      else if (targetCount > 20)                  activityRank = '⚔️ ɢᴀʀᴅɪᴇɴ';

      const status = isBanned
        ? '❌ *ʙᴀɴɴɪ*'
        : (isPremium ? '🌟 *ᴘʀᴇᴍɪᴜᴍ*' : '✅ *ᴀᴜᴛᴏʀɪsᴇ́*');

      const rapport =
        `*╭━≪• ʀᴀᴘᴘᴏʀᴛ ᴅ'ɪɴsᴘᴇᴄᴛɪᴏɴ •≫╾╮*\n` +
        `*┃* 👤 *ᴄɪʙʟᴇ :* @${targetNumber}\n` +
        `*┃* 🆔 *ɴᴜᴍᴇ́ʀᴏ :* ${targetNumber}\n` +
        `*┃* 🏆 *ᴘᴏsɪᴛɪᴏɴ :* #${rankPosition} / ${allUsers.length}\n` +
        `*┃* 🔮 *ᴛɪᴛʀᴇ :* ${activityRank}\n` +
        `*┃* 📊 *ᴇ́ᴛᴀᴛ :* ${status}\n` +
        `*┃* ⌨️ *ᴘʀᴇ́ꜰɪxᴇ :* \`${lastPrefix}\`\n` +
        `*┃* 📅 *ᴄᴏᴍᴍᴀɴᴅᴇs :* ${targetCount}\n` +
        `*╰╼━━━━━━━━━━━━━━━━╾╯*\n\n` +
        phrases.footer();

      try {
        if (chatId.endsWith('@g.us')) {
          await sock.sendMessage(chatId, { delete: msg.key });
        }
      } catch (_) {}

      await sock.sendMessage(`${senderNumber}@s.whatsapp.net`, {
        text    : rapport,
        mentions: [targetJid]
      });

    } catch (error) {
      console.error(error);
      return reply(`*❌ ${toSmallCaps('erreur fatale')} !*\n\n${phrases.footer()}`);
    }
  }
};
