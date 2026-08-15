'use strict';

const baileys = require('@whiskeysockets/baileys');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;

let cachedVersion = null;
let cachedAt = 0;
let inflight = null;

function isValidVersion(version) {
  return Array.isArray(version)
    && version.length === 3
    && version.every(part => Number.isInteger(Number(part)) && Number(part) >= 0);
}

function parseOverride(raw) {
  if (!raw) return null;
  const parts = String(raw).trim().split(/[.,]/).map(Number);
  return isValidVersion(parts) ? parts : null;
}

async function resolveCurrentVersion() {
  const override = parseOverride(process.env.WA_WEB_VERSION);
  if (override) {
    console.log(`[WA-Version] 🧷 Version forcée par WA_WEB_VERSION: ${override.join('.')}`);
    return override;
  }

  const errors = [];

  if (typeof baileys.fetchLatestWaWebVersion === 'function') {
    try {
      const result = await baileys.fetchLatestWaWebVersion({
        timeout: FETCH_TIMEOUT_MS,
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          Accept: '*/*',
          'Cache-Control': 'no-cache',
        },
      });

      if (isValidVersion(result?.version) && result?.isLatest !== false) {
        console.log(`[WA-Version] ✅ WhatsApp Web live: ${result.version.join('.')}`);
        return result.version.map(Number);
      }

      errors.push(`fetchLatestWaWebVersion: ${result?.error?.message || 'version live invalide'}`);
    } catch (err) {
      errors.push(`fetchLatestWaWebVersion: ${err.message || err}`);
    }
  } else {
    errors.push('fetchLatestWaWebVersion indisponible dans cette version de Baileys');
  }

  if (typeof baileys.fetchLatestBaileysVersion === 'function') {
    try {
      const result = await baileys.fetchLatestBaileysVersion({ timeout: FETCH_TIMEOUT_MS });
      if (isValidVersion(result?.version)) {
        console.warn(
          `[WA-Version] ⚠️ Version live indisponible; fallback Baileys ${result.version.join('.')} `
          + `(${errors.join(' | ')})`
        );
        return result.version.map(Number);
      }
      errors.push('fetchLatestBaileysVersion: version invalide');
    } catch (err) {
      errors.push(`fetchLatestBaileysVersion: ${err.message || err}`);
    }
  }

  throw new Error(`Impossible de déterminer une version WhatsApp Web utilisable: ${errors.join(' | ')}`);
}

async function getCurrentWhatsAppWebVersion({ force = false } = {}) {
  const now = Date.now();

  if (!force && cachedVersion && now - cachedAt < CACHE_TTL_MS) {
    return [...cachedVersion];
  }

  if (!force && inflight) return inflight;

  inflight = resolveCurrentVersion()
    .then(version => {
      cachedVersion = [...version];
      cachedAt = Date.now();
      return [...cachedVersion];
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

function clearWhatsAppWebVersionCache() {
  cachedVersion = null;
  cachedAt = 0;
  inflight = null;
}

module.exports = {
  getCurrentWhatsAppWebVersion,
  clearWhatsAppWebVersionCache,
  isValidVersion,
};
