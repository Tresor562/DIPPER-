'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const API = path.join(ROOT, 'api', 'server.js');
const INDEX = path.join(ROOT, 'index.js');
const SESSION = path.join(ROOT, 'utils', 'sessionManager.js');
const MARK_API = '[DEPLOY CONTINUITY API]';
const MARK_INDEX = '[DEPLOY CONTINUITY INDEX]';
const MARK_SESSION = '[DEPLOY CONTINUITY SESSION]';

function writeChecked(file, source) {
  fs.writeFileSync(file, source, 'utf8');
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[continuity-install] syntaxe invalide ${path.relative(ROOT, file)}: ${check.stderr || check.stdout}`);
}

function replaceOne(source, needle, replacement, label) {
  if (source.includes(replacement)) return source;
  const count = source.split(needle).length - 1;
  if (count === 0) {
    console.log(`[continuity-install] ${label}: ancre déjà transformée ou absente, vérification sémantique`);
    return source;
  }
  if (count !== 1) throw new Error(`[continuity-install] ${label}: attendu 1 occurrence, trouvé ${count}`);
  return source.replace(needle, replacement);
}

function patchApi() {
  let src = fs.readFileSync(API, 'utf8');

  if (!src.includes("require('../utils/deploymentContinuity')")) {
    const importNeedle = "const sessionManager = require('../utils/sessionManager');";
    if (!src.includes(importNeedle)) throw new Error('[continuity-install] import sessionManager introuvable');
    src = src.replace(importNeedle, importNeedle + "\nconst deploymentContinuity = require('../utils/deploymentContinuity'); // " + MARK_API);
  }

  if (!src.includes('deploymentContinuity.waitForOperational(90_000)')) {
    src = replaceOne(
      src,
      "    const result = await createPairingSession(phoneNumber, { requesterKey, origin, owner });\n    return sendJSON(res, 200, result);",
      "    // Pendant le court handover d'un redéploiement, garder la requête HTTP\n    // ouverte au lieu de renvoyer une erreur au nouvel utilisateur.\n    const admitted = await deploymentContinuity.waitForOperational(90_000);\n    if (!admitted) {\n      return sendJSON(res, 503, { error: 'DEPLOYMENT_TRANSITION', message: 'Mise à jour en cours, réessaie dans quelques secondes.' });\n    }\n    const result = await deploymentContinuity.track(() =>\n      createPairingSession(phoneNumber, { requesterKey, origin, owner })\n    );\n    return sendJSON(res, 200, result);",
      'pair admission'
    );
  }

  if (!src.includes('const h = deploymentContinuity.health();')) {
    src = replaceOne(
      src,
      "      if (req.method === 'GET' && url.pathname === '/health') {\n        return sendJSON(res, 200, { status: 'ok' });\n      }",
      "      if (req.method === 'GET' && url.pathname === '/health') {\n        const h = deploymentContinuity.health();\n        return sendJSON(res, h.statusCode, h.body);\n      }",
      'health continuity'
    );
  }

  if (!src.includes('deploymentContinuity.attachServer(server);')) {
    src = replaceOne(
      src,
      "  server.listen(port, HOST, () => {",
      "  deploymentContinuity.attachServer(server);\n\n  server.listen(port, HOST, () => {",
      'attach server'
    );
  }

  if (!src.includes('deploymentContinuity')) throw new Error('[continuity-install] invariant API continuity absent');
  writeChecked(API, src);
}

function patchSessionManager() {
  let src = fs.readFileSync(SESSION, 'utf8');
  if (!src.includes('async function prepareForDeployment()')) {
    const exportAnchor = "module.exports = {\n  startSession,";
    if (!src.includes(exportAnchor)) throw new Error('[continuity-install] exports sessionManager introuvables');
    const addition = `\n/** ${MARK_SESSION}\n * Ferme toutes les connexions au moment où l'hébergeur retire l'instance.\n * Aucun logout n'est envoyé : les credentials restent valides et la nouvelle\n * instance peut reconnecter immédiatement les mêmes comptes.\n */\nasync function prepareForDeployment() {\n  const sessions = Array.from(activeSessions.values());\n  console.log(\`[SessionManager] 🔄 handover déploiement — \${sessions.length} session(s) à libérer\`);\n  for (const session of sessions) {\n    try {\n      session.isStopping = true;\n      _closeSession(session, 'handover déploiement');\n      sessionIndex.setState(session.sessionId, { isOnline: false }).catch(() => {});\n    } catch (err) {\n      console.error(\`[SessionManager] handover \${session.sessionId}:\`, err.message);\n    }\n  }\n  activeSessions.clear();\n  return sessions.length;\n}\n\n`;
    src = src.replace(exportAnchor, addition + exportAnchor);
  }
  if (!src.includes('prepareForDeployment,')) {
    src = src.replace("  stopSession,\n  toSessionId,", "  stopSession,\n  prepareForDeployment,\n  toSessionId,");
  }
  src = src.replace("await new Promise(r => setTimeout(r, 1500)); // évite la surcharge au démarrage", "await new Promise(r => setTimeout(r, 150)); // " + MARK_SESSION + " reprise accélérée");
  writeChecked(SESSION, src);
}

function patchIndex() {
  let src = fs.readFileSync(INDEX, 'utf8');
  if (!src.includes("require('./utils/deploymentContinuity')")) {
    src = replaceOne(src, "const os      = require('os');", "const os      = require('os');\nconst deploymentContinuity = require('./utils/deploymentContinuity'); // " + MARK_INDEX, 'import index');
  }
  if (!src.includes("deploymentContinuity.markBooting('launch-bot')")) {
    src = replaceOne(src, "async function launchBot() {\n  try {", "async function launchBot() {\n  deploymentContinuity.markBooting('launch-bot');\n  try {", 'boot marker');
  }
  if (!src.includes("deploymentContinuity.markReady('sessions-restored-and-owner-started')")) {
    src = replaceOne(src, "    await startBot();\n  } catch (err) {", "    await startBot();\n    deploymentContinuity.markReady('sessions-restored-and-owner-started');\n  } catch (err) {", 'ready marker');
  }
  if (!src.includes('deploymentContinuity.installShutdown(async () =>')) {
    const globalAnchor = "process.on('uncaughtException',  handleGlobalError);\nprocess.on('unhandledRejection', handleGlobalError);";
    const graceful = `${globalAnchor}\n\n// ${MARK_INDEX}\ndeploymentContinuity.installShutdown(async () => {\n  try {\n    if (_sessionManager?.prepareForDeployment) await _sessionManager.prepareForDeployment();\n  } catch (err) {\n    originalConsoleError('[continuity] fermeture multi-session:', err.message);\n  }\n  try { stopMemoryGuard(); } catch (_) {}\n});`;
    src = replaceOne(src, globalAnchor, graceful, 'shutdown hook');
  }
  writeChecked(INDEX, src);
}

for (const file of [API, INDEX, SESSION]) if (!fs.existsSync(file)) throw new Error(`[continuity-install] fichier absent: ${file}`);
patchApi();
patchSessionManager();
patchIndex();
console.log('[continuity-install] ✅ handover, drainage HTTP, attente pairing et reprise accélérée installés');
