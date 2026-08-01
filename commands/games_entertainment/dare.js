/**
 * Defis
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
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
  name: 'epreuve',
  aliases: ['dare', 'defi', 'defis', 'épreuve'],
  category: '🎮 Jeux & Fun',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴇxɪɢᴇ ᴜɴ ᴅᴇғɪ ᴏᴜ ᴜɴᴇ ᴇᴘʀᴇᴜᴠᴇ ᴀᴜᴛʜᴇɴᴛɪǫᴜᴇ ᴀ ᴜɴ ᴍᴇᴍʙʀᴇ',
  usage: `${prefix}epreuve [@user ou en reponse]`,
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

      const dares = [
        // --- CLASSIQUES DU SANCTUAIRE ---
        `*${targetTag} ${toSmallCaps('envoie une capture d\'ecran de ta galerie secrete')} !* 📸`,
        `*${targetTag} ${toSmallCaps('laisse un allie ecrire ton status whatsapp')} !* ✍🏾`,
        `*${targetTag} ${toSmallCaps('appelle un contact au hasard et chante lui une incantation')} !* 📞`,
        `*${targetTag} ${toSmallCaps('publie un selfie genant dans le sanctuaire')} !* 🎭`,
        `*${targetTag} ${toSmallCaps('ecris a ton crush et confesse tes sentiments')} !* 💌`,
        `*${targetTag} ${toSmallCaps('fais')} 20 ${toSmallCaps('pompes et envoie la preuve en video')} !* 💪`,
        `*${targetTag} ${toSmallCaps('change ta photo de profil pour une image ridicule pendant')} 24 ${toSmallCaps('heures')} !* 🖼️`,
        `*${targetTag} ${toSmallCaps('envoie une note vocale ou tu chantes l\'alphabet')} !* 🎶`,
        `*${targetTag} ${toSmallCaps('laisse le groupe choisir ton status pour la journee')} !* 📜`,
        `*${targetTag} ${toSmallCaps('raconte au groupe ton moment le plus embarrassant')} !* 😳`,
        `*${targetTag} ${toSmallCaps('partage les')} 5 ${toSmallCaps('dernieres recherches de ton oracle google')} !* 🔍`,
        `*${targetTag} ${toSmallCaps('danse devant tout le monde pendant')} 1 ${toSmallCaps('minute')} !* 💃`,
        `*${targetTag} ${toSmallCaps('imite un membre du sanctuaire de ton mieux')} !* 🗣️`,
        `*${targetTag} ${toSmallCaps('parle avec un accent etrange pendant les')} 10 ${toSmallCaps('prochaines minutes')} !* 🌍`,
        `*${targetTag} ${toSmallCaps('publie une story disant')} 'ᴊ'ᴀɪ ᴘᴇʀᴅᴜ ᴜɴ ᴘᴀʀɪ' ${toSmallCaps('pendant')} 24 ${toSmallCaps('heures')} !* 🃏`,
        `*${targetTag} ${toSmallCaps('laisse une personne fouiller ton telephone pendant')} 2 ${toSmallCaps('minutes')} !* 📱`,
        `*${targetTag} ${toSmallCaps('envoie un message de seduction a un contact au hasard')} !* 😏`,
        `*${targetTag} ${toSmallCaps('execute')} 50 ${toSmallCaps('jumping jacks')} !* 🤸`,
        `*${targetTag} ${toSmallCaps('raconte une blague. si personne ne rit, tu dois subir un autre defi')} !* 🃏`,
        `*${targetTag} ${toSmallCaps('enregistre toi en train de faire une danse tiktok')} !* 🎬`,

        // --- NOUVELLES ÉPREUVES STYLE GHOST (TÉNÉBREUX / CYBER / EXTRÊME) ---
        `*${targetTag} ${toSmallCaps('balance un dossier ou un secret inavouable sur un membre actif')} !* 📂`,
        `*${targetTag} ${toSmallCaps('envoie un vocal ou tu cries de toutes tes forces comme un possede')} !* 🗣️`,
        `*${targetTag} ${toSmallCaps('envoie une photo de l\'ecran de verrouillage de ton sanctuaire')} !* 📱`,
        `*${targetTag} ${toSmallCaps('avoue ici qui est la personne que tu aimes le plus en secret dans ce groupe')} !* 👀`,
        `*${targetTag} ${toSmallCaps('envoie une photo de tes pieds sans poser de question')} !* 🦶`,
        `*${targetTag} ${toSmallCaps('fais une capture d\'ecran de ton historique d\'appels et balance la')} !* 📞`,
        `*${targetTag} ${toSmallCaps('envoie un message prive a un admin pour lui dire que tu l\'aimes en secret')} !* 🔥`,
        `*${targetTag} ${toSmallCaps('supprime le dernier message que tu as envoye dans ton autre groupe actif')} !* 🗑️`,
        `*${targetTag} ${toSmallCaps('envoie une photo actuelle de ton visage sans aucun filtre')} !* 📸`,
        `*${targetTag} ${toSmallCaps('ecris une declaration d\'amour enflammee au bot et mentionne la')} !* 🤖`,
        `*${targetTag} ${toSmallCaps('avoue quelle est la pire connerie que tu as faite sur whatsapp')} !* 🙊`,
        `*${targetTag} ${toSmallCaps('envoie un screenshot de tes discussions epinglees')} !* 📌`,
        `*${targetTag} ${toSmallCaps('propose un duel au jeu de la bombe a l\'allie de ton choix')} !* 💣`,
        `*${targetTag} ${toSmallCaps('envoie un vocal ou tu imites le bruit d\'un animal pendant')} 15 ${toSmallCaps('secondes')} !* 🦁`,
        `*${targetTag} ${toSmallCaps('ecris un pave pour clasher gentiment le createur du groupe')} !* ⚔️`,
        `*${targetTag} ${toSmallCaps('partage ton pourcentage de batterie actuel, si t\'es sous les')} 20% ${toSmallCaps('tu dois faire un gage')} !* 🔋`,
        `*${targetTag} ${toSmallCaps('ecris un message codé dans le groupe et laisse les autres deviner')} !* 🧩`,
        `*${targetTag} ${toSmallCaps('fais une capture de ta liste de contacts bloques et montre la')} !* 🚫`,
        `*${targetTag} ${toSmallCaps('envoie la derniere photo que tu as recue d\'un ami')} !* 📥`,
        `*${targetTag} ${toSmallCaps('vends ton ame a ghostg x en lui jurant fidelite absolue par ecrit')} !* 📜`
      ];

      const randomDare = dares[Math.floor(Math.random() * dares.length)];

      await sock.sendMessage(from, {
        text: `${randomDare}\n\n${extra.phrases.footer()}`,
        mentions: [targetId]
      }, { quoted: msg });

    } catch (error) {
      console.error('Dare Error:', error);
      await reply(`*❌ ${toSmallCaps('l\'invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
