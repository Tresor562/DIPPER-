'use strict';

const axios = require('axios');
const { getConfig } = require('../config');
const { LocalBrain } = require('./localBrain');
const { LocalModelRunner } = require('./localModelRunner');
const { isLowQualityResponse } = require('./responseQuality');

const MODE = Object.freeze({ FAST:'fast', NORMAL:'normal', DEEP:'deep', AGENT:'agent', DUAL:'dual', CRITICAL:'critical' });
const SENSITIVE_RE = /(api[_ -]?key|token|secret|password|mot de passe|credential|cookie|authorization|session(?:id| key| token)?|bearer\s+[a-z0-9._~+\/-]+=*)/i;

function normalize(text='') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}

function lastUserText(messages=[]) {
  return [...messages].reverse().find(m => m?.role === 'user')?.content || '';
}

function recentAssistantTexts(messages=[], limit=5) {
  return (messages || []).filter(m => m?.role === 'assistant').slice(-limit).map(m => String(m.content || '')).filter(Boolean);
}

function inferMode(messages=[], requested) {
  if (requested && Object.values(MODE).includes(String(requested).toLowerCase())) return String(requested).toLowerCase();
  const text = normalize(lastUserText(messages));
  if (!text) return MODE.NORMAL;
  if (/^(salut|coucou|yo|hey|hello|bonjour|bonsoir|merci|mdr|lol)[ !?.]*$/.test(text)) return MODE.FAST;
  if (/\b(execute|cree|modifie|supprime|programme|planifie|ferme|ouvre|envoie|lance|organise|corrige)\b/.test(text)) return MODE.AGENT;
  if (/\b(critique|sensible|irreversible|dangereux|important|verifie deux fois|double verification)\b/.test(text)) return MODE.CRITICAL;
  if (/\b(compare|recoupe|deux avis|seconde analyse|plusieurs hypotheses|contradiction)\b/.test(text)) return MODE.DUAL;
  if (/\b(analyse|raisonne|reflechis|complexe|approfondi|en profondeur|plan detaille|pourquoi|demontre|diagnostique)\b/.test(text) || text.length > 700) return MODE.DEEP;
  return MODE.NORMAL;
}

function cleanMessages(messages=[], maxChars=90000) {
  const rows = (messages || []).map(m => ({ role: ['system','assistant','user'].includes(m.role) ? m.role : 'user', content: String(m.content || '') }));
  let total = 0;
  const kept = [];
  for (let i=rows.length-1;i>=0;i--) {
    const row = rows[i];
    if (total + row.content.length > maxChars && kept.length) continue;
    kept.unshift(row);
    total += row.content.length;
    if (total >= maxChars) break;
  }
  return kept;
}

function hashString(text='') {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function containsSensitive(messages=[]) {
  return (messages || []).some(m => SENSITIVE_RE.test(String(m?.content || '')));
}

function unavailableFallback(messages=[], errors=[]) {
  const userText = lastUserText(messages);
  const question = String(userText || '').trim();
  return {
    provider:'exaucee-no-generative-model',
    degraded:true,
    noModel:true,
    text: question
      ? `Je t’ai bien comprise, mais je n’ai actuellement aucun cerveau génératif utilisable pour répondre correctement à « ${question.slice(0,180)} ». Je préfère te le dire plutôt que répondre à côté. Un owner peut vérifier mes moteurs avec *.exaucee providers*.`
      : `Je suis là, mais aucun de mes cerveaux génératifs n’est disponible actuellement. Un owner peut vérifier mes moteurs avec *.exaucee providers*.`,
    errors: errors.slice(-6)
  };
}

class ZeroCostRouter {
  constructor(options = {}) {
    this.config = { ...getConfig(), ...options };
    this.pollinationsKey = process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || '';
    this.localBrain = options.localBrain || new LocalBrain();
    this.localModel = options.localModel || new LocalModelRunner();
    this.health = new Map();
    this.cache = new Map();
    this.http = axios.create({ timeout: 30000, maxRedirects: 3 });
  }

  _available(name) {
    const state = this.health.get(name);
    return !state || !state.cooldownUntil || state.cooldownUntil <= Date.now();
  }

  _success(name) {
    this.health.set(name, { failures:0, cooldownUntil:0, lastSuccess:Date.now() });
  }

  _failure(name, error) {
    const prev = this.health.get(name) || { failures:0 };
    const failures = prev.failures + 1;
    const status = Number(error?.response?.status || 0);
    const cooldown = status === 429 ? 90_000 : failures >= 3 ? 30_000 : 5_000;
    this.health.set(name, { failures, cooldownUntil:Date.now()+cooldown, lastError:String(error?.message||error).slice(0,180) });
  }

  providerStatus() {
    const statusFor = name => {
      const s = this.health.get(name) || {};
      return { healthy:this._available(name), failures:s.failures || 0, lastError:s.lastError || null, lastSuccess:s.lastSuccess || null };
    };
    return {
      policy: { maxCostPerRequest:0, maxDailyCost:0, allowPaidProviders:false, paidFallback:false },
      providers: {
        groq: { configured:Boolean(this.config.groqKey), model:this.config.groqModel || 'openai/gpt-oss-120b', ...statusFor('groq') },
        gemini: { configured:Boolean(this.config.geminiKey), model:this.config.geminiModel || 'gemini-2.5-flash', ...statusFor('gemini') },
        openrouter: { configured:Boolean(this.config.openRouterKey), model:'openrouter/free', ...statusFor('openrouter') },
        pollinations: { configured:Boolean(this.pollinationsKey), model:'openai', optional:true, ...statusFor('pollinations') },
        local: { configured:this.localModel.available(), ...statusFor('local') }
      }
    };
  }

  _cacheKey(messages, mode) {
    if (mode === MODE.AGENT || mode === MODE.CRITICAL) return '';
    const recent = messages.slice(-8).map(m => `${m.role}:${normalize(m.content).slice(0,1500)}`).join('|');
    if (!recent) return '';
    return `${mode}:${hashString(recent)}`;
  }

  _getCached(key) {
    const row = key && this.cache.get(key);
    if (!row || row.expiresAt < Date.now()) { if (key) this.cache.delete(key); return null; }
    return { ...row.value, provider:`${row.value.provider}:cache` };
  }

  _putCached(key, value) {
    if (!key || !value?.text || value.degraded) return;
    this.cache.set(key, { expiresAt:Date.now()+8*60*1000, value });
    if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value);
  }

  _qualityOK(result, messages) {
    if (!result?.text?.trim()) return false;
    return !isLowQualityResponse({
      candidate:result.text,
      userText:lastUserText(messages),
      recentAssistant:recentAssistantTexts(messages)
    });
  }

  async complete({ messages, mode } = {}) {
    messages = cleanMessages(messages || []);
    const selectedMode = inferMode(messages, mode);
    const sensitive = containsSensitive(messages);
    const cacheKey = sensitive ? '' : this._cacheKey(messages, selectedMode);
    const cached = this._getCached(cacheKey);
    if (cached && this._qualityOK(cached, messages)) return { ...cached, mode:selectedMode };

    if (sensitive) {
      if (this.localModel.available()) {
        try {
          const result = await this.localModel.complete(messages, { mode:selectedMode });
          if (this._qualityOK(result, messages)) return { ...result, mode:selectedMode, privacy:'local-only' };
        } catch (err) { this._failure('local', err); }
      }
      const local = selectedMode === MODE.FAST ? this.localBrain.answer(messages) : null;
      if (local?.text && Number(local.confidence || 0) >= 0.97) return { provider:'exaucee-local-private-fast', text:local.text, mode:selectedMode, privacy:'local-only' };
      return { ...unavailableFallback(messages, ['privacy:local-only']), mode:selectedMode, privacy:'local-only' };
    }

    if ([MODE.DUAL, MODE.CRITICAL].includes(selectedMode)) {
      const dual = await this._dual(messages, selectedMode).catch(() => null);
      if (dual && this._qualityOK(dual, messages)) { this._putCached(cacheKey, dual); return dual; }
    }

    const errors = [];
    for (const name of this._providerOrder(selectedMode)) {
      if (!this._providerConfigured(name) || !this._available(name)) continue;
      try {
        const result = await this._call(name, messages, selectedMode);
        if (!this._qualityOK(result, messages)) {
          errors.push(`${name}:LOW_QUALITY`);
          continue;
        }
        this._success(name);
        const out = { ...result, mode:selectedMode };
        this._putCached(cacheKey, out);
        return out;
      } catch (err) {
        this._failure(name, err);
        errors.push(`${name}:${err?.response?.status || err?.code || 'ERR'}:${String(err?.message||err).slice(0,100)}`);
      }
    }

    if (this.localModel.available()) {
      try {
        const result = await this.localModel.complete(messages, { mode:selectedMode });
        if (this._qualityOK(result, messages)) return { ...result, mode:selectedMode };
        errors.push('local:LOW_QUALITY');
      } catch (err) { this._failure('local', err); errors.push(`local:${String(err?.message||err).slice(0,100)}`); }
    }

    if (selectedMode === MODE.FAST) {
      const local = this.localBrain.answer(messages);
      if (local?.text && Number(local.confidence || 0) >= 0.97) return { provider:'exaucee-local-fast', text:local.text, mode:selectedMode };
    }

    console.warn(`[Exaucée/AI] ${selectedMode} — aucun LLM de qualité utilisable: ${errors.join(' | ')}`);
    return { ...unavailableFallback(messages, errors), mode:selectedMode };
  }

  _providerConfigured(name) {
    if (name === 'groq') return Boolean(this.config.groqKey);
    if (name === 'gemini') return Boolean(this.config.geminiKey);
    if (name === 'openrouter') return Boolean(this.config.openRouterKey);
    if (name === 'pollinations') return Boolean(this.pollinationsKey);
    return false;
  }

  _providerOrder(mode) {
    if (mode === MODE.FAST) return ['gemini','groq','openrouter'];
    return ['groq','gemini','openrouter'];
  }

  async _call(name, messages, mode) {
    if (name === 'groq') return this._groq(messages, mode);
    if (name === 'gemini') return this._gemini(messages, mode);
    if (name === 'openrouter') return this._openRouter(messages, mode);
    if (name === 'pollinations') return this._pollinations(messages, mode);
    throw new Error(`unknown provider ${name}`);
  }

  async _dual(messages, mode) {
    const candidates = [];
    if (this.config.groqKey && this._available('groq')) candidates.push(['groq', () => this._groq(messages, mode)]);
    if (this.config.geminiKey && this._available('gemini')) candidates.push(['gemini', () => this._gemini(messages, mode)]);
    if (this.config.openRouterKey && this._available('openrouter')) candidates.push(['openrouter', () => this._openRouter(messages, mode)]);
    if (candidates.length < 2) return null;

    const settled = await Promise.allSettled(candidates.slice(0,2).map(([,fn]) => fn()));
    const good = settled.map((s,i) => s.status === 'fulfilled' ? { name:candidates[i][0], ...s.value } : null)
      .filter(row => row && this._qualityOK(row, messages));
    if (good.length < 2) return good[0] || null;

    const synthesisMessages = [
      ...messages,
      { role:'system', content:'Tu es le vérificateur final d’Exaucée. Deux analyses indépendantes suivent. Produis UNE réponse finale directement liée au dernier message de l’utilisateur, naturelle, exacte et utile. Résous les contradictions. Ne mentionne pas les fournisseurs. Ne révèle aucun raisonnement interne. Si les analyses ne suffisent pas à établir un fait, indique l’incertitude au lieu de l’inventer.' },
      { role:'user', content:`Analyse A:\n${good[0].text}\n\nAnalyse B:\n${good[1].text}` }
    ];
    try {
      const final = good[0].name === 'groq' ? await this._groq(synthesisMessages, MODE.DEEP) : await this._gemini(synthesisMessages, MODE.DEEP);
      if (this._qualityOK(final, messages)) return { provider:`dual:${good[0].name}+${good[1].name}`, text:final.text, mode };
      return { provider:`dual:${good[0].name}+${good[1].name}`, text:good[0].text, mode };
    } catch (_) {
      return { provider:`dual:${good[0].name}+${good[1].name}`, text:good[0].text, mode };
    }
  }

  _maxTokens(mode) {
    if (mode === MODE.FAST) return 500;
    if (mode === MODE.NORMAL) return 1800;
    if (mode === MODE.DEEP || mode === MODE.DUAL) return 3600;
    return 4000;
  }

  async _groq(messages, mode) {
    if (!this.config.groqKey) throw new Error('groq key unavailable');
    const preferred = this.config.groqModel || 'openai/gpt-oss-120b';
    const models = [...new Set([
      preferred,
      mode === MODE.FAST ? 'llama-3.1-8b-instant' : 'openai/gpt-oss-120b',
      'llama-3.3-70b-versatile',
      'openai/gpt-oss-20b',
      'llama-3.1-8b-instant'
    ])];
    let lastError;
    for (const model of models) {
      try { return await this._groqOne(model, messages, mode); }
      catch (err) {
        lastError = err;
        const status = Number(err?.response?.status || 0);
        if (![400,404,429,500,502,503,504].includes(status)) throw err;
      }
    }
    throw lastError || new Error('groq unavailable');
  }

  async _groqOne(model, messages, mode) {
    const body = {
      model,
      messages,
      max_tokens:this._maxTokens(mode),
      temperature:mode === MODE.FAST ? 0.7 : 0.35
    };
    if ([MODE.DEEP,MODE.DUAL,MODE.CRITICAL].includes(mode) && /gpt-oss/i.test(model)) {
      body.reasoning_effort = mode === MODE.CRITICAL ? 'high' : 'medium';
      body.include_reasoning = false;
    }
    const res = await this.http.post('https://api.groq.com/openai/v1/chat/completions', body, {
      headers:{ Authorization:`Bearer ${this.config.groqKey}`, 'Content-Type':'application/json' }
    });
    const text = res.data?.choices?.[0]?.message?.content || '';
    if (!String(text).trim()) throw new Error(`groq empty response: ${model}`);
    return { provider:`groq:${model}`, text:String(text).trim() };
  }

  async _gemini(messages, mode) {
    if (!this.config.geminiKey) throw new Error('gemini key unavailable');
    const preferred = this.config.geminiModel || 'gemini-2.5-flash';
    const models = [...new Set([preferred, 'gemini-2.5-flash', 'gemini-2.5-flash-lite'])];
    let lastError;
    for (const model of models) {
      try { return await this._geminiOne(model, messages, mode); }
      catch (err) {
        lastError = err;
        const status = Number(err?.response?.status || 0);
        if (![400,404,429,500,502,503,504].includes(status)) throw err;
      }
    }
    throw lastError || new Error('gemini unavailable');
  }

  async _geminiOne(model, messages, mode) {
    const systems = messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n');
    const contents = messages.filter(m=>m.role!=='system').map(m => ({
      role:m.role === 'assistant' ? 'model' : 'user',
      parts:[{ text:String(m.content||'') }]
    }));
    const generationConfig = { maxOutputTokens:this._maxTokens(mode), temperature:mode===MODE.FAST?0.7:0.35 };
    if ([MODE.DEEP,MODE.DUAL,MODE.CRITICAL].includes(mode) && /gemini-2\.5-/i.test(model)) {
      generationConfig.thinkingConfig = { thinkingBudget: mode===MODE.CRITICAL ? 4096 : 2048, includeThoughts:false };
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await this.http.post(url, {
      systemInstruction: systems ? { parts:[{ text:systems }] } : undefined,
      contents,
      generationConfig
    }, { headers:{ 'Content-Type':'application/json', 'x-goog-api-key':this.config.geminiKey } });
    const parts = res.data?.candidates?.[0]?.content?.parts || [];
    const text = parts.filter(p=>!p.thought).map(p=>p.text||'').join('');
    if (!String(text).trim()) throw new Error(`gemini empty response: ${model}`);
    return { provider:`gemini:${model}`, text:String(text).trim() };
  }

  async _openRouter(messages, mode) {
    if (!this.config.openRouterKey) throw new Error('openrouter key unavailable');
    const res = await this.http.post('https://openrouter.ai/api/v1/chat/completions', {
      model:'openrouter/free', messages, max_tokens:this._maxTokens(mode), temperature:mode===MODE.FAST?0.7:0.35
    }, {
      headers:{ Authorization:`Bearer ${this.config.openRouterKey}`, 'Content-Type':'application/json', 'HTTP-Referer':'https://the-big-dipper.onrender.com', 'X-Title':'THE BIG DIPPER — Exaucée' }
    });
    const text = res.data?.choices?.[0]?.message?.content || '';
    if (!String(text).trim()) throw new Error('openrouter empty response');
    return { provider:`openrouter-free:${res.data?.model || 'auto'}`, text:String(text).trim() };
  }

  async _pollinations(messages, mode) {
    if (!this.pollinationsKey) throw new Error('pollinations key unavailable');
    const res = await this.http.post('https://gen.pollinations.ai/v1/chat/completions', {
      model:'openai', messages, temperature:mode===MODE.FAST?0.7:0.35, max_tokens:this._maxTokens(mode), stream:false
    }, { headers:{ Authorization:`Bearer ${this.pollinationsKey}`, 'Content-Type':'application/json' } });
    const text = res.data?.choices?.[0]?.message?.content || '';
    if (!String(text).trim()) throw new Error('pollinations empty response');
    return { provider:'pollinations-chat', text:String(text).trim() };
  }
}

module.exports = { ZeroCostRouter, MODE, inferMode, cleanMessages, containsSensitive, unavailableFallback };
