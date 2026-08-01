/**
 * Jugement_G / Test Command - 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * Évalue aléatoirement le pourcentage pour un utilisateur ciblé
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
  name: 'jugement_d',
  aliases: ['gayrate', 'jugement', 'test', 'lovetest', 'taux', 'jugement_g'],
  category: '🎮 Jeux & Fun',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀғғɪᴄʜᴇ ᴜɴ ᴘᴏᴜʀᴄᴇɴᴛᴀɢᴇ ʟᴜᴅɪǫᴜᴇ ᴇᴛ ᴀʟᴇᴀᴛᴏɪʀᴇ ᴘᴏᴜʀ ᴜɴᴇ ᴄɪʙʟᴇ',
  usage: `${prefix}jugement_g [@user ou en reponse]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const from = extra.from;

    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
      const mentioned = ctx.mentionedJid || [];
      let targetId = null;

      // Détection de la cible : mention ou réponse
      if (mentioned.length > 0) {
        targetId = mentioned[0];
      } else if (ctx.participant) {
        targetId = ctx.participant;
      } else {
        // Si personne n'est ciblé, on prend l'auteur du message
        targetId = msg.key.participant || msg.key.remoteJid;
      }

      const targetTag = `@${targetId.split('@')[0]}`;

      // Génération d'un pourcentage purement aléatoire entre 0 et 100
      const percent = Math.floor(Math.random() * 101);

      const messages = [
        // --- STYLE CYBER / HACKING ---
        `*📡 ${toSmallCaps('le scan de la matrice indique')} : ${targetTag} ${toSmallCaps('est a')} ${percent}% ${toSmallCaps('suspect')}* 🔍`,
        `*🌐 ${toSmallCaps('frequence d\'infiltration')} : ${percent}% ${toSmallCaps('de reussite pour')} ${targetTag}* ⚡`,
        `*💾 ${toSmallCaps('analyse des donnees')} : ${targetTag} ${toSmallCaps('possede un taux de')} ${percent}% ${toSmallCaps('de fichiers corrompus')}* 👾`,
        `*🔌 ${toSmallCaps('statut de la connexion')} : ${targetTag} ${toSmallCaps('est synchronise a')} ${percent}% ${toSmallCaps('avec le darknet')}* 🔌`,
        `*🛡️ ${toSmallCaps('le pare feu de')} ${targetTag} ${toSmallCaps('a ete breche a')} ${percent}%* 🔓`,

        // --- STYLE SANCTUAIRE / TÉNÈBRES ---
        `*🔮 ${toSmallCaps('sceau de l\'alchimie')} : ${targetTag} ${toSmallCaps('est a')} ${percent}% ${toSmallCaps('magifique')}* 🌈`,
        `*💖 ${toSmallCaps('compatibilite avec les arcanes')} : ${percent}% ${toSmallCaps('pour')} ${targetTag}* ✨`,
        `*☬ ${toSmallCaps('score du sanctuaire')} : ${targetTag} ${toSmallCaps('est pur a')} ${percent}% ${toSmallCaps('de splendeur')}* 💎`,
        `*🎭 ${toSmallCaps('l\'oracle des ombres estime que')} ${targetTag} ${toSmallCaps('est a')} ${percent}% ${toSmallCaps('loyal')}* 📜`,
        `*⏳ ${toSmallCaps('le sablier du destin s\'est arrete a')} ${percent}% ${toSmallCaps('pour')} ${targetTag}* ⌛`,

        // --- STYLE MANGA / PUISSANCE ---
        `*💥 ${toSmallCaps('le scouter indique que le potentiel de')} ${targetTag} ${toSmallCaps('est a')} ${percent}%* 📊`,
        `*🌀 ${toSmallCaps('taux de chakra')} : ${targetTag} ${toSmallCaps('est charge a')} ${percent}%* 🔋`,
        `*🗡️ ${toSmallCaps('la jauge de rage de')} ${targetTag} ${toSmallCaps('a atteint')} ${percent}%* 💢`,
        `*🏆 ${toSmallCaps('pourcentage d\'evolution')} : ${targetTag} ${toSmallCaps('est pret a')} ${percent}% ${toSmallCaps('pour le boss final')}* 👑`,
        `*🔥 ${toSmallCaps('limite de puissance depassée a')} ${percent}% ${toSmallCaps('par')} ${targetTag}* 🌋`,

        // --- STYLE HUMOUR / TROLL ---
        `*🤡 ${toSmallCaps('le detecteur de clown affiche')} ${percent}% ${toSmallCaps('pour')} ${targetTag}* 🎪`,
        `*🤤 ${toSmallCaps('taux de fatigue mentale')} : ${targetTag} ${toSmallCaps('est sature a')} ${percent}%* 🧠`,
        `*🍺 ${toSmallCaps('le taux d\'alcoolemie virtuel de')} ${targetTag} ${toSmallCaps('est de')} ${percent}%* 🍹`,
        `*🧩 ${toSmallCaps('probabilite que')} ${targetTag} ${toSmallCaps('raconte n\'importe quoi')} : ${percent}%* 📣`,
        `*🦥 ${toSmallCaps('niveau de flemme de')} ${targetTag} ${toSmallCaps('detecte a')} ${percent}%* 🛏️`,

        // --- BONUS GAYRATE (REVISITÉ) ---
        `*🏳️‍🌈 ${toSmallCaps('gayrate scanner')} : ${targetTag} ${toSmallCaps('est')} ${percent}% ${toSmallCaps('gay')}* 🌈`,
        `*🦄 ${toSmallCaps('le radar arc en ciel a repere')} ${targetTag} ${toSmallCaps('a')} ${percent}%* 🏳️‍🌈`,
        `*💅 ${toSmallCaps('le barometre du style et de l\'attitude pour')} ${targetTag} ${toSmallCaps('est a')} ${percent}%* 💖`,
        `*🌈 ${toSmallCaps('l\'aura de')} ${targetTag} ${toSmallCaps('brille a')} ${percent}% ${toSmallCaps('de couleurs pastel')}* ✨`,
        `*💌 ${toSmallCaps('potentiel de seduction universelle pour')} ${targetTag} : ${percent}%* 🥰`
      ];

      // Sélection d'une phrase d'ambiance au hasard
      const out = messages[Math.floor(Math.random() * messages.length)];

      await sock.sendMessage(from, { 
        text: `${out}\n\n${extra.phrases.footer()}`, 
        mentions: [targetId] 
      }, { quoted: msg });

    } catch (error) {
      console.error('[gayrate] ERROR:', error);
      await reply(`*❌ ${toSmallCaps('l\'invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
