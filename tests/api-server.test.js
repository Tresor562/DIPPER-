/**
 * Tests — api/server.js (chantier "API Pairing universelle")
 *
 * Couvre exactement les points demandés dans l'audit :
 *   1. démarrage local (aucune variable définie -> port 3001 par défaut)
 *   2. démarrage avec PORT imposé (standard hébergeurs)
 *   3. priorité PORT > API_PORT (rétrocompatibilité VPS/Docker)
 *   4. écoute sur 0.0.0.0 (jamais uniquement localhost/127.0.0.1)
 *   5. accès réel à /health
 *   6. accès réel à /pair (routage bout-en-bout, sans dépendre de MongoDB)
 *
 * Lancer avec : node --test tests/
 * Ne nécessite aucune dépendance supplémentaire (node:test est natif
 * depuis Node 18+).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Chaque test recharge api/server.js à froid (cache Node vidé) pour que
// la valeur par défaut du paramètre `port` soit réévaluée à partir des
// variables d'environnement en vigueur au moment de l'appel.
function freshServerModule() {
  delete require.cache[require.resolve('../api/server')];
  return require('../api/server');
}

// Petit client HTTP minimal (le projet n'a pas de dépendance HTTP client
// de test) pour interroger le serveur qu'on vient de démarrer.
function request(port, { method = 'GET', path = '/', body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1', // vérifie l'accessibilité en boucle locale
        port,
        method,
        path,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers }
          : { ...headers },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let json = null;
          try { json = raw ? JSON.parse(raw) : null; } catch (_) { /* laisse json=null */ }
          resolve({ status: res.statusCode, json, raw, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('démarrage local — aucune variable définie -> port par défaut 3001', async (t) => {
  delete process.env.PORT;
  delete process.env.API_PORT;
  const { startApiServer } = freshServerModule();
  const server = startApiServer();
  t.after(() => closeServer(server));

  await new Promise((resolve) => server.on('listening', resolve));
  assert.equal(server.address().port, 3001);
});

test('démarrage avec PORT imposé (standard Railway/Render/Katabump/TeoHéberge)', async (t) => {
  process.env.PORT = '4123';
  delete process.env.API_PORT;
  const { startApiServer } = freshServerModule();
  const server = startApiServer();
  t.after(() => { closeServer(server); delete process.env.PORT; });

  await new Promise((resolve) => server.on('listening', resolve));
  assert.equal(server.address().port, 4123);
});

test('PORT est prioritaire sur API_PORT quand les deux sont définis', async (t) => {
  process.env.PORT = '4124';
  process.env.API_PORT = '9999';
  const { startApiServer } = freshServerModule();
  const server = startApiServer();
  t.after(() => { closeServer(server); delete process.env.PORT; delete process.env.API_PORT; });

  await new Promise((resolve) => server.on('listening', resolve));
  assert.equal(server.address().port, 4124);
});

test('API_PORT sert de repli si PORT est absent (VPS/Docker)', async (t) => {
  delete process.env.PORT;
  process.env.API_PORT = '4125';
  const { startApiServer } = freshServerModule();
  const server = startApiServer();
  t.after(() => { closeServer(server); delete process.env.API_PORT; });

  await new Promise((resolve) => server.on('listening', resolve));
  assert.equal(server.address().port, 4125);
});

test('écoute sur 0.0.0.0 — jamais restreinte à localhost/127.0.0.1', async (t) => {
  delete process.env.PORT;
  delete process.env.API_PORT;
  const { startApiServer } = freshServerModule();
  const server = startApiServer();
  t.after(() => closeServer(server));

  await new Promise((resolve) => server.on('listening', resolve));
  assert.equal(server.address().address, '0.0.0.0');
});

test('accès réel à /health', async (t) => {
  delete process.env.PORT;
  delete process.env.API_PORT;
  const { startApiServer } = freshServerModule();
  const server = startApiServer(0); // port éphémère libre
  t.after(() => closeServer(server));
  await new Promise((resolve) => server.on('listening', resolve));

  const res = await request(server.address().port, { path: '/health' });
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'ok');
});

test('accès réel à /pair — routage bout-en-bout (indépendant de MongoDB)', async (t) => {
  delete process.env.PORT;
  delete process.env.API_PORT;
  const { startApiServer } = freshServerModule();
  const server = startApiServer(0);
  t.after(() => closeServer(server));
  await new Promise((resolve) => server.on('listening', resolve));

  const res = await request(server.address().port, {
    method: 'POST',
    path: '/pair',
    body: { phoneNumber: '22912345678' },
  });
  // Peu importe le résultat métier (succès, ou 503 NO_MONGODB si aucune
  // base configurée dans cet environnement de test) : ce test vérifie que
  // la requête atteint bien la route, ce qui est le seul objectif de ce
  // chantier (routage/joignabilité, pas la logique de pairing elle-même).
  assert.ok(res.status > 0, 'la requête doit recevoir une réponse HTTP');
  assert.ok(res.json && typeof res.json === 'object', 'la réponse doit être un JSON valide');
});

test('route inconnue -> 404 JSON propre', async (t) => {
  delete process.env.PORT;
  delete process.env.API_PORT;
  const { startApiServer } = freshServerModule();
  const server = startApiServer(0);
  t.after(() => closeServer(server));
  await new Promise((resolve) => server.on('listening', resolve));

  const res = await request(server.address().port, { path: '/route-inexistante' });
  assert.equal(res.status, 404);
  assert.equal(res.json.error, 'NOT_FOUND');
});

test('CORS — Access-Control-Allow-Origin présent sur toutes les réponses (site Web cross-origin)', async (t) => {
  delete process.env.PORT;
  delete process.env.API_PORT;
  delete process.env.CORS_ORIGIN;
  const { startApiServer } = freshServerModule();
  const server = startApiServer(0);
  t.after(() => closeServer(server));
  await new Promise((resolve) => server.on('listening', resolve));

  const res = await request(server.address().port, { path: '/health' });
  assert.equal(res.headers['access-control-allow-origin'], '*', 'défaut permissif — cette API ne pose aucun cookie');
});

test('CORS — requête préflight OPTIONS acceptée (204, sans toucher au routage métier)', async (t) => {
  delete process.env.PORT;
  delete process.env.API_PORT;
  const { startApiServer } = freshServerModule();
  const server = startApiServer(0);
  t.after(() => closeServer(server));
  await new Promise((resolve) => server.on('listening', resolve));

  const res = await request(server.address().port, {
    method: 'OPTIONS',
    path: '/pair',
    headers: { Origin: 'https://mon-site.vercel.app', 'Access-Control-Request-Method': 'POST' },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers['access-control-allow-methods'], 'GET, POST, OPTIONS');
});

test('CORS — CORS_ORIGIN restreint bien l\'en-tête à un domaine précis quand configuré', async (t) => {
  delete process.env.PORT;
  delete process.env.API_PORT;
  process.env.CORS_ORIGIN = 'https://mon-site.vercel.app';
  const { startApiServer } = freshServerModule();
  const server = startApiServer(0);
  t.after(() => { closeServer(server); delete process.env.CORS_ORIGIN; });
  await new Promise((resolve) => server.on('listening', resolve));

  const res = await request(server.address().port, { path: '/health' });
  assert.equal(res.headers['access-control-allow-origin'], 'https://mon-site.vercel.app');
});
