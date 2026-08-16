'use strict';
const fs=require('fs');const path=require('path');const{spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..');const handlerPath=path.join(ROOT,'handler.js');const runtimePath=path.join(ROOT,'utils','featurePackRuntime.js');
const GROUP_MARKER='[FEATURE PACK 2026-08-16 RUNTIME]';const PRESENCE_MARKER='[FEATURE PACK AUTO PRESENCE]';
if(!fs.existsSync(handlerPath)||!fs.existsSync(runtimePath))throw new Error('[feature-pack] handler/runtime introuvable');
let src=fs.readFileSync(handlerPath,'utf8');

if(!src.includes(GROUP_MARKER)){
  const groupAnchor=`      if (!_groupMetadataLoaded) { groupMetadata = await getGroupMeta(); }\n      if (!_botIsAdminLoaded)    { botIsAdmin    = await getBotAdmin(); }\n\n      // ANTI-ALL`;
  const groupReplacement=`      if (!_groupMetadataLoaded) { groupMetadata = await getGroupMeta(); }\n      if (!_botIsAdminLoaded)    { botIsAdmin    = await getBotAdmin(); }\n\n      // ${GROUP_MARKER}\n      // @all est un raccourci de groupe, pas une commande préfixée : le traiter\n      // ici AVANT le retour des messages non-commandes et avant les protections.\n      if (/^@(all|everyone)(?:\\s|$)/i.test(String(body || '').trim())) {\n        const _featurePackSenderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);\n        if (await require('./utils/featurePackRuntime').handleAdminAtAll({\n          sock, msg, from, sender, body, groupMetadata,\n          isAdmin: _featurePackSenderIsAdmin, isOwner: isMe,\n        })) return;\n      }\n\n      // ANTI-ALL`;
  const gc=src.split(groupAnchor).length-1;if(gc!==1)throw new Error(`[feature-pack] ancre groupe attendue 1 fois, trouvée ${gc}`);src=src.replace(groupAnchor,groupReplacement);
}

if(!src.includes(PRESENCE_MARKER)){
  const oldPresence=`    if (config.autoTyping) await sock.sendPresenceUpdate('composing', from);`;
  const newPresence=`    // ${PRESENCE_MARKER}\n    await require('./utils/featurePackRuntime').applyAutoPresence(sock, from);`;
  const pc=src.split(oldPresence).length-1;if(pc!==1)throw new Error(`[feature-pack] ancre présence attendue 1 fois, trouvée ${pc}`);src=src.replace(oldPresence,newPresence);
}

if(!src.includes('handleAntiwalink(sock, msg, groupMetadata)')){
  const oldLink=`      if (groupSettings.antigroupmention && !msg.key.fromMe) await handleAntigroupmention(sock, msg, groupMetadata);\n      if (groupSettings.antilink && !msg.key.fromMe && _hasText) await handleAntilink(sock, msg, groupMetadata);`;
  const newLink=`      if (groupSettings.antigroupmention && !msg.key.fromMe) await handleAntigroupmention(sock, msg, groupMetadata);\n      if (groupSettings.antilink && !msg.key.fromMe && _hasText) await handleAntilink(sock, msg, groupMetadata);\n      if (groupSettings.antiwalink && !msg.key.fromMe && _hasText) {\n        try { await require('./utils/featurePackRuntime').handleAntiwalink(sock, msg, groupMetadata); } catch (_) {}\n      }`;
  const lc=src.split(oldLink).length-1;if(lc!==1)throw new Error(`[feature-pack] ancre protections attendue 1 fois, trouvée ${lc}`);src=src.replace(oldLink,newLink);
}

fs.writeFileSync(handlerPath,src,'utf8');
for(const file of[handlerPath,runtimePath]){const c=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(c.status!==0)throw new Error(`[feature-pack] syntaxe ${path.basename(file)}: ${c.stderr||c.stdout}`);}
const final=fs.readFileSync(handlerPath,'utf8');for(const x of[GROUP_MARKER,PRESENCE_MARKER,'handleAdminAtAll({','handleAntiwalink(sock, msg, groupMetadata)','applyAutoPresence(sock, from)'])if(!final.includes(x))throw new Error('[feature-pack] invariant absent: '+x);
const groupPos=final.indexOf(GROUP_MARKER),nonCommandPos=final.indexOf('if (!isCommand) return;');if(groupPos<0||nonCommandPos<0||groupPos>nonCommandPos)throw new Error('[feature-pack] @all reste placé après le retour non-commande');
console.log('[feature-pack] ✅ présence auto + @all admin non-préfixé + antiwalink branchés');
