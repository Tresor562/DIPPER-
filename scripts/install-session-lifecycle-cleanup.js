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
    "const sessionContext = require('./sessionContext');\n// [SESSION LIFECYCLE CLEANUP] Moteur de suppression persistante réservé aux demandes explicites et aux pairings jamais finalisés.\nconst fileAuthLifecycle = require('./fileAuthState');\nconst mongoAuthLifecycle = require('./mongoAuth');",
    '[SESSION LIFECYCLE CLEANUP]',
    'imports nettoyage persistant'
  );

  const helperAnchor = `/**\n * Nettoie les timers d'une session.\n */`;
  const helper = `/**\n * Supprime définitivement les données persistantes d'une session.\n *\n * POLITIQUE IMMORTELLE : une session déjà appairée n'appelle JAMAIS cette\n * fonction automatiquement à cause d'une déconnexion WhatsApp. Elle est\n * réservée à une suppression explicite (/delsession, API interne) et au\n * nettoyage d'une tentative de pairing qui n'a jamais été enregistrée.\n */\nasync function purgeSessionPersistence(db, sessionId, reason = 'suppression définitive explicite') {\n  const failures = [];\n\n  try {\n    await fileAuthLifecycle.deleteSessionFiles(sessionId);\n  } catch (err) {\n    failures.push(\`fichiers: \${err.message}\`);\n  }\n\n  try {\n    let targetDb = db || null;\n    if (!targetDb && typeof mongoAuthLifecycle.deleteMongoSession === 'function') {\n      try { targetDb = await require('./mongoClient').getDb(); } catch (_) {}\n    }\n    if (targetDb && typeof mongoAuthLifecycle.deleteMongoSession === 'function') {\n      await mongoAuthLifecycle.deleteMongoSession(targetDb, sessionId);\n    }\n  } catch (err) {\n    failures.push(\`mongo-auth: \${err.message}\`);\n  }\n\n  try {\n    await sessionIndex.deleteSessionMeta(sessionId);\n  } catch (err) {\n    failures.push(\`index: \${err.message}\`);\n  }\n\n  if (failures.length) {\n    logCriticalSessionError(\`❗ purge incomplète \${sessionId} (\${reason}) — \${failures.join(' | ')}\`);\n    return false;\n  }\n\n  console.log(\`[SessionManager] 🗑️ \${sessionId} supprimée définitivement — \${reason}\`);\n  return true;\n}\n\n/**\n * Arrête la session en mémoire puis supprime credentials + index Mongo.\n * Cette fonction constitue l'unique porte de suppression définitive.\n */\nasync function deleteSessionData(phoneNumber, db = null, reason = 'suppression définitive explicite') {\n  const sessionId = toSessionId(phoneNumber);\n  const current = activeSessions.get(sessionId);\n  const targetDb = db || current?.db || null;\n\n  if (current) {\n    _closeSession(current, reason);\n    if (activeSessions.get(sessionId) === current) activeSessions.delete(sessionId);\n  }\n\n  return purgeSessionPersistence(targetDb, sessionId, reason);\n}\n\n${helperAnchor}`;

  session = replaceOnce(
    session,
    helperAnchor,
    helper,
    'async function purgeSessionPersistence(',
    'helpers suppression définitive'
  );

  // connectionReplaced et badSession ne sont plus terminaux. On les laisse
  // repasser par la reconnexion avec backoff. loggedOut reste impossible à
  // réparer avec les mêmes credentials (WhatsApp les a révoqués), mais les
  // données sont conservées afin que le serveur ne supprime jamais la session.
  const reconnectOld = `      const terminalDisconnect = [\n        DisconnectReason.loggedOut,\n        DisconnectReason.connectionReplaced,\n        DisconnectReason.badSession,\n      ].includes(statusCode);\n      const shouldReconnect = !terminalDisconnect && !_isShuttingDown && !session.isStopping;`;
  const reconnectNew = `      // [SESSION IMMORTAL RECONNECT]\n      // Seul loggedOut est non-récupérable avec les mêmes credentials.\n      // connectionReplaced / badSession restent dans la boucle de reconnexion.\n      const terminalDisconnect = statusCode === DisconnectReason.loggedOut;\n      const shouldReconnect = !terminalDisconnect && !_isShuttingDown && !session.isStopping;`;

  session = replaceOnce(
    session,
    reconnectOld,
    reconnectNew,
    '[SESSION IMMORTAL RECONNECT]',
    'reconnexion persistante connectionReplaced/badSession'
  );

  const terminalOld = `      } else {\n        console.log(\`[SessionManager] ❌ \${sessionId} session terminée — \${errorMessage}\`);\n        _cleanupSession(session);\n        if (activeSessions.get(sessionId) === session) activeSessions.delete(sessionId);\n      }`;
  const terminalNew = `      } else {\n        console.log(\`[SessionManager] ❌ \${sessionId} session WhatsApp terminée — \${errorMessage}\`);\n        _cleanupSession(session);\n        if (activeSessions.get(sessionId) === session) activeSessions.delete(sessionId);\n\n        // [SESSION IMMORTAL POLICY]\n        // loggedOut / appareil retiré révoque techniquement l'auth côté\n        // WhatsApp : une reconnexion avec les mêmes clés ne peut pas être\n        // forcée. Mais le serveur NE SUPPRIME RIEN automatiquement.\n        // Credentials Mongo + index restent présents jusqu'à /delsession.\n        if (statusCode === DisconnectReason.loggedOut) {\n          console.log(\`[SessionManager] ♾️ \${sessionId} loggedOut — données conservées; nouveau pairing requis pour revenir en ligne, suppression uniquement manuelle\`);\n          sessionIndex.setState(sessionId, { isOnline: false }).catch(() => {});\n        }\n      }`;

  session = replaceOnce(
    session,
    terminalOld,
    terminalNew,
    '[SESSION IMMORTAL POLICY]',
    'conservation automatique loggedOut'
  );

  // Une tentative jamais appairée n'est pas une session enregistrée. On garde
  // son nettoyage afin d'éviter l'accumulation infinie de codes expirés.
  const orphanOld = `      try { await stopSession(session.phoneNumber); } catch (err) {\n        console.error(\`[SessionManager] échec nettoyage session orpheline \${session.sessionId}:\`, err.message);\n      }`;
  const orphanNew = `      try {\n        await deleteSessionData(session.phoneNumber, session.db, 'pairing jamais finalisé');\n      } catch (err) {\n        console.error(\`[SessionManager] échec nettoyage session orpheline \${session.sessionId}:\`, err.message);\n      }`;

  session = replaceOnce(
    session,
    orphanOld,
    orphanNew,
    "'pairing jamais finalisé'",
    'nettoyage des pairings jamais enregistrés'
  );

  session = replaceOnce(
    session,
    `  stopSession,\n  toSessionId,`,
    `  stopSession,\n  deleteSessionData,\n  toSessionId,`,
    '  deleteSessionData,',
    'export deleteSessionData'
  );

  const rollbackOld = `  } catch (err) {\n    // Rollback : la session a été créée en mémoire mais le code a échoué —\n    // ne pas laisser une session fantôme sans code utilisable.\n    try { await sessionManager.stopSession(cleanNumber); } catch (_) {}\n    throw new PairingError('CODE_FAILED', err.message);\n  }`;
  const rollbackNew = `  } catch (err) {\n    // Aucun pairing n'a jamais abouti : cette tentative n'est pas encore une\n    // session enregistrée et peut être nettoyée sans toucher aux sessions\n    // déjà appairées.\n    try {\n      await sessionManager.deleteSessionData(cleanNumber, db, 'code de pairing non obtenu');\n    } catch (_) {}\n    throw new PairingError('CODE_FAILED', err.message);\n  }`;

  pairing = replaceOnce(
    pairing,
    rollbackOld,
    rollbackNew,
    "'code de pairing non obtenu'",
    'rollback pairing jamais enregistré'
  );

  fs.writeFileSync(sessionPath, session);
  fs.writeFileSync(pairingPath, pairing);

  // Vérification 1 — syntaxe.
  nodeCheck(sessionPath);
  nodeCheck(pairingPath);

  const finalSession = fs.readFileSync(sessionPath, 'utf8');
  const finalPairing = fs.readFileSync(pairingPath, 'utf8');

  // Vérification 2 — politique immortelle + suppression explicite disponible.
  for (const required of [
    '[SESSION IMMORTAL RECONNECT]',
    '[SESSION IMMORTAL POLICY]',
    'const terminalDisconnect = statusCode === DisconnectReason.loggedOut',
    'async function purgeSessionPersistence(',
    'async function deleteSessionData(',
    '  deleteSessionData,',
  ]) {
    if (!finalSession.includes(required)) throw new Error(`[session-lifecycle] garde-fou absent: ${required}`);
  }

  // Vérification 3 — loggedOut ne doit JAMAIS déclencher une purge automatique.
  const immortalStart = finalSession.indexOf('// [SESSION IMMORTAL POLICY]');
  const immortalBlock = immortalStart >= 0 ? finalSession.slice(immortalStart, immortalStart + 950) : '';
  if (/purgeSessionPersistence\s*\(|deleteSessionData\s*\(/.test(immortalBlock)) {
    throw new Error('[session-lifecycle] régression destructive: loggedOut déclenche encore une suppression automatique');
  }

  // connectionReplaced / badSession ne doivent plus être dans la liste terminale.
  const reconnectStart = finalSession.indexOf('// [SESSION IMMORTAL RECONNECT]');
  const reconnectBlock = reconnectStart >= 0 ? finalSession.slice(reconnectStart, reconnectStart + 700) : '';
  if (/terminalDisconnect[\s\S]{0,350}DisconnectReason\.(connectionReplaced|badSession)/.test(reconnectBlock)) {
    throw new Error('[session-lifecycle] régression: connectionReplaced/badSession encore terminal');
  }

  // Les nettoyages automatiques restants doivent concerner uniquement des
  // tentatives jamais enregistrées.
  if (!finalSession.includes('!session.isRegistered && !session.isOnline')) {
    throw new Error('[session-lifecycle] garde-fou pairings non enregistrés absent');
  }
  if (!finalPairing.includes("sessionManager.deleteSessionData(cleanNumber, db, 'code de pairing non obtenu')")) {
    throw new Error('[session-lifecycle] rollback pairing jamais enregistré absent');
  }

  console.log('[session-lifecycle] ✅ sessions enregistrées conservées; reconnect réseau/replace/badSession; suppression uniquement explicite');
}

if (require.main === module) install();
module.exports = { install };
