'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const stylePath = path.join(ROOT, 'utils', 'responseStyle.js');

const SEND_MARKER = '[RESPONSE STYLE DISCIPLINE]';
const PHRASE_MARKER = '[RESPONSE STYLE PHRASES]';
const PRIVATE_MARKER = '[PRIVATE SEND SAFETY]';
const RETRY_MARKER = '[QUOTED SEND RETRY]';
const ERROR_MARKER = '[COMMAND ERROR RESPONSE]';
const WATCH_MARKER = '[COMMAND RESPONSE WATCHDOG]';
const CONTEXT_MARKER = '[COMMAND RESPONSE CONTEXT]';

if (!fs.existsSync(handlerPath)) throw new Error('[response-style] handler.js introuvable');
if (!fs.existsSync(stylePath)) throw new Error('[response-style] utils/responseStyle.js introuvable');

let handler = fs.readFileSync(handlerPath, 'utf8');

function replaceOnce(source, anchor, replacement, label) {
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`[response-style] ${label}: attendu 1 occurrence, trouvé ${count}`);
  return source.replace(anchor, replacement);
}

// Suivi isolé par exécution de commande, compatible avec plusieurs messages
// traités en parallèle sur le même socket.
if (!handler.includes(CONTEXT_MARKER)) {
  const anchor = "const axios = require('axios');";
  const replacement = `${anchor}\nconst { AsyncLocalStorage } = require('async_hooks'); // ${CONTEXT_MARKER}\nconst commandResponseStorage = new AsyncLocalStorage();`;
  handler = replaceOnce(handler, anchor, replacement, 'import AsyncLocalStorage');
}

// Garde-fou central pour TOUS les sock.sendMessage des commandes.
if (!handler.includes(SEND_MARKER)) {
  const anchor = `function wrapSendMessage(sock) {\n  if (sock.__logWrapped) return;\n  sock.__logWrapped = true;\n  const _orig = sock.sendMessage.bind(sock);\n  sock.sendMessage = async (jid, payload, opts) => {\n    logOutgoing(jid, payload);`;

  const replacement = `function wrapSendMessage(sock) {\n  if (sock.__logWrapped) return;\n  sock.__logWrapped = true;\n  const _orig = sock.sendMessage.bind(sock);\n  const { decoratePayload } = require('./utils/responseStyle'); // ${SEND_MARKER}\n  sock.sendMessage = async (jid, payload, opts) => {\n    const disciplinedPayload = decoratePayload(payload);\n\n    // ${PRIVATE_MARKER}\n    // En privé, un quoted incomplet peut être accepté sans être affiché.\n    const isPrivateSend = !!jid &&\n      !jid.endsWith('@g.us') &&\n      !jid.endsWith('@broadcast') &&\n      !jid.endsWith('@newsletter');\n    let disciplinedOpts = opts;\n    if (isPrivateSend && opts?.quoted) {\n      const { quoted: _ignoredQuoted, ...restOpts } = opts;\n      disciplinedOpts = Object.keys(restOpts).length ? restOpts : undefined;\n    }\n\n    const responseTrace = commandResponseStorage.getStore();\n    const meaningfulPayload = !!disciplinedPayload &&\n      typeof disciplinedPayload === 'object' &&\n      !disciplinedPayload.react &&\n      !disciplinedPayload.delete;\n\n    logOutgoing(jid, disciplinedPayload);`;

  handler = replaceOnce(handler, anchor, replacement, 'wrapSendMessage');

  const sendAnchor = `      const result = await _orig(jid, payload, opts);`;
  const sendReplacement = `      // ${RETRY_MARKER}\n      let result;\n      try {\n        result = await _orig(jid, disciplinedPayload, disciplinedOpts);\n      } catch (primarySendErr) {\n        if (disciplinedOpts?.quoted) {\n          const { quoted: _ignoredQuoted, ...restOpts } = disciplinedOpts;\n          const retryOpts = Object.keys(restOpts).length ? restOpts : undefined;\n          console.warn('[sendMessage] ⚠️ quoted échoué → nouvel essai sans quoted (' + jid + '): ' + primarySendErr.message);\n          result = await _orig(jid, disciplinedPayload, retryOpts);\n        } else {\n          throw primarySendErr;\n        }\n      }\n      if (responseTrace && meaningfulPayload) responseTrace.responses += 1;`;

  handler = replaceOnce(handler, sendAnchor, sendReplacement, 'envoi central');
  console.log('[response-style] livraison robuste installée');
}

if (!handler.includes(PHRASE_MARKER)) {
  const anchor = `  phrases: styleManager.getPhrases(),`;
  const replacement = `  phrases: require('./utils/responseStyle').getLegacyPhrases(), // ${PHRASE_MARKER}\n  renderResponse: require('./utils/responseStyle').renderResponse,`;
  handler = replaceOnce(handler, anchor, replacement, 'phrases disciplinées');
}

// Toute commande classique est observée. Une réaction seule ne suffit pas.
if (!handler.includes(WATCH_MARKER)) {
  const anchor = `    await command.execute(sock, msg, args, extra);`;
  const replacement = `    // ${WATCH_MARKER}\n    const commandResponseTrace = { command: commandName, jid: from, responses: 0 };\n    await commandResponseStorage.run(\n      commandResponseTrace,\n      () => command.execute(sock, msg, args, extra)\n    );\n\n    // Tolère brièvement les anciennes commandes qui lancent un envoi sans await.\n    if (commandResponseTrace.responses === 0) {\n      await new Promise(resolve => setTimeout(resolve, 250));\n    }\n\n    if (commandResponseTrace.responses === 0 && command.noReply !== true) {\n      console.warn('[silent-command] ⚠️ ' + commandName + ' terminé sans réponse visible');\n      const fallbackText = typeof extra.renderResponse === 'function'\n        ? extra.renderResponse({\n            type: 'warning',\n            title: command.name || commandName,\n            body: \"La commande s'est terminée sans produire de réponse. Réessaie.\",\n            footer: true,\n          })\n        : '⚠️ ' + (command.name || commandName) + \"\\n\\nLa commande s'est terminée sans produire de réponse. Réessaie.\";\n      await sock.sendMessage(\n        from,\n        { text: fallbackText },\n        isGroup ? { quoted: msg } : undefined\n      );\n    }`;
  handler = replaceOnce(handler, anchor, replacement, 'watchdog commande');
  console.log('[response-style] watchdog anti-silence installé');
}

// Le catch global utilisait errText sans l'avoir défini.
if (!handler.includes(ERROR_MARKER)) {
  const anchor = `    const destJid   = msg?.key?.remoteJid;`;
  const replacement = `    const errText = errMsgs[Math.floor(Math.random() * errMsgs.length)]; // ${ERROR_MARKER}\n    const destJid   = msg?.key?.remoteJid;`;
  handler = replaceOnce(handler, anchor, replacement, 'message erreur commande');
}

fs.writeFileSync(handlerPath, handler);

for (const file of [stylePath, handlerPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[response-style] syntaxe invalide ${path.relative(ROOT, file)}: ${check.stderr || check.stdout}`);
  }
}

const finalHandler = fs.readFileSync(handlerPath, 'utf8');
const required = [
  SEND_MARKER,
  PRIVATE_MARKER,
  RETRY_MARKER,
  PHRASE_MARKER,
  ERROR_MARKER,
  WATCH_MARKER,
  CONTEXT_MARKER,
  'commandResponseStorage.run(',
  'responseTrace.responses += 1',
  'const errText = errMsgs[',
  "renderResponse: require('./utils/responseStyle').renderResponse",
];
for (const marker of required) {
  if (!finalHandler.includes(marker)) throw new Error(`[response-style] garde-fou absent: ${marker}`);
}

console.log('[response-style] ✅ réponses silencieuses protégées');
