/**
 * Welcome - Enable/disable welcome messages
 * 𝐃𝐈𝐏𝐏𝐄𝐑 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * Sécurité : Supreme Owner Master Access (Invisible Bypass)
 */

const db = require('../../database');
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

module.exports = {
  name: 'accueil',
  aliases: ['welcome', 'welcomeon', 'welcomeoff', 'rituelaccueil'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴄᴛɪᴠᴇ ᴏᴜ ᴅᴇsᴀᴄᴛɪᴠᴇ ʟᴇs ʀɪᴛᴜᴇʟs ᴅ\'ᴀᴄᴄᴜᴇɪʟ',
  usage: `${config.prefix || '.'}accueil on/off`,
  groupOnly: true,
  adminOnly: false, // Géré manuellement ci-dessous pour intégrer les Maîtres
  botAdminNeeded: false,

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
      const groupSettings = db.getGroupSettings(chatId);

      // 💡 Détection simplifiée et fiable
      let action = args[0]?.toLowerCase();
      
      // Extraction propre du nom de la commande tapée
      const bodyText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const commandCalled = bodyText.trim().split(/\s+/)[0].slice(prefix.length).toLowerCase();

      // Si l'utilisateur a utilisé un alias direct de raccourci
      if (commandCalled.endsWith('on')) action = 'on';
      if (commandCalled.endsWith('off')) action = 'off';

      if (!action || !['on', 'off'].includes(action)) {
        const status = groupSettings.welcome ? '✅ *ᴀᴄᴛɪᴠᴇ́*' : '❌ *ᴅᴇ́sᴀᴄᴛɪᴠᴇ́*';

        return reply(
          `*╭━≪• ʀɪᴛᴜᴇʟs ᴅ'ᴀᴄᴄᴜᴇɪʟ •≫╾╮*\n` +
          `*┃* 📊 *${toSmallCaps('statut')} :* ${status}\n` +
          `*┃* 🔮 *${toSmallCaps('incantations')} :*\n` +
          `*┃* ${prefix}accueil on / off\n\n` +
          `*┃* 💡 *${toSmallCaps('astuce')} :* ${toSmallCaps('utilisez')} \`${prefix}setwelcome <message>\` ${toSmallCaps('pour personnaliser le texte d\'entree')}.\n\n` +
          extra.phrases.footer()
        );
      }

      const enable = action === 'on';

      // Éviter l'exécution inutile si c'est déjà dans l'état demandé
      if (enable && groupSettings.welcome) {
        return reply(`*⚠️ ${toSmallCaps('les rituels d\'accueil sont deja actifs')} !*\n\n${extra.phrases.footer()}`);
      }
      if (!enable && !groupSettings.welcome) {
        return reply(`*⚠️ ${toSmallCaps('les rituels d\'accueil sont deja endormis')} !*\n\n${extra.phrases.footer()}`);
      }

      db.updateGroupSettings(chatId, { welcome: enable });

      const text = enable 
        ? `✅ *${toSmallCaps('rituels d\'accueil actives')} !*\n\n` +
          `*${toSmallCaps('les nouvelles ames arrivant dans le sanctuaire seront saluees')}*.\n\n` +
          extra.phrases.footer()
        : `❌ *${toSmallCaps('rituels d\'accueil desactives')} !*\n\n` +
          `*${toSmallCaps('𝐃𝐈𝐏𝐏𝐄𝐑 ne saluera plus les nouveaux arrivants')}*.\n\n` +
          extra.phrases.footer();

      await reply(text);

    } catch (error) {
      console.error('Welcome Error:', error);
      await reply(`*❌ ${toSmallCaps('l invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};