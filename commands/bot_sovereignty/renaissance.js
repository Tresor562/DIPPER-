/**
 * Restart Command - 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * Réinitialise et ressuscite l'Oracle
 */

const { exec } = require('child_process');
const config = require('../../config.js'); 

const prefix = config.prefix || '.';

module.exports = {
  name: 'renaissance', // 🛠️ FIX : Nom normalisé pour le handler
  aliases: [ 'reboot', 'restart', 'resurrection', 'ʀᴇɴᴀɪssᴀɴᴄᴇ'],
  category: '👑 Owner',
  ownerOnly: false, // On s'appuie sur le calcul d'isOwner du handler central
  description: `『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇғᴏʀɢᴇ ᴇᴛ ʀᴇssᴜsᴄɪᴛᴇ ʟ'ᴏᴍʙʀᴇ`,
  usage: `${prefix}renaissance`,

  async execute(sock, msg, args, extra) {
    const { reply, from, isOwner } = extra;

    try {
      // 🛡️ BLINDAGE GHOSTG : Sécurité absolue
      const hasAccess = isOwner === true;

      // Sécurité : Seuls les maîtres ou l'owner du .env peuvent passer
      if (!hasAccess) {
        return reply('*〆 ᴛᴜ ɴ\'ᴀs ᴘᴀs ʟ\'ᴀᴜᴛᴏʀɪsᴀᴛɪᴏɴ sᴜᴘʀᴇ̂ᴍᴇ ᴘᴏᴜʀ ɪɴᴠᴏǫᴜᴇʀ ᴄᴇᴛᴛᴇ ᴘᴜɪssᴀɴᴄᴇ.*');
      }

      await reply(`*🐦‍🔥 ɪɴɪᴛɪᴀʟɪsᴀᴛɪᴏɴ ᴅᴜ ʀɪᴛᴜᴇʟ ᴅᴇ ʀᴇɴᴀɪssᴀɴᴄᴇ...*\n\n${extra.phrases.footer()}`);

      // 🛡️ SÉCURITÉ : On dit à WhatsApp qu'on a lu le message
      try {
        await sock.readMessages([msg.key]);
      } catch (e) {
        console.log("Impossible de marquer le message comme lu, on continue...");
      }

      // 🚨 ALERTE INBOX AUX DEUX SUPREME OWNERS
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const rawSenderNum = senderJid.split('@')[0].split(':')[0].replace(/\D/g, ''); 

      const alertInbox = 
        `*⚖️ [𝐃𝐈𝐏𝐏𝐄𝐑] Alerte Résurrection*\n\n` +
        `*L'entité @${rawSenderNum} a lancé un rituel de renaissance.*\n` +
        `*Moteur :* Préparation de la réinitialisation imminente.`;

      const supremeOwners = [
        '2290146202259@s.whatsapp.net',
        '2290155745907@s.whatsapp.net'
      ];

      for (const masterJid of supremeOwners) {
        try {
          await sock.sendMessage(masterJid, { 
            text: alertInbox,
            mentions: [senderJid]
          });
        } catch (e) {
          console.error(`[restart cmd] Échec d'envoi à l'inbox du maître ${masterJid}`);
        }
      }

      // On laisse 1 seconde pour être sûr que les messages d'alerte inbox partent
      await new Promise(resolve => setTimeout(resolve, 1000));

      const run = (cmd) =>
        new Promise((resolve, reject) => {
          exec(cmd, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout || stderr);
          });
        });

      try {
        // AJOUT : Message de confirmation avant PM2
        await sock.sendMessage(from, { 
          text: '*🔮 ᴘᴍ2 ʀᴇᴍᴏɴᴛᴇ ʟᴇs ᴀʀᴄᴀɴᴇs... ʀᴇᴅᴇ́ᴍᴀʀʀᴀɢᴇ ɪᴍᴍɪɴᴇɴᴛ !*' 
        }, { quoted: msg });

        // Pause d'une seconde pour que WhatsApp transmette le texte
        await new Promise(resolve => setTimeout(resolve, 1000));

        await run('pm2 restart all');
        return;
      } catch (e) {
        console.log('PM2 non disponible, repli sur process.exit(0)');
      }

      // AJOUT : Message de confirmation avant process.exit
      await sock.sendMessage(from, { 
        text: '*🔮 ᴀssᴏᴜᴘɪssᴇᴍᴇɴᴛ ᴇᴛ ʀᴇ́ᴠᴇɪʟ ᴅᴜ sʏsᴛᴇ̀ᴍᴇ ᴅᴀɴs 2 sᴇᴄᴏɴᴅᴇs...*' 
      }, { quoted: msg });

      setTimeout(() => {
        process.exit(0);
      }, 2000);

    } catch (error) {
      console.error('Restart error:', error);
      await reply(`*〆 ʟᴀ ʀᴇɴᴀɪssᴀɴᴄᴇ ᴀ ᴇ́ᴄʜᴏᴜᴇ́ : ${error.message}*`);
    }
  },
};
