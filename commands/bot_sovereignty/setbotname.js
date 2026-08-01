/**
 * Set Oracle Name Command - 𝐃𝐚𝐫𝐤 Edition
 * Modifie le nom de l'Oracle dans la configuration de l'Oracle
 */

const config = require('../../config');
const fs = require('fs');
const path = require('path');

const prefix = config.prefix || '.';

module.exports = {
  name: 'apparence_systeme',
  aliases: [ 'setbotname', 'setname', 'botname', 'nom', 'ᴀᴘᴘᴀʀᴇɴᴄᴇ_sʏsᴛᴇᴍᴇ'],
  category: '👑 Owner',
  ownerOnly: false, // Géré manuellement par hasAccess via isOwner
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴍᴏᴅɪғɪᴇ ʟᴇ ɴᴏᴍ ᴅᴇ ʙᴀᴘᴛᴇ̂ᴍᴇ ᴅᴇ ʟ\'ᴀᴠᴀᴛᴀʀ ᴅᴀɴs ʟ\'ᴏʀᴀᴄʟᴇ',
  usage: `${prefix}apparence_systeme <ɴᴏᴜᴠᴇᴀᴜ ɴᴏᴍ> ᴏᴜ ᴇɴ ʀᴇ́ᴘᴏɴsᴇ ᴀ̀ ᴜɴ ᴍᴇssᴀɢᴇ`,

  async execute(sock, msg, args, extra) {
    const { isOwner, reply } = extra;

    try {
      // 🛡️ BLINDAGE GHOSTG : Sécurité absolue
      const hasAccess = isOwner === true;

      // Sécurité : Seuls les maîtres suprêmes ou l'owner classique
      if (!hasAccess) {
        return reply('*〆 ᴛᴜ ɴ\'ᴀs ᴘᴀs ʟ\'ᴀᴜᴛᴏʀɪsᴀᴛɪᴏɴ sᴜᴘʀᴇ̂ᴍᴇ ᴘᴏᴜʀ ɪɴᴠᴏǫᴜᴇʀ ᴄᴇᴛᴛᴇ ᴘᴜɪssᴀɴᴄᴇ.*');
      }

      let newOracleName = '';

      // 2. EXTRACTION DU TEXTE (Si réponse ou arguments)
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      
      if (quotedMsg) {
        const quotedText = quotedMsg.conversation || 
                          quotedMsg.extendedTextMessage?.text || 
                          quotedMsg.imageMessage?.caption ||
                          quotedMsg.videoMessage?.caption ||
                          '';
        newOracleName = quotedText.trim();
      } else {
        newOracleName = args.join(' ').trim();
      }

      // 3. VALIDATIONS
      if (!newOracleName) {
        return reply(
          `*╭╼━━━≪• ᴀʀᴄᴀɴᴇs ᴅᴇ ʟ'ᴀᴘᴘᴀʀᴇɴᴄᴇ •≫━━━╾╮*\n` +
          `*┃ 🔮 ɴᴏᴍ ᴀᴄᴛᴜᴇʟ : ${config.botName || 'ɢʜᴏsᴛɢ-x'}*\n` +
          `*╰━━━━━━━━━━━━━━━━━━━━━━━╯*\n\n` +
          `*☬ ᴜsᴀɢᴇ :*\n` +
          `  *• ${prefix}apparence_systeme <ɴᴏᴜᴠᴇᴀᴜ ɴᴏᴍ>*\n` +
          `  *• ᴏᴜ ʀᴇ́ᴘᴏɴᴅs ᴀ̀ ᴜɴ ᴍᴇssᴀɢᴇ ᴀᴠᴇᴄ ʟᴀ ᴄᴏᴍᴍᴀɴᴅᴇ*\n\n` +
          extra.phrases.footer()
        );
      }

      if (newOracleName.length > 50) {
        return reply('*〆 ʟᴇ ɴᴏᴍ ᴅᴇ ʟ\'ᴀᴠᴀᴛᴀʀ ɴᴇ ᴘᴇᴜᴛ ᴇxᴄᴇ́ᴅᴇʀ 50 ᴄᴀʀᴀᴄᴛᴇ̀ʀᴇs !*');
      }

      // 💥 TRANSMUTATION WHATSAPP (Met à jour le nom sur ton profil)
      try {
        await sock.updateProfileName(newOracleName);
      } catch (e) {
        console.error('Erreur lors du changement de nom WhatsApp:', e);
      }

      // Mise à jour de la configuration en mémoire vive
      config.botName = newOracleName;

      // 4. ÉCRITURE PHYSIQUE DANS LE FICHIER CONFIG.JS
      const configPath = path.join(process.cwd(), 'config.js');
      
      if (fs.existsSync(configPath)) {
        let configContent = fs.readFileSync(configPath, 'utf-8');
        const oracleNameRegex = /(botName\s*:\s*['"`]).*?(['"`])/;

        if (oracleNameRegex.test(configContent)) {
           configContent = configContent.replace(oracleNameRegex, `$1${newOracleName.replace(/'/g, "\\'")}$2`);
           fs.writeFileSync(configPath, configContent, 'utf-8');
        }
      }

      // Purge du cache de configuration pour que le changement s'applique partout
      try {
        delete require.cache[require.resolve('../../config')];
      } catch (e) {}

      await reply(`*✅ ʟ\'ᴀᴘᴘᴀʀᴇɴᴄᴇ ᴀ ᴇ́ᴛᴇ́ ᴛʀᴀɴsᴍᴜᴛᴇ́ᴇ : ${newOracleName}*\n*ᴄᴇ sᴄᴇᴀᴜ sᴇʀᴀ ᴅᴇ́sᴏʀᴍᴀɪs ᴀғғɪᴄʜᴇ́ sᴜʀ ʟᴇs ᴍᴇɴᴜs ᴇᴛ ᴛᴏɴ ᴘʀᴏғɪʟ.*\n\n${extra.phrases.footer()}`);

    } catch (error) {
      console.error('Setbotname command error:', error);
      await reply(`*〆 ʟ\'ɪɴᴠᴏᴄᴀᴛɪᴏɴ ᴀ ᴇ́ᴄʜᴏᴜᴇ́ : ${error.message}*`);
    }
  }
};
