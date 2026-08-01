/**
 * Link Command - Get group invite link
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * Sécurité : Supreme Owner Master Access (Invisible Bypass)
 */

const config = require('../../config.js'); 

// Fonction pour le style Small Caps (Cohérence visuelle du sanctuaire)
function toSmallCaps(text) {
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";

  const cleanedText = text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 

  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

const prefix = config.prefix || '.';

module.exports = {
  name: 'grouplink',
  aliases: ['link', 'invite', 'portail'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɢᴇɴᴇʀᴇ ʟᴇ ʟɪᴇɴ ᴅ\'ɪɴᴠɪᴛᴀᴛɪᴏɴ ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ',
  usage: `${prefix}grouplink`, // 💡 Dynamique avec ton préfixe actuel
  groupOnly: true,
  adminOnly: false, // Traitement manuel ci-dessous pour inclure les Maîtres
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin } = extra;

    try {
      // 🛡️ SÉCURITÉ GÉRÉE PAR LE HANDLER
      const isMe = msg.key.fromMe || isOwner;

      // 🚨 ÉVALUATION DES DROITS
      if (!isMe && !isAdmin) {
        return reply(`*❌ ${toSmallCaps('cette incantation est reservee aux administrateurs du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      const chatId = msg.key.remoteJid;

      // Récupération du code d'invitation
      const code = await sock.groupInviteCode(chatId);
      const link = `https://chat.whatsapp.com/${code}`;

      // Récupération des métadonnées pour avoir le nom du groupe à jour
      const metadata = await sock.groupMetadata(chatId);
      const subject = metadata.subject || 'sᴀɴᴄᴛᴜᴀɪʀᴇ';

      const text = `*╭╼≪• ʟɪᴇɴ ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ •≫╾╮*\n` +
                   `*┃* 👥 *${toSmallCaps('groupe')} :* ${subject}\n` +
                   `*┃* 🔗 *${toSmallCaps('lien')} :* ${link}\n\n` +
                   `*┃* ⚠️ *${toSmallCaps('ne partage pas ce lien publiquement')} !*\n\n` +
                   extra.phrases.footer();

      await reply(text);

    } catch (error) {
      console.error('GroupLink Error:', error);
      await reply(`*❌ ${toSmallCaps('l invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
