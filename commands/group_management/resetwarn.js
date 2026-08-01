/**
 * ResetWarn Command - Reset warnings for a user
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 */

const database = require('../../database');
const config = require('../../config.js'); 
const modlog = require('../../utils/modlog');

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
  name: 'resetwarn',
  aliases: ['resetwarning', 'clearwarn', 'unwarn', 'pardonner', 'absoudre'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴇғғᴀᴄᴇ ᴛᴏᴜs ʟᴇs ᴀᴠᴇʀᴛɪssᴇᴍᴇɴᴛs ᴅ\'ᴜɴ ᴍᴇᴍʙʀᴇ',
  usage: `${prefix}resetwarn @user`, // 💡 Dynamique avec ton préfixe actuel
  groupOnly: true,
  adminOnly: false, // Traitement manuel ci-dessous pour inclure les Maîtres
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, sender, groupMetadata } = extra;

    try {
      // 🛡️ SÉCURITÉ GÉRÉE PAR LE HANDLER
      const isMe = msg.key.fromMe || isOwner;

      // Si l'utilisateur n'est pas admin et n'est pas listé comme Owner
      if (!isMe && !isAdmin) {
        return reply(`*❌ ${toSmallCaps('cette incantation est reservee aux administrateurs du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      const chatId = msg.key.remoteJid;

      let target;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      if (mentioned && mentioned.length > 0) {
        target = mentioned[0];
      } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
        target = ctx.participant;
      } else {
        return reply(`*❌ ${toSmallCaps('veuillez mentionner ou repondre a l individu a absoudre')} !*\n\n*ᴇxᴇᴍᴘʟᴇ :* \`${prefix}resetwarn @user\`\n\n${extra.phrases.footer()}`);
      }

      // Récupère les avertissements avant d'effacer
      const currentWarnings = database.getWarnings(target, chatId);

      if (currentWarnings.count === 0) {
        return reply(`*✅ @${target.split('@')[0]} ${toSmallCaps('na aucun avertissement a effacer')}.*\n\n${extra.phrases.footer()}`, { mentions: [target] });
      }

      // Efface tous les avertissements
      database.resetWarnings(target, chatId);

      modlog.addEntry(chatId, 'resetwarn', {
        by: sender || msg.key.participant || msg.key.remoteJid,
        target,
        reason: `${currentWarnings.count} avertissement(s) efface(s)`,
        groupName: groupMetadata?.subject,
      });

      const text = `*╭╼≪• ᴀʙsᴏʟᴜᴛɪᴏɴ •≫╾╮*\n` +
                   `*┃* 👤 *${toSmallCaps('individu')} :* @${target.split('@')[0]}\n` +
                   `*┃* ⚠️ *${toSmallCaps('avertissements effaces')} :* ${currentWarnings.count}\n\n` +
                   `*┃* *${toSmallCaps('toutes les sentences ont ete levees pour cet individu')}.*\n\n` +
                   extra.phrases.footer();

      await sock.sendMessage(chatId, {
        text,
        mentions: [target]
      }, { quoted: msg });

    } catch (error) {
      console.error('ResetWarn command error:', error);
      await reply(`*❌ ${toSmallCaps('l invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
