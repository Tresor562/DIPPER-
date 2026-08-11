/**
 * HideTag Command - Silently tag all group members without listing them
 * 𝐃𝐚𝐫𝐤 Edition
 * Sécurité : Supreme Owner Master Access (Invisible Bypass)
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
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
  name: 'hidetag',
  aliases: ['tag'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɪɴᴠᴏǫᴜᴇ ᴅɪsᴄʀᴇᴛᴇᴍᴇɴᴛ ᴛᴏᴜs ʟᴇs ᴍᴇᴍʙʀᴇs ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ',
  usage: `${config.prefix || '.'}hidetag <texte/media>`,
  groupOnly: true,
  adminOnly: false, // Géré manuellement ci-dessous pour intégrer les Maîtres
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

      // La suppression du message de commande est seulement esthétique.
      // Sans droits admin elle peut échouer, mais le hidetag doit quand même partir.
      try {
        await sock.sendMessage(chatId, { delete: msg.key });
      } catch (deleteError) {
        console.log('[hidetag] Suppression ignorée (bot non-admin ou message non supprimable):', deleteError.message);
      }

      // Récupération des membres
      const groupMetadata = await sock.groupMetadata(chatId);
      const participants = groupMetadata.participants || [];
      const mentions = participants.map((p) => p.id || p.lid).filter(Boolean);

      // Vérifie si le message est une réponse à un média
      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
      let targetMessage = msg;

      if (ctxInfo?.quotedMessage) {
        // Construit le message cible pour le téléchargement
        targetMessage = {
          key: {
            remoteJid: chatId,
            id: ctxInfo.stanzaId,
            participant: ctxInfo.participant,
          },
          message: ctxInfo.quotedMessage,
        };
      }

      // Vérifie le type de média
      const mediaMessage = 
        targetMessage.message?.imageMessage ||
        targetMessage.message?.videoMessage ||
        targetMessage.message?.stickerMessage;

      // On ne quote jamais le message de commande : s'il a été supprimé,
      // citer sa clé peut faire rejeter l'envoi sur certaines sessions.
      if (mediaMessage) {
        try {
          const mediaBuffer = await downloadMediaMessage(
            targetMessage,
            'buffer',
            {},
            { logger: undefined, reuploadRequest: sock.updateMediaMessage }
          );

          if (targetMessage.message?.imageMessage) {
            const text = args.join(' ') || targetMessage.message.imageMessage.caption || '';
            await sock.sendMessage(chatId, {
              image: mediaBuffer,
              caption: text,
              mentions
            });
          } else if (targetMessage.message?.videoMessage) {
            const text = args.join(' ') || targetMessage.message.videoMessage.caption || '';
            await sock.sendMessage(chatId, {
              video: mediaBuffer,
              caption: text,
              mentions
            });
          } else if (targetMessage.message?.stickerMessage) {
            await sock.sendMessage(chatId, {
              sticker: mediaBuffer,
              mentions
            });

            const text = args.join(' ');
            if (text) {
              await sock.sendMessage(chatId, { text, mentions });
            }
          }
        } catch (mediaError) {
          console.error('Error downloading media for hidetag:', mediaError);
          const text = args.join(' ') || ' ';
          await sock.sendMessage(chatId, { text, mentions });
        }
      } else {
        if (ctxInfo?.quotedMessage) {
          const quotedText = ctxInfo.quotedMessage.conversation || 
                           ctxInfo.quotedMessage.extendedTextMessage?.text || 
                           args.join(' ') || ' ';

          await sock.sendMessage(chatId, { text: quotedText, mentions });
        } else {
          const text = args.join(' ') || ' ';
          await sock.sendMessage(chatId, { text, mentions });
        }
      }
    } catch (error) {
      console.error('HideTag command error:', error);
      await reply(
        `*╭╼━━━≪• ɪɴᴠᴏᴄᴀᴛɪᴏɴ_sɪʟᴇɴᴄɪᴇᴜsᴇ •≫━━━╾╮*\n` +
        `*┃* *ᴇ́ᴛᴀᴛ* : [ ᴇ́ᴄʜᴇᴄ ❌ ]\n\n` +
        `*┃* ❌ *${toSmallCaps('l arcane n a pas pu invoquer')}*\n` +
        `*┃* *${toSmallCaps('les membres')} :* ${error.message}\n\n` +
        extra.phrases.footer()
      );
    }
  },
};
