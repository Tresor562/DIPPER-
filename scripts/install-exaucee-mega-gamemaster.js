'use strict';

const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..');
const runtimePath=path.join(ROOT,'ai_chat','runtime.js');
const MARK='[EXAUCEE MEGA GAMEMASTER V3]';
let src=fs.readFileSync(runtimePath,'utf8');

if(!src.includes(MARK)){
  const importAnchor="const { handleAdvancedGames } = require('./games/advancedRuntime');";
  if(!src.includes(importAnchor)) throw new Error('[mega-gamemaster] advanced runtime import introuvable');
  src=src.replace(importAnchor,`${importAnchor}\nconst { handleMegaGameMaster } = require('./games/megaGameRuntime'); // ${MARK}`);

  const schedulerOld=`function ensureScheduler(exaucee, sock) {\n  exaucee.scheduler.ensureRunner(async dueTask => {\n    if (dueTask.action?.type !== 'send_message') return null;\n    const out = await sock.sendMessage(dueTask.action.chatId, { text: \`🌸 \${sanitizeModelText(dueTask.action.text)}\` });\n    exaucee.markOwnMessage(out?.key?.id);\n    return { messageId: out?.key?.id || null };\n  });\n}`;
  const schedulerNew=`function ensureScheduler(exaucee, sock) {\n  exaucee.scheduler.ensureRunner(async dueTask => {\n    if (dueTask.action?.type === 'game_event') {\n      return exaucee.tournamentDirector.handleScheduledTask(dueTask, {\n        send: async (chatId, text) => {\n          const out = await sock.sendMessage(chatId, { text: sanitizeModelText(text) });\n          exaucee.markOwnMessage(out?.key?.id);\n          return out;\n        }\n      });\n    }\n    if (dueTask.action?.type !== 'send_message') return null;\n    const out = await sock.sendMessage(dueTask.action.chatId, { text: \`🌸 \${sanitizeModelText(dueTask.action.text)}\` });\n    exaucee.markOwnMessage(out?.key?.id);\n    return { messageId: out?.key?.id || null };\n  });\n}`;
  if(!src.includes(schedulerOld)) throw new Error('[mega-gamemaster] ensureScheduler anchor introuvable');
  src=src.replace(schedulerOld,schedulerNew);

  const hook=`  if (await handleAdvancedGames(exaucee, {\n    sock, msg, chatId, userId, text: routed.text,\n    send: value => sendExaucee(sock, exaucee, chatId, msg, value)\n  })) return true;`;
  if(!src.includes(hook)) throw new Error('[mega-gamemaster] advanced hook introuvable');
  const mega=`  if (await handleMegaGameMaster(exaucee, {\n    sock, msg, chatId, userId, text: routed.text, actor,\n    send: value => sendExaucee(sock, exaucee, chatId, msg, value)\n  })) return true;\n\n${hook}`;
  src=src.replace(hook,mega);
  fs.writeFileSync(runtimePath,src,'utf8');
}

for(const rel of ['ai_chat/runtime.js','ai_chat/core/index.js','ai_chat/games/tournamentDirector.js','ai_chat/games/gameDesigner.js','ai_chat/games/megaGameRuntime.js']){
  const r=spawnSync(process.execPath,['--check',path.join(ROOT,rel)],{encoding:'utf8'});
  if(r.status!==0)throw new Error(`[mega-gamemaster] syntaxe invalide ${rel}: ${r.stderr||r.stdout}`);
}
console.log('[exaucee-mega-gamemaster] ✅ événements, scheduler, inscriptions, classements et récompenses V3 installés');
