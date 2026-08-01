/**
 * Anti Group Mention Command - 𝐃𝐚𝐫𝐤 Edition
 * Toggle protection contre les mentions de groupe cachées (tag via statuts)
 * [FIX] Fichier manquant — créé pour correspondre au handler.js qui appelle
 *       handleAntigroupmention() et lit groupSettings.antigroupmention
 */

const database = require('../../database');
const config   = require('../../config.js');
const prefix   = config.prefix || '.';

function toSC(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

module.exports = {
  name: 'antigroupmention',
  aliases: ['agm', 'antitaggroupe', 'antimentiongroupe', 'antitagall'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʙʟᴏǫᴜᴇ ʟᴇs ᴍᴇɴᴛɪᴏɴs ᴅᴇ ɢʀᴏᴜᴘᴇ ᴄᴀᴄʜᴇ́ᴇs ᴠɪᴀ sᴛᴀᴛᴜᴛ',
  usage: `${prefix}antigroupmention <on/off/set/get>`,
  groupOnly: true,
  adminOnly: false,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const { reply, isAdmin, isOwner, from, phrases } = extra;

    try {
      if (!isOwner && !isAdmin) {
        return reply(
          `*❌ ${toSC('incantation reservee aux administrateurs du sanctuaire')} !*\n\n${phrases.footer()}`
        );
      }

      if (!args[0]) {
        const s      = database.getGroupSettings(from);
        const status = s.antigroupmention ? '🟢 ᴏɴ' : '🔴 ᴏꜰꜰ';
        const action = (s.antigroupmentionAction || 'delete').toUpperCase();
        return reply(
          `*╭━≪• 🛡️ ${toSC('bouclier mention groupe')} •≫╾╮*\n` +
          `*┃* 📊 *${toSC('etat')}* : ${status}\n` +
          `*┃* ⚖️ *${toSC('sentence')}* : ${action}\n` +
          `*┃*\n` +
          `*┃* 🔮 *${toSC('usage')}* :\n` +
          `*┃*   \`${prefix}antigroupmention on\`\n` +
          `*┃*   \`${prefix}antigroupmention off\`\n` +
          `*┃*   \`${prefix}antigroupmention set delete | kick\`\n` +
          `*┃*   \`${prefix}antigroupmention get\`\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
      }

      const opt = args[0].toLowerCase();

      if (opt === 'on') {
        if (database.getGroupSettings(from).antigroupmention) {
          return reply(`*⚠️ ${toSC('le bouclier mention groupe est deja actif')} !*\n\n${phrases.footer()}`);
        }
        database.updateGroupSettings(from, { antigroupmention: true });
        return reply(`*🛡️ ${toSC('bouclier mention groupe active')} (ᴏɴ).*\n\n${phrases.footer()}`);
      }

      if (opt === 'off') {
        database.updateGroupSettings(from, { antigroupmention: false });
        return reply(`*🔓 ${toSC('bouclier mention groupe desactive')} (ᴏꜰꜰ).*\n\n${phrases.footer()}`);
      }

      if (opt === 'set') {
        if (!args[1]) return reply(`*❓ ${toSC('specifiez')} : \`${prefix}antigroupmention set delete | kick\`\n\n${phrases.footer()}`);
        const action = args[1].toLowerCase();
        if (!['delete', 'kick'].includes(action)) {
          return reply(`*❓ ${toSC('sentence invalide')} — delete | kick\n\n${phrases.footer()}`);
        }
        database.updateGroupSettings(from, { antigroupmentionAction: action, antigroupmention: true });
        return reply(`*⚖️ ${toSC('sentence placee sur')} : ${action.toUpperCase()}*\n\n${phrases.footer()}`);
      }

      if (opt === 'get') {
        const s      = database.getGroupSettings(from);
        const status = s.antigroupmention ? '🟢 ᴏɴ' : '🔴 ᴏꜰꜰ';
        const action = (s.antigroupmentionAction || 'delete').toUpperCase();
        return reply(
          `*╭━≪• 🛡️ ${toSC('statut bouclier mention groupe')} •≫╾╮*\n` +
          `*┃* 📊 ${toSC('etat')} : ${status}\n` +
          `*┃* ⚖️ ${toSC('sentence')} : ${action}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
      }

      return reply(`*💡 ${toSC('utilise')} \`${prefix}antigroupmention\` ${toSC('pour voir les options')}.*\n\n${phrases.footer()}`);

    } catch (err) {
      console.error('[antigroupmention] error:', err.message);
      await reply(`*❌ ᴇʀʀᴇᴜʀ :* ${err.message}\n\n${phrases.footer()}`).catch(() => {});
    }
  }
};
