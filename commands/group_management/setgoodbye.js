/**
 * Set Goodbye - 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 *
 * Pont de compatibilité vers la source officielle unique du message
 * d'adieu personnalisé : customMessages.goodbye (voir
 * commands/group_management/custommenu.js#getCustomEventMessage, lue
 * par handler.js sur l'événement de départ d'un membre).
 *
 * Cette commande ne maintient plus sa propre logique de stockage —
 * elle appelle exactement la même écriture que `.customwelcome goodbye
 * <message>` (déjà auditée et validée). Les alias historiques
 * (motsadieu / goodbyetext / setgoodbye / traceadieu) restent
 * fonctionnels, mais pointent désormais vers l'unique source de vérité.
 *
 * Ancienne architecture (retirée) : écrivait dans un champ
 * `goodbyeMessage` jamais lu ailleurs dans le projet — la commande ne
 * modifiait donc jamais le message d'adieu réellement envoyé.
 */

const database = require('../../database');
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
  name: 'motsadieu',
  aliases: ['goodbyetext', 'setgoodbye', 'traceadieu'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴘᴇʀsᴏɴɴᴀʟɪsᴇ ʟᴇ ᴍᴇssᴀɢᴇ ᴅ\'ᴀᴅɪᴇᴜ ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ',
  usage: `${config.prefix || '.'}motsadieu <message>`,
  groupOnly: true,
  adminOnly: false, // Géré manuellement ci-dessous pour intégrer les Maîtres
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin } = extra;
    const chatId = msg.key.remoteJid;
    const prefix = config.prefix || '.';

    try {
      // 🛡️ SÉCURITÉ GÉRÉE PAR LE HANDLER
      const isMe = msg.key.fromMe || isOwner;

      // Si ce n'est pas TOI ou un Maître, on vérifie s'il est admin
      if (!isMe && !isAdmin) {
        return reply(`*❌ ${toSmallCaps('cette incantation est reservee aux administrateurs du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      // Source officielle unique : customMessages.goodbye
      const settings = database.getGroupSettings(chatId);

      if (!args.length) {
        const current = settings.customMessages && settings.customMessages.goodbye;

        return reply(
          `*╭╼≪• ᴍᴇssᴀɢᴇ ᴅ'ᴀᴅɪᴇᴜx •≫╾╮*\n` +
          `*┃* 📝 *${toSmallCaps('message actuel')} :*\n` +
          `*┃* ${current || 'ᴀᴜᴄᴜɴ'}\n\n` +
          `*┃* 🔮 *${toSmallCaps('incantations disponibles')} :*\n` +
          `*┃* ${prefix}motsadieu <message>\n\n` +
          `*┃* 💡 *${toSmallCaps('variables disponibles')} :* {nom}, {numero}, {groupe}, {total}\n\n` +
          extra.phrases.footer()
        );
      }

      const goodbyeMessage = args.join(' ');

      if (goodbyeMessage.length > 500) {
        return reply(`*❌ ${toSmallCaps('le message d adieux est trop long')} ! (ᴍᴀxɪᴍᴜᴍ 𝟻𝟶𝟶 ᴄᴀʀᴀᴄᴛᴇʀᴇs).* \n\n${extra.phrases.footer()}`);
      }

      // Écriture identique à .customwelcome goodbye <message> (custommenu.js)
      if (!settings.customMessages) settings.customMessages = {};
      settings.customMessages.goodbye = goodbyeMessage;
      database.updateGroupSettings(chatId, { customMessages: settings.customMessages });

      return reply(
        `*✅ ${toSmallCaps('message d adieux mis a jour')} !*\n\n` +
        `🔮 *${toSmallCaps('message')} :*\n${goodbyeMessage}\n\n` +
        extra.phrases.footer()
      );

    } catch (error) {
      console.error('Set Goodbye Error:', error);
      await reply(`*❌ ${toSmallCaps('l invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
