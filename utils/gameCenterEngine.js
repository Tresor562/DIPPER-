'use strict';

const fs = require('fs');
const path = require('path');
const sessionContext = require('./sessionContext');

const MAX_ACTIVE_PER_GROUP = 6;
const MAX_HISTORY = 100;
const TTL_MS = 6 * 60 * 60 * 1000;

const PREFER_BANK = [
  ['Pouvoir voler', 'Devenir invisible'],
  ['Vivre dans un anime', 'Vivre dans un jeu vidéo'],
  ['Toujours avoir raison', 'Toujours être heureux'],
  ['Téléportation', 'Lire les pensées'],
  ['Être très riche', 'Être mondialement célèbre']
];
const CHAIN_WORDS = ['anime','emoji','internet','tigre','eclair','robot','telegram','manga','aventure','esprit'];

function norm(v){ return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
function cleanWord(v){ return norm(v).replace(/[^a-z0-9-]/g,''); }
function now(){ return Date.now(); }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function sessionId(){ return sessionContext.getCurrentSessionId(); }
function scope(chatId){ return `${sessionId()}::${chatId}`; }
function id(type){ return `${type}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }
function short(gameId){ return String(gameId).split('_').pop().slice(-6); }
function mention(jid){ return `@${String(jid||'').split('@')[0]}`; }

class GameCenterEngine {
  constructor({root=path.join(process.cwd(),'database','game-center')}={}){
    this.root=root;
    this.games=new Map();
    this._loadedSessions=new Set();
  }
  _file(sid=sessionId()){ return path.join(this.root, sid, 'games.json'); }
  _ensureLoaded(){
    const sid=sessionId(); if(this._loadedSessions.has(sid)) return;
    this._loadedSessions.add(sid);
    try{
      const data=JSON.parse(fs.readFileSync(this._file(sid),'utf8'));
      for(const g of data.games||[]){ if(g?.chatId && g?.id) this.games.set(`${sid}::${g.id}`,g); }
    }catch(_){ }
    this.cleanup();
  }
  _save(){
    const sid=sessionId();
    const rows=[...this.games.entries()].filter(([k])=>k.startsWith(`${sid}::`)).map(([,g])=>g);
    const file=this._file(sid); fs.mkdirSync(path.dirname(file),{recursive:true});
    const tmp=`${file}.tmp`; fs.writeFileSync(tmp,JSON.stringify({version:1,games:rows},null,2)); fs.renameSync(tmp,file);
  }
  _put(g){ this._ensureLoaded(); g.updatedAt=now(); this.games.set(`${sessionId()}::${g.id}`,g); this._save(); return clone(g); }
  cleanup(){
    const sid=sessionId(), cutoff=now()-TTL_MS; let dirty=false;
    for(const [k,g] of this.games){ if(k.startsWith(`${sid}::`) && g.status==='playing' && Number(g.updatedAt||g.startedAt||0)<cutoff){ g.status='expired'; dirty=true; } }
    if(dirty) this._save();
  }
  list(chatId,{activeOnly=true,type=null}={}){
    this._ensureLoaded(); this.cleanup(); const s=scope(chatId);
    return [...this.games.entries()].filter(([k,g])=>k.startsWith(`${sessionId()}::`)&&g.chatId===chatId&&(!activeOnly||g.status==='playing')&&(!type||g.type===type)).map(([,g])=>clone(g)).sort((a,b)=>b.updatedAt-a.updatedAt);
  }
  get(chatId,ref=null,type=null){ const rows=this.list(chatId,{activeOnly:true,type}); if(!ref)return rows[0]||null; const n=norm(ref).replace(/^#/,''); return rows.find(g=>g.id===ref||norm(g.alias)===n)||null; }
  _canStart(chatId){ return this.list(chatId).length < MAX_ACTIVE_PER_GROUP; }
  stop(chatId,ref=null){ const g=this.get(chatId,ref); if(!g)return null; const live=this.games.get(`${sessionId()}::${g.id}`); live.status='stopped'; live.stoppedAt=now(); return this._put(live); }
  stopAll(chatId){ return this.list(chatId).map(g=>this.stop(chatId,g.id)); }
  startPrefer(chatId,by){ if(!this._canStart(chatId))return {error:'limit'}; const pick=PREFER_BANK[Math.floor(Math.random()*PREFER_BANK.length)]; const gid=id('prefer'); return this._put({id:gid,alias:short(gid),chatId,type:'prefer',status:'playing',by,choices:pick,votes:{},startedAt:now()}); }
  votePrefer(chatId,userId,input,ref=null){ const g=this.get(chatId,ref,'prefer'); if(!g)return {handled:false}; const n=norm(input); let choice=null; if(['1','a','gauche'].includes(n))choice=0; if(['2','b','droite'].includes(n))choice=1; if(choice===null)return {handled:false}; const live=this.games.get(`${sessionId()}::${g.id}`); live.votes[userId]=choice; this._put(live); const counts=[0,0]; Object.values(live.votes).forEach(v=>counts[v]++); return {handled:true,choice,counts,game:clone(live)}; }
  startChain(chatId,by){ if(!this._canStart(chatId))return {error:'limit'}; const seed=CHAIN_WORDS[Math.floor(Math.random()*CHAIN_WORDS.length)]; const gid=id('chain'); return this._put({id:gid,alias:short(gid),chatId,type:'word-chain',status:'playing',by,lastWord:seed,used:[seed],turn:0,scores:{},history:[],startedAt:now()}); }
  playChain(chatId,userId,input,ref=null){ const g=this.get(chatId,ref,'word-chain'); if(!g)return {handled:false}; const word=cleanWord(input); if(word.length<2)return {handled:false}; const live=this.games.get(`${sessionId()}::${g.id}`); const expected=live.lastWord.slice(-1); if(word[0]!==expected)return {handled:true,ok:false,reason:'letter',expected,game:clone(live)}; if(live.used.includes(word))return {handled:true,ok:false,reason:'used',game:clone(live)}; live.lastWord=word; live.used.push(word); live.turn++; live.scores[userId]=(live.scores[userId]||0)+1; live.history.push({userId,word,ts:now()}); live.history=live.history.slice(-MAX_HISTORY); this._put(live); return {handled:true,ok:true,next:word.slice(-1),score:live.scores[userId],game:clone(live)}; }
  startNoYesNo(chatId,by){ if(!this._canStart(chatId))return {error:'limit'}; const gid=id('noyesno'); return this._put({id:gid,alias:short(gid),chatId,type:'no-yes-no',status:'playing',by,eliminated:{},survivors:{},startedAt:now()}); }
  inspectNoYesNo(chatId,userId,text,ref=null){ const g=this.get(chatId,ref,'no-yes-no'); if(!g)return {handled:false}; const live=this.games.get(`${sessionId()}::${g.id}`); if(live.eliminated[userId])return {handled:false}; const tokens=norm(text).split(/\s+/).map(x=>x.replace(/[^a-z]/g,'')); const forbidden=tokens.find(x=>x==='oui'||x==='non'); live.survivors[userId]=true; if(!forbidden){ this._put(live); return {handled:false}; } live.eliminated[userId]={word:forbidden,ts:now()}; delete live.survivors[userId]; this._put(live); return {handled:true,eliminated:true,word:forbidden,game:clone(live)}; }
  startGuessNumber(chatId,by,{min=1,max=100}={}){ if(!this._canStart(chatId))return {error:'limit'}; min=Math.max(-9999,Number(min)||1); max=Math.min(999999,Number(max)||100); if(max<=min)max=min+100; const target=Math.floor(Math.random()*(max-min+1))+min; const gid=id('number'); return this._put({id:gid,alias:short(gid),chatId,type:'guess-number',status:'playing',by,min,max,target,attempts:0,players:{},startedAt:now()}); }
  guessNumber(chatId,userId,input,ref=null){ const g=this.get(chatId,ref,'guess-number'); if(!g)return {handled:false}; if(!/^-?\d+$/.test(String(input).trim()))return {handled:false}; const n=Number(input); const live=this.games.get(`${sessionId()}::${g.id}`); if(n<live.min||n>live.max)return {handled:true,ok:false,reason:'range',game:clone(live)}; live.attempts++; live.players[userId]=(live.players[userId]||0)+1; if(n===live.target){ live.status='finished'; live.winner=userId; live.finishedAt=now(); this._put(live); return {handled:true,ok:true,won:true,number:n,attempts:live.attempts,game:clone(live)}; } this._put(live); return {handled:true,ok:true,won:false,hint:n<live.target?'higher':'lower',game:clone(live)}; }
  stats(chatId){ const rows=this.list(chatId,{activeOnly:false}); return {active:rows.filter(g=>g.status==='playing').length,total:rows.length,types:rows.reduce((a,g)=>(a[g.type]=(a[g.type]||0)+1,a),{})}; }
}

const engine = new GameCenterEngine();
module.exports={GameCenterEngine,engine,norm,cleanWord,mention,MAX_ACTIVE_PER_GROUP};
