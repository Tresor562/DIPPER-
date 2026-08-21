'use strict';

const styleManager = require('./styleManager');
const { THEMES } = require('./styleCatalog');
const { engine } = require('./gameCenterEngine');
const {
  MIN_SECRET_PLAYERS,MAX_SECRET_PLAYERS,crownOfDay,uniqueIds
} = require('./gameCenterBlock5');

const SUPPORTED = new Set(['best','meilleur','bestclose','meilleurfin','crown','king','queen','roi','reine','secretfriend','secret']);

function theme(){ return THEMES[styleManager.getStyle()] || THEMES[0]; }
function banner(label,emoji='🎮'){ return `${emoji} *${theme().botName} — ${label}*`; }
function labelForType(type){
  return ({'best-member':'❤️ Meilleur membre','secret-friend':'🎁 Secret Friend'})[type]||null;
}
function menuLines(prefix){
  return [
    `${prefix}games best → ❤️ Vote du meilleur membre`,
    `${prefix}games bestclose [#id] → 🏆 Clôturer le vote`,
    `${prefix}games crown|king|queen → 👑 Titre du jour`,
    `${prefix}games secretfriend → 🎁 Secret Friend en DM (admin)`
  ];
}
function candidateTypes(rows,input){
  const value=String(input||'').trim();
  return rows.some(g=>g.type==='best-member')&&/^best\b/i.test(value)?['best-member']:[];
}
function formatRanking(rows=[],tag=x=>x){
  if(!rows.length)return 'Aucun vote enregistré.';
  return rows.slice(0,10).map(r=>`${r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':'▫️'} ${tag(r.userId)} — *${r.score} vote(s)*`).join('\n');
}
function canManage(game,sender,extra){ return Boolean(extra.isAdmin||extra.isOwner||extra.isSupremeOwner||game?.by===sender); }
function sameJid(a,b){ return String(a||'')===String(b||''); }
function participantIds(groupMetadata,botIds=[]){
  const bots=new Set(uniqueIds(botIds));
  const ids=(groupMetadata?.participants||[]).map(p=>p?.id).filter(id=>typeof id==='string'&&(/@s\.whatsapp\.net$/.test(id)||/@lid$/.test(id))&&!bots.has(id));
  return uniqueIds(ids);
}
function titleForMode(mode){
  return mode==='king'?{label:'ROI DU JOUR',emoji:'👑',noun:'Roi du jour'}:
    mode==='queen'?{label:'REINE DU JOUR',emoji:'👑',noun:'Reine du jour'}:
    {label:'SOUVERAIN(E) DU JOUR',emoji:'👑',noun:'Souverain(e) du jour'};
}
function sleep(ms){ return ms>0?new Promise(resolve=>setTimeout(resolve,ms)):Promise.resolve(); }
async function sendSecretAssignments(sock,pairs,{groupName='ce groupe',delayMs=120,retries=2}={}){
  const sent=[],failed=[];
  const safeName=String(groupName||'ce groupe').replace(/\s+/g,' ').trim().slice(0,80)||'ce groupe';
  for(const pair of pairs){
    let ok=false,lastError=null;
    for(let attempt=0;attempt<Math.max(1,retries);attempt++){
      try{
        await sock.sendMessage(pair.from,{
          text:[banner('SECRET FRIEND','🎁'),'',`🤫 Ton ami secret pour *${safeName}* est @${String(pair.to).split('@')[0]}.`,'','Garde cette attribution privée. Le bot ne publiera jamais les paires dans le groupe.'].join('\n'),
          mentions:[pair.to]
        });
        ok=true; break;
      }catch(error){ lastError=error; if(attempt+1<retries)await sleep(150); }
    }
    if(ok)sent.push(pair); else failed.push({pair,error:lastError?.message||'send_failed'});
    await sleep(delayMs);
  }
  if(failed.length){
    for(const pair of sent){
      try{ await sock.sendMessage(pair.from,{text:`⚠️ *Secret Friend annulé*\n\nLa distribution n’a pas pu être livrée à tout le monde. Ignore l’attribution reçue précédemment.`}); }catch(_){ }
    }
  }
  return {sent,failed,cancelled:failed.length>0};
}

async function handleIncoming(sock,msg,extra,ctx){
  const {from,sender,cleaned,ref,sep,tag}=ctx;
  if(!/^best\b/i.test(cleaned))return false;
  const mentions=msg.message?.extendedTextMessage?.contextInfo?.mentionedJid||[];
  const result=engine.voteBestMember(from,sender,mentions[0]||null,ref);
  if(!result.handled)return false;
  let text;
  if(!result.ok&&result.reason==='target')text=`❌ Mentionne un membre : *best @membre*.${ref?` #${ref}`:''}`;
  else if(!result.ok&&result.reason==='self')text=`😄 Tu ne peux pas voter pour toi-même, ${tag(sender)}.`;
  else text=`❤️ Vote de ${tag(sender)} enregistré pour ${tag(result.target)}.\nTu peux changer ton vote avant la clôture.\n#${result.game.alias}`;
  await sock.sendMessage(from,{text:text+sep(),mentions:[sender,result.target].filter(Boolean)},{quoted:msg});
  return true;
}

async function handleSubcommand(sock,msg,args,extra,{prefix,sep,tag}){
  const from=extra.from,sender=extra.sender,sub=String(args[0]||'').toLowerCase();
  const ctx=msg.message?.extendedTextMessage?.contextInfo||{};

  if(['best','meilleur'].includes(sub)){
    const g=engine.startBestMember(from,sender);
    if(g.error)return extra.reply(`⚠️ Un vote « Meilleur membre » est déjà actif ou la limite de parties est atteinte.${sep()}`);
    return extra.reply([banner('MEILLEUR MEMBRE','❤️'),'','Vote en envoyant : *best @membre*','Tu peux modifier ton vote jusqu’à la clôture.','Le vote pour soi-même est refusé.','',`ID : #${g.alias}`,`Clôture : *${prefix}games bestclose #${g.alias}*`].join('\n')+sep());
  }

  if(['bestclose','meilleurfin'].includes(sub)){
    const ref=String(args[1]||'').replace(/^#/,'')||null;
    const rows=engine.list(from,{type:'best-member'});
    if(!rows.length)return extra.reply(`❌ Aucun vote « Meilleur membre » actif.${sep()}`);
    if(!ref&&rows.length>1)return extra.reply(`⚠️ Indique l’ID du vote à clôturer.${sep()}`);
    const g=ref?engine.get(from,ref,'best-member'):rows[0];
    if(!g)return extra.reply(`❌ Vote introuvable.${sep()}`);
    if(!canManage(g,sender,extra))return extra.reply(`🔒 Seul le créateur ou un admin peut clôturer le vote.${sep()}`);
    const r=engine.closeBestMember(from,g.alias);
    const winners=r.winners.length?r.winners.map(tag).join(' • '):'Aucun gagnant';
    return sock.sendMessage(from,{text:[banner('RÉSULTAT','🏆'),'',`👑 Meilleur(s) membre(s) : ${winners}`,`🗳️ Votes valides : *${r.totalVotes}*`,'',formatRanking(r.ranking,tag)].join('\n')+sep(),mentions:[...new Set([...r.winners,...r.ranking.map(x=>x.userId)])]},{quoted:msg});
  }

  if(['crown','king','queen','roi','reine'].includes(sub)){
    const mode=['king','roi'].includes(sub)?'king':['queen','reine'].includes(sub)?'queen':'crown';
    const mentioned=ctx.mentionedJid||[];
    const botIds=[sock.user?.id,sock.user?.lid].filter(Boolean);
    const pool=mentioned.length?uniqueIds(mentioned.filter(id=>!botIds.some(bot=>sameJid(bot,id)))):participantIds(extra.groupMetadata,botIds);
    if(!pool.length)return extra.reply(`❌ Aucun participant éligible trouvé.${sep()}`);
    const result=crownOfDay(from,pool,mode); const title=titleForMode(mode);
    return sock.sendMessage(from,{text:[banner(title.label,title.emoji),'',`${title.emoji} ${tag(result.winner)} est *${title.noun}* !`,`📅 ${result.day}`,'',mentioned.length?'🎯 Tirage effectué uniquement parmi les personnes mentionnées.':'🔁 Le résultat reste identique pour ce groupe pendant toute la journée.'].join('\n')+sep(),mentions:[result.winner]},{quoted:msg});
  }

  if(['secretfriend','secret'].includes(sub)){
    if(!extra.isAdmin&&!extra.isOwner&&!extra.isSupremeOwner)return extra.reply(`🔒 Secret Friend est réservé aux admins pour éviter les envois privés abusifs.${sep()}`);
    const botIds=[sock.user?.id,sock.user?.lid].filter(Boolean);
    const mentioned=ctx.mentionedJid||[];
    const pool=mentioned.length>=MIN_SECRET_PLAYERS?uniqueIds(mentioned.filter(id=>!botIds.some(bot=>sameJid(bot,id)))):participantIds(extra.groupMetadata,botIds);
    if(pool.length<MIN_SECRET_PLAYERS)return extra.reply(`❌ Il faut au moins *${MIN_SECRET_PLAYERS}* participants éligibles.${sep()}`);
    if(pool.length>MAX_SECRET_PLAYERS)return extra.reply(`⚠️ Limite de sécurité : *${MAX_SECRET_PLAYERS}* participants par distribution Secret Friend.${sep()}`);
    const g=engine.startSecretFriend(from,sender,pool);
    if(g.error)return extra.reply(`⚠️ Impossible de lancer Secret Friend (${g.error}).${sep()}`);
    const delivery=await sendSecretAssignments(sock,g.secretPlan,{groupName:extra.groupMetadata?.subject||'ce groupe',delayMs:120,retries:2});
    const final=engine.finishSecretFriend(from,g.alias,{sent:delivery.sent.length,failed:delivery.failed.length,cancelled:delivery.cancelled});
    if(delivery.cancelled){
      return extra.reply([banner('SECRET FRIEND ANNULÉ','⚠️'),'','La distribution privée n’a pas atteint tous les participants.',`✅ Livrés puis annulés : *${delivery.sent.length}*`,`❌ Échecs : *${delivery.failed.length}*`,'','Les personnes déjà contactées ont reçu un message leur demandant d’ignorer l’ancienne attribution. Aucune paire secrète n’a été publiée dans le groupe.',`ID : #${final.alias}`].join('\n')+sep());
    }
    return extra.reply([banner('SECRET FRIEND PRÊT','🎁'),'',`✅ *${delivery.sent.length}* attribution(s) envoyée(s) en privé.`,`🔐 Aucune paire n’a été publiée dans le groupe ni conservée dans l’historique du Game Center.`,`ID : #${final.alias}`].join('\n')+sep());
  }

  return null;
}

module.exports={SUPPORTED,menuLines,candidateTypes,handleIncoming,handleSubcommand,labelForType,banner,formatRanking,canManage,participantIds,titleForMode,sendSecretAssignments};
