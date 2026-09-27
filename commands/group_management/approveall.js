/**
 * ApproveAll Command - Approve all pending join requests
 */

const config = require('../../config.js');

// Extraction du préfixe pour l'usage
const prefix = config.prefix || '.';

// Fonction pour le style Small Caps (Garde la cohérence visuelle)
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
  name: 'approveall',
  aliases: ['acceptall', 'approuvertout', 'ᴀᴘᴘʀᴏᴠᴇᴀʟʟ'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴘᴘʀᴏᴜᴠᴇ ᴛᴏᴜᴛᴇs ʟᴇs ᴅᴇᴍᴀɴᴅᴇs ᴅ\'ᴀᴅʜᴇ́sɪᴏɴ ᴇɴ ᴀᴛᴛᴇɴᴛᴇ',
  usage: `${prefix}approveall`,
  groupOnly: true,
  adminOnly: false, // On laisse le traitement manuel ci-dessous pour inclure les Maîtres
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin } = extra;

    try {
      // 🛡️ SÉCURITÉ GÉRÉE PAR LE HANDLER
      // isOwner est directement extrait par le Handler et te donne les pleins pouvoirs
      const isMe = msg.key.fromMe || isOwner;

      // 🚨 ÉVALUATION DES DROITS
      if (!isMe && !isAdmin) {
        return reply(`*❌ ${toSmallCaps('cette commande est reservee aux administrateurs du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      const chatId = msg.key.remoteJid;

      await reply('*☬ ɪɴᴠᴏᴄᴀᴛɪᴏɴ : ʀᴇᴄʜᴇʀᴄʜᴇ ᴅᴇs ᴀ̂ᴍᴇs ᴇɴ ᴀᴛᴛᴇɴᴛᴇ...*');

      // Récupération des requêtes en attente
      const pendingList = await sock.groupRequestParticipantsList(chatId);

      if (!pendingList || pendingList.length === 0) {
        return reply(`❌ *${toSmallCaps('aucune demande d adhesion en attente dans le sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      const totalRequests = pendingList.length;

      // Approbation séquentielle : une requête à la fois pour éviter les
      // rafales d'actions administratives.
      const APPROVE_PAUSE_MS = 3000;
      let approved = 0;
      let failed = 0;

      for (let i = 0; i < pendingList.length; i++) {
        const jid = pendingList[i]?.jid;
        if (!jid) continue;
        try {
          await sock.groupRequestParticipantsUpdate(chatId, [jid], 'approve');
          approved++;
        } catch (err) {
          failed++;
          console.warn(`[approveall] échec ${jid}: ${err?.message || err}`);
        }
        if (i + 1 < pendingList.length) {
          await new Promise(resolve => setTimeout(resolve, APPROVE_PAUSE_MS));
        }
      }

      // Succès
      await sock.sendMessage(chatId, {
        text: `📈 *${approved}/${totalRequests} ᴀ̂ᴍᴇs ᴏɴᴛ ᴇ́ᴛᴇ́ ᴀᴘᴘʀᴏᴜᴠᴇ́ᴇs.*${failed ? `\n⚠️ ${failed} échec(s).` : ''}\n\n${extra.phrases.footer()}`,
      }, { quoted: msg });

    } catch (error) {
      await reply(`❌ *ᴇʀʀᴇᴜʀ :* ${error.message}\n\n${extra.phrases.footer()}`);
    }
  }
};
