/**
 * Rejet Appels Command - 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * Active ou désactive le bouclier anti-appels en modifiant le fichier .env
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');

const prefix = config.prefix || '.'; 

// Fonction pour le style Small Caps
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
  name: 'rejet_appels', 
  aliases: ['anticall', 'anti-call', 'rejeter'],
  category: '👑 Owner',
  ownerOnly: false, 
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴄᴛɪᴠᴇ ᴏᴜ ᴅᴇ́sᴀᴄᴛɪᴠᴇ ʟᴇ ʙᴏᴜᴄʟɪᴇʀ ᴀɴᴛɪ-ᴀᴘᴘᴇʟs ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ',
  usage: `${prefix}rejet_appels on/off/status`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner } = extra;

    // 🛡️ SÉCURITÉ GÉRÉE PAR LE HANDLER
    // On se base uniquement sur le statut calculé par ton fichier central
    const hasAccess = isOwner === true;

    // 🚨 Silence total pour les imposteurs
    if (!hasAccess) return;

    if (!args[0]) {
      return reply(`*ᴜsᴀɢᴇ : ${prefix}rejet_appels on / off / status*\n\n${extra.phrases.footer()}`);
    }

    const option = args[0].toLowerCase();
    const envPath = path.join(process.cwd(), '.env');

    try {
      // Lecture chirurgicale du fichier .env
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      
      // On cherche si ANTICALL est à true
      const isCurrentlyEnabled = /^ANTICALL=true/m.test(envContent);

      // Traitement de l'option STATUS
      if (option === 'status') {
        const statusText = isCurrentlyEnabled 
          ? '*🛡️ ʟᴇ ʙᴏᴜᴄʟɪᴇʀ ᴀɴᴛɪ-ᴀᴘᴘᴇʟs ᴇsᴛ ᴀᴄᴛɪᴠᴇ́.*' 
          : '*🔓 ʟᴇ ʙᴏᴜᴄʟɪᴇʀ ᴀɴᴛɪ-ᴀᴘᴘᴇʟs ᴇsᴛ ᴅᴇ́sᴀᴄᴛɪᴠᴇ́.*';
        return reply(`${statusText}\n\n${extra.phrases.footer()}`);
      }

      if (!['on', 'off'].includes(option)) {
        return reply(`*ᴜsᴀɢᴇ* : \`${prefix}rejet_appels on / off / status\`\n\n${extra.phrases.footer()}`);
      }

      const enable = option === 'on';

      // Vérification si le statut demandé est déjà le statut actuel
      if (enable === isCurrentlyEnabled) {
        return reply(enable 
          ? '*🛡️ ʟᴇ ʙᴏᴜᴄʟɪᴇʀ ᴇsᴛ ᴅᴇ́ᴊᴀ̀ ᴀᴄᴛɪᴠᴇ́.*' 
          : '*🔓 ʟᴇ ʙᴏᴜᴄʟɪᴇʀ ᴇsᴛ ᴅᴇ́ᴊᴀ̀ ᴅᴇ́sᴀᴄᴛɪᴠᴇ́.*'
        );
      }

      // Modification propre de la ligne dans le .env
      const targetValue = enable ? 'true' : 'false';
      if (envContent.match(/^ANTICALL=/m)) {
        envContent = envContent.replace(/^ANTICALL=.*/m, `ANTICALL=${targetValue}`);
      } else {
        envContent = envContent.trim() + `\nANTICALL=${targetValue}`;
      }

      // Sauvegarde physique du fichier
      fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
      
      // 🧠 APPLICATION FORCEE EN MÉMOIRE
      // On met à jour l'environnement d'exécution pour que l'écouteur d'appel réagisse immédiatement
      process.env.ANTICALL = targetValue;

      const successMessage = enable
        ? `*🛡️ ʟᴇ ʙᴏᴜᴄʟɪᴇʀ ᴀɴᴛɪ-ᴀᴘᴘᴇʟs ᴇsᴛ ᴀᴄᴛɪᴠᴇ́. ᴛᴏᴜᴛᴇ ɪɴᴛʀᴜsɪᴏɴ ᴠᴏᴄᴀʟᴇ sᴇʀᴀ ʀᴇᴊᴇᴛᴇ́ᴇ ᴇᴛ sᴄᴇʟʟᴇ́ᴇ.*`
        : `*🔓 ʟᴇ ʙᴏᴜᴄʟɪᴇʀ ᴀɴᴛɪ-ᴀᴘᴘᴇʟs ᴀ ᴇ́ᴛᴇ́ ᴅɪssɪᴘᴇ́. ʟᴇs ᴀᴘᴘᴇʟs sᴏɴᴛ ᴀ̀ ɴᴏᴜᴠᴇᴀᴜ ᴀᴜᴛᴏʀɪsᴇ́s.*`;

      await reply(successMessage + `\n\n${extra.phrases.footer()}`);

    } catch (err) {
      console.error('[anticall cmd] error:', err);
      reply('*〆 ᴜɴᴇ ᴇʀʀᴇᴜʀ ᴀ ɪɴᴛᴇʀʀᴏᴍᴘᴜ ʟᴀ ᴛʀᴀɴsᴍᴜᴛᴀᴛɪᴏɴ ᴅᴜ ʙᴏᴜᴄʟɪᴇʀ.*');
    }
  }
};
