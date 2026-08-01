/**
 * Set Welcome - 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 *
 * Pont de compatibilité vers la source officielle unique du message
 * d'accueil personnalisé : customMessages.welcome (voir
 * commands/group_management/custommenu.js#getCustomEventMessage, lue
 * par handler.js sur l'événement d'arrivée d'un membre).
 *
 * Même défaut et même correction que setgoodbye.js (voir PROGRESS.md) :
 * cette commande ne maintient plus sa propre logique de stockage —
 * elle appelle exactement la même écriture que `.customwelcome welcome
 * <message>` (déjà auditée et validée). Les alias historiques
 * (inscription / welcometext / setwelcome) restent fonctionnels, mais
 * pointent désormais vers l'unique source de vérité.
 *
 * Ancienne architecture (retirée) : écrivait dans un champ
 * `welcomeMessage` jamais lu ailleurs dans le projet — la commande ne
 * modifiait donc jamais le message d'accueil réellement envoyé.
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
  name: 'inscription',
  aliases: ['welcometext', 'setwelcome'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴘᴇʀsᴏɴɴᴀʟɪsᴇ ʟᴇ ᴍᴇssᴀɢᴇ ᴅ\'ᴀᴄᴄᴜᴇɪʟ ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ',
  usage: `${config.prefix || '.'}inscription <message>`,
  groupOnly: true,
  adminOnly: false, // Géré manuellement dans le code pour intégrer les Maîtres
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

      // Source officielle unique : customMessages.welcome
      const settings = database.getGroupSettings(chatId);

      if (!args.length) {
        const current = settings.customMessages && settings.customMessages.welcome;

        return reply(
          `*╭╼≪• ᴍᴇssᴀɢᴇ ᴅ'ᴀᴄᴄᴜᴇɪʟ •≫╾╮*\n` +
          `*┃* 📝 *${toSmallCaps('message actuel')} :*\n` +
          `*┃* ${current || 'ᴀᴜᴄᴜɴ'}\n\n` +
          `*┃* 🔮 *${toSmallCaps('incantations disponibles')} :*\n` +
          `*┃* ${prefix}inscription <message>\n\n` +
          `*┃* 💡 *${toSmallCaps('variables disponibles')} :* {nom}, {numero}, {groupe}, {total}\n\n` +
          extra.phrases.footer()
        );
      }

      const welcomeMessage = args.join(' ');

      if (welcomeMessage.length > 500) {
        return reply(`*❌ ${toSmallCaps('le message d accueil est trop long')} ! (ᴍᴀxɪᴍᴜᴍ 𝟻𝟶𝟶 ᴄᴀʀᴀᴄᴛᴇʀᴇs).* \n\n${extra.phrases.footer()}`);
      }

      // Écriture identique à .customwelcome welcome <message> (custommenu.js)
      if (!settings.customMessages) settings.customMessages = {};
      settings.customMessages.welcome = welcomeMessage;
      database.updateGroupSettings(chatId, { customMessages: settings.customMessages });

      return reply(
        `*✅ ${toSmallCaps('message d accueil mis a jour')} !*\n\n` +
        `🔮 *${toSmallCaps('message')} :*\n${welcomeMessage}\n\n` +
        extra.phrases.footer()
      );

    } catch (error) {
      console.error('Set Welcome Error:', error);
      await reply(`*❌ ${toSmallCaps('l invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
