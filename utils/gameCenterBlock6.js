'use strict';

const crypto = require('crypto');
const sessionContext = require('./sessionContext');
const { GameCenterEngine, norm } = require('./gameCenterEngine');

const MAX_ANON_TEXT = 400;
const MAX_ANON_PER_HOUR = 5;
const ANON_WINDOW_MS = 60 * 60 * 1000;
const MAX_ANON_META = 100;
const MAX_ANON_RATE_KEYS = 500;
const LINK_RE = /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me\/|t\.me\/|whatsapp\.com\/channel)/i;

function sid(){ return sessionContext.getCurrentSessionId(); }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function live(engine,game){ return engine.games.get(`${sid()}::${game.id}`); }
function cleanText(v){ return String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim(); }
function digest(value){ return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function senderHash(gameId,sender){ return digest(`${sid()}|${gameId}|${sender}`); }
function contentHash(text){ return digest(norm(text)); }
function cleanupRate(state,ts=Date.now()){
  state.anonRate=state.anonRate||{};
  for(const [key,entries] of Object.entries(state.anonRate)){
    const fresh=(Array.isArray(entries)?entries:[]).filter(e=>ts-Number(e.ts||0)<ANON_WINDOW_MS).slice(-MAX_ANON_PER_HOUR);
    if(fresh.length)state.anonRate[key]=fresh; else delete state.anonRate[key];
  }
  const keys=Object.keys(state.anonRate);
  if(keys.length>MAX_ANON_RATE_KEYS){
    keys.sort((a,b)=>{
      const at=state.anonRate[a]?.at(-1)?.ts||0,bt=state.anonRate[b]?.at(-1)?.ts||0;
      return bt-at;
    });
    for(const key of keys.slice(MAX_ANON_RATE_KEYS))delete state.anonRate[key];
  }
}

if(typeof GameCenterEngine.prototype.startAnonymousInbox!=='function'){
  GameCenterEngine.prototype.startAnonymousInbox=function(chatId,by){
    const error=this._startGuard(chatId,'anonymous-inbox'); if(error)return {error};
    const ids=this._newIdentity('anon');
    return this._put({id:ids.id,alias:ids.alias,chatId,type:'anonymous-inbox',status:'playing',by,count:0,questions:[],anonRate:{},startedAt:Date.now()});
  };

  GameCenterEngine.prototype.findAnonymousInbox=function(ref,{activeOnly=true}={}){
    this._ensureLoaded(); this.cleanup();
    const needle=String(ref||'').replace(/^#/,'').toLowerCase(); if(!needle)return null;
    for(const [key,g] of this.games){
      if(!key.startsWith(`${sid()}::`)||g.type!=='anonymous-inbox')continue;
      if(activeOnly&&g.status!=='playing')continue;
      if(String(g.alias||'').toLowerCase()===needle||g.id===ref)return clone(g);
    }
    return null;
  };

  GameCenterEngine.prototype.submitAnonymousQuestion=function(ref,sender,text){
    const g=this.findAnonymousInbox(ref); if(!g)return {error:'not-found'};
    const question=cleanText(text);
    if(question.length<3)return {error:'short'};
    if(question.length>MAX_ANON_TEXT)return {error:'long',max:MAX_ANON_TEXT};
    if(LINK_RE.test(question))return {error:'links'};
    const state=live(this,g),ts=Date.now(); cleanupRate(state,ts);
    const sh=senderHash(state.id,sender),ch=contentHash(question),entries=state.anonRate[sh]||[];
    if(entries.length>=MAX_ANON_PER_HOUR)return {error:'rate',limit:MAX_ANON_PER_HOUR};
    if(entries.some(e=>e.contentHash===ch))return {error:'duplicate'};
    const questionId=`AQ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const rateEntry={ts,contentHash:ch,questionId};
    state.anonRate[sh]=[...entries,rateEntry].slice(-MAX_ANON_PER_HOUR);
    state.questions=[...(state.questions||[]),{id:questionId,ts}].slice(-MAX_ANON_META);
    state.count=(state.count||0)+1;
    this._put(state);
    return {ok:true,questionId,question,chatId:state.chatId,alias:state.alias,rateToken:{senderHash:sh,contentHash:ch,questionId,ts}};
  };

  GameCenterEngine.prototype.rollbackAnonymousQuestion=function(ref,rateToken){
    const g=this.findAnonymousInbox(ref); if(!g||!rateToken)return false;
    const state=live(this,g),key=rateToken.senderHash;
    state.questions=(state.questions||[]).filter(q=>q.id!==rateToken.questionId);
    state.count=Math.max(0,(state.count||0)-1);
    const entries=(state.anonRate?.[key]||[]).filter(e=>!(e.questionId===rateToken.questionId&&e.contentHash===rateToken.contentHash));
    if(entries.length)state.anonRate[key]=entries; else if(state.anonRate)delete state.anonRate[key];
    this._put(state); return true;
  };

  GameCenterEngine.prototype.closeAnonymousInbox=function(chatId,ref=null){
    const g=this.get(chatId,ref,'anonymous-inbox'); if(!g)return null;
    const state=live(this,g); state.status='closed'; state.closedAt=Date.now(); state.anonRate={}; this._put(state); return clone(state);
  };
}

module.exports={
  MAX_ANON_TEXT,MAX_ANON_PER_HOUR,ANON_WINDOW_MS,MAX_ANON_META,MAX_ANON_RATE_KEYS,LINK_RE,
  cleanText,digest,senderHash,contentHash,cleanupRate
};
