'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const serverPath = path.join(ROOT, 'api', 'server.js');
const marker = '[HOT COMMAND UPDATER:OIDC AUTH]';

if (!fs.existsSync(serverPath)) throw new Error('[install-hot-oidc] api/server.js introuvable');

let source = fs.readFileSync(serverPath, 'utf8');
if (source.includes(marker)) {
  console.log('[install-hot-oidc] authentification OIDC déjà installée');
} else {
  if (!source.includes('[HOT COMMAND UPDATER:API]')) {
    throw new Error('[install-hot-oidc] endpoint HOT absent — exécuter install-hot-command-updater.js avant ce script');
  }

  const oldPostAuth = `async function handleHotCommandRoute(req, res) {\n  const hot = require('../utils/hotCommandUpdater');\n  const configured = process.env.HOT_UPDATE_TOKEN || process.env.API_INTERNAL_TOKEN;\n  if (!configured) {\n    return sendJSON(res, 503, { error: 'HOT_UPDATE_DISABLED', message: 'HOT_UPDATE_TOKEN/API_INTERNAL_TOKEN non configuré.' });\n  }\n  if (!hot.isAuthorizedHotUpdate(req.headers['x-hot-update-token'])) {\n    return sendJSON(res, 401, { error: 'UNAUTHORIZED', message: 'Token HOT invalide ou manquant.' });\n  }\n\n  let body;\n  try { body = await readHotJsonBody(req); }\n  catch (error) { return sendJSON(res, error.statusCode || 400, { error: 'BAD_REQUEST', message: error.message }); }`;

  const newPostAuth = `async function handleHotCommandRoute(req, res) {\n  const hot = require('../utils/hotCommandUpdater');\n  const { authorizeHotRequest } = require('../utils/hotOidcAuth'); // ${marker}\n\n  let body;\n  try { body = await readHotJsonBody(req); }\n  catch (error) { return sendJSON(res, error.statusCode || 400, { error: 'BAD_REQUEST', message: error.message }); }\n\n  try {\n    await authorizeHotRequest({\n      token: req.headers['x-hot-update-token'],\n      commitSha: typeof body?.commitSha === 'string' ? body.commitSha : null,\n    });\n  } catch (authError) {\n    const status = authError.code === 'HOT_OIDC_JWKS_FAILED' ? 503 : 401;\n    return sendJSON(res, status, { error: authError.code || 'HOT_UNAUTHORIZED', message: authError.message });\n  }`;

  const postCount = source.split(oldPostAuth).length - 1;
  if (postCount !== 1) throw new Error(`[install-hot-oidc] bloc POST attendu 1 fois, trouvé ${postCount}`);
  source = source.replace(oldPostAuth, newPostAuth);

  const oldStatusAuth = `async function handleHotCommandStatusRoute(req, res) {\n  const hot = require('../utils/hotCommandUpdater');\n  const configured = process.env.HOT_UPDATE_TOKEN || process.env.API_INTERNAL_TOKEN;\n  if (!configured) return sendJSON(res, 503, { error: 'HOT_UPDATE_DISABLED' });\n  if (!hot.isAuthorizedHotUpdate(req.headers['x-hot-update-token'])) {\n    return sendJSON(res, 401, { error: 'UNAUTHORIZED' });\n  }\n  try {`;

  const newStatusAuth = `async function handleHotCommandStatusRoute(req, res) {\n  const hot = require('../utils/hotCommandUpdater');\n  const { authorizeHotRequest } = require('../utils/hotOidcAuth');\n  try {\n    await authorizeHotRequest({ token: req.headers['x-hot-update-token'] });\n  } catch (authError) {\n    const status = authError.code === 'HOT_OIDC_JWKS_FAILED' ? 503 : 401;\n    return sendJSON(res, status, { error: authError.code || 'HOT_UNAUTHORIZED', message: authError.message });\n  }\n  try {`;

  const statusCount = source.split(oldStatusAuth).length - 1;
  if (statusCount !== 1) throw new Error(`[install-hot-oidc] bloc status attendu 1 fois, trouvé ${statusCount}`);
  source = source.replace(oldStatusAuth, newStatusAuth);

  const oldErrorMap = `  if (code === 'HOT_NO_MONGODB') return 503;\n  if (/SYNTAX|MODULE|RUNTIME_LOAD/.test(code)) return 422;`;
  const newErrorMap = `  if (code === 'HOT_NO_MONGODB') return 503;\n  if (/UNAUTHORIZED|OIDC/.test(code)) return code === 'HOT_OIDC_JWKS_FAILED' ? 503 : 401;\n  if (/SYNTAX|MODULE|RUNTIME_LOAD/.test(code)) return 422;`;
  const mapCount = source.split(oldErrorMap).length - 1;
  if (mapCount !== 1) throw new Error(`[install-hot-oidc] map erreurs attendu 1 fois, trouvé ${mapCount}`);
  source = source.replace(oldErrorMap, newErrorMap);

  fs.writeFileSync(serverPath, source, 'utf8');
  console.log('[install-hot-oidc] ✅ endpoint HOT sécurisé par GitHub OIDC + fallback token partagé');
}

for (const file of [serverPath, path.join(ROOT, 'utils', 'hotOidcAuth.js')]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[install-hot-oidc] syntaxe ${path.relative(ROOT, file)}: ${check.stderr || check.stdout}`);
}
