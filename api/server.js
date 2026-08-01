/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   𝐃𝐈𝐏𝐏𝐄𝐑 — API Pairing HTTP (Phase 4A)                     ║
 * ║   api/server.js                                               ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * RÔLE :
 *   Exposer utils/pairingService.js via HTTP, pour que le futur site
 *   Web (Phase 4B) et le futur bot Telegram (Phase 4C) puissent tous les
 *   deux créer des sessions de pairing par une SEULE et MÊME API — donc
 *   par le même moteur — sans dupliquer la moindre logique de pairing.
 *
 * CE FICHIER NE CONTIENT AUCUNE LOGIQUE MÉTIER :
 *   - Il ne décide jamais si un numéro est valide, si une session existe
 *     déjà, s'il faut un cooldown, etc. — tout ça vit dans
 *     utils/pairingService.js (Phase 3) et n'est pas dupliqué ici.
 *   - Son seul travail : parser une requête HTTP, appeler
 *     pairingService.createPairingSession(), sérialiser la réponse.
 *
 * CHOIX TECHNIQUE — module `http` natif de Node (PAS Express) :
 *   Le projet n'a aucune dépendance HTTP existante (aucun serveur avant
 *   cette phase). Une seule route POST ne justifie pas d'ajouter Express
 *   (et sa propre arborescence de dépendances) au projet. `http` natif
 *   permet aussi de tester ce module immédiatement dans n'importe quel
 *   environnement Node, sans installation supplémentaire. Si l'API
 *   grossit significativement (plusieurs dizaines de routes, besoin de
 *   middlewares complexes), migrer vers Express reste trivial — ce fichier
 *   n'expose que `createServer()`, remplaçable sans toucher au reste du
 *   projet ni à pairingService.js.
 *
 * DÉMARRAGE :
 *   [Phase 1 — chantier Pairing/stabilisation] Automatique, toujours —
 *   plus besoin de configurer quoi que ce soit manuellement. API_PORT
 *   reste utilisable pour choisir un port précis ; en son absence, un
 *   port par défaut (3001) est utilisé.
 */

'use strict';

const http = require('http');
const { createPairingSession, PairingError } = require('../utils/pairingService');
const sessionManager = require('../utils/sessionManager');
const { tryServeStatic } = require('./staticFiles');

const MAX_BODY_BYTES = 10 * 1024; // largement suffisant pour { phoneNumber }

/**
 * [PHASE 4D] Protection optionnelle des routes internes (/session/status,
 * /session/stop) par clé partagée. Ces deux routes ne portent aucune
 * notion de "propriétaire" (c'est le bot Telegram qui vérifie
 * l'appartenance dans son propre store avant d'appeler l'API) — sans
 * protection, n'importe qui ayant accès réseau à l'API peut interroger
 * ou déconnecter n'importe quel numéro. Si API_INTERNAL_TOKEN est
 * défini, ces deux routes exigent l'en-tête `X-Internal-Token` en
 * correspondance exacte. Non défini = comportement inchangé (ouvert),
 * pour ne rien casser des déploiements existants qui n'ont pas encore
 * configuré cette variable — mais fortement recommandé dès que l'API
 * n'est plus strictement interne entre les deux projets.
 */
function isAuthorizedInternalCall(req) {
  const token = process.env.API_INTERNAL_TOKEN;
  if (!token) return true; // pas de protection configurée -> comportement d'origine
  return req.headers['x-internal-token'] === token;
}

/**
 * [Audit site Web] CORS — le site de pairing (souvent déployé sur Vercel,
 * un domaine différent de cette API) appelle POST /pair depuis le
 * navigateur : sans en-têtes CORS, le navigateur bloque la réponse même
 * si la requête aboutit correctement côté serveur. Cette API ne pose pas
 * de cookies et ne lit aucune donnée d'authentification par cookie — un
 * `Access-Control-Allow-Origin` large est donc sans risque ici (à la
 * différence d'une API à session/cookie, où '*' serait dangereux).
 * `CORS_ORIGIN` reste configurable (domaine précis) si souhaité ; '*' par
 * défaut pour fonctionner immédiatement, quel que soit le domaine du site.
 */
function applyCorsHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Internal-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Correspondance code d'erreur métier (Phase 3) → code HTTP.
// Un seul endroit à maintenir si de nouveaux codes d'erreur apparaissent
// dans pairingService.js.
const ERROR_STATUS = {
  INVALID_NUMBER: 400,
  COOLDOWN: 429,
  ALREADY_ACTIVE: 409,
  NO_MONGODB: 503,
  DB_UNAVAILABLE: 503,
  CODE_FAILED: 502,
};

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Lit et parse le corps JSON d'une requête, avec une limite de taille
 * stricte (protection basique contre un corps de requête abusif).
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Corps de requête trop volumineux.'), { statusCode: 413 }));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });

    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        reject(Object.assign(new Error('JSON invalide.'), { statusCode: 400 }));
      }
    });

    req.on('error', reject);
  });
}

/**
 * Identifie l'appelant pour l'anti-abus (cooldown) déjà géré par
 * pairingService.js — ne réimplémente rien, fournit juste une clé.
 * Derrière un proxy (Railway, Nginx...), X-Forwarded-For contient l'IP
 * réelle du client ; sinon on retombe sur le socket direct.
 */
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * POST /pair
 * Body attendu : { "phoneNumber": "22912345678" }
 * Champs optionnels [Chantier "Architecture hybride"] — rétrocompatibles,
 * absents des requêtes existantes du bot Telegram / site Web sans que rien
 * ne casse :
 *   - "origin" : d'où vient la demande ('telegram', 'web', ...). Par
 *     défaut 'api' si absent (on sait que ça vient du canal HTTP, mais pas
 *     précisément de qui).
 *   - "owner"  : identifiant de qui demande (ex: id utilisateur Telegram,
 *     session du site Web). Par défaut l'IP de l'appelant si absent.
 * Réponse 200  : { "sessionId": "...", "pairingCode": "ABCD-1234"|null, "reconnected": bool }
 * Réponse erreur : { "error": "<CODE>", "message": "..." } avec le status
 *   HTTP correspondant (cf. ERROR_STATUS).
 */
async function handlePairRoute(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJSON(res, err.statusCode || 400, { error: 'BAD_REQUEST', message: err.message });
  }

  const phoneNumber = body?.phoneNumber;
  if (!phoneNumber) {
    return sendJSON(res, 400, {
      error: 'MISSING_PHONE_NUMBER',
      message: 'Le champ "phoneNumber" est requis dans le corps JSON.',
    });
  }

  const requesterKey = getClientIp(req);
  const origin = (typeof body?.origin === 'string' && body.origin.trim()) || 'api';
  const owner  = (typeof body?.owner === 'string' && body.owner.trim()) || requesterKey;

  try {
    const result = await createPairingSession(phoneNumber, { requesterKey, origin, owner });
    return sendJSON(res, 200, result);
  } catch (err) {
    if (err instanceof PairingError) {
      const status = ERROR_STATUS[err.code] || 400;
      return sendJSON(res, status, { error: err.code, message: err.message });
    }
    console.error('[api] /pair erreur inattendue:', err);
    return sendJSON(res, 500, { error: 'INTERNAL_ERROR', message: 'Erreur interne.' });
  }
}

/**
 * GET /session/status?phoneNumber=22912345678
 * Réponse 200 : { sessionId, exists: bool, isOnline: bool, isRegistered: bool }
 *
 * [AJOUT — séparation du bot Telegram] Lecture seule, ne fait qu'exposer
 * sessionManager.getSession() (déjà existant, non modifié) — nécessaire
 * maintenant que le bot Telegram est un projet indépendant qui ne peut
 * plus faire `require('../utils/sessionManager')` directement.
 * 🔒 SÉCURITÉ : protégé par API_INTERNAL_TOKEN si configuré (voir
 * isAuthorizedInternalCall) — sinon ouvert par défaut (comportement
 * d'origine, pour ne rien casser).
 */
function handleSessionStatusRoute(req, res, query) {
  if (!isAuthorizedInternalCall(req)) {
    return sendJSON(res, 401, { error: 'UNAUTHORIZED', message: 'En-tête X-Internal-Token invalide ou manquant.' });
  }

  const phoneNumber = query.get('phoneNumber');
  if (!phoneNumber) {
    return sendJSON(res, 400, { error: 'MISSING_PHONE_NUMBER', message: 'Le paramètre "phoneNumber" est requis.' });
  }

  let session = null;
  try { session = sessionManager.getSession(phoneNumber); } catch (_) {}

  return sendJSON(res, 200, {
    sessionId: sessionManager.toSessionId(phoneNumber),
    exists: !!session,
    isOnline: !!session?.isOnline,
    isRegistered: !!session?.isRegistered,
  });
}

/**
 * POST /session/stop
 * Body : { "phoneNumber": "22912345678" }
 * Réponse 200 : { success: true }
 *
 * [AJOUT — séparation du bot Telegram] N'expose que
 * sessionManager.stopSession() (déjà existant, non modifié) — nécessaire
 * pour que /delsession (Telegram, maintenant indépendant) puisse
 * déconnecter réellement une session sans accéder directement au moteur.
 *
 * 🔒 SÉCURITÉ : protégé par API_INTERNAL_TOKEN si configuré (voir
 * isAuthorizedInternalCall ci-dessus) — sinon ouvert par défaut pour ne
 * pas casser les déploiements existants ; fortement recommandé de le
 * configurer dès que l'API sort d'une communication strictement interne
 * entre le projet WhatsApp et le projet Telegram.
 */
async function handleSessionStopRoute(req, res) {
  if (!isAuthorizedInternalCall(req)) {
    return sendJSON(res, 401, { error: 'UNAUTHORIZED', message: 'En-tête X-Internal-Token invalide ou manquant.' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJSON(res, err.statusCode || 400, { error: 'BAD_REQUEST', message: err.message });
  }

  const phoneNumber = body?.phoneNumber;
  if (!phoneNumber) {
    return sendJSON(res, 400, { error: 'MISSING_PHONE_NUMBER', message: 'Le champ "phoneNumber" est requis dans le corps JSON.' });
  }

  try {
    const stopped = await sessionManager.stopSession(phoneNumber);
    return sendJSON(res, 200, { success: !!stopped });
  } catch (err) {
    console.error('[api] /session/stop erreur inattendue:', err);
    return sendJSON(res, 500, { error: 'INTERNAL_ERROR', message: 'Erreur interne.' });
  }
}

/**
 * Construit le serveur HTTP (sans le démarrer) — utile pour les tests,
 * qui peuvent appeler `.listen(0, ...)` sur un port éphémère.
 */
function createServer() {
  return http.createServer(async (req, res) => {
    try {
      applyCorsHeaders(req, res);

      if (req.method === 'OPTIONS') {
        // Préflight CORS du navigateur avant le vrai POST /pair — aucune
        // route métier ne doit le traiter, juste confirmer que c'est autorisé.
        res.writeHead(204);
        return res.end();
      }

      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJSON(res, 200, { status: 'ok' });
      }
      if (req.method === 'POST' && url.pathname === '/pair') {
        return await handlePairRoute(req, res);
      }
      if (req.method === 'GET' && url.pathname === '/session/status') {
        return handleSessionStatusRoute(req, res, url.searchParams);
      }
      if (req.method === 'POST' && url.pathname === '/session/stop') {
        return await handleSessionStopRoute(req, res);
      }
      // [Fusion site+API — voir api/staticFiles.js] Aucune route API ne
      // correspond : tente de servir le site (public/) sur cette même
      // origine, comme inconnu.js le fait pour pair.html. Si ce n'est pas
      // non plus un fichier connu, on retombe sur le 404 JSON habituel.
      if (tryServeStatic(req, res, url.pathname)) {
        return;
      }
      return sendJSON(res, 404, { error: 'NOT_FOUND', message: 'Route inconnue.' });
    } catch (err) {
      console.error('[api] erreur non gérée:', err);
      try { sendJSON(res, 500, { error: 'INTERNAL_ERROR', message: 'Erreur interne.' }); } catch (_) {}
    }
  });
}

/**
 * Démarre le serveur automatiquement, toujours (Phase 1 — chantier
 * Pairing/stabilisation ; port/host universels — chantier "API Pairing
 * universelle").
 *
 * [CAUSE RACINE IDENTIFIÉE PAR AUDIT] Cette fonction ne lisait
 * auparavant QUE `API_PORT` (variable maison, non standard). Or la
 * quasi-totalité des hébergeurs Node (Railway, Render, Katabump,
 * TeoHéberge, etc.) assignent dynamiquement le port public via la
 * variable standard `PORT` et redirigent le trafic externe vers ce
 * port précis — jamais vers 3001. Si l'API ignorait `PORT` et écoutait
 * sur 3001 par défaut, l'hébergeur ne trouvait jamais le process
 * derrière son proxy public : c'est exactement le symptôme "Can't
 * reach the pairing service at this address". `PORT` est donc
 * maintenant prioritaire ; `API_PORT` reste supporté ensuite (VPS/
 * Docker/environnements partagés où l'on veut choisir un port précis
 * sans que l'hébergeur en impose un) ; 3001 reste le dernier repli.
 *
 * [ÉCOUTE RÉSEAU] `server.listen(port, callback)` sans hôte explicite
 * écoute déjà, en Node, sur toutes les interfaces disponibles — mais le
 * laisser implicite est fragile (comportement historiquement dépendant
 * de la config IPv4/IPv6 de l'environnement Docker/VPS). On fixe donc
 * explicitement `0.0.0.0` : l'API écoute sur toutes les interfaces
 * IPv4, jamais seulement `localhost`/`127.0.0.1`, ce qui est la seule
 * façon d'être joignable depuis le proxy public de n'importe quel
 * hébergeur.
 *
 * @param {number|string} [port] Par défaut process.env.PORT, sinon
 *   process.env.API_PORT, sinon 3001.
 * @returns {import('http').Server}
 */
function startApiServer(port = process.env.PORT || process.env.API_PORT || 3001) {
  const HOST = '0.0.0.0';
  const server = createServer();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[api] ❌ Le port ${port} est déjà utilisé par un autre process. ` +
        `Sur la plupart des hébergeurs (Railway, Render, Katabump...), ne définissez pas ` +
        `API_PORT manuellement — laissez l'hébergeur fournir PORT automatiquement.`);
    } else if (err.code === 'EACCES') {
      console.error(`[api] ❌ Permission refusée pour écouter sur le port ${port} ` +
        `(les ports < 1024 requièrent des privilèges root sur la plupart des systèmes).`);
    } else {
      console.error('[api] ❌ Erreur serveur:', err.message);
    }
  });

  server.listen(port, HOST, () => {
    const source = process.env.PORT ? 'PORT' : (process.env.API_PORT ? 'API_PORT' : 'défaut');
    console.log(`[api] 🌐 API Pairing en écoute sur ${HOST}:${port} (source du port : ${source})`);
    console.log(`[api] ℹ️  Interface d'écoute : 0.0.0.0 (toutes les interfaces réseau) — ` +
      `accessible depuis Internet via l'URL publique fournie par votre hébergeur, pas via "localhost".`);
  });

  return server;
}

module.exports = {
  createServer,
  startApiServer,
};
