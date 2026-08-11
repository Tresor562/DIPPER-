'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const stylePath = path.join(ROOT, 'utils', 'responseStyle.js');
const sendMarker = '[RESPONSE STYLE DISCIPLINE]';
const phraseMarker = '[RESPONSE STYLE PHRASES]';

if (!fs.existsSync(handlerPath)) throw new Error('[response-style] handler.js introuvable');
if (!fs.existsSync(stylePath)) throw new Error('[response-style] utils/responseStyle.js introuvable');

let handler = fs.readFileSync(handlerPath, 'utf8');

if (!handler.includes(sendMarker)) {
  const anchor = `function wrapSendMessage(sock) {\n  if (sock.__logWrapped) return;\n  sock.__logWrapped = true;\n  const _orig = sock.sendMessage.bind(sock);\n  sock.sendMessage = async (jid, payload, opts) => {\n    logOutgoing(jid, payload);`;

  const replacement = `function wrapSendMessage(sock) {\n  if (sock.__logWrapped) return;\n  sock.__logWrapped = true;\n  const _orig = sock.sendMessage.bind(sock);\n  const { decoratePayload } = require('./utils/responseStyle'); // ${sendMarker}\n  sock.sendMessage = async (jid, payload, opts) => {\n    // Garde-fou unique : les vieilles décorations sont nettoyées au dernier\n    // moment, sans toucher aux permissions, aux arguments ni à la logique.\n    const disciplinedPayload = decoratePayload(payload);\n    logOutgoing(jid, disciplinedPayload);`;

  const count = handler.split(anchor).length - 1;
  if (count !== 1) throw new Error(`[response-style] point d'insertion wrapSendMessage attendu 1 fois, trouvé ${count}`);
  handler = handler.replace(anchor, replacement);

  const sendAnchor = `      const result = await _orig(jid, payload, opts);`;
  const sendReplacement = `      const result = await _orig(jid, disciplinedPayload, opts);`;
  const sendCount = handler.split(sendAnchor).length - 1;
  if (sendCount !== 1) throw new Error(`[response-style] appel _orig attendu 1 fois, trouvé ${sendCount}`);
  handler = handler.replace(sendAnchor, sendReplacement);

  console.log('[response-style] garde-fou visuel installé dans wrapSendMessage');
} else {
  console.log('[response-style] garde-fou visuel déjà installé');
}

if (!handler.includes(phraseMarker)) {
  const phraseAnchor = `  phrases: styleManager.getPhrases(),`;
  const phraseReplacement = `  phrases: require('./utils/responseStyle').getLegacyPhrases(), // ${phraseMarker}\n  renderResponse: require('./utils/responseStyle').renderResponse,`;
  const phraseCount = handler.split(phraseAnchor).length - 1;
  if (phraseCount !== 1) throw new Error(`[response-style] injection phrases attendue 1 fois, trouvée ${phraseCount}`);
  handler = handler.replace(phraseAnchor, phraseReplacement);
  console.log('[response-style] phrases disciplinées injectées dans buildExtra');
} else {
  console.log('[response-style] phrases disciplinées déjà injectées');
}

fs.writeFileSync(handlerPath, handler);

for (const file of [stylePath, handlerPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[response-style] syntaxe invalide ${path.relative(ROOT, file)}: ${check.stderr || check.stdout}`);
  }
}

const finalHandler = fs.readFileSync(handlerPath, 'utf8');
if (!finalHandler.includes('const disciplinedPayload = decoratePayload(payload);')) {
  throw new Error('[response-style] disciplinedPayload absent');
}
if (!finalHandler.includes('await _orig(jid, disciplinedPayload, opts)')) {
  throw new Error('[response-style] sendMessage ne consomme pas disciplinedPayload');
}
if (!finalHandler.includes("getLegacyPhrases(), // [RESPONSE STYLE PHRASES]")) {
  throw new Error('[response-style] phrases disciplinées absentes');
}
if (!finalHandler.includes("renderResponse: require('./utils/responseStyle').renderResponse")) {
  throw new Error('[response-style] renderResponse absent de buildExtra');
}

console.log('[response-style] ✅ installation validée');
