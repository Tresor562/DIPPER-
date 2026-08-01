/**
 * Clean Command - Delete messages in group
 */

const config = require('../../config.js');

// Extraction du préfixe pour l'usage
const prefix = config.prefix || '.';

// Fonction pour le style Small Caps (Garde la cohérence visuelle)
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
  name: 'clean',
  aliases: ['purge', 'clear', 'ᴄʟᴇᴀɴ'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ sᴜᴘᴘʀɪᴍᴇ ʟᴇs ᴍᴇssᴀɢᴇs ᴅᴜ ɢʀᴏᴜᴘᴇ (ᴛᴏᴜs ᴏᴜ ᴘᴀʀ ᴜᴛɪʟɪsᴀᴛᴇᴜʀ)',
  usage: `${prefix}clean <nombre>`,
  groupOnly: true,
  adminOnly: false, 
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin } = extra;

    try {
      // 🛡️ SÉCURITÉ GÉRÉE PAR LE HANDLER
      const isMe = msg.key.fromMe || isOwner;

      // 🚨 ÉVALUATION DES DROITS
      if (!isMe && !isAdmin) {
        return reply(`*❌ ${toSmallCaps('cette commande est reservee aux administrateurs du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      const count = parseInt(args[0]);
      if (!count || count < 1 || count > 100) {
        return reply(`*❓ ${toSmallCaps('veuillez entrer un nombre valide entre 1 et 100')}.*\n\n${toSmallCaps('exemple')} : \`${prefix}clean 20\`\n\n${extra.phrases.footer()}`);
      }

      const chatId = msg.key.remoteJid;
      
      // 🛡️ RÉCUPÉRATION SÉCURISÉE DU STORE
      const mainFile = require('../../index');
      const store = mainFile.store;

      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

      // Vérification physique de l'existence du store et des messages
      if (!store || !store.messages || !store.messages[chatId]) {
        return reply(`*❌ ${toSmallCaps('aucun message trouve dans la memoire du bot pour ce groupe')} !*\n\n${extra.phrases.footer()}`);
      }

      const msgs = store.messages[chatId];
      let messagesToDelete = [];

      // Transformation de l'objet ou tableau en liste exploitable
      const allMessages = msgs.array 
        ? msgs.array 
        : (typeof msgs === 'object' ? Object.values(msgs) : []);

      if (quotedMsg && quotedParticipant) {
        // Mode : Supprimer les messages d'un utilisateur spécifique
        messagesToDelete = allMessages
          .filter(m => {
            const sender = m.key.participant || m.key.remoteJid;
            return sender === quotedParticipant;
          })
          .sort((a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0))
          .slice(0, count);
      } else {
        // Mode : Supprimer les N derniers messages du groupe
        messagesToDelete = allMessages
          .sort((a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0))
          .slice(0, count);
      }

      if (messagesToDelete.length === 0) {
        return reply(`*❌ ${toSmallCaps('aucun message correspondant n a pu etre trouve pour la suppression')} !*\n\n${extra.phrases.footer()}`);
      }

      await reply(`*☬ ɪɴᴠᴏᴄᴀᴛɪᴏɴ : ᴘᴜʀɢᴇ ᴅᴇ ${messagesToDelete.length} ᴍᴇssᴀɢᴇ(s) ᴇɴ ᴄᴏᴜʀs...*`);

      let deleted = 0;
      for (const m of messagesToDelete) {
        try {
          // On ne supprime pas le message d'annonce de la purge en cours !
          if (m.key.id === msg.key.id) continue;

          await sock.sendMessage(chatId, { delete: m.key });
          deleted++;
          
          // Petit délai de 400ms pour s'assurer que WhatsApp n'interrompe pas la session
          await new Promise(resolve => setTimeout(resolve, 400));
        } catch (err) {
          console.error('[clean] delete error:', err.message);
        }
      }

      return reply(
        `*╭╼━━━≪• ᴘᴜʀɢᴇ ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ •≫━━━╾╮*\n` +
        `*┃* *ᴇ́ᴛᴀᴛ* : ᴛᴇʀᴍɪɴᴇ́ ✅\n` +
        `*┃* *ᴄɪʙʟᴇs* : ${deleted} ᴍᴇssᴀɢᴇ(s)\n\n` +
        `*┃* *ʟ'ᴀʀᴄᴀɴᴇ ᴀ ᴇʟɪᴍɪɴᴇ ʟᴇs ᴛʀᴀᴄᴇs sᴘᴇᴄɪғɪᴇᴇs ᴀᴠᴇᴄ sᴜᴄᴄᴇs.*\n\n` +
        extra.phrases.footer()
      );

    } catch (error) {
      console.error('[clean cmd] error:', error);
      return reply(`❌ *${toSmallCaps('erreur')} :* ${error.message}\n\n${extra.phrases.footer()}`);
    }
  }
};
