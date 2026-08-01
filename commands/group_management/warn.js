/**
 * Warn Command - Warn a user
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * Sécurité : Supreme Owner Master Access (Invisible Bypass)
 */

const database = require('../../database');
const config = require('../../config');
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

module.exports = {
  name: 'sentence',
  aliases: ['warn', 'warning', 'punir', 'prevenir', 'sᴇɴᴛᴇɴᴄᴇ'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴘᴘʟɪǫᴜᴇ ᴜɴᴇ sᴇɴᴛᴇɴᴄᴇ ᴀ̀ ᴜɴ ᴍᴇᴍʙʀᴇ',
  usage: `${config.prefix || '.'}sentence @user <reason>`,
  groupOnly: true,
  adminOnly: false, // Géré manuellement ci-dessous pour inclure les Maîtres
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, isBotAdmin, sender } = extra;
    const prefix = config.prefix || '.';

    try {
      // 🛡️ SÉCURITÉ GÉRÉE PAR LE HANDLER
      const isMe = msg.key.fromMe || isOwner;

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
        return reply(`*❌ ${toSmallCaps('veuillez mentionner ou repondre a l individu a sanctionner')} !*\n\n*ᴇxᴇᴍᴘʟᴇ :* \`${prefix}sentence @user <ʀᴀɪsᴏɴ>\`\n\n${extra.phrases.footer()}`);
      }

      const reason = args.slice(mentioned.length > 0 ? 1 : 0).join(' ') || 'ᴀᴜᴄᴜɴᴇ ʀᴀɪsᴏɴ sᴘᴇ́ᴄɪғɪᴇ́ᴇ';

      // On empêche de sanctionner les admins
      const groupMetadata = await sock.groupMetadata(chatId);
      const foundParticipant = groupMetadata.participants.find(
        p => (p.id === target || p.lid === target) && (p.admin === 'admin' || p.admin === 'superadmin')
      );

      if (foundParticipant) {
        return reply(`*❌ ${toSmallCaps('impossible d appliquer une sentence a un gardien')} !*\n\n${extra.phrases.footer()}`);
      }

      const warningCount = database.addWarning(target, chatId, reason);
      const maxWarnings = config.maxWarnings || 3;
      const modlogBy = sender || msg.key.participant || msg.key.remoteJid;

      modlog.addEntry(chatId, 'warn', {
        by: modlogBy,
        target,
        reason,
        groupName: groupMetadata.subject,
      });

      let text = `*╭╼≪• sᴇɴᴛᴇɴᴄᴇ ᴇ́ᴍɪsᴇ •≫╾╮*\n` +
                 `*┃* 👤 *${toSmallCaps('individu')} :* @${target.split('@')[0]}\n` +
                 `*┃* 📝 *${toSmallCaps('motif')} :* ${reason}\n` +
                 `*┃* ⚠️ *${toSmallCaps('sentences')} :* ${warningCount}/${maxWarnings}\n\n`;

      if (warningCount >= maxWarnings) {
        text += `*┃* ❌ *${toSmallCaps('l individu a atteint le seuil maximal de sentences et va etre exile')} !*\n\n` +
                extra.phrases.footer();

        await sock.sendMessage(chatId, {
          text,
          mentions: [target]
        }, { quoted: msg });

        if (isBotAdmin) {
          await sock.groupParticipantsUpdate(chatId, [target], 'remove');
          database.resetWarnings(target, chatId);

          modlog.addEntry(chatId, 'kick', {
            by: modlogBy,
            target,
            reason: 'sᴇᴜɪʟ ᴍᴀxɪᴍᴀʟ ᴅᴇ sᴇɴᴛᴇɴᴄᴇs ᴀᴛᴛᴇɪɴᴛ (ᴇxɪʟ ᴀᴜᴛᴏᴍᴀᴛɪǫᴜᴇ)',
            groupName: groupMetadata.subject,
          });
        }
      } else {
        text += `*┃* ⚠️ *${toSmallCaps('la prochaine sentence entrainera un bannissement immediat')} !*\n\n` +
                extra.phrases.footer();

        await sock.sendMessage(chatId, {
          text,
          mentions: [target]
        }, { quoted: msg });
      }

    } catch (error) {
      console.error('Warn command error:', error);
      await reply(`*❌ ${toSmallCaps('l invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
