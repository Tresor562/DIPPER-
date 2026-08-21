'use strict';

const crypto = require('crypto');
const sessionContext = require('./sessionContext');
const { GameCenterEngine } = require('./gameCenterEngine');

const MIN_SECRET_PLAYERS = 3;
const MAX_SECRET_PLAYERS = 60;

function sid(){ return sessionContext.getCurrentSessionId(); }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function live(engine,game){ return engine.games.get(`${sid()}::${game.id}`); }
function ranking(scores={}){
  return Object.entries(scores).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])))
    .map(([userId,score],i)=>({rank:i+1,userId,score}));
}
function uniqueIds(ids=[]){ return [...new Set(ids.map(String).filter(Boolean))]; }
function sattolo(ids=[]){
  const source=uniqueIds(ids), targets=[...source];
  for(let i=targets.length-1;i>0;i--){
    const j=crypto.randomInt(0,i);
    [targets[i],targets[j]]=[targets[j],targets[i]];
  }
  return source.map((from,i)=>({from,to:targets[i]}));
}
function buildSecretFriendPlan(ids=[]){
  const players=uniqueIds(ids);
  if(players.length<MIN_SECRET_PLAYERS)return {error:'min'};
  if(players.length>MAX_SECRET_PLAYERS)return {error:'max'};
  const pairs=sattolo(players);
  if(pairs.some(pair=>pair.from===pair.to))throw new Error('SECRET_FRIEND_DERANGEMENT_FAILED');
  if(new Set(pairs.map(pair=>pair.to)).size!==players.length)throw new Error('SECRET_FRIEND_TARGET_DUPLICATE');
  return {players,pairs};
}
function participantDigest(ids=[]){ return crypto.createHash('sha256').update(uniqueIds(ids).sort().join('|')).digest('hex'); }
function crownOfDay(chatId,ids=[],mode='crown',dateKey=null){
  const players=uniqueIds(ids).sort(); if(!players.length)return null;
  const day=dateKey||new Date().toISOString().slice(0,10);
  const digest=crypto.createHash('sha256').update(`${sid()}|${chatId}|${day}|${mode}|${players.join('|')}`).digest();
  const index=digest.readUInt32BE(0)%players.length;
  return {day,mode,winner:players[index],count:players.length};
}

if(typeof GameCenterEngine.prototype.startBestMember!=='function'){
  GameCenterEngine.prototype.startBestMember=function(chatId,by){
    const error=this._startGuard(chatId,'best-member'); if(error)return {error};
    const ids=this._newIdentity('bestmember');
    return this._put({id:ids.id,alias:ids.alias,chatId,type:'best-member',status:'playing',by,votes:{},startedAt:Date.now()});
  };

  GameCenterEngine.prototype.voteBestMember=function(chatId,voter,target,ref=null){
    const g=this.get(chatId,ref,'best-member'); if(!g)return {handled:false};
    if(!target)return {handled:true,ok:false,reason:'target',game:g};
    if(target===voter)return {handled:true,ok:false,reason:'self',game:g};
    const state=live(this,g); state.votes[voter]=target; this._put(state);
    const counts={}; Object.values(state.votes).forEach(id=>{ counts[id]=(counts[id]||0)+1; });
    return {handled:true,ok:true,target,counts,game:clone(state)};
  };

  GameCenterEngine.prototype.closeBestMember=function(chatId,ref=null){
    const g=this.get(chatId,ref,'best-member'); if(!g)return null;
    const state=live(this,g),counts={}; Object.values(state.votes).forEach(id=>{ counts[id]=(counts[id]||0)+1; });
    const board=ranking(counts),max=board[0]?.score||0,winners=board.filter(x=>x.score===max&&max>0).map(x=>x.userId);
    state.status='finished'; state.finishedAt=Date.now(); state.winners=winners; state.totalVotes=Object.keys(state.votes).length; this._put(state);
    return {winners,totalVotes:state.totalVotes,ranking:board,game:clone(state)};
  };
}

if(typeof GameCenterEngine.prototype.startSecretFriend!=='function'){
  GameCenterEngine.prototype.startSecretFriend=function(chatId,by,participantIds=[]){
    const plan=buildSecretFriendPlan(participantIds); if(plan.error)return {error:plan.error};
    const error=this._startGuard(chatId,'secret-friend'); if(error)return {error};
    const ids=this._newIdentity('secretfriend');
    const state=this._put({
      id:ids.id,alias:ids.alias,chatId,type:'secret-friend',status:'playing',by,
      participantCount:plan.players.length,participantDigest:participantDigest(plan.players),
      startedAt:Date.now()
    });
    return {...state,secretPlan:plan.pairs};
  };

  GameCenterEngine.prototype.finishSecretFriend=function(chatId,ref,{sent=0,failed=0,cancelled=false}={}){
    const g=this.get(chatId,ref,'secret-friend'); if(!g)return null;
    const state=live(this,g),isCancelled=Boolean(cancelled||Number(failed)>0);
    state.status=isCancelled?'cancelled':'finished';
    state.finishedAt=Date.now();
    if(isCancelled)state.cancelledAt=state.finishedAt;
    state.delivery={sent:Number(sent)||0,failed:Number(failed)||0};
    this._put(state);
    return clone(state);
  };
}

module.exports={
  MIN_SECRET_PLAYERS,MAX_SECRET_PLAYERS,
  ranking,uniqueIds,sattolo,buildSecretFriendPlan,participantDigest,crownOfDay
};
