'use strict';

const axios = require('axios');
const { getConfig } = require('../config');
const { LocalBrain } = require('./localBrain');
const { LocalModelRunner } = require('./localModelRunner');

const MODE = Object.freeze({ FAST:'fast', NORMAL:'normal', DEEP:'deep', AGENT:'agent', DUAL:'dual', CRITICAL:'critical' });

function normalize(text='') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}

function lastUserText(messages=[]) {
  return [...messages].reverse().find(m => m?.role === 'user')?.content || '';
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

function cleanMessages(messages=[], maxChars=70000) {
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
    const rate = status === 429;
    const cooldown = rate ? 90_000 : failures >= 3 ? 30_000 : 5_000;
    this.health.set(name, { failures, cooldownUntil:Date.now()+cooldown, lastError:String(error?.message||error).slice(0,180) });
  }

  providerStatus() {
    return {
      policy: { maxCostPerRequest:0, maxDailyCost:0, allowPaidProviders:false },
      providers: {
        groq: { configured:Boolean(this.config.groqKey), model:this.config.groqModel || 'openai/gpt-oss-120b', healthy:this._available('groq') },
        gemini: { configured:Boolean(this.config.geminiKey), model:this.config.geminiModel || 'gemini-2.5-flash', healthy:this._available('gemini') },
        openrouter: { configured:Boolean(this.config.openRouterKey), model:'openrouter/free', healthy:this._available('openrouter') },
        pollinations: { configured:true, model:'openai', healthy:this._available('pollinations') },
        local: { configured:this.localModel.available(), healthy:true }
      }
    };
  }

  _cacheKey(messages, mode) {
    const text = normalize(lastUserText(messages));
    if (!text || text.length > 500 || mode === MODE.AGENT || mode === MODE.CRITICAL) return '';
    return `${mode}:${text}`;
  }

  _getCached(key) {
    const row = key && this.cache.get(key);
    if (!row || row.expiresAt < Date.now()) { if (key) this.cache.delete(key); return null; }
    return { ...row.value, provider:`${row.value.provider}:cache` };
  }

  _putCached(key, value) {
    if (!key || !value?.text) return;
    this.cache.set(key, { expiresAt:Date.now()+10*60*1000, value });
    if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value);
  }

  async complete({ messages, mode } = {}) {
    messages = cleanMessages(messages || []);
    const selectedMode = inferMode(messages, mode);
    const cacheKey = this._cacheKey(messages, selectedMode);
    const cached = this._getCached(cacheKey);
    if (cached) return { ...cached, mode:selectedMode };

    // Un vrai modèle local génératif reste le meilleur socle sans dépendance réseau.
    if (this.localModel.available() && selectedMode !== MODE.DUAL) {
      try {
        const result = await this.localModel.complete(messages, { mode:selectedMode });
        if (result?.text?.trim()) return { ...result, mode:selectedMode };
      } catch (err) { this._failure('local', err); }
    }

    // FAST peut utiliser une réponse locale uniquement pour les salutations très simples.
    if (selectedMode === MODE.FAST) {
      const local = this.localBrain.answer(messages);
      if (local?.text && Number(local.confidence || 0) >= 0.97) return { provider:'exaucee-local-fast', text:local.text, mode:selectedMode };
    }

    // Les providers les plus capables passent AVANT les règles locales.
    if ([MODE.DUAL, MODE.CRITICAL].includes(selectedMode)) {
      const dual = await this._dual(messages, selectedMode).catch(() => null);
      if (dual?.text?.trim()) { this._putCached(cacheKey, dual); return dual; }
    }

    const order = this._providerOrder(selectedMode);
    const errors = [];
    for (const name of order) {
      if (!this._available(name)) continue;
      try {
        const result = await this._call(name, messages, selectedMode);
        if (result?.text?.trim()) {
          this._success(name);
          const out = { ...result, mode:selectedMode };
          this._putCached(cacheKey, out);
          return out;
        }
      } catch (err) {
        this._failure(name, err);
        errors.push(`${name}:${err?.response?.status || err?.code || 'ERR'}:${String(err?.message||err).slice(0,100)}`);
      }
    }

    // Dernier recours: règles locales. Elles ne remplacent plus un LLM quand un LLM fonctionne.
    const fallback = this.localBrain.fallback(messages);
    console.warn(`[Exaucée/AI] ${selectedMode} — providers indisponibles: ${errors.join(' | ')}`);
    return { ...fallback, provider:fallback.provider || 'exaucee-local-fallback', mode:selectedMode, degraded:true };
  }

  _providerOrder(mode) {
    // Groq GPT-OSS pour raisonnement, Gemini pour contexte général, OpenRouter free comme diversification,
    // Pollinations reste un secours sans clé.
    if (mode === MODE.DEEP || mode === MODE.AGENT || mode === MODE.CRITICAL) return ['groq','gemini','openrouter','pollinations'];
    return ['gemini','groq','openrouter','pollinations'];
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
    const good = settled.map((s,i) => s.status === 'fulfilled' ? { name:candidates[i][0], ...s.value } : null).filter(Boolean);
    if (good.length < 2) return good[0] || null;

    const synthesisMessages = [
      ...messages,
      { role:'system', content:'Tu es le vérificateur final d’Exaucée. Deux analyses indépendantes suivent. Produis UNE réponse finale naturelle, exacte et utile. Résous les contradictions, ne mentionne pas les fournisseurs, ne révèle aucun raisonnement interne et ne prétends pas avoir vérifié un fait absent des deux analyses.' },
      { role:'user', content:`Analyse A:\n${good[0].text}\n\nAnalyse B:\n${good[1].text}` }
    ];
    try {
      const final = good[0].name === 'groq' ? await this._groq(synthesisMessages, MODE.DEEP) : await this._gemini(synthesisMessages, MODE.DEEP);
      return { provider:`dual:${good[0].name}+${good[1].name}`, text:final.text, mode };
    } catch (_) {
      return { provider:`dual:${good[0].name}+${good[1].name}`, text:good[0].text, mode };
    }
  }

  _maxTokens(mode) {
    if (mode === MODE.FAST) return 500;
    if (mode === MODE.NORMAL) return 1400;
    if (mode === MODE.DEEP || mode === MODE.DUAL) return 2800;
    return 3200;
  }

  async _groq(messages, mode) {
    if (!this.config.groqKey) throw new Error('groq key unavailable');
    const model = this.config.groqModel || 'openai/gpt-oss-120b';
    const body = { model, messages, max_tokens:this._maxTokens(mode), temperature: mode === MODE.FAST ? 0.75 : 0.45 };
    if ([MODE.DEEP,MODE.DUAL,MODE.CRITICAL].includes(mode) && /gpt-oss/i.test(model)) body.reasoning_effort = mode === MODE.CRITICAL ? 'high' : 'medium';
    const res = await this.http.post('https://api.groq.com/openai/v1/chat/completions', body, {
      headers:{ Authorization:`Bearer ${this.config.groqKey}`, 'Content-Type':'application/json' }
    });
    const text = res.data?.choices?.[0]?.message?.content || '';
    if (!String(text).trim()) throw new Error('groq empty response');
    return { provider:`groq:${model}`, text:String(text).trim() };
  }

  async _gemini(messages, mode) {
    if (!this.config.geminiKey) throw new Error('gemini key unavailable');
    const model = this.config.geminiModel || 'gemini-2.5-flash';
    const systems = messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n');
    const contents = messages.filter(m=>m.role!=='system').map(m => ({
      role:m.role === 'assistant' ? 'model' : 'user',
      parts:[{ text:String(m.content||'') }]
    }));
    const generationConfig = { maxOutputTokens:this._maxTokens(mode), temperature:mode===MODE.FAST?0.8:0.5 };
    if ([MODE.DEEP,MODE.DUAL,MODE.CRITICAL].includes(mode)) generationConfig.thinkingConfig = { thinkingBudget: mode===MODE.CRITICAL ? 4096 : 2048 };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.config.geminiKey)}`;
    const res = await this.http.post(url, {
      systemInstruction: systems ? { parts:[{ text:systems }] } : undefined,
      contents,
      generationConfig
    }, { headers:{ 'Content-Type':'application/json' } });
    const text = res.data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || '';
    if (!String(text).trim()) throw new Error('gemini empty response');
    return { provider:`gemini:${model}`, text:String(text).trim() };
  }

  async _openRouter(messages, mode) {
    if (!this.config.openRouterKey) throw new Error('openrouter key unavailable');
    const res = await this.http.post('https://openrouter.ai/api/v1/chat/completions', {
      model:'openrouter/free', messages, max_tokens:this._maxTokens(mode), temperature:mode===MODE.FAST?0.8:0.5
    }, {
      headers:{ Authorization:`Bearer ${this.config.openRouterKey}`, 'Content-Type':'application/json', 'HTTP-Referer':'https://the-big-dipper.onrender.com', 'X-Title':'THE BIG DIPPER — Exaucée' }
    });
    const text = res.data?.choices?.[0]?.message?.content || '';
    if (!String(text).trim()) throw new Error('openrouter empty response');
    return { provider:`openrouter-free:${res.data?.model || 'auto'}`, text:String(text).trim() };
  }

  _flattenPrompt(messages) {
    return messages.map(m => `${String(m.role||'user').toUpperCase()}: ${String(m.content||'')}`).join('\n\n').slice(0,30000);
  }

  async _pollinations(messages, mode) {
    const prompt = this._flattenPrompt(messages);
    if (this.pollinationsKey) {
      try {
        const res = await this.http.post('https://gen.pollinations.ai/v1/chat/completions', {
          model:'openai', messages, temperature:mode===MODE.FAST?0.8:0.5, max_tokens:this._maxTokens(mode), stream:false
        }, { headers:{ Authorization:`Bearer ${this.pollinationsKey}`, 'Content-Type':'application/json' } });
        const text = res.data?.choices?.[0]?.message?.content || '';
        if (String(text).trim()) return { provider:'pollinations-chat', text:String(text).trim() };
      } catch (_) {}
    }
    const res = await this.http.get(`https://gen.pollinations.ai/text/${encodeURIComponent(prompt)}`, {
      params:{ model:'openai' }, responseType:'text', transformResponse:[x=>x], timeout:22000,
      headers:{ 'User-Agent':'THE-BIG-DIPPER-Exaucee/4.0' }
    });
    const text = typeof res.data === 'string' ? res.data : res.data?.text || '';
    if (!String(text).trim()) throw new Error('pollinations empty response');
    return { provider:'pollinations-anonymous', text:String(text).trim() };
  }
}

module.exports = { ZeroCostRouter, MODE, inferMode, cleanMessages };
