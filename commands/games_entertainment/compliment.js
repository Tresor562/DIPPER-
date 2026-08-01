/**
 * Compliment 
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

const prefix = config.prefix || '.';

module.exports = {
  name: 'louange',
  aliases: ['praise', 'compliment'],
  category: '🎮 Jeux & Fun',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴅʀᴇssᴇ ᴜɴᴇ ʟᴏᴜᴀɴɢᴇ ᴏᴜ ᴜɴ ᴄᴏᴍᴘʟɪᴍᴇɴᴛ ᴀᴜᴛʜᴇɴᴛɪǫᴜᴇ',
  usage: `${prefix}louange [@user ou en reponse]`,
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

      const compliments = [
        // --- CLASSIQUES DU SANCTUAIRE ---
        `*${targetTag} ${toSmallCaps('tu es un allie d\'exception dans ce sanctuaire')} !* 💙`,
        `*${targetTag} ${toSmallCaps('ta presence illumine les arcanes de l\'ombre')} !* ✨`,
        `*${targetTag} ${toSmallCaps('tu es l\'embleme d\'un sourire vivant')} !* 😊`,
        `*${targetTag} ${toSmallCaps('ta valeur surpasse celle des creatures legendaires')} !* 🦄`,
        `*${targetTag} ${toSmallCaps('tu es un bienfait pour ceux qui t\'entourent')} !* 🎁`,
        `*${targetTag} ${toSmallCaps('ton esprit est aussi vif qu\'une lame sacree')} !* 🍪`,
        `*${targetTag} ${toSmallCaps('ta grandeur est incontestable')} !* 🌟`,
        `*${targetTag} ${toSmallCaps('ton rire est l\'echo le plus harmonieux')} !* 😄`,
        `*${targetTag} ${toSmallCaps('ta splendeur est a couper le souffle')} !* 💖`,
        `*${targetTag} ${toSmallCaps('ta bienveillance est un pilier pour nous tous')} !* 🤝`,
        `*${targetTag} ${toSmallCaps('ton sens de l\'humour est un veritable tresor')} !* 😂`,
        `*${targetTag} ${toSmallCaps('tu es un etre d\'une rarete exceptionnelle')} !* ⭐`,
        `*${targetTag} ${toSmallCaps('ton amitie est un sceau inviolable')} !* 🫂`,
        `*${targetTag} ${toSmallCaps('ta perspective est un souffle de vie rafraichissant')} !* 🌈`,
        `*${targetTag} ${toSmallCaps('tu accomplis des pieds d\'alchimie chaque jour')} !* 🌍`,
        `*${targetTag} ${toSmallCaps('ta force interieure est une forge interplanetaire')} !* 💪🏾`,
        `*${targetTag} ${toSmallCaps('ton sourire est une invocation a la joie')} !* 😁`,
        `*${targetTag} ${toSmallCaps('tu es un joyau unique dans l\'ecrin de l\'univers')} !* 💎`,
        `*${targetTag} ${toSmallCaps('tu eveilles le meilleur en chaque ame')} !* 👏🏾`,
        `*${targetTag} ${toSmallCaps('tu es une source d\'inspiration eternelle')} !* 🌟`,

        // --- NOUVELLES LOUANGES STYLE GHOST (TÉNÉBREUX / CYBER / MANGA) ---
        `*${targetTag} ${toSmallCaps('ton aura est si puissante que meme les ombres s\'ecartent sur ton passage')}.* 👤`,
        `*${targetTag} ${toSmallCaps('tu as l\'esprit d\'un hacker d\'elite, tu trouves toujours une solution')}.* 💻`,
        `*${targetTag} ${toSmallCaps('ta loyaute envers le sanctuaire depasse celle des plus grands chevaliers')}.* ⚔️`,
        `*${targetTag} ${toSmallCaps('tu es l\'element le plus stable et le plus precieux de notre matrice')}.* 🌐`,
        `*${targetTag} ${toSmallCaps('ta sagesse rivalise avec celle des anciens grimoires de l\'oracle')}.* 📚`,
        `*${targetTag} ${toSmallCaps('ton energie est une source d\'alimentation infinie pour le groupe')}.* 🔋`,
        `*${targetTag} ${toSmallCaps('tu possedes la determination d\'un protagoniste de shonen, rien ne t\'arrete')}.* 💥`,
        `*${targetTag} ${toSmallCaps('tu es le gardien d\'une lumiere pure au fond de ce monde digital')}.* 🕯️`,
        `*${targetTag} ${toSmallCaps('ton intelligence brise n\'importe quel chiffrement ou barriere')}.* 🔐`,
        `*${targetTag} ${toSmallCaps('tu es le membre que tous les serveurs reveraient d\'avoir dans leur base de donnees')}.* 🗃️`,
        `*${targetTag} ${toSmallCaps('ton charisme naturel genere un bouclier impenetrable contre la negativite')}.* 🛡️`,
        `*${targetTag} ${toSmallCaps('ta patience et ton ecoute sont les artefacts les plus precieux ici')}.* 🏺`,
        `*${targetTag} ${toSmallCaps('tu es un titan digital, ta force n\'a d\'egale que ta modestie')}.* 🏛️`,
        `*${targetTag} ${toSmallCaps('tu as une faculte d\'adaptation digne des meilleures intelligences artificielles')}.* 🧠`,
        `*${targetTag} ${toSmallCaps('ta vibe positive purifie n\'importe quel salon corrompu par le chaos')}.* 🌌`,
        `*${targetTag} ${toSmallCaps('tu es le createur de tendances, l\'architecte de notre bonne humeur')}.* 📐`,
        `*${targetTag} ${toSmallCaps('ton sens du style est si aiguise qu\'il pourrait trancher l\'espace temps')}.* 🚀`,
        `*${targetTag} ${toSmallCaps('tu es la preuve vivante qu\'on peut etre a la fois redoutable et bienveillant')}.* ☯️`,
        `*${targetTag} ${toSmallCaps('meme sans acces root, tu imposes le respect par ta simple presence')}.* 💯`,
        `*${targetTag} ${toSmallCaps('tu es le chef d\'oeuvre inacheve que l\'univers prend plaisir a peaufiner')}.* 🎨`
      ];

      const randomCompliment = compliments[Math.floor(Math.random() * compliments.length)];

      await sock.sendMessage(from, {
        text: `${randomCompliment}\n\n${extra.phrases.footer()}`,
        mentions: [targetId]
      }, { quoted: msg });

    } catch (error) {
      console.error('Compliment Error:', error);
      await reply(`*❌ ${toSmallCaps('l\'invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
