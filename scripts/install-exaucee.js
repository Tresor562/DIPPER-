'use strict';

const fs = require('fs');
const path = require('path');

const handlerPath = path.join(process.cwd(), 'handler.js');
const START = '    // [EXAUCEE-INTEGRATION:START]';
const END = '    // [EXAUCEE-INTEGRATION:END]';

if (!fs.existsSync(handlerPath)) {
  console.error('[install-exaucee] handler.js introuvable');
  process.exit(1);
}

let source = fs.readFileSync(handlerPath, 'utf8');

if (source.includes(START) && source.includes(END)) {
  console.log('[install-exaucee] hook déjà installé');
  process.exit(0);
}

const anchor = `    // ── COMMANDES CLASSIQUES ────────────────────────────────\n    if (!isCommand) return;`;
if (!source.includes(anchor)) {
  console.error('[install-exaucee] ancre handler introuvable — aucune modification appliquée');
  process.exit(1);
}

const block = `    // [EXAUCEE-INTEGRATION:START]\n    // Exaucée intervient uniquement sur le flux non-commande. Les commandes\n    // historiques gardent donc exactement leur pipeline et leurs permissions.\n    if (!isCommand) {\n      try {\n        const { handleExauceeMessage } = require('./ai_chat/runtime');\n        const _exauceeSenderIsAdmin = Boolean(\n          isGroup && groupMetadata && await isAdmin(sock, sender, from, groupMetadata)\n        );\n        const _exauceeHandled = await handleExauceeMessage({\n          sock,\n          msg,\n          isCommand,\n          botIsAdmin,\n          actor: {\n            isOwner: isMe,\n            isSuperMe,\n            isSudo,\n            isAdmin: _exauceeSenderIsAdmin\n          },\n          extra: {\n            from, sender, isGroup, groupMetadata, botIsAdmin,\n            isMe, isSuperMe, isSudo, isAdmin: _exauceeSenderIsAdmin\n          }\n        });\n        if (_exauceeHandled) return;\n      } catch (exauceeError) {\n        // Fail-open : une panne Exaucée ne doit jamais casser THE BIG DIPPER.\n        console.error('[Exaucée] erreur runtime:', exauceeError.message);\n      }\n    }\n    // [EXAUCEE-INTEGRATION:END]\n\n    // ── COMMANDES CLASSIQUES ────────────────────────────────\n    if (!isCommand) return;`;

source = source.replace(anchor, block);
fs.writeFileSync(handlerPath, source);
console.log('[install-exaucee] hook installé avec succès');
