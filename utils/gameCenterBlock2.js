'use strict';

const crypto = require('crypto');
const sessionContext = require('./sessionContext');
const { GameCenterEngine, norm } = require('./gameCenterEngine');

const QUIZ_BANKS = {
  general: [
    { q:'Quelle est la capitale de la France ?', options:['Madrid','Paris','Rome','Lisbonne'], answer:1 },
    { q:'Combien y a-t-il de continents généralement reconnus ?', options:['5','6','7','8'], answer:2 },
    { q:'Quel est le plus grand océan du monde ?', options:['Atlantique','Indien','Arctique','Pacifique'], answer:3 },
    { q:'Quel symbole chimique représente l’oxygène ?', options:['O','Ox','Og','Oy'], answer:0 },
    { q:'À quelle température l’eau bout-elle au niveau de la mer ?', options:['50 °C','75 °C','100 °C','120 °C'], answer:2 },
    { q:'Quelle planète est surnommée la planète rouge ?', options:['Vénus','Mars','Jupiter','Mercure'], answer:1 },
    { q:'Combien de côtés possède un hexagone ?', options:['5','6','7','8'], answer:1 },
    { q:'Quel organe pompe le sang dans le corps humain ?', options:['Foie','Poumon','Cœur','Rein'], answer:2 }
  ],
  anime: [
    { q:'Dans Naruto, quel est le village de Naruto Uzumaki ?', options:['Suna','Konoha','Kiri','Iwa'], answer:1 },
    { q:'Qui est le protagoniste principal de One Piece ?', options:['Zoro','Ace','Luffy','Shanks'], answer:2 },
    { q:'Dans Death Note, quelle lettre désigne le célèbre détective ?', options:['K','L','M','N'], answer:1 },
    { q:'Dans Dragon Ball, de quelle race est Goku ?', options:['Namek','Saiyan','Humain','Kaioshin'], answer:1 },
    { q:'Dans Jujutsu Kaisen, qui utilise le Sixième Œil et l’Infini ?', options:['Yuji','Megumi','Nanami','Gojo'], answer:3 },
    { q:'Dans Demon Slayer, comment s’appelle la sœur de Tanjiro ?', options:['Mitsuri','Shinobu','Nezuko','Kanao'], answer:2 },
    { q:'Dans My Hero Academia, quel est le prénom de Midoriya ?', options:['Izuku','Katsuki','Shoto','Tenya'], answer:0 },
    { q:'Dans L’Attaque des Titans, quel est le prénom de Yeager ?', options:['Armin','Levi','Eren','Reiner'], answer:2 }
  ],
  football: [
    { q:'Combien de joueurs une équipe aligne-t-elle normalement sur le terrain au coup d’envoi ?', options:['9','10','11','12'], answer:2 },
    { q:'Quelle est la durée réglementaire d’un match senior hors arrêts de jeu et prolongations ?', options:['80 min','90 min','100 min','120 min'], answer:1 },
    { q:'À quelle distance du but se trouve le point de penalty ?', options:['9 m','10 m','11 m','12 m'], answer:2 },
    { q:'Que signifie normalement un carton rouge ?', options:['Avertissement','Expulsion','But annulé','Penalty automatique'], answer:1 },
    { q:'À quelle fréquence la Coupe du monde masculine de la FIFA est-elle normalement organisée ?', options:['2 ans','3 ans','4 ans','5 ans'], answer:2 },
    { q:'Quel joueur peut utiliser ses mains dans sa propre surface de réparation ?', options:['Le capitaine','Le gardien','Le défenseur central','N’importe qui'], answer:1 },
    { q:'La Ligue des champions de l’UEFA concerne principalement des clubs de quel continent ?', options:['Afrique','Asie','Europe','Amérique du Sud'], answer:2 },
    { q:'Combien vaut un but dans le score d’un match de football ?', options:['1','2','3','6'], answer:0 }
  ]
};

const RIDDLE_BANK = [
  { q:'Je peux faire le tour du monde en restant dans un coin. Qui suis-je ?', answers:['timbre','un timbre'], hint:'On me colle sur une enveloppe.' },
  { q:'Plus je sèche, plus je deviens mouillé. Qui suis-je ?', answers:['serviette','une serviette'], hint:'On me trouve souvent dans une salle de bain.' },
  { q:'J’ai des aiguilles mais je ne pique pas. Qui suis-je ?', answers:['horloge','montre','une horloge','une montre'], hint:'Je donne l’heure.' },
  { q:'Je monte et je descends sans jamais bouger. Qui suis-je ?', answers:['escalier','un escalier'], hint:'On m’emprunte pour changer d’étage.' },
  { q:'Plus on m’enlève, plus je deviens grand. Qui suis-je ?', answers:['trou','un trou'], hint:'On peut me creuser.' },
  { q:'Je possède des clés mais aucune serrure. Qui suis-je ?', answers:['clavier','piano','un clavier','un piano'], hint:'Mes touches servent à écrire ou jouer de la musique.' }
];

const RPS_ALIASES = {
  pierre:'pierre', rock:'pierre', r:'pierre', '🪨':'pierre',
  feuille:'feuille', papier:'feuille', paper:'feuille', p:'feuille', '📄':'feuille',
  ciseaux:'ciseaux', scissors:'ciseaux', c:'ciseaux', s:'ciseaux', '✂️':'ciseaux'
};
const RPS_BEATS = { pierre:'ciseaux', ciseaux:'feuille', feuille:'pierre' };

function sid(){ return sessionContext.getCurrentSessionId(); }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function makeId(type){ const alias=crypto.randomBytes(4).toString('hex'); return { id:`${type}_${Date.now()}_${alias}`, alias }; }
function shuffle(items){
  const out=[...items];
  for(let i=out.length-1;i>0;i--){ const j=crypto.randomInt(0,i+1); [out[i],out[j]]=[out[j],out[i]]; }
  return out;
}
function cleanAnswer(v){ return norm(v).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); }
function ranking(scores={}){
  return Object.entries(scores).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])))
    .map(([userId,score],i)=>({rank:i+1,userId,score}));
}
function quizQuestion(game){ return game?.questions?.[Math.max(0,(game.round||1)-1)]||null; }
function brainQuestion(game){ return game?.questions?.[Math.max(0,(game.round||1)-1)]||null; }
function live(engine,game){ return engine.games.get(`${sid()}::${game.id}`); }
function makeMathQuestion(difficulty='easy'){
  const d=norm(difficulty);
  const max=d==='hard'?100:d==='medium'?50:20;
  const ops=d==='easy'?['+','-']:['+','-','*'];
  const op=ops[crypto.randomInt(0,ops.length)];
  let a=crypto.randomInt(1,max+1), b=crypto.randomInt(1,max+1);
  if(op==='-'&&b>a)[a,b]=[b,a];
  const answer=op==='+'?a+b:op==='-'?a-b:a*b;
  return {q:`${a} ${op} ${b} = ?`,answers:[String(answer)],hint:`Difficulté : ${d||'easy'}`};
}

if(typeof GameCenterEngine.prototype.findActiveByAlias!=='function'){
  GameCenterEngine.prototype.findActiveByAlias=function(ref,type=null){
    this._ensureLoaded(); this.cleanup();
    const wanted=norm(ref).replace(/^#/,'');
    return [...this.games.entries()]
      .filter(([k,g])=>k.startsWith(`${sid()}::`)&&g.status==='playing'&&(!type||g.type===type)&&(g.id===ref||norm(g.alias)===wanted))
      .map(([,g])=>clone(g));
  };
}

if(typeof GameCenterEngine.prototype.startQuiz!=='function'){
  GameCenterEngine.prototype.startQuiz=function(chatId,by,{category='general',rounds=5}={}){
    const error=this._startGuard(chatId,'quiz'); if(error)return {error};
    const cat=norm(category), bank=QUIZ_BANKS[cat]; if(!bank)return {error:'category'};
    rounds=Math.max(1,Math.min(Number(rounds)||5,bank.length,10));
    const ids=makeId('quiz'), questions=shuffle(bank).slice(0,rounds).map(clone);
    return this._put({id:ids.id,alias:ids.alias,chatId,type:'quiz',status:'playing',by,category:cat,round:1,rounds,questions,scores:{},roundAttempts:{},startedAt:Date.now()});
  };

  GameCenterEngine.prototype.answerQuiz=function(chatId,userId,input,ref=null){
    const g=this.get(chatId,ref,'quiz'); if(!g)return {handled:false};
    const raw=String(input).trim(); if(!/^[1-4]$/.test(raw))return {handled:false};
    const state=live(this,g), q=quizQuestion(state); if(!q)return {handled:false};
    if(Object.prototype.hasOwnProperty.call(state.roundAttempts,userId))return {handled:true,ok:false,reason:'already',game:clone(state)};
    const choice=Number(raw)-1; state.roundAttempts[userId]=choice;
    if(choice!==q.answer){ this._put(state); return {handled:true,ok:true,correct:false,game:clone(state)}; }
    state.scores[userId]=(state.scores[userId]||0)+1;
    const answerText=q.options[q.answer];
    if(state.round>=state.rounds){
      state.status='finished'; state.finishedAt=Date.now(); state.winner=ranking(state.scores)[0]?.userId||userId; this._put(state);
      return {handled:true,ok:true,correct:true,finished:true,answerText,ranking:ranking(state.scores),game:clone(state)};
    }
    state.round++; state.roundAttempts={}; this._put(state);
    return {handled:true,ok:true,correct:true,finished:false,answerText,nextQuestion:quizQuestion(state),game:clone(state)};
  };

  GameCenterEngine.prototype.skipQuiz=function(chatId,ref=null){
    const g=this.get(chatId,ref,'quiz'); if(!g)return null;
    const state=live(this,g), q=quizQuestion(state), answerText=q?.options?.[q.answer]||'—';
    if(state.round>=state.rounds){ state.status='finished'; state.finishedAt=Date.now(); this._put(state); return {finished:true,answerText,ranking:ranking(state.scores),game:clone(state)}; }
    state.round++; state.roundAttempts={}; this._put(state);
    return {finished:false,answerText,nextQuestion:quizQuestion(state),game:clone(state)};
  };
}

if(typeof GameCenterEngine.prototype.startBrain!=='function'){
  GameCenterEngine.prototype.startBrain=function(chatId,by,{kind='riddle',rounds=3,difficulty='easy'}={}){
    const k=norm(kind)==='math'?'math':'riddle', type=`brain-${k}`;
    const error=this._startGuard(chatId,type); if(error)return {error};
    rounds=Math.max(1,Math.min(Number(rounds)||3,10));
    let questions;
    if(k==='riddle'){
      rounds=Math.min(rounds,RIDDLE_BANK.length);
      questions=shuffle(RIDDLE_BANK).slice(0,rounds).map(clone);
    }else questions=Array.from({length:rounds},()=>makeMathQuestion(difficulty));
    const ids=makeId(type);
    return this._put({id:ids.id,alias:ids.alias,chatId,type,status:'playing',by,kind:k,difficulty:norm(difficulty)||'easy',round:1,rounds,questions,scores:{},attempts:{},wrong:0,startedAt:Date.now()});
  };

  GameCenterEngine.prototype.answerBrain=function(chatId,userId,input,ref=null){
    let g=null;
    if(ref){ const found=this.get(chatId,ref); if(found&&String(found.type).startsWith('brain-'))g=found; }
    else { const rows=this.list(chatId).filter(x=>String(x.type).startsWith('brain-')); if(rows.length===1)g=rows[0]; }
    if(!g)return {handled:false};
    const answer=cleanAnswer(input); if(!answer)return {handled:false};
    const state=live(this,g), q=brainQuestion(state); if(!q)return {handled:false};
    const key=`${state.round}:${answer}`; state.attempts[userId]=state.attempts[userId]||[];
    if(state.attempts[userId].includes(key))return {handled:true,ok:false,reason:'duplicate',game:clone(state)};
    state.attempts[userId].push(key);
    const accepted=(q.answers||[]).map(cleanAnswer), correct=accepted.includes(answer);
    if(!correct){ state.wrong=(state.wrong||0)+1; this._put(state); return {handled:true,ok:true,correct:false,hint:state.wrong>=3?q.hint||null:null,game:clone(state)}; }
    state.scores[userId]=(state.scores[userId]||0)+1; const answerText=q.answers?.[0]||answer;
    if(state.round>=state.rounds){
      state.status='finished'; state.finishedAt=Date.now(); state.winner=ranking(state.scores)[0]?.userId||userId; this._put(state);
      return {handled:true,ok:true,correct:true,finished:true,answerText,ranking:ranking(state.scores),game:clone(state)};
    }
    state.round++; state.attempts={}; state.wrong=0; this._put(state);
    return {handled:true,ok:true,correct:true,finished:false,answerText,nextQuestion:brainQuestion(state),game:clone(state)};
  };
}

if(typeof GameCenterEngine.prototype.startRps!=='function'){
  GameCenterEngine.prototype.startRps=function(chatId,by,opponent){
    const error=this._startGuard(chatId,'rps'); if(error)return {error};
    if(!opponent||opponent===by)return {error:'opponent'};
    const ids=makeId('rps');
    return this._put({id:ids.id,alias:ids.alias,chatId,type:'rps',status:'playing',by,players:[by,opponent],picks:{},startedAt:Date.now()});
  };

  GameCenterEngine.prototype.pickRps=function(userId,ref,input){
    const matches=this.findActiveByAlias(ref,'rps').filter(g=>g.players.includes(userId));
    if(!matches.length)return {handled:false,error:'not-found'};
    if(matches.length>1)return {handled:false,error:'ambiguous'};
    const g=matches[0], choice=RPS_ALIASES[norm(input)];
    if(!choice)return {handled:true,ok:false,reason:'choice',game:g};
    const state=live(this,g);
    if(state.picks[userId])return {handled:true,ok:false,reason:'already',game:clone(state)};
    state.picks[userId]=choice;
    const [a,b]=state.players;
    if(!state.picks[a]||!state.picks[b]){ this._put(state); return {handled:true,ok:true,waiting:true,choice,game:clone(state)}; }
    const ca=state.picks[a], cb=state.picks[b]; let winner=null;
    if(ca!==cb)winner=RPS_BEATS[ca]===cb?a:b;
    state.status='finished'; state.finishedAt=Date.now(); state.winner=winner; this._put(state);
    return {handled:true,ok:true,waiting:false,finished:true,draw:!winner,winner,choices:{[a]:ca,[b]:cb},game:clone(state)};
  };
}

module.exports={ QUIZ_BANKS,RIDDLE_BANK,RPS_ALIASES,quizQuestion,brainQuestion,ranking,cleanAnswer };
