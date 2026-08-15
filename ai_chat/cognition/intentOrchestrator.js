'use strict';

function norm(v='') {
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}

function stripWakeWord(text='') {
  return String(text).replace(/^\s*(?:exauc[eé]e|exa)\s*[,!:;\-]?\s*/i,'').trim();
}

function parseCommandExecution(text='') {
  const raw = stripWakeWord(text);
  const patterns = [
    /^(?:ex[eé]cute|execute|lance|utilise|fais)\s+(?:la\s+)?commande\s+[.!/]?([a-z0-9_-]{2,40})(?:\s+([\s\S]*))?$/i,
    /^(?:ex[eé]cute|execute|lance|utilise)\s+[.!/]([a-z0-9_-]{2,40})(?:\s+([\s\S]*))?$/i
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m) return { name: m[1].toLowerCase(), args: String(m[2]||'').trim().split(/\s+/).filter(Boolean) };
  }
  return null;
}

function isCreatorQuestion(text='') {
  const t = norm(stripWakeWord(text));
  return /\b(ton|ta|tes|votre|mon)\s+(createur|créateur)|\bqui\s+(?:t['’]?a|ta)\s+cree|\bqui\s+est\s+ton\s+createur|\bparle\s+(?:moi\s+)?de\s+ton\s+createur|\btresor562\b|\bprojets?\s+(?:de|du)\s+(?:ton\s+)?createur\b/.test(t);
}

function isBotIdentityQuestion(text='') {
  const t = norm(stripWakeWord(text));
  return /\b(?:quel|quelle)\s+bot\b|\bbranchee?\s+(?:a|sur)\s+(?:quel|quelle)\s+bot\b|\btu\s+es\s+(?:dans|sur|integree?\s+a)\s+(?:quel|quelle)\s+bot\b|\bquel\s+est\s+ton\s+bot\b|\btu\s+fais\s+partie\s+de\s+quel\s+bot\b/.test(t);
}

function classifyIntent(text='') {
  if (parseCommandExecution(text)) return 'command_execute';
  if (isCreatorQuestion(text)) return 'creator_knowledge';
  if (isBotIdentityQuestion(text)) return 'bot_identity';
  return 'continue';
}

module.exports = { norm, stripWakeWord, parseCommandExecution, isCreatorQuestion, isBotIdentityQuestion, classifyIntent };
