/**
 * Destin Command - 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * Lie deux âmes au hasard ou spécifiques pour voir leur destin.
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

const prefix = config.prefix || '.';

module.exports = {
  name: 'destin',
  aliases: ['match', 'ship', 'lier'],
  category: '🎮 Jeux & Fun',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʟɪᴇ ᴅᴇᴜx ᴀᴍᴇs ᴀᴜ ʜᴀsᴀʀᴅ ᴏᴜ sᴘᴇᴄɪғɪǫᴜᴇs ᴘᴏᴜʀ ᴠᴏɪʀ ʟᴇᴜʀ ᴅᴇsᴛɪɴ',
  usage: `${prefix}destin [@user1 @user2 ou en reponse]`,
  groupOnly: true,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const from = extra.from;

    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
      const mentioned = ctx.mentionedJid || [];
      let a = null;
      let b = null;

      // Récupération des membres du groupe (selon l'architecture de ton bot)
      const groupMetadata = await sock.groupMetadata(from);
      const participants = groupMetadata.participants.map(p => p.id);
      
      // Exclusion du bot de la liste des cobayes
      const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const validParticipants = participants.filter(id => id !== botId);

      // 1. Détection des cibles
      if (mentioned.length >= 2) {
        // Deux mentions : on lie les deux cités
        a = mentioned[0];
        b = mentioned[1];
      } else if (mentioned.length === 1) {
        // Une seule mention : lier la personne citée avec l'auteur
        a = mentioned[0];
        b = msg.key.participant || msg.key.remoteJid;
      } else if (ctx.participant) {
        // Réponse à un message : lier l'auteur du message cité avec l'auteur de la commande
        a = ctx.participant;
        b = msg.key.participant || msg.key.remoteJid;
      } else {
        // Aucune mention ni réponse : sélection de 2 membres au hasard dans le groupe
        if (validParticipants.length >= 2) {
          const shuffled = validParticipants.sort(() => Math.random() - 0.5);
          a = shuffled[0];
          b = shuffled[1];
        } else {
          return reply(`*⚠️ ${toSmallCaps('pas assez de membres valides dans ce sanctuaire')} !*`);
        }
      }

      // Sécurité si l'auteur s'auto-cible d'une manière ou d'une autre
      if (a === b) {
        return reply(`*⚠️ ${toSmallCaps('tu ne peux pas lier ton ame a elle meme, narcissique')} !*`);
      }

      // Formatage du tag
      const nameOf = id => `@${id.split('@')[0]}`;

      // Création d'un pourcentage déterministe basé sur les IDs
      const seed = (a + b).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
      const love = Math.abs((seed * 7) % 101); // 0-100

      const hearts = ['💖', '💕', '💘', '💞', '💓', '🖤'];
      const heart = hearts[Math.floor(Math.random() * hearts.length)];

      // Les oracles du destin revus (Style Ghost)
      const phrases = [
        `*🔮 ${toSmallCaps('l\'alchimie a parle')} :*\n\n` +
        `*⚡ ${nameOf(a)} + ${nameOf(b)} = ${love}% ${heart}*\n\n` +
        `*${toSmallCaps('leurs auras semblent s\'accorder dans la matrice')} !*`,

        `*🔮 ${toSmallCaps('vision des abysses')} :*\n\n` +
        `*⚡ ${nameOf(a)} x ${nameOf(b)} = ${love}% ${heart}*\n\n` +
        `*${toSmallCaps('les sceaux digitaux sont en train de se meler')}...*`,

        `*🔮 ${toSmallCaps('oracle des ames')} :*\n\n` +
        `*⚡ ${toSmallCaps('compatibilite')} : ${love}% ${heart} ${toSmallCaps('entre')} ${nameOf(a)} ${toSmallCaps('et')} ${nameOf(b)}*\n\n` +
        `*📜 ${toSmallCaps('sentence')} :* ${love > 75 ? `*${toSmallCaps('une liaison sacree et codee')} ❤️*` : love > 40 ? `*${toSmallCaps('un pacte d\'alliance possible')} 🤝*` : `*${toSmallCaps('un pur chaos de donnees corrompues')} 💀*`}`
      ];

      const out = phrases[Math.floor(Math.random() * phrases.length)];
      const finalMessage = `${out}\n\n${extra.phrases.footer()}`;

      await sock.sendMessage(from, { 
        text: finalMessage, 
        mentions: [a, b] 
      }, { quoted: msg });

    } catch (error) {
      console.error('[ship] ERROR:', error);
      await reply(`*❌ ${toSmallCaps('le destin a ete scelle par une erreur')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
