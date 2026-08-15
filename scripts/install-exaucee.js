'use strict';

const fs = require('fs');
const path = require('path');

const handlerPath = path.join(process.cwd(), 'handler.js');
const CHAT_START = '    // [EXAUCEE-INTEGRATION:START]';
const CHAT_END = '    // [EXAUCEE-INTEGRATION:END]';
const DYNAMIC_START = '    // [EXAUCEE-DYNAMIC:START]';
const DYNAMIC_END = '    // [EXAUCEE-DYNAMIC:END]';

if (!fs.existsSync(handlerPath)) {
  console.error('[install-exaucee] handler.js introuvable');
  process.exit(1);
}

let source = fs.readFileSync(handlerPath, 'utf8');
let changed = false;

if (!(source.includes(CHAT_START) && source.includes(CHAT_END))) {
  const anchor = `    // ── COMMANDES CLASSIQUES ────────────────────────────────\n    if (!isCommand) return;`;
  if (!source.includes(anchor)) {
    console.error('[install-exaucee] ancre conversationnelle handler introuvable — aucune modification appliquée');
    process.exit(1);
  }

  const block = `    // [EXAUCEE-INTEGRATION:START]\n    // Exaucée intervient uniquement sur le flux non-commande. Les commandes\n    // historiques gardent donc exactement leur pipeline et leurs permissions.\n    if (!isCommand) {\n      try {\n        const { handleExauceeMessage } = require('./ai_chat/runtime');\n        const _exauceeSenderIsAdmin = Boolean(\n          isGroup && groupMetadata && await isAdmin(sock, sender, from, groupMetadata)\n        );\n        const _exauceeHandled = await handleExauceeMessage({\n          sock,\n          msg,\n          isCommand,\n          botIsAdmin,\n          actor: {\n            isOwner: isMe,\n            isSuperMe,\n            isSudo,\n            isAdmin: _exauceeSenderIsAdmin\n          },\n          extra: {\n            from, sender, isGroup, groupMetadata, botIsAdmin,\n            isMe, isSuperMe, isSudo, isAdmin: _exauceeSenderIsAdmin\n          }\n        });\n        if (_exauceeHandled) return;\n      } catch (exauceeError) {\n        // Fail-open : une panne Exaucée ne doit jamais casser THE BIG DIPPER.\n        console.error('[Exaucée] erreur runtime:', exauceeError.message);\n      }\n    }\n    // [EXAUCEE-INTEGRATION:END]\n\n    // ── COMMANDES CLASSIQUES ────────────────────────────────\n    if (!isCommand) return;`;

  source = source.replace(anchor, block);
  changed = true;
}

if (!(source.includes(DYNAMIC_START) && source.includes(DYNAMIC_END))) {
  const dynamicAnchor = `    let command = commands.get(commandName); // O(1) - aliases déjà dans la Map par commandLoader`;
  if (!source.includes(dynamicAnchor)) {
    console.error('[install-exaucee] ancre commande dynamique handler introuvable — aucune modification appliquée');
    process.exit(1);
  }

  const dynamicBlock = `${dynamicAnchor}\n\n    // [EXAUCEE-DYNAMIC:START]\n    // Une commande dynamique Exaucée n'est consultée qu'après échec de la\n    // commande statique. Elle ne peut donc jamais remplacer une commande\n    // historique de THE BIG DIPPER.\n    if (!command) {\n      try {\n        const { handleExauceeDynamicCommand } = require('./ai_chat/runtime');\n        const _exauceeDynamicHandled = await handleExauceeDynamicCommand({\n          sock, msg, commandName\n        });\n        if (_exauceeDynamicHandled) return;\n      } catch (exauceeDynamicError) {\n        console.error('[Exaucée] erreur commande dynamique:', exauceeDynamicError.message);\n      }\n    }\n    // [EXAUCEE-DYNAMIC:END]`;

  source = source.replace(dynamicAnchor, dynamicBlock);
  changed = true;
}

if (changed) {
  fs.writeFileSync(handlerPath, source);
  console.log('[install-exaucee] hooks installés avec succès');
} else {
  console.log('[install-exaucee] hooks déjà installés');
}
