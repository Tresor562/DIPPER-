'use strict';

const axios = require('axios');
const { getConfig } = require('../config');

class ZeroCostRouter {
  constructor(options = {}) {
    this.config = { ...getConfig(), ...options };
    this.pollinationsKey = process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || '';
  }

  async complete({ messages, mode = 'normal' }) {
    const providers = [
      // Endpoint texte simple actuel. Il est tenté d'abord car certaines
      // installations Pollinations l'acceptent encore sans clé.
      () => this._pollinationsSimple(messages, mode, 'openai'),
      // Endpoint OpenAI-compatible officiel actuel (avec clé si disponible).
      () => this._pollinationsChat(messages, mode, 'openai'),
      () => this._pollinationsSimple(messages, mode, 'mistral'),
      () => this._groq(messages, mode),
      () => this._gemini(messages, mode),
      () => this._openRouter(messages, mode)
    ];

    // Ollama/local n'est essayé que s'il a été explicitement configuré.
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
        errors.push(`${code}:${String(err.message || err).slice(0, 120)}`);
      }
    }

    console.warn('[Exaucée/AI] Tous les providers ont échoué:', errors.join(' | '));
    const error = new Error(`Aucun cerveau gratuit disponible: ${errors.join(' | ')}`);
    error.code = 'EXAUCEE_NO_FREE_PROVIDER';
    throw error;
  }

  _flattenPrompt(messages) {
    return (messages || [])
      .map(m => `${String(m.role || 'user').toUpperCase()}: ${String(m.content || '')}`)
      .join('\n\n')
      .slice(0, 12000);
  }

  async _pollinationsSimple(messages, _mode, model = 'openai') {
    const prompt = this._flattenPrompt(messages);
    const url = `https://gen.pollinations.ai/text/${encodeURIComponent(prompt)}`;
    const params = { model };
    if (this.pollinationsKey) params.key = this.pollinationsKey;

    const res = await axios.get(url, {
      params,
      timeout: 25000,
      headers: { 'User-Agent': 'THE-BIG-DIPPER-Exaucee/2.0' },
      responseType: 'text',
      transformResponse: [data => data]
    });

    const text = typeof res.data === 'string'
      ? res.data
      : res.data?.text || res.data?.content || '';
    if (!String(text || '').trim()) throw new Error(`pollinations-simple-${model}: réponse vide`);
    return { provider: `pollinations-simple-${model}`, text: String(text).trim() };
  }

  async _pollinationsChat(messages, _mode, model = 'openai') {
    if (!this.pollinationsKey) throw new Error('pollinations-chat: clé absente');
    const res = await axios.post('https://gen.pollinations.ai/v1/chat/completions', {
      model,
      messages,
      temperature: 0.45,
      max_tokens: 1200,
      stream: false
    }, {
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${this.pollinationsKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'THE-BIG-DIPPER-Exaucee/2.0'
      }
    });

    const text = res.data?.choices?.[0]?.message?.content
      || res.data?.choices?.[0]?.text
      || res.data?.text
      || res.data?.content
      || '';
    if (!String(text || '').trim()) throw new Error(`pollinations-chat-${model}: réponse vide`);
    return { provider: `pollinations-chat-${model}`, text: String(text).trim() };
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
