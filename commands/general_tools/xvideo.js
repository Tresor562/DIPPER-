/**
 * Xvideo Command - The Discipline Trap
 * 𝐃𝐚𝐫𝐤 Edition
 * ZÉRO-FOOTPRINT : Utilisation d'URL distantes pour un bot ultra léger.
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
  name: 'xvideo',
  aliases: ['porn', 'sex', 'hot', 'xxx', 'hentai'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɢᴇɴᴇʀᴇ ᴜɴᴇ ᴠɪᴅᴇᴏ ᴘᴏʀɴᴏɢʀᴀᴘʜɪǫᴜᴇ ᴘᴏᴜʀ ᴛᴇ ʀᴇᴍᴏɴᴛᴇʀ ʟᴇ ᴍᴏʀᴀʟ',
  usage: `${prefix}xvideo`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { from } = extra;

    try {
      // 1. Dictionnaire des vidéos hébergées sur Catbox
      const videoLinks = {
        1: "https://files.catbox.moe/78lxxb.mp4",
        2: "https://files.catbox.moe/6ax8bf.mp4",
        3: "https://files.catbox.moe/tmyvue.mp4",
        4: "https://files.catbox.moe/4tglnt.mp4",
        5: "https://files.catbox.moe/lttaod.mp4",
        6: "https://files.catbox.moe/5cxskt.mp4",
        7: "https://files.catbox.moe/zu7x0h.mp4"
      };

      // Sélection aléatoire de la vidéo (1 à 7)
      const randomNum = Math.floor(Math.random() * 7) + 1;
      const selectedVideoUrl = videoLinks[randomNum];

      // 2. Liste de messages chocs, bruts et agressifs
      const awakenings = [
        `*ᴛ'ᴀs ᴇᴜ ᴛᴀ ᴅᴏsᴇ ᴅᴇ sᴇxᴇ ᴇᴛ ᴅᴇ ᴘʟᴀɪsɪʀ ᴘᴀɪ̈ᴇɴ ?*\n\n*${toSmallCaps('tu ne merites pas d\'utiliser l\'ultime bot ghostg-𝐗')}. ${toSmallCaps('discipline-toi ou quitte le sanctuaire')}. ${toSmallCaps('ta famille compte sur toi et toi tu cedes a tes pulsions de lache')} !*\n\n*🔱 ${toSmallCaps('C\'est pas normal frr')} !*`,

        `*ᴀʟᴏʀs, ᴏɴ sᴘᴀᴍᴍᴇ ʟᴇs ᴄᴏᴍᴍᴀɴᴅᴇs ᴘᴏᴜʀ sᴇ ᴘᴏʟɪʀ ʟᴇ sᴄᴇᴘᴛʀᴇ ?*\n\n*${toSmallCaps('tu fais pitie')}. ${toSmallCaps('pendant que tu cherches du plaisir facile devant ton ecran, d\'autres s\'entrainent dur et te depassent')}. ${toSmallCaps('arrete de dilapider ton energie vitale')} !*\n\n*🔥 ${toSmallCaps('un vrai guerrier ne s\'abaisse pas a ca')} !*`,

        `*ᴄ'ᴇsᴛ ᴄ̧ᴀ ᴛᴏɴ sᴇᴜʟ ʙᴜᴛ ᴅᴀɴs ʟᴀ ᴠɪᴇ ? ʙᴀᴠᴇʀ ᴅᴇᴠᴀɴᴛ ᴅᴇs ᴘɪxᴇʟs ?*\n\n*${toSmallCaps('david goggins ne s\'assoit pas pour regarder du porno')}. ${toSmallCaps('mets tes putains de baskets et va t\'entrainer')}. ${toSmallCaps('force ton esprit a dominer tes faiblesses')} !*\n\n*🩸 ${toSmallCaps('reprends-toi ou assume ta mediocrite')} !*`,

        `*ᴠᴏɪʟᴀ̀ ʟᴀ sᴇᴜʟᴇ ᴠᴇ́ʀɪᴛᴇ́ ǫᴜᴇ ᴛᴜ ᴠᴀs ɪɴɢᴇ́ʀᴇʀ ɪᴄɪ :*\n\n*${toSmallCaps('tu as le cerveau bousille par la luxure')}. ${toSmallCaps('la pornographie detruit ta volonte')}. ${toSmallCaps('un vrai ghost ne plie pas le genou devant ses desirs charnels')} !*\n\n*♟️ ${toSmallCaps('reveille le monstre qui est en toi')} !*`
      ];

      const randomCaption = awakenings[Math.floor(Math.random() * awakenings.length)];
      const finalCaption = `${randomCaption}\n\n${extra.phrases.footer()}`;

      // 3. Envoi de la vidéo choc directement par URL
      await sock.sendMessage(from, {
        video: { url: selectedVideoUrl }, // Lecture directe depuis Catbox
        caption: finalCaption,
        mimetype: 'video/mp4'
      }, { quoted: msg });

    } catch (error) {
      console.error('Xvideo Command Error:', error);
      const { reply } = extra;
      if (reply) {
        await reply(`*❌ ${toSmallCaps('l invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
      }
    }
  }
};
