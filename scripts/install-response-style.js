'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const stylePath = path.join(ROOT, 'utils', 'responseStyle.js');
const sendMarker = '[RESPONSE STYLE DISCIPLINE]';
const phraseMarker = '[RESPONSE STYLE PHRASES]';
const privateSendMarker = '[PRIVATE SEND SAFETY]';
const commandErrorMarker = '[COMMAND ERROR RESPONSE]';

if (!fs.existsSync(handlerPath)) throw new Error('[response-style] handler.js introuvable');
if (!fs.existsSync(stylePath)) throw new Error('[response-style] utils/responseStyle.js introuvable');

let handler = fs.readFileSync(handlerPath, 'utf8');

if (!handler.includes(sendMarker)) {
  const anchor = `function wrapSendMessage(sock) {\n  if (sock.__logWrapped) return;\n  sock.__logWrapped = true;\n  const _orig = sock.sendMessage.bind(sock);\n  sock.sendMessage = async (jid, payload, opts) => {\n    logOutgoing(jid, payload);`;

  const replacement = `function wrapSendMessage(sock) {\n  if (sock.__logWrapped) return;\n  sock.__logWrapped = true;\n  const _orig = sock.sendMessage.bind(sock);\n  const { decoratePayload } = require('./utils/responseStyle'); // ${sendMarker}\n  sock.sendMessage = async (jid, payload, opts) => {\n    // Garde-fou unique : les vieilles décorations sont nettoyées au dernier\n    // moment, sans toucher aux permissions, aux arguments ni à la logique.\n    const disciplinedPayload = decoratePayload(payload);\n\n    // ${privateSendMarker}\n    // Baileys v6 peut accepter silencieusement un quoted incomplet en privé\n    // sans jamais afficher le message côté client. Beaucoup d'anciennes\n    // commandes appellent encore directement sendMessage(..., { quoted: msg })\n    // au lieu de extra.reply(). On neutralise donc quoted UNIQUEMENT pour les\n    // JID privés. En groupe, quoted est conservé exactement comme avant.\n    const isPrivateSend = !!jid &&\n      !jid.endsWith('@g.us') &&\n      !jid.endsWith('@broadcast') &&\n      !jid.endsWith('@newsletter');\n    let disciplinedOpts = opts;\n    if (isPrivateSend && opts?.quoted) {\n      const { quoted: _ignoredQuoted, ...restOpts } = opts;\n      disciplinedOpts = Object.keys(restOpts).length ? restOpts : undefined;\n    }\n\n    logOutgoing(jid, disciplinedPayload);`;

  const count = handler.split(anchor).length - 1;
  if (count !== 1) throw new Error(`[response-style] point d'insertion wrapSendMessage attendu 1 fois, trouvé ${count}`);
  handler = handler.replace(anchor, replacement);

  const sendAnchor = `      const result = await _orig(jid, payload, opts);`;
  const sendReplacement = `      const result = await _orig(jid, disciplinedPayload, disciplinedOpts);`;
  const sendCount = handler.split(sendAnchor).length - 1;
  if (sendCount !== 1) throw new Error(`[response-style] appel _orig attendu 1 fois, trouvé ${sendCount}`);
  handler = handler.replace(sendAnchor, sendReplacement);

  console.log('[response-style] garde-fou visuel + envoi privé sûr installés dans wrapSendMessage');
} else {
  console.log('[response-style] garde-fou visuel déjà installé');

  // Compatibilité avec un handler déjà patché par une ancienne version de
  // l'installateur : ajouter la sécurité privé sans réinstaller le garde-fou.
  if (!handler.includes(privateSendMarker)) {
    const oldAnchor = `    const disciplinedPayload = decoratePayload(payload);\n    logOutgoing(jid, disciplinedPayload);`;
    const newAnchor = `    const disciplinedPayload = decoratePayload(payload);\n\n    // ${privateSendMarker}\n    const isPrivateSend = !!jid &&\n      !jid.endsWith('@g.us') &&\n      !jid.endsWith('@broadcast') &&\n      !jid.endsWith('@newsletter');\n    let disciplinedOpts = opts;\n    if (isPrivateSend && opts?.quoted) {\n      const { quoted: _ignoredQuoted, ...restOpts } = opts;\n      disciplinedOpts = Object.keys(restOpts).length ? restOpts : undefined;\n    }\n\n    logOutgoing(jid, disciplinedPayload);`;
    const count = handler.split(oldAnchor).length - 1;
    if (count !== 1) throw new Error(`[response-style] sécurité privé: point d'insertion attendu 1 fois, trouvé ${count}`);
    handler = handler.replace(oldAnchor, newAnchor);

    const oldSend = `      const result = await _orig(jid, disciplinedPayload, opts);`;
    const newSend = `      const result = await _orig(jid, disciplinedPayload, disciplinedOpts);`;
    const sendCount = handler.split(oldSend).length - 1;
    if (sendCount !== 1) throw new Error(`[response-style] sécurité privé: appel _orig attendu 1 fois, trouvé ${sendCount}`);
    handler = handler.replace(oldSend, newSend);
    console.log('[response-style] sécurité d’envoi privé ajoutée au garde-fou existant');
  }
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

// Le catch global des commandes construisait errMsgs mais utilisait ensuite
// `errText` sans jamais le définir. La commande pouvait donc échouer puis le
// message d'erreur échouait lui-même, donnant exactement "réaction puis rien".
if (!handler.includes(commandErrorMarker)) {
  const errorAnchor = `    const destJid   = msg?.key?.remoteJid;`;
  const errorReplacement = `    const errText = errMsgs[Math.floor(Math.random() * errMsgs.length)]; // ${commandErrorMarker}\n    const destJid   = msg?.key?.remoteJid;`;
  const errorCount = handler.split(errorAnchor).length - 1;
  if (errorCount !== 1) throw new Error(`[response-style] errText: point d'insertion attendu 1 fois, trouvé ${errorCount}`);
  handler = handler.replace(errorAnchor, errorReplacement);
  console.log('[response-style] réponse d’erreur commande réparée');
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
if (!finalHandler.includes('await _orig(jid, disciplinedPayload, disciplinedOpts)')) {
  throw new Error('[response-style] sendMessage ne consomme pas disciplinedPayload/disciplininedOpts');
}
if (!finalHandler.includes(privateSendMarker) || !finalHandler.includes('if (isPrivateSend && opts?.quoted)')) {
  throw new Error('[response-style] sécurité des quoted privés absente');
}
if (!finalHandler.includes(commandErrorMarker) || !finalHandler.includes('const errText = errMsgs[')) {
  throw new Error('[response-style] réponse d’erreur commande absente');
}
if (!finalHandler.includes("getLegacyPhrases(), // [RESPONSE STYLE PHRASES]")) {
  throw new Error('[response-style] phrases disciplinées absentes');
}
if (!finalHandler.includes("renderResponse: require('./utils/responseStyle').renderResponse")) {
  throw new Error('[response-style] renderResponse absent de buildExtra');
}

console.log('[response-style] ✅ installation validée');
