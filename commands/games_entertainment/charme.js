/**
 * Messages de séduction 
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
  name: 'charme',
  aliases: ['pickup', 'pickupline', 'flirt', 'drague'],
  category: '🎮 Jeux & Fun',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴏʙᴛɪᴇɴs ᴜɴᴇ ᴘʜʀᴀsᴇ ᴅ\'ᴀᴄᴄʀᴏᴄʜᴇ ᴇɴᴠᴏᴜᴛᴀɴᴛᴇ ᴘᴏᴜʀ sᴇᴅᴜɪʀᴇ',
  usage: `${prefix}charme [@user ou en reponse]`,
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

      const flirts = [
        // --- CLASSIQUES DU SANCTUAIRE ---
        `*${targetTag} ${toSmallCaps('est ce que tu as un plan')} ? ${toSmallCaps('parce que je viens de me perdre dans tes yeux')}.* 😍`,
        `*${targetTag} ${toSmallCaps('si toi et moi on etait des voleurs, je te laisserais piller mon coeur')}.* 💘`,
        `*${targetTag} ${toSmallCaps('j\'espere que tu as une bonne assurance, parce que ton charme m\'a fait tomber')}.* 🚑`,
        `*${targetTag} ${toSmallCaps('tu n\'es pas un sortilege, mais tu m\'as completement envoute')}.* ✨`,
        `*${targetTag} ${toSmallCaps('je ne suis pas un photographe, mais je peux tres bien nous imaginer ensemble')}.* 📸`,
        `*${targetTag} ${toSmallCaps('ton sourire est plus puissant que n\'importe quel algorithme')}.* 😏`,
        `*${targetTag} ${toSmallCaps('tu dois etre epuise')}... ${toSmallCaps('tu as marche dans mes pensees toute la journee')}.* 💭`,
        `*${targetTag} ${toSmallCaps('si etre sublime etait un crime, tu serais en prison a perpetuite')}.* ⚖️`,
        `*${targetTag} ${toSmallCaps('mon medecin m\'a dit que j\'avais un manque de vitamine')}... ${toSmallCaps('la vitamine toi')}.* 💊`,
        `*${targetTag} ${toSmallCaps('est ce que tu es un magicien')} ? ${toSmallCaps('parce que des que je te vois, le reste disparait')}.* 🎩`,
        `*${targetTag} ${toSmallCaps('tu es la seule erreur systeme que je n\'ai pas envie de corriger')}.* 🤖`,
        `*${targetTag} ${toSmallCaps('si je devais ecrire un script pour le bonheur, il n\'y aurait que ton nom')}.* 📝`,
        `*${targetTag} ${toSmallCaps('tu as un petit probleme aux yeux')}... ${toSmallCaps('ils brillent beaucoup trop')}.* ✨`,
        `*${targetTag} ${toSmallCaps('si seulement je pouvais etre ton ombre pour te suivre partout')}.* 👤`,
        `*${targetTag} ${toSmallCaps('tu es comme le meilleur des cafes')} : ${toSmallCaps('tu m\'empeches de dormir et tu m\'excites')}.* ☕`,
        `*${targetTag} ${toSmallCaps('je n\'ai plus besoin de google, j\'ai trouve tout ce que je cherchais en toi')}.* 🔍`,
        `*${targetTag} ${toSmallCaps('tu es si magnetique que tu dois avoir des aimants caches')}.* 🧲`,
        `*${targetTag} ${toSmallCaps('mon coeur fait des sauts symphoniques des que tu es la')}.* 🎵`,
        `*${targetTag} ${toSmallCaps('tu dois etre fait de sucre pour etre aussi doux')}.* 🍭`,
        `*${targetTag} ${toSmallCaps('je ne sais pas ce qui est le plus beau')}... ${toSmallCaps('le soleil ou toi')}.* ☀️`,

        // --- NOUVELLES PHRASES STYLE GHOST (TÉNÉBREUX / CYBER / MANGA) ---
        `*${targetTag} ${toSmallCaps('tu as hacke mon systeme, toutes mes defenses sont tombees devant toi')}.* 🖤`,
        `*${targetTag} ${toSmallCaps('tu es le plus beau bug de ma matrice, et je refuse de te patcher')}.* 🌐`,
        `*${targetTag} ${toSmallCaps('meme le plus puissant des genjutsu ne pourrait pas m\'enchanter autant que toi')}.* 🌀`,
        `*${targetTag} ${toSmallCaps('je peux bypass n\'importe quelle securite, mais face a toi je reste sans voix')}.* 🔓`,
        `*${targetTag} ${toSmallCaps('tu n\'as pas besoin d\'invoquer la foudre, ton regard m\'electrise deja')}.* ⚡`,
        `*${targetTag} ${toSmallCaps('mon dark mode s\'eclaircit des que tu envoies un message')}.* 💡`,
        `*${targetTag} ${toSmallCaps('tu es le boss final que j\'ai envie d\'affronter tous les jours')}.* 🏆`,
        `*${targetTag} ${toSmallCaps('si j\'etais un virus, je m\'installerais definitivement dans ton coeur')}.* 👾`,
        `*${targetTag} ${toSmallCaps('tu es l\'admin de mes pensees, tu as tous les droits sur moi')}.* 👑`,
        `*${targetTag} ${toSmallCaps('mon processeur sature des que tu m\'approches')}.* 🔥`,
        `*${targetTag} ${toSmallCaps('meme les ames du sanctuaire s\'inclinent devant ta beaute')}.* 🏰`,
        `*${targetTag} ${toSmallCaps('tu es la cle privee qui peut dechiffrer tous mes secrets')}.* 🔑`,
        `*${targetTag} ${toSmallCaps('tu as lance un sort de paralysie sur mon coeur, je ne peux plus t\'oublier')}.* ⏳`,
        `*${targetTag} ${toSmallCaps('si l\'amour etait un code, tu en serais la plus belle ligne')}.* 💻`,
        `*${targetTag} ${toSmallCaps('meme sans connexion, mon coeur ne cherche qu\'a se lier au tien')}.* 📡`,
        `*${targetTag} ${toSmallCaps('tu es l\'exception dans mon script que je n\'ai jamais envie de catch')}.* ⚠️`,
        `*${targetTag} ${toSmallCaps('tu es mon domaine prefere, j\'ai envie de m\'y perdre sans fin')}.* 🌍`,
        `*${targetTag} ${toSmallCaps('les ombres du sanctuaire s\'effacent face a l\'eclat de ton sourire')}.* 🎭`,
        `*${targetTag} ${toSmallCaps('tu es le root de ma vie, tout commence avec toi')}.* 🛠️`,
        `*${targetTag} ${toSmallCaps('je passerais des nuits blanches a coder ton bonheur si tu me laissais faire')}.* 🌌`
      ];

      const randomFlirt = flirts[Math.floor(Math.random() * flirts.length)];

      await sock.sendMessage(from, {
        text: `${randomFlirt}\n\n${extra.phrases.footer()}`,
        mentions: [targetId]
      }, { quoted: msg });

    } catch (error) {
      console.error('Flirt Error:', error);
      await reply(`*❌ ${toSmallCaps('l\'invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
