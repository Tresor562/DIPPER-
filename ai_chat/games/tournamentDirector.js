'use strict';

const fs = require('fs');
const path = require('path');

const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const uid=(p='event')=>`${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const clone=v=>structuredClone(v);

function rankScores(scores={}) {
  return Object.entries(scores).map(([userId,score])=>({userId,score:Number(score)||0}))
    .sort((a,b)=>b.score-a.score || String(a.userId).localeCompare(String(b.userId)))
    .map((x,i)=>({...x,rank:i+1}));
}

function defaultRewards(count=3) {
  return [
    {rank:1,label:'🥇 Champion',points:100},
    {rank:2,label:'🥈 Vice-champion',points:60},
    {rank:3,label:'🥉 Troisième',points:35},
  ].slice(0,clamp(count,1,3));
}

function balancedTeams(players=[], teamCount=2) {
  const n=clamp(teamCount,2,16);
  const teams=Array.from({length:n},(_,i)=>({id:`team_${i+1}`,name:`Équipe ${i+1}`,members:[],score:0}));
  players.forEach((p,i)=>teams[i%n].members.push(p));
  return teams;
}

class TournamentDirector {
  constructor({file=path.join(process.cwd(),'data','exaucee','events.json'), scheduler=null}={}) {
    this.file=file; this.scheduler=scheduler; this.events=new Map(); this._load();
  }
  _load(){try{const raw=JSON.parse(fs.readFileSync(this.file,'utf8'));for(const e of raw?.events||raw||[])if(e?.id)this.events.set(e.id,e);}catch(_){} }
  _save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=`${this.file}.tmp`;fs.writeFileSync(tmp,JSON.stringify({version:3,events:[...this.events.values()]},null,2));fs.renameSync(tmp,this.file);}
  _put(e){e.updatedAt=Date.now();this.events.set(e.id,e);this._save();return clone(e);}
  list(chatId,{activeOnly=false}={}){return [...this.events.values()].filter(e=>e.chatId===chatId).filter(e=>!activeOnly||!['finished','cancelled'].includes(e.status)).sort((a,b)=>(a.startAt||a.createdAt)-(b.startAt||b.createdAt)).map(clone);}
  get(chatId,ref){const q=String(ref||'').replace(/^#/,'').toLowerCase();return this.list(chatId).find(e=>e.id===ref||String(e.alias).toLowerCase()===q||String(e.id).endsWith(q))||null;}
  create(chatId, spec={}) {
    const id=uid('event'); const alias=id.slice(-6);
    const format=spec.format||'points';
    const event={id,alias,chatId,title:spec.title||'Événement Exaucée',description:spec.description||'',theme:spec.theme||'général',gameType:spec.gameType||'custom',format,status:'scheduled',createdBy:spec.by||null,createdAt:Date.now(),startAt:Number(spec.startAt)||Date.now(),registrationOpensAt:Number(spec.registrationOpensAt)||Date.now(),registrationClosesAt:Number(spec.registrationClosesAt)||Number(spec.startAt)||Date.now(),maxPlayers:clamp(spec.maxPlayers||500,2,5000),minPlayers:clamp(spec.minPlayers||2,1,5000),teamMode:Boolean(spec.teamMode),teamCount:clamp(spec.teamCount||2,2,16),players:{},teams:[],rounds:Array.isArray(spec.rounds)?spec.rounds:[],currentRound:0,scores:{},history:[],rewards:Array.isArray(spec.rewards)&&spec.rewards.length?spec.rewards:defaultRewards(),rules:Array.isArray(spec.rules)?spec.rules:[],autoStart:spec.autoStart!==false,lateJoin:Boolean(spec.lateJoin),metadata:spec.metadata||{}};
    this._put(event); this._scheduleLifecycle(event); return clone(event);
  }
  _scheduleLifecycle(event){if(!this.scheduler)return; const base=`gameevent:${event.id}`;
    this.scheduler.schedule({id:`${base}:open`,runAt:Math.max(Date.now()+1000,event.registrationOpensAt),action:{type:'game_event',eventId:event.id,chatId:event.chatId,op:'open_registration'}});
    this.scheduler.schedule({id:`${base}:start`,runAt:Math.max(Date.now()+1000,event.startAt),action:{type:'game_event',eventId:event.id,chatId:event.chatId,op:'start'}});
  }
  register(chatId,eventRef,userId,profile={}){const snap=this.get(chatId,eventRef);if(!snap)return{ok:false,reason:'not_found'};const e=this.events.get(snap.id);if(!['scheduled','registration'].includes(e.status))return{ok:false,reason:'closed'};if(Date.now()>e.registrationClosesAt&&!e.lateJoin)return{ok:false,reason:'closed'};if(Object.keys(e.players).length>=e.maxPlayers)return{ok:false,reason:'full'};e.players[userId]={userId,name:profile.name||'',joinedAt:Date.now(),active:true};e.scores[userId]??=0;this._put(e);return{ok:true,event:clone(e),count:Object.keys(e.players).length};}
  unregister(chatId,eventRef,userId){const snap=this.get(chatId,eventRef);if(!snap)return false;const e=this.events.get(snap.id);if(!e.players[userId])return false;delete e.players[userId];delete e.scores[userId];this._put(e);return true;}
  start(chatId,eventRef){const snap=this.get(chatId,eventRef);if(!snap)return{ok:false,reason:'not_found'};const e=this.events.get(snap.id);const players=Object.keys(e.players);if(players.length<e.minPlayers){e.status='waiting_players';this._put(e);return{ok:false,reason:'not_enough_players',count:players.length,min:e.minPlayers,event:clone(e)};}e.status='playing';e.startedAt=Date.now();if(e.teamMode&&!e.teams.length)e.teams=balancedTeams(players,e.teamCount);if(!e.rounds.length)e.rounds=[{id:'round_1',name:'Manche 1',type:e.gameType,status:'ready',points:1}];e.currentRound=0;e.rounds[0].status='playing';e.history.push({type:'start',ts:Date.now(),players:players.length});this._put(e);return{ok:true,event:clone(e),round:e.rounds[0]};}
  score(chatId,eventRef,userId,points=1,reason=''){const snap=this.get(chatId,eventRef);if(!snap)return null;const e=this.events.get(snap.id);e.scores[userId]=Number(e.scores[userId]||0)+Number(points||0);e.history.push({type:'score',userId,points:Number(points||0),reason:String(reason||'').slice(0,180),ts:Date.now()});e.history=e.history.slice(-5000);this._put(e);return{score:e.scores[userId],ranking:rankScores(e.scores).slice(0,20),event:clone(e)};}
  nextRound(chatId,eventRef){const snap=this.get(chatId,eventRef);if(!snap)return{ok:false};const e=this.events.get(snap.id);if(e.rounds[e.currentRound])e.rounds[e.currentRound].status='finished';e.currentRound+=1;if(e.currentRound>=e.rounds.length)return this.finish(chatId,eventRef);e.rounds[e.currentRound].status='playing';e.history.push({type:'round',round:e.currentRound+1,ts:Date.now()});this._put(e);return{ok:true,finished:false,event:clone(e),round:e.rounds[e.currentRound]};}
  finish(chatId,eventRef){const snap=this.get(chatId,eventRef);if(!snap)return{ok:false};const e=this.events.get(snap.id);e.status='finished';e.finishedAt=Date.now();e.ranking=rankScores(e.scores);e.awards=e.rewards.map(r=>{const winner=e.ranking.find(x=>x.rank===r.rank);return winner?{...r,userId:winner.userId,score:winner.score}:null;}).filter(Boolean);e.history.push({type:'finish',ts:Date.now()});this._put(e);return{ok:true,finished:true,event:clone(e),ranking:clone(e.ranking),awards:clone(e.awards)};}
  cancel(chatId,eventRef){const snap=this.get(chatId,eventRef);if(!snap)return null;const e=this.events.get(snap.id);e.status='cancelled';e.cancelledAt=Date.now();this._put(e);for(const t of this.scheduler?.list?.({status:'pending'})||[])if(t.id.startsWith(`gameevent:${e.id}:`))this.scheduler.cancel(t.id);return clone(e);}
  standings(chatId,eventRef,limit=20){const snap=this.get(chatId,eventRef);if(!snap)return[];return rankScores(snap.scores).slice(0,clamp(limit,1,100));}
  async handleScheduledTask(task,{send}={}){const a=task?.action||{};const e=[...this.events.values()].find(x=>x.id===a.eventId);if(!e)return{ignored:true};if(a.op==='open_registration'){if(e.status==='scheduled')e.status='registration';this._put(e);await send?.(e.chatId,`🎮 *${e.title}* — inscriptions ouvertes !\nID : #${e.alias}\nDébut : ${new Date(e.startAt).toLocaleString('fr-FR')}\nPlaces : ${e.maxPlayers}\n\nÉcris *je participe #${e.alias}* pour t’inscrire.`);return{opened:true,eventId:e.id};}if(a.op==='start'){const r=this.start(e.chatId,e.id);if(!r.ok){await send?.(e.chatId,`⏳ *${e.title}* attend encore des joueurs (${r.count}/${r.min}).`);return r;}await send?.(e.chatId,`🚀 *${e.title} commence maintenant !*\nParticipants : ${Object.keys(r.event.players).length}\nFormat : ${r.event.format}\nManche 1 : ${r.round?.name||'Départ'}`);return r;}return{ignored:true};}
}

module.exports={TournamentDirector,rankScores,balancedTeams,defaultRewards};
