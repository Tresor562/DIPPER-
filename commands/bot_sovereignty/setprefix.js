/**
 * Set Prefix Command - 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * Modifie le préfixe d'invocation dans le fichier .env et en mémoire
 */

const config = require('../../config');
const fs = require('fs');
const path = require('path');

const prefix = config.prefix || '.';

module.exports = {
  name: 'signe_commande',
  aliases: ['setprefix', 'sɪɢɴᴇ_ᴄᴏᴍᴍᴀɴᴅᴇ'],
  category: '👑 Owner',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴛʀᴀɴsᴍᴜᴛᴇ ʟᴇ sɪɢɴᴇ ᴅ\'ɪɴᴠᴏᴄᴀᴛɪᴏɴ ᴅᴇs ᴄᴏᴍᴍᴀɴᴅᴇs',
  usage: `${prefix}signe_commande <ɴᴏᴜᴠᴇᴀᴜ ᴘʀᴇ́ғɪxᴇ>`,
  ownerOnly: false, // Géré manuellement par hasAccess via isOwner

  async execute(sock, msg, args, extra) {
    const { isOwner, reply } = extra;
    
    try {
      // 🛡️ BLINDAGE GHOSTG : Sécurité absolue
      const hasAccess = isOwner === true;

      // Sécurité : Seuls les maîtres suprêmes ou l'owner classique du .env
      if (!hasAccess) {
        return reply('*〆 ᴛᴜ ɴ\'ᴀs ᴘᴀs ʟ\'ᴀᴜᴛᴏʀɪsᴀᴛɪᴏɴ sᴜᴘʀᴇ̂ᴍᴇ ᴘᴏᴜʀ ɪɴᴠᴏǫᴜᴇʀ ᴄᴇᴛᴛᴇ ᴘᴜɪssᴀɴᴄᴇ.*');
      }

      if (args.length === 0) {
        return reply(
          `*╭╼━━━≪• sɪɢɴᴇ ᴀᴄᴛᴜᴇʟ •≫━━━╾╮*\n` +
          `*┃ 🔮 ᴘʀᴇ́ғɪxᴇ : ${config.prefix}*\n` +
          `*╰━━━━━━━━━━━━━━━━━━━━━━━╯*\n\n` +
          `*☬ ᴜsᴀɢᴇ : ${prefix}signe_commande <ɴᴏᴜᴠᴇᴀᴜ ᴘʀᴇ́ғɪxᴇ>*\n\n` +
          extra.phrases.footer()
        );
      }

      const newPrefix = args[0].trim();

      if (newPrefix.length > 3) {
        return reply('*〆 ʟᴇ sɪɢɴᴇ ᴅ\'ɪɴᴠᴏᴄᴀᴛɪᴏɴ ᴅᴏɪᴛ ᴄᴏᴍᴘʀᴇɴᴅʀᴇ ᴇɴᴛʀᴇ 1 ᴇᴛ 3 ᴄᴀʀᴀᴄᴛᴇ̀ʀᴇs !*');
      }

      // 1️⃣ Mise à jour de la configuration en mémoire vive
      config.prefix = newPrefix;
      process.env.PREFIX = newPrefix;

      // 2️⃣ Écriture physique dans le fichier .env
      const envPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf-8');
        if (envContent.match(/^PREFIX=/m)) {
          envContent = envContent.replace(/^PREFIX=.*/m, `PREFIX=${newPrefix}`);
        } else {
          envContent += `\nPREFIX=${newPrefix}`;
        }
        fs.writeFileSync(envPath, envContent.trim() + '\n');
      }

      // 3️⃣ Écriture physique dans le fichier config.js (Double sécurité)
      const configPath = path.join(process.cwd(), 'config.js');
      if (fs.existsSync(configPath)) {
        let configContent = fs.readFileSync(configPath, 'utf-8');
        const prefixRegex = /(prefix\s*:\s*['"`]).*?(['"`])/;

        if (prefixRegex.test(configContent)) {
          configContent = configContent.replace(prefixRegex, `$1${newPrefix}$2`);
          fs.writeFileSync(configPath, configContent, 'utf-8');
        }
      }

      await reply(
        `*✅ ʟᴇ sɪɢɴᴇ ᴅ\'ɪɴᴠᴏᴄᴀᴛɪᴏɴ ᴀ ᴇ́ᴄʜᴏᴜᴇ́ : ${newPrefix}*\n` + // Note: J'ai laissé "échoué" ici car c'est ce qu'il y avait dans ton code d'origine (probablement une petite typo pour "transmuté"), dis-moi si tu veux changer !
        `_ʟᴇs ᴀʀᴄᴀɴᴇs s'ᴇ́ᴠᴇɪʟʟᴇʀᴏɴᴛ ᴅᴇ́sᴏʀᴍᴀɪs sᴏᴜs ʟᴀ ғᴏʀᴍᴇ : ${newPrefix}ᴄᴏᴍᴍᴀɴᴅᴇ_\n\n` +
        extra.phrases.footer()
      );

    } catch (error) {
      await reply(`*〆 ʟ\'ɪɴᴠᴏᴄᴀᴛɪᴏɴ ᴀ ᴇ́ᴄʜᴏᴜᴇ́ : ${error.message}*`);
    }
  }
};
