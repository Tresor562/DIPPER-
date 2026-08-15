'use strict';

const DEFAULTS = Object.freeze({
  enabled: true,
  allowPaidProviders: false,
  maxCostPerRequest: 0,
  maxDailyCost: 0,
  localProvider: 'local',
  cloudOrder: ['groq', 'gemini', 'openrouter', 'pollinations'],
  groqModel: 'openai/gpt-oss-120b',
  geminiModel: 'gemini-2.5-flash'
});

function getConfig(env = process.env) {
  const rawEnabled = env.EXAUCEE_ENABLED;
  return {
    ...DEFAULTS,
    enabled: rawEnabled == null || String(rawEnabled).trim() === ''
      ? DEFAULTS.enabled
      : String(rawEnabled).toLowerCase() === 'true',
    localBaseUrl: env.EXAUCEE_LOCAL_BASE_URL || 'http://127.0.0.1:11434',
    localModel: env.EXAUCEE_LOCAL_MODEL || 'qwen3:8b',
    groqKey: env.GROQ_API_KEY || '',
    groqModel: env.EXAUCEE_GROQ_MODEL || DEFAULTS.groqModel,
    geminiKey: env.GEMINI_API_KEY || '',
    geminiModel: env.EXAUCEE_GEMINI_MODEL || DEFAULTS.geminiModel,
    openRouterKey: env.OPENROUTER_API_KEY || ''
  };
}

module.exports = { DEFAULTS, getConfig };
