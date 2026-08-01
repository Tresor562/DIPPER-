/**
 * Screenshot API Manager — 𝐃𝐚𝐫𝐤 Edition
 * ─────────────────────────────────────────
 * Cascade de 3 APIs publiques gratuites.
 * Device : mobile | pc | tablet
 *
 * Ordre de tentative :
 *   1. screenshotmachine.com (fiable, JSON → URL image)
 *   2. api.apiflash.com      (gratuit avec clé publique)
 *   3. eliteprotech-apis     (fallback actuel du bot)
 */
const axios = require('axios');

const TIMEOUT = 25000;

/**
 * API 1 — ScreenshotMachine (gratuit, pas de clé requise)
 * Supporte device : desktop | phone | tablet
 */
async function tryScreenshotMachine(url, device) {
  const d = device === 'mobile' ? 'phone' : device === 'pc' ? 'desktop' : 'tablet';
  const endpoint = `https://api.screenshotmachine.com/?key=0b6d0f&url=${encodeURIComponent(url)}&device=${d}&format=jpg&dimension=1366x768&delay=3000&zoom=100`;
  const res = await axios.get(endpoint, { responseType: 'arraybuffer', timeout: TIMEOUT });
  const ct  = res.headers['content-type'] || '';
  if (!ct.includes('image')) throw new Error('screenshotmachine: pas une image');
  return Buffer.from(res.data);
}

/**
 * API 2 — Thum.io (gratuit, CDN direct)
 */
async function tryThumio(url, device) {
  // Thum.io ne supporte que desktop, on l'utilise comme fallback
  const endpoint = `https://image.thum.io/get/width/1280/crop/900/allowJPG/${encodeURIComponent(url)}`;
  const res = await axios.get(endpoint, { responseType: 'arraybuffer', timeout: TIMEOUT });
  const ct  = res.headers['content-type'] || '';
  if (!ct.includes('image')) throw new Error('thumio: pas une image');
  return Buffer.from(res.data);
}

/**
 * API 3 — s-shot.ru (gratuit, paramètre W/H)
 */
async function trySshot(url, device) {
  const w   = device === 'mobile' ? '375' : device === 'pc' ? '1920' : '768';
  const endpoint = `https://s-shot.ru/1024x768/1/${w}/0/jpg/?${encodeURIComponent(url)}`;
  const res = await axios.get(endpoint, { responseType: 'arraybuffer', timeout: TIMEOUT });
  const ct  = res.headers['content-type'] || '';
  if (!ct.includes('image') && !ct.includes('jpeg')) throw new Error('sshot: pas une image');
  return Buffer.from(res.data);
}

/**
 * Point d'entrée principal — lance les 3 APIs en cascade
 * @param {string} url    — URL complète (avec https://)
 * @param {string} device — 'mobile' | 'pc' | 'tablet'
 * @returns {Buffer} — image PNG/JPEG
 */
async function takeScreenshot(url, device = 'mobile') {
  const apis = [
    { name: 'screenshotmachine', fn: () => tryScreenshotMachine(url, device) },
    { name: 'thumio',            fn: () => tryThumio(url, device)            },
    { name: 'sshot',             fn: () => trySshot(url, device)             },
  ];

  const errors = [];
  for (const api of apis) {
    try {
      const buf = await api.fn();
      if (buf && buf.length > 5000) return buf;
      throw new Error('image trop petite');
    } catch (e) {
      errors.push(`[${api.name}] ${e.message}`);
    }
  }
  throw new Error(`Screenshot impossible : ${errors.join(' | ')}`);
}

module.exports = { takeScreenshot };
