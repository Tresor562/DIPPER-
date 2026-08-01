/**
 * Rang Command - Display user activity statistics
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 */

const { getStats } = require('../../utils/groupstats');
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
    name: 'rang',
    aliases: ['mystats', 'mymsgs', 'rank', 'myactivity'],
    category: '🛠️ Outils généraux',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀғғɪᴄʜᴇ ᴠᴏs sᴛᴀᴛɪsᴛɪǫᴜᴇs ᴅ\'ᴀᴄᴛɪᴠɪᴛᴇ ᴅᴜ ᴊᴏᴜʀ',
    usage: `${config.prefix || '.'}rang`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
        const { reply } = extra;
        const from = extra.from;
        
        // 🛡️ FORMULE MAGIQUE : On s'assure de bien lire l'ID utilisateur propre
        const rawSender = msg.key.fromMe ? (sock.user.lid || sock.user.id) : (msg.key.participant || msg.key.remoteJid);
        const sender = rawSender.split(':')[0] + '@s.whatsapp.net';

        // 👤 Récupération du nom de l'utilisateur (ou son numéro s'il n'a pas de nom public)
        const pushName = msg.pushName || sender.split('@')[0];
        const formattedName = `*${toSmallCaps(pushName)}*`;

        try {
            const stats = getStats(from);

            // Simulation ou création à la volée si le bot n'a pas encore enregistré le message
            let userCount = 0;
            let totalMessages = stats?.total || 1;

            if (stats && stats.users && stats.users[sender]) {
                userCount = stats.users[sender];
            } else {
                userCount = 1;
                if (stats && stats.users) {
                    stats.users[sender] = 1;
                }
            }

            // Calcul de la part d'activité en pourcentage
            const percentage = ((userCount / totalMessages) * 100).toFixed(1);

            // Création d'un tableau trié pour calculer le rang
            let sortedUsers = [];
            if (stats && stats.users) {
                sortedUsers = Object.entries(stats.users).sort((a, b) => b[1] - a[1]);
            } else {
                sortedUsers = [[sender, 1]];
            }

            // Recherche du rang
            let rank = sortedUsers.findIndex(([id]) => id.split(':')[0] === sender.split(':')[0]) + 1;
            if (rank === 0) rank = 1;

            const text = `*╭╼━≪• 📊 ᴠᴏᴛʀᴇ ᴀᴄᴛɪᴠɪᴛᴇ •≫━╾╮*\n` +
                         `*┃* 👤 *${toSmallCaps('utilisateur')} :* ${formattedName}\n` +
                         `*┃* 📝 *${toSmallCaps('messages envoyes')} :* ${userCount}\n` +
                         `*┃* 📈 *${toSmallCaps('part d\'activite')} :* ${percentage}%\n` +
                         `*┃* 🏆 *${toSmallCaps('rang')} :* #${rank} sur ${sortedUsers.length}\n\n` +
                         `*${toSmallCaps('continue a ecrire l\'histoire du sanctuaire')} !* 💬\n\n` +
                         extra.phrases.footer();

            await sock.sendMessage(from, {
                text,
                mentions: [sender]
            }, { quoted: msg });

        } catch (err) {
            console.error('[myactivity cmd] error:', err);
            await reply(`*❌ ${toSmallCaps('erreur lors du chargement de vos statistiques')}.*\n\n${extra.phrases.footer()}`);
        }
    }
};
