/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   𝐃𝐈𝐏𝐏𝐄𝐑 — Fichiers statiques du site de pairing              ║
 * ║   api/staticFiles.js                                          ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * RÔLE :
 *   Servir public/ (le site web de pairing : index.html, css/, js/,
 *   img/, audio/) depuis le MÊME serveur HTTP que POST /pair.
 *
 * POURQUOI (audit du projet "inconnu" demandé par l'utilisateur) :
 *   Dans FREE-MINI-BASE (inconnu.js), le site (pair.html) et l'API de
 *   pairing tournent dans le même process Express — le front appelle
 *   fetch('/code') en relatif, donc toujours la même origine que la
 *   page elle-même. Aucune URL d'API à configurer, aucun souci CORS.
 *
 *   Ce projet-ci avait au contraire deux déploiements séparés (site sur
 *   Vercel, API sur Katabump/Railway/etc.), ce qui obligeait à configurer
 *   window.DIPPER_API_BASE_URL avec la bonne URL publique de l'API — un
 *   point de défaillance supplémentaire (URL oubliée, mal recopiée, API
 *   redéployée avec une nouvelle IP...), confirmé être la cause de
 *   l'erreur "Can't reach the server" rencontrée en pratique.
 *
 *   Fusionner les deux, comme inconnu.js, élimine structurellement ce
 *   problème : une fois ce serveur démarré, le site ET l'API répondent
 *   sur la même IP:port, sans configuration supplémentaire.
 *
 * SÉCURITÉ :
 *   - Protection anti path-traversal (`..`, chemins hors de public/).
 *   - Aucune dépendance ajoutée (module `fs`/`path` natifs), cohérent
 *     avec le choix déjà fait dans api/server.js.
 *   - Aucun listing de répertoire : chemin inconnu → 404 (jamais la
 *     liste des fichiers du dossier).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Tente de servir `pathname` depuis public/. Retourne true si la requête
 * a été prise en charge (fichier servi OU 404 explicite pour une requête
 * qui ressemble à un fichier statique), false si l'appelant doit continuer
 * à chercher une autre route (ex: routes API définies dans server.js).
 */
function tryServeStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  const safePath = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.normalize(path.join(PUBLIC_DIR, safePath));

  // Anti path-traversal : le chemin résolu doit rester DANS public/.
  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== PUBLIC_DIR) {
    return false;
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return false; // pas un fichier connu -> laisser server.js gérer (404 API)
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
  const data = fs.readFileSync(resolved);

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': data.length,
    // Le HTML/JS/CSS du site peut changer souvent (config, correctifs) ;
    // pas de cache long ici, contrairement aux vraies statiques versionnées.
    'Cache-Control': ext === '.mp3' ? 'public, max-age=86400' : 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : data);
  return true;
}

module.exports = { tryServeStatic };
