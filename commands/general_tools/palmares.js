/**
 * Leaderboard Command - Display group daily statistics
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
    name: 'palmares',
    aliases: ['stats', 'leaderboard', 'gstats', 'topmembers', 'msgs', 'messagestats', 'palmarès'],
    category: '🛠️ Outils généraux',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀғғɪᴄʜᴇ ʟᴇs sᴛᴀᴛɪsᴛɪǫᴜᴇs ᴅᴇ ᴅɪsᴄᴜssɪᴏɴ ᴅᴜ ɢʀᴏᴜᴘᴇ ᴘᴏᴜʀ ʟᴀ ᴊᴏᴜʀɴᴇᴇ',
    usage: `${config.prefix || '.'}palmares`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
        const { reply } = extra;
        const prefix = config.prefix || '.';

        try {
            const from = extra.from;
            const stats = getStats(from);

            // Vérification si des statistiques existent et s'il y a des utilisateurs enregistrés
            if (!stats || !stats.users || Object.keys(stats.users).length === 0) {
                return reply(`📊 *${toSmallCaps('aucune activite n\'a ete enregistree aujourd\'hui')}.*\n\n_👑 ${toSmallCaps('jesus est roi')}_\n\n${extra.phrases.footer()}`);
            }

            const { total, users } = stats;

            // Top 5 des membres les plus actifs
            const sortedUsers = Object.entries(users)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            // Formulation du texte pour le top 5
            let topText = sortedUsers.length > 0
                ? sortedUsers.map(([id, count], i) => `*┃* ${i + 1}. @${id.split('@')[0]} — *${count} msgs*`).join('\n')
                : `*┃* ${toSmallCaps('aucun individu actif pour le moment')}.`;

            const text = `*╭╼━≪• ᴘᴀʟᴍᴀʀᴇ̀s ᴅᴜ ᴊᴏᴜʀ •≫━╾╮*\n` +
                         `*┃* 📌 *${toSmallCaps('total des messages')} :* ${total}\n` +
                         `*👥 ${toSmallCaps('les scribes les plus actifs')} :*\n` +
                         `${topText}\n\n` +
                         `*💡 ${toSmallCaps('tape')} \`${prefix}rang\` ${toSmallCaps('pour voir vos statistiques personnelles')}.*\n\n` +
                         `_👑 ${toSmallCaps('jesus est roi')}_\n\n` +
                         extra.phrases.footer();

            await sock.sendMessage(from, {
                text,
                mentions: sortedUsers.map(u => u[0])
            }, { quoted: msg });

        } catch (err) {
            console.error('[groupstats cmd] error:', err);
            await reply(`*❌ ${toSmallCaps('erreur lors du chargement des statistiques')}.*\n\n${extra.phrases.footer()}`);
        }
    }
};
