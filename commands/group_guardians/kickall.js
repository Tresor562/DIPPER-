/**
 * kickall — 𝐃𝐚𝐫𝐤 Edition v8 — CORRECTION DÉFINITIVE
 *
 * ════════════════════════════════════════════════════════
 * HISTORIQUE DES BUGS
 * ════════════════════════════════════════════════════════
 *
 * v5 : require('../../handler') → dépendance circulaire
 *      → handler partiel → findParticipant = undefined
 *      → "findParticipant is not a function"
 *
 * v6 : require('../../utils/participantUtils') → nouveau fichier
 *      créé de toutes pièces qui duplique jidHelpers.js.
 *      Problème : participantUtils.js importe jidDecode/jidEncode
 *      de @whiskeysockets/baileys AU NIVEAU MODULE (top-level).
 *      Si Baileys n'est pas encore résolu au moment du chargement
 *      → le module entier échoue silencieusement → exports vide
 *      → findParticipant = undefined → même erreur.
 *
 * v7 (CETTE VERSION) : utilise jidHelpers.js
 *      ✅ Déjà utilisé par demote.js et promote.js qui fonctionnent
 *      ✅ Aucune dépendance circulaire
 *      ✅ Aucune duplication de code
 *      ✅ Testé en production dans ce projet
 *      ✅ isParticipantAdmin ajouté localement (3 lignes, trivial)
 *
 * ════════════════════════════════════════════════════════
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const config   = require('../../config');
const database = require('../../database');
const sessionContext = require('../../utils/sessionContext');
const prefix = config.prefix || '.';

// ── Import depuis jidHelpers.js (la même source que demote/promote) ────────
// PAS depuis participantUtils (instable) ni depuis handler (circulaire)
const { findParticipant } = require('../../utils/jidHelpers');

// [PHASE 2] Isolation par session : avant, un seul data/kickall_config.json
// partagé par TOUTES les sessions (config de nom/image/texte/délai post-kickall
// d'un groupe visible/modifiable depuis n'importe quelle autre session).
let _legacyKickallCfgMigrationDone = false;
function CFG_PATH() {
  const dir = path.join(process.cwd(), 'database', 'sessions', sessionContext.getCurrentSessionId());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'kickall_config.json');
  if (!_legacyKickallCfgMigrationDone) {
    _legacyKickallCfgMigrationDone = true;
    try {
      const legacy = path.join(process.cwd(), 'data', 'kickall_config.json');
      if (sessionContext.getCurrentSessionId() === sessionContext.DEFAULT_SESSION_ID && fs.existsSync(legacy) && !fs.existsSync(target)) {
        fs.copyFileSync(legacy, target);
      }
    } catch (_) {}
  }
  return target;
}

// ── Helpers locaux ─────────────────────────────────────────────────────────

function toSC(t) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Vérifie si un participant est admin/superadmin ─────────────────────────
function isParticipantAdmin(p) {
  if (!p) return false;
  const a = p.admin ?? p.isAdmin ?? p.isSuperAdmin;
  return a === 'admin' || a === 'superadmin' || a === true;
}

// ── Charger la config setkickall pour ce groupe ────────────────────────────
function loadCfg() {
  try {
    return fs.existsSync(CFG_PATH())
      ? JSON.parse(fs.readFileSync(CFG_PATH(), 'utf8'))
      : {};
  } catch { return {}; }
}
function getGroupCfg(id) { return loadCfg()[id] || {}; }

// ── Fetch métadonnées fraîches avec timeout ────────────────────────────────
async function fetchLiveMeta(sock, groupId) {
  return Promise.race([
    sock.groupMetadata(groupId),
    new Promise((_, r) => setTimeout(() => r(new Error('timeout groupMetadata 8s')), 8000)),
  ]);
}

// ── Construire tous les JIDs possibles du bot ──────────────────────────────
// sock.user.id peut être "2290XXXXXXX:0@s.whatsapp.net" ou un LID "XXXX@lid"
// On génère toutes les formes pour que findParticipant puisse matcher
function buildBotJids(sock) {
  const ids = [sock.user?.id, sock.user?.lid].filter(Boolean);
  const result = new Set();
  for (const id of ids) {
    result.add(id);
    // Forme sans device ID : "2290XXXXXXX@s.whatsapp.net"
    const num = id.split(':')[0].split('@')[0];
    result.add(`${num}@s.whatsapp.net`);
    result.add(`${num}@c.us`);
  }
  return [...result];
}

// ── Vérifier si un participant est le bot ─────────────────────────────────
function participantIsBot(p, botJids) {
  return findParticipant([p], botJids) !== null;
}

// ── Vérifier si un JID correspond à un owner/sudo du bot ──────────────────
function isBotOwnerOrSudo(jid) {
  const num = String(jid || '').split(':')[0].split('@')[0].replace(/\D/g, '');
  const protected_ = [
    ...(config.ownerNumber    || []),
    ...(config.supremeOwners  || []),
  ].map(n => String(n).replace(/\D/g, ''));
  if (protected_.includes(num)) return true;

  // [FIX AUDIT kickall] Les sudo users sont stockés dynamiquement en base
  // (database.js, via .sudo), PAS dans config.js. L'ancienne version ne
  // vérifiait que config.ownerNumber/supremeOwners : un sudo qui est un
  // membre normal du groupe (pas admin WhatsApp) était donc expulsable
  // malgré le libellé "owner/sudo bot" affiché dans le rapport de skip.
  try {
    return database.getAllUsers()
      .some(u => u.isSudo === true && String(u.id).replace(/\D/g, '') === num);
  } catch (_) {
    return false;
  }
}

// ── Invalider le cache groupe du handler (sans import circulaire) ──────────
// Le require() ici est LAZY (à l'exécution, pas au chargement du module)
// À ce moment, handler.js est DÉJÀ complètement chargé → pas de circularité
function invalidateGroupCache(groupId) {
  try {
    const h = require('../../handler');
    if (typeof h.invalidateGroupMetadataCache === 'function') {
      h.invalidateGroupMetadataCache(groupId);
    }
  } catch (_) {}
}

// ── Verrou anti-double-exécution par groupe ────────────────────────────────
const _running = new Map();

// ══════════════════════════════════════════════════════════════════════════
// COMMANDE PRINCIPALE
// ══════════════════════════════════════════════════════════════════════════
module.exports = {
  name          : 'kickall',
  aliases       : ['expulsetous', 'vidergroupe', 'cleargroup'],
  category: '🛡️ Protections',
  groupOnly     : true,
  ownerOnly     : false,
  botAdminNeeded: true,
  description   : '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴇxᴘᴜʟsᴇ ᴛᴏᴜs ʟᴇs ᴍᴇᴍʙʀᴇs ᴅᴜ ɢʀᴏᴜᴘᴇ',
  usage         : `${prefix}kickall`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, isSudo, from, phrases, sender } = extra;

    // ═══════════════════════════════════════════════════════════
    // DIAGNOSTIC : log systématique à chaque exécution
    // ═══════════════════════════════════════════════════════════
    console.log(`\n${'═'.repeat(65)}`);
    console.log(`[kickall v8] ▶ DÉMARRAGE`);
    console.log(`[kickall v8] Groupe   : ${from}`);
    console.log(`[kickall v8] Sender   : ${sender}`);
    console.log(`[kickall v8] isOwner  : ${isOwner}`);
    console.log(`[kickall v8] isAdmin  : ${isAdmin}`);
    console.log(`[kickall v8] isSudo   : ${isSudo}`);
    console.log(`[kickall v8] Bot ID   : ${sock.user?.id}`);
    console.log(`[kickall v8] Bot LID  : ${sock.user?.lid || 'N/A'}`);
    console.log(`[kickall v8] jidHelpers.findParticipant type : ${typeof findParticipant}`);
    console.log(`${'═'.repeat(65)}`);

    // ── Vérification accès ─────────────────────────────────────
    // [FIX BUG 1] extra.isAdmin vient du cache handler (5 min) — peut être périmé.
    // On ne bloque PAS sur cette valeur incertaine.
    // La vérification réelle et fiable se fait à l'ÉTAPE 3, après le fetch
    // LIVE de sock.groupMetadata() (toujours fresh, jamais caché).
    // Seul cas bloqué ici : utilisateur non-owner, non-sudo, ET
    // extra.isAdmin === false (le handler a utilisé getLiveGroupMetadata,
    // donc c'est fiable quand il est false strict).
    if (!isOwner && !isSudo && extra.isAdmin === false) {
      console.log(`[kickall v8] ⛔ Accès refusé — non-admin confirmé par handler live`);
      return reply(`*⛔ ${toSC('admin ou owner requis pour kickall')}*\n\n${phrases.footer()}`);
    }

    // ── Verrou anti-double ─────────────────────────────────────
    if (_running.get(sessionContext.scopeKey(from))) {
      return reply(
        `*⏳ ${toSC('kickall deja en cours sur ce groupe')}*\n` +
        `_${toSC('attendez la fin')}_\n\n${phrases.footer()}`
      );
    }
    _running.set(sessionContext.scopeKey(from), true);

    try {

      // ═══════════════════════════════════════════════════════
      // ÉTAPE 1 : Métadonnées fraîches (jamais le cache)
      // ═══════════════════════════════════════════════════════
      let meta;
      try {
        console.log(`[kickall v8] Fetch métadonnées LIVE...`);
        meta = await fetchLiveMeta(sock, from);
        console.log(`[kickall v8] ✅ Métadonnées reçues`);
      } catch (e) {
        _running.delete(sessionContext.scopeKey(from));
        console.error(`[kickall v8] ❌ Métadonnées FAIL : ${e.message}`);
        return reply(
          `*❌ ${toSC('impossible de recuperer les infos du groupe')}*\n` +
          `_${e.message}_\n\n${phrases.footer()}`
        );
      }

      const participants = meta.participants || [];

      // ── Log complet des participants ───────────────────────
      console.log(`[kickall v8] Participants (${participants.length}) :`);
      participants.forEach((p, i) => {
        console.log(`  [${i}] id=${p.id} | lid=${p.lid || '-'} | admin=${p.admin ?? 'null'}`);
      });

      // ═══════════════════════════════════════════════════════
      // ÉTAPE 2 : Vérification bot admin
      // ═══════════════════════════════════════════════════════
      const botJids   = buildBotJids(sock);
      console.log(`[kickall v8] Bot JIDs cherchés : ${botJids.join(', ')}`);

      const botEntry  = findParticipant(participants, botJids);
      const botAdmin  = botEntry ? isParticipantAdmin(botEntry) : false;

      console.log(`[kickall v8] Bot entry trouvé : ${botEntry ? `id=${botEntry.id} admin=${botEntry.admin}` : 'NON TROUVÉ dans la liste'}`);
      console.log(`[kickall v8] Bot admin : ${botAdmin ? '✅ OUI' : '❌ NON'}`);

      if (!botAdmin) {
        _running.delete(sessionContext.scopeKey(from));
        return reply(
          `*⛔ ${toSC('le bot n est pas admin dans ce groupe')}*\n` +
          `_${toSC('promouvez le bot administrateur puis reessayez')}_\n\n${phrases.footer()}`
        );
      }

      // ═══════════════════════════════════════════════════════
      // ÉTAPE 3 : Vérification sender admin (via métadonnées fraîches)
      // [FIX BUG 1] C'est ici que se fait la vraie vérification — après fetch LIVE.
      // extra.isAdmin (basé sur le cache) est ignoré : on utilise les participants
      // fraîchement récupérés par fetchLiveMeta() ci-dessus.
      // ═══════════════════════════════════════════════════════
      const senderEntry  = findParticipant(participants, sender);
      // [FIX BUG 2] Si senderEntry est null (LID non résolu ou JID non trouvé),
      // on se rabat sur extra.isAdmin comme valeur de secours plutôt que de
      // rejeter l'utilisateur qui est peut-être réellement admin.
      const senderAdminFromMeta = senderEntry ? isParticipantAdmin(senderEntry) : null;
      const senderAdmin  = isOwner || isSudo ||
        (senderAdminFromMeta !== null ? senderAdminFromMeta : (extra.isAdmin === true));

      console.log(`[kickall v8] Sender entry : ${senderEntry ? `id=${senderEntry.id} admin=${senderEntry.admin}` : 'NON TROUVÉ — fallback extra.isAdmin=' + extra.isAdmin}`);
      console.log(`[kickall v8] Sender admin : ${senderAdmin ? '✅' : '❌'}`);

      if (!senderAdmin) {
        _running.delete(sessionContext.scopeKey(from));
        return reply(
          `*⛔ ${toSC('tu n es pas admin dans ce groupe')}*\n\n${phrases.footer()}`
        );
      }

      // ═══════════════════════════════════════════════════════
      // ÉTAPE 4 : Construire la liste d'expulsion
      // ═══════════════════════════════════════════════════════
      const toKick  = [];
      const skipped = [];

      // Compteurs pour le rapport de diagnostic
      let countAdmins    = 0;
      let countBot       = 0;
      let countOwners    = 0;
      let countInvalidJid = 0;
      let countMembers   = 0;

      for (const p of participants) {
        const adminVal = p.admin ?? p.isAdmin ?? p.isSuperAdmin;
        const isAdminP = adminVal === 'admin' || adminVal === 'superadmin' || adminVal === true;

        // Protégé 1 : tous les admins et owner du groupe
        if (isAdminP) {
          countAdmins++;
          skipped.push({ jid: p.id, raison: 'admin/owner groupe' });
          continue;
        }
        // Protégé 2 : le bot lui-même
        if (participantIsBot(p, botJids)) {
          countBot++;
          skipped.push({ jid: p.id, raison: 'bot lui-même' });
          continue;
        }
        // Protégé 3 : owners et sudo du bot
        if (isBotOwnerOrSudo(p.id)) {
          countOwners++;
          skipped.push({ jid: p.id, raison: 'owner/sudo bot' });
          continue;
        }

        // ─── Résolution du JID pour l'expulsion ─────────────────────
        // [FIX v8] En Baileys v6 avec LIDs, p.id peut être "XXXX@lid"
        // Baileys v6 n'accepte PAS les LIDs dans groupParticipantsUpdate
        // → il faut utiliser p.id s'il est en @s.whatsapp.net/@c.us
        //   OU chercher le JID réel via les mappings LID si disponible
        // → fallback : utiliser le JID tel quel (Baileys peut le résoudre)

        const isStandardJid = p.id?.endsWith('@s.whatsapp.net') || p.id?.endsWith('@c.us');
        const isLidJid      = p.id?.endsWith('@lid') || p.id?.endsWith('@hosted.lid');

        // [FIX v8] Résoudre le LID en JID standard si possible
        let kickJid = p.id;

        if (!isStandardJid && isLidJid) {
          // Tenter la résolution LID → PN via jidHelpers
          try {
            const { buildComparableIds } = require('../../utils/jidHelpers');
            const variants = buildComparableIds(p.id);
            const pnVariant = variants.find(v => v.endsWith('@s.whatsapp.net'));
            if (pnVariant) {
              kickJid = pnVariant;
              console.log(`[kickall v8] LID résolu: ${p.id} → ${kickJid}`);
            } else {
              // Utiliser le LID directement — Baileys v6 peut le gérer
              console.log(`[kickall v8] LID non résolu, utilisation directe: ${p.id}`);
            }
          } catch (_) {
            console.log(`[kickall v8] Erreur résolution LID, utilisation directe: ${p.id}`);
          }
        } else if (!isStandardJid && !isLidJid) {
          // JID vraiment invalide (ni standard ni LID)
          countInvalidJid++;
          skipped.push({ jid: p.id, raison: `JID format inconnu: ${p.id?.split('@')[1] || 'N/A'}` });
          continue;
        }

        countMembers++;
        toKick.push(kickJid);
      }

      // ─── Rapport détaillé de diagnostic ──────────────────────────
      console.log(`[kickall v8] ════ DIAGNOSTIC FILTRAGE ════`);
      console.log(`[kickall v8] Total participants  : ${participants.length}`);
      console.log(`[kickall v8] Admins détectés     : ${countAdmins}`);
      console.log(`[kickall v8] Bot exclu           : ${countBot}`);
      console.log(`[kickall v8] Owners/sudo exclus  : ${countOwners}`);
      console.log(`[kickall v8] JID invalides       : ${countInvalidJid}`);
      console.log(`[kickall v8] Membres normaux     : ${countMembers}`);
      console.log(`[kickall v8] À expulser          : ${toKick.length}`);
      console.log(`[kickall v8] Skippés (détail) :`);
      skipped.forEach(s => console.log(`[kickall v8]   └ ${s.jid} → ${s.raison}`));
      if (toKick.length > 0) {
        console.log(`[kickall v8] Liste toKick :`);
        toKick.forEach(j => console.log(`[kickall v8]   └ ${j}`));
      }
      console.log(`[kickall v8] ══════════════════════════════`);

      if (toKick.length === 0) {
        _running.delete(sessionContext.scopeKey(from));
        // Message de diagnostic enrichi pour identifier le vrai problème
        const diagMsg =
          `*⚠️ ${toSC('aucun membre a expulser')}*\n\n` +
          `📊 *${toSC('rapport')}* :\n` +
          `┃ 👥 ${toSC('total')}    : ${participants.length}\n` +
          `┃ 👑 ${toSC('admins')}   : ${countAdmins}\n` +
          `┃ 👤 ${toSC('membres')}  : ${countMembers}\n` +
          `┃ 🤖 ${toSC('bot')}      : ${countBot}\n` +
          `┃ 🛡️ ${toSC('proteges')} : ${countOwners}\n` +
          (countInvalidJid > 0 ? `┃ ❓ ${toSC('jid inconnus')} : ${countInvalidJid}\n` : '') +
          `\n_${toSC('consultez les logs railway pour le detail')}_\n\n${phrases.footer()}`;
        return reply(diagMsg);
      }

      // ═══════════════════════════════════════════════════════
      // ÉTAPE 5 : Config setkickall
      // ═══════════════════════════════════════════════════════
      const cfg      = getGroupCfg(from);
      const newName  = cfg.newName        || null;
      const newImage = cfg.newImageBase64 || null;
      const warnText = cfg.warningText    || null;
      const rawDelay = Math.max(3, Math.min(parseInt(cfg.delay) || 5, 300));

      // ═══════════════════════════════════════════════════════
      // ÉTAPE 6 : Annonce initiale
      // ═══════════════════════════════════════════════════════
      await reply(
        `╭━≪• *⚔️ ${toSC('kickall initialise')}* •≫━╮\n` +
        `┃ 👥 ${toSC('detectes')}   : ${participants.length}\n` +
        `┃ 🎯 ${toSC('a expulser')} : ${toKick.length}\n` +
        `┃ 🛡️ ${toSC('proteges')}   : ${skipped.length}\n` +
        `┃ ⏱️ ${toSC('delai')}      : ${rawDelay}s\n` +
        `┃ 📛 ${toSC('nom')}        : ${newName  ? `✅ ${newName}` : toSC('aucun')}\n` +
        `┃ 🖼️ ${toSC('photo')}      : ${newImage ? '✅' : toSC('aucune')}\n` +
        `┃ 💬 ${toSC('message')}    : ${warnText ? '✅' : toSC('par defaut')}\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
      await sleep(800);

      // ═══════════════════════════════════════════════════════
      // ÉTAPE 7 [ORDRE 1/3] : Changer le nom
      // ═══════════════════════════════════════════════════════
      if (newName) {
        console.log(`[kickall v8] [1/3] Changement nom → "${newName}"`);
        try {
          await sock.groupUpdateSubject(from, newName);
          console.log(`[kickall v8] [1/3] ✅ Nom changé`);
          await sleep(1500);
        } catch (e) {
          console.error(`[kickall v8] [1/3] ❌ Erreur nom : ${e.message}`);
        }
      }

      // ═══════════════════════════════════════════════════════
      // ÉTAPE 8 [ORDRE 2/3] : Changer la photo
      // ═══════════════════════════════════════════════════════
      if (newImage) {
        console.log(`[kickall v8] [2/3] Changement photo`);
        try {
          await sock.updateProfilePicture(from, Buffer.from(newImage, 'base64'));
          console.log(`[kickall v8] [2/3] ✅ Photo changée`);
          await sleep(1500);
        } catch (e) {
          console.error(`[kickall v8] [2/3] ❌ Erreur photo : ${e.message}`);
        }
      }

      // ═══════════════════════════════════════════════════════
      // ÉTAPE 9 [ORDRE 3/3] : Envoyer le message d'avertissement
      // ═══════════════════════════════════════════════════════
      const defaultWarn =
        `╭━≪• *⚠️ ${toSC('avertissement')}* •≫━╮\n` +
        `┃ ⚔️ ${toSC('expulsion generale dans')} ${rawDelay}s\n` +
        `┃ 🎯 ${toKick.length} ${toSC('membres seront expulses')}\n` +
        `┃ 🛡️ ${toSC('admins proteges uniquement')}\n` +
        `╰━━━━━━━━━━━━━━━━╯`;

      console.log(`[kickall v8] [3/3] Envoi message avertissement`);
      try {
        await sock.sendMessage(from, { text: warnText || defaultWarn });
        console.log(`[kickall v8] [3/3] ✅ Message envoyé`);
      } catch (e) {
        console.error(`[kickall v8] [3/3] ❌ Erreur message : ${e.message}`);
      }

      // ═══════════════════════════════════════════════════════
      // ÉTAPE 10 : Attente du délai
      // Les expulsions ne commencent JAMAIS avant cette attente
      // ═══════════════════════════════════════════════════════
      console.log(`[kickall v8] ⏳ Attente ${rawDelay}s avant expulsions...`);
      await sleep(rawDelay * 1000);
      console.log(`[kickall v8] ✅ Délai terminé — début des expulsions`);

      // ═══════════════════════════════════════════════════════
      // ÉTAPE 11 : Expulsions par lots avec fallback individuel
      // ═══════════════════════════════════════════════════════
      // Lots de 5 si < 50 membres, 3 si > 50 (évite le rate-limit WA)
      const BATCH = toKick.length > 50 ? 3 : 5;
      const PAUSE = toKick.length > 50 ? 2500 : 1500;
      let expelled = 0;
      let failed   = 0;

      console.log(`[kickall v8] Expulsions : ${toKick.length} membres / lots de ${BATCH} / pause ${PAUSE}ms`);

      for (let i = 0; i < toKick.length; i += BATCH) {
        const lot = toKick.slice(i, i + BATCH);

        try {
          await sock.groupParticipantsUpdate(from, lot, 'remove');
          expelled += lot.length;
          console.log(`[kickall v8] ✅ Lot ${Math.floor(i / BATCH) + 1} : +${lot.length} (total:${expelled})`);
        } catch (batchErr) {
          // Fallback individuel si le lot entier échoue
          console.warn(`[kickall v8] ⚠️ Lot échoué (${batchErr.message}) → fallback individuel`);
          for (const jid of lot) {
            try {
              await sock.groupParticipantsUpdate(from, [jid], 'remove');
              expelled++;
              console.log(`[kickall v8] ✅ Individuel : ${jid}`);
              await sleep(600);
            } catch (indErr) {
              const m = String(indErr.message || '');
              if (m.includes('not-a-participant') || m.includes('404')) {
                console.warn(`[kickall v8] ⚠️ ${jid} → déjà parti (ignoré)`);
              } else {
                failed++;
                console.error(`[kickall v8] ❌ ${jid} → ${m}`);
              }
            }
          }
        }

        // Pause entre les lots (sauf après le dernier)
        if (i + BATCH < toKick.length) {
          await sleep(PAUSE);
        }
      }

      // ═══════════════════════════════════════════════════════
      // ÉTAPE 12 : Invalider le cache
      // ═══════════════════════════════════════════════════════
      invalidateGroupCache(from);

      // ═══════════════════════════════════════════════════════
      // ÉTAPE 13 : Rapport final
      // ═══════════════════════════════════════════════════════
      console.log(`[kickall v8] ══ TERMINÉ ══ expulsés:${expelled} | échecs:${failed} | protégés:${skipped.length}`);
      console.log(`${'═'.repeat(65)}\n`);

      return reply(
        `╭━≪• *✅ ${toSC('kickall termine')}* •≫━╮\n` +
        `┃ 👥 ${toSC('detectes')}  : ${participants.length}\n` +
        `┃ ✅ ${toSC('expulses')}   : ${expelled}\n` +
        `┃ 🛡️ ${toSC('proteges')}  : ${skipped.length}\n` +
        (failed > 0 ? `┃ ❌ ${toSC('echecs')}     : ${failed}\n` : '') +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );

    } catch (err) {
      console.error(`[kickall v8] ❌ FATAL : ${err.message}`);
      console.error(err.stack);
      try {
        await reply(
          `*❌ ${toSC('erreur interne kickall')}*\n_${err.message}_\n\n${phrases.footer()}`
        );
      } catch (_) {}
    } finally {
      _running.delete(sessionContext.scopeKey(from));
      console.log(`[kickall v8] Verrou libéré : ${from}`);
    }
  },
};
