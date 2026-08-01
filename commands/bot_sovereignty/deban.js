/**
 * Deban 𝐃𝐚𝐫𝐤  Edition
 * Débloque une âme dans le sanctuaire (.env Synced)
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');

const prefix = config.prefix || '.';

// Fonction pour le style Small Caps
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
  name: 'debannissement', 
  aliases: ['debannir', 'unban', 'debloquer', 'deban', 'liberer', 'lib'],
  category: '👑 Owner',
  ownerOnly: false, 
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴠᴏǫᴜᴇ ʟᴇ ʙᴀɴɴɪssᴇᴍᴇɴᴛ ᴅ\'ᴜɴᴇ ᴀ̂ᴍᴇ',
  usage: `${prefix}debannissement @ᴜsᴇʀ ᴏᴜ ᴇɴ ʀᴇ́ᴘᴏɴsᴇ`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner } = extra;
    const chatId = msg.key.remoteJid;

    try {
      // 👑 Tes numéros de Maîtres Suprêmes
      const supremeOwners = ['2290146202259', '2290155745907'];

      // 🛡️ EXTRACTION SÉCURISÉE DE TON NUMÉRO (Infaillible)
      let senderJid = msg.key.fromMe 
        ? sock.user.id 
        : (msg.key.participant || msg.key.remoteJid);
      
      const bareJid = senderJid.split('@')[0].split(':')[0];
      const senderNumber = bareJid.replace(/\D/g, '');

      // 🛡️ BLINDAGE 𝐃𝐚𝐫𝐤 : Sécurité absolue
      const hasAccess = supremeOwners.includes(senderNumber) || isOwner === true;

      // Silence total pour les intrus
      if (!hasAccess) return; 

      let target;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      // 1. Extraction de la cible via mention
      if (mentioned && mentioned.length > 0) {
        target = mentioned[0];
      } 
      // 2. Extraction de la cible via réponse (quoted)
      else if (ctx && ctx.quotedMessage) {
        target = ctx.participant;
        
        if (!target) {
            return reply(`*〆 ${toSmallCaps('impossible de cibler cette ame')}.*`);
        }
      } 
      // Si aucune cible n'est trouvée
      else {
        return reply(`*〆 ${toSmallCaps('invoque une mention ou reponse a une ame pour la debannir')} !*\n*${toSmallCaps('usage')} : ${prefix}debannissement @ᴜsᴇʀ*\n\n> *♰ ᴇ́ᴛᴀʙʟɪ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`);
      }

      // Nettoyage de la cible pour l'aligner sur le format du fichier .env
      const cleanTarget = target.split('@')[0].split(':')[0].replace(/\D/g, '');

      const envPath = path.join(process.cwd(), '.env');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      
      let bannedList = [];
      const bannedMatch = envContent.match(/^BANNED_USERS=(.*)$/m);
      
      if (bannedMatch) {
        bannedList = bannedMatch[1].split(',').map(n => n.trim()).filter(n => n !== '');
      }

      // Si l'utilisateur n'est pas dans la liste des condamnés
      if (!bannedList.includes(cleanTarget)) {
        return reply(`*⚖️ ${toSmallCaps('cette ame n est pas scellee dans les arcanes')}.*`);
      }

      // Retrait propre du numéro de la liste
      bannedList = bannedList.filter(n => n !== cleanTarget);
      const newBannedString = bannedList.join(',');

      // Sauvegarde chirurgicale dans le .env
      if (envContent.match(/^BANNED_USERS=/m)) {
        envContent = envContent.replace(/^BANNED_USERS=.*/m, `BANNED_USERS=${newBannedString}`);
      } else {
        envContent = envContent.trim() + `\nBANNED_USERS=${newBannedString}`;
      }
      
      fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');

      // Application immédiate en mémoire système (process.env)
      process.env.BANNED_USERS = newBannedString;

      // Message de confirmation avec mention
      await sock.sendMessage(chatId, {
        text: `*✅ ʟ\'ᴀ̂ᴍᴇ ᴅᴇ @${cleanTarget} ᴀ ᴇ́ᴛᴇ́ ʟɪʙᴇ́ʀᴇ́ᴇ ᴅᴇs ᴀʀᴄᴀɴᴇs !*\n\n> *♰ ᴇ́ᴛᴀʙʟɪ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`,
        mentions: [target]
      }, { quoted: msg });

    } catch (error) {
      console.error('[unban cmd] error:', error);
      await reply(`*〆 ${toSmallCaps('l invocation a echoue')} : ${error.message}*`);
    }
  }
};
