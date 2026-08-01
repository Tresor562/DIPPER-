
/**
 * Help Command - Show detailed help for a specific command
 * 𝐃𝐚𝐫𝐤  Edition
 */

const { loadCommands } = require('../../utils/commandLoader');
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
  name: 'help',
  aliases: ['h', 'aide', 'l'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀғғɪᴄʜᴇ ʟᴇs ᴅᴇᴛᴀɪʟs ᴇᴛ ʟ\'ᴜᴛɪʟɪsᴀᴛɪᴏɴ ᴅ\'ᴜɴᴇ ᴄᴏᴍᴍᴀɴᴅᴇ sᴘᴇᴄɪғɪǫᴜᴇ',
  usage: `${config.prefix || '.'}help [nom du sort]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const chatId = extra.from;

    try {
      const prefix = config.prefix || '.';
      const commands = loadCommands();
      const senderId = extra.sender;

      // --- CAS 1 : AIDE SPÉCIFIQUE ---
      if (args.length > 0) {
        let search = args[0].toLowerCase();
        let targetCmd = null;

        commands.forEach((cmd) => {
          if (cmd.name.toLowerCase() === search || (cmd.aliases && cmd.aliases.includes(search))) {
            targetCmd = cmd;
          }
        });

        // ❌ COMMANDE INTROUVABLE
        if (!targetCmd) {
          return await reply(
            `*❌ ${toSmallCaps('commande')} \`${args[0]}\` ${toSmallCaps('introuvable')}.*\n` +
            `*💡 ${toSmallCaps('tape')} \`${prefix}menu\` ${toSmallCaps('pour voir les commandes existantes')}.*\n\n` +
            `> *♰ ᴇ́ᴛᴀʙʟɪ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`
          );
        }

        // 1. Remplacement dynamique de "${prefix}" par le vrai préfixe
        let rawUsage = targetCmd.usage || '';
        let formattedUsage = rawUsage.replace(/\$\{prefix\}/g, prefix);

        // 2. Construction du bloc d'aide
        let helpDetail = 
   `*╭━≪• ⚡ ᴀɪᴅᴇ ʀɪᴛᴜᴇʟ •≫╾╮*\n` +
   `*┃* 🔮 *${toSmallCaps('sort')} :* ${targetCmd.name}\n` +
   `*┃* 🏷️ *${toSmallCaps('alias')} :* ${targetCmd.aliases ? targetCmd.aliases.join(', ') : 'ᴀᴜᴄᴜɴ'}\n` +
   `*┃* 🧩 *${toSmallCaps('categorie')} :* ${targetCmd.category || '🔮 ᴀᴜᴛʀᴇs sᴏʀᴛs'}\n`;

        if (formattedUsage) {
          const usageLines = formattedUsage.split('\n');
          const indentedUsage = usageLines.map(line => `*┃* 💡 *${toSmallCaps('usage')} :* ${line}`).join('\n');
          helpDetail += indentedUsage + '\n';
        }

        helpDetail += `*                ╰━━━━━━━━━━━━━━━━━━━╯*\n\n` +
                      `*📝 ${toSmallCaps('description')} :*\n_${targetCmd.description.replace(/\*\*/g, '') || 'Aucune description disponible.'}_\n\n` +
         `_♛ ${toSmallCaps('jesus est roi 𓆩✞𓆪 ')}_\n\n` +
                        `> *♰ ᴇ́ᴛᴀʙʟɪ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`;

        return await reply(helpDetail);
      }

      // --- CAS 2 : AIDE GÉNÉRALE ---
      let generalHelp = `*╭╼━━≪• ɢʜᴏsᴛɢ-x ᴍᴅ •≫━━╾╮*\n` +
                        `*┃* 👤 *${toSmallCaps('utilisateur')} :* @${senderId.split('@')[0]}\n` +
                        `*┃* 🔗 *${toSmallCaps('prefixe')} :* [ ${prefix} ]\n` +
                        `*┃* 🧬 *${toSmallCaps('version')} :* 1.0.0 (ᴍᴅ)\n` +
                        `*╰━━━━━━━━━━━━━━━━━━╯*\n\n` +
                        `*💡 ${toSmallCaps('astuce')} :*\n` +
                        `${toSmallCaps('pour comprendre un sort specifique, tape')} :\n` +
                        `👉🏾 \`${prefix}help <nom_du_sort>\`\n\n` +
                        `*🌐 ${toSmallCaps('liens du sanctuaire')} :*\n` +
                        `*┃* 📢 *${toSmallCaps('chaine')} :* https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V\n` +
                        `*┃* 🛡️ *${toSmallCaps('maitre')} :* https://wa.me/2290146202259\n` +
                        `*┃* 🛡️ *${toSmallCaps('maitre')} :* https://wa.me/2290155745907\n\n` +
                        `_♛ ${toSmallCaps('Jesus est roi 𓆩✞𓆪 ')}_\n\n` +
                        `> *♰ ᴇ́ᴛᴀʙʟɪ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`;

      await sock.sendMessage(chatId, { 
        text: generalHelp,
        mentions: [senderId]
      }, { quoted: msg });

    } catch (err) {
      console.error('help.js error:', err);
      await reply(`*❌ ${toSmallCaps('erreur dans le grimoire d\'aide')}.*\n\n> *♰ ᴇ́ᴛᴀʙʟɪ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`);
    }
  }
};
