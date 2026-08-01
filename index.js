/**
 * WhatsApp MD Bot - Main Entry Point
 * Edition : 𝐃𝐈𝐏𝐏𝐄𝐑  Fusionnée avec Anti-Crash & Pairing
 * Version : 3.0 — STABILITÉ MAXIMALE
 *
 * CORRECTIONS v3.0 :
 * [FIX 1] Watchdog zombie supprimé → remplacé par monitoring passif
 * [FIX 2] Listeners messages.upsert dupliqués → 2 listeners propres
 * [FIX 3] Timers nettoyés proprement à chaque déconnexion
 * [FIX 4] Log diagnostic complet de chaque déconnexion
 * [FIX 5] Monitoring console périodique (RAM, WS, uptime)
 * [FIX 6] Erreurs réseau transitoires ignorées proprement
 */

process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/tmp/puppeteer_cache_disabled';

const { initializeTempSystem } = require('./utils/tempManager');
const { startCleanup } = require('./utils/cleanup');
const { startMemoryGuard, stopMemoryGuard, setSock: setMemGuardSock } = require('./utils/memoryGuard');
initializeTempSystem();
startCleanup();
startMemoryGuard(); // 🧠 Surveillance RAM — seuils configurés dans config.js

// ==========================================
// FILTRAGE CONSOLE PREMIUM
// ==========================================
const originalConsoleLog   = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn  = console.warn;

const forbiddenPatternsConsole = [
  'closing session', 'closing open session', 'sessionentry',
  'prekey bundle', 'pendingprekey', '_chains', 'registrationid',
  'currentratchet', 'chainkey', 'ratchet', 'signal protocol',
  'ephemeralkeypair', 'indexinfo', 'basekey',
  'bad mac', 'session error', 'session_cipher',
  'decryptwithsessions', 'dodecryptwhispermessage',
  'verifymac', 'queuejob', 'asyncqueueexecutor',
  'libsignal', 'at sessioncipher',
  'node_modules/libsignal',
  'node_modules/@whiskeysockets',
];

const filterConsole = (originalFunc, ...args) => {
  const message = args
    .map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a))
    .join(' ').toLowerCase();
  if (!forbiddenPatternsConsole.some(p => message.includes(p))) {
    originalFunc.apply(console, args);
  }
};

console.log   = (...args) => filterConsole(originalConsoleLog,   ...args);
console.error = (...args) => filterConsole(originalConsoleError, ...args);
console.warn  = (...args) => filterConsole(originalConsoleWarn,  ...args);

// ==========================================
// IMPORTS
// ==========================================
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  proto
} = require('@whiskeysockets/baileys');
const config  = require('./config');
const handler = require('./handler');
const sessionContext = require('./utils/sessionContext'); // [PHASE 1] isolation données — voir utils/sessionContext.js
const fs      = require('fs');
const path    = require('path');
const os      = require('os');

// ==========================================
// MULTI-SESSION MONGODB (optionnel)
// Si MONGODB_URI est absent → mono-session classique (aucun changement)
// Si MONGODB_URI est présent → multi-session MongoDB complet
// ==========================================
let _mongoDb          = null;
let _sessionManager   = null;

async function initMultiSession() {
  if (!process.env.MONGODB_URI) {
    originalConsoleLog('ℹ️  [Multi-Session] MONGODB_URI absent → mode mono-session');
    return false;
  }
  try {
    const { getDb }          = require('./utils/mongoClient');
    const sm                  = require('./utils/sessionManager');
    _mongoDb                  = await getDb();
    _sessionManager           = sm;
    await sm.loadAllSessions(_mongoDb);
    originalConsoleLog('✅ [Multi-Session] MongoDB connecté — sessions rechargées');
    return true;
  } catch (err) {
    originalConsoleError('❌ [Multi-Session] Erreur init:', err.message);
    originalConsoleLog('⚠️  Fallback → mode mono-session');
    return false;
  }
}

let startDarkmoodScheduler = null;
try {
  const dm = require('./commands/bot_sovereignty/darkmood');
  startDarkmoodScheduler = dm.startDarkmoodScheduler || null;
} catch (_) {}

// [PHASE 2 — nettoyage] global.ghostgMode supprimé : plus rien ne le lit
// depuis la correction du bug d'isolation (voir database.js getGhostgMode/
// setGhostgMode et commands/bot_sovereignty/ghostg.js).

// ==========================================
// STORE EN MÉMOIRE
// ==========================================
const messageStore      = new Map();
const MESSAGE_STORE_TTL = 10 * 60 * 1000;

function storeMessage(msg) {
  if (!msg?.key?.id || !msg.message) return;
  messageStore.set(msg.key.id, { msg, ts: Date.now() });
  // Limite de taille de sécurité (pas de setTimeout par message)
  if (messageStore.size > 2000) {
    const oldest = messageStore.keys().next().value;
    messageStore.delete(oldest);
  }
}

// Un seul timer pour purger les messages expirés
const _storeCleanup = setInterval(() => {
  const cutoff = Date.now() - MESSAGE_STORE_TTL;
  for (const [id, entry] of messageStore.entries()) {
    if (entry.ts < cutoff) messageStore.delete(id);
  }
}, 5 * 60 * 1000);
if (_storeCleanup.unref) _storeCleanup.unref();

// ==========================================
// UTILITAIRES
// ==========================================
function cleanupPuppeteerCache() {
  try {
    const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer');
    if (fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true, force: true });
  } catch (_) {}
}

const isSystemJid = (jid) =>
  !jid ||
  jid.includes('@broadcast') ||
  jid.includes('status.broadcast') ||
  jid.includes('@newsletter');

// ==========================================
// ANTI-DOUBLON
// FIX : Remplace Set + setTimeout par Map avec timestamp
// AVANT : 1 setTimeout par message → des milliers de timers actifs
//         → GC surchargé → ralentissement puis silence
// APRÈS : Map avec timestamp, nettoyage en 1 seul timer périodique
// ==========================================
const processedMessages = new Map(); // id → timestamp
const PROCESSED_TTL = 30 * 60 * 1000; // 30 min

function addProcessedMessage(id) {
  processedMessages.set(id, Date.now());
  // Limite de taille de sécurité
  if (processedMessages.size > 10000) {
    const oldest = processedMessages.keys().next().value;
    processedMessages.delete(oldest);
  }
}

// Un seul timer pour nettoyer tous les IDs expirés
const _processedCleanup = setInterval(() => {
  const cutoff = Date.now() - PROCESSED_TTL;
  for (const [id, ts] of processedMessages.entries()) {
    if (ts < cutoff) processedMessages.delete(id);
  }
}, 5 * 60 * 1000); // nettoyage toutes les 5 min
if (_processedCleanup.unref) _processedCleanup.unref();

// ==========================================
// HORODATAGE
// ==========================================
let botReadyTime = Date.now();

// ==========================================
// RECONNEXION
// ==========================================
let reconnectAttempts   = 0;
const MAX_RECONNECT_DELAY = 15000;

function getReconnectDelay() {
  const delay = Math.min(2000 * Math.pow(1.3, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;
  return Math.floor(delay);
}

// ==========================================
// TIMERS AU NIVEAU MODULE
// [FIX 3] Tous ici pour être nettoyés proprement
// dans 'close' avant chaque reconnexion.
// ==========================================
let pingTimer      = null;
let heartbeatTimer = null;
let monitorTimer   = null;
// [FIX] Mémorisation du dernier état WebSocket valide entre les cycles du monitorTimer.
// Évite le ?(undefined) quand sock.ws est temporairement absent en début de session.
let lastKnownWsState = null;

function startPingActif(sock) {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = setInterval(async () => {
    try { await sock.sendPresenceUpdate('available'); } catch (_) {}
  }, 30 * 1000);
}

// ==========================================
// DÉMARRAGE DU BOT
// ==========================================
async function startBot() {
  // [FIX] sessionName manquant dans config.js → valeur par défaut sécurisée
  const sessionFolder = `./${config.sessionName || 'auth_info_baileys'}`;
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    auth: state,
    syncFullHistory: false,
    downloadHistory: false,
    markOnlineOnConnect: true,
    keepAliveIntervalMs: 30000,   // [FIX] 5s→30s évite le flood WebSocket
    retryRequestDelayMs: 2000,    // Retry réseau automatique
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
      const entry = messageStore.get(key.id);
      // messageStore contient maintenant { msg, ts }
      if (entry?.msg?.message) return entry.msg.message;
      return proto.Message.fromObject({});
    }
  });

  // ════════════════════════════════════════════
  // [SUPPRIMÉ — Phase 2, chantier Pairing/stabilisation]
  // L'ancien comportement générait automatiquement un code de pairing au
  // démarrage pour le numéro indiqué dans .env (PHONE_NUMBER), même sans
  // aucune demande explicite d'un utilisateur. Ce comportement n'existe
  // plus : un code de connexion n'est désormais généré QUE lorsqu'une
  // demande de pairing explicite est faite — via `.pair` (WhatsApp), le
  // site Web, ou le bot Telegram — tous appelant le même
  // utils/pairingService.js. Le tout premier appairage du bot (aucune
  // session existante) doit donc lui aussi passer par l'une de ces voies.
  // PHONE_NUMBER reste utilisé ailleurs (config.ownerNumber) uniquement
  // pour les permissions Owner — plus jamais pour générer un code ici.
  // ════════════════════════════════════════════

  // ─── LISTENER 1 : STOCKAGE DES MESSAGES ─────────────────
  // [FIX 2] Séparé du handler principal pour plus de clarté.
  // Total listeners messages.upsert : 2 (ce listener + le handler).
  // L'ancien 3ème listener (watchdog) a été supprimé.
  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) storeMessage(msg);
  });

  // ─── CONNEXION ──────────────────────────────────────────
  // 🧠 Injecter la référence sock dans le Memory Guard (pour alerte WhatsApp avant restart)
  setMemGuardSock(sock);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, isNewLogin } = update;

    if (connection === 'close') {

      // [FIX 3] Nettoyage de TOUS les timers avant reconnexion.
      // CRITIQUE : sans ce nettoyage, chaque reconnexion crée de
      // nouveaux timers sans supprimer les anciens.
      // Résultat après 10 reconnexions : 10 heartbeats simultanés
      // → flood WhatsApp → rate-limit → déconnexion forcée → boucle.
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      if (pingTimer)      { clearInterval(pingTimer);      pingTimer      = null; }
      if (monitorTimer)   { clearInterval(monitorTimer);   monitorTimer   = null; }
      // 🧠 MemoryGuard : NE PAS arrêter ici — il est au niveau MODULE (survit aux reconnexions)
      // setSock() sera rappelé automatiquement sur la prochaine connexion (startBot)
      // [FIX] Reset de l'état WS mémorisé — évite d'afficher un état périmé
      // lors du prochain cycle de monitoring après reconnexion.
      lastKnownWsState = null;

      const statusCode      = lastDisconnect?.error?.output?.statusCode;
      const errorMessage    = lastDisconnect?.error?.message || 'inconnue';
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      // [FIX 4] Log diagnostic COMPLET — toujours visible dans la console.
      // Permet d'identifier la vraie cause de chaque déconnexion.
      originalConsoleLog(
        `\n🔌 [DÉCONNEXION] code=${statusCode ?? '?'} | raison="${errorMessage}" | reconnexion=${shouldReconnect}`
      );

      if (shouldReconnect) {
        const delay = getReconnectDelay();
        console.log(`🔄 Reconnexion dans ${(delay / 1000).toFixed(1)}s... (tentative #${reconnectAttempts})`);
        setTimeout(() => startBot(), delay);
      } else {
        // loggedOut = ban WhatsApp ou déconnexion manuelle
        // Ne PAS reconnecter — l'utilisateur doit réappairer
        originalConsoleLog('❌ Session loggedOut. Réappairer le bot requis.');
        reconnectAttempts = 0;
      }

    } else if (connection === 'open') {
      botReadyTime      = Date.now();
      reconnectAttempts = 0;

      // [FIX 3] Vider processedMessages à chaque reconnexion.
      // Raison : après une déconnexion + reconnexion, Baileys peut
      // re-livrer des messages récents (replay). Sans ce clear, ces
      // messages sont ignorés car leur ID est déjà dans le Set →
      // le bot semble "ne pas répondre" après une reconnexion.
      // Impact mémoire : négligeable (Set vidé → GC immédiat).
      processedMessages.clear();

      const sId    = sock.user.id.split(':')[0];
      const p1     = process.env.PHONE_NUMBER || config.ownerNumber?.[0] || 'Inconnu';
      const cleanP1 = String(p1).replace(/\D/g, '');
      const prefix = config.prefix || '.';

      console.log('╭╼━≪• 𝐃𝐈𝐏𝐏𝐄𝐑  ɪs ᴀʟɪᴠᴇ •≫━╾╮');
      console.log('╰━━━━━━━━━━━━━━━━━━━━━━━╯');

      // ── Rapport de premier appairage ──
      if (isNewLogin) {
        const syncMsg =
          `*╭╼━━━≪• ɪɴɪᴛɪᴀʟɪsᴀᴛɪᴏɴ •≫━━━╾╮*\n` +
          `*┃* 🤖 *ɪᴅ* : @${sId}\n` +
          `*┃* 👤 *ʜᴏ̂ᴛᴇ* : ${cleanP1}\n` +
          `*┃* 🔣 *ᴘʀᴇ́ғɪxᴇ* : [ ${prefix} ]\n` +
          `*╰━━━━━━━━━━━━━━━━━━━━━━━╯*\n` +
          `> *♰ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`;
        for (const num of (config.ownerNumber || []).slice(0, 2)) {
          try {
            const jid = String(num).replace(/\D/g, '') + '@s.whatsapp.net';
            await sock.sendMessage(jid, { text: syncMsg, mentions: [`${sId}@s.whatsapp.net`] });
          } catch (_) {}
        }
      }

      // ── Message de démarrage en DM ──
      const myJid = sId + '@s.whatsapp.net';
      try {
        await sock.sendMessage(myJid, {
          text: `✅ *${config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑'} est en ligne*\n\n> _Le sanctuaire est actif_`
        });
      } catch (_) {}

      // ── KEEP ALIVE — 5 minutes ──────────────────────────────────
      // [PERF] sendPresenceUpdate toutes les 5 min (au lieu de 2 min)
      // + message discret dans l'IB du bot lui-même (pas l'owner)
      // pour maintenir la session active et signaler que le bot est vivant.
      //
      // POURQUOI l'IB du bot et pas l'owner ?
      //   → 288 msgs/jour vers l'owner = visible + risque rate-limit
      //   → L'IB du bot = discret, seul le bot le voit, zéro risque
      //
      // FRÉQUENCE : 5 min = conforme à la demande du client
      //   → sendPresenceUpdate = signal léger, non comptabilisé comme message
      //   → Message IB = 288/jour max mais dans son propre inbox → OK
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      // [PERF v5] heartbeatTimer = PRESENCE UNIQUEMENT (très léger, 30s)
      // Le message alive est géré par monitorTimer (5 min) → pas de doublon
      heartbeatTimer = setInterval(async () => {
        try { await sock.sendPresenceUpdate('available'); } catch (_) {}
      }, 30 * 1000); // toutes les 30 secondes — maintient la session active

      if (config.autoBio) {
        try { await sock.updateProfileStatus(`♛_ᴊᴇsᴜs ᴇsᴛ ʀᴏɪ_♛`); } catch (_) {}
      }

      handler.initializeAntiCall(sock);

      if (typeof startDarkmoodScheduler === 'function') {
        try { startDarkmoodScheduler(sock); } catch (_) {}
      }

      // [FIX DOUBLON] startPingActif supprimé — heartbeatTimer (30s ci-dessus)
      // fait exactement la même chose (sendPresenceUpdate). Deux timers identiques
      // doublaient inutilement les appels réseau sans bénéfice.

      // ── MONITORING + RAPPORT D'ÉTAT (toutes les 30 min) ────────────
      //
      // [FIX RATE-LIMIT] Passage de 5 min → 30 min.
      // A 5 min → 288 messages/jour dans l'IB → WhatsApp détecte un comportement
      // de spam → rate-limit silencieux → toutes les réponses (IA, commandes)
      // s'arrêtent après quelques heures de connexion.
      // A 30 min → 48 messages/jour → aucun risque de rate-limit.
      //   1. Log console (toujours) — RAM, uptime, état WebSocket
      //   2. Message WhatsApp dans l'IB du propriétaire (toutes les 30 min)
      //      → confirme que le bot est vivant et opérationnel
      //
      // CONCEPTION ANTI-FUITE :
      //   • Timer au niveau MODULE → nettoyé dans 'close' avant reconnexion
      //   • sendPresenceUpdate déjà géré par heartbeatTimer (séparé)
      //   • Aucun appel réseau bloquant dans le timer
      //   • Anomalies détectées et signalées sans action corrective
      //     (Baileys gère seul la reconnexion via connection.update)
      //
      // FRÉQUENCE : 5 minutes (surveillance active)
      //   → 288 messages/jour — uniquement dans l'IB du propriétaire (pas un groupe)
      //   → Idéal pour confirmer que le bot est en vie en quasi temps-réel

      // ── MONITORING (toutes les 30 min) — logs console uniquement ──────
      // [FIX RATE-LIMIT] Le message WhatsApp vers l'owner a été supprimé.
      // 48 messages/jour dans l'IB owner = détecté comme spam silencieux
      // par WhatsApp → toutes les commandes s'arrêtent après quelques heures.
      // Les logs Railway/console suffisent pour surveiller le bot.
      let _monitorCount = 0;

      if (monitorTimer) clearInterval(monitorTimer);
      monitorTimer = setInterval(() => {
        try {
          _monitorCount++;
          const memMB    = Math.round(process.memoryUsage().rss / 1024 / 1024);
          const heapMB   = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
          const uptimH   = (process.uptime() / 3600).toFixed(1);
          const rawWs    = sock.ws?.readyState ?? sock.ws?.socket?.readyState;
          const wsState  = (rawWs != null) ? rawWs : (sock.user ? 1 : lastKnownWsState ?? 4);
          if (rawWs != null) lastKnownWsState = rawWs;
          const WS_LABELS = ['CONNECTING','OPEN','CLOSING','CLOSED'];
          const wsLabel   = WS_LABELS[wsState] ?? `UNKNOWN(${wsState})`;
          const listeners = sock.ev?.listenerCount?.('messages.upsert') ?? '?';
          const storeSize = messageStore?.size ?? 0;

          originalConsoleLog(
            `📊 [MONITOR #${_monitorCount}] RAM:${memMB}Mo Heap:${heapMB}Mo | Up:${uptimH}h | WS:${wsLabel} | Listeners:${listeners} | Store:${storeSize}`
          );

          const anomalies = [];
          if (memMB > 512)   anomalies.push(`RAM élevée : ${memMB}Mo`);
          if (heapMB > 350)  anomalies.push(`Heap élevé : ${heapMB}Mo`);
          if (wsState === 2 || wsState === 3) anomalies.push(`WebSocket : ${wsLabel}`);
          if (typeof listeners === 'number' && listeners > 6)
                             anomalies.push(`Listeners : ${listeners} (fuite probable)`);
          if (anomalies.length > 0)
            originalConsoleWarn(`[MONITOR] ⚠️ Anomalies :\n${anomalies.map(a=>'  '+a).join('\n')}`);
        } catch (_) {}
      }, 30 * 60 * 1000); // 30 minutes
    }
  });

  // ─── CREDENTIALS ────────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ─── LISTENER 2 : HANDLER PRINCIPAL DES MESSAGES ────────
  // [FIX 2] Total messages.upsert : 2 listeners seulement.
  // (storeMessage + ce handler). Le watchdog (3ème) est supprimé.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // [FIX PRIVÉ] Baileys v6 multi-device : les messages envoyés par le
    // propriétaire depuis son téléphone (fromMe=true) arrivent parfois
    // avec type='append' au lieu de 'notify'. Sans ce correctif, toutes
    // les commandes de l'owner en privé sont ignorées silencieusement —
    // la commande est détectée (car elle passe par le gestionnaire avant
    // ce filtre) mais le message de réponse n'est jamais envoyé car
    // l'exécution s'arrête ici avant d'atteindre handleMessage.
    //
    // SOLUTION : accepter 'notify' ET 'append' (uniquement les fromMe,
    // ce qui évite de doubler le traitement des messages normaux).
    if (type !== 'notify' && type !== 'append') return;

    for (const msg of messages) {
      if (!msg.message || !msg.key?.id) continue;

      // Pour les messages 'append', ne traiter QUE les fromMe de l'owner
      // Les messages 'append' non-fromMe sont des doublons à ignorer
      if (type === 'append' && !msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      if (!from || isSystemJid(from)) continue;
      if (processedMessages.has(msg.key.id)) continue;
      addProcessedMessage(msg.key.id);

      try {
        // [PHASE 1 — ISOLATION DONNÉES] Bot mono-session (legacy, sans
        // MONGODB_URI) : toutes ses données restent dans
        // database/sessions/default/, comme avant la refonte (migration
        // automatique au premier démarrage — voir database.js).
        await sessionContext.run(sessionContext.DEFAULT_SESSION_ID, () => handler.handleMessage(sock, msg));
      } catch (err) {
        if (!err.message?.includes('rate-overlimit')) {
          console.error('⚠️ Erreur message :', err.message);
        }
      }

      if (config.autoRead && from.endsWith('@g.us')) {
        try { await sock.readMessages([msg.key]); } catch (_) {}
      }
    }
  });

  // ─── GROUP UPDATES ──────────────────────────────────────
  sock.ev.on('group-participants.update', async (update) => {
    try { await sessionContext.run(sessionContext.DEFAULT_SESSION_ID, () => handler.handleGroupUpdate(sock, update)); } catch (_) {}
    try {
      const { id, participants, action } = update;
      if (action === 'remove' && id?.endsWith('@g.us')) {
        const antipurgeModule = global.commands?.get('antipurge') ||
          (() => {
            try { return require(path.join(__dirname, 'commands', 'group_guardians', 'antipurge')); }
            catch { return null; }
          })();
        if (antipurgeModule?.enregistrerExpulses) {
          antipurgeModule.enregistrerExpulses(id, participants);
        }
      }
    } catch (_) {}
  });

  return sock;
}

// ==========================================
// LANCEMENT AVEC AUTO-RESTART ROBUSTE
// [STABILITÉ] Le bot ne meurt jamais — relance automatique
// si startBot() plante (erreur fatale réseau, Baileys crash, etc.)
// ==========================================
cleanupPuppeteerCache();

let _botCrashCount = 0;
const _MAX_CRASH_DELAY = 30000; // 30s max entre chaque restart

async function launchBot() {
  try {
    // ── Multi-session MongoDB (si MONGODB_URI configuré) ─────────────────
    const multiSessionActive = await initMultiSession().catch(() => false);

    // ── Mono-session classique (toujours actif pour l'owner principal) ────
    // Si multi-session actif, startBot() gère la session owner uniquement.
    // Si mono-session → startBot() gère tout comme avant.
    await startBot();
  } catch (err) {
    _botCrashCount++;
    const delay = Math.min(3000 * _botCrashCount, _MAX_CRASH_DELAY);
    originalConsoleError(`💥 [CRASH #${_botCrashCount}] ${err?.message || err} — relance dans ${delay/1000}s`);
    setTimeout(launchBot, delay);
  }
}

launchBot();

// ==========================================
// [PHASE 4A → Phase 1 stabilisation] API Pairing (HTTP) — démarre toujours
// automatiquement, sans configuration manuelle (voir api/server.js).
// Indépendante du cycle crash/restart de launchBot() : le Pairing Service
// ne dépend pas d'une session WhatsApp déjà connectée, donc l'API démarre
// une seule fois ici, pas à chaque redémarrage du bot owner.
// ==========================================
try {
  const { startApiServer } = require('./api/server');
  startApiServer();
} catch (err) {
  originalConsoleError('⚠️  [API] Démarrage impossible:', err.message);
}

// ==========================================
// [PHASE 4D] Nettoyage des sessions orphelines — toujours actif (pas
// opt-in : c'est une garantie de robustesse, pas une fonctionnalité
// utilisateur). Couvre les sessions jamais confirmées créées par
// n'importe quel canal (WhatsApp self-service, site Web, Telegram),
// y compris si le bot Telegram (qui a son propre watcher) est éteint
// ou a crashé pendant sa fenêtre d'observation.
// ==========================================
try {
  const { startOrphanSessionSweep } = require('./utils/sessionManager');
  startOrphanSessionSweep();
} catch (err) {
  originalConsoleError('⚠️  [SessionManager] Sweep sessions orphelines impossible:', err.message);
}

// [SÉPARATION DE PROJETS] Le bot Telegram "The Big Dipper" n'est plus lancé
// depuis ce process. C'est désormais un projet totalement indépendant
// (voir /TelegramBot — son propre index.js, son propre package.json, son
// propre stockage JSON local, son propre cycle de démarrage). Le seul lien
// entre les deux est l'API HTTP ci-dessus (POST /pair, GET /session/status,
// POST /session/stop) — voir /TelegramBot/utils/pairingApiClient.js.
// Pour le lancer : cd TelegramBot && npm start (séparément de ce process).

// ==========================================
// GESTION GLOBALE DES ERREURS
// ==========================================
const handleGlobalError = (err) => {
  if (!err) return;
  const msg = (err.message || err.toString() || '').toLowerCase();

  // Erreurs ignorées silencieusement (non-fatales connues)
  if (msg.includes('bad mac') || msg.includes('session error') ||
      msg.includes('libsignal') || msg.includes('session_cipher') ||
      msg.includes('verifymac') || msg.includes('ratchet') ||
      msg.includes('econnreset') || msg.includes('enotfound') ||
      msg.includes('etimedout') || msg.includes('econnrefused') ||
      msg.includes('socket hang up') || msg.includes('epipe') ||
      msg.includes('connection closed') || msg.includes('network error') ||
      msg.includes('rate-overlimit') || msg.includes('conflict') ||
      msg.includes('stream errored') || msg.includes('item-not-found')) {
    return; // Silencieux — Baileys ou réseau gère seul
  }

  // Espace disque épuisé
  if (err?.code === 'ENOSPC' || msg.includes('no space left on device')) {
    try { require('./utils/cleanup').cleanupOldFiles?.(); } catch (_) {}
    originalConsoleLog('🧹 𝐃𝐈𝐏𝐏𝐄𝐑 › Nettoyage disque déclenché');
    return;
  }

  // Erreurs de commandes (TypeError, null, undefined) — ne pas crasher
  if (msg.includes('cannot read') || msg.includes('is not a function') ||
      msg.includes('is not defined') || msg.includes('null') ||
      msg.includes('undefined')) {
    originalConsoleWarn('⚠️ 𝐃𝐈𝐏𝐏𝐄𝐑 › Erreur commande (non-fatale) :', err.message?.slice(0, 120));
    return;
  }

  // Autres erreurs — log mais NE JAMAIS quitter le process
  originalConsoleError('❌ 𝐃𝐈𝐏𝐏𝐄𝐑 › Erreur :', err.message?.slice(0, 200) || err);
};

process.on('uncaughtException',  handleGlobalError);
process.on('unhandledRejection', handleGlobalError);

// ==========================================
// PROTECTION MÉMOIRE — gérée par utils/memoryGuard.js
// Ce bloc remplace l'ancien GC basique (600Mo seulement).
// Le Memory Guard surveille toutes les 5 min avec :
//   • Nettoyage doux à 250Mo (configurable dans config.js)
//   • Restart propre PM2 à 350Mo si nettoyage insuffisant
//   • Logs RAM / Heap / CPU / SysLibre à chaque cycle
//   • Anti-spam restart (min 3 min entre deux restarts)
// ==========================================
// startMemoryGuard() est déjà appelé en haut du fichier.
