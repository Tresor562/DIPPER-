/**
 * GetAbout Command — 𝐃𝐚𝐫𝐤 Edition
 * .getabout [@mention / réponse]
 * Récupère la bio/description WhatsApp d'un utilisateur via Baileys.
 *
 * Note : si l'utilisateur a restreint sa bio en privé,
 *        Baileys lancera une erreur — on la gère proprement.
 */
const config = require('../../config.js');
const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789'; const s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

module.exports = {
  name:'getabout', aliases:['bio','about','getbio','gbio'],
  category: '🛠️ Outils généraux',
  description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇ́ᴄᴜᴘᴇ̀ʀᴇ ʟᴀ ʙɪᴏ WhatsApp ᴅ\'ᴜɴ ᴜᴛɪʟɪsᴀᴛᴇᴜʀ',
  usage:`${config.prefix||'.'}getabout [@mention / réponse]`,

  async execute(sock, msg, args, extra) {
    const { reply, from, sender, phrases } = extra;

    const ctx       = msg.message?.extendedTextMessage?.contextInfo;
    const targetJid = ctx?.mentionedJid?.[0] || ctx?.participant || sender;
    const numero    = targetJid.split('@')[0].split(':')[0].replace(/\D/g,'');

    await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } }).catch(()=>{});

    try {
      // Baileys : fetchStatus() retourne { status, setAt }
      const statusInfo = await sock.fetchStatus(targetJid);

      const bio    = statusInfo?.status || statusInfo?.status?.status || null;
      const setAt  = statusInfo?.setAt  ? new Date(statusInfo.setAt).toLocaleDateString('fr-FR') : null;

      if (!bio) {
        return reply(
          `╭╼≪• *📝 ${SC('bio whatsapp')}* •≫╾╮\n` +
          `┃ 👤 @${numero}\n` +
          `┃\n` +
          `┃ ❌ _${SC('aucune bio définie ou restreinte')}_\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
      }

      await reply(
        `╭╼≪• *📝 ${SC('bio whatsapp')}* •≫╾╮\n` +
        `┃\n` +
        `┃ 👤 *${SC('utilisateur')}* : @${numero}\n` +
        `┃\n` +
        `┃ 💬 *${SC('bio')} :*\n` +
        `┃ _${bio}_\n` +
        (setAt ? `┃\n┃ 📅 *${SC('définie le')}* : ${setAt}\n` : '') +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch (err) {
      await reply(
        `╭╼≪• *📝 ${SC('bio whatsapp')}* •≫╾╮\n` +
        `┃ 👤 @${numero}\n` +
        `┃\n` +
        `┃ 🔒 _${SC('bio privée ou inaccessible')}_\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    }
  }
};
