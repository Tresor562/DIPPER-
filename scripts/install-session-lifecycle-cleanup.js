'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const sessionPath = path.join(ROOT, 'utils', 'sessionManager.js');
const pairingPath = path.join(ROOT, 'utils', 'pairingService.js');

function replaceOnce(src, search, replacement, marker, label) {
  if (marker && src.includes(marker)) {
    console.log(`[session-lifecycle] ${label} déjà appliqué`);
    return src;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[session-lifecycle] ${label}: attendu 1 occurrence, trouvé ${count}`);
  }
  console.log(`[session-lifecycle] ${label} appliqué`);
  return src.replace(search, replacement);
}

function nodeCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`[session-lifecycle] syntaxe invalide ${path.relative(ROOT, file)}: ${result.stderr || result.stdout}`);
  }
}

function install() {
  let session = fs.readFileSync(sessionPath, 'utf8');
  let pairing = fs.readFileSync(pairingPath, 'utf8');

  session = replaceOnce(
    session,
    "const sessionContext = require('./sessionContext');",
    "const sessionContext = require('./sessionContext');\n// [SESSION LIFECYCLE CLEANUP] Purge persistante uniquement pour les fins réelles.\nconst fileAuthLifecycle = require('./fileAuthState');\nconst mongoAuthLifecycle = require('./mongoAuth');",
    '[SESSION LIFECYCLE CLEANUP]',
    'imports nettoyage persistant'
  );

  const helperAnchor = `/**\n * Nettoie les timers d'une session.\n */`;
  const helper = `/**\n * Supprime définitivement les données persistantes d'une session.\n * Utilisé uniquement lorsqu'on sait que la session ne doit plus exister :\n * - WhatsApp a réellement renvoyé loggedOut ;\n * - un pairing n'a jamais été finalisé et sa période de grâce a expiré ;\n * - la création du code de pairing a échoué.\n *\n * Une panne réseau, un restart Render ou connectionReplaced ne passent jamais\n * par cette fonction automatiquement.\n */\nasync function purgeSessionPersistence(db, sessionId, reason = 'suppression définitive') {\n  const failures = [];\n\n  try {\n    await fileAuthLifecycle.deleteSessionFiles(sessionId);\n  } catch (err) {\n    failures.push(\`fichiers: \${err.message}\`);\n  }\n\n  try {\n    let targetDb = db || null;\n    if (!targetDb && typeof mongoAuthLifecycle.deleteMongoSession === 'function') {\n      try { targetDb = await require('./mongoClient').getDb(); } catch (_) {}\n    }\n    if (targetDb && typeof mongoAuthLifecycle.deleteMongoSession === 'function') {\n      await mongoAuthLifecycle.deleteMongoSession(targetDb, sessionId);\n    }\n  } catch (err) {\n    failures.push(\`mongo-auth: \${err.message}\`);\n  }\n\n  try {\n    await sessionIndex.deleteSessionMeta(sessionId);\n  } catch (err) {\n    failures.push(\`index: \${err.message}\`);\n  }\n\n  if (failures.length) {\n    logCriticalSessionError(\`❗ purge incomplète \${sessionId} (\${reason}) — \${failures.join(' | ')}\`);\n    return false;\n  }\n\n  console.log(\`[SessionManager] 🗑️ \${sessionId} supprimée définitivement — \${reason}\`);\n  return true;\n}\n\n/**\n * Arrête la session en mémoire puis supprime credentials + index Mongo.\n */\nasync function deleteSessionData(phoneNumber, db = null, reason = 'suppression définitive') {\n  const sessionId = toSessionId(phoneNumber);\n  const current = activeSessions.get(sessionId);\n  const targetDb = db || current?.db || null;\n\n  if (current) {\n    _closeSession(current, reason);\n    if (activeSessions.get(sessionId) === current) activeSessions.delete(sessionId);\n  }\n\n  return purgeSessionPersistence(targetDb, sessionId, reason);\n}\n\n${helperAnchor}`;

  session = replaceOnce(
    session,
    helperAnchor,
    helper,
    'async function purgeSessionPersistence(',
    'helpers suppression définitive'
  );

  const terminalOld = `      } else {\n        console.log(\`[SessionManager] ❌ \${sessionId} session terminée — \${errorMessage}\`);\n        _cleanupSession(session);\n        if (activeSessions.get(sessionId) === session) activeSessions.delete(sessionId);\n      }`;
  const terminalNew = `      } else {\n        console.log(\`[SessionManager] ❌ \${sessionId} session terminée — \${errorMessage}\`);\n        _cleanupSession(session);\n        if (activeSessions.get(sessionId) === session) activeSessions.delete(sessionId);\n\n        // [SESSION TERMINAL PURGE] loggedOut correspond à une auth réellement\n        // révoquée (ex. appareil lié supprimé depuis WhatsApp). Dans ce seul\n        // cas terminal on efface immédiatement credentials + index.\n        // connectionReplaced et badSession restent non destructifs ici.\n        if (statusCode === DisconnectReason.loggedOut) {\n          await purgeSessionPersistence(db, sessionId, 'loggedOut / appareil lié supprimé');\n        }\n      }`;

  session = replaceOnce(
    session,
    terminalOld,
    terminalNew,
    '[SESSION TERMINAL PURGE]',
    'purge automatique loggedOut'
  );

  const orphanOld = `      try { await stopSession(session.phoneNumber); } catch (err) {\n        console.error(\`[SessionManager] échec nettoyage session orpheline \${session.sessionId}:\`, err.message);\n      }`;
  const orphanNew = `      try {\n        await deleteSessionData(session.phoneNumber, session.db, 'pairing jamais finalisé');\n      } catch (err) {\n        console.error(\`[SessionManager] échec nettoyage session orpheline \${session.sessionId}:\`, err.message);\n      }`;

  session = replaceOnce(
    session,
    orphanOld,
    orphanNew,
    "'pairing jamais finalisé'",
    'purge des pairings orphelins'
  );

  session = replaceOnce(
    session,
    `  stopSession,\n  toSessionId,`,
    `  stopSession,\n  deleteSessionData,\n  toSessionId,`,
    '  deleteSessionData,',
    'export deleteSessionData'
  );

  const rollbackOld = `  } catch (err) {\n    // Rollback : la session a été créée en mémoire mais le code a échoué —\n    // ne pas laisser une session fantôme sans code utilisable.\n    try { await sessionManager.stopSession(cleanNumber); } catch (_) {}\n    throw new PairingError('CODE_FAILED', err.message);\n  }`;
  const rollbackNew = `  } catch (err) {\n    // Rollback complet : un pairing qui n'a même pas produit de code ne doit\n    // laisser ni socket, ni credentials, ni entrée d'index derrière lui.\n    try {\n      await sessionManager.deleteSessionData(cleanNumber, db, 'code de pairing non obtenu');\n    } catch (_) {}\n    throw new PairingError('CODE_FAILED', err.message);\n  }`;

  pairing = replaceOnce(
    pairing,
    rollbackOld,
    rollbackNew,
    "'code de pairing non obtenu'",
    'rollback pairing sans résidu'
  );

  fs.writeFileSync(sessionPath, session);
  fs.writeFileSync(pairingPath, pairing);

  // Vérification 1 — syntaxe des deux fichiers modifiés.
  nodeCheck(sessionPath);
  nodeCheck(pairingPath);

  // Vérification 2 — présence des chemins de purge attendus.
  const finalSession = fs.readFileSync(sessionPath, 'utf8');
  const finalPairing = fs.readFileSync(pairingPath, 'utf8');
  for (const required of [
    '[SESSION TERMINAL PURGE]',
    "statusCode === DisconnectReason.loggedOut",
    "deleteSessionData(session.phoneNumber, session.db, 'pairing jamais finalisé')",
    'async function purgeSessionPersistence(',
    '  deleteSessionData,',
  ]) {
    if (!finalSession.includes(required)) throw new Error(`[session-lifecycle] garde-fou absent: ${required}`);
  }
  if (!finalPairing.includes("sessionManager.deleteSessionData(cleanNumber, db, 'code de pairing non obtenu')")) {
    throw new Error('[session-lifecycle] rollback pairing complet absent');
  }

  // Vérification 3 — régression destructive interdite : aucune purge auto sur
  // connectionReplaced ou simple badSession dans le listener terminal.
  const purgeBlockStart = finalSession.indexOf('// [SESSION TERMINAL PURGE]');
  const purgeBlock = purgeBlockStart >= 0 ? finalSession.slice(purgeBlockStart, purgeBlockStart + 650) : '';
  if (/statusCode\s*===\s*DisconnectReason\.(connectionReplaced|badSession)/.test(purgeBlock)) {
    throw new Error('[session-lifecycle] régression: purge destructive sur connectionReplaced/badSession');
  }

  console.log('[session-lifecycle] ✅ loggedOut + pairings orphelins purgés; réseau/connectionReplaced préservés');
}

if (require.main === module) install();
module.exports = { install };
