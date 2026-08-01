/**
 * Arcanes Command - 𝐃𝐚𝐫𝐤  Edition
 * Analyse l'âme et les métadonnées d'un pèlerin du Sanctuaire
 * ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐃𝐚𝐫𝐤
 */

const config = require('../../config.js');

const prefix = config.prefix || '.';

function toSmallCaps(text) {
  if (!text) return '';
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";
  const cleanedText = String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

module.exports = {
  name: 'arcanes',
  aliases: ['scan', 'profiler', 'profile', 'ᴀʀᴄᴀɴᴇs'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀɴᴀʟʏsᴇ ʟ\'ᴀᴍᴇ ᴇᴛ ʟᴇs ᴍᴇᴛᴀᴅᴏɴɴᴇᴇs ᴅ\'ᴜɴ ᴍᴇᴍʙʀᴇ',
  usage: `${prefix}arcanes (répondez ou mentionnez quelqu'un)`,
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const chatId = msg.key.remoteJid;

    try {
      // 1. DÉTECTION ROBUSTE DE LA CIBLE
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      let targetJid;

      if (ctx?.quotedMessage) {
        targetJid = ctx.participant || ctx.remoteJid;
      } else if (ctx?.mentionedJid && ctx.mentionedJid.length > 0) {
        targetJid = ctx.mentionedJid[0];
      } else {
        targetJid = msg.key.participant || msg.key.remoteJid;
      }

      // Si le Jid comporte un identifiant d'appareil (ex: :5@s.whatsapp.net), on nettoie
      if (targetJid.includes(':')) {
        targetJid = targetJid.split(':')[0] + '@s.whatsapp.net';
      }

      const cleanNumber = targetJid.split('@')[0];

      await sock.sendMessage(chatId, { react: { text: '🔍', key: msg.key } });

      // 2. RÉCUPÉRATION DU PROFIL WHATSAPP
      let ppUrl;
      try {
        ppUrl = await sock.profilePictureUrl(targetJid, 'image');
      } catch {
        ppUrl = 'https://files.catbox.moe/k37u59.png'; 
      }

      // 3. CALCUL D'AURA FICTIF
      const numSum = cleanNumber.split('').reduce((acc, char) => acc + (parseInt(char) || 0), 0);
      const auraLevel = (numSum * 7) % 1000;
      
      // 4. RÉCUPÉRATION SÉCURISÉE DES MÉTADONNÉES
      const supremeOwners = ['2290146202259', '2290155745907'];
      let rank = toSmallCaps('pelerin');
      
      // On utilise les metadata passées par le handler s'ils existent, sinon on force l'appel
      const groupMetadata = extra.groupMetadata || await sock.groupMetadata(chatId);
      
      if (groupMetadata && groupMetadata.participants) {
        const targetParticipant = groupMetadata.participants.find(p => p.id.split('@')[0] === cleanNumber);
        const isTargetAdmin = targetParticipant && (targetParticipant.admin === 'admin' || targetParticipant.admin === 'superadmin');

        const rawOwners = Array.isArray(config.ownerNumber) ? config.ownerNumber : [config.ownerNumber];
        const cleanedOwners = rawOwners.map(num => String(num).replace(/\D/g, ''));

        if (supremeOwners.includes(cleanNumber)) {
          rank = toSmallCaps('♛ maitre supreme') + ' 𓆩⚔︎𓆪';
        } else if (cleanedOwners.includes(cleanNumber)) {
          rank = toSmallCaps('createur');
        } else if (isTargetAdmin) {
          rank = toSmallCaps('gardien (admin)');
        }
      }

      // Progression de l'Aura
      const barLength = 10;
      const filledLength = Math.round((auraLevel / 1000) * barLength);
      const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

      const profileText = 
        `╭━━≪• *${toSmallCaps('inspection d\'ame')}* •≫━╾╮\n` +
        `┃ 👤 *${toSmallCaps('cible')}* : @${cleanNumber}\n` +
        `┃ 🏷️ *${toSmallCaps('numero')}* : +${cleanNumber}\n` +
        `┃ 🛡️ *${toSmallCaps('rang')}* : ${rank}\n` +
        `┃ ✨ *${toSmallCaps('puissance d\'aura')}* : ${auraLevel}/1000\n` +
        `┃ 📊 [${bar}]\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n` +
        `• *${toSmallCaps('statut')}* : 🟢 ᴀɴᴀʟʏsᴇ ᴛᴇʀᴍɪɴᴇᴇ\n` +
        `• *${toSmallCaps('flux')}* : ᴀᴍᴇ ʟɪᴇᴇ ᴀᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ\n\n` +
        `> *♰ ᴇ́ᴛᴀʙʟɪ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`;

      await sock.sendMessage(chatId, {
        image: { url: ppUrl },
        caption: profileText,
        mentions: [targetJid]
      }, { quoted: msg });

    } catch (error) {
      console.error('Arcanes command error:', error);
      await reply(`❌ *${toSmallCaps('impossible de percer les mysteres de cette ame')}...*`);
    }
  }
};
