'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const runtimePath = path.join(ROOT, 'utils', 'featurePackRuntime.js');
const GROUP_MARKER = '[FEATURE PACK 2026-08-16 RUNTIME]';
const PRESENCE_MARKER = '[FEATURE PACK AUTO PRESENCE]';

if (!fs.existsSync(handlerPath) || !fs.existsSync(runtimePath)) {
  throw new Error('[feature-pack] handler/runtime introuvable');
}

function linesOf(source) {
  return source.replace(/\r\n/g, '\n').split('\n');
}

function findUniqueLine(lines, predicate, label) {
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (predicate(lines[i], i)) hits.push(i);
  }
  if (hits.length !== 1) {
    const preview = lines
      .map((line, i) => ({ line, i }))
      .filter(x => /groupMetadata|botIsAdmin|ANTI-ALL|autoTyping|_senderIsAdmin|antigroupmention|handleAntilink/.test(x.line))
      .slice(0, 30)
      .map(x => `${x.i + 1}: ${x.line.trim()}`)
      .join('\n');
    throw new Error(`[feature-pack] ${label}: attendu 1 ligne, trouvé ${hits.length}${preview ? `\nRepères disponibles:\n${preview}` : ''}`);
  }
  return hits[0];
}

let src = fs.readFileSync(handlerPath, 'utf8').replace(/\r\n/g, '\n');
let lines = linesOf(src);

// @all doit être traité AVANT les premiers retours de messages non-commandes
// (notamment l'auto-reply vidéo). On l'insère juste après l'initialisation
// lazy de groupMetadata/botIsAdmin, bien avant NLP/AutoReply/protections.
if (!src.includes(GROUP_MARKER)) {
  const anchor = findUniqueLine(
    lines,
    line => /let\s+botIsAdmin\s*=\s*isCommand\s*&&\s*isGroup\s*\?\s*await\s+getBotAdmin\(\)\s*:\s*false;/.test(line),
    'ancre @all après initialisation botIsAdmin'
  );
  const indent = (lines[anchor].match(/^\s*/) || ['    '])[0];
  const block = [
    '',
    `${indent}// ${GROUP_MARKER}`,
    `${indent}// @all est un raccourci non préfixé : le traiter avant NLP/AutoReply.`,
    `${indent}if (isGroup && /^@(all|everyone)(?:\\s|$)/i.test(String(body || '').trim())) {`,
    `${indent}  if (!_groupMetadataLoaded) { groupMetadata = await getGroupMeta(); }`,
    `${indent}  const _featurePackSenderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);`,
    `${indent}  if (await require('./utils/featurePackRuntime').handleAdminAtAll({`,
    `${indent}    sock, msg, from, sender, body, groupMetadata,`,
    `${indent}    isAdmin: _featurePackSenderIsAdmin, isOwner: isMe,`,
    `${indent}  })) return;`,
    `${indent}}`,
  ];
  lines.splice(anchor + 1, 0, ...block);
  src = lines.join('\n');
}

// Présence automatique : remplacer l'ancien autoTyping ou, si un patch l'a
// déjà déplacé, s'insérer juste avant le calcul final _senderIsAdmin.
if (!src.includes(PRESENCE_MARKER)) {
  lines = linesOf(src);
  let presenceHits = [];
  for (let i = 0; i < lines.length; i++) {
    if (/config\.autoTyping/.test(lines[i]) && /sendPresenceUpdate\(['"]composing['"],\s*from\)/.test(lines[i])) presenceHits.push(i);
  }

  if (presenceHits.length === 1) {
    const i = presenceHits[0];
    const indent = (lines[i].match(/^\s*/) || ['    '])[0];
    lines.splice(i, 1,
      `${indent}// ${PRESENCE_MARKER}`,
      `${indent}await require('./utils/featurePackRuntime').applyAutoPresence(sock, from);`
    );
  } else if (src.includes('applyAutoPresence(sock, from)')) {
    const i = findUniqueLine(lines, line => line.includes('applyAutoPresence(sock, from)'), 'présence déjà installée');
    const indent = (lines[i].match(/^\s*/) || ['    '])[0];
    lines.splice(i, 0, `${indent}// ${PRESENCE_MARKER}`);
  } else {
    const i = findUniqueLine(
      lines,
      line => /const\s+_senderIsAdmin\s*=\s*isGroup\s*\?\s*await\s+isAdmin\(sock,\s*sender,\s*from,\s*groupMetadata\)\s*:\s*false;/.test(line),
      'ancre présence de secours'
    );
    const indent = (lines[i].match(/^\s*/) || ['    '])[0];
    lines.splice(i, 0,
      `${indent}// ${PRESENCE_MARKER}`,
      `${indent}await require('./utils/featurePackRuntime').applyAutoPresence(sock, from);`,
      ''
    );
  }
  src = lines.join('\n');
}

// AntiWaLink : insertion après l'appel antigroupmention. Aucun couplage avec
// la forme du patch AntiLink (ligne simple ou bloc multi-lignes).
if (!src.includes('handleAntiwalink(sock, msg, groupMetadata)')) {
  lines = linesOf(src);
  const i = findUniqueLine(
    lines,
    line => line.includes('groupSettings.antigroupmention') && line.includes('handleAntigroupmention(sock, msg, groupMetadata)'),
    'ancre AntiWaLink après antigroupmention'
  );
  const indent = (lines[i].match(/^\s*/) || ['      '])[0];
  const block = [
    `${indent}if (groupSettings.antiwalink && !msg.key.fromMe) {`,
    `${indent}  let waLinkHandled = false;`,
    `${indent}  try {`,
    `${indent}    waLinkHandled = await require('./utils/featurePackRuntime').handleAntiwalink(sock, msg, groupMetadata);`,
    `${indent}  } catch (_) {}`,
    `${indent}  if (waLinkHandled) return;`,
    `${indent}}`,
  ];
  lines.splice(i + 1, 0, ...block);
  src = lines.join('\n');
}

fs.writeFileSync(handlerPath, src, 'utf8');

for (const file of [handlerPath, runtimePath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[feature-pack] syntaxe ${path.basename(file)}: ${check.stderr || check.stdout}`);
  }
}

const final = fs.readFileSync(handlerPath, 'utf8');
for (const invariant of [
  GROUP_MARKER,
  PRESENCE_MARKER,
  'handleAdminAtAll({',
  'handleAntiwalink(sock, msg, groupMetadata)',
  'applyAutoPresence(sock, from)',
  'if (waLinkHandled) return;',
]) {
  if (!final.includes(invariant)) throw new Error('[feature-pack] invariant absent: ' + invariant);
}

for (const marker of [GROUP_MARKER, PRESENCE_MARKER]) {
  const count = final.split(marker).length - 1;
  if (count !== 1) throw new Error(`[feature-pack] marqueur dupliqué ${marker}: ${count}`);
}

// @all doit être avant le premier retour explicite réservé aux non-commandes.
const groupPos = final.indexOf(GROUP_MARKER);
const firstNonCommandReturn = final.indexOf('if (!isCommand) return;');
if (groupPos < 0 || (firstNonCommandReturn >= 0 && groupPos > firstNonCommandReturn)) {
  throw new Error(`[feature-pack] @all trop tard dans le pipeline (group=${groupPos}, firstReturn=${firstNonCommandReturn})`);
}

console.log('[feature-pack] ✅ @all avant AutoReply + présence auto + antiwalink branchés');
