/**
 * 𝐃𝐈𝐏𝐏𝐄𝐑 — MEMORY GUARD
 * Surveillance RAM + habillage global des réponses WhatsApp.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const tempManager = require('./tempManager');
const config = require('../config.js');

const _log  = process.__originalLog  || console.log;
const _warn = process.__originalWarn || console.warn;

const TEMP_EXTS = new Set(['.mp3', '.m4a', '.ogg', '.wav', '.opus', '.mp4', '.webm', '.ts', '.tmp']);

let _guardTimer        = null;
let _lastRestartTime   = 0;
let _cycleCount        = 0;
let _lastCpuUsage      = process.cpuUsage();
let _lastCpuTime       = Date.now();
let _sockRef           = null;
let _isRestartPending  = false;
let _cleanupCount      = 0;
let _brandingThumb     = null;

const BRAND_TITLE = '𝐌ꝛ⥔𝕿𝖗𝖊𝖘𝖔𝖗 🌹';
const BRAND_BODY  = config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑';
const BRAND_URL   = config.social?.whatsappChannel || 'https://whatsapp.com/';

function getBrandingThumb() {
  if (_brandingThumb) return _brandingThumb;
  try {
    _brandingThumb = fs.readFileSync(path.join(__dirname, '..', 'assets', 'dipper_reply_thumb.jpg'));
  } catch (err) {
    _warn('[ReplyBranding] miniature introuvable:', err.message);
    _brandingThumb = null;
  }
  return _brandingThumb;
}

function shouldBrandPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.contextInfo) return false; // ping/menu et réponses déjà enrichies restent intactes
  if (payload.react || payload.delete || payload.edit) return false;
  if (payload.sticker || payload.contacts || payload.location || payload.poll) return false;
  return Boolean(payload.text || payload.image || payload.video || payload.audio || payload.document);
}

function addReplyBranding(payload) {
  if (!shouldBrandPayload(payload)) return payload;
  const thumb = getBrandingThumb();
  if (!thumb) return payload;

  return {
    ...payload,
    contextInfo: {
      externalAdReply: {
        title: BRAND_TITLE,
        body: BRAND_BODY,
        thumbnail: thumb,
        sourceUrl: BRAND_URL,
        mediaUrl: BRAND_URL,
        mediaType: 1,
        renderLargerThumbnail: false,
        showAdAttribution: false,
      },
    },
  };
}

function installReplyBranding(sock) {
  if (!sock || sock.__dipperReplyBrandingInstalled) return;
  sock.__dipperReplyBrandingInstalled = true;

  const originalSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, payload, options) => {
    const branded = addReplyBranding(payload);
    return originalSendMessage(jid, branded, options);
  };
}

function setSock(sock) {
  _sockRef = sock;
  installReplyBranding(sock);
}

function getCpuPercent() {
  try {
    const now      = Date.now();
    const usage    = process.cpuUsage(_lastCpuUsage);
    const elapsed  = (now - _lastCpuTime) * 1000;
    const cpuTotal = usage.user + usage.system;
    const pct      = elapsed > 0 ? ((cpuTotal / elapsed) * 100).toFixed(1) : '?';
    _lastCpuUsage  = process.cpuUsage();
    _lastCpuTime   = now;
    return `${pct}%`;
  } catch {
    return '?%';
  }
}

function getMemConfig() {
  return {
    warnMB      : config.memoryGuard?.warnMB ?? 250,
    criticalMB  : config.memoryGuard?.criticalMB ?? 350,
    enabled     : config.memoryGuard?.enabled !== false,
    notifyOwner : config.memoryGuard?.notifyOwner !== false,
  };
}

function cleanTempFiles() {
  let freed = 0;
  try {
    tempManager.forEachSessionTempDir((tempDir) => {
      const now = Date.now();
      for (const file of fs.readdirSync(tempDir)) {
        const ext = path.extname(file).toLowerCase();
        if (!TEMP_EXTS.has(ext)) continue;
        const filePath = path.join(tempDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile() && (now - stat.mtimeMs) > 300_000) {
            freed += stat.size;
            fs.unlinkSync(filePath);
          }
        } catch {}
      }
    });
  } catch (err) {
    _warn('[MemoryGuard] cleanTempFiles erreur:', err.message);
  }
  return freed;
}

function performSoftCleanup() {
  _cleanupCount++;
  const before = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const freedBytes = cleanTempFiles();
  const freedMB = (freedBytes / 1024 / 1024).toFixed(2);

  if (global.gc) {
    try { global.gc(); } catch {}
  }

  const after = Math.round(process.memoryUsage().rss / 1024 / 1024);
  return {
    before,
    after,
    diff: before - after,
    freedMB,
    cacheCleared: 0,
    cycle: _cleanupCount,
  };
}

async function notifyOwnerBeforeRestart(memMB, cfg) {
  if (!cfg.notifyOwner || !_sockRef) return;
  try {
    const ownerNum = process.env.PHONE_NUMBER || config.ownerNumber?.[0] || '';
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
  } catch {}
}

async function triggerGracefulRestart(memMB, cfg) {
  const now = Date.now();
  if (_isRestartPending || (now - _lastRestartTime) < 3 * 60 * 1000) {
    _warn(`[MemoryGuard] ⏸ Restart annulé — dernier restart il y a ${Math.round((now - _lastRestartTime) / 1000)}s`);
    return;
  }

  _isRestartPending = true;
  _lastRestartTime  = now;
  _warn(`[MemoryGuard] 🔴 RAM CRITIQUE ${memMB} Mo — Redémarrage propre dans 10s...`);

  await notifyOwnerBeforeRestart(memMB, cfg);
  await new Promise(resolve => setTimeout(resolve, 10_000));

  _log('[MemoryGuard] 🔄 Redémarrage propre → PM2 prendra le relais');
  process.exit(0);
}

async function runMonitorCycle() {
  try {
    _cycleCount++;
    const cfg = getMemConfig();
    if (!cfg.enabled) return;

    const mem       = process.memoryUsage();
    const rssMB     = Math.round(mem.rss / 1024 / 1024);
    const heapUsed  = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotal = Math.round(mem.heapTotal / 1024 / 1024);
    const extMB     = Math.round((mem.external || 0) / 1024 / 1024);
    const uptimeMin = Math.round(process.uptime() / 60);
    const uptimeH   = (uptimeMin / 60).toFixed(1);
    const cpuPct    = getCpuPercent();
    const freeSysMB = Math.round(os.freemem() / 1024 / 1024);

    _log(
      `🧠 [MemGuard #${_cycleCount}] ` +
      `RSS:${rssMB}Mo | Heap:${heapUsed}/${heapTotal}Mo | ` +
      `Ext:${extMB}Mo | CPU:${cpuPct} | SysLibre:${freeSysMB}Mo | Up:${uptimeH}h`
    );

    if (rssMB >= cfg.warnMB && rssMB < cfg.criticalMB) {
      _warn(`[MemoryGuard] ⚠️  RAM ${rssMB}Mo ≥ seuil WARNING ${cfg.warnMB}Mo → nettoyage doux`);
      const report = performSoftCleanup();
      _log(
        `[MemoryGuard] 🧹 Cleanup #${report.cycle} — ` +
        `Avant:${report.before}Mo → Après:${report.after}Mo (-${report.diff}Mo) | ` +
        `Fichiers libérés:${report.freedMB}Mo | Modules rechargés:0`
      );
    }

    if (rssMB >= cfg.criticalMB) {
      _warn(`[MemoryGuard] 🔴 RAM ${rssMB}Mo ≥ seuil CRITIQUE ${cfg.criticalMB}Mo`);
      const report = performSoftCleanup();
      _log(`[MemoryGuard] 🧹 Cleanup d'urgence — Avant:${report.before}Mo → Après:${report.after}Mo`);

      const rssAfterMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
      _log(`[MemoryGuard] 📊 RAM après cleanup d'urgence : ${rssAfterMB}Mo`);

      if (rssAfterMB >= cfg.criticalMB) {
        await triggerGracefulRestart(rssAfterMB, cfg);
      } else {
        _log(`[MemoryGuard] ✅ RAM revenue à ${rssAfterMB}Mo après cleanup — restart annulé`);
        _isRestartPending = false;
      }
    }
  } catch (err) {
    _warn('[MemoryGuard] ❌ Erreur dans le cycle de surveillance :', err.message);
  }
}

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

  _guardTimer = setInterval(runMonitorCycle, 5 * 60 * 1000);
  if (_guardTimer.unref) _guardTimer.unref();

  const firstCycle = setTimeout(runMonitorCycle, 30_000);
  if (firstCycle.unref) firstCycle.unref();
}

function stopMemoryGuard() {
  if (_guardTimer) {
    clearInterval(_guardTimer);
    _guardTimer = null;
    _log('[MemoryGuard] 🛑 Arrêté proprement');
  }
}

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
