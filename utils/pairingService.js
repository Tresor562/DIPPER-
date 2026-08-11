/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   𝐃𝐈𝐏𝐏𝐄𝐑 — Pairing Service (Phase 3)                        ║
 * ║   utils/pairingService.js                                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * RÔLE :
 *   Point d'entrée UNIQUE pour créer une session de pairing, quel que
 *   soit le canal appelant (commande WhatsApp `.pair`, futur bot
 *   Telegram, futur site Web). Ce module ne contient AUCUN code
 *   spécifique à un canal — pas de sock.sendMessage, pas d'API Telegram,
 *   pas de réponse HTTP. Il retourne { sessionId, pairingCode } et laisse
 *   le canal appelant décider comment l'afficher.
 *
 * RÉUTILISE (n'invente rien de nouveau) :
 *   - utils/mongoClient.js   → connexion Mongo partagée
 *   - utils/sessionManager.js → startSession()/requestPairingCode()/getSession()
 *   - utils/sessionContext.js → anti-abus scopé par session (cf. Phase 2)
 *
 * NE FAIT PAS (volontairement, hors périmètre Phase 3) :
 *   - Ne développe ni le bot Telegram ni le site Web.
 *   - Ne gère pas le mode mono-session legacy (sans MongoDB) — ce mode
 *     reste sur son propre chemin dans commands/bot_sovereignty/pair.js
 *     (_pairLegacy), qui n'a rien à voir avec le multi-session.
 */

'use strict';

const mongoClient = require('./mongoClient');
const sessionManager = require('./sessionManager');
const sessionContext = require('./sessionContext');
const fileAuthState = require('./fileAuthState');
const mongoAuth = require('./mongoAuth');
const sessionIndex = require('./sessionIndex');

/**
 * Erreur typée — le canal appelant peut lire `err.code` pour choisir le
 * bon message utilisateur sans avoir à parser une chaîne de texte.
 */
class PairingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PairingError';
    this.code = code;
  }
}

// ── Anti-abus léger : un utilisateur ne peut redemander un pairing que
// toutes les PAIRING_COOLDOWN_MS. Nécessaire maintenant que .pair est
// self-service (Phase 3) — sans ça, n'importe qui pourrait spammer la
// création de sockets Baileys. Scopé par session (Phase 2) au cas où le
// même identifiant demandeur existerait sous deux sessions différentes.
const PAIRING_COOLDOWN_MS = 30 * 1000;
const _cooldowns = new Map();

// Une session dont les creds indiquent `registered: true` n'est pas forcément
// réellement reconnectée. On laisse donc un court délai au socket pour passer
// à `isOnline=true` avant de décider qu'il faut refaire le pairing.
const RECONNECT_GRACE_MS = 12 * 1000;
const RECONNECT_POLL_MS = 250;

function checkAndSetCooldown(requesterKey) {
  if (!requesterKey) return 0; // pas de clé fournie → pas de limitation possible
  const key = sessionContext.scopeKey(`pairingReq:${requesterKey}`);
  const now = Date.now();
  const last = _cooldowns.get(key) || 0;

  if (now - last < PAIRING_COOLDOWN_MS) {
    return Math.ceil((PAIRING_COOLDOWN_MS - (now - last)) / 1000);
  }

  _cooldowns.set(key, now);
  if (_cooldowns.size > 5000) {
    const cutoff = now - PAIRING_COOLDOWN_MS;
    for (const [k, ts] of _cooldowns) if (ts < cutoff) _cooldowns.delete(k);
  }
  return 0;
}

function normalizeNumber(rawNumber) {
  return String(rawNumber || '').replace(/\D/g, '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Attend une vraie ouverture de socket. Important : `creds.registered` veut
 * seulement dire que des credentials existent ; cela ne prouve pas que la
 * session est encore acceptée par WhatsApp ni qu'elle est actuellement en
 * ligne.
 */
async function waitForSessionOnline(phoneNumber, timeoutMs = RECONNECT_GRACE_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = sessionManager.getSession(phoneNumber);
    if (current?.isOnline) return true;
    await sleep(RECONNECT_POLL_MS);
  }
  return !!sessionManager.getSession(phoneNumber)?.isOnline;
}

/**
 * Supprime l'auth persistante de la session dans les deux backends possibles.
 *
 * - En développement/source, sessionManager peut encore utiliser les fichiers
 *   locaux (utils/fileAuthState.js).
 * - Sur Render, persistence-patch.js remplace ce backend par MongoDB
 *   (utils/mongoAuth.js).
 *
 * Lorsqu'un utilisateur demande explicitement un re-pairing après l'échec
 * d'une vraie reconnexion, conserver l'un des deux backends permettrait au
 * prochain startSession() de recharger exactement les mêmes creds invalides.
 * On nettoie donc les deux, mais uniquement après la fenêtre de reconnexion.
 */
async function clearPersistentAuth(db, sessionId) {
  const failures = [];

  try {
    await fileAuthState.deleteSessionFiles(sessionId);
  } catch (err) {
    failures.push(`fichiers: ${err.message}`);
  }

  if (typeof mongoAuth.deleteMongoSession === 'function') {
    try {
      await mongoAuth.deleteMongoSession(db, sessionId);
    } catch (err) {
      failures.push(`mongo: ${err.message}`);
    }
  }

  if (failures.length) {
    throw new Error(`Nettoyage auth incomplet (${failures.join(' | ')})`);
  }
}

/**
 * Réinitialise uniquement une session enregistrée qui n'a pas réussi à
 * redevenir réellement en ligne pendant la fenêtre de grâce. L'utilisateur
 * a explicitement demandé un pairing/re-pairing : on ferme donc le socket
 * hors ligne, retire ses credentials devenus inutilisables dans le backend
 * réellement utilisé (fichiers et/ou Mongo), remet l'index à l'état non
 * enregistré, puis crée un socket vierge capable de fournir un nouveau code.
 */
async function resetDisconnectedRegisteredSession(db, cleanNumber, meta) {
  const sessionId = sessionManager.toSessionId(cleanNumber);

  try { await sessionManager.stopSession(cleanNumber); } catch (_) {}
  await clearPersistentAuth(db, sessionId);
  try {
    await sessionIndex.setState(sessionId, { isOnline: false, isRegistered: false });
  } catch (_) {
    // Mongo a déjà été vérifié au début du flux ; une erreur transitoire ici
    // ne doit pas empêcher le nouveau pairing WhatsApp.
  }

  return sessionManager.startSession(db, cleanNumber, {
    isPairing: true,
    owner: meta.owner,
    origin: meta.origin,
  });
}

/**
 * createPairingSession — crée (ou reconnecte) une session multi-utilisateur
 * et retourne le code à afficher.
 *
 * @param {string} phoneNumber Numéro WhatsApp à connecter (celui qui recevra
 *   le code dans son application WhatsApp).
 * @param {{ requesterKey?: string, owner?: string, origin?: string }} [options]
 *   `requesterKey` identifie qui fait la demande (ex: JID WhatsApp, id
 *   Telegram, id de session Web) — utilisé pour l'anti-abus (cooldown),
 *   optionnel. `owner`/`origin` [Chantier "Architecture hybride"] alimentent
 *   l'index de métadonnées Mongo (utils/sessionIndex.js) ; tous deux
 *   optionnels et rétrocompatibles :
 *     - `owner` : par défaut `requesterKey` si absent (déjà fourni tel quel
 *       par commands/bot_sovereignty/pair.js, non modifié par ce chantier).
 *     - `origin` : par défaut `'whatsapp'` si absent — seul appelant interne
 *       de ce module qui ne le précise pas (le canal HTTP, utilisé par le
 *       bot Telegram et le site Web, le précise toujours explicitement,
 *       voir api/server.js).
 * @returns {Promise<{ sessionId: string, pairingCode: string|null, reconnected: boolean }>}
 *   `pairingCode` est `null` si `reconnected` est `true` (session réellement
 *   reconnectée avec succès, aucun nouveau code à saisir).
 * @throws {PairingError} codes possibles :
 *   INVALID_NUMBER, COOLDOWN, ALREADY_ACTIVE, NO_MONGODB, CODE_FAILED
 */
async function createPairingSession(phoneNumber, options = {}) {
  if (!process.env.MONGODB_URI) {
    throw new PairingError('NO_MONGODB', "MONGODB_URI manquant — le Pairing Service nécessite le mode multi-session.");
  }

  const owner  = options.owner || options.requesterKey || 'unknown';
  const origin = options.origin || 'whatsapp';

  const cleanNumber = normalizeNumber(phoneNumber);
  if (!cleanNumber || cleanNumber.length < 7 || cleanNumber.length > 15) {
    // [PHASE 4D] Bug réel corrigé : seule une longueur minimale était
    // vérifiée. La norme E.164 (format international des numéros de
    // téléphone) plafonne à 15 chiffres — au-delà, ce n'est plus un
    // numéro de téléphone plausible, et tenter un pairing dessus est
    // voué à l'échec (perte de temps + session vouée à devenir orpheline).
    throw new PairingError('INVALID_NUMBER', 'Numéro invalide.');
  }

  const waitSec = checkAndSetCooldown(options.requesterKey);
  if (waitSec > 0) {
    throw new PairingError('COOLDOWN', `Merci de patienter ${waitSec}s avant une nouvelle demande.`);
  }

  const sessionId = sessionManager.toSessionId(cleanNumber);

  // ── Anti-doublon : une session déjà EN LIGNE pour ce numéro ne doit pas
  // être recréée par-dessus (perdrait la connexion active pour rien).
  const existing = sessionManager.getSession(cleanNumber);
  if (existing?.isOnline) {
    throw new PairingError('ALREADY_ACTIVE', `Une session est déjà active pour +${cleanNumber}.`);
  }

  let db;
  try {
    db = await mongoClient.getDb();
  } catch (err) {
    // [Chantier Pairing/stabilisation] Avant ce correctif, une erreur de
    // connexion MongoDB (mauvais URI, identifiants, IP non whitelistée,
    // cluster en pause, réseau...) n'était PAS interceptée ici : elle
    // remontait telle quelle jusqu'à api/server.js, qui la traitait comme
    // une exception générique -> { error: 'INTERNAL_ERROR' } -> le site
    // Web affichait alors littéralement "Something went wrong on our end."
    // sans aucune indication utile, quel que soit le canal appelant.
    // Typée ici, elle devient actionnable (message clair, code HTTP dédié).
    throw new PairingError('DB_UNAVAILABLE', `Connexion à la base de données impossible : ${err.message}`);
  }

  let session;
  try {
    session = await sessionManager.startSession(db, cleanNumber, { isPairing: true, owner, origin });
  } catch (err) {
    throw new PairingError('CODE_FAILED', `Échec de création de la session : ${err.message}`);
  }

  // ── Reconnexion réelle : `registered` signifie seulement que des creds
  // existent. Avant ce correctif, on renvoyait immédiatement `reconnected`
  // ici, même si le socket restait hors ligne ou si WhatsApp avait invalidé
  // ces creds. Désormais on attend `connection === 'open'` via isOnline.
  if (session.isRegistered) {
    const isReallyOnline = await waitForSessionOnline(cleanNumber);
    if (isReallyOnline) {
      return { sessionId, pairingCode: null, reconnected: true };
    }

    // L'utilisateur a demandé explicitement une reconnexion mais les anciens
    // creds n'ont pas permis de revenir en ligne : repartir proprement sur un
    // auth state vierge afin de générérer un nouveau code au lieu de répondre
    // à tort "déjà appairé".
    try {
      session = await resetDisconnectedRegisteredSession(db, cleanNumber, { owner, origin });
    } catch (err) {
      throw new PairingError('CODE_FAILED', `Échec de réinitialisation de la session : ${err.message}`);
    }
  }

  // ── Nouvelle session (ou ancienne session réinitialisée) : demander le
  // code uniquement si le nouvel auth state n'est pas déjà enregistré.
  if (session.isRegistered) {
    throw new PairingError('CODE_FAILED', 'La session reste enregistrée mais ne parvient pas à se reconnecter. Réessaie dans un instant.');
  }

  try {
    const pairingCode = await sessionManager.requestPairingCode(cleanNumber);
    return { sessionId, pairingCode, reconnected: false };
  } catch (err) {
    // Rollback : la session a été créée en mémoire mais le code a échoué —
    // ne pas laisser une session fantôme sans code utilisable.
    try { await sessionManager.stopSession(cleanNumber); } catch (_) {}
    throw new PairingError('CODE_FAILED', err.message);
  }
}

module.exports = {
  createPairingSession,
  PairingError,
};
