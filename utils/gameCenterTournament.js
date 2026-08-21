'use strict';

const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const {QUIZ_BANKS}=require('./gameCenterBlock2');

const MIN_TOURNEY_GROUPS=2,MAX_TOURNEY_GROUPS=16,MIN_TOURNEY_ROUNDS=3,MAX_TOURNEY_ROUNDS=8,TOURNEY_TTL_MS=48*60*60*1000;
function clone(v){return JSON.parse(JSON.stringify(v));}
function cleanName(v){return String(v||'Groupe').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'Groupe';}
function shuffle(list,randomInt=crypto.randomInt){const out=[...list];for(let i=out.length-1;i>0;i--){const j=randomInt(0,i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
function parseChoice(v){const n=String(v||'').trim().toLowerCase();if(['1','a'].includes(n))return 0;if(['2','b'].includes(n))return 1;if(['3','c'].includes(n))return 2;if(['4','d'].includes(n))return 3;return null;}
function publicTournament(t){return{code:t.code,category:t.category,rounds:t.rounds,status:t.status,ownerGroup:t.ownerGroup,groups:Object.values(t.groups).map(g=>({name:g.name,score:g.score,correct:g.correct,wrong:g.wrong,index:g.index,finishedAt:g.finishedAt||null})),createdAt:t.createdAt,startedAt:t.startedAt||null};}
function leaderboard(t){return Object.values(t.groups).map(g=>({name:g.name,score:g.score,correct:g.correct,wrong:g.wrong,progress:g.index,finishedAt:g.finishedAt||null})).sort((a,b)=>b.score-a.score||b.correct-a.correct||(a.finishedAt||Infinity)-(b.finishedAt||Infinity)||a.name.localeCompare(b.name)).map((g,i)=>({...g,rank:i+1}));}

class TournamentStore{
  constructor({root=path.join(process.cwd(),'database','game-center','competitions')}={}){this.root=root;this.loaded=false;this.state={version:1,tournaments:{}};}
  _file(){return path.join(this.root,'tournaments.json');}
  _ensure(){if(this.loaded)return this.state;this.loaded=true;try{const d=JSON.parse(fs.readFileSync(this._file(),'utf8'));if(d?.tournaments)this.state=d;}catch(_){}this.cleanup();return this.state;}
  _save(){fs.mkdirSync(this.root,{recursive:true});const tmp=`${this._file()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(this._ensure(),null,2));fs.renameSync(tmp,this._file());}
  cleanup(ts=Date.now()){if(!this.loaded)return;let dirty=false;for(const [code,t] of Object.entries(this.state.tournaments)){if(ts-Number(t.updatedAt||t.createdAt||0)>TOURNEY_TTL_MS){delete this.state.tournaments[code];dirty=true;}}if(dirty)this._save();}
  _code(){this._ensure();for(let i=0;i<32;i++){const c=crypto.randomBytes(6).toString('hex');if(!this.state.tournaments[c])return c;}throw new Error('TOURNEY_ID_EXHAUSTED');}
  get(code){const t=this._ensure().tournaments[String(code||'').replace(/^#/,'').toLowerCase()];return t?clone(t):null;}
  public(code){const t=this.get(code);return t?publicTournament(t):null;}
  create({chatId,groupName,organizer,category='general',rounds=5,randomInt=crypto.randomInt}){
    category=String(category||'general').toLowerCase();const bank=QUIZ_BANKS[category];if(!bank)return{error:'category'};rounds=Math.max(MIN_TOURNEY_ROUNDS,Math.min(MAX_TOURNEY_ROUNDS,Math.trunc(Number(rounds)||5),bank.length));
    if(Object.values(this._ensure().tournaments).some(t=>t.status!=='finished'&&t.ownerGroup===chatId))return{error:'owner-active'};
    const code=this._code(),indexes=shuffle(Array.from({length:bank.length},(_,i)=>i),randomInt).slice(0,rounds),ts=Date.now();
    const group={chatId,name:cleanName(groupName),score:0,correct:0,wrong:0,index:0,current:null,finishedAt:null};
    const t={code,category,rounds,status:'lobby',ownerGroup:chatId,organizer,questionIndexes:indexes,groups:{[chatId]:group},createdAt:ts,updatedAt:ts};this.state.tournaments[code]=t;this._save();return publicTournament(t);
  }
  join(code,{chatId,groupName}){const t=this._ensure().tournaments[String(code||'').replace(/^#/,'').toLowerCase()];if(!t)return{error:'not-found'};if(t.status!=='lobby')return{error:'started'};if(t.groups[chatId])return{error:'joined'};if(Object.keys(t.groups).length>=MAX_TOURNEY_GROUPS)return{error:'full'};t.groups[chatId]={chatId,name:cleanName(groupName),score:0,correct:0,wrong:0,index:0,current:null,finishedAt:null};t.updatedAt=Date.now();this._save();return{ok:true,tournament:publicTournament(t)};}
  start(code,{chatId,userId}){const t=this._ensure().tournaments[String(code||'').replace(/^#/,'').toLowerCase()];if(!t)return{error:'not-found'};if(t.ownerGroup!==chatId||t.organizer!==userId)return{error:'owner'};if(t.status!=='lobby')return{error:'started'};if(Object.keys(t.groups).length<MIN_TOURNEY_GROUPS)return{error:'groups'};t.status='playing';t.startedAt=Date.now();t.updatedAt=t.startedAt;this._save();return{ok:true,tournament:publicTournament(t)};}
  next(code,chatId){const t=this._ensure().tournaments[String(code||'').replace(/^#/,'').toLowerCase()];if(!t)return{error:'not-found'};if(t.status!=='playing')return{error:'phase'};const g=t.groups[chatId];if(!g)return{error:'group'};if(g.finishedAt)return{error:'finished'};const bank=QUIZ_BANKS[t.category],qIndex=t.questionIndexes[g.index];if(qIndex===undefined){g.finishedAt=Date.now();t.updatedAt=g.finishedAt;this._finishIfComplete(t);this._save();return{error:'finished'};}if(!g.current)g.current={shownAt:Date.now(),questionIndex:qIndex};const q=bank[qIndex];t.updatedAt=Date.now();this._save();return{ok:true,number:g.index+1,total:t.rounds,question:q.q,options:[...q.options],code:t.code};}
  answer(code,chatId,input){const t=this._ensure().tournaments[String(code||'').replace(/^#/,'').toLowerCase()];if(!t)return{error:'not-found'};if(t.status!=='playing')return{error:'phase'};const g=t.groups[chatId];if(!g)return{error:'group'};if(g.finishedAt)return{error:'finished'};if(!g.current)return{error:'next'};const choice=parseChoice(input);if(choice===null)return{error:'choice'};const q=QUIZ_BANKS[t.category][g.current.questionIndex],correct=choice===q.answer;g.score+=correct?10:0;g.correct+=correct?1:0;g.wrong+=correct?0:1;g.index++;g.current=null;if(g.index>=t.rounds)g.finishedAt=Date.now();t.updatedAt=Date.now();this._finishIfComplete(t);this._save();return{ok:true,correct,correctChoice:q.answer,correctText:q.options[q.answer],score:g.score,progress:g.index,finished:Boolean(g.finishedAt),tournamentFinished:t.status==='finished',leaderboard:leaderboard(t)};}
  _finishIfComplete(t){if(Object.values(t.groups).every(g=>g.finishedAt)){t.status='finished';t.finishedAt=Date.now();}}
  top(code){const t=this._ensure().tournaments[String(code||'').replace(/^#/,'').toLowerCase()];if(!t)return null;return{code:t.code,status:t.status,rounds:t.rounds,rows:leaderboard(t)};}
  stop(code,{chatId,userId}){const key=String(code||'').replace(/^#/,'').toLowerCase(),t=this._ensure().tournaments[key];if(!t)return{error:'not-found'};if(t.ownerGroup!==chatId||t.organizer!==userId)return{error:'owner'};delete this.state.tournaments[key];this._save();return{ok:true};}
  resetForTests(){this.loaded=false;this.state={version:1,tournaments:{}};}
}

const tournaments=new TournamentStore();
module.exports={TournamentStore,tournaments,MIN_TOURNEY_GROUPS,MAX_TOURNEY_GROUPS,MIN_TOURNEY_ROUNDS,MAX_TOURNEY_ROUNDS,TOURNEY_TTL_MS,cleanName,shuffle,parseChoice,publicTournament,leaderboard};
