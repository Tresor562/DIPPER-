/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         AI ENGINE — 𝐃𝐚𝐫𝐤 Edition v4                       ║
 * ║  Centralise tous les appels IA. Cascade automatique.        ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║                                                             ║
 * ║  CORRECTIONS v4 :                                           ║
 * ║                                                             ║
 * ║  [FIX 1] deepseek-r1 en DERNIER dans toutes les cascades   ║
 * ║    → Il est rate-limité (429) → le mettre en premier       ║
 * ║    bloquait gemini/deepseek pendant 15–30s avant fallback   ║
 * ║    → Ordre corrigé : openai → mistral → llama → deepseek   ║
 * ║                                                             ║
 * ║  [FIX 2] Retry logic réécrite — plus de double wait       ║
 * ║    → L'ancienne boucle cumulait le backoff du début        ║
 * ║    + le wait 429 = délais de 7s/14s/21s au lieu de 2s/4s  ║
 * ║    → Nouvelle logique : un seul point de wait par échec    ║
 * ║                                                             ║
 * ║  [FIX 3] Timeout réduit à 25s par requête                  ║
 * ║    → WhatsApp timeout à ~45s. Avec 40s × 3 modèles = 120s  ║
 * ║    → la réponse arrivait après que WA avait abandonné      ║
 * ║    → 25s × 3 modèles max = 75s, avec cascade rapide       ║
 * ║                                                             ║
 * ║  [FIX 4] Fuite mémoire cooldowns — purge automatique       ║
 * ║    → En production, la Map grandissait sans limite          ║
 * ║    → Purge des entrées expirées toutes les 10 minutes       ║
 * ║                                                             ║
 * ║  [FIX 5] callDeepSeek priorité corrigée                    ║
 * ║    → openai d'abord (stable), deepseek-r1 en fallback      ║
 * ║                                                             ║
 * ║  [FIX 6] Logs structurés pour diagnostic production        ║
 * ║    → Chaque appel loggue : modèle, durée, statut, erreur   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

'use strict';

const axios = require('axios');

// ─────────────────────────────────────────────────────────────────────────────
// COOLDOWN MANAGER — avec purge automatique (anti fuite mémoire)
// ─────────────────────────────────────────────────────────────────────────────

const cooldowns = new Map();

// [FIX 4] Purge des cooldowns expirés toutes les 10 minutes
// Sans ça, la Map grossit indéfiniment en production
const MAX_COOLDOWN_S = 120; // le plus long cooldown du projet
setInterval(() => {
  const cutoff = Date.now() - (MAX_COOLDOWN_S * 1000);
  for (const [key, ts] of cooldowns) {
    if (ts < cutoff) cooldowns.delete(key);
  }
}, 10 * 60 * 1000).unref(); // unref = ne bloque pas l'arrêt du processus

const sessionContext = require('./sessionContext');

/**
 * checkCooldown — vérifie si l'utilisateur est en cooldown.
 * @returns {{ blocked: boolean, remaining: number }}
 */
function checkCooldown(cmd, jid, seconds = 15) {
  const key  = sessionContext.scopeKey(`${cmd}:${jid}`);
  const now  = Date.now();
  const last = cooldowns.get(key) || 0;
  const diff = now - last;
  if (diff < seconds * 1000) {
    return { blocked: true, remaining: Math.ceil((seconds * 1000 - diff) / 1000) };
  }
  cooldowns.set(key, now);
  return { blocked: false, remaining: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL CAPS
// ─────────────────────────────────────────────────────────────────────────────

const SC = t => {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
};

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT POLLINATIONS
// ─────────────────────────────────────────────────────────────────────────────

const POLLINATIONS_URL = 'https://text.pollinations.ai/openai';

// Modèles disponibles sur Pollinations (juin 2025)
// [FIX 1] deepseek-r1 en DERNIER — rate-limité fréquemment
const MODELS = {
  openai  : 'openai',      // GPT-4o — le plus stable, en tête de cascade
  mistral : 'mistral',     // Mistral — rapide, bon pour code
  llama   : 'llama',       // Llama 3.3 — créatif, histoires
  qwen    : 'qwen',        // Qwen 2.5 — stable alternatif
  phi     : 'phi',         // Phi-4 — compact, raisonnement
  deepseek: 'deepseek-r1', // DeepSeek-R1 — puissant MAIS rate-limité
};

// ─────────────────────────────────────────────────────────────────────────────
// APPEL POLLINATIONS SINGLE — une seule tentative, propre
// ─────────────────────────────────────────────────────────────────────────────

/**
 * callPollinationsOnce — appelle un modèle Pollinations une fois.
 * Lance une erreur typée si ça échoue.
 * @param {string}   prompt
 * @param {string}   system
 * @param {number}   maxTokens
 * @param {string}   model
 * @param {number}   timeoutMs
 * @returns {Promise<string>}
 */
async function callPollinationsOnce(prompt, system, maxTokens, model, timeoutMs) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const t0 = Date.now();

  const res = await axios.post(POLLINATIONS_URL, {
    model,
    messages,
    max_tokens : maxTokens,
    temperature: 0.7,
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Accept'      : 'application/json',
      // User-Agent explicite pour éviter les bans automatiques
      'User-Agent'  : 'Mozilla/5.0 (compatible; DarkBot/5.0)',
    },
    timeout: timeoutMs,
  });

  const text = res.data?.choices?.[0]?.message?.content
            || res.data?.choices?.[0]?.text
            || res.data?.text
            || res.data?.content;

  const duration = Date.now() - t0;

  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error(`Réponse vide du modèle [${model}] après ${duration}ms`);
  }

  console.log(`[aiEngine] ✅ [${model}] OK — ${duration}ms — ${text.length} chars`);
  return text.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// CASCADE MULTI-MODÈLES — cœur du système
// ─────────────────────────────────────────────────────────────────────────────

/**
 * cascadeModels — essaie une liste de modèles dans l'ordre.
 * Pour chaque modèle : 1 tentative rapide (25s).
 * Sur 429 : wait court puis continue vers le modèle suivant.
 * Sur timeout/réseau : passe directement au modèle suivant.
 *
 * [FIX 2] Plus de double wait : un seul point de pause par échec.
 * [FIX 3] Timeout 25s par appel (vs 40s avant) pour rester sous le timeout WA.
 *
 * @param {string[]} models     — liste des modèles à essayer dans l'ordre
 * @param {string}   prompt
 * @param {string}   system
 * @param {number}   maxTokens
 * @returns {Promise<string>}
 */
async function cascadeModels(models, prompt, system, maxTokens = 800) {
  const errors  = [];
  const TIMEOUT = 25000; // [FIX 3] 25s par requête

  for (const model of models) {
    console.log(`[aiEngine] ▶ Essai [${model}]...`);
    try {
      return await callPollinationsOnce(prompt, system, maxTokens, model, TIMEOUT);
    } catch (err) {
      const status = err.response?.status;
      const msg    = err.message || String(err);

      console.warn(`[aiEngine] ⚠️ [${model}] échec — HTTP:${status || 'N/A'} — ${msg.slice(0, 80)}`);
      errors.push(`[${model}]=${status || 'ERR'}`);

      // [FIX 2] Wait propre selon le type d'erreur, puis passe au modèle suivant
      if (status === 429) {
        // Rate-limit : attendre 3s avant d'essayer le prochain modèle
        console.log(`[aiEngine] 🚦 Rate-limit [${model}] — attente 3s avant prochain modèle`);
        await new Promise(r => setTimeout(r, 3000));
      } else if (err.code === 'ECONNABORTED' || msg.includes('timeout')) {
        // Timeout : passe immédiatement au suivant
        console.log(`[aiEngine] ⏰ Timeout [${model}] — passage au suivant`);
      }
      // Autres erreurs : continue directement
    }
  }

  throw new Error(
    `Tous les modèles IA indisponibles (${errors.join(', ')}). ` +
    `Réessaie dans quelques secondes.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FONCTIONS PUBLIQUES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * askAI — IA généraliste.
 * [FIX 1] openai en premier (stable), deepseek-r1 absent de la cascade standard.
 */
async function askAI(prompt, system = '', preferredModel = 'openai') {
  // Résoudre le nom du modèle préféré
  const resolvedPreferred = MODELS[preferredModel] || preferredModel;

  // Cascade : préféré → openai → mistral → llama
  // deepseek-r1 exclu par défaut (rate-limité)
  const cascade = [
    resolvedPreferred,
    MODELS.openai,
    MODELS.mistral,
    MODELS.llama,
  ].filter((v, i, a) => a.indexOf(v) === i);

  console.log(`[aiEngine] askAI — cascade: ${cascade.join(' → ')}`);
  return cascadeModels(cascade, prompt, system, 1000);
}

/**
 * callDeepSeek — Raisonnement avancé.
 * [FIX 5] openai en premier pour rapidité, deepseek-r1 en fallback.
 * Justification : deepseek-r1 est 3× plus lent et souvent rate-limité.
 * Si le raisonnement pur est nécessaire, deepseek-r1 reste en fallback.
 */
async function callDeepSeek(prompt, system = '') {
  console.log(`[aiEngine] callDeepSeek — cascade dédiée raisonnement`);
  return cascadeModels(
    [MODELS.openai, MODELS.qwen, MODELS.phi, MODELS.deepseek],
    prompt, system, 1200
  );
}

/**
 * callMistral — Code et précision.
 */
async function callMistral(prompt, system = '') {
  console.log(`[aiEngine] callMistral — cascade code/précision`);
  return cascadeModels(
    [MODELS.mistral, MODELS.openai, MODELS.phi],
    prompt, system, 1000
  );
}

/**
 * callLlama — Créatif, histoires, recettes.
 */
async function callLlama(prompt, system = '') {
  console.log(`[aiEngine] callLlama — cascade créative`);
  return cascadeModels(
    [MODELS.llama, MODELS.openai, MODELS.mistral],
    prompt, system, 1200
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GÉNÉRATION D'IMAGES — Pollinations Image API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * generateImage — génère une image via Pollinations.
 * Cascade automatique sur plusieurs modèles.
 */
async function generateImage(prompt, width = 1024, height = 1024, model = 'flux') {
  const modelsToTry = [model, 'flux', 'turbo', 'flux-realism']
    .filter((v, i, a) => a.indexOf(v) === i);

  const encodedPrompt = encodeURIComponent(prompt);
  const errors = [];

  for (const m of modelsToTry) {
    try {
      const seed = Math.floor(Math.random() * 999999);
      const url  =
        `https://image.pollinations.ai/prompt/${encodedPrompt}` +
        `?width=${width}&height=${height}&model=${m}&seed=${seed}&nologo=true`;

      console.log(`[aiEngine] 🎨 Image [${m}] — ${url.slice(0, 80)}...`);

      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout     : 55000,
        headers     : { 'User-Agent': 'Mozilla/5.0' },
      });

      const ct  = res.headers['content-type'] || '';
      if (!ct.includes('image')) {
        throw new Error(`Content-Type inattendu : ${ct}`);
      }

      const buf = Buffer.from(res.data);
      if (buf.length < 5000) throw new Error(`Image trop petite (${buf.length} bytes)`);

      console.log(`[aiEngine] ✅ Image [${m}] — ${Math.round(buf.length / 1024)}Ko`);
      return buf;
    } catch (e) {
      errors.push(`[${m}] ${e.message}`);
      console.warn(`[aiEngine] ⚠️ Image [${m}] : ${e.message}`);
    }
  }

  throw new Error(`Génération image échouée : ${errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE COOLDOWN STYLÉ
// ─────────────────────────────────────────────────────────────────────────────

function cooldownMessage(remaining, phrases) {
  return (
    `╭╼≪• *⏳ ${SC('cooldown actif')}* •≫╾╮\n` +
    `┃\n` +
    `┃ 🕐 *${SC('patiente encore')}* : ${remaining}s\n` +
    `┃ _${SC('les arcanes se rechargent')}_\n` +
    `╰━━━━━━━━━━━━━━━━━╯\n\n` +
    phrases.footer()
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  checkCooldown,
  cooldownMessage,
  askAI,
  callDeepSeek,
  callMistral,
  callLlama,
  generateImage,
  SC,
  MODELS,
  POLLINATIONS_MODELS: MODELS, // rétrocompatibilité
};
