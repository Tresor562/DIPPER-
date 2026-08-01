/**
 * SetNewsletter Command - 𝐃𝐚𝐫𝐤 Edition
 * Lie le JID du canal de diffusion pour le transfert du menu
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');

const prefix = config.prefix || '.';

module.exports = {
  name: 'sceau_canal', // 🛠️ FIX : Nom normal pour que le handler le reconnaisse
  aliases: ['setnewsletter', 'setnl', 'setchannel', 'sᴄᴇᴀᴜ_ᴄᴀɴᴀʟ'],
  category: '👑 Owner',
  ownerOnly: false, // Géré manuellement par hasAccess via isOwner
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʟɪᴇ ʟᴇ ᴊɪᴅ ᴅᴜ ᴄᴀɴᴀʟ ᴘᴏᴜʀ ʟᴇ ᴛʀᴀɴsғᴇʀᴛ ᴅᴇs ᴍᴇɴᴜs',
  usage: `${prefix}sceau_canal <ᴊɪᴅ ᴅᴜ ᴄᴀɴᴀʟ>`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner } = extra;

    try {
      // 🛡️ BLINDAGE GHOSTG : Sécurité absolue
      const hasAccess = isOwner === true;

      // Sécurité : Seuls les maîtres suprêmes ou l'owner classique
      if (!hasAccess) {
        return reply('*〆 ᴛᴜ ɴ\'ᴀs ᴘᴀs ʟ\'ᴀᴜᴛᴏʀɪsᴀᴛɪᴏɴ sᴜᴘʀᴇ̂ᴍᴇ ᴘᴏᴜʀ ɪɴᴠᴏǫᴜᴇʀ ᴄᴇᴛᴛᴇ ᴘᴜɪssᴀɴᴄᴇ.*');
      }

      let newsletterJid = '';

      // 1. Lecture si on cite un message provenant d'un canal
      const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
      if (contextInfo?.quotedMessage) {
        const findNewsletterJid = (obj, depth = 0) => {
          if (depth > 5 || !obj || typeof obj !== 'object') return null;
          for (const key in obj) {
            const value = obj[key];
            if (typeof value === 'string' && value.endsWith('@newsletter')) return value;
            if (typeof value === 'object' && value !== null) {
              const found = findNewsletterJid(value, depth + 1);
              if (found) return found;
            }
          }
          return null;
        };
        newsletterJid = findNewsletterJid(contextInfo);
      } 
      // 2. Lecture via l'argument fourni
      else if (args[0]) {
        newsletterJid = args[0].trim();
      }

      // Si aucun JID n'est fourni ou trouvé, on affiche le statut
      if (!newsletterJid) {
        const currentJid = config.newsletterJid || 'ɴᴏɴ ᴅᴇ́ғɪɴɪ';
        return reply(
          `*╭╼━━━≪• ᴀʀᴄᴀɴᴇs ᴅᴜ ᴄᴀɴᴀʟ •≫━━━╾╮*\n` +
          `*┃ 🔮 ᴊɪᴅ ᴀᴄᴛᴜᴇʟ : \`${currentJid}\`*\n` +
          `*╰━━━━━━━━━━━━━━━━━━━━━━━╯*\n\n` +
          `*☬ ᴜsᴀɢᴇ :*\n` +
          `  *• ${prefix}sceau_canal <ᴊɪᴅ ᴅᴜ ᴄᴀɴᴀʟ>*\n` +
          `  *• ᴏᴜ ʀᴇ́ᴘᴏɴᴅs ᴀ̀ ᴜɴ ᴍᴇssᴀɢᴇ ᴅᴜ ᴄᴀɴᴀʟ*\n\n` +
          extra.phrases.footer()
        );
      }

      if (!newsletterJid.endsWith('@newsletter')) {
        return reply('*〆 sᴛʀᴜᴄᴛᴜʀᴇ ᴅᴇ ᴊɪᴅ ɪɴᴠᴀʟɪᴅᴇ !*');
      }

      // 💥 ÉCRITURE SÉCURISÉE DANS LE FICHIER CONFIG.JS
      const configPath = path.join(process.cwd(), 'config.js');
      
      if (fs.existsSync(configPath)) {
        let configContent = fs.readFileSync(configPath, 'utf8');

        const newsletterRegex = /(newsletterJid\s*:\s*['"`]).*?(['"`])/;

        if (newsletterRegex.test(configContent)) {
          configContent = configContent.replace(newsletterRegex, `$1${newsletterJid}$2`);
        } else {
          // Si la clé n'existe pas, on l'injecte juste avant la fermeture du module.exports
          configContent = configContent.replace(
            /(\};?\s*$)/,
            `  newsletterJid: '${newsletterJid}',\n$1`
          );
        }

        fs.writeFileSync(configPath, configContent, 'utf8');
      }
      
      // Mise à jour immédiate en mémoire vive
      config.newsletterJid = newsletterJid;

      await reply(
        `*✅ sᴄᴇᴀᴜ ᴅᴜ ᴄᴀɴᴀʟ ᴀʟɪɢɴᴇ́ !*\n` +
        `*📰 ᴊɪᴅ ʟɪᴇ́ : \`${newsletterJid}\`*\n\n` +
        `*💡 ʟ'ᴏᴍʙʀᴇ ᴜᴛɪʟɪsᴇʀᴀ ᴅᴇsᴏʀᴍᴀɪs ᴄᴇ ᴄᴀɴᴀʟ ᴘᴏᴜʀ ʟᴇ ᴍᴇɴᴜ.*\n\n` +
        extra.phrases.footer()
      );

    } catch (error) {
      console.error('SetNewsletter command error:', error);
      await reply(`*〆 ʟ\'ɪɴᴠᴏᴄᴀᴛɪᴏɴ ᴀ ᴇ́ᴄʜᴏᴜᴇ́ : ${error.message}*`);
    }
  }
};
