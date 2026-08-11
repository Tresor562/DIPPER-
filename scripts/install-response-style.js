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
const retryMarker = '[QUOTED SEND RETRY]';
const commandErrorMarker = '[COMMAND ERROR RESPONSE]';
const responseWatchMarker = '[COMMAND RESPONSE WATCHDOG]';
const asyncContextMarker = '[COMMAND RESPONSE CONTEXT]';

if (!fs.existsSync(handlerPath)) throw new Error('[response-style] handler.js introuvable');
if (!fs.existsSync(stylePath)) throw new Error('[response-style] utils/responseStyle.js introuvable');

let handler = fs.readFileSync(handlerPath, 'utf8');

// Isolation par exécution de commande : contrairement à une variable globale,
// AsyncLocalStorage reste correcte si plusieurs messages sont traités en parallèle.
if (!handler.includes(asyncContextMarker)) {
  const importAnchor = "const axios = require('axios');";
  const importReplacement = `${importAnchor}\nconst { AsyncLocalStorage } = require('async_hooks'); // ${asyncContextMarker}\nconst commandResponseStorage = new AsyncLocalStorage();`;
  const importCount = handler.split(importAnchor).length - 1;
  if (importCount !== 1) throw new Error(`[response-style] import async context attendu 1 fois, trouvé ${importCount}`);
  handler = handler.replace(importAnchor, importReplacement);
  console.log('[response-style] contexte de suivi des réponses installé');
}

if (!handler.includes(sendMarker)) {
  const anchor = `function wrapSendMessage(sock) {\n  if (sock.__logWrapped) return;\n  sock.__logWrapped = true;\n  const _orig = sock.sendMessage.bind(sock);\n  sock.sendMessage = async (jid, payload, opts) => {\n    logOutgoing(jid, payload);`;

  const replacement = `function wrapSendMessage(sock) {\n  if (sock.__logWrapped) return;\n  sock.__logWrapped = true;\n  const _orig = sock.sendMessage.bind(sock);\n  const { decoratePayload } = require('./utils/responseStyle'); // ${sendMarker}\n  sock.sendMessage = async (jid, payload, opts) => {\n    const disciplinedPayload = decoratePayload(payload);\n\n    // ${privateSendMarker}\n    // En privé, ne jamais transmettre un quoted incomplet à Baileys.\n    const isPrivateSend = !!jid &&\n      !jid.endsWith('@g.us') &&\n      !jid.endsWith('@broadcast') &&\n      !jid.endsWith('@newsletter');\n    let disciplinedOpts = opts;\n    if (isPrivateSend && opts?.quoted) {\n      const { quoted: _ignoredQuoted, ...restOpts } = opts;\n      disciplinedOpts = Object.keys(restOpts).length ? restOpts : undefined;\n    }\n\n    // Une réaction ou une suppression ne compte pas comme réponse visible à\n    // une commande. Tout autre payload réellement envoyé compte.\n    const responseTrace = commandResponseStorage.getStore();\n    const meaningfulPayload = !!disciplinedPayload &&\n      typeof disciplinedPayload === 'object' &&\n      !disciplinedPayload.react &&\n      !disciplinedPayload.delete;\n\n    logOutgoing(jid, disciplinedPayload);`;

  const count = handler.split(anchor).length - 1;
  if (count !== 1) throw new Error(`[response-style] point d'insertion wrapSendMessage attendu 1 fois, trouvé ${count}`);
  handler = handler.replace(anchor, replacement);

  const sendAnchor = `      const result = await _orig(jid, payload, opts);`;
  const sendReplacement = `      // ${retryMarker}\n      // Si un quoted de groupe provoque un rejet, réessayer UNE fois sans\n      // quoted. Les commandes historiques profitent ainsi du même fallback\n      // que extra.reply(), sans modifier leur logique métier.\n      let result;\n      try {\n        result = await _orig(jid, disciplinedPayload, disciplinedOpts);\n      } catch (primarySendErr) {\n        if (disciplinedOpts?.quoted) {\n          const { quoted: _ignoredQuoted, ...restOpts } = disciplinedOpts;\n          const retryOpts = Object.keys(restOpts).length ? restOpts : undefined;\n          console.warn(\`[sendMessage] ⚠️ quoted échoué → nouvel essai sans quoted (${jid}): ${primarySendErr.message}\`);\n          result = await _orig(jid, disciplinedPayload, retryOpts);\n        } else {\n          throw primarySendErr;\n        }\n      }\n      if (responseTrace && meaningfulPayload) responseTrace.responses += 1;`;
  const sendCount = handler.split(sendAnchor).length - 1;
  if (sendCount !== 1) throw new Error(`[response-style] appel _orig attendu 1 fois, trouvé ${sendCount}`);
  handler = handler.replace(sendAnchor, sendReplacement);

  console.log('[response-style] garde-fou visuel + livraison robuste installés dans wrapSendMessage');
} else {
  console.log('[response-style] garde-fou visuel déjà installé');

  // Compatibilité si ce script est exécuté sur un handler déjà patché par une
  // version précédente de l'installateur.
  if (!handler.includes(privateSendMarker)) {
    const oldAnchor = `    const disciplinedPayload = decoratePayload(payload);\n    logOutgoing(jid, disciplinedPayload);`;
    const newAnchor = `    const disciplinedPayload = decoratePayload(payload);\n\n    // ${privateSendMarker}\n    const isPrivateSend = !!jid &&\n      !jid.endsWith('@g.us') &&\n      !jid.endsWith('@broadcast') &&\n      !jid.endsWith('@newsletter');\n    let disciplinedOpts = opts;\n    if (isPrivateSend && opts?.quoted) {\n      const { quoted: _ignoredQuoted, ...restOpts } = opts;\n      disciplinedOpts = Object.keys(restOpts).length ? restOpts : undefined;\n    }\n    const responseTrace = commandResponseStorage.getStore();\n    const meaningfulPayload = !!disciplinedPayload && typeof disciplinedPayload === 'object' &&\n      !disciplinedPayload.react && !disciplinedPayload.delete;\n\n    logOutgoing(jid, disciplinedPayload);`;
    const count = handler.split(oldAnchor).length - 1;
    if (count !== 1) throw new Error(`[response-style] sécurité privé: point d'insertion attendu 1 fois, trouvé ${count}`);
    handler = handler.replace(oldAnchor, newAnchor);
  }

  if (!handler.includes(retryMarker)) {
    const candidates = [
      `      const result = await _orig(jid, disciplinedPayload, disciplinedOpts);`,
      `      const result = await _orig(jid, disciplinedPayload, opts);`,
    ];
    const existing = candidates.find(candidate => handler.includes(candidate));
    if (!existing) throw new Error('[response-style] ancien appel _orig introuvable pour installer le retry');
    const replacement = `      // ${retryMarker}\n      let result;\n      try {\n        result = await _orig(jid, disciplinedPayload, disciplinedOpts);\n      } catch (primarySendErr) {\n        if (disciplinedOpts?.quoted) {\n          const { quoted: _ignoredQuoted, ...restOpts } = disciplinedOpts;\n          const retryOpts = Object.keys(restOpts).length ? restOpts : undefined;\n          console.warn(\`[sendMessage] ⚠️ quoted échoué → nouvel essai sans quoted (${jid}): ${primarySendErr.message}\`);\n          result = await _orig(jid, disciplinedPayload, retryOpts);\n        } else {\n          throw primarySendErr;\n        }\n      }\n      if (responseTrace && meaningfulPayload) responseTrace.responses += 1;`;
    handler = handler.replace(existing, replacement);
    console.log('[response-style] retry global sans quoted ajouté');
  }
}

if (!handler.includes(phraseMarker)) {
  const phraseAnchor = `  phrases: styleManager.getPhrases(),`;
  const phraseReplacement = `  phrases: require('./utils/responseStyle').getLegacyPhrases(), // ${phraseMarker}\n  renderResponse: require('./utils/responseStyle').renderResponse,`;
  const phraseCount = handler.split(phraseAnchor).length - 1;
  if (phraseCount !== 1) throw new Error(`[response-style] injection phrases attendue 1 fois, trouvée ${phraseCount}`);
  handler = handler.replace(phraseAnchor, phraseReplacement);
  console.log('[response-style] phrases disciplinées injectées dans buildExtra');
}

// Si une commande se termine sans aucun message texte/média, le bot ne doit
// plus laisser l'utilisateur avec seulement la réaction de réception.
if (!handler.includes(responseWatchMarker)) {
  const commandAnchor = `    await command.execute(sock, msg, args, extra);`;
  const commandReplacement = `    // ${responseWatchMarker}\n    const commandResponseTrace = { command: commandName, jid: from, responses: 0 };\n    await commandResponseStorage.run(\n      commandResponseTrace,\n      () => command.execute(sock, msg, args, extra)\n    );\n\n    // Quelques anciennes commandes lancent encore un envoi sans l'attendre.\n    // Une courte grâce permet à ce message de partir avant de conclure au silence.\n    if (commandResponseTrace.responses === 0) {\n      await new Promise(resolve => setTimeout(resolve, 250));\n    }\n\n    if (commandResponseTrace.responses === 0 && command.noReply !== true) {\n      console.warn(\`[silent-command] ⚠️ ${commandName} terminé sans réponse visible → fallback envoyé\`);\n      const fallbackText = typeof extra.renderResponse === 'function'\n        ? extra.renderResponse({\n            type: 'warning',\n            title: command.name || commandName,\n            body: \"La commande s'est terminée sans produire de réponse. Réessaie.\",\n            footer: true,\n          })\n        : `⚠️ ${command.name || commandName}\\n\\nLa commande s'est terminée sans produire de réponse. Réessaie.`;\n      await sock.sendMessage(\n        from,\n        { text: fallbackText },\n        isGroup ? { quoted: msg } : undefined\n      );\n    }`;
  const commandCount = handler.split(commandAnchor).length - 1;
  if (commandCount !== 1) throw new Error(`[response-style] execute principal attendu 1 fois, trouvé ${commandCount}`);
  handler = handler.replace(commandAnchor, commandReplacement);
  console.log('[response-style] watchdog anti-réaction-sans-réponse installé');
}

// Le catch global construisait errMsgs mais utilisait errText sans le définir.
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
const required = [
  sendMarker,
  privateSendMarker,
  retryMarker,
  phraseMarker,
  commandErrorMarker,
  responseWatchMarker,
  asyncContextMarker,
  'commandResponseStorage.run(',
  'responseTrace.responses += 1',
  'const errText = errMsgs[',
  "renderResponse: require('./utils/responseStyle').renderResponse",
];
for (const marker of required) {
  if (!finalHandler.includes(marker)) throw new Error(`[response-style] garde-fou final absent: ${marker}`);
}

console.log('[response-style] ✅ livraison + réponses silencieuses protégées');
