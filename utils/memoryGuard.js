/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║        𝐃𝐈𝐏𝐏𝐄𝐑 — MEMORY GUARD v1.0                            ║
 * ║        Surveillance & nettoyage intelligent de la RAM        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * FONCTIONNEMENT :
 *   Niveau 1 — Surveillance (toutes les 5 min)
 *     → Mesure RSS, heapUsed, heapTotal, uptime, CPU
 *     → Logs détaillés dans la console
 *
 *   Niveau 2 — Nettoyage doux (seuil WARNING dépassé)
 *     → Vide les caches internes (require.cache partiel)
 *     → Supprime les fichiers temp audio/vidéo orphelins
 *     → Force global.gc() si --expose-gc actif
 *     → NE TOUCHE PAS : session, handlers, Baileys, commandes
 *
 *   Niveau 3 — Redémarrage propre PM2 (seuil CRITICAL dépassé)
 *     → Attend 10s pour laisser les messages en cours partir
 *     → Envoie une alerte WhatsApp au propriétaire
 *     → process.exit(0) → PM2 relance automatiquement
 *     → Anti-spam : jamais 2 restarts en moins de 3 min
 *
 * CE QUI N'EST JAMAIS TOUCHÉ :
 *   ✗ auth_info / session WhatsApp
 *   ✗ sock (connexion Baileys active)
 *   ✗ handler.js / commandes
 *   ✗ event listeners actifs
 *   ✗ messageStore / processedMessages
 *   ✗ fichiers reply/play
 *   ✗ menus / newsletters
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const tempManager = require('./tempManager');

// ── Référence au logger d'origine (contourne le filtre console du bot) ──────
const _log  = process.__originalLog  || console.log;
const _warn = process.__originalWarn || console.warn;
const _err  = process.__originalErr  || console.error;

// ── Extensions temporaires à nettoyer (audio/vidéo uniquement) ──────────────
const TEMP_EXTS = new Set(['.mp3', '.m4a', '.ogg', '.wav', '.opus', '.mp4', '.webm', '.ts', '.tmp']);

// ── Modules du require.cache qu'on ne touchera JAMAIS ───────────────────────
const CACHE_PROTECTED = [
  'node_modules/@whiskeysockets/baileys',
  'node_modules/libsignal',
  'auth_info',
  'session',
  'database.js',
  'handler.js',
  'index.js',
  'config.js',
];

// ── État interne ─────────────────────────────────────────────────────────────
let _guardTimer        = null;   // setInterval principal
let _lastRestartTime   = 0;      // timestamp du dernier restart (anti-spam)
let _cycleCount        = 0;      // compteur de cycles
let _lastCpuUsage      = process.cpuUsage(); // pour calcul CPU delta
let _lastCpuTime       = Date.now();
let _sockRef           = null;   // référence au sock WhatsApp (injectée depuis index.js)
let _isRestartPending  = false;  // verrou anti double-restart
let _cleanupCount      = 0;      // nombre total de nettoyages effectués

/**
 * Injecter la référence sock pour l'alerte WhatsApp avant restart.
 * Appelé depuis index.js après la création du socket.
 * @param {object} sock — socket Baileys actif
 */
function setSock(sock) {
  _sockRef = sock;
}

/**
 * Calculer le % CPU depuis le dernier appel.
 * @returns {string} ex: "12.4%"
 */
function getCpuPercent() {
  try {
    const now      = Date.now();
    const usage    = process.cpuUsage(_lastCpuUsage);
    const elapsed  = (now - _lastCpuTime) * 1000; // µs
    const cpuTotal = usage.user + usage.system;
    const pct      = elapsed > 0 ? ((cpuTotal / elapsed) * 100).toFixed(1) : '?';
    _lastCpuUsage  = process.cpuUsage();
    _lastCpuTime   = now;
    return `${pct}%`;
  } catch {
    return '?%';
  }
}

/**
 * Lire la config mémoire depuis config.js (avec valeurs par défaut).
 * Lecture à chaque cycle pour permettre un rechargement à chaud.
 */
function getMemConfig() {
  try {
    // On delete le cache pour lire la config à jour
    const cfgPath = require.resolve('../config.js');
    delete require.cache[cfgPath];
    const cfg = require('../config.js');
    return {
      warnMB     : cfg.memoryGuard?.warnMB     ?? 250,
      criticalMB : cfg.memoryGuard?.criticalMB ?? 350,
      enabled    : cfg.memoryGuard?.enabled    !== false,
      notifyOwner: cfg.memoryGuard?.notifyOwner !== false,
    };
  } catch {
    return { warnMB: 250, criticalMB: 350, enabled: true, notifyOwner: true };
  }
}

/**
 * Nettoyer les fichiers temporaires audio/vidéo orphelins.
 * Ne supprime que les fichiers dans temp/<sessionId>/ avec les bonnes
 * extensions, âgés de plus de 5 minutes (= pas en cours d'utilisation).
 * [PHASE 2 — SUITE] Parcourt maintenant CHAQUE sous-dossier de session
 * (avant : un seul temp/ partagé — le nettoyage d'une session pouvait
 * supprimer un fichier en cours d'utilisation par une autre session).
 * @returns {number} nombre d'octets libérés
 */
function cleanTempFiles() {
  let freed = 0;
  try {
    tempManager.forEachSessionTempDir((tempDir) => {
      const now   = Date.now();
      const files = fs.readdirSync(tempDir);

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!TEMP_EXTS.has(ext)) continue;

        const fp = path.join(tempDir, file);
        try {
          const stat = fs.statSync(fp);
          // Ne supprimer que les fichiers de plus de 5 min (300 000 ms)
          if (stat.isFile() && (now - stat.mtimeMs) > 300_000) {
            freed += stat.size;
            fs.unlinkSync(fp);
          }
        } catch { /* fichier en cours d'utilisation → skip */ }
      }
    });
  } catch (e) {
    _warn('[MemoryGuard] cleanTempFiles erreur:', e.message);
  }
  return freed;
}

/**
 * Nettoyer les entrées non-essentielles du require.cache.
 * Ne supprime que les modules qui ne sont pas dans CACHE_PROTECTED
 * et dont le chemin contient 'utils/' ou 'commands/' (rechargement safe).
 * @returns {number} nombre de modules vidés
 */
function cleanRequireCache() {
  let count = 0;
  try {
    const keys = Object.keys(require.cache);
    for (const key of keys) {
      // Protéger les modules critiques
      if (CACHE_PROTECTED.some(p => key.includes(p))) continue;
      // Seulement vider les utils secondaires (pas les handlers principaux)
      if (!key.includes('/utils/') && !key.includes('/commands/')) continue;
      // Ne jamais vider le memoryGuard lui-même
      if (key.includes('memoryGuard')) continue;

      delete require.cache[key];
      count++;
    }
  } catch (e) {
    _warn('[MemoryGuard] cleanRequireCache erreur:', e.message);
  }
  return count;
}

/**
 * Nettoyage doux complet (niveau 2).
 * Appelé quand RAM > warnMB.
 * @returns {object} rapport du nettoyage
 */
function performSoftCleanup() {
  _cleanupCount++;
  const before = Math.round(process.memoryUsage().rss / 1024 / 1024);

  // 1. Fichiers temp
  const freedBytes   = cleanTempFiles();
  const freedMB      = (freedBytes / 1024 / 1024).toFixed(2);

  // 2. Cache require (modules utils/commands uniquement)
  const cacheCleared = cleanRequireCache();

  // 3. GC forcé si disponible (--expose-gc dans start script)
  if (global.gc) {
    try { global.gc(); } catch { /* ignore */ }
  }

  // 4. Forcer le GC du V8 engine via process.memoryUsage() trick
  // (crée une pression GC légère sans être brutal)
  try {
    const arr = new Array(1000).fill(null);
    arr.length = 0;
  } catch { /* ignore */ }

  const after = Math.round(process.memoryUsage().rss / 1024 / 1024);

  return {
    before,
    after,
    diff      : before - after,
    freedMB,
    cacheCleared,
    cycle     : _cleanupCount
  };
}

/**
 * Envoyer une alerte WhatsApp au propriétaire avant restart.
 * Utilise la référence sock injectée. Silencieux si sock indisponible.
 */
async function notifyOwnerBeforeRestart(memMB, config) {
  if (!config.notifyOwner || !_sockRef) return;
  try {
    const ownerNum = process.env.PHONE_NUMBER || require('../config.js').ownerNumber?.[0] || '';
    const ownerJid = String(ownerNum).replace(/\D/g, '') + '@s.whatsapp.net';
    if (ownerJid.length < 15) return;

    const upMin = Math.round(process.uptime() / 60);
    await _sockRef.sendMessage(ownerJid, {
      text:
        `⚠️ *𝐃𝐈𝐏𝐏𝐄𝐑 — REDÉMARRAGE MÉMOIRE*\n\n` +
        `🧠 *RAM critique :* ${memMB} Mo\n` +
        `⏱️ *Uptime :* ${upMin} min\n` +
        `🔄 *Action :* Redémarrage propre dans 10s\n\n` +
        `> _Le bot sera de retour dans quelques secondes via PM2_`
    }).catch(() => {});
  } catch { /* ne jamais crasher ici */ }
}

/**
 * Redémarrage propre via PM2.
 * Attend 10s, notifie le propriétaire, puis process.exit(0).
 * PM2 relance automatiquement.
 * Anti-spam : ignore si un restart a eu lieu il y a moins de 3 min.
 */
async function triggerGracefulRestart(memMB, cfg) {
  // Anti-spam : pas 2 restarts en moins de 3 minutes
  const now = Date.now();
  if (_isRestartPending || (now - _lastRestartTime) < 3 * 60 * 1000) {
    _warn(`[MemoryGuard] ⏸ Restart annulé — dernier restart il y a ${Math.round((now - _lastRestartTime) / 1000)}s`);
    return;
  }

  _isRestartPending = true;
  _lastRestartTime  = now;

  _warn(`[MemoryGuard] 🔴 RAM CRITIQUE ${memMB} Mo — Redémarrage propre dans 10s...`);

  // Notifier le propriétaire
  await notifyOwnerBeforeRestart(memMB, cfg);

  // Attendre 10s pour laisser les messages en cours se terminer
  await new Promise(r => setTimeout(r, 10_000));

  _log('[MemoryGuard] 🔄 Redémarrage propre → PM2 prendra le relais');
  process.exit(0); // PM2 relance automatiquement avec `restart_delay`
}

/**
 * Cycle principal de surveillance.
 * Appelé toutes les 5 minutes par le setInterval.
 */
async function runMonitorCycle() {
  try {
    _cycleCount++;

    const cfg  = getMemConfig();
    if (!cfg.enabled) return;

    const mem       = process.memoryUsage();
    const rssMB     = Math.round(mem.rss          / 1024 / 1024);
    const heapUsed  = Math.round(mem.heapUsed      / 1024 / 1024);
    const heapTotal = Math.round(mem.heapTotal     / 1024 / 1024);
    const extMB     = Math.round((mem.external || 0) / 1024 / 1024);
    const uptimMin  = Math.round(process.uptime()  / 60);
    const uptimH    = (uptimMin / 60).toFixed(1);
    const cpuPct    = getCpuPercent();
    const freeSysMB = Math.round(os.freemem()      / 1024 / 1024);

    // ── Log standard toutes les 5 min ───────────────────────────────
    _log(
      `🧠 [MemGuard #${_cycleCount}] ` +
      `RSS:${rssMB}Mo | Heap:${heapUsed}/${heapTotal}Mo | ` +
      `Ext:${extMB}Mo | CPU:${cpuPct} | ` +
      `SysLibre:${freeSysMB}Mo | Up:${uptimH}h`
    );

    // ── Niveau 2 : Nettoyage doux (WARNING) ─────────────────────────
    if (rssMB >= cfg.warnMB && rssMB < cfg.criticalMB) {
      _warn(`[MemoryGuard] ⚠️  RAM ${rssMB}Mo ≥ seuil WARNING ${cfg.warnMB}Mo → nettoyage doux`);

      const report = performSoftCleanup();

      _log(
        `[MemoryGuard] 🧹 Cleanup #${report.cycle} — ` +
        `Avant:${report.before}Mo → Après:${report.after}Mo (-${report.diff}Mo) | ` +
        `Fichiers libérés:${report.freedMB}Mo | Cache vidé:${report.cacheCleared} modules`
      );
    }

    // ── Niveau 3 : Redémarrage propre (CRITICAL) ────────────────────
    if (rssMB >= cfg.criticalMB) {
      _warn(`[MemoryGuard] 🔴 RAM ${rssMB}Mo ≥ seuil CRITIQUE ${cfg.criticalMB}Mo`);

      // Tenter un dernier nettoyage avant de décider du restart
      const report = performSoftCleanup();
      _log(`[MemoryGuard] 🧹 Cleanup d'urgence — Avant:${report.before}Mo → Après:${report.after}Mo`);

      // Re-mesurer après nettoyage
      const rssAfterMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
      _log(`[MemoryGuard] 📊 RAM après cleanup d'urgence : ${rssAfterMB}Mo`);

      // Si encore critique après nettoyage → restart
      if (rssAfterMB >= cfg.criticalMB) {
        await triggerGracefulRestart(rssAfterMB, cfg);
      } else {
        _log(`[MemoryGuard] ✅ RAM revenue à ${rssAfterMB}Mo après cleanup — restart annulé`);
        _isRestartPending = false;
      }
    }

  } catch (e) {
    // Ne jamais crasher dans le timer — le bot doit rester vivant
    _warn('[MemoryGuard] ❌ Erreur dans le cycle de surveillance :', e.message);
  }
}

/**
 * Démarrer le Memory Guard.
 * À appeler UNE SEULE FOIS depuis index.js au démarrage.
 */
function startMemoryGuard() {
  if (_guardTimer) {
    _warn('[MemoryGuard] ⚠️  Déjà démarré — appel ignoré');
    return;
  }

  const cfg = getMemConfig();
  if (!cfg.enabled) {
    _log('[MemoryGuard] ℹ️  Désactivé via config (memoryGuard.enabled = false)');
    return;
  }

  _log(
    `[MemoryGuard] ✅ Démarré — ` +
    `Warning:${cfg.warnMB}Mo | Critical:${cfg.criticalMB}Mo | ` +
    `Cycle: 5min | NotifyOwner:${cfg.notifyOwner}`
  );

  // Cycle toutes les 5 minutes
  _guardTimer = setInterval(runMonitorCycle, 5 * 60 * 1000);

  // Premier cycle dans 30s après démarrage (laisser le bot s'initialiser)
  setTimeout(runMonitorCycle, 30_000);
}

/**
 * Arrêter le Memory Guard proprement.
 * Appelé lors d'un SIGTERM/SIGINT ou d'une reconnexion Baileys.
 */
function stopMemoryGuard() {
  if (_guardTimer) {
    clearInterval(_guardTimer);
    _guardTimer = null;
    _log('[MemoryGuard] 🛑 Arrêté proprement');
  }
}

/**
 * Forcer un nettoyage immédiat (utilisable par d'autres modules).
 * @returns {object} rapport
 */
function forceCleanup() {
  _log('[MemoryGuard] 🧹 Nettoyage forcé manuel...');
  return performSoftCleanup();
}

module.exports = {
  startMemoryGuard,
  stopMemoryGuard,
  setSock,
  forceCleanup,
  runMonitorCycle,
};
