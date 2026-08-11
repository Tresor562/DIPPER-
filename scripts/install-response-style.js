'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const stylePath = path.join(ROOT, 'utils', 'responseStyle.js');
const marker = '[RESPONSE STYLE DISCIPLINE]';

if (!fs.existsSync(handlerPath)) throw new Error('[response-style] handler.js introuvable');
if (!fs.existsSync(stylePath)) throw new Error('[response-style] utils/responseStyle.js introuvable');

let handler = fs.readFileSync(handlerPath, 'utf8');

if (!handler.includes(marker)) {
  const anchor = `function wrapSendMessage(sock) {\n  if (sock.__logWrapped) return;\n  sock.__logWrapped = true;\n  const _orig = sock.sendMessage.bind(sock);\n  sock.sendMessage = async (jid, payload, opts) => {\n    logOutgoing(jid, payload);`;

  const replacement = `function wrapSendMessage(sock) {\n  if (sock.__logWrapped) return;\n  sock.__logWrapped = true;\n  const _orig = sock.sendMessage.bind(sock);\n  const { decoratePayload } = require('./utils/responseStyle'); // ${marker}\n  sock.sendMessage = async (jid, payload, opts) => {\n    // Garde-fou unique : les vieilles décorations sont nettoyées au dernier\n    // moment, sans toucher aux permissions, aux arguments ni à la logique.\n    const disciplinedPayload = decoratePayload(payload);\n    logOutgoing(jid, disciplinedPayload);`;

  const count = handler.split(anchor).length - 1;
  if (count !== 1) throw new Error(`[response-style] point d'insertion wrapSendMessage attendu 1 fois, trouvé ${count}`);
  handler = handler.replace(anchor, replacement);

  const sendAnchor = `      const result = await _orig(jid, payload, opts);`;
  const sendReplacement = `      const result = await _orig(jid, disciplinedPayload, opts);`;
  const sendCount = handler.split(sendAnchor).length - 1;
  if (sendCount !== 1) throw new Error(`[response-style] appel _orig attendu 1 fois, trouvé ${sendCount}`);
  handler = handler.replace(sendAnchor, sendReplacement);

  fs.writeFileSync(handlerPath, handler);
  console.log('[response-style] garde-fou visuel installé dans wrapSendMessage');
} else {
  console.log('[response-style] garde-fou visuel déjà installé');
}

for (const file of [stylePath, handlerPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[response-style] syntaxe invalide ${path.relative(ROOT, file)}: ${check.stderr || check.stdout}`);
  }
}

// Vérification ciblée : le wrapper doit envoyer le payload nettoyé, pas l'original.
const finalHandler = fs.readFileSync(handlerPath, 'utf8');
if (!finalHandler.includes('const disciplinedPayload = decoratePayload(payload);')) {
  throw new Error('[response-style] disciplinedPayload absent');
}
if (!finalHandler.includes('await _orig(jid, disciplinedPayload, opts)')) {
  throw new Error('[response-style] sendMessage ne consomme pas disciplinedPayload');
}

console.log('[response-style] ✅ installation validée');
