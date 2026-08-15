'use strict';

const path = require('path');
const persona = require('../personality/persona');
const { getConfig } = require('../config');
const { loadSettings } = require('../settings');
const { MemoryStore } = require('../memory/store');
const { routeMessage, getText } = require('../router/socialRouter');
const { ZeroCostRouter } = require('../ai/zeroCostRouter');
const { LocalBrain } = require('../ai/localBrain');
const { CognitiveEngine } = require('../cognition/cognitiveEngine');
const { analyzeRequest, directive } = require('../cognition/cognitivePolicy');
const { ResearchEngine } = require('../research/researchEngine');
const { BotKnowledge } = require('../knowledge/botKnowledge');
const { CommandBridge } = require('../tools/commandBridge');
const { PersistentScheduler } = require('../scheduler/persistentScheduler');
const { GameRegistry, quizEngine, truthOrDareEngine } = require('../games/registry');
const { GameMaster } = require('../games/gameMaster');
const { DynamicCommandRegistry } = require('../dynamic/registry');
const { DecisionLog } = require('../audit/decisionLog');

const safeSessionId = value => String(value || 'default').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120) || 'default';

function createGuaranteedBrain(primary) {
  const local = primary?.localBrain || new LocalBrain();
  return {
    localBrain: local,
    providerStatus: (...args) => typeof primary?.providerStatus === 'function' ? primary.providerStatus(...args) : null,
    async complete(request = {}) {
      const original = Array.isArray(request.messages) ? request.messages : [];
      const lastUser = [...original].reverse().find(m => m?.role === 'user')?.content || '';
      const meta = analyzeRequest(lastUser);
      const requestedMode = String(request.mode || 'normal').toLowerCase();
      const mode = meta.asksAction ? 'agent' : meta.complex && requestedMode === 'normal' ? 'deep' : requestedMode;
      const messages = [
        ...original.filter((m, i) => !(i === 0 && m?.role === 'system')),
      ];
      const firstSystem = original.find(m => m?.role === 'system')?.content || '';
      messages.unshift({ role:'system', content:[firstSystem, directive(meta)].filter(Boolean).join('\n\n') });
      try {
        const result = await primary.complete({ ...request, messages, mode });
        if (result?.text?.trim()) return { ...result, cognitiveMeta:meta };
      } catch (_) {}
      return { ...local.fallback(messages), degraded:true, cognitiveMeta:meta };
    }
  };
}

function createExaucee(options = {}) {
  const sessionId = safeSessionId(options.sessionId || 'default');
  const config = { ...getConfig(), ...loadSettings(sessionId), ...(options.config || {}) };
  const root = options.root || path.join(process.cwd(), 'data', 'exaucee');
  const memory = options.memory || new MemoryStore({ root: path.join(root, 'memory') });
  const primaryAi = options.ai || new ZeroCostRouter(config);
  const ai = options.ai ? primaryAi : createGuaranteedBrain(primaryAi);
  const cognition = options.cognition || new CognitiveEngine();
  const research = options.research || new ResearchEngine();
  const commands = options.commands || global.commands || new Map();
  const commandBridge = options.commandBridge || new CommandBridge({ commands });
  const scheduler = options.scheduler || new PersistentScheduler({ file: path.join(root, 'sessions', sessionId, 'tasks.json') });
  const games = options.games || new GameRegistry();
  const gameMaster = options.gameMaster || new GameMaster({ file: path.join(root, 'sessions', sessionId, 'games.json') });
  const dynamicCommands = options.dynamicCommands || new DynamicCommandRegistry({ file: path.join(root, 'sessions', sessionId, 'dynamic-commands.json') });
  const botKnowledge = options.botKnowledge || new BotKnowledge({
    getCommands: () => global.commands || commands || new Map(),
    getDynamicCommands: (sid, opts) => dynamicCommands.list(sid, opts),
    capabilities: [
      'conversation contextuelle et mémoire',
      'routeur IA adaptatif FAST/NORMAL/DEEP/AGENT/DUAL/CRITICAL',
      'Groq GPT-OSS, Gemini et OpenRouter free avec fallback',
      'commandes natives via CommandBridge',
      'commandes dynamiques validées',
      'rappels persistants',
      'Game Master multi-parties',
      'recherche web et analyse de liens',
      'contrôles Exaucée owner',
      'mémoire sociale de groupe'
    ]
  });
  const audit = options.audit || new DecisionLog({ root: path.join(root, 'audit', sessionId) });
  const recentExauceeMessageIds = new Set();

  if (!games.engines.has('quiz')) games.registerEngine(quizEngine);
  if (!games.engines.has('truth-or-dare')) games.registerEngine(truthOrDareEngine);

  return {
    sessionId, persona, config, memory, ai, cognition, research, botKnowledge, commandBridge, scheduler, games, gameMaster, dynamicCommands, audit,
    markOwnMessage(id) {
      if (!id) return;
      recentExauceeMessageIds.add(id);
      if (recentExauceeMessageIds.size > 1000) recentExauceeMessageIds.delete(recentExauceeMessageIds.values().next().value);
    },
    inspectMessage({ msg, botJid, botJids = [], humanTakeover = false }) {
      const decision = routeMessage({ msg, botJid, botJids, recentExauceeMessageIds, humanTakeover });
      audit.write({ type: 'route', sessionId, messageId: msg?.key?.id, chatId: msg?.key?.remoteJid, decision });
      return { ...decision, text: getText(msg?.message || {}) };
    }
  };
}

module.exports = { createExaucee, safeSessionId, createGuaranteedBrain };
