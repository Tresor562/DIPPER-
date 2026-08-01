/**
 * Auto-React Command - 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * Configure les réactions automatiques du système (.env Synced)
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config'); // Importation de la configuration

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
  name: 'reflexe_systeme', // 🛠️ FIX : Nom en lettres normales pour éviter les ratés du handler
  aliases: [ 'autoreact', 'ar', 'reflexe', 'reaction', 'reactions', 'ʀᴇғʟᴇxᴇ_sʏsᴛᴇᴍᴇ'],
  category: '👑 Owner',
  ownerOnly: false, // 🛠️ FIX : On s'appuie sur le calcul d'isOwner du handler central
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄᴏɴғɪɢᴜʀᴇ ʟᴇs ʀᴇ́ᴀᴄᴛɪᴏɴs ᴀᴜᴛᴏᴍᴀᴛɪǫᴜᴇs ᴅᴇs sᴄᴇᴀᴜx',
  usage: `${prefix}reflexe_systeme on/off/set bot/set all`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner } = extra;

    // 🛡️ SÉCURITÉ GHOSTG : Seuls les maîtres suprêmes peuvent manipuler les réflexes
    const hasAccess = isOwner === true;
    if (!hasAccess) return;

    const envPath = path.join(process.cwd(), '.env');

    try {
      // 1️⃣ Lecture et nettoyage du fichier .env
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

      const isCurrentlyOn = /^AUTOREACT=true/m.test(envContent);
      
      let currentMode = 'bot';
      const modeMatch = envContent.match(/^AUTOREACT_MODE=(.*)$/m);
      if (modeMatch) {
        currentMode = modeMatch[1].trim();
      }

      const opt = args.join(' ').toLowerCase().trim();

      if (!args[0]) {
        return reply(
          `*╭╼━≪• ${toSmallCaps('options des reflexes')} •≫━╾╮*\n` +
          `*┃ • ${prefix}reflexe_systeme on*\n` +
          `*┃ • ${prefix}reflexe_systeme off*\n` +
          `*┃ • ${prefix}reflexe_systeme set bot*\n` +
          `*┃ • ${prefix}reflexe_systeme set all*\n` +
          `*╰━━━━━━━━━━━━━━━━━━━━╯*\n\n` +
          extra.phrases.footer()
        );
      }

      // Fonction utilitaire pour mettre à jour ou ajouter proprement une variable
      const updateEnv = (key, value) => {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent = envContent.trim() + `\n${key}=${value}`;
        }
        fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
      };

      // Cas ON : Activation
      if (opt === 'on') {
        if (isCurrentlyOn) {
          return reply(`*🛡️ ʟᴇs ʀᴇ́ғʟᴇxᴇs ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ sᴏɴᴛ ᴅᴇ́ᴊᴀ̀ ᴀᴄᴛɪᴠᴇ́s.*`);
        }

        updateEnv('AUTOREACT', 'true');
        process.env.AUTOREACT = 'true'; // Forçage immédiat en mémoire vive

        return reply(`*🛡️ ʟᴇs ʀᴇ́ғʟᴇxᴇs ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ sᴏɴᴛ ᴀᴄᴛɪᴠᴇ́s.*\n\n${extra.phrases.footer()}`);
      }

      // Cas OFF : Désactivation
      if (opt === 'off') {
        if (!isCurrentlyOn && /^AUTOREACT=false/m.test(envContent)) {
          return reply(`*🔓 ʟᴇs ʀᴇ́ғʟᴇxᴇs ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ sᴏɴᴛ ᴅᴇ́ᴊᴀ̀ ᴇ́ᴛᴇɪɴᴛs.*`);
        }

        updateEnv('AUTOREACT', 'false');
        process.env.AUTOREACT = 'false'; // Forçage immédiat en mémoire vive

        return reply(`*🔓 ʟᴇs ʀᴇ́ғʟᴇxᴇs ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ sᴏɴᴛ ᴇ́ᴛᴇɪɴᴛs.*\n\n${extra.phrases.footer()}`);
      }

      // Cas SET BOT : Réaction seulement aux commandes
      if (opt === 'set bot') {
        if (currentMode === 'bot') {
          return reply(`*🤖 ʟᴇ ᴍᴏᴅᴇ ᴇsᴛ ᴅᴇ́ᴊᴀ̀ ᴄᴏɴғɪɢᴜʀᴇ́ sᴜʀ : ʙᴏᴛ.*`);
        }

        updateEnv('AUTOREACT_MODE', 'bot');
        process.env.AUTOREACT_MODE = 'bot';
        
        return reply(`*🤖 ᴍᴏᴅᴇ : ʀᴇ́ᴀᴄᴛɪᴏɴ ᴜɴɪǫᴜᴇᴍᴇɴᴛ ᴀᴜx ᴄᴏᴍᴍᴀɴᴅᴇs ᴅᴜ ʙᴏᴛ (⏳).*\n\n${extra.phrases.footer()}`);
      }

      // Cas SET ALL : Réaction à tous les messages
      if (opt === 'set all') {
        if (currentMode === 'all') {
          return reply(`*🌟 ʟᴇ ᴍᴏᴅᴇ ᴇsᴛ ᴅᴇ́ᴊᴀ̀ ᴄᴏɴғɪɢᴜʀᴇ́ sᴜʀ : ᴀʟʟ.*`);
        }

        updateEnv('AUTOREACT_MODE', 'all');
        process.env.AUTOREACT_MODE = 'all';
        
        return reply(`*🌟 ᴍᴏᴅᴇ : ʀᴇ́ᴀᴄᴛɪᴏɴ ᴀʟᴇ́ᴀᴛᴏɪʀᴇ ᴀ̀ ᴛᴏᴜs ʟᴇs ᴍᴇssᴀɢᴇs ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ.*\n\n${extra.phrases.footer()}`);
      }

      // Si l'argument passé ne correspond à aucune option
      const etat = isCurrentlyOn ? 'ᴀᴄᴛɪғ' : 'ɪɴᴀᴄᴛɪғ';
      reply(`*〆 ᴇ́ᴛᴀᴛ ᴀᴄᴛᴜᴇʟ :* ${etat} (ᴍᴏᴅᴇ: ${currentMode})\n*ᴜsᴀɢᴇ : ${prefix}reflexe_systeme on/off/set bot/set all*\n\n${extra.phrases.footer()}`);

    } catch (err) {
      console.error('[autoreact cmd] error:', err);
      reply('*〆 ᴜɴᴇ ᴇʀʀᴇᴜʀ ᴀ sᴄᴇʟʟᴇ́ ʟᴀ ᴍᴏᴅɪғɪᴄᴀᴛɪᴏɴ ᴅᴇs ʀᴇ́ғʟᴇxᴇs.*');
    }
  }
};
