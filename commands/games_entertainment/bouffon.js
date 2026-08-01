/**
 * Bouffon -
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
  name: 'bouffon',
  aliases: ['jokes', 'joke', 'blague'],
  category: '🎮 Jeux & Fun',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴏʙᴛɪᴇɴs ᴜɴᴇ ʙʟᴀɢᴜᴇ ᴀʟᴇᴀᴛᴏɪʀᴇ ᴇɴ ᴄɪʙʟᴀɴᴛ ᴜɴ ᴍᴇᴍʙʀᴇ',
  usage: `${prefix}bouffon [@user ou en reponse]`,
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
      if (mentioned.length) {
        targetId = mentioned[0];
      } else if (ctx.participant) {
        targetId = ctx.participant;
      } else {
        targetId = extra.sender;
      }

      const targetTag = `@${targetId.split('@')[0]}`;

      const jokes = [
        // --- CLASSIQUES REVISITÉS ---
        {
          setup: `*${toSmallCaps('pourquoi les plongeurs plongent ils toujours en arriere et jamais en avant')} ? ${toSmallCaps('demandez a')} ${targetTag} !*`,
          punchline: `*${toSmallCaps('parce que sinon ils tombent dans le bateau')} !* 🚤`
        },
        {
          setup: `*${toSmallCaps('que fait')} ${targetTag} ${toSmallCaps('quand il a froid devant son pc')} ?*`,
          punchline: `*${toSmallCaps('il ferme les fenetres')} (ᴡɪɴᴅᴏᴡs) !* 🪟`
        },
        {
          setup: `*${toSmallCaps('pourquoi les oiseaux volent ils vers le sud en hiver')} ? ${toSmallCaps('c\'est')} ${targetTag} ${toSmallCaps('qui leur a dit')}...*`,
          punchline: `*${toSmallCaps('parce que c\'est trop long d\'y aller a pied')} !* 🐧`
        },
        {
          setup: `*${toSmallCaps('quel est le comble pour un electricien comme')} ${targetTag} ?*`,
          punchline: `*${toSmallCaps('c\'est de ne pas etre au courant')} !* ⚡`
        },
        {
          setup: `*${toSmallCaps('pourquoi le livre de maths de')} ${targetTag} ${toSmallCaps('est il toujours stresse')} ?*`,
          punchline: `*${toSmallCaps('parce qu\'il a trop de problemes')} !* 📚`
        },
        {
          setup: `*${toSmallCaps('pourquoi')} ${targetTag} ${toSmallCaps('a t il peur de l\'ordinateur')} ?*`,
          punchline: `*${toSmallCaps('parce qu\'il y a une souris')} !* 🐭`
        },
        {
          setup: `*${toSmallCaps('quel est le comble pour un joueur de cartes comme')} ${targetTag} ?*`,
          punchline: `*${toSmallCaps('c\'est de perdre la face')} !* 🃏`
        },

        // --- STYLE CYBER / DARK / HACKING ---
        {
          setup: `*${toSmallCaps('quel est le mot de passe de la session de')} ${targetTag} ?*`,
          punchline: `*${toSmallCaps('il n\'y en a pas, de toute facon personne ne veut y entrer')}...* 💻`
        },
        {
          setup: `*${toSmallCaps('pourquoi')} ${targetTag} ${toSmallCaps('met il son pc sur le sol')} ?*`,
          punchline: `*${toSmallCaps('pour faire baisser le ping')} !* 📉`
        },
        {
          setup: `*${toSmallCaps('que fait')} ${targetTag} ${toSmallCaps('quand son code ne fonctionne pas')} ?*`,
          punchline: `*${toSmallCaps('il supprime system32 pour faire de la place')} !* 🗑️`
        },
        {
          setup: `*${toSmallCaps('pourquoi')} ${targetTag} ${toSmallCaps('ne fait il jamais de backup')} ?*`,
          punchline: `*${toSmallCaps('parce qu\'il n\'a rien a perdre dans sa vie')}...* ☁️`
        },
        {
          setup: `*${toSmallCaps('quel est le langage de programmation prefere de')} ${targetTag} ?*`,
          punchline: `*${toSmallCaps('le bégaiement++')} !* 🗣️`
        },
        {
          setup: `*${toSmallCaps('pourquoi')} ${targetTag} ${toSmallCaps('croit il que le cloud est dangereux')} ?*`,
          punchline: `*${toSmallCaps('parce qu\'il a peur qu\'il pleuve sur ses donnees')} !* 🌧️`
        },
        {
          setup: `*${toSmallCaps('que dit')} ${targetTag} ${toSmallCaps('quand il voit une erreur')} 404 ?*`,
          punchline: `*${toSmallCaps('enfin quelqu\'un qui me comprend')} !* 🚫`
        },
        {
          setup: `*${toSmallCaps('quel est le comble pour un hacker comme')} ${targetTag} ?*`,
          punchline: `*${toSmallCaps('c\'est de se faire pirater son compte netflix par sa grand mere')} !* 🍿`
        },

        // --- STYLE ANIME / MANGA ---
        {
          setup: `*${toSmallCaps('quel est le pouvoir special de')} ${targetTag} ${toSmallCaps('dans naruto')} ?*`,
          punchline: `*${toSmallCaps('le talk no jutsu, mais sans le charisme')}...* 🌀`
        },
        {
          setup: `*${toSmallCaps('pourquoi')} ${targetTag} ${toSmallCaps('ne pourra jamais trouver le one piece')} ?*`,
          punchline: `*${toSmallCaps('parce qu\'il oublie toujours ou il a gare son bateau')} !* ⛵`
        },
        {
          setup: `*${toSmallCaps('quel est le titan le plus dangereux pour')} ${targetTag} ?*`,
          punchline: `*${toSmallCaps('le titan de la solitude')} !* 🏰`
        },
        {
          setup: `*${toSmallCaps('pourquoi les saiyans refusent de fusionner avec')} ${targetTag} ?*`,
          punchline: `*${toSmallCaps('parce que ca ferait baisser leur niveau de puissance')} !* 💥`
        },
        {
          setup: `*${toSmallCaps('que fait')} ${targetTag} ${toSmallCaps('avec un death note')} ?*`,
          punchline: `*${toSmallCaps('il ecrit son propre nom pour voir si le stylo fonctionne')} !* 📓`
        },

        // --- PHRASES TRÉPIDANTES ---
        {
          setup: `*${toSmallCaps('pourquoi')} ${targetTag} ${toSmallCaps('marche t il toujours avec un parapluie')} ?*`,
          punchline: `*${toSmallCaps('pour eviter les vannes qui tombent du ciel')} !* ☔`
        },
        {
          setup: `*${toSmallCaps('que se passe t il quand')} ${targetTag} ${toSmallCaps('essaie de reflechir')} ?*`,
          punchline: `*${toSmallCaps('on entend le bruit d\'un ventilateur de pc en surchauffe')} !* 🌀`
        },
        {
          setup: `*${toSmallCaps('pourquoi')} ${targetTag} ${toSmallCaps('est il comme un fichier zip')} ?*`,
          punchline: `*${toSmallCaps('parce qu\'il prend de la place mais n\'apporte rien tant qu\'on ne l\'extrait pas')} !* 📦`
        },
        {
          setup: `*${toSmallCaps('que fait')} ${targetTag} ${toSmallCaps('pour securiser son telephone')} ?*`,
          punchline: `*${toSmallCaps('rien, sa tete suffit a eloigner les curieux')} !* 🤳`
        },
        {
          setup: `*${toSmallCaps('pourquoi')} ${targetTag} ${toSmallCaps('ne joue t il jamais a cache cache')} ?*`,
          punchline: `*${toSmallCaps('parce que personne ne prend la peine de le chercher')} !* 🙈`
        },
        {
          setup: `*${toSmallCaps('quel est le plus grand mystere pour')} ${targetTag} ?*`,
          punchline: `*${toSmallCaps('le fonctionnement d\'un miroir')} !* 🪞`
        },
        {
          setup: `*${toSmallCaps('que dit')} ${targetTag} ${toSmallCaps('quand on lui demande son avis')} ?*`,
          punchline: `*${toSmallCaps('chargement en cours')}... (40 ${toSmallCaps('minutes plus tard')}...)* ⏳`
        },
        {
          setup: `*${toSmallCaps('pourquoi')} ${targetTag} ${toSmallCaps('est il une legende')} ?*`,
          punchline: `*${toSmallCaps('parce que ses exploits n\'existent que dans ses reves')} !* 🏆`
        },
        {
          setup: `*${toSmallCaps('que fait')} ${targetTag} ${toSmallCaps('quand il rate une marche')} ?*`,
          punchline: `*${toSmallCaps('il dit que c\'est un glitch dans la matrice')} !* 🕹️`
        },
        {
          setup: `*${toSmallCaps('pourquoi')} ${targetTag} ${toSmallCaps('est il le boss final')} ?*`,
          punchline: `*${toSmallCaps('parce qu\'il est tellement lourd qu\'on ne peut pas le soulever')} !* 🏋️`
        }
      ];

      // Sélection d'une blague au hasard
      const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];

      const text = `${randomJoke.setup}\n\n${randomJoke.punchline}\n\n${extra.phrases.footer()}`;

      await sock.sendMessage(from, { 
        text: text, 
        mentions: [targetId] 
      }, { quoted: msg });

    } catch (error) {
      console.error('[joke] ERROR:', error);
      await reply(`*❌ ${toSmallCaps('l\'invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
