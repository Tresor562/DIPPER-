/**
 * Eveil - Display bot uptime since it was started
 * 𝐃𝐚𝐫𝐤 Edition
 */

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

/**
 * Format time difference into human-readable string
 * @param {number} seconds - Total seconds of uptime
 * @returns {string} Formatted uptime string
 */
function formatUptime(seconds) {
  if (seconds <= 0) {
    return `0 ${toSmallCaps('seconde')}`;
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];

  if (days > 0) {
    parts.push(`${days} ${toSmallCaps(days === 1 ? 'jour' : 'jours')}`);
  }
  if (hours > 0) {
    parts.push(`${hours} ${toSmallCaps(hours === 1 ? 'heure' : 'heures')}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} ${toSmallCaps(minutes === 1 ? 'minute' : 'minutes')}`);
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs} ${toSmallCaps(secs === 1 ? 'seconde' : 'secondes')}`);
  }

  return parts.join(', ');
}

module.exports = {
  name: 'eveil',
  aliases: ['runtime', 'uptime', 'alive', 'éveil', 'up', 'ev', 'év'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀғғɪᴄʜᴇ ʟᴇ ᴛᴇᴍᴘs ᴅᴇᴘᴜɪs ʟᴇǫᴜᴇʟ ʟᴇ ʙᴏᴛ ᴇsᴛ ᴇᴠᴇɪʟʟᴇ',
  usage: `${config.prefix || '.'}eveil`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;

    try {
      // Récupération de l'uptime du processus en secondes
      const uptimeSeconds = process.uptime();
      const uptime = formatUptime(uptimeSeconds);

      // Informations d'identité du bot
      const botName = config.botName || 'ɢʜᴏsᴛɢ 𝐗';
      const botVersion = '1.0.0';

      // Construction du message d'éveil
      const message = 
          `*╭╼━≪• ⏳ ᴇɢʀᴇɢᴏʀᴇ ᴅ'ᴇᴠᴇɪʟ •≫━╾╮*\n` +
          `*┃* 🤖 *${toSmallCaps('nom')} :* ${toSmallCaps(botName)}\n` +
          `*┃* 🧬 *${toSmallCaps('version')} :* ${botVersion}\n` +
          `*┃* ⏱️ *${toSmallCaps('eveil')} :* ${uptime}\n\n` +
            `_♛ ${toSmallCaps('jesus est roi 𓆩✞𓆪 ')}_\n\n` +
                        extra.phrases.footer();
      await reply(message);

    } catch (error) {
      console.error('Error in uptime command:', error);
      await reply(
        `*❌ ${toSmallCaps('echec de la sonde')}*\n\n` +
        `*┃* 🥀 *${toSmallCaps('impossible de lire le temps deveil')}*\n` +
        `*┃* ⚠️ *${toSmallCaps('erreur')} :* ${error.message}\n\n` +
        extra.phrases.footer()
      );
    }
  }
};
