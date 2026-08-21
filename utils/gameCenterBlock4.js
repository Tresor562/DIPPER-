'use strict';

const crypto = require('crypto');
const sessionContext = require('./sessionContext');
const { GameCenterEngine, norm } = require('./gameCenterEngine');

const MAX_CLUE_ATTEMPTS = 8;
const HINT_EVERY_WRONG = 3;

const CHARACTER_BANK = [
  { category:'anime', clue:'🍥🥷🟠', hints:['C’est un ninja de Konoha.','Il rêve de devenir Hokage.'], answers:['naruto','naruto uzumaki'] },
  { category:'anime', clue:'🏴‍☠️👒🍖', hints:['C’est un pirate.','Il veut devenir le Roi des Pirates.'], answers:['luffy','monkey d luffy','monkey d. luffy'] },
  { category:'anime', clue:'⚪👓♾️', hints:['C’est un exorciste extrêmement puissant.','Il enseigne à Yuji, Megumi et Nobara.'], answers:['gojo','satoru gojo','gojo satoru'] },
  { category:'anime', clue:'🐉🥋☁️', hints:['C’est un Saiyan.','Il a grandi sur Terre.'], answers:['goku','son goku','songoku'] },
  { category:'anime', clue:'⚔️🌊👺', hints:['Il combat des démons.','Sa sœur s’appelle Nezuko.'], answers:['tanjiro','tanjiro kamado','kamado tanjiro'] },
  { category:'anime', clue:'🧱🪽⚔️', hints:['Il vit derrière de gigantesques murs.','Son nom de famille est Yeager.'], answers:['eren','eren yeager','eren jaeger'] },
  { category:'film', clue:'🦇🌃🖤', hints:['Il protège Gotham.','Son identité civile est Bruce Wayne.'], answers:['batman','bruce wayne'] },
  { category:'film', clue:'🕷️🕸️🦸', hints:['Ses pouvoirs sont liés à une araignée.','On l’appelle aussi Peter Parker dans une de ses identités les plus connues.'], answers:['spiderman','spider man','spider-man','peter parker'] },
  { category:'game', clue:'🍄🔴👨‍🔧', hints:['C’est un personnage de Nintendo.','Il porte souvent une casquette rouge.'], answers:['mario','super mario'] },
  { category:'game', clue:'💙🦔💨', hints:['Il est extrêmement rapide.','C’est un hérisson bleu.'], answers:['sonic','sonic the hedgehog'] }
];

const SONG_BANK = [
  { category:'international', clue:'🌃✨💡', hints:['Interprétée par The Weeknd.','Le titre parle de lumières éblouissantes.'], answers:['blinding lights'] },
  { category:'international', clue:'🌫️🎧🚶', hints:['Un grand succès d’Alan Walker.','Son titre signifie « disparu/estompé » en anglais.'], answers:['faded'] },
  { category:'international', clue:'🙏🔥🎵', hints:['Un titre d’Imagine Dragons.','Le titre désigne une personne qui croit.'], answers:['believer'] },
  { category:'international', clue:'👤📐❤️', hints:['Un titre d’Ed Sheeran.','Le titre évoque la forme d’une personne.'], answers:['shape of you'] },
  { category:'anime', clue:'🌺⚔️👹', hints:['Opening associé à Demon Slayer.','Interprété par LiSA.'], answers:['gurenge'] },
  { category:'anime', clue:'🕷️🌃👁️', hints:['Opening très connu de Tokyo Ghoul.','Interprété par TK from Ling tosite sigure.'], answers:['unravel'] },
  { category:'anime', clue:'🐦💙🍃', hints:['Opening associé à Naruto Shippuden.','Interprété par Ikimono-gakari.'], answers:['blue bird','bluebird'] },
  { category:'anime', clue:'👤🌅🍃', hints:['Opening associé à Naruto Shippuden.','Interprété par KANA-BOON.'], answers:['silhouette'] }
];

const SCREEN_BANK = [
  { category:'anime', clue:'🍥🥷🏘️', hints:['Une série de ninjas.','Son héros veut devenir Hokage.'], answers:['naruto'] },
  { category:'anime', clue:'🏴‍☠️👒🌊', hints:['Une aventure de pirates.','L’équipage principal navigue sous le nom de Chapeau de Paille.'], answers:['one piece','onepiece'] },
  { category:'anime', clue:'📓☠️🍎', hints:['Un carnet permet de tuer en écrivant un nom.','Light Yagami est au centre de l’histoire.'], answers:['death note','deathnote'] },
  { category:'anime', clue:'🧱巨⚔️', hints:['L’humanité vit derrière des murs.','Les Titans menacent les survivants.'], answers:['attack on titan','aot','shingeki no kyojin','l attaque des titans','lattaque des titans'] },
  { category:'anime', clue:'👹⚔️🎴', hints:['Des pourfendeurs combattent des démons.','Tanjiro et Nezuko sont au centre de l’histoire.'], answers:['demon slayer','kimetsu no yaiba'] },
  { category:'film', clue:'🚢🧊💔', hints:['Un paquebot rencontre un iceberg.','Jack et Rose sont deux personnages centraux.'], answers:['titanic'] },
  { category:'film', clue:'💊🟢💻', hints:['Un choix entre deux pilules change la perception du monde.','Neo découvre une réalité simulée.'], answers:['matrix','the matrix'] },
  { category:'film', clue:'🚀🕳️🌌', hints:['Un voyage spatial cherche un nouvel avenir pour l’humanité.','Le temps ne s’écoule pas partout de la même façon.'], answers:['interstellar'] },
  { category:'film', clue:'🦁👑🌅', hints:['Un jeune lion doit retrouver sa place.','Simba en est le personnage principal.'], answers:['le roi lion','roi lion','the lion king','lion king'] },
  { category:'film', clue:'🦸‍♂️🦸‍♀️⏳💎', hints:['Des héros affrontent Thanos.','Le récit implique les Pierres d’Infinité et un voyage dans le temps.'], answers:['avengers endgame','endgame','avengers: endgame'] }
];

const KIND_CONFIG = {
  character:{type:'guess-character',bank:CHARACTER_BANK,categories:new Set(['anime','film','game','mix'])},
  song:{type:'guess-song',bank:SONG_BANK,categories:new Set(['anime','international','mix'])},
  screen:{type:'guess-screen',bank:SCREEN_BANK,categories:new Set(['anime','film','mix'])}
};
const GUESS_TYPES = new Set(Object.values(KIND_CONFIG).map(x=>x.type));

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
function clueQuestion(game){ return game?.questions?.[Math.max(0,(game.round||1)-1)]||null; }
function typeForKind(kind){ return KIND_CONFIG[norm(kind)]?.type||null; }
function kindForType(type){ return Object.entries(KIND_CONFIG).find(([,cfg])=>cfg.type===type)?.[0]||null; }
function availableCategories(kind){ return [...(KIND_CONFIG[norm(kind)]?.categories||[])]; }
function selectBank(kind,category){
  const cfg=KIND_CONFIG[norm(kind)]; if(!cfg)return null;
  const cat=norm(category)||'mix'; if(!cfg.categories.has(cat))return null;
  return cat==='mix'?cfg.bank:cfg.bank.filter(item=>item.category===cat);
}
function currentHint(state){
  const q=clueQuestion(state), wrong=Number(state.wrong||0);
  if(!q?.hints?.length||wrong<HINT_EVERY_WRONG)return null;
  const index=Math.min(Math.floor(wrong/HINT_EVERY_WRONG)-1,q.hints.length-1);
  return q.hints[index]||null;
}

if(typeof GameCenterEngine.prototype.startClueGame!=='function'){
  GameCenterEngine.prototype.startClueGame=function(chatId,by,{kind='character',category='mix',rounds=3}={}){
    const k=norm(kind), cfg=KIND_CONFIG[k]; if(!cfg)return {error:'kind'};
    const cat=norm(category)||'mix', bank=selectBank(k,cat); if(!bank)return {error:'category'};
    const error=this._startGuard(chatId,cfg.type); if(error)return {error};
    rounds=Math.max(1,Math.min(Number(rounds)||3,bank.length,10));
    const ids=this._newIdentity(cfg.type), questions=shuffle(bank).slice(0,rounds).map(clone);
    return this._put({id:ids.id,alias:ids.alias,chatId,type:cfg.type,status:'playing',by,kind:k,category:cat,round:1,rounds,questions,scores:{},attempts:{},wrong:0,startedAt:Date.now()});
  };

  GameCenterEngine.prototype.answerClueGame=function(chatId,userId,input,ref=null){
    const answer=cleanAnswer(input);
    if(answer.length<2||!/[a-z]/.test(answer))return {handled:false};
    let g=null;
    if(ref){
      const found=this.get(chatId,ref); if(found&&GUESS_TYPES.has(found.type))g=found;
    }else{
      const rows=this.list(chatId).filter(x=>GUESS_TYPES.has(x.type)); if(rows.length===1)g=rows[0];
    }
    if(!g)return {handled:false};
    const state=live(this,g), q=clueQuestion(state); if(!q)return {handled:false};
    const player=state.attempts[userId]||{count:0,seen:[]};
    if(player.count>=MAX_CLUE_ATTEMPTS)return {handled:true,ok:false,reason:'limit',game:clone(state)};
    if(player.seen.includes(answer))return {handled:true,ok:false,reason:'duplicate',game:clone(state)};
    player.count++; player.seen.push(answer); player.seen=player.seen.slice(-MAX_CLUE_ATTEMPTS); state.attempts[userId]=player;
    const accepted=(q.answers||[]).map(cleanAnswer), correct=accepted.includes(answer);
    if(!correct){ state.wrong=(state.wrong||0)+1; this._put(state); return {handled:true,ok:true,correct:false,hint:currentHint(state),attemptsLeft:MAX_CLUE_ATTEMPTS-player.count,game:clone(state)}; }
    state.scores[userId]=(state.scores[userId]||0)+1;
    const answerText=q.answers?.[0]||answer;
    if(state.round>=state.rounds){
      state.status='finished'; state.finishedAt=Date.now(); state.winner=ranking(state.scores)[0]?.userId||userId; this._put(state);
      return {handled:true,ok:true,correct:true,finished:true,answerText,ranking:ranking(state.scores),game:clone(state)};
    }
    state.round++; state.attempts={}; state.wrong=0; this._put(state);
    return {handled:true,ok:true,correct:true,finished:false,answerText,nextQuestion:clueQuestion(state),game:clone(state)};
  };

  GameCenterEngine.prototype.skipClueGame=function(chatId,ref=null){
    let g=null;
    if(ref){ const found=this.get(chatId,ref); if(found&&GUESS_TYPES.has(found.type))g=found; }
    else { const rows=this.list(chatId).filter(x=>GUESS_TYPES.has(x.type)); if(rows.length===1)g=rows[0]; }
    if(!g)return null;
    const state=live(this,g), q=clueQuestion(state), answerText=q?.answers?.[0]||'—';
    if(state.round>=state.rounds){
      state.status='finished'; state.finishedAt=Date.now(); this._put(state);
      return {finished:true,answerText,ranking:ranking(state.scores),game:clone(state)};
    }
    state.round++; state.attempts={}; state.wrong=0; this._put(state);
    return {finished:false,answerText,nextQuestion:clueQuestion(state),game:clone(state)};
  };
}

module.exports={
  CHARACTER_BANK,SONG_BANK,SCREEN_BANK,KIND_CONFIG,GUESS_TYPES,
  MAX_CLUE_ATTEMPTS,HINT_EVERY_WRONG,
  cleanAnswer,ranking,clueQuestion,typeForKind,kindForType,availableCategories,currentHint
};
