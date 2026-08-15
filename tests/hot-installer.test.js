'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function copy(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function runNode(file, cwd) {
  const result = spawnSync(process.execPath, [file], { cwd, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) {
    throw new Error(`${path.basename(file)} a échoué:\n${result.stderr || result.stdout}`);
  }
  return result;
}

test('les installateurs HOT + pull chiffré + OIDC sont idempotents et syntaxiquement valides', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dipper-hot-installer-'));
  try {
    for (const rel of [
      'scripts/install-hot-command-updater.js',
      'scripts/install-hot-oidc-auth.js',
      'scripts/validate-hot-command.js',
      'utils/hotCommandUpdater.js',
      'utils/hotOidcAuth.js',
      'utils/hotReleaseCrypto.js',
      'utils/hotReleasePoller.js',
      'utils/commandLoader.js',
    ]) {
      copy(path.join(ROOT, rel), path.join(tmp, rel));
    }

    fs.writeFileSync(path.join(tmp, 'index.js'), `'use strict';\nlet _mongoDb = null;\nlet _sessionManager = null;\nconst originalConsoleLog = console.log;\nconst originalConsoleError = console.error;\nasync function initMultiSession() {\n  try {\n    const { getDb }          = require('./utils/mongoClient');\n    const sm                  = require('./utils/sessionManager');\n    _mongoDb                  = await getDb();\n    _sessionManager           = sm;\n    await sm.loadAllSessions(_mongoDb);\n    return true;\n  } catch (err) {\n    return false;\n  }\n}\nmodule.exports = { initMultiSession };\n`);

    fs.mkdirSync(path.join(tmp, 'api'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'api', 'server.js'), `'use strict';\nfunction sendJSON(res, status, obj) { return { res, status, obj }; }\nfunction readJsonBody() { return Promise.resolve({}); }\nfunction getClientIp() { return '127.0.0.1'; }\nasync function handlePairRoute() {}\nfunction handleSessionStatusRoute() {}\nasync function handleSessionStopRoute() {}\nfunction tryServeStatic() { return false; }\nfunction applyCorsHeaders() {}\n/**\n * Construit le serveur HTTP (sans le démarrer) — utile pour les tests,\n * qui peuvent appeler \`.listen(0, ...)\` sur un port éphémère.\n */\nfunction createServer() {\n  return async function handler(req, res) {\n    applyCorsHeaders(req, res);\n    const url = new URL(req.url || '/', 'http://localhost');\n      if (req.method === 'GET' && url.pathname === '/health') {\n        return sendJSON(res, 200, { status: 'ok' });\n      }\n      if (req.method === 'POST' && url.pathname === '/pair') {\n        return await handlePairRoute(req, res);\n      }\n      if (req.method === 'GET' && url.pathname === '/session/status') {\n        return handleSessionStatusRoute(req, res, url.searchParams);\n      }\n      if (req.method === 'POST' && url.pathname === '/session/stop') {\n        return await handleSessionStopRoute(req, res);\n      }\n      if (tryServeStatic(req, res, url.pathname)) return;\n      return sendJSON(res, 404, { error: 'NOT_FOUND' });\n  };\n}\nmodule.exports = { createServer };\n`);

    runNode(path.join(tmp, 'scripts', 'install-hot-command-updater.js'), tmp);
    runNode(path.join(tmp, 'scripts', 'install-hot-oidc-auth.js'), tmp);
    runNode(path.join(tmp, 'scripts', 'install-hot-command-updater.js'), tmp);
    runNode(path.join(tmp, 'scripts', 'install-hot-oidc-auth.js'), tmp);

    const index = fs.readFileSync(path.join(tmp, 'index.js'), 'utf8');
    const server = fs.readFileSync(path.join(tmp, 'api', 'server.js'), 'utf8');
    assert.equal((index.match(/\[HOT COMMAND UPDATER:HYDRATE\]/g) || []).length, 1);
    assert.equal((index.match(/\[HOT COMMAND UPDATER:ENCRYPTED PULL\]/g) || []).length, 1);
    assert.equal((server.match(/\[HOT COMMAND UPDATER:API\]/g) || []).length, 1);
    assert.equal((server.match(/\[HOT COMMAND UPDATER:OIDC AUTH\]/g) || []).length, 1);
    assert.match(index, /startHotReleasePoller/);
    assert.match(server, /handleHotPublicKeyRoute/);
    assert.match(server, /\/internal\/hot-command\/key/);
    assert.match(server, /authorizeHotRequest/);
    assert.doesNotMatch(server, /HOT_UPDATE_DISABLED/);

    for (const rel of ['index.js', 'api/server.js']) {
      const check = spawnSync(process.execPath, ['--check', path.join(tmp, rel)], { encoding: 'utf8' });
      assert.equal(check.status, 0, check.stderr || check.stdout);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
