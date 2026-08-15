'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const indexPath = path.join(ROOT, 'index.js');
const serverPath = path.join(ROOT, 'api', 'server.js');
const INDEX_MARKER = '[HOT COMMAND UPDATER:HYDRATE]';
const API_MARKER = '[HOT COMMAND UPDATER:API]';
const PULL_MARKER = '[HOT COMMAND UPDATER:ENCRYPTED PULL]';

function replaceOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`[install-hot-updater] ${label}: attendu 1 occurrence, trouvé ${count}`);
  return source.replace(search, replacement);
}

if (!fs.existsSync(indexPath) || !fs.existsSync(serverPath)) {
  throw new Error('[install-hot-updater] index.js ou api/server.js introuvable');
}

let indexSource = fs.readFileSync(indexPath, 'utf8');
if (!indexSource.includes(INDEX_MARKER)) {
  const oldBlock = `  try {\n    const { getDb }          = require('./utils/mongoClient');\n    const sm                  = require('./utils/sessionManager');\n    _mongoDb                  = await getDb();\n    _sessionManager           = sm;\n    await sm.loadAllSessions(_mongoDb);`;
  const newBlock = `  try {\n    const { getDb }          = require('./utils/mongoClient');\n    _mongoDb                  = await getDb();\n\n    // ${INDEX_MARKER}\n    // Restaurer les commandes HOT approuvées AVANT de reconnecter les\n    // sessions WhatsApp. handler.js garde sa Map en mémoire et le hot updater\n    // la met à jour atomiquement sans recréer les sockets Baileys.\n    try {\n      const { hydrateActiveCommands } = require('./utils/hotCommandUpdater');\n      const restored = await hydrateActiveCommands({ db: _mongoDb, commandMap: global.commands });\n      originalConsoleLog(\`[hot-updater] ♻️ ${'${restored.restored || 0}'} commande(s) HOT restaurée(s) depuis MongoDB\`);\n    } catch (hotRestoreError) {\n      // Fail-open : une corruption du store HOT ne doit jamais empêcher le\n      // bot stable de démarrer avec ses commandes embarquées.\n      originalConsoleError('[hot-updater] restauration au démarrage ignorée:', hotRestoreError.message);\n    }\n\n    // ${PULL_MARKER}\n    // Le transport principal ne dépend ni de Render ni de GitHub Actions :\n    // il lit périodiquement un manifest chiffré dans le wrapper public.\n    // Le démarrage du bot ne dépend jamais de la disponibilité de GitHub.\n    try {\n      const { startHotReleasePoller } = require('./utils/hotReleasePoller');\n      const hotTransport = await startHotReleasePoller({ db: _mongoDb, commandMap: global.commands });\n      if (hotTransport?.started) originalConsoleLog(\`[hot-release] 👁️ surveillance active (${ '${Math.round((hotTransport.intervalMs || 0) / 1000)' }'}s)\`);\n    } catch (hotPollerError) {\n      originalConsoleError('[hot-release] transport pull désactivé:', hotPollerError.message);\n    }\n\n    const sm                  = require('./utils/sessionManager');\n    _sessionManager           = sm;\n    await sm.loadAllSessions(_mongoDb);`;
  indexSource = replaceOnce(indexSource, oldBlock, newBlock, 'hydratation index + transport pull');
  fs.writeFileSync(indexPath, indexSource, 'utf8');
  console.log('[install-hot-updater] index.js — hydratation + transport HOT pull installés');
}

let serverSource = fs.readFileSync(serverPath, 'utf8');
if (!serverSource.includes(API_MARKER)) {
  const createServerAnchor = `/**\n * Construit le serveur HTTP (sans le démarrer) — utile pour les tests,\n * qui peuvent appeler \`.listen(0, ...)\` sur un port éphémère.\n */\nfunction createServer() {`;

  const hotHelpers = `// ${API_MARKER}\n// Deux transports sont supportés :\n// 1) pull chiffré depuis le wrapper public (principal, aucun secret entrant),\n// 2) endpoint push authentifié GitHub OIDC/token partagé (secours optionnel).\nconst MAX_HOT_BODY_BYTES = 2 * 1024 * 1024;\n\nfunction readHotJsonBody(req) {\n  return new Promise((resolve, reject) => {\n    let size = 0;\n    const chunks = [];\n    req.on('data', chunk => {\n      size += chunk.length;\n      if (size > MAX_HOT_BODY_BYTES) {\n        reject(Object.assign(new Error('Lot HOT trop volumineux.'), { statusCode: 413 }));\n        req.destroy();\n        return;\n      }\n      chunks.push(chunk);\n    });\n    req.on('end', () => {\n      try {\n        const raw = Buffer.concat(chunks).toString('utf8').trim();\n        resolve(raw ? JSON.parse(raw) : {});\n      } catch (_) {\n        reject(Object.assign(new Error('JSON HOT invalide.'), { statusCode: 400 }));\n      }\n    });\n    req.on('error', reject);\n  });\n}\n\nfunction hotErrorStatus(error) {\n  const code = String(error?.code || '');\n  if (code === 'HOT_NO_MONGODB' || code === 'HOT_PERSIST_FAILED') return 503;\n  if (code === 'HOT_MANIFEST_CONFLICT') return 409;\n  if (/SYNTAX|MODULE|RUNTIME_LOAD/.test(code)) return 422;\n  if (/PATH|SOURCE|BATCH|ACTION|DUPLICATE|COLLISION|EMPTY/.test(code)) return 400;\n  return 500;\n}\n\nasync function handleHotCommandRoute(req, res) {\n  const hot = require('../utils/hotCommandUpdater');\n  const configured = process.env.HOT_UPDATE_TOKEN || process.env.API_INTERNAL_TOKEN;\n  if (!configured) {\n    return sendJSON(res, 503, { error: 'HOT_UPDATE_DISABLED', message: 'HOT_UPDATE_TOKEN/API_INTERNAL_TOKEN non configuré.' });\n  }\n  if (!hot.isAuthorizedHotUpdate(req.headers['x-hot-update-token'])) {\n    return sendJSON(res, 401, { error: 'UNAUTHORIZED', message: 'Token HOT invalide ou manquant.' });\n  }\n\n  let body;\n  try { body = await readHotJsonBody(req); }\n  catch (error) { return sendJSON(res, error.statusCode || 400, { error: 'BAD_REQUEST', message: error.message }); }\n\n  try {\n    const result = await hot.enqueueBatch(body?.updates, {\n      commitSha: typeof body?.commitSha === 'string' ? body.commitSha.slice(0, 80) : null,\n      actor: 'github-actions',\n    });\n    return sendJSON(res, 200, result);\n  } catch (error) {\n    console.error('[hot-updater] activation refusée:', error.code || 'ERROR', error.message);\n    return sendJSON(res, hotErrorStatus(error), {\n      success: false,\n      error: error.code || 'HOT_UPDATE_FAILED',\n      message: error.message,\n    });\n  }\n}\n\nasync function handleHotCommandStatusRoute(req, res) {\n  const hot = require('../utils/hotCommandUpdater');\n  const configured = process.env.HOT_UPDATE_TOKEN || process.env.API_INTERNAL_TOKEN;\n  if (!configured) return sendJSON(res, 503, { error: 'HOT_UPDATE_DISABLED' });\n  if (!hot.isAuthorizedHotUpdate(req.headers['x-hot-update-token'])) {\n    return sendJSON(res, 401, { error: 'UNAUTHORIZED' });\n  }\n  try {\n    const status = await hot.getHotUpdateStatus();\n    return sendJSON(res, 200, { success: true, ...status });\n  } catch (error) {\n    return sendJSON(res, hotErrorStatus(error), { success: false, error: error.code || 'HOT_STATUS_FAILED', message: error.message });\n  }\n}\n\nasync function handleHotPublicKeyRoute(_req, res) {\n  try {\n    const { getDb } = require('../utils/mongoClient');\n    const { getPublicKeyInfo } = require('../utils/hotReleaseCrypto');\n    const db = await getDb();\n    const info = await getPublicKeyInfo(db);\n    return sendJSON(res, 200, { success: true, ...info });\n  } catch (error) {\n    return sendJSON(res, 503, { success: false, error: error.code || 'HOT_KEY_UNAVAILABLE', message: error.message });\n  }\n}\n\n` + createServerAnchor;

  serverSource = replaceOnce(serverSource, createServerAnchor, hotHelpers, 'helpers API HOT');

  const routeAnchor = `      if (req.method === 'GET' && url.pathname === '/health') {\n        return sendJSON(res, 200, { status: 'ok' });\n      }`;
  const routeBlock = `      if (req.method === 'POST' && url.pathname === '/internal/hot-command') {\n        return await handleHotCommandRoute(req, res);\n      }\n      if (req.method === 'GET' && url.pathname === '/internal/hot-command/status') {\n        return await handleHotCommandStatusRoute(req, res);\n      }\n      if (req.method === 'GET' && url.pathname === '/internal/hot-command/key') {\n        return await handleHotPublicKeyRoute(req, res);\n      }\n\n${routeAnchor}`;
  serverSource = replaceOnce(serverSource, routeAnchor, routeBlock, 'routes API HOT');
  fs.writeFileSync(serverPath, serverSource, 'utf8');
  console.log('[install-hot-updater] api/server.js — API HOT + clé publique installées');
}

for (const file of [
  indexPath,
  serverPath,
  path.join(ROOT, 'utils', 'hotCommandUpdater.js'),
  path.join(ROOT, 'utils', 'hotReleaseCrypto.js'),
  path.join(ROOT, 'utils', 'hotReleasePoller.js'),
  path.join(ROOT, 'scripts', 'validate-hot-command.js'),
]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[install-hot-updater] syntaxe ${path.relative(ROOT, file)}: ${check.stderr || check.stdout}`);
}

console.log('[install-hot-updater] ✅ Hot Command Updater prêt');
