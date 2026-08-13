/**
 * Goodbye - Enable/disable goodbye messages
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
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
  name: 'goodbye',
  aliases: ['goodbyeon', 'goodbyeoff', 'byeon', 'byeoff'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴄᴛɪᴠᴇ ᴏᴜ ᴅᴇsᴀᴄᴛɪᴠᴇ ʟᴇs ᴍᴇssᴀɢᴇs ᴅ\'ᴀᴅɪᴇᴜ',
  usage: `${config.prefix || '.'}goodbye <on/off>`, 
  groupOnly: true,
  adminOnly: false, // Traitement manuel ci-dessous pour inclure les Maîtres
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

      const groupId = msg.key.remoteJid;
      const groupSettings = db.getGroupSettings(groupId);
      
      // 💡 Détection simplifiée et fiable
      let action = args[0]?.toLowerCase();
      
      // Extraction du nom de la commande tapée en retirant le préfixe
      const bodyText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const commandCalled = bodyText.trim().split(/\s+/)[0].slice(config.prefix.length).toLowerCase();

      // Si l'utilisateur a utilisé un alias direct
      if (commandCalled.endsWith('on')) action = 'on';
      if (commandCalled.endsWith('off')) action = 'off';

      if (!action || !['on', 'off'].includes(action)) {
        const status = groupSettings.goodbye ? 'ON' : 'OFF';

        return reply(
          `*╭╼≪• sᴛᴀᴛᴜᴛ ᴀʀᴄᴀɴᴇ_ɢᴏᴏᴅʙʏᴇ •≫╾╮*\n` +
          `*┃* 🔮 *${toSmallCaps('etat')} :* [ ${status} ]\n\n` +
          `*┃* 🔮 *${toSmallCaps('incantations disponibles')} :*\n` +
          `*┃* *${toSmallCaps('cet arcane affiche l adieu et la stele')}*\n` +
          `*┃* *${toSmallCaps('des membres quittant le sanctuaire')}.*\n\n` +
          `  ${prefix}goodbye on\n` +
          `  ${prefix}goodbye off\n\n` +
          extra.phrases.footer()
        );
      }

      const enable = action === 'on';

      if (enable && groupSettings.goodbye) {
        return reply(`*⚠️ ${toSmallCaps('l arcane goodbye est deja actif')} !*\n\n${extra.phrases.footer()}`);
      }

      if (!enable && !groupSettings.goodbye) {
        return reply(`*⚠️ ${toSmallCaps('l arcane goodbye est deja endormi')} !*\n\n${extra.phrases.footer()}`);
      }

      db.updateGroupSettings(groupId, { goodbye: enable });

      if (enable) {
        return reply(`*✅ ${toSmallCaps('l arcane goodbye a ete eveille avec succes')} !*\n\n_ʟᴇs ᴀ̂ᴍᴇs ǫᴜɪᴛᴛᴀɴᴛ ʟᴇ ɢʀᴏᴜᴘᴇ ʀᴇᴄᴇᴠʀᴏɴᴛ ʟᴇᴜʀ sᴛᴇ̀ʟᴇ ғᴜɴᴇ́ʀᴀɪʀᴇ._\n\n${extra.phrases.footer()}`);
      } else {
        return reply(`*❌ ${toSmallCaps('l arcane goodbye a ete desactive')} !*\n\n${extra.phrases.footer()}`);
      }

    } catch (error) {
      await reply(`*❌ ${toSmallCaps('l invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};