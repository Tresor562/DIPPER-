/**
 * Bomb Game - Interactive number guessing game
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 */

const config = require('../../config.js');
const sessionContext = require('../../utils/sessionContext');

// On exporte le gameState pour que le handler principal puisse le lire !
const gameState = new Map();

function toSmallCaps(text) {
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";
  const cleanedText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

const prefix = config.prefix || '.';

module.exports = {
  gameState, // Crucial pour l'étape 2
  name: 'piege',
  aliases: ['bom', 'bombe', 'chaos', 'bomb', 'piège', 'jeu_piege', 'tictactoe'],
  category: '🎮 Jeux & Fun',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇғɪᴇ ʟᴇ ᴅᴇsᴛɪɴ : ᴄʜᴏɪsɪs ʟᴇs ʙᴏɴs sᴄᴇᴀᴜx ᴇᴛ ᴇᴠɪᴛᴇ ʟᴀ ʙᴏᴍʙᴇ',
  usage: `${prefix}piege`,

  async execute(sock, msg, args, extra) {
    const sender = extra.sender;
    const from = extra.from;
    const timeout = 180000; // 3 minutes

    try {
      // Si une partie est déjà lancée par ce joueur
      if (gameState.has(sessionContext.scopeKey(sender))) {
        return await sock.sendMessage(from, { 
          text: `*⚠️ ${toSmallCaps('tu as deja un defi en cours')} ! ${toSmallCaps('termine le ou tape abandon')}.*` 
        }, { quoted: msg });
      }

      // Initialisation
      const bom = ['💥', '✅', '✅', '✅', '✅', '✅', '✅', '✅', '✅'].sort(() => Math.random() - 0.5);
      const number = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
      const array = bom.map((v, i) => ({
        emot: v,
        number: number[i],
        position: i + 1,
        state: false
      }));

      let teks = `*╭╼━━━≪• ${toSmallCaps('le defi de la bombe')} •≫━━━╾╮*\n` +
                 `*┃ ${toSmallCaps('envoie un chiffre entre 1 et 9 pour')}*\n` +
                 `*┃ ${toSmallCaps('tenter d\'ouvrir les sceaux sains')}.*\n` +
                 `*╰━━━━━━━━━━━━━━━━━━━━━━━╯*\n\n`;

      for (let i = 0; i < array.length; i += 3) {
        teks += array.slice(i, i + 3).map(v => v.state ? v.emot : v.number).join('') + '\n';
      }
      teks += `\n*⏳ ${toSmallCaps('temps disponible')} : [ 3 ${toSmallCaps('minutes')} ]*\n` +
              `*${toSmallCaps('evite la bombe ou tes points seront reduits')}.*\n\n` +
              extra.phrases.footer();

      const gameMsg = await sock.sendMessage(from, {
        text: teks,
        contextInfo: {
          externalAdReply: {
            title: "ɢʜᴏsᴛɢ-x : ᴄʜᴀᴏs ɢᴀᴍᴇ",
            body: `${toSmallCaps('evite la bombe pour survivre')} !`,
            thumbnailUrl: "https://telegra.ph/file/b3138928493e78b55526f.jpg",
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: msg });

      // Timeout
      const timeoutId = setTimeout(() => {
        if (gameState.has(sessionContext.scopeKey(sender))) {
          const game = gameState.get(sessionContext.scopeKey(sender));
          const bombBox = game.array.find(v => v.emot === '💥');
          sock.sendMessage(from, {
            text: `*⏳ ${toSmallCaps('le sablier est vide')} !*\n\n*${toSmallCaps('la bombe s\'est activee dans le sceau')} ${bombBox.number}.*\n\n${extra.phrases.footer()}`
          }, { quoted: game.msg });
          gameState.delete(sessionContext.scopeKey(sender));
        }
      }, timeout);

      // On stocke la partie
      gameState.set(sessionContext.scopeKey(sender), { msg: gameMsg, array, timeoutId });

    } catch (error) {
      console.error('Bomb Game Error:', error);
      await sock.sendMessage(from, { text: `*❌ ${toSmallCaps('une erreur s\'est produite dans le chaos')}*` });
    }
  }
};
