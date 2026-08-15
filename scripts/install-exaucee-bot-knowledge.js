'use strict';

const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..');
const runtimePath=path.join(ROOT,'ai_chat','runtime.js');
const MARKER='[EXAUCEE BOT KNOWLEDGE V1]';
let src=fs.readFileSync(runtimePath,'utf8');
if(src.includes(MARKER)){console.log('[install-exaucee-bot-knowledge] déjà appliqué');process.exit(0);}

const anchor=`  // [EXAUCEE RESEARCH V1]\n  let researchReport = null;`;
if(!src.includes(anchor))throw new Error('[install-exaucee-bot-knowledge] ancre research introuvable');
const block=`  // ${MARKER}\n  const botKnowledgeContext = exaucee.botKnowledge?.buildContext?.(routed.text, {\n    sessionId,\n    groupId: chatId.endsWith('@g.us') ? chatId : null\n  }) || '';\n  if (botKnowledgeContext) {\n    messages.splice(Math.max(1, messages.length - 1), 0, {\n      role: 'system',\n      content: botKnowledgeContext\n    });\n    exaucee.audit.write({ type: 'bot_knowledge', chatId, userId, matched: true });\n  }\n\n  // [EXAUCEE RESEARCH V1]\n  let researchReport = null;`;
src=src.replace(anchor,block);

const fallbackAnchor=`  if (researchReport?.results?.length) {`;
if(!src.includes(fallbackAnchor))throw new Error('[install-exaucee-bot-knowledge] ancre fallback introuvable');
const fallback=`  if (botKnowledgeContext && (!answer || /^exaucee-local|^fallback|^exaucee-emergency-local/i.test(String(provider)))) {\n    const factual = exaucee.botKnowledge?.answer?.(routed.text, {\n      sessionId,\n      groupId: chatId.endsWith('@g.us') ? chatId : null\n    });\n    if (factual) { answer = factual; provider = 'exaucee-bot-knowledge-local'; }\n  }\n\n  if (researchReport?.results?.length) {`;
src=src.replace(fallbackAnchor,fallback);
fs.writeFileSync(runtimePath,src,'utf8');
const check=spawnSync(process.execPath,['--check',runtimePath],{encoding:'utf8'});
if(check.status!==0)throw new Error(`[install-exaucee-bot-knowledge] runtime invalide: ${check.stderr||check.stdout}`);
console.log('[install-exaucee-bot-knowledge] ✅ index vivant des commandes + fallback factuel installés');
