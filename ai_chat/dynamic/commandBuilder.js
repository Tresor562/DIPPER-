'use strict';

const NAME_RE = /^[a-z][a-z0-9_-]{1,29}$/;
const RESERVED = new Set(['exaucee','exa','help','menu','owner','eval','exec','shell','system']);

function normalizeName(value = '') {
  return String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/^\.+/, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

function cleanText(value, max = 1200) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

function validateWorkflow(workflow) {
  const errors = [];
  if (!workflow || typeof workflow !== 'object') return { ok: false, errors: ['workflow absent'] };
  const allowed = new Set(['reply','random_reply','sequence']);
  if (!allowed.has(workflow.type)) errors.push('type de workflow non autorisé');

  if (workflow.type === 'reply') {
    const text = cleanText(workflow.text);
    if (!text) errors.push('réponse vide');
    if (text.length > 1200) errors.push('réponse trop longue');
  }

  if (workflow.type === 'random_reply') {
    const choices = Array.isArray(workflow.choices) ? workflow.choices : [];
    if (choices.length < 2) errors.push('au moins 2 réponses aléatoires requises');
    if (choices.length > 30) errors.push('maximum 30 réponses aléatoires');
    if (choices.some(x => !cleanText(x))) errors.push('réponse aléatoire vide');
  }

  if (workflow.type === 'sequence') {
    const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
    if (!steps.length) errors.push('séquence vide');
    if (steps.length > 12) errors.push('maximum 12 étapes');
    for (const step of steps) {
      if (!step || typeof step !== 'object') { errors.push('étape invalide'); continue; }
      if (!['reply','random_reply','wait'].includes(step.type)) errors.push('type d’étape non autorisé');
      if (step.type === 'reply' && !cleanText(step.text)) errors.push('étape réponse vide');
      if (step.type === 'random_reply' && (!Array.isArray(step.choices) || step.choices.filter(x => cleanText(x)).length < 2)) errors.push('étape aléatoire invalide');
      if (step.type === 'wait' && (Number(step.ms) < 0 || Number(step.ms) > 10000)) errors.push('attente hors limites');
    }
  }

  return { ok: errors.length === 0, errors };
}

function sanitizeWorkflow(workflow) {
  if (workflow.type === 'reply') return { type: 'reply', text: cleanText(workflow.text) };
  if (workflow.type === 'random_reply') return { type: 'random_reply', choices: (workflow.choices || []).map(x => cleanText(x)).filter(Boolean).slice(0, 30) };
  if (workflow.type === 'sequence') {
    return {
      type: 'sequence',
      steps: (workflow.steps || []).slice(0, 12).map(step => {
        if (step.type === 'wait') return { type: 'wait', ms: Math.max(0, Math.min(Number(step.ms) || 0, 10000)) };
        if (step.type === 'random_reply') return { type: 'random_reply', choices: (step.choices || []).map(x => cleanText(x)).filter(Boolean).slice(0, 20) };
        return { type: 'reply', text: cleanText(step.text) };
      })
    };
  }
  return workflow;
}

function parseIntent(text = '') {
  const value = String(text).trim();
  const intro = value.match(/(?:cr[ée]e|ajoute|fabrique|fais|configure)\s+(?:moi\s+)?(?:une\s+)?commande\s+([a-zA-Z0-9_.-]{2,40})\s+(.*)$/i);
  if (!intro) return null;
  const name = normalizeName(intro[1]);
  const body = intro[2].trim();

  let workflow = null;
  let m = body.match(/(?:qui\s+)?(?:r[ée]pond|dit|envoie)\s+(?:al[ée]atoirement|au hasard)\s+(.+)/i);
  if (m) {
    const choices = m[1].split(/\s*(?:\||;|\bou\b)\s*/i).map(x => cleanText(x)).filter(Boolean);
    workflow = { type: 'random_reply', choices };
  }

  if (!workflow) {
    m = body.match(/(?:qui\s+)?(?:envoie|fait|r[ée]pond)\s+(?:dans l['’]ordre|successivement|en s[ée]quence)\s+(.+)/i);
    if (m) {
      const parts = m[1].split(/\s*(?:\||;)\s*/).map(x => cleanText(x)).filter(Boolean);
      workflow = { type: 'sequence', steps: parts.map(part => ({ type: 'reply', text: part })) };
    }
  }

  if (!workflow) {
    m = body.match(/(?:qui\s+)?(?:r[ée]pond|dit|envoie)\s+(.+)/i);
    if (m) workflow = { type: 'reply', text: cleanText(m[1]) };
  }

  if (!workflow) return null;
  return { name, workflow: sanitizeWorkflow(workflow) };
}

function compileCommandIntent(text, { staticCommands = new Map(), aliases = new Set() } = {}) {
  const parsed = parseIntent(text);
  if (!parsed) return { ok: false, code: 'NO_INTENT', errors: ['instruction de création non reconnue'] };
  if (!NAME_RE.test(parsed.name)) return { ok: false, code: 'BAD_NAME', errors: ['nom de commande invalide'] };
  if (RESERVED.has(parsed.name)) return { ok: false, code: 'RESERVED', errors: ['nom réservé'] };
  if (staticCommands?.has?.(parsed.name) || aliases?.has?.(parsed.name)) return { ok: false, code: 'COLLISION', errors: ['une commande native ou un alias utilise déjà ce nom'] };
  const validation = validateWorkflow(parsed.workflow);
  if (!validation.ok) return { ok: false, code: 'INVALID_WORKFLOW', errors: validation.errors };
  return {
    ok: true,
    spec: parsed,
    preview: `.${parsed.name} → ${parsed.workflow.type}`
  };
}

module.exports = { compileCommandIntent, parseIntent, validateWorkflow, sanitizeWorkflow, normalizeName, RESERVED };
