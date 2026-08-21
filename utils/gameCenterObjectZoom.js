'use strict';

const sharp=require('sharp');
const sessionContext=require('./sessionContext');
const {GameCenterEngine}=require('./gameCenterEngine');
const {profiles}=require('./gameCenterProfiles');

const MAX_OBJECT_ANSWER=80;
const MAX_OBJECT_ATTEMPTS_PER_PLAYER=8;
function sid(){return sessionContext.getCurrentSessionId();}
function clone(v){return JSON.parse(JSON.stringify(v));}
function live(engine,g){return engine.games.get(`${sid()}::${g.id}`);}
function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function cleanAnswer(v){return String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,MAX_OBJECT_ANSWER);}

async function makeZoomBuffer(buffer,{ratio=0.34,size=640}={}){
  if(!Buffer.isBuffer(buffer)||buffer.length<16)throw new Error('OBJECT_ZOOM_INVALID_MEDIA');
  ratio=Math.max(0.18,Math.min(0.65,Number(ratio)||0.34));
  size=Math.max(256,Math.min(1024,Math.trunc(Number(size)||640)));
  const image=sharp(buffer,{failOn:'error'}).rotate();
  const meta=await image.metadata();
  if(!meta.width||!meta.height)throw new Error('OBJECT_ZOOM_NO_DIMENSIONS');
  const cropW=Math.max(1,Math.floor(meta.width*ratio));
  const cropH=Math.max(1,Math.floor(meta.height*ratio));
  const left=Math.max(0,Math.floor((meta.width-cropW)/2));
  const top=Math.max(0,Math.floor((meta.height-cropH)/2));
  return image.extract({left,top,width:cropW,height:cropH}).resize(size,size,{fit:'cover'}).jpeg({quality:86}).toBuffer();
}

if(typeof GameCenterEngine.prototype.startObjectZoom!=='function'){
  GameCenterEngine.prototype.startObjectZoom=function(chatId,by,answer){
    const clean=cleanAnswer(answer),normalized=norm(clean);
    if(normalized.length<2)return{error:'answer'};
    const error=this._startGuard(chatId,'object-zoom');if(error)return{error};
    const ids=this._newIdentity('object');
    return this._put({id:ids.id,alias:ids.alias,chatId,type:'object-zoom',status:'playing',by,answer:clean,normalizedAnswer:normalized,attempts:{},totalAttempts:0,startedAt:Date.now()});
  };
  GameCenterEngine.prototype.guessObjectZoom=function(chatId,userId,input,ref=null){
    const g=this.get(chatId,ref,'object-zoom');if(!g)return{handled:false};
    if(userId===g.by)return{handled:true,ok:false,reason:'host',game:clone(g)};
    const guess=norm(input);if(guess.length<2)return{handled:true,ok:false,reason:'short',game:clone(g)};
    const state=live(this,g);state.attempts=state.attempts||{};state.attempts[userId]=state.attempts[userId]||[];
    if(state.attempts[userId].includes(guess))return{handled:true,ok:false,reason:'duplicate',game:clone(state)};
    if(state.attempts[userId].length>=MAX_OBJECT_ATTEMPTS_PER_PLAYER)return{handled:true,ok:false,reason:'limit',game:clone(state)};
    state.attempts[userId].push(guess);state.totalAttempts=(state.totalAttempts||0)+1;
    const won=guess===state.normalizedAnswer;
    if(won){state.status='finished';state.winner=userId;state.finishedAt=Date.now();this._put(state);profiles.addXp(userId,40);profiles.addCoins(userId,30);profiles.recordResult(userId,'win');return{handled:true,ok:true,won:true,answer:state.answer,game:clone(state)};}
    this._put(state);return{handled:true,ok:true,won:false,remaining:MAX_OBJECT_ATTEMPTS_PER_PLAYER-state.attempts[userId].length,game:clone(state)};
  };
}

module.exports={MAX_OBJECT_ANSWER,MAX_OBJECT_ATTEMPTS_PER_PLAYER,norm,cleanAnswer,makeZoomBuffer};
