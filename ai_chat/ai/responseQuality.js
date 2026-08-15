'use strict';

function norm(text='') {
  return String(text)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9à-ÿ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set('le la les un une des de du d et ou a à au aux en pour par sur dans avec sans ce cet cette ces je tu il elle on nous vous ils elles mon ma mes ton ta tes son sa ses qui que quoi est sont etre être avoir ai as a avons avez ont me te se y ne pas plus tres très comme'.split(/\s+/));

function tokens(text='') {
  return new Set(norm(text).split(' ').filter(w => w.length > 2 && !STOP.has(w)));
}

function similarity(a='', b='') {
  const A=tokens(a), B=tokens(b);
  if (!A.size || !B.size) return norm(a) === norm(b) && norm(a) ? 1 : 0;
  let same=0;
  for (const w of A) if (B.has(w)) same++;
  return same / Math.max(A.size, B.size);
}

const GENERIC_PATTERNS = [
  /continue,? je suis le fil/i,
  /donne[- ]moi (?:un peu )?plus de contexte/i,
  /je ne veux pas te répondre au hasard/i,
  /mon noyau local n['’]a pas assez d['’]information/i,
  /si tu veux que j['’]agisse dessus/i,
  /je vois où tu veux en venir/i
];

function topicalOverlap(candidate='', userText='') {
  const C=tokens(candidate), U=tokens(userText);
  if (!U.size) return 1;
  let same=0;
  for (const w of U) if (C.has(w)) same++;
  return same / U.size;
}

function isLowQualityResponse({ candidate='', userText='', recentAssistant=[] }={}) {
  const text=String(candidate||'').trim();
  if (!text || text.length < 2) return true;
  if (GENERIC_PATTERNS.some(re => re.test(text)) && String(userText||'').trim().length > 8) return true;
  for (const prev of recentAssistant || []) {
    if (similarity(text, prev) >= 0.82) return true;
  }
  const u=String(userText||'').trim();
  if (u.length >= 18 && /[?]/.test(u) && text.length >= 80 && topicalOverlap(text,u) === 0) return true;
  return false;
}

module.exports={ norm, tokens, similarity, topicalOverlap, isLowQualityResponse };
