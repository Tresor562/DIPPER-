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

const { getDb } = require('./mongoClient');
const sessionManager = require('./sessionManager');
const sessionContext = require('./sessionContext');

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
 *   `pairingCode` est `null` si `reconnected` est `true` (session déjà
 *   appairée, aucun nouveau code à saisir).
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
    db = await getDb();
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

  // ── Reconnexion : des identifiants existaient déjà (numéro déjà appairé
  // précédemment) — pas besoin d'un nouveau code, la session vient de se
  // reconnecter avec ses creds MongoDB existants.
  if (session.isRegistered) {
    return { sessionId, pairingCode: null, reconnected: true };
  }

  // ── Nouvelle session : demander le code de pairing.
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
