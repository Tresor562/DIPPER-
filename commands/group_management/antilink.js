const database = require('../../database');
const config = require('../../config.js');

function toSmallCaps(text) {
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";
  const cleanedText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

module.exports = {
  name: 'antilink',
  aliases: ['antilinkgc', 'antilien'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄᴏɴғɪɢᴜʀᴇ ʟᴀ ᴘʀᴏᴛᴇᴄᴛɪᴏɴ ᴀɴᴛɪʟɪɴᴋ (ᴅᴇʟᴇᴛᴇ/ᴋɪᴄᴋ)',
  usage: `${config.prefix || '.'}antilink <on/off/set/get>`,
  groupOnly: true,
  adminOnly: false, 
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const { reply, isAdmin, isOwner } = extra;
    const prefix = config.prefix || '.';

    try {
      // 🛡️ SÉCURITÉ GÉRÉE PAR LE HANDLER
      // isOwner est déjà calculé en amont et s'avère vrai si l'expéditeur est un Supreme Owner
      const isMe = msg.key.fromMe || isOwner;

      if (!isMe && !isAdmin) {
        return reply(`*❌ ${toSmallCaps('cette incantation est reservee aux administrateurs du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antilink ? 'ON' : 'OFF';
        const action = (settings.antilinkAction || 'delete').toUpperCase();

        return reply(
          `*╭━≪• sᴀɴᴄᴛᴜᴀɪʀᴇ_ʟɪᴇɴs •≫╾╮*\n` +
          `*┃* 🛡️ *${toSmallCaps('etat')} :* ${status}\n` +
          `*┃* ⚖️ *${toSmallCaps('sentence')} :* ${action}\n\n` +
          `*┃* 🔮 *${toSmallCaps('incantations disponibles')} :*\n` +
          `*┃* *${toSmallCaps('cet arcane detecte et purge les liens')}*\n` +
          `*┃* *${toSmallCaps('intrus du sanctuaire')}.*\n\n` +
          `  ${prefix}antilink on\n` +
          `  ${prefix}antilink off\n` +
          `  ${prefix}antilink set delete | kick\n` +
          `  ${prefix}antilink get\n\n` +
          extra.phrases.footer()
        );
      }

      const opt = args[0].toLowerCase();

      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).antilink) {
          return reply(`*❌ ${toSmallCaps('le bouclier de liens est deja actif')} !*\n\n${extra.phrases.footer()}`);
        }
        database.updateGroupSettings(extra.from, { antilink: true });
        return reply(`*🛡️ ${toSmallCaps('bouclier de liens a ete eveille')} (ᴏɴ).*\n\n${extra.phrases.footer()}`);
      }

      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antilink: false });
        return reply(`*🔓 ${toSmallCaps('le bouclier de liens a ete desactive')} (ᴏғғ).*\n\n${extra.phrases.footer()}`);
      }

      if (opt === 'set') {
        if (args.length < 2) {
          return reply(`*❓ ${toSmallCaps('specifie une sentence')} :* \`${prefix}antilink set delete | kick\`\n\n${extra.phrases.footer()}`);
        }

        const setAction = args[1].toLowerCase();
        if (!['delete', 'kick'].includes(setAction)) {
          return reply(`*❓ ${toSmallCaps('sentence invalide. choisissez entre delete ou kick')}.*\n\n${extra.phrases.footer()}`);
        }

        database.updateGroupSettings(extra.from, { 
          antilinkAction: setAction,
          antilink: true 
        });
        return reply(`*⚖️ ${toSmallCaps('la sentence du bouclier de liens est placee sur')} : ${setAction.toUpperCase()}*\n\n${extra.phrases.footer()}`);
      }

      if (opt === 'get') {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antilink ? 'ON' : 'OFF';
        const action = (settings.antilinkAction || 'delete').toUpperCase();

        return reply(
          `*╭╼━━━≪• sᴛᴀᴛᴜᴛ ʙᴏᴜᴄʟɪᴇʀ_ʟɪᴇɴs •≫━━━╾╮*\n` +
          `*┃* 🛡️ *${toSmallCaps('etat')} :* ${status}\n` +
          `*┃* ⚖️ *${toSmallCaps('sentence')} :* ${action}\n\n` +
          extra.phrases.footer()
        );
      }

      return reply(`*💡 ${toSmallCaps('utilise')} \`${prefix}antilink\` ${toSmallCaps('pour voir les options')}.*\n\n${extra.phrases.footer()}`);

    } catch (error) {
      console.error('Antilink command error:', error);
      await reply(`❌ *ᴇʀʀᴇᴜʀ :* ${error.message}\n\n${extra.phrases.footer()}`);
    }
  }
};
