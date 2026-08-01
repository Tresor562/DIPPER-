/**
 * Unblock Command - 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * Débloque silencieusement une entité sur WhatsApp et efface l'invocation
 * Sécurité : Supreme Owner Master Access (Direct Verification)
 * Monitoring : Envoi de rapports discrets aux oracles suprêmes
 */

const config = require('../../config');

const prefix = config.prefix || '.';

module.exports = {
  name: 'unblock',
  aliases: ['desactiver_blocage', 'debloque', 'deblock'],
  category: '👑 Owner',
  ownerOnly: false, // Géré manuellement par hasAccess via isOwner
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇ́ʙʟᴏǫᴜᴇ sɪʟᴇɴᴄɪᴇᴜsᴇᴍᴇɴᴛ ᴜɴ ᴜᴛɪʟɪsᴀᴛᴇᴜʀ ᴇᴛ ᴇғғᴀᴄᴇ ʟᴀ ᴛʀᴀᴄᴇ',
  usage: `${prefix}unblock [@ᴜsᴇʀ | ɴᴜᴍᴇ́ʀᴏ | ᴇɴ ʀᴇ́ᴘᴏɴsᴇ]`,

  async execute(sock, msg, args, extra) {
    const { isOwner, isSupremeOwner } = extra;
    const chatId = msg.key.remoteJid;

    try {
      // 🛡️ Sécurité : uniquement le système d'autorisation centralisé du
      // projet (extra.isOwner / extra.isSupremeOwner). Aucun numéro codé
      // en dur — ni pour l'accès, ni pour les notifications.
      const hasAccess = isOwner === true || isSupremeOwner === true;

      if (!hasAccess) return; // Seuls les maîtres ou l'owner local peuvent passer

      let target;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      // 1. Priorité absolue : Extraction de la cible via mention (Sélecteur WhatsApp)
      if (mentioned && mentioned.length > 0) {
        target = mentioned[0];
      } 
      // 2. Extraction de la cible via réponse à un message (quoted)
      else if (ctx && ctx.quotedMessage) {
        target = ctx.participant;
      }
      // 3. Extraction via numéro direct fourni dans les arguments
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
        console.error("[unblock cmd] Erreur lors de la suppression du message :", e);
      }

      // ⚖️ RITUEL DE DÉBLOCAGE SILENCIEUX (Au niveau du compte WhatsApp)
      await sock.updateBlockStatus(target, 'unblock');

      // 📝 RÉCUPÉRATION DES DESTINATAIRES DU RAPPORT (uniquement l'expéditeur
      // et les owners réellement configurés — aucun numéro tiers)
      const senderJid    = msg.key.fromMe ? sock.user.id : (msg.key.participant || msg.key.remoteJid);
      const senderNumber = senderJid.split('@')[0].split(':')[0].replace(/\D/g, '');
      let reportJids = [`${senderNumber}@s.whatsapp.net`];

      // On ajoute le numéro de l'Owner configuré sur le bot de l'utilisateur s'il existe
      if (config.ownerNumber) {
        const localOwners = Array.isArray(config.ownerNumber) ? config.ownerNumber : [config.ownerNumber];
        localOwners.forEach(num => {
          const cleanNum = `${num.toString().replace(/\D/g, '')}@s.whatsapp.net`;
          if (!reportJids.includes(cleanNum)) {
            reportJids.push(cleanNum);
          }
        });
      }

      // 🚀 ENVOI DU RAPPORT DE SUCCÈS À TOUS LES PROPRIÉTAIRES
      const targetNumber = target.split('@')[0];
      for (const jid of reportJids) {
        try {
          await sock.sendMessage(jid, {
            text: `*✅ [𝐃𝐈𝐏𝐏𝐄𝐑] L'entité @${targetNumber} a été débloquée avec succès.*`,
            mentions: [target]
          });
        } catch (e) {
          console.error(`Impossible d'envoyer le rapport de déblocage à ${jid}`);
        }
      }

    } catch (error) {
      console.error('[unblock cmd] error:', error);

      // 📝 RAPPORT D'ÉCHEC
      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
      let failedTarget = ctxInfo?.mentionedJid?.[0] || ctxInfo?.participant;
      
      if (!failedTarget && args[0]) {
         const cleaned = args[0].replace(/[^0-9]/g, '');
         if (cleaned.length >= 8) failedTarget = `${cleaned}@s.whatsapp.net`;
      }

      if (failedTarget) {
        const targetNumber = failedTarget.split('@')[0];
        let reportJids = [];

        if (config.ownerNumber) {
          const localOwners = Array.isArray(config.ownerNumber) ? config.ownerNumber : [config.ownerNumber];
          localOwners.forEach(num => {
            const cleanNum = `${num.toString().replace(/\D/g, '')}@s.whatsapp.net`;
            if (!reportJids.includes(cleanNum)) reportJids.push(cleanNum);
          });
        }

        for (const jid of reportJids) {
          try {
            await sock.sendMessage(jid, {
              text: `*〆 [𝐃𝐈𝐏𝐏𝐄𝐑] Échec du rituel de déblocage pour l'entité @${targetNumber}.*\n*Erreur :* ${error.message}`,
              mentions: [failedTarget]
            });
          } catch (e) {
            // Échec silencieux
          }
        }
      }
    }
  }
};
