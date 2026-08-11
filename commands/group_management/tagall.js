/**
 * Tag All Command - Mention all group members
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

module.exports = {
  name: 'tagall',
  aliases: ['mentionall', 'everyone', 'all'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɪɴᴠᴏǫᴜᴇ ᴛᴏᴜs ʟᴇs ᴍᴇᴍʙʀᴇs ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ',
  usage: `${config.prefix || '.'}tagall <message>`,
  groupOnly: true,
  adminOnly: false, // Géré manuellement dans le code pour intégrer les Maîtres
  botAdminNeeded: false, // Mentionner les membres ne nécessite pas les droits admin du bot

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin } = extra;
    const prefix = config.prefix || '.';

    try {
      // 🛡️ SÉCURITÉ GÉRÉE PAR LE HANDLER
      const isMe = msg.key.fromMe || isOwner;

      // Si ce n'est pas TOI ou un Maître, on vérifie s'il est admin
      if (!isMe && !isAdmin) {
        return reply(`*❌ ${toSmallCaps('cette incantation est reservee aux administrateurs du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      const chatId = msg.key.remoteJid;
      const message = args.join(' ') || 'Appel aux membres !';
      
      // Récupération dynamique des participants
      const groupMetadata = await sock.groupMetadata(chatId);
      const participants = groupMetadata.participants.map(p => p.id || p.lid).filter(Boolean);

      // Fonction pour ajouter un zéro devant les chiffres < 10
      const padZero = (num) => (num < 10 ? `0${num}` : num);

      // 🎨 Construction du Design Encadré
      let text = `╭╼━━━━━━━━━━━━━━━╾╮\n` +
                 `┃     🔮 *${toSmallCaps('annonce du sanctuaire')}* \n` +
                 `╰╼━━━━━━━━━━━━━━━╾╯\n\n` +
                 `📢 *${toSmallCaps('message')} :*\n` +
                 `> ${message}\n\n` +
                 `👥 *${toSmallCaps('invocation des membres')} :*\n` +
                 `╭───────────────────╮\n`;

      participants.forEach((participant, index) => {
        text += `┃ [${padZero(index + 1)}] ➻ @${participant.split('@')[0]}\n`;
      });

      text += `╰───────────────────╯\n\n` +
              extra.phrases.footer();

      await sock.sendMessage(chatId, {
        text,
        mentions: participants 
      }, { quoted: msg });

    } catch (error) {
      console.error('TagAll Command Error:', error);
      await reply(`*❌ ${toSmallCaps('l invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  } // <-- L'accolade manquante a été ajoutée ici
};
