/**
 * Malédiction- Donne une insulte hilarante à un utilisateur 
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
  name: 'malediction',
  aliases: ['insulte', 'insultelui', 'burn', 'insult', 'insulter', 'maled_accent', 'malédiction'],
  category: '🎮 Jeux & Fun',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʟᴀɴᴄᴇ ᴜɴᴇ ᴍᴀʟᴇᴅɪᴄᴛɪᴏɴ ᴏᴜ ᴜɴᴇ ᴘᴜɴᴄʜʟɪɴᴇ ʀɪᴅɪᴄᴜʟᴇ ᴀ ᴜɴ ᴍᴇᴍʙʀᴇ',
  usage: `${prefix}malediction [@user ou en reponse]`,
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

      if (mentioned.length) {
        targetId = mentioned[0];
      } else if (ctx.participant) {
        targetId = ctx.participant;
      } else {
        targetId = extra.sender;
      }

      const targetTag = `@${targetId.split('@')[0]}`;

      const insults = [
        // --- CLASSIQUES DU SANCTUAIRE ---
        `*${targetTag} ${toSmallCaps('ta tete ressemble a celle d\'un milliardaire')}... ${toSmallCaps('mais sans les sous')} !* 💸`,
        `*${targetTag} ${toSmallCaps('tu as la chance que jesus soit dans ma vie, sinon')}...* 😤`,
        `*${targetTag} ${toSmallCaps('ton intelligence est comme un crayon blanc : totalement inutile')}.* 🖍️`,
        `*${targetTag} ${toSmallCaps('je t\'aurais bien dit que tu es une lumiere, mais je ne veux pas offenser les ampoules')}.* 💡`,
        `*${targetTag} ${toSmallCaps('tu es comme un nuage. quand tu disparais, la journee devient magnifique')}.* ☀️`,
        `*${targetTag} ${toSmallCaps('tu apportes tellement de joie a tout le monde')}... ${toSmallCaps('quand tu quittes le sanctuaire')}.* 🚪`,
        `*${targetTag} ${toSmallCaps('si la paresse etait un sport olympique, tu serais quatrieme')}... ${toSmallCaps('pour ne pas avoir a monter sur le podium')} !* 🥉`,
        `*${targetTag} ${toSmallCaps('tu es le genre de personne qui a besoin de lire la notice pour manger un chocolat')}.* 🍫`,
        `*${targetTag} ${toSmallCaps('ton cerveau est en stand by depuis la creation du monde')}.* 💤`,
        `*${targetTag} ${toSmallCaps('tu es la preuve vivante que le cerveau est un organe extremement separe de la bouche')}.* 🧠`,
        `*${targetTag} ${toSmallCaps('tu es aussi utile qu\'une porte sur une moto')}.* 🏍️`,
        `*${targetTag} ${toSmallCaps('si la betise se mesurait en kilometres, tu serais le spatiodrome')}.* 🚀`,
        `*${targetTag} ${toSmallCaps('je pensais que le vide absolu n\'existait que dans l\'espace, jusqu\'a ce que je te voie')}.* 🌌`,
        `*${targetTag} ${toSmallCaps('si tu sautais du haut de ton ego jusqu\'a ton iq, tu te ferais tres mal')}.* 📉`,
        `*${targetTag} ${toSmallCaps('ton style est aussi raffine qu\'une paire de sabots en plastique au sanctuaire')}.* 👡`,
        `*${targetTag} ${toSmallCaps('tu es la seule ame capable de faire surchauffer une calculatrice pour faire')} 1+1.* 🧮`,
        `*${targetTag} ${toSmallCaps('tes idees sont comme des fichiers corrompus : inouvrables et sans valeur')}.* 📁`,
        `*${targetTag} ${toSmallCaps('tu as un grand talent pour parler pendant des heures sans jamais rien dire')}.* 🗣️`,

        // --- NOUVELLES MALÉDICTIONS STYLE GHOST (CYBER / TÉNÉBREUX / SARCASTIQUE) ---
        `*${targetTag} ${toSmallCaps('tu es la seule personne que je connaisse dont le processeur tourne a')} 2Hz.* 🐢`,
        `*${targetTag} ${toSmallCaps('ton charisme est en maintenance depuis la version beta')} 1.0.* 🛠️`,
        `*${targetTag} ${toSmallCaps('tu es un bug que meme les pires hackers refusent de copier coller')}.* 👾`,
        `*${targetTag} ${toSmallCaps('ta logique ressemble a du code ecrit par un bot bourre')}... ${toSmallCaps('c\'est incomprehensible')}.* 🤖`,
        `*${targetTag} ${toSmallCaps('meme avec les droits root, tu n\'arriverais pas a faire marcher ton bon sens')}.* 🔓`,
        `*${targetTag} ${toSmallCaps('tu es comme un lien de phishing : tout le monde sait que t\'es faux mais tu tentes quand meme')}.* 🔗`,
        `*${targetTag} ${toSmallCaps('si le ridicule tuait, tu serais deja supprime de la base de donnees')}.* 🗑️`,
        `*${targetTag} ${toSmallCaps('ton aura est tellement sombre que meme le dark mode refuse de s\'y associer')}.* 🖤`,
        `*${targetTag} ${toSmallCaps('tu as autant de conversation qu\'un captcha en panne')}.* 🧩`,
        `*${targetTag} ${toSmallCaps('tu es l\'erreur')} 404 ${toSmallCaps('du genie humain : introuvable')}.* 🚫`,
        `*${targetTag} ${toSmallCaps('ton cerveau a une memoire ram de poisson rouge, et encore je suis gentil')}.* 🐠`,
        `*${targetTag} ${toSmallCaps('tu passes tellement inapercu que meme les bots t\'oublient dans leurs scans')} !* 📊`,
        `*${targetTag} ${toSmallCaps('ton sens de l\'orientation est tellement naze que tu te perdrais dans un groupe de')} 2 ${toSmallCaps('personnes')}.* 🗺️`,
        `*${targetTag} ${toSmallCaps('tu as autant d\'impact sur ce groupe qu\'un message supprime pour tout le monde')}.* 📩`,
        `*${targetTag} ${toSmallCaps('tu es la version d\'essai gratuite que personne ne veut jamais upgrader')}.* 📉`,
        `*${targetTag} ${toSmallCaps('si tu etais un pnj de jeu video, tu serais celui qui marche contre les murs')}.* 🧱`,
        `*${targetTag} ${toSmallCaps('tu as ete concu avec les pieds et developpe sans aucune logique')}.* 👣`,
        `*${targetTag} ${toSmallCaps('tu n\'es pas mechant, t\'as juste été mal code a la base')}.* ⚙️`,
        `*${targetTag} ${toSmallCaps('ton intelligence n\'est pas artificielle, elle est carrement inexistante')}.* 🧠`,
        `*${targetTag} ${toSmallCaps('tu es le genre de personne a souffler sur ton ecran quand le bot met du temps a repondre')}.* 🌬️`,
        `*${targetTag} ${toSmallCaps('tu n\'es pas un mystere, t\'es juste un fichier zip dont on a perdu le mot de passe')}.* 🔐`,
        `*${targetTag} ${toSmallCaps('ton niveau de repartie est plus bas que le ping d\'une connexion edge au fond de l\'ocean')}.* 📡`
      ];

      const line = insults[Math.floor(Math.random() * insults.length)];

      await sock.sendMessage(from, { 
        text: `${line}\n\n${extra.phrases.footer()}`, 
        mentions: [targetId] 
      }, { quoted: msg });

    } catch (error) {
      console.error('[insult] ERROR:', error);
      await reply(`*❌ ${toSmallCaps('l\'invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};