/**
 * Group Info Command - Display group information
 * 𝐃𝐚𝐫𝐤 Edition
 */

// On importe ton fichier de config à la racine pour le botName si besoin
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
    name: 'sanctuaire',
    // Ajout de 'groupinfo', 'info', 'ginfo' et 'sanctuaire' en texte brut pour assurer la réactivité !
    aliases: ['info', 'ginfo', 'groupinfo', 'i'],
    category: '🛠️ Outils généraux',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀғғɪᴄʜᴇ ʟᴇs ɪɴғᴏʀᴍᴀᴛɪᴏɴs ᴅᴜ ɢʀᴏᴜᴘᴇ ᴇᴛ ᴅᴇ sᴏɴ ᴄʀᴇᴀᴛᴇᴜʀ',
    usage: `${config.prefix || '.'}sanctuaire`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply } = extra;

      try {
        const metadata = extra.groupMetadata;

        const admins = metadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');

        // Récupération de l'ID du créateur (Fallback robuste)
        const creatorId = metadata.owner || metadata.id.split('-')[0] + '@s.whatsapp.net';
        const creatorTag = `@${creatorId.split('@')[0]}`;

        let text = `*╭╼━≪• 🔮 ɪɴғᴏs sᴀɴᴄᴛᴜᴀɪʀᴇ •≫━╾╮*\n` +
                   `*┃* 🏷️ *${toSmallCaps('nom')} :* ${metadata.subject}\n` +
                   `*┃* 🆔 *${toSmallCaps('id')} :* ${metadata.id}\n` +
                   `*┃* 👤 *${toSmallCaps('proprietaire du sanctuaire')} :* ${creatorTag}\n` +
                   `*┃* 👥 *${toSmallCaps('individus')} :* ${metadata.participants.length}\n` +
                   `*┃* 👑 *${toSmallCaps('gardiens')} :* ${admins.length}\n` +
                   `*┃* 📝 *${toSmallCaps('description')} :* ${metadata.desc || toSmallCaps('aucune description')}\n` +
                   `*┃* 🔒 *${toSmallCaps('restreint')} :* ${metadata.restrict ? 'ᴏᴜɪ' : 'ɴᴏɴ'}\n` +
                   `*┃* 📢 *${toSmallCaps('annonces seules')} :* ${metadata.announce ? 'ᴏᴜɪ' : 'ɴᴏɴ'}\n` +
                   `*┃* 📅 *${toSmallCaps('creation')} :* ${new Date(metadata.creation * 1000).toLocaleDateString()}\n\n` +
                   `*👑 ${toSmallCaps('liste des gardiens')} :*\n`;

        admins.forEach((admin, index) => {
          text += `*┃* ${index + 1}. @${admin.id.split('@')[0]}\n`;
        });

        text += `\n_𓆩✞𓆪 ᴊᴇsᴜs ᴇsᴛ ʀᴏɪ ᴅᴇ ᴄᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ ♛\n\n` +
                extra.phrases.footer();

        // Fusion des admins et du créateur dans le tableau des mentions
        const allMentions = admins.map(a => a.id);
        if (!allMentions.includes(creatorId)) {
            allMentions.push(creatorId);
        }

        await sock.sendMessage(extra.from, {
          text,
          mentions: allMentions
        }, { quoted: msg });

      } catch (error) {
        console.error('Sanctuaire command error:', error);
        await reply(`*❌ ${toSmallCaps('erreur')} :* ${error.message}\n\n${extra.phrases.footer()}`);
      }
    }
};
