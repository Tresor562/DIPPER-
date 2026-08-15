'use strict';

const axios = require('axios');
const { getConfig } = require('../config');

class ZeroCostRouter {
  constructor(options = {}) {
    this.config = { ...getConfig(), ...options };
  }

  async complete({ messages, mode = 'normal' }) {
    const providers = [
      () => this._pollinations(messages, mode, 'openai'),
      () => this._pollinations(messages, mode, 'mistral'),
      () => this._groq(messages, mode),
      () => this._gemini(messages, mode),
      () => this._openRouter(messages, mode)
    ];

    // Ollama/local n'est essayé que s'il a été explicitement configuré.
    // Render n'héberge pas Ollama sur 127.0.0.1 par défaut : l'ancien ordre
    // faisait donc commencer chaque requête par un provider impossible.
    if (process.env.EXAUCEE_LOCAL_BASE_URL) {
      providers.push(() => this._local(messages, mode));
    }

    const errors = [];
    for (const call of providers) {
      try {
        const result = await call();
        if (result?.text?.trim()) return result;
      } catch (err) {
        const status = err.response?.status;
        const code = err.code || status || 'ERR';
        errors.push(`${code}:${String(err.message || err).slice(0, 140)}`);
      }
    }

    const error = new Error(`Aucun cerveau gratuit disponible: ${errors.join(' | ')}`);
    error.code = 'EXAUCEE_NO_FREE_PROVIDER';
    throw error;
  }

  async _pollinations(messages, _mode, model = 'openai') {
    const res = await axios.post('https://text.pollinations.ai/openai', {
      model,
      messages,
      temperature: 0.45,
      max_tokens: 1200,
      stream: false
    }, {
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'THE-BIG-DIPPER-Exaucee/1.0'
      }
    });

    const text = res.data?.choices?.[0]?.message?.content
      || res.data?.choices?.[0]?.text
      || res.data?.text
      || res.data?.content
      || (typeof res.data === 'string' ? res.data : '');

    if (!String(text || '').trim()) throw new Error(`pollinations-${model}: réponse vide`);
    return { provider: `pollinations-${model}`, text: String(text).trim() };
  }

  async _local(messages) {
    const res = await axios.post(`${this.config.localBaseUrl.replace(/\/$/, '')}/api/chat`, {
      model: this.config.localModel,
      stream: false,
      messages
    }, { timeout: 20000 });
    return { provider: 'local', text: res.data?.message?.content || '' };
  }

  async _groq(messages) {
    if (!this.config.groqKey) throw new Error('groq-free unavailable');
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'openai/gpt-oss-120b', messages, temperature: 0.4
    }, { timeout: 30000, headers: { Authorization: `Bearer ${this.config.groqKey}` } });
    return { provider: 'groq-free', text: res.data?.choices?.[0]?.message?.content || '' };
  }

  async _gemini(messages) {
    if (!this.config.geminiKey) throw new Error('gemini-free unavailable');
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(this.config.geminiKey)}`;
    const res = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] }, { timeout: 30000 });
    return { provider: 'gemini-free', text: res.data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '' };
  }

  async _openRouter(messages) {
    if (!this.config.openRouterKey) throw new Error('openrouter-free unavailable');
    const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'openrouter/free', messages
    }, { timeout: 30000, headers: { Authorization: `Bearer ${this.config.openRouterKey}` } });
    return { provider: 'openrouter-free', text: res.data?.choices?.[0]?.message?.content || '' };
  }
}

module.exports = { ZeroCostRouter };
