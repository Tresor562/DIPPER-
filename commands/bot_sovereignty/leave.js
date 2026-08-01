/**
 * Leave Command - Le bot quitte le Sanctuaire
 * Version : Prestige V5.2 - Full Power (Design Small Caps)
 * Powered by -ّ⸙𓆩𝐃𝐚𝐫𝐤 𝐗 𓆪⸙-ّ
 */

const config = require('../../config.js');

const prefix = config.prefix || '.';

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
  name: 'leave',
  aliases: ['quitter', 'partir', 'sortir', 'quit'],
  category: '👑 Owner',
  groupOnly: true,
  ownerOnly: false, // Géré manuellement par hasAccess via isOwner
  description: `『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴛᴇ ғᴀɪᴛ ǫᴜɪᴛᴛᴇʀ ʟᴇ ɢʀᴏᴜᴘᴇ ᴀᴠᴇᴄ ᴜɴ ᴍᴇssᴀɢᴇ ᴅ'ᴀᴅɪᴇᴜ`,
  usage: `${prefix}leave`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner } = extra;
    const chatId = msg.key.remoteJid; 

    try {
      // 👑 Tes numéros de Maîtres Suprêmes
      const supremeOwners = ['2290146202259', '2290155745907'];

      // 🛡️ EXTRACTION SÉCURISÉE DE TON NUMÉRO (Infaillible)
      let senderJid = msg.key.fromMe 
        ? sock.user.id 
        : (msg.key.participant || msg.key.remoteJid);
      
      const bareJid = senderJid.split('@')[0].split(':')[0];
      const senderNumber = bareJid.replace(/\D/g, '');

      // 🛡️ BLINDAGE 𝐃𝐚𝐫𝐤 : Sécurité absolue
      // L'Owner du .env ET les Supreme Owners ont maintenant accès !
      const hasAccess = supremeOwners.includes(senderNumber) || isOwner === true;

      // 🛡️ Blocage strict : Seuls les Owners ou Supreme Owners peuvent exécuter
      if (!hasAccess) {
          return reply(`*〆 ${toSmallCaps('acces refuse. seul le maitre peut sceller le depart')}.*`);
      }

      // Message d'adieu stylisé
      const farewellMessage = 
        `╭━≪• *ᴇᴠᴀᴘᴏʀᴀᴛɪᴏɴ_ᴅᴜ_sᴀɴᴄᴛᴜᴀɪʀᴇ* •≫╾╮\n` +
        `┃ *sᴛᴀᴛᴜᴛ* : ᴅᴇᴘᴀʀᴛ ɪᴍᴍɪɴᴇɴᴛ 🚪\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
        `*🔮 ʟ\'ʜᴇᴜʀᴇ ᴇsᴛ ᴠᴇɴᴜᴇ.* \n` +
        `*ᴍᴇs sᴇʀᴠɪᴄᴇs ɴᴇ sᴏɴᴛ ᴘʟᴜs ʀᴇǫᴜɪs ᴇɴ ᴄᴇs ʟɪᴇᴜx. ᴊᴇ ʀᴇᴛᴏᴜʀɴᴇ ᴅᴀɴs ʟᴇs ᴏᴍʙʀᴇs...*\n\n` +
        `*ǫᴜᴇ ʟᴀ sᴀɢᴇssᴇ ɢᴜɪᴅᴇ ᴠᴏs ᴘᴀs.*\n\n` +
        extra.phrases.footer();

      // 1. Envoi du message d'adieu dans le groupe
      await sock.sendMessage(chatId, { text: farewellMessage });

      // 2. Petite temporisation d'une seconde et demie pour s'assurer que le message parte bien
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 3. Le bot quitte le groupe
      await sock.groupLeave(chatId);

    } catch (error) {
      console.error('Leave command error:', error);
      await reply(`❌ *ᴇʀʀᴇᴜʀ : ɪᴍᴘᴏssɪʙʟᴇ ᴅᴇ ǫᴜɪᴛᴛᴇʀ ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ.* \n\n${extra.phrases.footer()}`);
    }
  }
};
