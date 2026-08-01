/**
 * Anti-Status Mention Command - Toggle antistatusmention protection with delete/kick options
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́ - Prestige V5
 */

const database = require('../../database');
const config = require('../../config.js');

// Extraction du préfixe pour l'usage
const prefix = config.prefix || '.';

// Fonction pour le style Small Caps
function toSmallCaps(text) {
  if (!text) return '';
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";

  const cleanedText = String(text).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 

  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

module.exports = {
  name: 'antistatusmention',
  aliases: ['asm', 'antigroupstatus', 'antistatus'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄᴏɴғɪɢᴜʀᴇ ʟᴀ ᴘʀᴏᴛᴇᴄᴛɪᴏɴ ᴄᴏɴᴛʀᴇ ʟᴇs ᴍᴇɴᴛɪᴏɴs ɪɴᴠɪsɪʙʟᴇs ᴅᴇ sᴛᴀᴛᴜᴛ (ᴅᴇʟᴇᴛᴇ/ᴋɪᴄᴋ)',
  usage: `${prefix}antistatusmention <on/off/set/get>`,
  groupOnly: true,
  adminOnly: false, 
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) { 
    const { reply, isAdmin } = extra;
    const chatId = msg.key.remoteJid; // 🛠️ FIX 1 : Extraction du vrai JID du groupe

    try { 
      // 🛡️ Vérification des droits via le système centralisé du projet
      // (extra.isOwner, extra.isSupremeOwner, extra.isAdmin — fournis par
      // handler.js/buildExtra, cohérent avec le reste du projet)
      if (!extra.isOwner && !extra.isSupremeOwner && !isAdmin) {
        return reply(`*❌ ${toSmallCaps('cette commande est reservee aux administrateurs du groupe')} !*\n\n${extra.phrases.footer()}`);
      }

      if (!args[0]) {
        const settings = database.getGroupSettings(chatId);
        const status = settings.antistatusmention ? 'ᴏɴ' : 'ᴏғғ';
        const action = (settings.antistatusmentionAction || 'delete').toUpperCase();

        return reply(
          `╭╼≪• *${toSmallCaps('bouclier statuts')}* •≫╾╮\n` +
          `┃ 🛡️ *${toSmallCaps('etat')}* : ${status}\n` +
          `┃ ⚖️ *${toSmallCaps('sentence')}* : ${action}\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
          `*🔮 ɪɴᴄᴀɴᴛᴀᴛɪᴏɴs :*\n` +
          `*${toSmallCaps('cet arcane detecte et purge les mentions')}*\n` +
          `*${toSmallCaps('cachees de statut dans le sanctuaire')}.*\n\n` +
          `  *• \`${prefix}antistatusmention on\`*\n` +
          `  *• \`${prefix}antistatusmention off\`*\n` +
          `  *• \`${prefix}antistatusmention set delete | kick\`*\n` +
          `  *• \`${prefix}antistatusmention get\`*\n\n` +
          extra.phrases.footer()
        );
      }

      const opt = args[0].toLowerCase();

      if (opt === 'on') {
        if (database.getGroupSettings(chatId).antistatusmention) {
          return reply(`*❌ ${toSmallCaps('le bouclier de statut est deja actif')} !*\n\n${extra.phrases.footer()}`);
        }
        database.updateGroupSettings(chatId, { antistatusmention: true });
        return reply(`*🛡️ ${toSmallCaps('bouclier de statut a ete eveille')} (ᴏɴ).*\n\n${extra.phrases.footer()}`);
      }

      if (opt === 'off') {
        database.updateGroupSettings(chatId, { antistatusmention: false });
        return reply(`*🔓 ${toSmallCaps('le bouclier de statut a ete desactive')} (ᴏғғ).*\n\n${extra.phrases.footer()}`);
      }

      if (opt === 'set') {
        if (args.length < 2) {
          return reply(`*❓ ${toSmallCaps('veuillez specifier une sentence')} :*\n\`${prefix}antistatusmention set delete | kick\`\n\n${extra.phrases.footer()}`);
        }

        const setAction = args[1].toLowerCase();
        if (!['delete', 'kick'].includes(setAction)) {
          return reply(`*❓ ${toSmallCaps('sentence invalide. choisissez entre delete ou kick')}.*\n\n${extra.phrases.footer()}`);
        }

        database.updateGroupSettings(chatId, { 
          antistatusmentionAction: setAction,
          antistatusmention: true 
        });
        return reply(`*⚖️ ${toSmallCaps('la sentence du bouclier de statut est placee sur')} : ${setAction.toUpperCase()}*\n\n${extra.phrases.footer()}`);
      }

      if (opt === 'get') {
        const settings = database.getGroupSettings(chatId);
        const status = settings.antistatusmention ? 'ᴏɴ' : 'ᴏғғ';
        const action = (settings.antistatusmentionAction || 'delete').toUpperCase();

        return reply(
          `╭╼━━━≪• *${toSmallCaps('bouclier statuts')}* •≫━━━╾╮\n` +
          `┃ 🛡️ *${toSmallCaps('etat')}* : ${status}\n` +
          `┃ ⚖️ *${toSmallCaps('sentence')}* : ${action}\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
          extra.phrases.footer()
        );
      }

      return reply(`*💡 ${toSmallCaps('utilise')} \`${prefix}antistatusmention\` ${toSmallCaps('pour voir les options')}.*\n\n${extra.phrases.footer()}`);

    } catch (error) {
      console.error('Anti-status mention command error:', error);
      await reply(`❌ *ᴇʀʀᴇᴜʀ :* ${error.message}\n\n${extra.phrases.footer()}`);
    }
  }
};
