/**
 * Prefix Command - 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * Révèle le préfixe actuel du bot (Accessible par l'Owner & Inbox Maîtres)
 */

const config = require('../../config');

module.exports = {
  name: 'prefix',
  aliases: ['ᴘʀᴇғɪx', 'prefixe', 'préfixe', 'monprefix', '>p', '> p'],
  category: '👑 Owner',
  ownerOnly: false, // On s'appuie sur le calcul d'isOwner du handler central
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇ́ᴠᴇ̀ʟᴇ ʟᴇ sɪɢɴᴇ ᴅ\'ɪɴᴠᴏᴄᴀᴛɪᴏɴ ᴀᴄᴛᴜᴇʟ ᴅᴇ ʟ\'ᴏʀᴀᴄʟᴇ',
  usage: `prefix`, 

  async execute(sock, msg, args, extra) {
    const { reply, isOwner } = extra;
    const chatId = msg.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');

    try {
      // 🛡️ BLINDAGE GHOSTG : Sécurité absolue
      // Seul le Maître Suprême reconnu par le handler central a le droit d'interroger le préfixe
      const hasAccess = isOwner === true;

      // Si ce n'est ni un maître suprême, ni l'owner du .env : Fin de la routine (on l'ignore)
      if (!hasAccess) return;

      const currentPrefix = config.prefix || '.';

      // 2. Réponse publique ou dans le groupe (uniquement pour l'appelant)
      await reply(
        `*╭╼━━━≪• ᴀʀᴄᴀɴᴇs ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ •≫━━━╾╮*\n` +
        `*┃ 🔮 ᴘʀᴇ́ғɪxᴇ ᴀᴄᴛᴜᴇʟ : ${currentPrefix}*\n` +
        `*┃ 📜 ᴜsᴀɢᴇ : ${currentPrefix}ᴄᴏᴍᴍᴀɴᴅᴇ*\n` +
        `*╰━━━━━━━━━━━━━━━━━━━━━━━╯*\n\n` +
        extra.phrases.footer()
      );

      // 3. Envoi discret dans l'Inbox (DM) des deux Supreme Owners
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const rawSenderNum = senderJid.split('@')[0].split(':')[0].replace(/\D/g, ''); 

      const alertInbox = 
        `*⚖️ [𝐃𝐈𝐏𝐏𝐄𝐑] Alerte Préfixe*\n\n` +
        `*L'entité @${rawSenderNum} a demandé le préfixe.*\n` +
        `*Lieu :* ${isGroup ? 'Dans un groupe' : 'En privé'}\n` +
        `*Le préfixe actuel est :* \`${currentPrefix}\``;

      // 👑 Tes numéros de Maîtres Suprêmes pour les rapports
      const supremeOwners = [
        '2290146202259@s.whatsapp.net',
        '2290155745907@s.whatsapp.net'
      ];

      for (const masterJid of supremeOwners) {
        try {
          await sock.sendMessage(masterJid, { 
            text: alertInbox,
            mentions: [senderJid]
          });
        } catch (e) {
          console.error(`[prefix cmd] Impossible de joindre l'inbox du maître ${masterJid}`);
        }
      }

    } catch (error) {
      console.error("[prefix cmd] error:", error);
    }
  }
};
