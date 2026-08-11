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

const silentLogger = pino({ level: 'silent' });
const activeSessions = new Map();

let _baileysVersion = null;
async function getBaileysVersion() {
  if (!_baileysVersion) {
    const { version } = await fetchLatestBaileysVersion();
    _baileysVersion = version;
  }
  return _baileysVersion;
}

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

function toSessionId(phoneNumber) {
  const clean = String(phoneNumber).replace(/\D/g, '');
  return `session_${clean}`;
}

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

async function startSession(db, phoneNumber, opts = {}) {
  const sessionId = toSessionId(phoneNumber);

  if (activeSessions.has(sessionId)) {
    const old = activeSessions.get(sessionId);
    _closeSession(old, 'session remplacée');
    activeSessions.delete(sessionId);
  }

  console.log(`[SessionManager] 🚀 Démarrage session : ${sessionId}`);

  const { state, saveCreds } = await useFileAuthState(sessionId);
  const version = await getBaileysVersion();

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

  const { store: messageStore, cleanup: storeCleanup } = createMessageStore();
  const { map: processedMessages, timer: processedTimer } = createProcessedMap();

  let reconnectAttempts = 0;
  let _isShuttingDown   = false;

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
    reconnectAttempts: 0,
    isOnline: false,
    isRegistered: !!state.creds.registered,
    isStopping: false,
    createdAt: Date.now(),
  };
  activeSessions.set(sessionId, session);

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

  if (!state.creds.registered && !opts.isPairing) {
    const cleanNum = String(phoneNumber).replace(/\D/g, '');
    console.log(`[SessionManager] ⏳ Session ${sessionId} non enregistrée — lance .pair ${cleanNum}`);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, isNewLogin } = update;

    if (connection === 'close') {
      session.isOnline = false;
      _clearSessionTimers(session);

      const statusCode      = lastDisconnect?.error?.output?.statusCode;
      const errorMessage    = lastDisconnect?.error?.message || 'inconnue';
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !_isShuttingDown && !session.isStopping;

      console.log(`[SessionManager] 🔌 ${sessionId} déconnecté — code=${statusCode} | reconnexion=${shouldReconnect}`);
      sessionIndex.setState(sessionId, { isOnline: false }).catch(() => {});

      if (shouldReconnect) {
        reconnectAttempts++;
        const delay = Math.min(2000 * Math.pow(1.3, reconnectAttempts), 15000);
        console.log(`[SessionManager] 🔄 ${sessionId} reconnexion dans ${(delay / 1000).toFixed(1)}s...`);
        sessionIndex.incrementStat(sessionId, 'reconnectCount').catch(() => {});
        session.timers.reconnect = setTimeout(() => {
          session.timers.reconnect = null;
          if (_isShuttingDown || session.isStopping) return;
          if (activeSessions.get(sessionId) !== session) return;
          startSession(db, phoneNumber, { owner: opts.owner, origin: opts.origin }).catch(err => {
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
      reconnectAttempts = 0;
      processedMessages.clear();
      sessionIndex.setState(sessionId, { isOnline: true, isRegistered: true }).catch(() => {});

      const sId = sock.user?.id?.split(':')[0] || 'unknown';
      console.log(`[SessionManager] ✅ ${sessionId} connecté — @${sId}`);

      if (session.timers.heartbeat) clearInterval(session.timers.heartbeat);
      session.timers.heartbeat = setInterval(async () => {
        try { await sock.sendPresenceUpdate('available'); } catch {}
      }, 30000);
      if (session.timers.heartbeat.unref) session.timers.heartbeat.unref();

      if (isNewLogin) {
        try {
          await sock.sendMessage(`${sId}@s.whatsapp.net`, {
            text: `✅ *${config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑'} — Session ${sessionId} active*\n\n> _Session sauvegardée localement, indexée dans MongoDB_`
          });
        } catch {}
      }

      try { handler.initializeAntiCall(sock); } catch {}
    }
  });

  sock.ev.on('creds.update', saveCreds);

  let _lastActivityTouch = 0;
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
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
        if (!sock._sessionPhoneNumber) {
          sock._sessionPhoneNumber = String(phoneNumber).replace(/\D/g, '');
        }
        await sessionContext.run(sessionId, () => handler.handleMessage(sock, msg));
      } catch (err) {
        if (!err.message?.includes('rate-overlimit')) {
          console.error(`[SessionManager] ${sessionId} handleMessage error:`, err.message);
        }
      }
    }
  });

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

function _clearSessionTimers(session) {
  for (const [key, timer] of Object.entries(session.timers)) {
    if (key === 'storeCleanup' || key === 'processedTimer') continue;
    if (timer) { clearTimeout(timer); session.timers[key] = null; }
  }
}

function _closeSession(session, reason = 'session arrêtée') {
  if (!session) return;
  session.isStopping = true;
  _cleanupSession(session);
  try { session.sock?.end?.(new Error(reason)); } catch {}
  try { session.sock?.ev?.removeAllListeners?.(); } catch {}
}

function _cleanupSession(session) {
  _clearSessionTimers(session);
  try { clearInterval(session.timers.storeCleanup); } catch {}
  try { clearInterval(session.timers.processedTimer); } catch {}
  session.messageStore?.clear?.();
  session.processedMessages?.map?.clear?.();
}

async function loadAllSessions(db) {
  try {
    const sessions = await sessionIndex.listSessions();
    console.log(`[SessionManager] 📦 ${sessions.length} session(s) trouvée(s) dans l'index MongoDB`);

    for (const meta of sessions) {
      const phoneNumber = meta.phoneNumber || String(meta.sessionId).replace('session_', '');
      if (!phoneNumber || phoneNumber.length < 7) continue;

      if (!sessionDirExists(meta.sessionId)) {
        console.error(`[SessionManager] ⚠️  Session ${meta.sessionId} indexée dans MongoDB mais aucun dossier local de credentials trouvé — reconnexion impossible sans migration.`);
        continue;
      }

      try {
        await startSession(db, phoneNumber, { isPairing: false, owner: meta.owner, origin: meta.origin });
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        console.error(`[SessionManager] ❌ Échec chargement ${meta.sessionId}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[SessionManager] loadAllSessions error:', err.message);
  }
}

function getSession(phoneNumber) {
  return activeSessions.get(toSessionId(phoneNumber)) || null;
}

function getAllSessions() {
  return Array.from(activeSessions.values());
}

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

async function requestPairingCode(phoneNumber, opts = {}) {
  const sessionId = toSessionId(phoneNumber);
  const session   = activeSessions.get(sessionId);
  if (!session) throw new Error(`Aucune session active pour ${sessionId} — appelez startSession() d'abord`);

  const sock = session.sock;
  if (typeof sock?.requestPairingCode !== 'function') {
    throw new Error('requestPairingCode indisponible sur ce socket (bot pas encore prêt)');
  }

  const delayMs = opts.delayMs ?? 3000;
  if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));

  const timeoutMs = opts.timeoutMs ?? 20000;
  const raw = await withTimeout(
    sock.requestPairingCode(String(phoneNumber).replace(/\D/g, '')),
    timeoutMs,
    'requestPairingCode'
  );
  const code = raw?.match(/.{1,4}/g)?.join('-') || raw || '????-????';
  console.log(`[SessionManager] 🔑 Code pairing ${sessionId}: ${code}`);
  return code;
}

function startOrphanSessionSweep(opts = {}) {
  const intervalMs = opts.intervalMs ?? 60_000;
  const graceMs    = opts.graceMs ?? 3 * 60_000;

  const timer = setInterval(async () => {
    const now = Date.now();
    for (const session of activeSessions.values()) {
      const isOrphan = !session.isRegistered && !session.isOnline && (now - session.createdAt) > graceMs;
      if (!isOrphan) continue;
      console.log(`[SessionManager] 🧹 Session orpheline détectée : ${session.sessionId}`);
      try { await stopSession(session.phoneNumber); } catch (err) {
        console.error(`[SessionManager] échec nettoyage ${session.sessionId}:`, err.message);
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
