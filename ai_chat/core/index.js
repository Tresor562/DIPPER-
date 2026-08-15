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
  const local = new LocalBrain();
  return {
    localBrain: local,
    async complete(request = {}) {
      const localAnswer = local.answer(request.messages || []);
      if (localAnswer?.text && Number(localAnswer.confidence || 0) >= 0.92) {
        return { provider: 'exaucee-local-brain', text: localAnswer.text };
      }
      try {
        const result = await primary.complete(request);
        if (result?.text?.trim()) return result;
      } catch (_) {}
      return local.fallback(request.messages || []);
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
    sessionId,
    persona,
    config,
    memory,
    ai,
    cognition,
    research,
    botKnowledge,
    commandBridge,
    scheduler,
    games,
    gameMaster,
    dynamicCommands,
    audit,
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