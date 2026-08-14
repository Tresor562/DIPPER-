'use strict';

const path = require('path');
const persona = require('../personality/persona');
const { getConfig } = require('../config');
const { MemoryStore } = require('../memory/store');
const { routeMessage, getText } = require('../router/socialRouter');
const { ZeroCostRouter } = require('../ai/zeroCostRouter');
const { CommandBridge } = require('../tools/commandBridge');
const { PersistentScheduler } = require('../scheduler/persistentScheduler');
const { GameRegistry, quizEngine, truthOrDareEngine } = require('../games/registry');
const { GameMaster } = require('../games/gameMaster');
const { DynamicCommandRegistry } = require('../dynamic/registry');
const { DecisionLog } = require('../audit/decisionLog');

const safeSessionId = value => String(value || 'default').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120) || 'default';

function createExaucee(options = {}) {
  const config = { ...getConfig(), ...(options.config || {}) };
  const sessionId = safeSessionId(options.sessionId || 'default');
  const root = options.root || path.join(process.cwd(), 'data', 'exaucee');
  const memory = options.memory || new MemoryStore({ root: path.join(root, 'memory') });
  const ai = options.ai || new ZeroCostRouter(config);
  const commands = options.commands || global.commands || new Map();
  const commandBridge = options.commandBridge || new CommandBridge({ commands });
  const scheduler = options.scheduler || new PersistentScheduler({ file: path.join(root, 'sessions', sessionId, 'tasks.json') });
  const games = options.games || new GameRegistry();
  const gameMaster = options.gameMaster || new GameMaster({ file: path.join(root, 'sessions', sessionId, 'games.json') });
  const dynamicCommands = options.dynamicCommands || new DynamicCommandRegistry({ file: path.join(root, 'sessions', sessionId, 'dynamic-commands.json') });
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

module.exports = { createExaucee, safeSessionId };
