'use strict';

const crypto = require('crypto');
const styleManager = require('../../utils/styleManager');
const { THEMES } = require('../../utils/styleCatalog');
const { engine } = require('../../utils/gameCenterEngine');
const { quizQuestion, brainQuestion } = require('../../utils/gameCenterBlock2');

const SUPPORTED = new Set(['quiz','quiznext','riddle','enigme','math','rps','pfc','dice','de','des','draw','tirage','roulette']);

function theme(){ return THEMES[styleManager.getStyle()] || THEMES[0]; }
function banner(label,emoji='🎮'){ return `${emoji} *${theme().botName} — ${label}*`; }
function labelForType(type){
  return ({quiz:'🧠 Quiz','brain-riddle':'🧩 Énigmes','brain-math':'➗ Maths',rps:'✊ Pierre-Feuille-Ciseaux'})[type] || type;
}
function menuLines(prefix){
  return [
    `${prefix}games quiz anime|general|football [manches] → 🧠 Quiz`,
    `${prefix}games riddle [manches] → 🧩 Énigmes`,
    `${prefix}games math easy|medium|hard [manches] → ➗ Maths`,
    `${prefix}games rps @membre → ✊ Pierre-Feuille-Ciseaux privé`,
    `${prefix}games dice [faces] [nombre] → 🎲 Dés`,
    `${prefix}games draw @a @b... → 🎡 Tirage au sort`
  ];
}
function candidateTypes(rows,input){
  const value=String(input||'').trim(), out=[];
  if(rows.some(g=>g.type==='quiz')&&/^[1-4]$/.test(value))out.push('quiz');
  if(rows.some(g=>g.type==='brain-riddle')&&value)out.push('brain-riddle');
  if(rows.some(g=>g.type==='brain-math')&&/^-?\d+$/.test(value))out.push('brain-math');
  return out;
}
function formatRanking(rows=[],tag=x=>x){
  if(!rows.length)return 'Aucun point marqué.';
  return rows.slice(0,10).map(r=>`${r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':'▫️'} ${tag(r.userId)} — *${r.score}*`).join('\n');
}
function formatQuiz(game){
  const q=quizQuestion(game); if(!q)return `${banner('QUIZ','🧠')}\n\nQuestion indisponible.`;
  return [
    banner('QUIZ','🧠'),'',
    `📚 Catégorie : *${String(game.category||'general').toUpperCase()}*`,
    `🎯 Manche : *${game.round}/${game.rounds}*`,
    `🆔 #${game.alias}`,'',
    `*${q.q}*`,'',
    ...q.options.map((v,i)=>`${i+1}️⃣ ${v}`),'',
    `Réponds par *1, 2, 3 ou 4*.${game.rounds>1?' Un seul essai par joueur et par manche.':''}`
  ].join('\n');
}
function formatBrain(game){
  const q=brainQuestion(game); if(!q)return `${banner('CERVEAU','🧩')}\n\nQuestion indisponible.`;
  const title=game.kind==='math'?'DÉFI MATH':'ÉNIGME';
  const emoji=game.kind==='math'?'➗':'🧩';
  return [banner(title,emoji),'',`🎯 Manche : *${game.round}/${game.rounds}*`,`🆔 #${game.alias}`,'',`*${q.q}*`,'',`Réponds directement dans le groupe${game.kind==='math'?' avec le nombre':' avec ta réponse'}.`].join('\n');
}
function canManage(game,sender,extra){
  return Boolean(extra.isAdmin||extra.isOwner||extra.isSupremeOwner||game?.by===sender||game?.players?.includes(sender));
}

async function handleIncoming(sock,msg,extra,ctx){
  const {from,sender,cleaned,ref,sep,tag}=ctx;

  const quiz=engine.answerQuiz(from,sender,cleaned,ref);
  if(quiz.handled){
    let text;
    if(!quiz.ok&&quiz.reason==='already') text=`⏳ ${tag(sender)}, tu as déjà joué cette manche. Attends la suivante. #${quiz.game.alias}`;
    else if(!quiz.correct) text=`❌ Mauvaise réponse pour ${tag(sender)}. Tu ne peux plus répondre à cette manche. #${quiz.game.alias}`;
    else if(quiz.finished) text=[banner('QUIZ TERMINÉ','🏆'),'',`✅ Bonne réponse : *${quiz.answerText}*`,'',formatRanking(quiz.ranking,tag)].join('\n');
    else text=[`✅ *Bonne réponse, ${tag(sender)} !*`,`Réponse : *${quiz.answerText}*`,'',formatQuiz(quiz.game)].join('\n');
    await sock.sendMessage(from,{text:text+sep(),mentions:[sender,...(quiz.ranking||[]).map(r=>r.userId)]},{quoted:msg});
    return true;
  }

  const brain=engine.answerBrain(from,sender,cleaned,ref);
  if(brain.handled){
    let text;
    if(!brain.ok&&brain.reason==='duplicate') text=`♻️ ${tag(sender)}, tu as déjà proposé cette réponse pour cette manche. #${brain.game.alias}`;
    else if(!brain.correct) text=`❌ Pas encore.${brain.hint?`\n💡 Indice : *${brain.hint}*`:''}\n#${brain.game.alias}`;
    else if(brain.finished) text=[banner('DÉFI TERMINÉ','🏆'),'',`✅ Réponse : *${brain.answerText}*`,'',formatRanking(brain.ranking,tag)].join('\n');
    else text=[`✅ *${tag(sender)} trouve la bonne réponse !*`,`Réponse : *${brain.answerText}*`,'',formatBrain(brain.game)].join('\n');
    await sock.sendMessage(from,{text:text+sep(),mentions:[sender,...(brain.ranking||[]).map(r=>r.userId)]},{quoted:msg});
    return true;
  }

  return false;
}

async function handleSubcommand(sock,msg,args,extra,{prefix,sep,tag}){
  const from=extra.from, sender=extra.sender, sub=String(args[0]||'').toLowerCase();

  if(sub==='quiz'){
    const category=String(args[1]||'general').toLowerCase();
    const rounds=Number(args[2])||5;
    const g=engine.startQuiz(from,sender,{category,rounds});
    if(g.error==='category')return extra.reply(`❌ Catégorie inconnue. Utilise *general*, *anime* ou *football*.${sep()}`);
    if(g.error)return extra.reply(`⚠️ Un Quiz est déjà actif ou la limite de parties est atteinte.${sep()}`);
    return extra.reply(formatQuiz(g)+sep());
  }

  if(sub==='quiznext'){
    const ref=String(args[1]||'').replace(/^#/,'')||null;
    const games=engine.list(from,{type:'quiz'});
    if(!games.length)return extra.reply(`❌ Aucun Quiz actif.${sep()}`);
    if(!ref&&games.length>1)return extra.reply(`⚠️ Indique l’ID du Quiz à avancer.${sep()}`);
    const g=engine.get(from,ref,'quiz');
    if(!g)return extra.reply(`❌ Quiz introuvable.${sep()}`);
    if(!canManage(g,sender,extra))return extra.reply(`🔒 Seul le créateur du Quiz ou un admin peut passer une question.${sep()}`);
    const r=engine.skipQuiz(from,g.alias);
    if(r.finished)return extra.reply(`${banner('QUIZ TERMINÉ','🏁')}\n\n✅ Réponse révélée : *${r.answerText}*\n\n${formatRanking(r.ranking,tag)}${sep()}`);
    return extra.reply(`⏭️ Question passée. Réponse : *${r.answerText}*\n\n${formatQuiz(r.game)}${sep()}`);
  }

  if(sub==='riddle'||sub==='enigme'){
    const rounds=Number(args[1])||3;
    const g=engine.startBrain(from,sender,{kind:'riddle',rounds});
    if(g.error)return extra.reply(`⚠️ Une partie d’Énigmes est déjà active ou la limite est atteinte.${sep()}`);
    return extra.reply(formatBrain(g)+sep());
  }

  if(sub==='math'){
    const difficulty=String(args[1]||'easy').toLowerCase();
    if(!['easy','medium','hard'].includes(difficulty))return extra.reply(`❌ Difficulté : *easy*, *medium* ou *hard*.${sep()}`);
    const rounds=Number(args[2])||5;
    const g=engine.startBrain(from,sender,{kind:'math',rounds,difficulty});
    if(g.error)return extra.reply(`⚠️ Un Défi Math est déjà actif ou la limite est atteinte.${sep()}`);
    return extra.reply(formatBrain(g)+sep());
  }

  if(sub==='rps'||sub==='pfc'){
    const ctx=msg.message?.extendedTextMessage?.contextInfo||{};
    const opponent=(ctx.mentionedJid||[])[0]||ctx.participant||null;
    const g=engine.startRps(from,sender,opponent);
    if(g.error==='opponent')return extra.reply(`❌ Mentionne un autre membre : *${prefix}games rps @membre*${sep()}`);
    if(g.error)return extra.reply(`⚠️ Un duel Pierre-Feuille-Ciseaux est déjà actif ou la limite est atteinte.${sep()}`);
    return sock.sendMessage(from,{text:[banner('PIERRE • FEUILLE • CISEAUX','✊'),'',`${tag(g.players[0])} 🆚 ${tag(g.players[1])}`,'',`🔐 Les choix sont *secrets*. Chacun doit écrire au bot en privé :`,`*${prefix}rpspick #${g.alias} pierre*`,`ou *feuille* / *ciseaux*`,'',`Le bot ne révèle rien avant d’avoir reçu les deux choix.`,`ID : #${g.alias}`].join('\n')+sep(),mentions:g.players},{quoted:msg});
  }

  if(sub==='dice'||sub==='de'||sub==='des'){
    const faces=Math.max(2,Math.min(Number(args[1])||6,1000));
    const count=Math.max(1,Math.min(Number(args[2])||1,20));
    const rolls=Array.from({length:count},()=>crypto.randomInt(1,faces+1));
    const total=rolls.reduce((a,b)=>a+b,0);
    return extra.reply([banner('LANCER DE DÉS','🎲'),'',`Faces : *${faces}*`,`Lancers : *${rolls.join(' • ')}*`,count>1?`Total : *${total}*`:null].filter(Boolean).join('\n')+sep());
  }

  if(sub==='draw'||sub==='tirage'||sub==='roulette'){
    const ctx=msg.message?.extendedTextMessage?.contextInfo||{};
    const mentions=[...new Set(ctx.mentionedJid||[])].filter(Boolean);
    if(mentions.length<2)return extra.reply(`❌ Mentionne au moins deux personnes pour un tirage équitable.${sep()}`);
    const winner=mentions[crypto.randomInt(0,mentions.length)];
    return sock.sendMessage(from,{text:[banner('TIRAGE AU SORT','🎡'),'',`Participants : *${mentions.length}*`,`🏆 Gagnant(e) : ${tag(winner)}`].join('\n')+sep(),mentions:[winner]},{quoted:msg});
  }

  return null;
}

module.exports={SUPPORTED,menuLines,candidateTypes,handleIncoming,handleSubcommand,labelForType,banner,formatQuiz,formatBrain,canManage};
