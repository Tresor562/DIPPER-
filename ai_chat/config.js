'use strict';

const DEFAULTS = Object.freeze({
  enabled: false,
  allowPaidProviders: false,
  maxCostPerRequest: 0,
  maxDailyCost: 0,
  localProvider: 'local',
  cloudOrder: ['groq-free', 'gemini-free', 'openrouter-free']
});

function getConfig(env = process.env) {
  return {
    ...DEFAULTS,
    enabled: String(env.EXAUCEE_ENABLED || '').toLowerCase() === 'true',
    localBaseUrl: env.EXAUCEE_LOCAL_BASE_URL || 'http://127.0.0.1:11434',
    localModel: env.EXAUCEE_LOCAL_MODEL || 'qwen3:8b',
    groqKey: env.GROQ_API_KEY || '',
    geminiKey: env.GEMINI_API_KEY || '',
    openRouterKey: env.OPENROUTER_API_KEY || ''
  };
}

module.exports = { DEFAULTS, getConfig };
