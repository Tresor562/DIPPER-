'use strict';

const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const sessionContext=require('./sessionContext');
const {profiles}=require('./gameCenterProfiles');

const MIN_WOLF_PLAYERS=5,MAX_WOLF_PLAYERS=15,WOLF_TTL_MS=12*60*60*1000;
const ROLE_LABELS={wolf:'🐺 Loup-Garou',seer:'🔮 Voyant(e)',doctor:'💉 Médecin',villager:'🧑 Villageois(e)'};
function sid(){return sessionContext.getCurrentSessionId();}
function clone(v){return JSON.parse(JSON.stringify(v));}
function shuffle(list,randomInt=crypto.randomInt){const out=[...list];for(let i=out.length-1;i>0;i--){const j=randomInt(0,i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
function buildRoles(count,randomInt=crypto.randomInt){const wolves=Math.max(1,Math.floor(count/4)),roles=Array(wolves).fill('wolf');if(count>=6)roles.push('seer');if(count>=7)roles.push('doctor');while(roles.length<count)roles.push('villager');return shuffle(roles,randomInt);}
function alivePlayers(g){return g.players.filter(p=>g.alive[p]);}
function roleCount(g,role){return alivePlayers(g).filter(p=>g.roles[p]===role).length;}
function checkWinner(g){const wolves=roleCount(g,'wolf'),alive=alivePlayers(g).length,others=alive-wolves;if(wolves===0)return'village';if(wolves>=others)return'wolves';return null;}
function indexTarget(g,n,{aliveOnly=true}={}){const i=Number(n)-1;if(!Number.isInteger(i)||i<0||i>=g.players.length)return null;const p=g.players[i];if(aliveOnly&&!g.alive[p])return null;return p;}
function rosterText(g,{reveal=false}={}){return g.players.map((p,i)=>`${i+1}. @${String(p).split('@')[0]} ${g.alive[p]?'🟢':'💀'}${reveal?` — ${ROLE_LABELS[g.roles[p]]}`:''}`).join('\n');}
function publicState(g){return{alias:g.alias,chatId:g.chatId,host:g.host,phase:g.phase,round:g.round,players:[...g.players],alive:{...g.alive},aliveCount:alivePlayers(g).length,createdAt:g.createdAt,updatedAt:g.updatedAt};}

class WerewolfStore{
  constructor({root=path.join(process.cwd(),'database','game-center')}={}){this.root=root;this.sessions=new Map();}
  _file(session=sid()){return path.join(this.root,session,'werewolf-private.json');}
  _ensure(){const session=sid();if(this.sessions.has(session))return this.sessions.get(session);let state={version:1,games:{}};try{const data=JSON.parse(fs.readFileSync(this._file(session),'utf8'));if(data?.games)state=data;}catch(_){}this.sessions.set(session,state);this.cleanup();return state;}
  _save(){const file=this._file(),state=this._ensure();fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(state,null,2));fs.renameSync(tmp,file);}
  cleanup(ts=Date.now()){const state=this.sessions.get(sid());if(!state)return;let dirty=false;for(const [chat,g] of Object.entries(state.games)){if(ts-Number(g.updatedAt||g.createdAt||0)>WOLF_TTL_MS){delete state.games[chat];dirty=true;}}if(dirty)this._save();}
  _newAlias(){const state=this._ensure();for(let i=0;i<32;i++){const a=crypto.randomBytes(6).toString('hex');if(!Object.values(state.games).some(g=>g.alias===a))return a;}throw new Error('WOLF_ID_EXHAUSTED');}
  get(chatId){const g=this._ensure().games[chatId];return g?clone(g):null;}
  public(chatId){const g=this._ensure().games[chatId];return g?publicState(g):null;}
  find(alias){const n=String(alias||'').replace(/^#/,'').toLowerCase();for(const g of Object.values(this._ensure().games))if(g.alias===n)return clone(g);return null;}
  _liveByAlias(alias){const found=this.find(alias);return found?this._ensure().games[found.chatId]:null;}
  create(chatId,host){const state=this._ensure();if(state.games[chatId])return{error:'duplicate'};const ts=Date.now(),alias=this._newAlias();state.games[chatId]={alias,id:`wolf_${ts.toString(36)}_${alias}`,chatId,host,phase:'lobby',round:0,players:[host],roles:{},alive:{[host]:true},night:{kills:{},save:null,seerDone:false,doctorDone:false},votes:{},createdAt:ts,updatedAt:ts};this._save();return publicState(state.games[chatId]);}
  join(chatId,userId){const g=this._ensure().games[chatId];if(!g)return{error:'not-found'};if(g.phase!=='lobby')return{error:'started'};if(g.players.includes(userId))return{error:'joined'};if(g.players.length>=MAX_WOLF_PLAYERS)return{error:'full'};g.players.push(userId);g.alive[userId]=true;g.updatedAt=Date.now();this._save();return{ok:true,game:publicState(g)};}
  leave(chatId,userId){const g=this._ensure().games[chatId];if(!g)return{error:'not-found'};if(g.phase!=='lobby')return{error:'started'};if(!g.players.includes(userId))return{error:'not-player'};if(userId===g.host){delete this._ensure().games[chatId];this._save();return{ok:true,cancelled:true};}g.players=g.players.filter(p=>p!==userId);delete g.alive[userId];g.updatedAt=Date.now();this._save();return{ok:true,game:publicState(g)};}
  start(chatId,by,{randomInt=crypto.randomInt}={}){const g=this._ensure().games[chatId];if(!g)return{error:'not-found'};if(g.host!==by)return{error:'host'};if(g.phase!=='lobby')return{error:'started'};if(g.players.length<MIN_WOLF_PLAYERS)return{error:'players'};const roles=buildRoles(g.players.length,randomInt);g.roles={};g.players.forEach((p,i)=>g.roles[p]=roles[i]);g.phase='night';g.round=1;g.night={kills:{},save:null,seerDone:!Object.values(g.roles).includes('seer'),doctorDone:!Object.values(g.roles).includes('doctor')};g.votes={};g.updatedAt=Date.now();this._save();return{ok:true,game:clone(g)};}
  role(alias,userId){const g=this._liveByAlias(alias);if(!g||!g.players.includes(userId))return null;return{role:g.roles[userId],alive:g.alive[userId],chatId:g.chatId,alias:g.alias,roster:rosterText(g)};}
  nightAction(alias,userId,action,targetNumber,{randomInt=crypto.randomInt}={}){
    const g=this._liveByAlias(alias);if(!g)return{error:'not-found'};if(g.phase!=='night')return{error:'phase'};if(!g.alive[userId])return{error:'dead'};const role=g.roles[userId],target=indexTarget(g,targetNumber);if(!target)return{error:'target'};if(target===userId&&action!=='save')return{error:'self'};
    if(action==='kill'){if(role!=='wolf')return{error:'role'};if(g.roles[target]==='wolf')return{error:'wolf-target'};g.night.kills[userId]=target;}
    else if(action==='see'){if(role!=='seer')return{error:'role'};if(g.night.seerDone)return{error:'done'};g.night.seerDone=true;g.night.seerTarget=target;}
    else if(action==='save'){if(role!=='doctor')return{error:'role'};if(g.night.doctorDone)return{error:'done'};g.night.doctorDone=true;g.night.save=target;}
    else return{error:'action'};
    g.updatedAt=Date.now();this._save();const ready=this.nightReady(g);const seen=action==='see'?g.roles[target]:null;let resolution=null;if(ready)resolution=this.resolveNight(g.chatId,{randomInt});return{ok:true,seen,target,ready,resolution};
  }
  nightReady(gameOrChat){const g=typeof gameOrChat==='string'?this._ensure().games[gameOrChat]:gameOrChat;if(!g||g.phase!=='night')return false;const wolves=alivePlayers(g).filter(p=>g.roles[p]==='wolf');return wolves.every(p=>g.night.kills[p])&&g.night.seerDone&&g.night.doctorDone;}
  resolveNight(chatId,{randomInt=crypto.randomInt}={}){const g=this._ensure().games[chatId];if(!g||g.phase!=='night')return{error:'phase'};const votes={};for(const t of Object.values(g.night.kills||{}))votes[t]=(votes[t]||0)+1;let victim=null;const entries=Object.entries(votes);if(entries.length){const max=Math.max(...entries.map(([,v])=>v)),tied=entries.filter(([,v])=>v===max).map(([p])=>p);victim=tied[randomInt(0,tied.length)];}const saved=victim&&g.night.save===victim;if(victim&&!saved)g.alive[victim]=false;const winner=checkWinner(g);if(winner)return this.finish(chatId,winner,{nightVictim:victim,saved});g.phase='day';g.votes={};g.updatedAt=Date.now();this._save();return{ok:true,finished:false,victim,saved,game:publicState(g)};}
  vote(chatId,userId,targetNumber){const g=this._ensure().games[chatId];if(!g||g.phase!=='day')return{error:'phase'};if(!g.alive[userId])return{error:'dead'};const target=indexTarget(g,targetNumber);if(!target)return{error:'target'};if(target===userId)return{error:'self'};g.votes[userId]=target;g.updatedAt=Date.now();this._save();const alive=alivePlayers(g),ready=alive.every(p=>g.votes[p]);let resolution=null;if(ready)resolution=this.resolveDay(chatId);return{ok:true,target,ready,resolution};}
  resolveDay(chatId){const g=this._ensure().games[chatId];if(!g||g.phase!=='day')return{error:'phase'};const counts={};for(const t of Object.values(g.votes||{}))counts[t]=(counts[t]||0)+1;let eliminated=null,tie=false;const entries=Object.entries(counts);if(entries.length){const max=Math.max(...entries.map(([,v])=>v)),top=entries.filter(([,v])=>v===max).map(([p])=>p);if(top.length===1){eliminated=top[0];g.alive[eliminated]=false;}else tie=true;}const winner=checkWinner(g);if(winner)return this.finish(chatId,winner,{eliminated,tie});g.phase='night';g.round++;g.night={kills:{},save:null,seerDone:!alivePlayers(g).some(p=>g.roles[p]==='seer'),doctorDone:!alivePlayers(g).some(p=>g.roles[p]==='doctor')};g.votes={};g.updatedAt=Date.now();this._save();return{ok:true,finished:false,eliminated,tie,game:publicState(g)};}
  finish(chatId,winner,extra={}){const state=this._ensure(),g=state.games[chatId];if(!g)return{error:'not-found'};const winners=g.players.filter(p=>winner==='wolves'?g.roles[p]==='wolf':g.roles[p]!=='wolf'),losers=g.players.filter(p=>!winners.includes(p));for(const p of winners)profiles.recordResult(p,'win',{xp:60,coins:50});for(const p of losers)profiles.recordResult(p,'loss',{xp:10,coins:0});const result={ok:true,finished:true,winner,winners,roles:{...g.roles},roster:rosterText(g,{reveal:true}),game:publicState(g),...extra};delete state.games[chatId];this._save();return result;}
  cancel(chatId){const state=this._ensure();if(!state.games[chatId])return false;delete state.games[chatId];this._save();return true;}
  resetForTests(){this.sessions.clear();}
}

const werewolf=new WerewolfStore();
module.exports={WerewolfStore,werewolf,MIN_WOLF_PLAYERS,MAX_WOLF_PLAYERS,WOLF_TTL_MS,ROLE_LABELS,shuffle,buildRoles,alivePlayers,roleCount,checkWinner,indexTarget,rosterText,publicState};
