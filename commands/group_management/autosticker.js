/**
 * AutoSticker Command - Enable or disable auto-sticker conversion
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 */

const database = require('../../database');
const config = require('../../config.js');
const sessionContext = require('../../utils/sessionContext');

// ── Protection anti-spam locale, dédiée à l'auto-sticker ──────────────────
// N'affecte en rien la commande .sticker utilisée manuellement : ce cooldown
// ne s'applique qu'au déclenchement automatique (handler.js), pas ici.
const _autoStickerLastUse = new Map(); // sender -> timestamp du dernier auto-sticker
const AUTO_STICKER_COOLDOWN_MS = 8000;  // 8 secondes entre deux conversions auto par membre
const AUTO_STICKER_STALE_MS    = 60 * 60 * 1000; // 1h : au-delà, une entrée est jugée périmée
const AUTO_STICKER_SWEEP_AT    = 500;   // déclenche un balayage seulement si la Map grossit

/**
 * Vérifie si l'expéditeur peut déclencher une conversion auto-sticker
 * maintenant (anti-spam léger). Met à jour le timestamp si autorisé.
 *
 * Nettoyage : pas de timer global — un balayage opportuniste des entrées
 * périmées (>1h d'inactivité) se déclenche seulement quand la Map dépasse
 * AUTO_STICKER_SWEEP_AT entrées, directement au fil des appels normaux.
 * Coût amorti, aucun processus en arrière-plan.
 */
function canAutoSticker(senderJid) {
  const now = Date.now();
  const key = sessionContext.scopeKey(senderJid);

  if (_autoStickerLastUse.size > AUTO_STICKER_SWEEP_AT) {
    for (const [scopedKey, ts] of _autoStickerLastUse) {
      if (now - ts > AUTO_STICKER_STALE_MS) _autoStickerLastUse.delete(scopedKey);
    }
  }

  const last = _autoStickerLastUse.get(key) || 0;
  if (now - last < AUTO_STICKER_COOLDOWN_MS) return false;
  _autoStickerLastUse.set(key, now);
  return true;
}

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
  name: 'autosticker',
  aliases: ['autos', 'asticker', 'ᴀᴜᴛᴏsᴛɪᴄᴋᴇʀ'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴄᴛɪᴠᴇ/ᴅᴇ́sᴀᴄᴛɪᴠᴇ ʟᴀ ᴍᴇ́ᴛᴀᴍᴏʀᴘʜᴏsᴇ ᴀᴜᴛᴏ-sᴛɪᴄᴋᴇʀ',
  usage: `${config.prefix || '.'}autosticker <on/off>`,
  groupOnly: true,
  adminOnly: false, // On laisse le traitement manuel ci-dessous pour inclure les Maîtres
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin } = extra;
    const prefix = config.prefix || '.';

    try {
      // 🛡️ SÉCURITÉ GÉRÉE PAR LE HANDLER
      // isOwner est extrait en amont par le Handler et reconnaît tes numéros maîtres.
      const isMe = msg.key.fromMe || isOwner;

      // 🚨 ÉVALUATION DES DROITS
      if (!isMe && !isAdmin) {
        return reply(`*❌ ${toSmallCaps('cette commande est reservee aux administrateurs du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      const chatId = msg.key.remoteJid;

      if (!args[0]) {
        const settings = database.getGroupSettings(chatId);
        const status = settings.autosticker ? '🛡️ ᴇ́ᴠᴇɪʟʟᴇ́ (ᴏɴ)' : '🔓 ᴇɴᴅᴏʀᴍɪ (ᴏғғ)';

        return reply(
          `*╭╼≪• sᴛᴀᴛᴜᴛ ᴀʀᴄᴀɴᴇ_sᴛɪᴄᴋᴇʀ •≫━╮*\n` +
          `*┃* *ᴇ́ᴛᴀᴛ* : ${status}\n\n` +
          `*┃* 🔮 *${toSmallCaps('incantations disponibles')} :*\n` +
          `*┃* *${toSmallCaps('cet arcane metamorphose automatiquement')}*\n` +
          `*┃* *${toSmallCaps('les images et videos en stickers')}.*\n\n` +
          `  ${prefix}autosticker on\n` +
          `  ${prefix}autosticker off\n\n` +
          extra.phrases.footer()
        );
      }

      const opt = args[0].toLowerCase();
      const currentSettings = database.getGroupSettings(chatId);

      // Activation
      if (opt === 'on' || opt === 'true') {
        if (currentSettings.autosticker) {
          return reply(`*❌ ${toSmallCaps('l arcane sticker est deja actif dans ce sanctuaire')} !*\n\n${extra.phrases.footer()}`);
        }

        database.updateGroupSettings(chatId, { autosticker: true });
        return reply(`*🛡️ ${toSmallCaps('l arcane sticker a ete eveille avec succes')} (ᴏɴ).*\n\n${extra.phrases.footer()}`);
      }

      // Désactivation
      if (opt === 'off' || opt === 'false') {
        if (!currentSettings.autosticker) {
          return reply(`*❌ ${toSmallCaps('l arcane sticker est deja endormi')} !*\n\n${extra.phrases.footer()}`);
        }

        database.updateGroupSettings(chatId, { autosticker: false });
        return reply(`*🔓 ${toSmallCaps('la metamorphose de l arcane sticker a ete scellee')} (ᴏғғ).*\n\n${extra.phrases.footer()}`);
      }

      return reply(`*💡 ${toSmallCaps('utilise')} \`${prefix}autosticker\` ${toSmallCaps('pour voir les options valides')}.*\n\n${extra.phrases.footer()}`);

    } catch (error) {
      return reply(`❌ *${toSmallCaps('erreur')} :* ${error.message}\n\n${extra.phrases.footer()}`);
    }
  }
};

// Export nommé pour handler.js — protection anti-spam de l'auto-sticker
module.exports.canAutoSticker = canAutoSticker;
