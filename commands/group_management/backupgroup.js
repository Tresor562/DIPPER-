/**
 * backupgroup / restoregroup — 𝐃𝐚𝐫𝐤
 * Sauvegarde et restauration complète d'un groupe.
 * Tier : Premium
 */
'use strict';

const fs       = require('fs');
const path     = require('path');
const axios    = require('axios');
const database = require('../../database');
const config   = require('../../config');
const sessionContext = require('../../utils/sessionContext');

const prefix = config.prefix || '.';

// ── Dossier de sauvegarde ──────────────────────────────────────────────────
// [PHASE 2] Isolation par session : avant, un seul data/group_backups/
// partagé par TOUTES les sessions. Chaque session a maintenant son propre
// sous-dossier ; migration non destructive des anciennes sauvegardes vers
// sessions/default/ (même schéma que utils/modlog.js et purification.js).
const BACKUP_ROOT = path.join(process.cwd(), 'data', 'group_backups');

let _legacyBackupMigrationDone = false;
function backupDir() {
  const dir = path.join(BACKUP_ROOT, sessionContext.getCurrentSessionId());

  if (!_legacyBackupMigrationDone) {
    _legacyBackupMigrationDone = true;
    try {
      if (sessionContext.getCurrentSessionId() === sessionContext.DEFAULT_SESSION_ID && !fs.existsSync(dir) && fs.existsSync(BACKUP_ROOT)) {
        const legacyFiles = fs.readdirSync(BACKUP_ROOT, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.json'));
        if (legacyFiles.length > 0) {
          fs.mkdirSync(dir, { recursive: true });
          for (const entry of legacyFiles) {
            fs.copyFileSync(path.join(BACKUP_ROOT, entry.name), path.join(dir, entry.name));
          }
          console.log(`[backupgroup] Migration : ${legacyFiles.length} sauvegarde(s) → group_backups/${sessionContext.DEFAULT_SESSION_ID}/`);
        }
      }
    } catch (err) {
      console.error('[backupgroup] migration échouée:', err.message);
    }
  }

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function toSC(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

function backupPath(groupId) {
  return path.join(backupDir(), `${groupId.replace(/[^a-z0-9]/gi, '_')}.json`);
}

module.exports = [
  // ── .backupgroup ──────────────────────────────────────────────
  {
    name    : 'backupgroup',
    aliases : ['savegroup', 'sauvegardegroupe'],
    category: '⚙️ Gestion de groupe',
    description: '『 THE BIG DIPPER 』➪ sᴀᴜᴠᴇɢᴀʀᴅᴇ ᴄᴏᴍᴘʟᴇ̀ᴛᴇ ᴅᴜ ɢʀᴏᴜᴘᴇ',
    usage   : `${prefix}backupgroup`,
    groupOnly: true, adminOnly: true, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from, sender, isOwner, phrases } = extra;

      let meta;
      try { meta = await sock.groupMetadata(from); }
      catch { return reply(`*❌ ${toSC('impossible de recuperer les infos du groupe')}*`); }

      await reply(`*⏳ ${toSC('sauvegarde en cours')}...*`);

      // ── Photo du groupe ──────────────────────────────────────
      let photoBase64 = null;
      try {
        const ppUrl = await sock.profilePictureUrl(from, 'image');
        if (ppUrl) {
          const resp = await axios.get(ppUrl, { responseType: 'arraybuffer', timeout: 10000 });
          photoBase64 = Buffer.from(resp.data).toString('base64');
        }
      } catch (_) {}

      // ── Paramètres du groupe ─────────────────────────────────
      const settings = database.getGroupSettings(from);

      const backup = {
        version     : '1.0',
        savedAt     : Date.now(),
        savedBy     : sender,
        groupId     : from,
        name        : meta.subject || '',
        description : meta.desc    || '',
        photoBase64,
        announce    : meta.announce    || false,
        restrict    : meta.restrict    || false,
        memberAddMode: meta.memberAddMode || false,
        settings,
        // ℹ️ INFORMATIF UNIQUEMENT — instantané des membres au moment de la
        // sauvegarde, à but historique/consultatif. `restoregroup` NE
        // réinvite JAMAIS automatiquement ces membres et NE restaure PAS
        // leur statut admin : un ajout en masse via l'API WhatsApp est
        // risqué (limitations anti-abus, vie privée des utilisateurs).
        participants: meta.participants.map(p => ({
          id   : p.id,
          admin: p.admin || null,
        })),
      };

      const bPath = backupPath(from);
      fs.writeFileSync(bPath, JSON.stringify(backup, null, 2), 'utf8');

      return reply(
        `╭━≪• *✅ ${toSC('sauvegarde reussie')}* •≫━╮\n` +
        `┃ 📛 *${toSC('groupe')}* : ${meta.subject}\n` +
        `┃ 👥 *${toSC('membres')}* : ${meta.participants.length}\n` +
        `┃ 🖼️ *${toSC('photo')}* : ${photoBase64 ? toSC('sauvegardee') : toSC('aucune')}\n` +
        `┃ ⚙️ *${toSC('parametres')}* : ${toSC('inclus')}\n` +
        `┃ 👥 *${toSC('membres enregistres')}* : ${toSC('a titre informatif, non restaures automatiquement')}\n` +
        `┃ 📅 *${toSC('date')}* : ${new Date().toLocaleString('fr-FR')}\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },

  // ── .restoregroup ─────────────────────────────────────────────
  {
    name    : 'restoregroup',
    aliases : ['restaurergroupe', 'reloadgroup'],
    category: '⚙️ Gestion de groupe',
    description: '『 THE BIG DIPPER 』➪ ʀᴇsᴛᴀᴜʀᴇ ᴜɴᴇ sᴀᴜᴠᴇɢᴀʀᴅᴇ ᴅᴇ ɢʀᴏᴜᴘᴇ (ɴᴏᴍ, ᴅᴇsᴄʀɪᴘᴛɪᴏɴ, ᴘʜᴏᴛᴏ, ᴘᴀʀᴀᴍᴇ̀ᴛʀᴇs)',
    usage   : `${prefix}restoregroup`,
    groupOnly: true, adminOnly: true, botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, from, sender, isOwner, isBotAdmin, phrases } = extra;

      const bPath = backupPath(from);
      if (!fs.existsSync(bPath)) {
        return reply(
          `*❌ ${toSC('aucune sauvegarde trouvee pour ce groupe')}*\n` +
          `_${toSC('utilisez')} \`${prefix}backupgroup\` ${toSC('d abord')}_\n\n${phrases.footer()}`
        );
      }

      let backup;
      try { backup = JSON.parse(fs.readFileSync(bPath, 'utf8')); }
      catch { return reply(`*❌ ${toSC('sauvegarde corrompue')}*`); }

      await reply(`*⏳ ${toSC('restauration en cours')}...*`);

      let done = 0;
      const errors = [];

      // 1. Nom du groupe
      try {
        await sock.groupUpdateSubject(from, backup.name);
        done++;
      } catch (e) { errors.push(`nom: ${e.message}`); }

      // 2. Description
      if (backup.description) {
        try {
          await sock.groupUpdateDescription(from, backup.description);
          done++;
        } catch (e) { errors.push(`desc: ${e.message}`); }
      }

      // 3. Photo du groupe
      if (backup.photoBase64) {
        try {
          const buf = Buffer.from(backup.photoBase64, 'base64');
          await sock.updateProfilePicture(from, buf);
          done++;
        } catch (e) { errors.push(`photo: ${e.message}`); }
      }

      // 4. Paramètres (annonce, restriction)
      try {
        await sock.groupSettingUpdate(from, backup.announce ? 'announcement' : 'not_announcement');
        done++;
      } catch (_) {}

      // 5. Restaurer settings DB
      if (backup.settings) {
        database.updateGroupSettings(from, backup.settings);
        done++;
      }

      // ℹ️ NOTE : backup.participants n'est JAMAIS utilisé ici, par choix
      // délibéré. Réinviter des membres en masse via l'API WhatsApp est
      // risqué (limitations anti-abus, vie privée) — cette donnée reste
      // informative/historique uniquement (voir backupgroup ci-dessus).

      return reply(
        `╭━≪• *✅ ${toSC('restauration terminee')}* •≫━╮\n` +
        `┃ ✔️ *${toSC('actions reussies')}* : ${done}\n` +
        `┃ ⚠️ *${toSC('erreurs')}* : ${errors.length > 0 ? errors.join(', ') : toSC('aucune')}\n` +
        `┃ 📅 *${toSC('sauvegarde du')}* : ${new Date(backup.savedAt).toLocaleString('fr-FR')}\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },
];
