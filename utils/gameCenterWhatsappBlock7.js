'use strict';

const styleManager=require('./styleManager');
const {THEMES}=require('./styleCatalog');
const {buildComparableIds}=require('./jidHelpers');
const {profiles,FISH_COOLDOWN_MS}=require('./gameCenterProfiles');

const SUPPORTED=new Set(['profile','gameprofile','top','gametop','achievements','achievement','succes','succès','fish','fishing','peche','pêche']);
function theme(){ return THEMES[styleManager.getStyle()]||THEMES[0]; }
function banner(label,emoji='🎮'){ return `${emoji} *${theme().botName} — ${label}*`; }
function menuLines(prefix){
  return [
    `${prefix}games profile → 👤 Profil Game Center`,
    `${prefix}games top xp|coins|wins|fish → 🏆 Classement du groupe`,
    `${prefix}games achievements → 🎖️ Succès débloqués`,
    `${prefix}games fish → 🎣 Pêcher et gagner XP + Dipper Coins`
  ];
}
function labelForType(){ return null; }
function fmt(n){ return Number(n||0).toLocaleString('fr-FR'); }
function targetFromMsg(msg,fallback){ const ctx=msg.message?.extendedTextMessage?.contextInfo||{}; return (ctx.mentionedJid||[])[0]||ctx.participant||fallback; }
function achievementsLine(items=[]){ return items.length?`\n🎉 Nouveau(x) succès : ${items.map(x=>`${x.emoji} *${x.name}*`).join(' • ')}`:''; }
function profileText(p,tag=x=>x){
  const ach=(p.achievements||[]).slice(-8);
  return [
    banner('PROFIL GAME CENTER','👤'),'',
    `Joueur : ${tag(p.userId)}`,
    `⭐ Niveau : *${p.level}*  •  XP : *${fmt(p.xp)}*`,
    `🪙 Dipper Coins : *${fmt(p.coins)}*`,
    `🎮 Parties : *${fmt(p.played)}*  •  🏆 ${fmt(p.wins)}V / ${fmt(p.losses)}D / ${fmt(p.draws)}N`,
    `🔥 Série : *${fmt(p.streak)}*  •  Record : *${fmt(p.bestStreak)}*`,
    `🎣 Pêches : *${fmt(p.fishing?.catches)}*`,
    '',
    ach.length?`🎖️ Succès : ${ach.map(x=>`${x.emoji} ${x.name}`).join(' • ')}`:'🎖️ Aucun succès débloqué.',
    '',
    'ℹ️ Les Dipper Coins sont uniquement virtuels : aucune valeur réelle, aucun achat ni retrait.'
  ].join('\n');
}
function achievementText(p){
  const items=p.achievements||[];
  return [banner('SUCCÈS','🎖️'),'','',...(items.length?items.map((x,i)=>`${i+1}. ${x.emoji} *${x.name}*`):['Aucun succès pour le moment.']),'',`Progression : niveau *${p.level}* • ${fmt(p.xp)} XP`].join('\n');
}
function metricValue(p,metric){ if(metric==='fish')return p.fishing?.catches||0; return Number(p[metric]||0); }
function metricLabel(metric){ return ({xp:'XP',coins:'Dipper Coins',wins:'Victoires',fish:'Pêches'})[metric]||metric; }
function groupProfiles(metadata){
  const rows=[],seen=new Set();
  for(const part of metadata?.participants||[]){
    const ids=[part.id,part.lid,part.userJid].filter(Boolean).flatMap(buildComparableIds);
    let found=null;
    for(const id of ids){ found=profiles.get(id,{create:false}); if(found)break; }
    if(found&&!seen.has(found.userId)){ seen.add(found.userId); rows.push(found); }
  }
  return rows;
}
function groupLeaderboard(metadata,metric='xp',limit=10){
  metric=String(metric||'xp').toLowerCase(); if(!['xp','coins','wins','fish'].includes(metric))return {error:'metric'};
  const rows=groupProfiles(metadata).map(p=>({userId:p.userId,value:metricValue(p,metric),level:p.level}));
  rows.sort((a,b)=>b.value-a.value||String(a.userId).localeCompare(String(b.userId)));
  return {metric,rows:rows.slice(0,Math.max(1,Math.min(Number(limit)||10,20))).map((r,i)=>({...r,rank:i+1}))};
}
function formatTop(board,tag=x=>x){
  const medals=['🥇','🥈','🥉'];
  return [banner(`TOP ${metricLabel(board.metric).toUpperCase()}`,'🏆'),'',...(board.rows.length?board.rows.map(r=>`${medals[r.rank-1]||'▫️'} ${tag(r.userId)} — *${fmt(r.value)}*`):['Aucun membre de ce groupe n’a encore de progression enregistrée.'])].join('\n');
}
async function fishAction(extra,{sep}){
  const r=profiles.fish(extra.sender);
  if(!r.ok&&r.error==='cooldown')return extra.reply(`🎣 La ligne est encore dans l’eau… Réessaie dans *${Math.ceil(r.remainingMs/1000)} s*.${sep()}`);
  if(!r.ok)return extra.reply(`❌ Pêche impossible pour le moment.${sep()}`);
  return extra.reply([
    banner('PÊCHE','🎣'),'',
    `${r.fish.emoji} Tu as attrapé : *${r.fish.name}*`,
    `🪙 +*${fmt(r.coins)}* Dipper Coins`,
    `⭐ +*${fmt(r.xp)}* XP`,
    `📈 Niveau : *${r.profile.level}*`,
    `💰 Solde virtuel : *${fmt(r.profile.coins)} DC*`,
    achievementsLine(r.achievements)
  ].filter(Boolean).join('\n')+sep());
}

async function handleSubcommand(sock,msg,args,extra,{prefix,sep,tag}){
  const sub=String(args[0]||'').toLowerCase();
  if(['profile','gameprofile'].includes(sub)){
    const target=targetFromMsg(msg,extra.sender),p=profiles.get(target);
    return sock.sendMessage(extra.from,{text:profileText(p,tag)+sep(),mentions:[target]},{quoted:msg});
  }
  if(['achievements','achievement','succes','succès'].includes(sub)){
    const p=profiles.get(extra.sender); return extra.reply(achievementText(p)+sep());
  }
  if(['fish','fishing','peche','pêche'].includes(sub))return fishAction(extra,{sep});
  if(['top','gametop'].includes(sub)){
    if(!extra.isGroup)return extra.reply(`❌ Le classement est disponible dans un groupe afin de ne pas exposer des joueurs d’autres groupes.${sep()}`);
    const metric=String(args[1]||'xp').toLowerCase(),board=groupLeaderboard(extra.groupMetadata,metric,10);
    if(board.error)return extra.reply(`❌ Classement disponible : *xp*, *coins*, *wins* ou *fish*.${sep()}`);
    return sock.sendMessage(extra.from,{text:formatTop(board,tag)+sep(),mentions:board.rows.map(x=>x.userId)},{quoted:msg});
  }
  return null;
}

module.exports={SUPPORTED,menuLines,labelForType,profileText,achievementText,groupProfiles,groupLeaderboard,formatTop,fishAction,handleSubcommand,FISH_COOLDOWN_MS};
