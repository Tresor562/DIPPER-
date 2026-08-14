'use strict';

class GameRegistry {
  constructor() { this.engines = new Map(); this.templates = new Map(); }
  registerEngine(engine) {
    if (!engine?.id || typeof engine.create !== 'function') throw new Error('Game engine invalide');
    this.engines.set(engine.id, engine);
    return engine;
  }
  registerTemplate(template) {
    if (!template?.id || !template.engine) throw new Error('Game template invalide');
    if (!this.engines.has(template.engine)) throw new Error(`Engine absent: ${template.engine}`);
    this.templates.set(template.id, Object.freeze({ ...template }));
    return template;
  }
  create(templateId, context = {}) {
    const template = this.templates.get(templateId);
    if (!template) throw new Error(`Jeu inconnu: ${templateId}`);
    return this.engines.get(template.engine).create({ template, context });
  }
  list() { return [...this.templates.values()]; }
}

const quizEngine = {
  id: 'quiz',
  create({ template, context }) {
    return {
      id: context.gameId || `game_${Date.now()}`,
      type: 'quiz',
      templateId: template.id,
      status: 'lobby',
      round: 0,
      players: {},
      scores: {},
      rules: { rounds: 10, answerWindowMs: 15000, ...template.rules }
    };
  }
};

const truthOrDareEngine = {
  id: 'truth-or-dare',
  create({ template, context }) {
    return {
      id: context.gameId || `game_${Date.now()}`,
      type: 'truth-or-dare',
      templateId: template.id,
      status: 'lobby',
      turn: 0,
      players: [],
      history: [],
      rules: { safeMode: true, ...template.rules }
    };
  }
};

module.exports = { GameRegistry, quizEngine, truthOrDareEngine };
