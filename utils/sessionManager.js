/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   𝐃𝐈𝐏𝐏𝐄𝐑 — Session Manager Multi-Utilisateurs              ║
 * ║   utils/sessionManager.js                                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * RÔLE :
 *   Gère toutes les sessions WhatsApp actives simultanément.
 *   Chaque utilisateur = 1 socket Baileys + 1 dossier local de credentials
 *   (utils/fileAuthState.js) + 1 entrée de métadonnées dans l'index Mongo
 *   (utils/sessionIndex.js).
 *
 * [Chantier "Architecture hybride"] Avant : credentials ET métadonnées
 * vivaient tous les deux dans MongoDB (utils/mongoAuth.js). Désormais :
 *   - Credentials (creds.json, keys, app-state-sync-keys) → fichiers
 *     locaux, un dossier par session (utils/fileAuthState.js).
 *   - Métadonnées (sessionId, numéro, owner, origine, état, activité,
 *     stats) → MongoDB devient un index, plus un stockage de credentials
 *     (utils/sessionIndex.js).
 * utils/mongoAuth.js n'est plus utilisé par ce fichier (conservé tel quel,
 * non supprimé — voir Phase 3, migration).
 *
 * FONCTIONNEMENT :
 *   1. Au démarrage → lit l'index MongoDB (sessionIndex.listSessions()),
 *      retrouve le dossier local de chaque session, recharge Baileys et
 *      reconnecte.
 *   2. .pair <num>  → crée une nouvelle session pour ce numéro
 *   3. Déconnexion  → reconnexion automatique (sauf loggedOut)
 *   4. Crash        → relance avec backoff exponentiel
 *
 * ISOLATION :
 *   - Chaque session a ses propres listeners (pas de double-event)
 *   - processedMessages par session (pas de conflit)
 *   - Timers (heartbeat, monitor) par session
 *
 * ANTI-MEMORY-LEAK :
 *   - Nettoyage complet des listeners à chaque déconnexion
 *   - Map sessions avec nettoyage des entrées mortes
 */

'use strict';

const {
  default: makeWASocket,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  proto,
} = require('@whiskeysockets/baileys');
const pino   = require('pino');
const { useFileAuthState, sessionDirExists } = require('./fileAuthState');
const sessionIndex = require('./sessionIndex');
const handler = require('../handler');
const config  = require('../config');
const path    = require('path');
const sessionContext = require('./sessionContext');

// ── Logger silencieux ──────────────────────────────────────────────────────
const silentLogger = pino({ level: 'silent' });

// Les erreurs critiques de session doivent rester visibles même si index.js
// filtre volontairement le bruit interne de Baileys dans console.*.
function logCriticalSessionError(message) {
  try {
    process.stderr.write(`[SessionManager] ${message}\n`);
  } catch {
    console.warn(`[SessionManager] ${message}`);
  }
}

// ── Map globale des sessions actives ──────────────────────────────────────
// sessionId → { sock, sessionId, phoneNumber, timers: {}, processedMessages: Map }
const activeSessions = new Map();

// ── Version Baileys (chargée une seule fois) ──────────────────────────────
let _baileysVersion = null;
async function getBaileysVersion() {
  if (!_baileysVersion) {
    const { version } = await fetchLatestBaileysVersion();
    _baileysVersion = version;
  }
  return _baileysVersion;
}

// ── Store messages par session ─────────────────────────────────────────────
function createMessageStore() {
  const store = new Map();
  const STORE_TTL = 10 * 60 * 1000;
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - STORE_TTL;
    for (const [id, e] of store.entries()) if (e.ts < cutoff) store.delete(id);
  }, 5 * 60 * 1000);
  if (cleanup.unref) cleanup.unref();
  return { store, cleanup };
}

// ── normalise sessionId depuis numéro ─────────────────────────────────────
function toSessionId(phoneNumber) {
  const clean = String(phoneNumber).replace(/\D/g, '');
  return `session_${clean}`;
}

// ── Anti-doublon par session ───────────────────────────────────────────────
function createProcessedMap() {
  const map = new Map();
  const TTL = 30 * 60 * 1000;
  const timer = setInterval(() => {
    const cutoff = Date.now() - TTL;
    for (const [id, ts] of map.entries()) if (ts < cutoff) map.delete(id);
  }, 5 * 60 * 1000);
  if (timer.unref) timer.unref();
  return { map, timer };
}

/**
 * Démarre (ou redémarre) une session pour un numéro donné.
 * @param {import('mongodb').Db} db
 * @param {string}  phoneNumber   — ex: '22912345678'
 * @param {object}  [opts]
 * @param {boolean} [opts.isPairing] — true si démarré depuis .pair (affiche le code)
 * @param {string}  [opts.pairingChatId] — JID du chat pour envoyer le code
 * @param {object}  [opts.pairingSock]   — socket existant pour envoyer le code
 * @returns {Promise<object>} session object
 */
async function startSession(db, phoneNumber, opts = {}) {
  const sessionId = toSessionId(phoneNumber);

  // ── Nettoyer l'ancienne session si elle existe ─────────────────────────
  if (activeSessions.has(sessionId)) {
    const old = activeSessions.get(sessionId);
    _closeSession(old, 'session remplacée');
    activeSessions.delete(sessionId);
  }

  console.log(`[SessionManager] 🚀 Démarrage session : ${sessionId}`);

  // ── Auth state depuis fichiers locaux (Phase 2 — Architecture hybride) ──
  const { state, saveCreds } = await useFileAuthState(sessionId);
  const version = await getBaileysVersion();

  // ── Métadonnées : entrée d'index Mongo (idempotent — n'écrase jamais un
  // owner/origin/createdAt déjà enregistré pour cette session). Non fatal :
  // une panne Mongo transitoire ici ne doit pas empêcher la connexion
  // WhatsApp elle-même de démarrer (pairingService.js a déjà vérifié la
  // disponibilité de Mongo avant d'appeler startSession).
  try {
    await sessionIndex.ensureSession(sessionId, {
      phoneNumber: String(phoneNumber).replace(/\D/g, ''),
      owner: opts.owner,
      origin: opts.origin,
    });
    if (opts.isPairing) await sessionIndex.incrementStat(sessionId, 'pairingCount');
  } catch (err) {
    console.error(`[SessionManager] ⚠️  sessionIndex.ensureSession(${sessionId}) a échoué (non bloquant):`, err.message);
  }

  // ── Stores par session ─────────────────────────────────────────────────
  const { store: messageStore, cleanup: storeCleanup } = createMessageStore();
  const { map: processedMessages, timer: processedTimer } = createProcessedMap();

  let reconnectAttempts = Number.isFinite(opts.reconnectAttempts) ? opts.reconnectAttempts : 0;
  let _isShuttingDown   = false;

  // ── Création du socket ─────────────────────────────────────────────────
  const sock = makeWASocket({
    version,
    logger            : silentLogger,
    printQRInTerminal : false,
    browser           : Browsers.ubuntu('Chrome'),
    auth              : state,
    syncFullHistory   : false,
    downloadHistory   : false,
    markOnlineOnConnect: true,
    keepAliveIntervalMs: 30000,
    retryRequestDelayMs: 2000,
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
      const e = messageStore.get(key.id);
      if (e?.msg?.message) return e.msg.message;
      return proto.Message.fromObject({});
    },
  });

  const session = {
    sock,
    sessionId,
    phoneNumber: String(phoneNumber).replace(/\D/g, ''),
    db,
    timers: { heartbeat: null, monitor: null, ping: null, reconnect: null, storeCleanup, processedTimer },
    processedMessages,
    messageStore,
    reconnectAttempts,
    isOnline: false,
    isRegistered: !!state.creds.registered, // [PHASE 3] déjà appairé (reconnexion) vs nouvelle session
    isStopping: false,
    createdAt: Date.now(), // [PHASE 4D] pour le nettoyage des sessions orphelines (voir startOrphanSessionSweep)
  };
  activeSessions.set(sessionId, session);

  // ─── LISTENER : stockage messages ───────────────────────────────────────
  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
      if (!msg?.key?.id || !msg.message) return;
      messageStore.set(msg.key.id, { msg, ts: Date.now() });
      if (messageStore.size > 2000) {
        const oldest = messageStore.keys().next().value;
        messageStore.delete(oldest);
      }
    }
  });

  // ─── PAIRING CODE (nouvelle session non enregistrée) ───────────────────
  // [PHASE 3] La demande + le formatage du code sont maintenant dans
  // requestPairingCode() (plus bas), appelée par utils/pairingService.js.
  // startSession() ne fait plus qu'un log si la session n'est pas encore
  // enregistrée et qu'aucun pairing n'est en cours — plus de logique
  // d'envoi WhatsApp dupliquée ici (c'était le problème identifié en
  // Phase 0 : "aucune logique dupliquée" entre les canaux).
  if (!state.creds.registered && !opts.isPairing) {
    const cleanNum = String(phoneNumber).replace(/\D/g, '');
    console.log(`[SessionManager] ⏳ Session ${sessionId} non enregistrée — lance .pair ${cleanNum}`);
  }

  // ─── CONNEXION UPDATE ────────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, isNewLogin } = update;

    if (connection === 'close') {
      session.isOnline = false;
      _clearSessionTimers(session);

      const statusCode   = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || 'inconnue';
      const terminalDisconnect = [
        DisconnectReason.loggedOut,
        DisconnectReason.connectionReplaced,
        DisconnectReason.badSession,
      ].includes(statusCode);
      const shouldReconnect = !terminalDisconnect && !_isShuttingDown && !session.isStopping;

      console.log(`[SessionManager] 🔌 ${sessionId} déconnecté — code=${statusCode} | reconnexion=${shouldReconnect}`);
      if (terminalDisconnect || /bad mac|session error|conflict|pair|auth/i.test(errorMessage)) {
        logCriticalSessionError(`❗ ${sessionId} fermeture critique — code=${statusCode ?? '?'} — ${errorMessage}`);
      }
      sessionIndex.setState(sessionId, { isOnline: false }).catch(() => {});

      if (shouldReconnect) {
        reconnectAttempts++;
        session.reconnectAttempts = reconnectAttempts;
        const delay = Math.min(2000 * Math.pow(1.3, reconnectAttempts), 15000);
        console.log(`[SessionManager] 🔄 ${sessionId} reconnexion dans ${(delay / 1000).toFixed(1)}s...`);
        sessionIndex.incrementStat(sessionId, 'reconnectCount').catch(() => {});
        session.timers.reconnect = setTimeout(() => {
          session.timers.reconnect = null;
          if (_isShuttingDown || session.isStopping) return;
          if (activeSessions.get(sessionId) !== session) return;
          startSession(db, phoneNumber, {
            owner: opts.owner,
            origin: opts.origin,
            reconnectAttempts,
          }).catch(err => {
            console.error(`[SessionManager] ❌ reconnexion ${sessionId}:`, err.message);
          });
        }, delay);
        if (session.timers.reconnect.unref) session.timers.reconnect.unref();
      } else {
        console.log(`[SessionManager] ❌ ${sessionId} session terminée — ${errorMessage}`);
        _cleanupSession(session);
        if (activeSessions.get(sessionId) === session) activeSessions.delete(sessionId);
      }

    } else if (connection === 'open') {
      session.isOnline = true;
      session.isRegistered = true;
      reconnectAttempts = 0;
      session.reconnectAttempts = 0;
      processedMessages.clear();
      sessionIndex.setState(sessionId, { isOnline: true, isRegistered: true }).catch(() => {});

      const sId = sock.user?.id?.split(':')[0] || 'unknown';
      console.log(`[SessionManager] ✅ ${sessionId} connecté — @${sId}`);

      // ── Heartbeat ──────────────────────────────────────────────────────
      if (session.timers.heartbeat) clearInterval(session.timers.heartbeat);
      session.timers.heartbeat = setInterval(async () => {
        try { await sock.sendPresenceUpdate('available'); } catch {}
      }, 30000);

      // ── Message de bienvenue (uniquement si nouveau login) ─────────────
      if (isNewLogin) {
        try {
          await sock.sendMessage(`${sId}@s.whatsapp.net`, {
            text: `✅ *${config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑'} — Session ${sessionId} active*\n\n> _Session sauvegardée localement, indexée dans MongoDB_`
          });
        } catch {}
      }

      // ── Initialisation des features par session ────────────────────────
      try { handler.initializeAntiCall(sock); } catch {}
    }
  });

  // ─── CREDS ───────────────────────────────────────────────────────────────
  sock.ev.on('creds.update', async (update) => {
    try { await saveCreds(); } catch (err) {
      console.error(`[SessionManager] ❌ saveCreds ${sessionId}:`, err.message);
    }
    if (update?.registered === true || state.creds?.registered === true) {
      session.isRegistered = true;
      sessionIndex.setState(sessionId, { isRegistered: true }).catch(() => {});
    }
  });

  // ─── MESSAGES (handler principal) ────────────────────────────────────────
  let _lastActivityTouch = 0;
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    // Activité "dernière activité" — throttlée (1x/min max) pour ne pas
    // écrire dans Mongo à chaque message reçu.
    const now = Date.now();
    if (now - _lastActivityTouch > 60_000) {
      _lastActivityTouch = now;
      sessionIndex.touchActivity(sessionId).catch(() => {});
    }
    for (const msg of messages) {
      if (!msg.message || !msg.key?.id) continue;
      const from = msg.key.remoteJid;
      if (!from) continue;
      if (from.includes('@broadcast') || from.includes('@newsletter')) continue;
      if (processedMessages.has(msg.key.id)) continue;
      processedMessages.set(msg.key.id, Date.now());

      try {
        // [FIX SUB-BOT] Injecter le numéro de la session dans sock
        // pour que le handler puisse identifier l'owner correctement.
        // Sans cela, toutes les sessions partagent config.ownerNumber du bot
        // principal → le sous-bot pense que son account est l'owner principal
        // → ghostgMode déclenche des commandes involontaires.
        if (!sock._sessionPhoneNumber) {
          sock._sessionPhoneNumber = String(phoneNumber).replace(/\D/g, '');
        }
        // [PHASE 1 — ISOLATION DONNÉES] Toute la chaîne asynchrone déclenchée
        // par handleMessage (donc tous les appels à database.js faits par les
        // commandes) hérite de ce sessionId via AsyncLocalStorage — sans
        // modifier handler.js ni aucune commande. Voir utils/sessionContext.js.
        await sessionContext.run(sessionId, () => handler.handleMessage(sock, msg));
      } catch (err) {
        if (!err.message?.includes('rate-overlimit')) {
          console.error(`[SessionManager] ${sessionId} handleMessage error:`, err.message);
        }
      }
    }
  });

  // ─── GROUP UPDATES ───────────────────────────────────────────────────────
  sock.ev.on('group-participants.update', async (update) => {
    try { await sessionContext.run(sessionId, () => handler.handleGroupUpdate(sock, update)); } catch {}
    try {
      const { id, participants, action } = update;
      if (action === 'remove' && id?.endsWith('@g.us')) {
        const antipurge = (() => {
          try { return require(path.join(__dirname, '..', 'commands', 'group_guardians', 'antipurge')); }
          catch { return null; }
        })();
        if (antipurge?.enregistrerExpulses) antipurge.enregistrerExpulses(id, participants);
      }
    } catch {}
  });

  return session;
}

/**
 * Nettoie les timers d'une session.
 */
function _clearSessionTimers(session) {
  for (const [key, timer] of Object.entries(session.timers)) {
    if (key === 'storeCleanup' || key === 'processedTimer') continue;
    if (timer) { clearTimeout(timer); session.timers[key] = null; }
  }
}

/**
 * Nettoie l'état local puis ferme réellement le socket Baileys sans logout.
 * `sock.end()` coupe la connexion mais conserve les credentials pour une
 * reconnexion ultérieure. Le flag isStopping empêche ce close volontaire de
 * déclencher une nouvelle reconnexion automatique.
 */
function _closeSession(session, reason = 'session arrêtée') {
  if (!session) return;
  session.isStopping = true;
  _cleanupSession(session);
  try { session.sock?.end?.(new Error(reason)); } catch {}
  try { session.sock?.ev?.removeAllListeners?.(); } catch {}
}

/**
 * Destruction complète d'une session (timers + intervals de nettoyage).
 */
function _cleanupSession(session) {
  _clearSessionTimers(session);
  try { clearInterval(session.timers.storeCleanup); } catch {}
  try { clearInterval(session.timers.processedTimer); } catch {}
  session.messageStore?.clear?.();
  session.processedMessages?.clear?.();
}

/**
 * Charge toutes les sessions existantes au démarrage — [Phase 2,
 * Architecture hybride] pilotée par l'index Mongo (source de vérité de
 * "quelles sessions existent"), pas par le système de fichiers :
 *   1. Lit l'index Mongo (sessionIndex.listSessions()).
 *   2. Pour chaque entrée, retrouve son dossier local de credentials.
 *   3. Si le dossier existe → recharge Baileys et reconnecte.
 *   4. Si le dossier est introuvable → la session n'est PAS oubliée
 *      silencieusement : elle est journalée en erreur explicite (cas
 *      attendu uniquement avant la migration Phase 3, ou en cas de perte
 *      de disque) pour rester actionnable plutôt qu'invisible.
 * @param {import('mongodb').Db} db
 */
async function loadAllSessions(db) {
  try {
    const sessions = await sessionIndex.listSessions();
    console.log(`[SessionManager] 📦 ${sessions.length} session(s) trouvée(s) dans l'index MongoDB`);

    for (const meta of sessions) {
      const phoneNumber = meta.phoneNumber || String(meta.sessionId).replace('session_', '');
      if (!phoneNumber || phoneNumber.length < 7) continue;

      if (!sessionDirExists(meta.sessionId)) {
        console.error(`[SessionManager] ⚠️  Session ${meta.sessionId} indexée dans MongoDB mais aucun dossier local de credentials trouvé — reconnexion impossible sans migration (voir scripts/migrate-sessions-to-hybrid.js).`);
        continue;
      }

      try {
        await startSession(db, phoneNumber, { isPairing: false, owner: meta.owner, origin: meta.origin });
        await new Promise(r => setTimeout(r, 1500)); // évite la surcharge au démarrage
      } catch (err) {
        console.error(`[SessionManager] ❌ Échec chargement ${meta.sessionId}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[SessionManager] loadAllSessions error:', err.message);
  }
}

/**
 * Retourne la session active pour un numéro (ou null).
 */
function getSession(phoneNumber) {
  return activeSessions.get(toSessionId(phoneNumber)) || null;
}

/**
 * Retourne toutes les sessions actives.
 */
function getAllSessions() {
  return Array.from(activeSessions.values());
}

/**
 * Arrête proprement une session sans supprimer ses credentials.
 */
async function stopSession(phoneNumber) {
  const sessionId = toSessionId(phoneNumber);
  const session   = activeSessions.get(sessionId);
  if (!session) return false;
  _closeSession(session, 'session arrêtée');
  if (activeSessions.get(sessionId) === session) activeSessions.delete(sessionId);
  sessionIndex.setState(sessionId, { isOnline: false }).catch(() => {});
  console.log(`[SessionManager] 🛑 Session ${sessionId} arrêtée`);
  return true;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${ms / 1000}s) — ${label}`)), ms)
    )
  ]);
}

/**
 * [PHASE 3] Demande le code de pairing pour une session déjà démarrée
 * (via startSession avec opts.isPairing). Neutre — ne connaît ni WhatsApp
 * (autrement que via le socket lui-même), ni Telegram, ni le Web : elle
 * retourne juste le code, formaté, au canal appelant (utils/pairingService.js)
 * qui décide comment l'afficher.
 *
 * @param {string} phoneNumber
 * @param {{ delayMs?: number, timeoutMs?: number }} opts
 * @returns {Promise<string>} le code formaté (ex: "ABCD-1234")
 */
async function requestPairingCode(phoneNumber, opts = {}) {
  const sessionId = toSessionId(phoneNumber);
  const session   = activeSessions.get(sessionId);
  if (!session) throw new Error(`Aucune session active pour ${sessionId} — appelez startSession() d'abord`);

  const sock = session.sock;
  if (typeof sock?.requestPairingCode !== 'function') {
    throw new Error('requestPairingCode indisponible sur ce socket (bot pas encore prêt)');
  }

  // Petit délai de grâce pour laisser le socket terminer sa poignée de main
  // initiale avant de demander le code (comportement conservé de l'ancienne
  // implémentation inline).
  const delayMs = opts.delayMs ?? 3000;
  if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));

  const timeoutMs = opts.timeoutMs ?? 20000;
  let raw;
  try {
    raw = await withTimeout(
      sock.requestPairingCode(String(phoneNumber).replace(/\D/g, '')),
      timeoutMs,
      'requestPairingCode'
    );
  } catch (err) {
    logCriticalSessionError(`❗ pairing ${sessionId} échoué — ${err.message || err}`);
    throw err;
  }
  const code = raw?.match(/.{1,4}/g)?.join('-') || raw || '????-????';
  console.log(`[SessionManager] 🔑 Code pairing ${sessionId}: ${code}`);
  return code;
}

/**
 * [PHASE 4D] Nettoyage des sessions orphelines — une session "orpheline"
 * est une session jamais confirmée (pairing jamais terminé : creds pas
 * encore enregistrés) et plus en ligne, restée ouverte au-delà d'une
 * fenêtre de grâce raisonnable.
 *
 * POURQUOI ICI (et pas seulement côté bot Telegram) : le bot Telegram a
 * son propre pairingCodeWatcher.js qui nettoie les sessions qu'IL a
 * créées — mais des sessions peuvent aussi être créées via le site Web
 * ou via `.pair` en self-service sur WhatsApp lui-même, sans qu'aucun
 * watcher ne les surveille. Cette fonction est LE filet de sécurité
 * unique et centralisé, quel que soit le canal d'origine — elle ne
 * duplique aucune logique (réutilise activeSessions/stopSession déjà
 * existants) et couvre tous les cas, y compris un bot Telegram éteint
 * ou qui a crashé pendant sa propre fenêtre d'observation.
 *
 * @param {{ intervalMs?: number, graceMs?: number }} [opts]
 * @returns {NodeJS.Timeout}
 */
function startOrphanSessionSweep(opts = {}) {
  const intervalMs = opts.intervalMs ?? 60_000;      // vérifie toutes les minutes
  const graceMs    = opts.graceMs ?? 3 * 60_000;      // 3 min de grâce après création

  const timer = setInterval(async () => {
    const now = Date.now();
    for (const session of activeSessions.values()) {
      const isOrphan = !session.isRegistered && !session.isOnline && (now - session.createdAt) > graceMs;
      if (!isOrphan) continue;
      console.log(`[SessionManager] 🧹 Session orpheline détectée (jamais confirmée) : ${session.sessionId} — nettoyage`);
      try { await stopSession(session.phoneNumber); } catch (err) {
        console.error(`[SessionManager] échec nettoyage session orpheline ${session.sessionId}:`, err.message);
      }
    }
  }, intervalMs);

  if (timer.unref) timer.unref();
  return timer;
}

module.exports = {
  startSession,
  loadAllSessions,
  getSession,
  getAllSessions,
  stopSession,
  toSessionId,
  requestPairingCode,
  startOrphanSessionSweep,
};
