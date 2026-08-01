/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   𝐃𝐈𝐏𝐏𝐄𝐑 — Contexte de session (Phase 1)                    ║
 * ║   utils/sessionContext.js                                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * RÔLE :
 *   Porter le sessionId courant à travers toute la chaîne d'exécution
 *   asynchrone d'un message, SANS toucher handler.js ni les 193 fichiers
 *   de commandes. Chaque commande continue d'appeler
 *   require('../../database').getGroupSettings(jid) exactement comme
 *   avant — database.js lit simplement quel est le sessionId « courant »
 *   via ce module pour choisir le bon dossier de données.
 *
 * POURQUOI AsyncLocalStorage :
 *   Node propage automatiquement le store à travers await/Promise/setTimeout
 *   issus du même appel initial. Un seul point d'entrée par message
 *   (sessionContext.run(sessionId, () => handler.handleMessage(...)))
 *   suffit à couvrir tout ce que handler.js déclenche derrière, sans
 *   modification de handler.js lui-même.
 *
 * SESSION PAR DÉFAUT :
 *   En mode mono-session (pas de MONGODB_URI, bot historique), aucun
 *   sessionId explicite n'existe. On utilise DEFAULT_SESSION_ID pour que
 *   database.js retombe sur un dossier stable, qui reçoit une seule fois
 *   au démarrage les anciennes données globales (database/*.json) —
 *   voir la migration dans database.js. Rien n'est perdu.
 */

'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const DEFAULT_SESSION_ID = 'default';

const storage = new AsyncLocalStorage();

/**
 * Exécute `fn` avec `sessionId` comme session courante pour toute la
 * chaîne asynchrone déclenchée à l'intérieur.
 * @param {string} sessionId
 * @param {Function} fn
 */
function run(sessionId, fn) {
  return storage.run({ sessionId: sessionId || DEFAULT_SESSION_ID }, fn);
}

/**
 * Retourne le sessionId courant, ou DEFAULT_SESSION_ID si appelé hors
 * de tout contexte (ex: scripts, tests, code exécuté au démarrage).
 */
function getCurrentSessionId() {
  const store = storage.getStore();
  return store?.sessionId || DEFAULT_SESSION_ID;
}

/**
 * Préfixe une clé de cache mémoire (Map/Set) avec la session courante.
 * À utiliser pour tout cooldown / cache / état de jeu / anti-spam en
 * mémoire qui serait sinon keyé uniquement par un jid/groupId — ces
 * identifiants WhatsApp sont uniques globalement mais PAS uniques par
 * session (un même utilisateur ou un même groupe peut interagir avec
 * plusieurs bots/sessions distincts sur ce serveur). Sans ce préfixe,
 * deux sessions partageraient silencieusement cooldowns/états/anti-spam.
 * @param {string} rawKey
 */
function scopeKey(rawKey) {
  return `${getCurrentSessionId()}::${rawKey}`;
}

module.exports = {
  run,
  getCurrentSessionId,
  scopeKey,
  DEFAULT_SESSION_ID,
};
