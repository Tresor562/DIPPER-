'use strict';

const fs = require('fs');
const path = require('path');

const handlerPath = path.join(process.cwd(), 'handler.js');
const indexPath = path.join(process.cwd(), 'index.js');
const CHAT_START = '    // [EXAUCEE-INTEGRATION:START]';
const CHAT_END = '    // [EXAUCEE-INTEGRATION:END]';
const DYNAMIC_START = '    // [EXAUCEE-DYNAMIC:START]';
const DYNAMIC_END = '    // [EXAUCEE-DYNAMIC:END]';
const BOOT_START = '      // [EXAUCEE-BOOTSTRAP:START]';
const BOOT_END = '      // [EXAUCEE-BOOTSTRAP:END]';

if (!fs.existsSync(handlerPath) || !fs.existsSync(indexPath)) {
  console.error('[install-exaucee] handler.js ou index.js introuvable');
  process.exit(1);
}

let handlerSource = fs.readFileSync(handlerPath, 'utf8');
let handlerChanged = false;

if (!(handlerSource.includes(CHAT_START) && handlerSource.includes(CHAT_END))) {
  const anchor = `    // ── COMMANDES CLASSIQUES ────────────────────────────────\n    if (!isCommand) return;`;
  if (!handlerSource.includes(anchor)) {
    console.error('[install-exaucee] ancre conversationnelle handler introuvable — aucune modification appliquée');
    process.exit(1);
  }

  const block = `    // [EXAUCEE-INTEGRATION:START]\n    // Exaucée intervient uniquement sur le flux non-commande. Les commandes\n    // historiques gardent donc exactement leur pipeline et leurs permissions.\n    if (!isCommand) {\n      try {\n        const { handleExauceeMessage } = require('./ai_chat/runtime');\n        const _exauceeSenderIsAdmin = Boolean(\n          isGroup && groupMetadata && await isAdmin(sock, sender, from, groupMetadata)\n        );\n        const _exauceeHandled = await handleExauceeMessage({\n          sock,\n          msg,\n          isCommand,\n          botIsAdmin,\n          actor: {\n            isOwner: isMe,\n            isSuperMe,\n            isSudo,\n            isAdmin: _exauceeSenderIsAdmin\n          },\n          extra: {\n            from, sender, isGroup, groupMetadata, botIsAdmin,\n            isMe, isSuperMe, isSudo, isAdmin: _exauceeSenderIsAdmin\n          }\n        });\n        if (_exauceeHandled) return;\n      } catch (exauceeError) {\n        console.error('[Exaucée] erreur runtime:', exauceeError.message);\n      }\n    }\n    // [EXAUCEE-INTEGRATION:END]\n\n    // ── COMMANDES CLASSIQUES ────────────────────────────────\n    if (!isCommand) return;`;

  handlerSource = handlerSource.replace(anchor, block);
  handlerChanged = true;
}

if (!(handlerSource.includes(DYNAMIC_START) && handlerSource.includes(DYNAMIC_END))) {
  const dynamicAnchor = `    let command = commands.get(commandName); // O(1) - aliases déjà dans la Map par commandLoader`;
  if (!handlerSource.includes(dynamicAnchor)) {
    console.error('[install-exaucee] ancre commande dynamique handler introuvable — aucune modification appliquée');
    process.exit(1);
  }

  const dynamicBlock = `${dynamicAnchor}\n\n    // [EXAUCEE-DYNAMIC:START]\n    // Une commande dynamique Exaucée n'est consultée qu'après échec de la\n    // commande statique. Elle ne peut donc jamais remplacer une commande\n    // historique de THE BIG DIPPER.\n    if (!command) {\n      try {\n        const { handleExauceeDynamicCommand } = require('./ai_chat/runtime');\n        const _exauceeDynamicHandled = await handleExauceeDynamicCommand({\n          sock, msg, commandName\n        });\n        if (_exauceeDynamicHandled) return;\n      } catch (exauceeDynamicError) {\n        console.error('[Exaucée] erreur commande dynamique:', exauceeDynamicError.message);\n      }\n    }\n    // [EXAUCEE-DYNAMIC:END]`;

  handlerSource = handlerSource.replace(dynamicAnchor, dynamicBlock);
  handlerChanged = true;
}

let indexSource = fs.readFileSync(indexPath, 'utf8');
let indexChanged = false;

if (!(indexSource.includes(BOOT_START) && indexSource.includes(BOOT_END))) {
  const bootAnchor = `    } else if (connection === 'open') {\n      botReadyTime      = Date.now();\n      reconnectAttempts = 0;`;
  if (!indexSource.includes(bootAnchor)) {
    console.error('[install-exaucee] ancre bootstrap index introuvable — aucune modification appliquée');
    process.exit(1);
  }

  const bootBlock = `    } else if (connection === 'open') {\n      botReadyTime      = Date.now();\n      reconnectAttempts = 0;\n\n      // [EXAUCEE-BOOTSTRAP:START]\n      // Démarre immédiatement le scheduler persistant après reconnexion afin\n      // que les rappels dus repartent sans attendre un nouveau message.\n      try {\n        const { bootstrapExaucee } = require('./ai_chat/runtime');\n        bootstrapExaucee({ sock, sessionId: sessionContext.DEFAULT_SESSION_ID });\n      } catch (exauceeBootstrapError) {\n        console.error('[Exaucée] erreur bootstrap:', exauceeBootstrapError.message);\n      }\n      // [EXAUCEE-BOOTSTRAP:END]`;

  indexSource = indexSource.replace(bootAnchor, bootBlock);
  indexChanged = true;
}

if (handlerChanged) fs.writeFileSync(handlerPath, handlerSource);
if (indexChanged) fs.writeFileSync(indexPath, indexSource);

if (handlerChanged || indexChanged) {
  console.log('[install-exaucee] hooks installés avec succès');
} else {
  console.log('[install-exaucee] hooks déjà installés');
}
