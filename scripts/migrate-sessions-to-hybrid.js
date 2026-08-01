#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   𝐃𝐈𝐏𝐏𝐄𝐑 — Migration vers l'architecture hybride           ║
 * ║   scripts/migrate-sessions-to-hybrid.js                      ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * [Chantier "Architecture hybride", Phase 3]
 *
 * RÔLE :
 *   Convertit les sessions existantes, stockées entièrement dans MongoDB
 *   par l'ancien système (utils/mongoAuth.js — une collection `auth_<id>`
 *   par session, contenant creds + keys), vers la nouvelle architecture :
 *     - credentials WhatsApp → fichiers locaux (sessions/<sessionId>/),
 *       via utils/fileAuthState.js (Baileys natif).
 *     - métadonnées → index Mongo (sessions_index), via
 *       utils/sessionIndex.js.
 *
 * GARANTIES :
 *   - NE SUPPRIME JAMAIS les collections Mongo d'origine (`auth_*`) — la
 *     migration ne fait qu'AJOUTER (fichiers locaux + entrée d'index),
 *     jamais retirer. Un rollback reste possible à tout moment en
 *     revenant à l'ancien code, tant que ces collections existent encore.
 *   - IDEMPOTENTE : un drapeau (`sessionIndex.isMigrationDone`) empêche
 *     toute ré-exécution complète une fois la migration terminée. De plus,
 *     par sécurité, chaque session déjà migrée (dossier local existant ou
 *     déjà indexée) est individuellement ignorée, même si le drapeau
 *     global n'était pas encore posé (ex : script interrompu en cours de
 *     route et relancé).
 *   - Une session qui échoue n'interrompt pas les autres — le script
 *     traite chaque session indépendamment et affiche un rapport final.
 *
 * USAGE :
 *   node scripts/migrate-sessions-to-hybrid.js            # migration réelle
 *   node scripts/migrate-sessions-to-hybrid.js --dry-run  # simulation, aucune écriture
 *   node scripts/migrate-sessions-to-hybrid.js --force    # ré-exécute même si déjà marquée terminée
 *      (les sessions individuellement déjà migrées restent tout de même
 *      ignorées — --force ne sert qu'à retenter les sessions qui avaient
 *      échoué lors d'un précédent passage)
 *
 * Ne touche à AUCUNE logique de pairing, moteur WhatsApp, site Web, ou bot
 * Telegram — uniquement à la conversion des données de session.
 */

'use strict';

require('../config'); // charge .env (dotenv) comme le reste du projet

const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const { getDb, closeDb } = require('../utils/mongoClient');
const fileAuthState = require('../utils/fileAuthState');
const sessionIndex = require('../utils/sessionIndex');

const MIGRATION_NAME = 'hybrid-storage-v1';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

// Catégories de clés Baileys connues (triées de la plus longue à la plus
// courte, pour retrouver correctement le type dans un id du type
// `${type}-${id}` — le type lui-même peut contenir des tirets, donc on ne
// peut pas simplement découper sur le premier tiret venu).
const KEY_TYPES = [
  'app-state-sync-key',
  'app-state-sync-version',
  'sender-key-memory',
  'sender-key',
  'pre-key',
  'session',
].sort((a, b) => b.length - a.length);

function parseKeyDocId(docId) {
  for (const type of KEY_TYPES) {
    if (docId.startsWith(`${type}-`)) {
      return { type, id: docId.slice(type.length + 1) };
    }
  }
  return null; // format inconnu — ignoré, journalisé
}

/**
 * Migre une session unique depuis sa collection Mongo `auth_<sessionId>`
 * vers un dossier local (fileAuthState) + une entrée d'index
 * (sessionIndex). Ne supprime jamais la collection Mongo source.
 * @returns {Promise<'migrated'|'skipped'|'failed'>}
 */
async function migrateOneSession(db, sessionId) {
  // Déjà migrée (dossier local présent) → on ne touche à rien, pour ne
  // jamais écraser des credentials plus récents que ceux de Mongo (cas
  // d'une session recréée après le déploiement de la Phase 2).
  if (fileAuthState.sessionDirExists(sessionId)) {
    console.log(`[Migration] ⏭️  ${sessionId} — dossier local déjà présent, ignorée`);
    return 'skipped';
  }
  const alreadyIndexed = await sessionIndex.getSessionMeta(sessionId);
  if (alreadyIndexed) {
    console.log(`[Migration] ⏭️  ${sessionId} — déjà indexée dans Mongo, ignorée`);
    return 'skipped';
  }

  const collection = db.collection(`auth_${sessionId}`);
  const docs = await collection.find({}).toArray();
  if (docs.length === 0) {
    console.log(`[Migration] ⏭️  ${sessionId} — collection vide, ignorée`);
    return 'skipped';
  }

  const credsDoc = docs.find((d) => d._id === 'creds');
  const keyDocs = docs.filter((d) => d._id !== 'creds');

  if (!credsDoc?.value) {
    console.error(`[Migration] ❌ ${sessionId} — aucun document "creds" exploitable, ignorée`);
    return 'failed';
  }

  if (DRY_RUN) {
    console.log(`[Migration] 🔎 [dry-run] ${sessionId} — migrerait 1 creds + ${keyDocs.length} clé(s)`);
    return 'migrated';
  }

  try {
    // ── 1. Credentials ──────────────────────────────────────────────────
    const creds = JSON.parse(credsDoc.value, BufferJSON.reviver) || initAuthCreds();
    const { state, saveCreds } = await fileAuthState.useFileAuthState(sessionId);
    // IMPORTANT : useMultiFileAuthState() (Baileys natif) ferme saveCreds()
    // sur la référence d'objet `creds` d'ORIGINE, pas sur `state.creds` —
    // réassigner `state.creds = creds` casserait ce lien et saveCreds()
    // écrirait alors les anciennes valeurs. On mute donc l'objet existant
    // en place pour préserver la référence que saveCreds() persiste.
    Object.keys(state.creds).forEach((k) => delete state.creds[k]);
    Object.assign(state.creds, creds);
    await saveCreds();

    // ── 2. Keys — regroupées par type puis écrites via l'API native
    // Baileys (state.keys.set), pour garantir le même format sur disque
    // que celui produit en production par useMultiFileAuthState ─────────
    const grouped = {};
    let unknownFormat = 0;
    for (const doc of keyDocs) {
      const parsed = parseKeyDocId(doc._id);
      if (!parsed || !doc.value) { unknownFormat++; continue; }
      let value = JSON.parse(doc.value, BufferJSON.reviver);
      if (parsed.type === 'app-state-sync-key' && value) {
        value = proto.Message.AppStateSyncKeyData.fromObject(value);
      }
      grouped[parsed.type] = grouped[parsed.type] || {};
      grouped[parsed.type][parsed.id] = value;
    }
    if (Object.keys(grouped).length > 0) {
      await state.keys.set(grouped);
    }
    if (unknownFormat > 0) {
      console.error(`[Migration] ⚠️  ${sessionId} — ${unknownFormat} entrée(s) de format inconnu ignorée(s)`);
    }

    // ── 3. Métadonnées — index Mongo ────────────────────────────────────
    const phoneNumber = sessionId.replace('session_', '');
    await sessionIndex.ensureSession(sessionId, {
      phoneNumber,
      owner: 'migration',
      origin: 'migration',
    });

    console.log(`[Migration] ✅ ${sessionId} — migrée (1 creds + ${keyDocs.length - unknownFormat} clé(s))`);
    return 'migrated';
  } catch (err) {
    console.error(`[Migration] ❌ ${sessionId} — échec :`, err.message);
    return 'failed';
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Migration — Architecture hybride de stockage des sessions ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (DRY_RUN) console.log('🔎 Mode simulation (--dry-run) — aucune écriture ne sera effectuée.\n');

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI manquant — impossible de lire les sessions existantes. Migration annulée.');
    process.exitCode = 1;
    return;
  }

  const db = await getDb();

  if (!DRY_RUN && !FORCE && await sessionIndex.isMigrationDone(MIGRATION_NAME)) {
    console.log(`✅ Migration "${MIGRATION_NAME}" déjà exécutée précédemment — rien à faire.`);
    console.log('   (relancer avec --force pour retenter les sessions en échec lors d\'un précédent passage)');
    await closeDb();
    return;
  }

  const collections = await db.listCollections().toArray();
  const sessionIds = collections
    .map((c) => c.name)
    .filter((n) => n.startsWith('auth_'))
    .map((n) => n.replace('auth_', ''));

  console.log(`📦 ${sessionIds.length} session(s) trouvée(s) dans l'ancien stockage Mongo (auth_*).\n`);

  const results = { migrated: 0, skipped: 0, failed: 0 };
  for (const sessionId of sessionIds) {
    const result = await migrateOneSession(db, sessionId);
    results[result]++;
  }

  console.log('\n──────────────── Rapport de migration ────────────────');
  console.log(`✅ Migrées : ${results.migrated}`);
  console.log(`⏭️  Ignorées (déjà migrées / vides) : ${results.skipped}`);
  console.log(`❌ Échecs : ${results.failed}`);
  console.log('────────────────────────────────────────────────────────');

  if (!DRY_RUN && results.failed === 0) {
    await sessionIndex.markMigrationDone(MIGRATION_NAME, results);
    console.log(`\n🏁 Migration "${MIGRATION_NAME}" marquée comme terminée — ne se relancera plus automatiquement.`);
  } else if (!DRY_RUN) {
    console.log('\n⚠️  Des échecs sont survenus — la migration n\'est PAS marquée comme terminée.');
    console.log('   Corrigez les sessions en échec puis relancez ce script (les sessions déjà migrées seront ignorées).');
  }

  console.log('\nℹ️  Les collections Mongo "auth_*" d\'origine n\'ont PAS été supprimées (sécurité de rollback).');
  console.log('   Une fois la nouvelle architecture validée en production, elles peuvent être supprimées manuellement.');

  await closeDb();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Erreur fatale de migration:', err);
    process.exitCode = 1;
  });
}

module.exports = { migrateOneSession, parseKeyDocId, main, MIGRATION_NAME };
