'use strict';

const crypto=require('crypto');
const sessionContext=require('./sessionContext');
const {GameCenterEngine}=require('./gameCenterEngine');
const {profiles}=require('./gameCenterProfiles');

const MAX_WRONG=8;
const BANK={
  anime:['naruto','sukuna','eren','tanjiro','luffy','gojo','itachi','levi','nezuko','madara','aizen','mikasa'],
  tech:['javascript','python','docker','github','mongodb','linux','react','nodejs','firewall','algorithme','serveur','terminal'],
  general:['planete','chocolat','montagne','elephant','bibliotheque','parapluie','ordinateur','ocean','volcan','musique','voyage','histoire']
};
function sid(){return sessionContext.getCurrentSessionId();}
function clone(v){return JSON.parse(JSON.stringify(v));}
function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
function live(engine,g){return engine.games.get(`${sid()}::${g.id}`);}
function maskWord(answer,letters=[]){const set=new Set(letters);return [...answer].map(ch=>set.has(ch)?ch.toUpperCase():'_').join(' ');}
function complete(answer,letters=[]){const set=new Set(letters);return [...new Set([...answer])].every(ch=>set.has(ch));}
function randomWord(category,randomInt=crypto.randomInt){const words=BANK[category]||null;if(!words)return null;return words[randomInt(0,words.length)];}

if(typeof GameCenterEngine.prototype.startHangman!=='function'){
  GameCenterEngine.prototype.startHangman=function(chatId,by,{category='general',randomInt=crypto.randomInt}={}){
    category=String(category||'general').toLowerCase();const answer=randomWord(category,randomInt);if(!answer)return{error:'category'};const error=this._startGuard(chatId,'hangman');if(error)return{error};const ids=this._newIdentity('hangman');return this._put({id:ids.id,alias:ids.alias,chatId,type:'hangman',status:'playing',by,category,answer,letters:[],wrong:[],wrongCount:0,maxWrong:MAX_WRONG,startedAt:Date.now()});
  };
  GameCenterEngine.prototype.playHangman=function(chatId,userId,input,ref=null){
    const g=this.get(chatId,ref,'hangman');if(!g)return{handled:false};const state=live(this,g),guess=norm(input);if(!guess)return{handled:true,ok:false,reason:'empty',game:clone(state)};
    if(guess.length===1){
      if(state.letters.includes(guess)||state.wrong.includes(guess))return{handled:true,ok:false,reason:'duplicate',guess,game:clone(state),mask:maskWord(state.answer,state.letters)};
      if(state.answer.includes(guess))state.letters.push(guess);else{state.wrong.push(guess);state.wrongCount++;}
    }else{
      if(guess===state.answer){state.letters=[...new Set([...state.answer])];}
      else{if(state.wrong.includes(guess))return{handled:true,ok:false,reason:'duplicate',guess,game:clone(state),mask:maskWord(state.answer,state.letters)};state.wrong.push(guess);state.wrongCount++;}
    }
    const won=complete(state.answer,state.letters),lost=!won&&state.wrongCount>=state.maxWrong;state.updatedAt=Date.now();
    if(won||lost){state.status='finished';state.finishedAt=Date.now();state.winner=won?userId:null;this._put(state);if(won){profiles.addXp(userId,30);profiles.addCoins(userId,20);profiles.recordResult(userId,'win');}return{handled:true,ok:true,won,lost,answer:state.answer,guess,mask:maskWord(state.answer,state.letters),game:clone(state)};}
    this._put(state);return{handled:true,ok:true,won:false,lost:false,correct:guess.length===1?state.answer.includes(guess):false,guess,mask:maskWord(state.answer,state.letters),remaining:state.maxWrong-state.wrongCount,game:clone(state)};
  };
}
module.exports={BANK,MAX_WRONG,norm,maskWord,complete,randomWord};
