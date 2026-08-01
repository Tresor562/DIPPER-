/**
 * VCF - Export des membres d'un groupe en fichier de contacts
 * 𝐃𝐈𝐏𝐏𝐄𝐑 Edition — ᴄᴏᴅᴇx ᴅᴇs Ȃᴍᴇs
 * Exporte tous les numéros avec leurs noms de profil WhatsApp
 */

const config = require('../../config.js');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

// ==========================================
// SMALL CAPS — Cohérence visuelle sanctuaire
// ==========================================
function toSmallCaps(text) {
  const normal   = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split('').map(c => {
      const i = normal.indexOf(c);
      return i !== -1 ? smallCaps[i] : c;
    }).join('');
}

// ==========================================
// BARRE DE PROGRESSION TEXTUELLE
// ==========================================
function buildProgressBar(current, total, size = 10) {
  const filled = Math.round((current / total) * size);
  const empty  = size - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ==========================================
// NETTOYAGE DU NOM POUR VCF
// Supprime les caractères problématiques dans le vCard
// ==========================================
function sanitizeName(name) {
  if (!name || name.trim() === '') return null;
  return name
    .replace(/[;:,\\]/g, ' ')   // chars interdits en vCard
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);               // max 60 chars pour un nom propre
}

// ==========================================
// CONSTRUCTION DU BLOC vCard (v3.0)
// ==========================================
function buildVCard(displayName, phoneNumber) {
  const name = sanitizeName(displayName) || `𝐃𝐈𝐏𝐏𝐄𝐑 Contact`;

  // Découpage prénom / nom (si espace détecté)
  const parts     = name.split(' ');
  const firstName = parts[0] || name;
  const lastName  = parts.slice(1).join(' ') || '';

  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name}`,
    `N:${lastName};${firstName};;;`,
    `TEL;TYPE=CELL:+${phoneNumber}`,
    'END:VCARD'
  ].join('\n');
}

// ==========================================
// RÉCUPÉRATION DU NOM DE PROFIL
// Tente pushName → queryContactInfo → fallback numéro
// ==========================================
async function resolveDisplayName(sock, jid, participantMap) {
  const number = jid.split('@')[0];

  // 1. Nom déjà connu dans la map (pushName depuis messages récents)
  if (participantMap[jid]) return participantMap[jid];

  // 2. Tentative via contact store Baileys
  try {
    const contact = await sock.onWhatsApp(jid);
    if (contact?.[0]?.notify) return contact[0].notify;
  } catch (_) {}

  // 3. Fallback : numéro brut
  return `+${number}`;
}

// ==========================================
// MODULE COMMANDE
// ==========================================
module.exports = {
  name: 'vcf',
  aliases: ['contacts', 'membres', 'exportvcf', 'savecontacts', 'vcard'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴇxᴘᴏʀᴛᴇ ᴛᴏᴜs ʟᴇs ᴍᴇᴍʙʀᴇs ᴅᴜ ɢʀᴏᴜᴘᴇ ᴇɴ ғɪᴄʜɪᴇʀ .ᴠᴄғ',
  usage: `${config.prefix || '.'}vcf`,
  groupOnly: true,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const groupJid  = msg.key.remoteJid;
    let   tempFile  = null;

    try {

      // ── PHASE 1 : Récupération metadata du groupe ──────────
      const groupMeta = await sock.groupMetadata(groupJid);
      const participants = groupMeta.participants || [];
      const groupName    = groupMeta.subject || 'Groupe';
      const totalMembers = participants.length;

      if (totalMembers === 0) {
        return await reply(
          `*╭╼━≪• ⚠️ ᴠᴄғ ᴄᴏᴅᴇx •≫━╾╮*\n` +
          `*┃* 🥀 *ɢʀᴏᴜᴘᴇ ᴠɪᴅᴇ — ᴀᴜᴄᴜɴᴇ ᴀ̂ᴍᴇ ᴅᴇ́ᴛᴇᴄᴛᴇ́ᴇ*\n` +
          `*╰━━━━━━━━━━━━━━━━━━━━━╯*\n` +
          extra.phrases.footer()
        );
      }

      // ── PHASE 2 : Message de lancement ────────────────────
      await reply(
        `*╭╼━≪• 📖 ʀɪᴛᴜᴇʟ ᴅ'ᴇxᴛʀᴀᴄᴛɪᴏɴ •≫━╾╮*\n` +
        `*┃* 🔮 *ɢʀᴏᴜᴘᴇ :* ${toSmallCaps(groupName)}\n` +
        `*┃* 👥 *ᴀ̂ᴍᴇs ᴅᴇ́ᴛᴇᴄᴛᴇ́ᴇs :* ${totalMembers}\n` +
        `*┃* ⚗️ *ᴄᴀᴛᴀʟʏsᴇᴜʀ :* ᴠᴄᴀʀᴅ ᴠ3.0\n` +
        `*┃* ⏳ *ᴇ́ᴛᴀᴛ :* ɪɴᴠᴏᴄᴀᴛɪᴏɴ ᴇɴ ᴄᴏᴜʀs...\n` +
        `*╰━━━━━━━━━━━━━━━━━━━━╯*\n` +
        extra.phrases.footer()
      );

      // ── PHASE 3 : Construction des vCards ─────────────────
      // Récupère les pushNames connus via store en mémoire
      const participantMap = {};
      try {
        const contacts = sock.store?.contacts || {};
        for (const [jid, contact] of Object.entries(contacts)) {
          if (contact?.name || contact?.notify) {
            participantMap[jid] = contact.name || contact.notify;
          }
        }
      } catch (_) {}

      const vcards    = [];
      let   resolved  = 0;
      let   skipped   = 0;

      for (const participant of participants) {
        const jid    = participant.id;
        const number = jid.split('@')[0];

        // Ignore les JIDs invalides / broadcast
        if (!number || number.length < 7 || jid.includes('@broadcast')) {
          skipped++;
          continue;
        }

        // Résolution du nom affiché
        const displayName = await resolveDisplayName(sock, jid, participantMap);
        vcards.push(buildVCard(displayName, number));
        resolved++;
      }

      if (vcards.length === 0) {
        return await reply(
          `*╭╼━≪• ⚠️ ᴇ́ᴄʜᴇᴄ ʀɪᴛᴜᴇʟ •≫━╾╮*\n` +
          `*┃* 🥀 *ᴀᴜᴄᴜɴ ɴᴜᴍᴇ́ʀᴏ ᴠᴀʟɪᴅᴇ ᴇxᴛʀᴀɪᴛ*\n` +
          `*╰━━━━━━━━━━━━━━━━━━━━━━━╯*\n` +
          extra.phrases.footer()
        );
      }

      // ── PHASE 4 : Écriture du fichier VCF ─────────────────
      const vcfContent = vcards.join('\n') + '\n';
      const safeGroup  = groupName.replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 30);
      const timestamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName   = `𝐃𝐈𝐏𝐏𝐄𝐑_${safeGroup}_${timestamp}.vcf`;
      tempFile         = path.join(os.tmpdir(), fileName);

      fs.writeFileSync(tempFile, vcfContent, 'utf8');

      // ── PHASE 5 : Envoi du fichier + rapport final ─────────
      const bar        = buildProgressBar(resolved, totalMembers);
      const percentage = Math.round((resolved / totalMembers) * 100);

      const caption =
        `*╭━≪• 📇 ᴄᴏᴅᴇx ᴅᴇs Ȃᴍᴇs •≫╾╮*\n` +
        `*┃* 🔮 *ɢʀᴏᴜᴘᴇ :* ${toSmallCaps(groupName)}\n` +
        `*┃* 👥 *ᴛᴏᴛᴀʟ :* ${totalMembers} ᴀ̂ᴍᴇs\n` +
        `*┃* ✅ *ᴇxᴛʀᴀɪᴛs :* ${resolved} ᴄᴏɴᴛᴀᴄᴛs\n` +
        (skipped > 0 ? `*┃* ⚠️ *ɪɢɴᴏʀᴇ́s :* ${skipped}\n` : '') +
        `*┃* 📊 *ᴘʀᴏɢʀᴇssɪᴏɴ :* [${bar}] ${percentage}%\n` +
        `*┃* 📁 *ғᴏʀᴍᴀᴛ :* ᴠᴄᴀʀᴅ ᴠ3.0\n` +
        `*┃* 💡 *ᴜsᴀɢᴇ :* ᴄʟɪǫᴜᴇ → ɪᴍᴘᴏʀᴛ ᴄᴏɴᴛᴀᴄᴛs\n` +
        `*╰━━━━━━━━━━━━━━━━━━━━╯*\n\n` +
        `_✦ ɴᴏᴍs ʀᴇ́ᴄᴜᴘᴇ́ʀᴇ́s ᴅᴇᴘᴜɪs ʟᴇs ᴘʀᴏғɪʟs ᴡʜᴀᴛsᴀᴘᴘ_\n\n` +
        extra.phrases.footer();

      await sock.sendMessage(groupJid, {
        document: fs.readFileSync(tempFile),
        fileName: fileName,
        mimetype: 'text/x-vcard',       // ← MIME qui déclenche l'import contacts natif
        caption: caption
      }, { quoted: msg });

    } catch (error) {
      console.error('❌ ᴠᴄғ ᴄᴏᴍᴍᴀɴᴅ ᴇʀʀᴏʀ :', error);
      await reply(
        `*╭╼━≪• ❌ ᴇ́ᴄʜᴇᴄ ᴅᴜ ʀɪᴛᴜᴇʟ •≫━╾╮*\n` +
        `*┃* 🥀 *ɪᴍᴘᴏssɪʙʟᴇ ᴅ'ᴇxᴛʀᴀɪʀᴇ ʟᴇs ᴀ̂ᴍᴇs*\n` +
        `*┃* ⚠️ *ᴇʀʀᴇᴜʀ :* ${toSmallCaps(error.message || 'inconnue')}\n` +
        `*╰━━━━━━━━━━━━━━━━━━╯*\n` +
        `> *♰ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`
      );
    } finally {
      // Nettoyage du fichier temporaire
      if (tempFile) {
        try { fs.unlinkSync(tempFile); } catch (_) {}
      }
    }
  }
};
