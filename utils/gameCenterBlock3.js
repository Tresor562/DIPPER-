'use strict';

const crypto = require('crypto');
const sessionContext = require('./sessionContext');
const { GameCenterEngine, norm } = require('./gameCenterEngine');

const MAX_TRUTH_HISTORY = 60;
const MAX_STORY_LINES = 80;
const MAX_STORY_LINE_LENGTH = 240;
const MAX_REBUS_ATTEMPTS = 10;

const TRUTH_BANK = [
  'Quel talent aimerais-tu maîtriser instantanément ?',
  'Quel personnage d’anime ou de film te ressemble le plus ?',
  'Quelle habitude drôle as-tu quand personne ne te regarde ?',
  'Quel métier rêvais-tu de faire quand tu étais plus jeune ?',
  'Quel est ton plus grand fou rire récent ?',
  'Quelle compétence de quelqu’un dans ce groupe aimerais-tu avoir ?',
  'Quel endroit aimerais-tu visiter au moins une fois ?',
  'Quel jeu pourrais-tu recommencer dix fois sans te lasser ?',
  'Quelle petite chose améliore immédiatement ta journée ?',
  'Quel défi personnel aimerais-tu réussir cette année ?'
];

const DARE_BANK = [
  'Écris une phrase drôle sans utiliser la lettre « e ».',
  'Fais un compliment sincère à un membre du groupe.',
  'Décris ton humeur actuelle uniquement avec trois emojis.',
  'Imite un personnage connu en une seule phrase.',
  'Écris ton prochain message comme si tu étais un narrateur de documentaire.',
  'Invente un slogan absurde pour le groupe.',
  'Fais une mini-devinette de ton invention.',
  'Écris une phrase où chaque mot commence par la même lettre.',
  'Choisis un emoji et invente-lui une histoire en deux lignes.',
  'Donne un surnom amusant mais respectueux à la personne qui a lancé le jeu.'
];

const LIKELY_BANK = [
  'Qui est le plus susceptible d’arriver en retard à son propre mariage ?',
  'Qui est le plus susceptible de devenir célèbre ?',
  'Qui est le plus susceptible de survivre le plus longtemps dans un jeu de survie ?',
  'Qui est le plus susceptible de créer une entreprise à succès ?',
  'Qui est le plus susceptible d’oublier son propre mot de passe ?',
  'Qui est le plus susceptible de regarder une saison entière en une nuit ?',
  'Qui est le plus susceptible de gagner un concours de créativité ?',
  'Qui est le plus susceptible d’apprendre une nouvelle compétence juste pour le fun ?'
];

const INTRUDER_BANK = [
  { q:'Quel élément est l’intrus ?', options:['Lion','Tigre','Léopard','Aigle'], answer:3 },
  { q:'Quel élément est l’intrus ?', options:['Mercure','Vénus','Mars','Soleil'], answer:3 },
  { q:'Quel élément est l’intrus ?', options:['HTML','CSS','JavaScript','Photoshop'], answer:3 },
  { q:'Quel élément est l’intrus ?', options:['Naruto','Luffy','Goku','Batman'], answer:3 },
  { q:'Quel élément est l’intrus ?', options:['Rouge','Bleu','Vert','Triangle'], answer:3 },
  { q:'Quel élément est l’intrus ?', options:['Clavier','Souris','Écran','Fourchette'], answer:3 },
  { q:'Quel élément est l’intrus ?', options:['Python','JavaScript','Rust','JPEG'], answer:3 },
  { q:'Quel élément est l’intrus ?', options:['Paris','Tokyo','Lagos','Amazonie'], answer:3 }
];

const REBUS_BANK = [
  { clue:'🕷️ + 👨', answers:['spiderman','spider man'], hint:'Un super-héros.' },
  { clue:'👑 + 🦁', answers:['roi lion','le roi lion'], hint:'Un célèbre lion.' },
  { clue:'❄️ + 👸', answers:['reine des neiges','la reine des neiges'], hint:'Un royaume glacé.' },
  { clue:'🐉 + ⚽', answers:['dragon ball','dragonball'], hint:'Un anime très connu.' },
  { clue:'⭐ + ⚔️', answers:['star wars','starwars'], hint:'Une saga dans l’espace.' },
  { clue:'🦇 + 👨', answers:['batman','bat man'], hint:'Un héros de Gotham.' }
];

const DAILY_CHALLENGES = [
  'Apprends aujourd’hui une nouvelle commande du bot et montre-la à quelqu’un.',
  'Écris une mini-histoire de trois lignes avec les mots « nuit », « robot » et « secret ».',
  'Résous mentalement 17 × 6 puis explique ta méthode en une phrase.',
  'Fais un compliment sincère à quelqu’un que tu apprécies.',
  'Découvre un raccourci clavier que tu ne connaissais pas encore.',
  'Passe dix minutes à améliorer une compétence que tu repousses souvent.',
  'Trouve une devinette et teste-la sur le groupe.',
  'Choisis un objectif pour demain et écris la première petite action à faire.'
];

function sid(){ return sessionContext.getCurrentSessionId(); }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function live(engine,game){ return engine.games.get(`${sid()}::${game.id}`); }
function cleanAnswer(v){ return norm(v).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); }
function shuffle(items){
  const out=[...items];
  for(let i=out.length-1;i>0;i--){ const j=crypto.randomInt(0,i+1); [out[i],out[j]]=[out[j],out[i]]; }
  return out;
}
function ranking(scores={}){
  return Object.entries(scores).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])))
    .map(([userId,score],i)=>({rank:i+1,userId,score}));
}
function likelyQuestion(game){ return game?.questions?.[Math.max(0,(game.round||1)-1)]||null; }
function intruderQuestion(game){ return game?.questions?.[Math.max(0,(game.round||1)-1)]||null; }
function rebusQuestion(game){ return game?.questions?.[Math.max(0,(game.round||1)-1)]||null; }

if(typeof GameCenterEngine.prototype.startTruthDare!=='function'){
  GameCenterEngine.prototype.startTruthDare=function(chatId,by,{mode='mix'}={}){
    const error=this._startGuard(chatId,'truth-dare'); if(error)return {error};
    const n=norm(mode); const safeMode=['truth','verite'].includes(n)?'truth':['dare','action','gage'].includes(n)?'dare':'mix';
    const ids=this._newIdentity('truthdare');
    return this._put({id:ids.id,alias:ids.alias,chatId,type:'truth-dare',status:'playing',by,mode:safeMode,round:0,history:[],startedAt:Date.now()});
  };

  GameCenterEngine.prototype.nextTruthDare=function(chatId,userId,choice='auto',ref=null){
    const g=this.get(chatId,ref,'truth-dare'); if(!g)return {handled:false};
    const state=live(this,g), n=norm(choice);
    let kind=['truth','verite'].includes(n)?'truth':['dare','action','gage'].includes(n)?'dare':null;
    if(!kind)kind=state.mode==='truth'?'truth':state.mode==='dare'?'dare':crypto.randomInt(0,2)===0?'truth':'dare';
    const bank=kind==='truth'?TRUTH_BANK:DARE_BANK;
    const previous=state.history.at(-1)?.prompt;
    const pool=bank.length>1?bank.filter(x=>x!==previous):bank;
    const prompt=pool[crypto.randomInt(0,pool.length)];
    state.round=(state.round||0)+1;
    state.history.push({userId,kind,prompt,ts:Date.now()});
    state.history=state.history.slice(-MAX_TRUTH_HISTORY);
    this._put(state);
    return {handled:true,ok:true,kind,prompt,round:state.round,game:clone(state)};
  };
}

if(typeof GameCenterEngine.prototype.startLikely!=='function'){
  GameCenterEngine.prototype.startLikely=function(chatId,by,{rounds=3}={}){
    const error=this._startGuard(chatId,'most-likely'); if(error)return {error};
    rounds=Math.max(1,Math.min(Number(rounds)||3,LIKELY_BANK.length,8));
    const ids=this._newIdentity('likely');
    return this._put({id:ids.id,alias:ids.alias,chatId,type:'most-likely',status:'playing',by,round:1,rounds,questions:shuffle(LIKELY_BANK).slice(0,rounds),votes:{},scores:{},startedAt:Date.now()});
  };

  GameCenterEngine.prototype.voteLikely=function(chatId,voter,target,ref=null){
    const g=this.get(chatId,ref,'most-likely'); if(!g)return {handled:false};
    if(!target)return {handled:true,ok:false,reason:'target',game:g};
    const state=live(this,g); state.votes[voter]=target; this._put(state);
    const counts={}; Object.values(state.votes).forEach(id=>{ counts[id]=(counts[id]||0)+1; });
    return {handled:true,ok:true,target,counts,game:clone(state)};
  };

  GameCenterEngine.prototype.closeLikelyRound=function(chatId,ref=null){
    const g=this.get(chatId,ref,'most-likely'); if(!g)return null;
    const state=live(this,g), question=likelyQuestion(state), counts={};
    Object.values(state.votes).forEach(id=>{ counts[id]=(counts[id]||0)+1; });
    for(const [target,count] of Object.entries(counts))state.scores[target]=(state.scores[target]||0)+count;
    const max=Math.max(0,...Object.values(counts));
    const leaders=Object.entries(counts).filter(([,count])=>count===max&&max>0).map(([id])=>id);
    if(state.round>=state.rounds){
      state.status='finished'; state.finishedAt=Date.now(); this._put(state);
      return {finished:true,question,counts,leaders,ranking:ranking(state.scores),game:clone(state)};
    }
    state.round++; state.votes={}; this._put(state);
    return {finished:false,question,counts,leaders,nextQuestion:likelyQuestion(state),game:clone(state)};
  };
}

if(typeof GameCenterEngine.prototype.startStory!=='function'){
  GameCenterEngine.prototype.startStory=function(chatId,by,{title='Histoire du groupe'}={}){
    const error=this._startGuard(chatId,'story'); if(error)return {error};
    const ids=this._newIdentity('story');
    const safeTitle=String(title||'Histoire du groupe').replace(/\s+/g,' ').trim().slice(0,80)||'Histoire du groupe';
    return this._put({id:ids.id,alias:ids.alias,chatId,type:'story',status:'playing',by,title:safeTitle,lines:[],startedAt:Date.now()});
  };

  GameCenterEngine.prototype.addStoryLine=function(chatId,userId,input,ref=null){
    const g=this.get(chatId,ref,'story'); if(!g)return {handled:false};
    const text=String(input||'').replace(/^\+\s*/,'').replace(/\s+/g,' ').trim().slice(0,MAX_STORY_LINE_LENGTH);
    if(text.length<2)return {handled:true,ok:false,reason:'text',game:g};
    const state=live(this,g);
    if(state.lines.length>=MAX_STORY_LINES)return {handled:true,ok:false,reason:'full',finished:true,game:clone(state)};
    const last=state.lines.at(-1);
    if(last?.userId===userId&&norm(last.text)===norm(text))return {handled:true,ok:false,reason:'duplicate',game:clone(state)};
    state.lines.push({userId,text,ts:Date.now()});
    let finished=false;
    if(state.lines.length>=MAX_STORY_LINES){ state.status='finished'; state.finishedAt=Date.now(); finished=true; }
    this._put(state);
    return {handled:true,ok:true,line:text,count:state.lines.length,finished,game:clone(state)};
  };
}

if(typeof GameCenterEngine.prototype.startIntruder!=='function'){
  GameCenterEngine.prototype.startIntruder=function(chatId,by,{rounds=3}={}){
    const error=this._startGuard(chatId,'intruder'); if(error)return {error};
    rounds=Math.max(1,Math.min(Number(rounds)||3,INTRUDER_BANK.length,8));
    const ids=this._newIdentity('intruder');
    return this._put({id:ids.id,alias:ids.alias,chatId,type:'intruder',status:'playing',by,round:1,rounds,questions:shuffle(INTRUDER_BANK).slice(0,rounds).map(clone),scores:{},roundAttempts:{},startedAt:Date.now()});
  };

  GameCenterEngine.prototype.answerIntruder=function(chatId,userId,input,ref=null){
    const g=this.get(chatId,ref,'intruder'); if(!g)return {handled:false};
    const raw=String(input).trim(); if(!/^[1-4]$/.test(raw))return {handled:false};
    const state=live(this,g), q=intruderQuestion(state); if(!q)return {handled:false};
    if(Object.prototype.hasOwnProperty.call(state.roundAttempts,userId))return {handled:true,ok:false,reason:'already',game:clone(state)};
    const choice=Number(raw)-1; state.roundAttempts[userId]=choice;
    if(choice!==q.answer){ this._put(state); return {handled:true,ok:true,correct:false,game:clone(state)}; }
    state.scores[userId]=(state.scores[userId]||0)+1; const answerText=q.options[q.answer];
    if(state.round>=state.rounds){
      state.status='finished'; state.finishedAt=Date.now(); state.winner=ranking(state.scores)[0]?.userId||userId; this._put(state);
      return {handled:true,ok:true,correct:true,finished:true,answerText,ranking:ranking(state.scores),game:clone(state)};
    }
    state.round++; state.roundAttempts={}; this._put(state);
    return {handled:true,ok:true,correct:true,finished:false,answerText,nextQuestion:intruderQuestion(state),game:clone(state)};
  };
}

if(typeof GameCenterEngine.prototype.startRebus!=='function'){
  GameCenterEngine.prototype.startRebus=function(chatId,by,{rounds=3}={}){
    const error=this._startGuard(chatId,'rebus'); if(error)return {error};
    rounds=Math.max(1,Math.min(Number(rounds)||3,REBUS_BANK.length,6));
    const ids=this._newIdentity('rebus');
    return this._put({id:ids.id,alias:ids.alias,chatId,type:'rebus',status:'playing',by,round:1,rounds,questions:shuffle(REBUS_BANK).slice(0,rounds).map(clone),scores:{},attempts:{},startedAt:Date.now()});
  };

  GameCenterEngine.prototype.answerRebus=function(chatId,userId,input,ref=null){
    const g=this.get(chatId,ref,'rebus'); if(!g)return {handled:false};
    const answer=cleanAnswer(input); if(!answer)return {handled:false};
    const state=live(this,g), q=rebusQuestion(state); if(!q)return {handled:false};
    const player=state.attempts[userId]||{count:0,seen:[]};
    if(player.count>=MAX_REBUS_ATTEMPTS)return {handled:true,ok:false,reason:'limit',game:clone(state)};
    if(player.seen.includes(answer))return {handled:true,ok:false,reason:'duplicate',game:clone(state)};
    player.count++; player.seen.push(answer); player.seen=player.seen.slice(-MAX_REBUS_ATTEMPTS); state.attempts[userId]=player;
    const accepted=(q.answers||[]).map(cleanAnswer), correct=accepted.includes(answer);
    if(!correct){ this._put(state); return {handled:true,ok:true,correct:false,hint:player.count>=3?q.hint||null:null,game:clone(state)}; }
    state.scores[userId]=(state.scores[userId]||0)+1; const answerText=q.answers?.[0]||answer;
    if(state.round>=state.rounds){
      state.status='finished'; state.finishedAt=Date.now(); state.winner=ranking(state.scores)[0]?.userId||userId; this._put(state);
      return {handled:true,ok:true,correct:true,finished:true,answerText,ranking:ranking(state.scores),game:clone(state)};
    }
    state.round++; state.attempts={}; this._put(state);
    return {handled:true,ok:true,correct:true,finished:false,answerText,nextQuestion:rebusQuestion(state),game:clone(state)};
  };
}

function dailyChallenge(chatId,day=null){
  const dateKey=day||new Date().toISOString().slice(0,10);
  const digest=crypto.createHash('sha256').update(`${sid()}|${chatId}|${dateKey}`).digest();
  const index=digest.readUInt32BE(0)%DAILY_CHALLENGES.length;
  return {day:dateKey,challenge:DAILY_CHALLENGES[index],index};
}

module.exports={
  TRUTH_BANK,DARE_BANK,LIKELY_BANK,INTRUDER_BANK,REBUS_BANK,DAILY_CHALLENGES,
  MAX_TRUTH_HISTORY,MAX_STORY_LINES,MAX_STORY_LINE_LENGTH,MAX_REBUS_ATTEMPTS,
  likelyQuestion,intruderQuestion,rebusQuestion,ranking,cleanAnswer,dailyChallenge
};
