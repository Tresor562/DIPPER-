'use strict';

const styleManager = require('./styleManager');
const { THEMES } = require('./styleCatalog');
const { engine } = require('./gameCenterEngine');
const {
  likelyQuestion,intruderQuestion,rebusQuestion,dailyChallenge,MAX_STORY_LINES
} = require('./gameCenterBlock3');

const SUPPORTED = new Set([
  'truth','verite','vérité','dare','action','gage','truthdare','av',
  'likely','susceptible','likelynext','susceptiblenext',
  'story','histoire','storyshow','histoirevoir','storyend','histoirefin',
  'intruder','intrus','rebus','daily','defijour','défijour'
]);

function theme(){ return THEMES[styleManager.getStyle()] || THEMES[0]; }
function banner(label,emoji='🎮'){ return `${emoji} *${theme().botName} — ${label}*`; }
function labelForType(type){
  return ({
    'truth-dare':'❓ Action / Vérité',
    'most-likely':'😂 Qui est le plus susceptible',
    story:'📝 Histoire collaborative',
    intruder:'🔍 Trouve l’intrus',
    rebus:'🧠 Rébus'
  })[type] || null;
}
function menuLines(prefix){
  return [
    `${prefix}games truth|dare [@membre] → ❓ Action / Vérité`,
    `${prefix}games likely [manches] → 😂 Qui est le plus susceptible`,
    `${prefix}games story [titre] → 📝 Continue l’histoire avec + ton texte`,
    `${prefix}games intruder [manches] → 🔍 Trouve l’intrus`,
    `${prefix}games rebus [manches] → 🧠 Rébus emojis`,
    `${prefix}games daily → 🔥 Défi du jour`
  ];
}
function candidateTypes(rows,input){
  const value=String(input||'').trim(), out=[];
  if(rows.some(g=>g.type==='most-likely')&&/^vote\b/i.test(value))out.push('most-likely');
  if(rows.some(g=>g.type==='story')&&/^\+\s*\S/.test(value))out.push('story');
  if(rows.some(g=>g.type==='intruder')&&/^[1-4]$/.test(value))out.push('intruder');
  if(rows.some(g=>g.type==='rebus')&&value)out.push('rebus');
  return out;
}
function formatRanking(rows=[],tag=x=>x){
  if(!rows.length)return 'Aucun point marqué.';
  return rows.slice(0,10).map(r=>`${r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':'▫️'} ${tag(r.userId)} — *${r.score}*`).join('\n');
}
function formatLikely(game){
  return [
    banner('QUI EST LE PLUS SUSCEPTIBLE ?','😂'),'',
    `🎯 Manche : *${game.round}/${game.rounds}*`,`🆔 #${game.alias}`,'',
    `*${likelyQuestion(game)}*`,'',
    'Vote avec : *vote @membre*',
    'Tu peux changer ton vote tant que la manche n’est pas clôturée.'
  ].join('\n');
}
function formatIntruder(game){
  const q=intruderQuestion(game);
  if(!q)return `${banner('INTRUS','🔍')}\n\nQuestion indisponible.`;
  return [banner('TROUVE L’INTRUS','🔍'),'',`🎯 Manche : *${game.round}/${game.rounds}*`,`🆔 #${game.alias}`,'',`*${q.q}*`,'',...q.options.map((v,i)=>`${i+1}️⃣ ${v}`),'','Réponds par *1, 2, 3 ou 4*.'].join('\n');
}
function formatRebus(game){
  const q=rebusQuestion(game);
  if(!q)return `${banner('RÉBUS','🧠')}\n\nRébus indisponible.`;
  return [banner('RÉBUS EMOJI','🧠'),'',`🎯 Manche : *${game.round}/${game.rounds}*`,`🆔 #${game.alias}`,'',`*${q.clue}*`,'','Devine le mot, le titre ou le personnage représenté.'].join('\n');
}
function storyText(game,tag=x=>x){
  const lines=(game?.lines||[]).slice(-20);
  return [banner(game?.title||'HISTOIRE','📝'),'',`🆔 #${game.alias}`,`✍️ ${game.lines?.length||0}/${MAX_STORY_LINES} contribution(s)`,'',...(lines.length?lines.map((line,i)=>`${Math.max(1,(game.lines?.length||0)-lines.length+i+1)}. ${tag(line.userId)} — ${line.text}`):['Aucune ligne pour le moment.'])].join('\n');
}
function canManage(game,sender,extra){ return Boolean(extra.isAdmin||extra.isOwner||extra.isSupremeOwner||game?.by===sender||game?.players?.includes?.(sender)); }
function argRef(value){ return String(value||'').replace(/^#/,'')||null; }

async function handleIncoming(sock,msg,extra,ctx){
  const {from,sender,cleaned,ref,sep,tag}=ctx;
  const mentions=msg.message?.extendedTextMessage?.contextInfo?.mentionedJid||[];

  if(/^vote\b/i.test(cleaned)){
    const vote=engine.voteLikely(from,sender,mentions[0]||null,ref);
    if(vote.handled){
      let text;
      if(!vote.ok)text=`❌ Mentionne une personne : *vote @membre*.${ref?` #${ref}`:''}`;
      else text=`🗳️ Vote de ${tag(sender)} enregistré pour ${tag(vote.target)}.\n📊 Votes comptés : *${Object.keys(vote.counts).length} candidat(s)*\n#${vote.game.alias}`;
      await sock.sendMessage(from,{text:text+sep(),mentions:[sender,vote.target].filter(Boolean)},{quoted:msg});
      return true;
    }
  }

  if(/^\+\s*\S/.test(cleaned)){
    const story=engine.addStoryLine(from,sender,cleaned,ref);
    if(story.handled){
      let text;
      if(!story.ok&&story.reason==='duplicate')text=`♻️ Cette ligne vient déjà d’être ajoutée. #${story.game.alias}`;
      else if(!story.ok&&story.reason==='full')text=`🏁 L’histoire a atteint sa limite de ${MAX_STORY_LINES} contributions.`;
      else if(!story.ok)text=`❌ Ajoute au moins deux caractères après le signe *+*.`;
      else if(story.finished)text=`🏁 ${tag(sender)} ajoute la dernière ligne. L’histoire #${story.game.alias} est terminée avec *${story.count}* contributions.`;
      else text=`📝 ${tag(sender)} ajoute la ligne *${story.count}*.\n➡️ Continue avec *+ ton texte*\n#${story.game.alias}`;
      await sock.sendMessage(from,{text:text+sep(),mentions:[sender]},{quoted:msg});
      return true;
    }
  }

  const intruder=engine.answerIntruder(from,sender,cleaned,ref);
  if(intruder.handled){
    let text;
    if(!intruder.ok&&intruder.reason==='already')text=`⏳ ${tag(sender)}, tu as déjà joué cette manche. #${intruder.game.alias}`;
    else if(!intruder.correct)text=`❌ Ce n’est pas l’intrus. Attends la prochaine manche. #${intruder.game.alias}`;
    else if(intruder.finished)text=[banner('INTRUS TERMINÉ','🏆'),'',`✅ Intrus : *${intruder.answerText}*`,'',formatRanking(intruder.ranking,tag)].join('\n');
    else text=[`✅ *Bien vu, ${tag(sender)} !*`,`Intrus : *${intruder.answerText}*`,'',formatIntruder(intruder.game)].join('\n');
    await sock.sendMessage(from,{text:text+sep(),mentions:[sender,...(intruder.ranking||[]).map(r=>r.userId)]},{quoted:msg});
    return true;
  }

  const rebus=engine.answerRebus(from,sender,cleaned,ref);
  if(rebus.handled){
    let text;
    if(!rebus.ok&&rebus.reason==='duplicate')text=`♻️ ${tag(sender)}, tu as déjà essayé cette réponse. #${rebus.game.alias}`;
    else if(!rebus.ok&&rebus.reason==='limit')text=`⛔ ${tag(sender)}, limite d’essais atteinte pour cette manche. #${rebus.game.alias}`;
    else if(!rebus.correct)text=`❌ Pas encore.${rebus.hint?`\n💡 Indice : *${rebus.hint}*`:''}\n#${rebus.game.alias}`;
    else if(rebus.finished)text=[banner('RÉBUS TERMINÉ','🏆'),'',`✅ Réponse : *${rebus.answerText}*`,'',formatRanking(rebus.ranking,tag)].join('\n');
    else text=[`✅ *${tag(sender)} trouve le rébus !*`,`Réponse : *${rebus.answerText}*`,'',formatRebus(rebus.game)].join('\n');
    await sock.sendMessage(from,{text:text+sep(),mentions:[sender,...(rebus.ranking||[]).map(r=>r.userId)]},{quoted:msg});
    return true;
  }

  return false;
}

async function handleSubcommand(sock,msg,args,extra,{prefix,sep,tag}){
  const from=extra.from, sender=extra.sender, sub=String(args[0]||'').toLowerCase();
  const ctx=msg.message?.extendedTextMessage?.contextInfo||{};

  if(['truth','verite','vérité','dare','action','gage','truthdare','av'].includes(sub)){
    const choice=['truth','verite','vérité'].includes(sub)?'truth':['dare','action','gage'].includes(sub)?'dare':'auto';
    const target=(ctx.mentionedJid||[])[0]||ctx.participant||sender;
    let g=engine.get(from,null,'truth-dare');
    if(!g){
      g=engine.startTruthDare(from,sender,{mode:choice==='auto'?'mix':choice});
      if(g.error)return extra.reply(`⚠️ Une partie Action/Vérité est déjà active ou la limite est atteinte.${sep()}`);
    }
    const r=engine.nextTruthDare(from,target,choice,g.alias);
    const title=r.kind==='truth'?'VÉRITÉ':'ACTION'; const emoji=r.kind==='truth'?'❓':'🔥';
    return sock.sendMessage(from,{text:[banner(title,emoji),'',`${tag(target)}, à toi :`,`*${r.prompt}*`,'',`Manche : *${r.round}*  •  ID : #${r.game.alias}`].join('\n')+sep(),mentions:[target]},{quoted:msg});
  }

  if(sub==='likely'||sub==='susceptible'){
    const rounds=Number(args[1])||3;
    const g=engine.startLikely(from,sender,{rounds});
    if(g.error)return extra.reply(`⚠️ Une partie « Qui est le plus susceptible » est déjà active ou la limite est atteinte.${sep()}`);
    return extra.reply(formatLikely(g)+sep());
  }

  if(sub==='likelynext'||sub==='susceptiblenext'){
    const ref=argRef(args[1]); const games=engine.list(from,{type:'most-likely'});
    if(!games.length)return extra.reply(`❌ Aucune partie « Qui est le plus susceptible » active.${sep()}`);
    const g=engine.get(from,ref,'most-likely')||(!ref&&games.length===1?games[0]:null);
    if(!g)return extra.reply(`⚠️ Indique l’ID de la partie à clôturer.${sep()}`);
    if(!canManage(g,sender,extra))return extra.reply(`🔒 Seul le créateur ou un admin peut clôturer la manche.${sep()}`);
    const r=engine.closeLikelyRound(from,g.alias);
    const mentions=[...new Set([...(r.leaders||[]),...(r.ranking||[]).map(x=>x.userId)])];
    const leaders=r.leaders?.length?r.leaders.map(tag).join(' • '):'Aucun vote';
    if(r.finished)return sock.sendMessage(from,{text:[banner('CLASSEMENT FINAL','🏆'),'',`Dernière manche : *${r.question}*`,`👑 Plus cité(s) : ${leaders}`,'',formatRanking(r.ranking,tag)].join('\n')+sep(),mentions},{quoted:msg});
    return sock.sendMessage(from,{text:[`📊 *Manche clôturée*`,`Question : *${r.question}*`,`👑 Plus cité(s) : ${leaders}`,'',formatLikely(r.game)].join('\n')+sep(),mentions},{quoted:msg});
  }

  if(sub==='story'||sub==='histoire'){
    const title=args.slice(1).join(' ')||'Histoire du groupe';
    const g=engine.startStory(from,sender,{title});
    if(g.error)return extra.reply(`⚠️ Une histoire collaborative est déjà active ou la limite est atteinte.${sep()}`);
    return extra.reply([banner(g.title,'📝'),'',`Commencez l’histoire en envoyant : *+ votre phrase*`,`Chaque ligne est limitée et l’histoire se termine automatiquement à ${MAX_STORY_LINES} contributions.`,`ID : #${g.alias}`].join('\n')+sep());
  }

  if(sub==='storyshow'||sub==='histoirevoir'){
    const ref=argRef(args[1]); const g=engine.get(from,ref,'story');
    if(!g)return extra.reply(`❌ Aucune histoire active correspondante.${sep()}`);
    const mentions=[...new Set((g.lines||[]).slice(-20).map(x=>x.userId))];
    return sock.sendMessage(from,{text:storyText(g,tag)+sep(),mentions},{quoted:msg});
  }

  if(sub==='storyend'||sub==='histoirefin'){
    const ref=argRef(args[1]); const g=engine.get(from,ref,'story');
    if(!g)return extra.reply(`❌ Aucune histoire active correspondante.${sep()}`);
    if(!canManage(g,sender,extra))return extra.reply(`🔒 Seul le créateur ou un admin peut terminer l’histoire.${sep()}`);
    const stopped=engine.stop(from,g.alias);
    return extra.reply(`🏁 Histoire *${stopped.title}* terminée avec *${stopped.lines.length}* contribution(s).${sep()}`);
  }

  if(sub==='intruder'||sub==='intrus'){
    const rounds=Number(args[1])||3;
    const g=engine.startIntruder(from,sender,{rounds});
    if(g.error)return extra.reply(`⚠️ Une partie Trouve l’intrus est déjà active ou la limite est atteinte.${sep()}`);
    return extra.reply(formatIntruder(g)+sep());
  }

  if(sub==='rebus'){
    const rounds=Number(args[1])||3;
    const g=engine.startRebus(from,sender,{rounds});
    if(g.error)return extra.reply(`⚠️ Une partie Rébus est déjà active ou la limite est atteinte.${sep()}`);
    return extra.reply(formatRebus(g)+sep());
  }

  if(['daily','defijour','défijour'].includes(sub)){
    const r=dailyChallenge(from);
    return extra.reply([banner('DÉFI DU JOUR','🔥'),'',`📅 ${r.day}`,'',`*${r.challenge}*`].join('\n')+sep());
  }

  return null;
}

module.exports={SUPPORTED,menuLines,candidateTypes,handleIncoming,handleSubcommand,labelForType,banner,formatLikely,formatIntruder,formatRebus,storyText,canManage};
