/**
 * WhatsApp Channel Info Command - 𝐃𝐚𝐫𝐤  Edition
 * Extrait les informations d'un canal WhatsApp et affiche sa vraie Newsletter native
 */

const config = require('../../config.js');

// Extraction du préfixe pour l'usage
const prefix = config.prefix || '.';

// Fonction pour le style Small Caps
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
  name: 'infos_canal', // 🛠️ FIX : Nom en lettres normales pour la détection
  aliases: ['newsletter', 'channel', 'canal', 'channelid', 'ɪɴғᴏs_ᴄᴀɴᴀʟ'],
  category: '👑 Owner',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀғғɪᴄʜᴇ ʟᴀ ɴᴇᴡsʟᴇᴛᴛᴇʀ ᴅᴇᴘᴜɪs ʟᴇ ʟɪᴇɴ ᴅ\'ᴜɴᴇ ᴄʜᴀɪ̂ɴᴇ ᴡʜᴀᴛsᴀᴘᴘ',
  usage: `${prefix}infos_canal <ʟɪᴇɴ_ᴄᴀɴᴀʟ>`,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const chatId = msg.key.remoteJid;

    try {
      const text = args.join(' ');

      // Extraction propre du lien de canal s'il est noyé dans du texte
      const linkMatch = text.match(/https:\/\/whatsapp\.com\/channel\/([A-Za-z0-9]+)/);

      if (!linkMatch) {
        return await reply(`*〆 ${toSmallCaps('invoque un lien de canal valide')} !*\n\n*${toSmallCaps('exemple')} : _${prefix}infos_canal https://whatsapp.com/channel/xxxxxxxxx_*`);
      }

      const inviteCode = linkMatch[1]; // Le code unique après /channel/

      await reply(`*📡 ${toSmallCaps('interrogation des arcanes du canal en cours')}...*`);

      // 🛡️ MÉTHODE NATIVE BAILEYS : Récupération des données réelles du canal
      let data;
      try {
          data = await sock.newsletterMetadata("invite", inviteCode);
      } catch (e) {
          // Syntaxe alternative pour certaines versions de Baileys
          data = await sock.newsletterMetadata(inviteCode);
      }

      if (!data) {
        throw new Error('Impossible de lire les données de ce canal.');
      }

      // Formatage ID JID de la newsletter
      const newsletterJid = data.id || `${inviteCode}@newsletter`;
      const channelName = data.name || 'Canal WhatsApp';

      // Construction du récapitulatif textuel
      const recapText = 
        `*╭╼━━━≪• sᴏᴜᴠᴇʀᴀɪɴᴇᴛᴇ́ •≫━━━╾╮*\n\n` +
        `*📢 ᴄᴀɴᴀʟ :* ${channelName}\n` +
        `*🆔 ᴊɪᴅ :* ${newsletterJid}\n` +
        `*🔗 ʟɪᴇɴ :* https://whatsapp.com/channel/${inviteCode}\n\n` +
        `*╰━━━━━━━━━━━━━━━━━━━━━━━╯*\n\n` +
        `> *♰ ᴇ́ᴛᴀʙʟɪ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`;

      // 🚀 GÉNÉRATION DU VRAI WIDGET NEWSLETTER NATIF
      await sock.sendMessage(chatId, {
        text: recapText,
        contextInfo: {
          mentionedJid: [msg.sender],
          forwardingScore: 1,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: newsletterJid,
            serverMessageId: 100, // ID arbitraire pour tromper l'UI
            newsletterName: channelName
          }
        }
      }, { quoted: msg });

    } catch (error) {
      console.error('Error in channel command:', error);
      await reply(`*〆 ${toSmallCaps('l invocation a echoue')} : ${toSmallCaps('les arcanes du canal sont inaccessibles')}.*`);
    }
  }
};
