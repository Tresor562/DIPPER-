/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   𝐃𝐚𝐫𝐤 — Commande .pair Multi-Utilisateurs               ║
 * ║   commands/bot_sovereignty/pair.js                           ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * FONCTIONNEMENT :
 *   1. Owner fait : .pair 22912345678
 *   2. Le bot crée une nouvelle session Baileys pour ce numéro
 *   3. Génère un code de connexion à 8 chiffres
 *   4. L'utilisateur entre le code dans WhatsApp
 *   5. La session est sauvegardée dans MongoDB
 *   6. Reconnexion automatique au redémarrage
 *
 * PROTECTIONS :
 *   - Owner uniquement
 *   - Timeout 20s sur requestPairingCode
 *   - Anti-doublon (pas 2 sessions pour le même numéro)
 *   - try/catch sur toutes les opérations
 */

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   𝐃𝐚𝐫𝐤 — Commande .pair Multi-Utilisateurs               ║
 * ║   commands/bot_sovereignty/pair.js                           ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * FONCTIONNEMENT :
 *   1. N'IMPORTE QUEL utilisateur fait : .pair 22912345678
 *   2. Le bot crée une nouvelle session Baileys pour ce numéro
 *      (via le Pairing Service neutre, utils/pairingService.js)
 *   3. Génère un code de connexion
 *   4. L'utilisateur entre le code dans WhatsApp
 *   5. La session est sauvegardée dans MongoDB
 *   6. Reconnexion automatique au redémarrage
 *
 * [PHASE 3] self-service : n'importe quel utilisateur peut appairer un
 * numéro, sans passer par le owner. Ce fichier ne fait que : lire les
 * arguments, appeler utils/pairingService.js, et afficher le résultat
 * au format WhatsApp — toute la logique de création de session vit dans
 * le Pairing Service (partagée avec le futur Telegram/Web, aucune
 * logique dupliquée).
 *
 * PROTECTIONS (déplacées dans le Pairing Service, canal-agnostiques) :
 *   - Anti-abus : cooldown par expéditeur
 *   - Anti-doublon (pas 2 sessions pour le même numéro)
 *   - Timeout sur requestPairingCode
 *   - Rollback si le code échoue après création de la session
 */

const config  = require('../../config');
const prefix  = config.prefix || '.';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${ms / 1000}s) — ${label}`)), ms)
    )
  ]);
}

function safeErrMsg(err) {
  if (!err) return 'ᴇʀʀᴇᴜʀ ɪɴᴄᴏɴɴᴜᴇ';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

module.exports = {
  name: 'pair',
  aliases: ['paircode', 'connexion', 'connect', 'newsession', 'addsession'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄʀᴇ́ᴇ ᴜɴᴇ ɴᴏᴜᴠᴇʟʟᴇ sᴇssɪᴏɴ ᴡʜᴀᴛsᴀᴘᴘ (self-service)',
  usage: `${prefix}pair +22912345678`,

  async execute(sock, msg, args, extra) {
    const { reply, from } = extra;

    const rawNumber = args[0];
    if (!rawNumber) {
      return reply(
        `*〆 ɪɴᴅɪǫᴜᴇ ᴜɴ ɴᴜᴍᴇ́ʀᴏ !*\n\n` +
        `*📌 ᴜsᴀɢᴇ :* \`${prefix}pair +22912345678\`\n\n` +
        extra.phrases.footer()
      );
    }

    const cleanNumber = String(rawNumber).replace(/\D/g, '');
    if (cleanNumber.length < 7) {
      return reply(
        `*〆 ɴᴜᴍᴇ́ʀᴏ ɪɴᴠᴀʟɪᴅᴇ !*\n` +
        `*ᴇxᴇᴍᴘʟᴇ :* \`${prefix}pair +22912345678\`\n\n` +
        extra.phrases.footer()
      );
    }

    // ── MODE MONO-SESSION : connexion directe via le socket existant ──────
    // (si pas de MONGODB_URI, utilise l'ancienne méthode — inchangé)
    if (!process.env.MONGODB_URI) {
      return await _pairLegacy(sock, msg, args, extra, cleanNumber);
    }

    // ── MODE MULTI-SESSION : via le Pairing Service neutre ────────────────
    return await _pairViaService(sock, msg, args, extra, cleanNumber, from);
  }
};

// ── MODE LEGACY (mono-session, pas de MongoDB) ────────────────────────────
// Inchangé — ne concerne pas le multi-session, pas de Pairing Service ici.
async function _pairLegacy(sock, msg, args, extra, cleanNumber) {
  const { reply, from } = extra;

  if (typeof sock?.requestPairingCode !== 'function') {
    return reply(`*❌ ᴍᴇ́ᴛʜᴏᴅᴇ ɴᴏɴ ᴅɪsᴘᴏɴɪʙʟᴇ — ʙᴏᴛ ᴘᴀs ᴘʀᴇ̂ᴛ.*\n\n` + extra.phrases.footer());
  }

  await reply(`*⏳ ɢᴇ́ɴᴇ́ʀᴀᴛɪᴏɴ ᴇɴ ᴄᴏᴜʀs...*\n*📱 +${cleanNumber}*\n\n` + extra.phrases.footer());

  let code;
  try {
    const raw = await withTimeout(sock.requestPairingCode(cleanNumber), 20000, 'requestPairingCode');
    code = raw?.match(/.{1,4}/g)?.join('-') || raw || '????-????';
  } catch (err) {
    try {
      await reply(`*❌ ᴇ́ᴄʜᴇᴄ :* ${safeErrMsg(err)}\n\n` + extra.phrases.footer());
    } catch {}
    return;
  }

  try {
    await sock.sendMessage(from, {
      text:
        `╭━≪• *🔑 ᴄᴏᴅᴇ ᴅᴇ ᴄᴏɴɴᴇxɪᴏɴ* •≫━╾╮\n` +
        `┃\n` +
        `┃  *${code}*\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n` +
        `📱 *ᴇ́ᴛᴀᴘᴇs :*\n` +
        `*1.* WhatsApp → ⚙️ Paramètres\n` +
        `*2.* Appareils connectés\n` +
        `*3.* Connecter avec un numéro\n` +
        `*4.* ᴇɴᴛʀᴇ ᴄᴇ ᴄᴏᴅᴇ\n\n` +
        `⚠️ *Expire en quelques minutes*\n\n` +
        extra.phrases.footer()
    }, { quoted: msg });
  } catch (sendErr) {
    console.error('[pair legacy] Erreur envoi code:', safeErrMsg(sendErr));
  }
}

// ── MODE MULTI-SESSION — via utils/pairingService.js ──────────────────────
// Ce bloc est spécifique à WhatsApp UNIQUEMENT dans sa façon d'afficher le
// résultat (sock.sendMessage / reply). La création de session, l'anti-abus,
// l'anti-doublon et le rollback vivent tous dans le Pairing Service.
async function _pairViaService(sock, msg, args, extra, cleanNumber, from) {
  const { reply, sender } = extra;
  const { createPairingSession, PairingError } = require('../../utils/pairingService');

  await reply(
    `*⏳ ᴄʀᴇ́ᴀᴛɪᴏɴ ᴅᴇ ʟᴀ sᴇssɪᴏɴ ᴇɴ ᴄᴏᴜʀs...*\n` +
    `*📱 ɴᴜᴍᴇ́ʀᴏ :* +${cleanNumber}\n\n` +
    extra.phrases.footer()
  );

  try {
    // requesterKey identifie qui fait la demande, pour le cooldown côté
    // service — le JID de l'expéditeur convient (from = le chat, sender =
    // l'expéditeur réel, utile si appelé depuis un groupe).
    const { pairingCode, reconnected } = await createPairingSession(cleanNumber, {
      requesterKey: sender || from,
    });

    if (reconnected) {
      return reply(
        `╭━≪• *🔄 sᴇssɪᴏɴ ʀᴇᴄᴏɴɴᴇᴄᴛᴇ́ᴇ* •≫━╾╮\n` +
        `┃\n` +
        `┃ 📱 +${cleanNumber}\n` +
        `┃ ✅ ᴄᴇ ɴᴜᴍᴇ́ʀᴏ ᴇ́ᴛᴀɪᴛ ᴅᴇ́ᴊᴀ̀ ᴀᴘᴘᴀɪʀᴇ́ — ʀᴇᴄᴏɴɴᴇxɪᴏɴ ᴀᴜᴛᴏᴍᴀᴛɪǫᴜᴇ ᴀᴠᴇᴄ ʟᴇs ɪᴅᴇɴᴛɪꜰɪᴀɴᴛs ᴇxɪsᴛᴀɴᴛs.\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n` +
        extra.phrases.footer()
      );
    }

    return reply(
      `╭━≪• *🔑 ᴄᴏᴅᴇ ᴅᴇ ᴄᴏɴɴᴇxɪᴏɴ* •≫━╾╮\n` +
      `┃\n` +
      `┃  *${pairingCode}*\n` +
      `┃\n` +
      `╰━━━━━━━━━━━━━━━━━━━╯\n\n` +
      `📱 *ɴᴜᴍᴇ́ʀᴏ :* +${cleanNumber}\n\n` +
      `📱 *ᴇ́ᴛᴀᴘᴇs :*\n` +
      `*1.* ᴏᴜᴠʀᴇ WhatsApp\n` +
      `*2.* ⚙️ Paramètres → Appareils connectés\n` +
      `*3.* Connecter avec un numéro\n` +
      `*4.* ᴇɴᴛʀᴇ ᴄᴇ ᴄᴏᴅᴇ\n\n` +
      `⚠️ *ᴄᴇ ᴄᴏᴅᴇ ᴇxᴘɪʀᴇ ᴇɴ ǫᴜᴇʟǫᴜᴇs ᴍɪɴᴜᴛᴇs*\n\n` +
      extra.phrases.footer()
    );

  } catch (err) {
    console.error('[pair multi] error:', err.message);

    if (err instanceof PairingError) {
      const messages = {
        NO_MONGODB    : `*❌ MongoDB non configuré.*`,
        DB_UNAVAILABLE: `*❌ Connexion à la base de données impossible. Réessaie dans un instant.*`,
        INVALID_NUMBER: `*❌ Numéro invalide.*`,
        COOLDOWN      : `*⏳ ${err.message}*`,
        ALREADY_ACTIVE: `*⚠️ ${err.message}*`,
        CODE_FAILED   : `*❌ Échec de génération du code :* ${err.message}`,
      };
      return reply((messages[err.code] || `*❌ ${err.message}*`) + `\n\n` + extra.phrases.footer());
    }

    return reply(
      `*❌ ᴇ́ᴄʜᴇᴄ ᴄʀᴇ́ᴀᴛɪᴏɴ sᴇssɪᴏɴ :*\n` +
      `${safeErrMsg(err)}\n\n` +
      extra.phrases.footer()
    );
  }
}
