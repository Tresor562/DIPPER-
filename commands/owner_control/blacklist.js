/**
 * Annihiler Command - Definitively block a user from using the bot
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * SÉCURITÉ ABSOLUE : Seuls les Maîtres Suprêmes peuvent l'évoquer.
 */

const database = require('../../database');
const config = require ('../../config.js');

function toSmallCaps(text) {
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";
  const cleanedText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

const prefix = config.prefix || '.';

module.exports = {
  name: 'annihiler',
  aliases: ['blacklist'],
  category: '🔧 Configuration',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʙᴀɴɴɪᴛ ᴅᴇ́ғɪɴɪᴛɪᴠᴇᴍᴇɴᴛ ᴜɴᴇ ᴀ̂ᴍᴇ ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ (ᴍᴀɪᴛʀᴇ sᴜᴘʀᴇᴍᴇ)',
  usage: `${prefix}annihiler <@mention / repondre / numero>`,
  groupOnly: false, 
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner } = extra;
    const chatId = msg.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');

    try {
      // 👑 Tes numéros de Maîtres Suprêmes
      const supremeOwners = ['2290146202259', '2290155745907'];
      
      // 🛡️ EXTRACTION SÉCURISÉE DE TON NUMÉRO (Infaillible)
      let senderJid = msg.key.fromMe 
        ? sock.user.id 
        : (msg.key.participant || msg.key.remoteJid);
      
      // On prend ce qu'il y a avant le @, puis ce qu'il y a avant le : s'il existe
      const bareJid = senderJid.split('@')[0].split(':')[0];
      // On ne garde STRICTEMENT que les chiffres
      const senderNumber = bareJid.replace(/\D/g, '');
      
      // On valide si tu es le maître (via la liste dure ou le handler)
      const isMaster = supremeOwners.includes(senderNumber) || isOwner;

      if (!isMaster) return; // Discrétion absolue (le bot ne répond même pas)

      let targetJid;
      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;

      // 1. Ciblage par réponse
      if (ctxInfo?.quotedMessage) {
        targetJid = ctxInfo.participant;
      } 
      // 2. Ciblage par mention
      else if (ctxInfo?.mentionedJid && ctxInfo.mentionedJid.length > 0) {
        targetJid = ctxInfo.mentionedJid[0];
      } 
      // 3. Ciblage par numéro brut
      else if (args[0]) {
        const cleanNumber = args[0].replace(/\D/g, '');
        if (cleanNumber.length >= 8) {
          targetJid = `${cleanNumber}@s.whatsapp.net`;
        }
      }

      if (!targetJid) {
        return reply(`*⚠️ ${toSmallCaps('veuillez mentionner une cible, repondre a un message ou fournir un numero')} !*`);
      }

      const targetNumber = targetJid.split('@')[0].split(':')[0].replace(/\D/g, '');

      // Éviter de se bannir soi-même ou un autre maître
      if (supremeOwners.includes(targetNumber)) {
        return reply(`*❌ ${toSmallCaps('impossible de bannir un maitre supreme')} !*`);
      }

      // Action de bannissement
      database.updateUser(targetJid, { isBanned: true });

      // Suppression discrète du message d'invocation si on est dans un groupe
      if (isGroup) {
        try { await sock.sendMessage(chatId, { delete: msg.key }); } catch {}
      }

      return reply(`*💀 ${toSmallCaps('l ame')} @${targetNumber} ${toSmallCaps('a ete bannie definitivement du sanctuaire')} !*`, { mentions: [targetJid] });

    } catch (error) {
      console.error('Annihiler command error:', error);
    }
  }
};
