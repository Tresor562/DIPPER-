'use strict';

const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const ROOT=path.join(__dirname,'..');
const handlerPath=path.join(ROOT,'handler.js');
const MARKER='[DIPPER GAME CENTER V1]';
let src=fs.readFileSync(handlerPath,'utf8');

if(!src.includes(MARKER)){
  const anchor='    // ── JEUX ACTIFS ─────────────────────────────────────────\n';
  if(!src.includes(anchor)) throw new Error('[game-center] ancre JEUX ACTIFS introuvable');
  const hook=`    // ${MARKER}\n    // Routeur unique des jeux persistants. Il ne s'active que sur messages non-commandes\n    // et retourne false si aucune partie ne reconnaît le message.\n    try {\n      if (!isCommand && !msg.key.fromMe) {\n        const gameCenter = commands.get('games');\n        if (gameCenter && typeof gameCenter.handleIncomingGameMessage === 'function') {\n          const gameExtra = await buildExtra(sock, msg, from, sender, isGroup, groupMetadata, isMe, isSuperMe, botIsAdmin, isSudo);\n          const handledGame = await gameCenter.handleIncomingGameMessage(sock, msg, gameExtra);\n          if (handledGame) return;\n        }\n      }\n    } catch (gameErr) {\n      console.error('[game-center] route error:', gameErr.message);\n    }\n\n`;
  src=src.replace(anchor,hook+anchor);
  fs.writeFileSync(handlerPath,src,'utf8');
}

for(const file of [handlerPath,path.join(ROOT,'utils','gameCenterEngine.js'),path.join(ROOT,'commands','games_entertainment','gamecenter.js')]){
  const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(r.status!==0) throw new Error(`[game-center] syntaxe invalide ${path.relative(ROOT,file)}: ${r.stderr||r.stdout}`);
}

console.log('[game-center] ✅ routeur installé/idempotent et syntaxe valide');
