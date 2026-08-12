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
const RELAY_MARKER = '[RELAY RESPONSE WATCH]';
const PENDING_MARKER = '[PENDING RESPONSE WATCH]';
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

// Garde-fou central pour TOUS les sock.sendMessage / relayMessage des commandes.
if (!handler.includes(SEND_MARKER)) {
  const anchor = `function wrapSendMessage(sock) {\n  if (sock.__logWrapped) return;\n  sock.__logWrapped = true;\n  const _orig = sock.sendMessage.bind(sock);\n  sock.sendMessage = async (jid, payload, opts) => {\n    logOutgoing(jid, payload);`;

  const replacement = `function wrapSendMessage(sock) {\n  if (sock.__logWrapped) return;\n  sock.__logWrapped = true;\n  const _orig = sock.sendMessage.bind(sock);\n  const _origRelay = typeof sock.relayMessage === 'function' ? sock.relayMessage.bind(sock) : null;\n  const { decoratePayload } = require('./utils/responseStyle'); // ${SEND_MARKER}\n\n  // ${RELAY_MARKER}\n  // Les menus interactifs et quelques commandes Baileys utilisent relayMessage\n  // au lieu de sendMessage. Un relay réussi est une vraie réponse visible et\n  // doit donc compter pour le watchdog. Les protocol/reaction-only restent\n  // exclus afin qu'une suppression ou une réaction seule ne masque pas une\n  // commande réellement silencieuse.\n  if (_origRelay) {\n    sock.relayMessage = async (jid, message, opts) => {\n      const relayTrace = commandResponseStorage.getStore();\n      const relayIsMeaningful = !!message &&\n        typeof message === 'object' &&\n        !message.protocolMessage &&\n        !message.reactionMessage;\n      if (relayTrace && relayIsMeaningful) relayTrace.pending += 1;\n      try {\n        const result = await _origRelay(jid, message, opts);\n        if (relayTrace && relayIsMeaningful) {\n          relayTrace.responses += 1;\n          relayTrace.relays += 1;\n        }\n        return result;\n      } catch (relayErr) {\n        if (relayTrace && relayIsMeaningful) relayTrace.failures += 1;\n        throw relayErr;\n      } finally {\n        if (relayTrace && relayIsMeaningful) relayTrace.pending = Math.max(0, relayTrace.pending - 1);\n      }\n    };\n  }\n\n  sock.sendMessage = async (jid, payload, opts) => {\n    const disciplinedPayload = decoratePayload(payload);\n\n    // ${PRIVATE_MARKER}\n    // En privé, un quoted incomplet peut être accepté sans être affiché.\n    const isPrivateSend = !!jid &&\n      !jid.endsWith('@g.us') &&\n      !jid.endsWith('@broadcast') &&\n      !jid.endsWith('@newsletter');\n    let disciplinedOpts = opts;\n    if (isPrivateSend && opts?.quoted) {\n      const { quoted: _ignoredQuoted, ...restOpts } = opts;\n      disciplinedOpts = Object.keys(restOpts).length ? restOpts : undefined;\n    }\n\n    const responseTrace = commandResponseStorage.getStore();\n    const meaningfulPayload = !!disciplinedPayload &&\n      typeof disciplinedPayload === 'object' &&\n      !disciplinedPayload.react &&\n      !disciplinedPayload.delete;\n    if (responseTrace && meaningfulPayload) responseTrace.pending += 1;\n\n    logOutgoing(jid, disciplinedPayload);`;

  handler = replaceOnce(handler, anchor, replacement, 'wrapSendMessage');

  const sendAnchor = `      const result = await _orig(jid, payload, opts);`;
  const sendReplacement = `      // ${RETRY_MARKER}\n      // ${PENDING_MARKER}\n      let result;\n      try {\n        try {\n          result = await _orig(jid, disciplinedPayload, disciplinedOpts);\n        } catch (primarySendErr) {\n          if (disciplinedOpts?.quoted) {\n            const { quoted: _ignoredQuoted, ...restOpts } = disciplinedOpts;\n            const retryOpts = Object.keys(restOpts).length ? restOpts : undefined;\n            console.warn('[sendMessage] ⚠️ quoted échoué → nouvel essai sans quoted (' + jid + '): ' + primarySendErr.message);\n            result = await _orig(jid, disciplinedPayload, retryOpts);\n          } else {\n            throw primarySendErr;\n          }\n        }\n        if (responseTrace && meaningfulPayload) {\n          responseTrace.responses += 1;\n          responseTrace.sends += 1;\n        }\n      } catch (sendErr) {\n        if (responseTrace && meaningfulPayload) responseTrace.failures += 1;\n        throw sendErr;\n      } finally {\n        if (responseTrace && meaningfulPayload) responseTrace.pending = Math.max(0, responseTrace.pending - 1);\n      }`;

  handler = replaceOnce(handler, sendAnchor, sendReplacement, 'envoi central');
  console.log('[response-style] livraison robuste sendMessage + relayMessage + pending installée');
}

if (!handler.includes(PHRASE_MARKER)) {
  const anchor = `  phrases: styleManager.getPhrases(),`;
  const replacement = `  phrases: require('./utils/responseStyle').getLegacyPhrases(), // ${PHRASE_MARKER}\n  renderResponse: require('./utils/responseStyle').renderResponse,`;
  handler = replaceOnce(handler, anchor, replacement, 'phrases disciplinées');
}

// Toute commande classique est observée. Une réaction seule ne suffit pas.
if (!handler.includes(WATCH_MARKER)) {
  const anchor = `    await command.execute(sock, msg, args, extra);`;
  const replacement = `    // ${WATCH_MARKER}\n    const commandResponseTrace = {\n      command: commandName, jid: from, responses: 0, sends: 0, relays: 0, pending: 0, failures: 0\n    };\n    await commandResponseStorage.run(\n      commandResponseTrace,\n      () => command.execute(sock, msg, args, extra)\n    );\n\n    // ${PENDING_MARKER}\n    // Les anciennes commandes qui lancent sendMessage sans await ne doivent pas\n    // être déclarées silencieuses pendant que leur vrai message est encore en\n    // vol. On attend uniquement tant qu'un envoi suivi est réellement pending,\n    // avec une borne stricte de 4 secondes pour ne jamais bloquer le handler.\n    if (commandResponseTrace.responses === 0 && commandResponseTrace.pending > 0) {\n      const waitDeadline = Date.now() + 4000;\n      while (commandResponseTrace.responses === 0 &&\n             commandResponseTrace.pending > 0 &&\n             Date.now() < waitDeadline) {\n        await new Promise(resolve => setTimeout(resolve, 100));\n      }\n    }\n\n    if (commandResponseTrace.responses === 0 && command.noReply !== true) {\n      console.warn('[silent-command] ⚠️ ' + commandName + ' terminé sans réponse visible' +\n        ' (send=' + commandResponseTrace.sends +\n        ', relay=' + commandResponseTrace.relays +\n        ', pending=' + commandResponseTrace.pending +\n        ', failures=' + commandResponseTrace.failures + ')');\n      const fallbackText = typeof extra.renderResponse === 'function'\n        ? extra.renderResponse({\n            type: 'warning',\n            title: command.name || commandName,\n            body: \"La commande s'est terminée sans produire de réponse. Réessaie.\",\n            footer: true,\n          })\n        : '⚠️ ' + (command.name || commandName) + \"\\n\\nLa commande s'est terminée sans produire de réponse. Réessaie.\";\n      await sock.sendMessage(\n        from,\n        { text: fallbackText },\n        isGroup ? { quoted: msg } : undefined\n      );\n    }`;
  handler = replaceOnce(handler, anchor, replacement, 'watchdog commande');
  console.log('[response-style] watchdog anti-silence installé');
}

// Le catch global doit définir errText une seule fois. runtime-core-fix.js
// peut déjà avoir installé la déclaration avant cet installateur : dans ce
// cas on marque la déclaration existante au lieu d'en créer une seconde.
if (!handler.includes(ERROR_MARKER)) {
  const existingErrText = `    const errText = errMsgs[Math.floor(Math.random() * errMsgs.length)];`;
  if (handler.includes(existingErrText)) {
    handler = replaceOnce(
      handler,
      existingErrText,
      `${existingErrText} // ${ERROR_MARKER}`,
      'marquage errText existant'
    );
  } else {
    const anchor = `    const destJid   = msg?.key?.remoteJid;`;
    const replacement = `    const errText = errMsgs[Math.floor(Math.random() * errMsgs.length)]; // ${ERROR_MARKER}\n    const destJid   = msg?.key?.remoteJid;`;
    handler = replaceOnce(handler, anchor, replacement, 'message erreur commande');
  }
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
  RELAY_MARKER,
  PENDING_MARKER,
  PHRASE_MARKER,
  ERROR_MARKER,
  WATCH_MARKER,
  CONTEXT_MARKER,
  'commandResponseStorage.run(',
  'responseTrace.responses += 1',
  'relayTrace.responses += 1',
  'commandResponseTrace.pending > 0',
  'const errText = errMsgs[',
  "renderResponse: require('./utils/responseStyle').renderResponse",
];
for (const marker of required) {
  if (!finalHandler.includes(marker)) throw new Error(`[response-style] garde-fou absent: ${marker}`);
}

const errTextDeclarations = (finalHandler.match(/const errText\s*=\s*errMsgs\[/g) || []).length;
if (errTextDeclarations !== 1) {
  throw new Error(`[response-style] errText doit être déclaré exactement une fois, trouvé ${errTextDeclarations}`);
}

console.log('[response-style] ✅ réponses send/relay suivies; envois non-awaités attendus sans faux silence');