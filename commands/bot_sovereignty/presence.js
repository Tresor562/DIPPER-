/**
 * Presence Command - 𝐃𝐚𝐫𝐤 Overlord Edition
 * Modifie l'état de présence de l'Oracle (En ligne, Écrit, Enregistre...)
 * ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐃𝐚𝐫𝐤
 */

const config = require('../../config.js');
const database = require('../../database'); // On suppose que tu as une DB pour sauvegarder l'état

const prefix = config.prefix || '.';

// Fonction pour le style Small Caps
function toSmallCaps(text) {
  if (!text) return '';
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";

  const cleanedText = String(text).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 

  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

module.exports = {
  name: 'presence',
  aliases: ['pres', 'status', 'pʀᴇsᴇɴᴄᴇ'],
  category: '👑 Owner',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄᴏɴғɪɢᴜʀᴇ ʟᴀ ᴘʀᴇsᴇɴᴄᴇ ᴅᴇ ʟ\'ᴏʀᴀᴄʟᴇ (ᴇɴ ʟɪɢɴᴇ, ᴇᴄʀɪᴛ, ᴀᴜᴅɪᴏ...)',
  usage: `${prefix}presence <online/typing/recording/off>`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner } = extra;
    const chatId = msg.key.remoteJid;

    try {
      const supremeOwners = ['2290146202259', '2290155745907'];

      let senderJid = msg.key.fromMe 
        ? sock.user.id 
        : (msg.key.participant || msg.key.remoteJid);
      
      const bareJid = senderJid.split('@')[0].split(':')[0];
      const senderNumber = bareJid.replace(/\D/g, '');

      const isSupreme = supremeOwners.includes(senderNumber);
      const isLocalOwner = isOwner === true;

      // 🛡️ Blocage strict : Réservé à l'Overlord
      if (!isSupreme && !isLocalOwner) return;

      if (!args[0]) {
        return reply(
          `╭╼━━━≪• *${toSmallCaps('matrice de presence')}* •≫━━━╾╮\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
          `*🔮 ɪɴᴄᴀɴᴛᴀᴛɪᴏɴs :*\n` +
          `• *${prefix}presence online* (ᴛᴏᴜᴊᴏᴜʀs ᴇɴ ʟɪɢɴᴇ)\n` +
          `• *${prefix}presence typing* (sɪᴍᴜʟᴇ ʟ'ᴇᴄʀɪᴛᴜʀᴇ ᴇɴ ᴄᴏɴᴛɪɴᴜ)\n` +
          `• *${prefix}presence recording* (sɪᴍᴜʟᴇ ʟ'ᴇɴʀᴇɢɪsᴛʀᴇᴍᴇɴᴛ)\n` +
          `• *${prefix}presence off* (ᴅᴇsᴀᴄᴛɪᴠᴇʀ ʟᴇs sɪᴍᴜʟᴀᴛɪᴏɴs)\n\n` +
          extra.phrases.footer()
        );
      }

      const mode = args[0].toLowerCase();
      await sock.sendMessage(chatId, { react: { text: '🎭', key: msg.key } });

      if (mode === 'online') {
        await sock.sendPresenceUpdate('available', chatId);
        // On sauvegarde le choix dans les variables globales pour que le bot s'en rappelle
        process.env.DEFAULT_PRESENCE = 'available';
        return reply(`*🎭 ${toSmallCaps('l\'oracle est desormais affiche comme etant en ligne')}.*`);
      } 
      
      else if (mode === 'typing' || mode === 'ecrit') {
        await sock.sendPresenceUpdate('composing', chatId);
        process.env.DEFAULT_PRESENCE = 'composing';
        return reply(`*🎭 ${toSmallCaps('l\'oracle simule l\'ecriture dans ce sanctuaire')}.*`);
      } 
      
      else if (mode === 'recording' || mode === 'enregistre') {
        await sock.sendPresenceUpdate('recording', chatId);
        process.env.DEFAULT_PRESENCE = 'recording';
        return reply(`*🎭 ${toSmallCaps('l\'oracle simule un enregistrement vocal')}.*`);
      } 
      
      else if (mode === 'off') {
        await sock.sendPresenceUpdate('paused', chatId);
        process.env.DEFAULT_PRESENCE = 'paused';
        return reply(`*🎭 ${toSmallCaps('les simulations de presence ont ete figees')}.*`);
      } 
      
      else {
        return reply(`*〆 ᴍᴏᴅᴇ ɪɴᴠᴀʟɪᴅᴇ. ᴜᴛɪʟɪsᴇ : ${prefix}presence <online/typing/recording/off>*`);
      }

    } catch (error) {
      console.error('Presence command error:', error);
      await reply(`❌ *${toSmallCaps('impossible de modifier la presence dans la matrice')}...*`);
    }
  }
};
