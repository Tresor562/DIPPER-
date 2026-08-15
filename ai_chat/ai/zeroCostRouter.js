'use strict';

const axios = require('axios');
const { getConfig } = require('../config');
const { LocalBrain } = require('./localBrain');
const { LocalModelRunner } = require('./localModelRunner');

class ZeroCostRouter {
  constructor(options = {}) {
    this.config = { ...getConfig(), ...options };
    this.pollinationsKey = process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || '';
    this.localBrain = options.localBrain || new LocalBrain();
    this.localModel = options.localModel || new LocalModelRunner();
  }

  async complete({ messages, mode = 'normal' }) {
    // 1) Raisonnement local haute confiance: instantané, zéro réseau.
    const local = this.localBrain.answer(messages);
    if (local?.text && Number(local.confidence || 0) >= 0.92) {
      return { provider: 'exaucee-local-brain', text: local.text };
    }

    // 2) Véritable modèle local natif (GGUF/llama.cpp) quand un modèle est installé.
    // Aucun serveur ni API n'est nécessaire: le processus est exécuté directement.
    if (this.localModel.available()) {
      try { return await this.localModel.complete(messages); }
      catch (err) { console.warn('[Exaucée/AI] modèle local GGUF indisponible:', err.message); }
    }

    // 3) Accélérateurs réseau facultatifs. Une panne ne rend plus Exaucée muette.
    const providers = [
      () => this._pollinationsSimple(messages, mode, 'openai'),
      () => this._pollinationsChat(messages, mode, 'openai'),
      () => this._pollinationsSimple(messages, mode, 'mistral'),
      () => this._groq(messages, mode),
      () => this._gemini(messages, mode),
      () => this._openRouter(messages, mode)
    ];
    if (process.env.EXAUCEE_LOCAL_BASE_URL) providers.unshift(() => this._localServer(messages, mode));

    const errors = [];
    for (const call of providers) {
      try {
        const result = await call();
        if (result?.text?.trim()) return result;
      } catch (err) {
        const status = err.response?.status;
        const code = err.code || status || 'ERR';
        errors.push(`${code}:${String(err.message || err).slice(0, 100)}`);
      }
    }

    // 4) Dernier recours local: Exaucée reste conversationnelle même hors ligne.
    const fallback = this.localBrain.fallback(messages);
    console.warn('[Exaucée/AI] providers externes indisponibles; cerveau local utilisé:', errors.join(' | '));
    return fallback;
  }

  _flattenPrompt(messages) {
    return (messages || []).map(m => `${String(m.role || 'user').toUpperCase()}: ${String(m.content || '')}`).join('\n\n').slice(0, 16000);
  }

  async _pollinationsSimple(messages, _mode, model = 'openai') {
    const prompt = this._flattenPrompt(messages);
    const url = `https://gen.pollinations.ai/text/${encodeURIComponent(prompt)}`;
    const params = { model };
    if (this.pollinationsKey) params.key = this.pollinationsKey;
    const res = await axios.get(url, {
      params,
      timeout: 18000,
      headers: { 'User-Agent': 'THE-BIG-DIPPER-Exaucee/3.0' },
      responseType: 'text',
      transformResponse: [data => data]
    });
    const text = typeof res.data === 'string' ? res.data : res.data?.text || res.data?.content || '';
    if (!String(text || '').trim()) throw new Error(`pollinations-simple-${model}: empty`);
    return { provider: `pollinations-simple-${model}`, text: String(text).trim() };
  }

  async _pollinationsChat(messages, _mode, model = 'openai') {
    if (!this.pollinationsKey) throw new Error('pollinations-chat: no key');
    const res = await axios.post('https://gen.pollinations.ai/v1/chat/completions', {
      model, messages, temperature: 0.65, max_tokens: 1400, stream: false
    }, {
      timeout: 25000,
      headers: { Authorization: `Bearer ${this.pollinationsKey}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    });
    const text = res.data?.choices?.[0]?.message?.content || res.data?.choices?.[0]?.text || res.data?.text || res.data?.content || '';
    if (!String(text || '').trim()) throw new Error(`pollinations-chat-${model}: empty`);
    return { provider: `pollinations-chat-${model}`, text: String(text).trim() };
  }

  async _localServer(messages) {
    const res = await axios.post(`${this.config.localBaseUrl.replace(/\/$/, '')}/api/chat`, {
      model: this.config.localModel, stream: false, messages
    }, { timeout: 25000 });
    return { provider: 'local-server', text: res.data?.message?.content || '' };
  }

  async _groq(messages) {
    if (!this.config.groqKey) throw new Error('groq unavailable');
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'openai/gpt-oss-120b', messages, temperature: 0.6
    }, { timeout: 25000, headers: { Authorization: `Bearer ${this.config.groqKey}` } });
    return { provider: 'groq-free', text: res.data?.choices?.[0]?.message?.content || '' };
  }

  async _gemini(messages) {
    if (!this.config.geminiKey) throw new Error('gemini unavailable');
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(this.config.geminiKey)}`;
    const res = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] }, { timeout: 25000 });
    return { provider: 'gemini-free', text: res.data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '' };
  }

  async _openRouter(messages) {
    if (!this.config.openRouterKey) throw new Error('openrouter unavailable');
    const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', { model: 'openrouter/free', messages }, {
      timeout: 25000, headers: { Authorization: `Bearer ${this.config.openRouterKey}` }
    });
    return { provider: 'openrouter-free', text: res.data?.choices?.[0]?.message?.content || '' };
  }
}

module.exports = { ZeroCostRouter };
