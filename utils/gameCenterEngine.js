'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sessionContext = require('./sessionContext');

const MAX_ACTIVE_PER_GROUP = 6;
const MAX_HISTORY = 100;
const MAX_COMPLETED_PER_GROUP = 40;
const MAX_COMPLETED_PER_SESSION = 250;
const TTL_MS = 6 * 60 * 60 * 1000;
const ID_ALIAS_BYTES = 6;
const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

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
function short(gameId){ return String(gameId).split('_').pop().slice(-12); }
function mention(jid){ return `@${String(jid||'').split('@')[0]}`; }
function boardText(board){ return board.map((v,i)=>v||(i+1)).map((v,i)=>`${v}${i%3===2?'\n':' │ '}`).join('').trim(); }
function terminal(g){ return g?.status && g.status!=='playing'; }

class GameCenterEngine {
  constructor({root=path.join(process.cwd(),'database','game-center')}={}){ this.root=root; this.games=new Map(); this._loadedSessions=new Set(); }
  _file(sid=sessionId()){ return path.join(this.root, sid, 'games.json'); }
  _ensureLoaded(){
    const sid=sessionId();
    if(this._loadedSessions.has(sid)) return;
    this._loadedSessions.add(sid);
    try{
      const data=JSON.parse(fs.readFileSync(this._file(sid),'utf8'));
      for(const g of data.games||[]){
        if(g?.chatId&&g?.id&&g?.type&&g?.status)this.games.set(`${sid}::${g.id}`,g);
      }
    }catch(_){ }
    this.cleanup();
  }
  _save(){
    const sid=sessionId();
    const rows=[...this.games.entries()].filter(([k])=>k.startsWith(`${sid}::`)).map(([,g])=>g);
    const file=this._file(sid);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const tmp=`${file}.tmp`;
    fs.writeFileSync(tmp,JSON.stringify({version:2,games:rows},null,2));
    fs.renameSync(tmp,file);
  }
  _newIdentity(type){
    this._ensureLoaded();
    const sid=sessionId();
    const prefix=cleanWord(type)||'game';
    for(let attempt=0;attempt<32;attempt++){
      const alias=crypto.randomBytes(ID_ALIAS_BYTES).toString('hex');
      const gameId=`${prefix}_${now().toString(36)}_${alias}`;
      let collision=false;
      for(const [k,g] of this.games){
        if(!k.startsWith(`${sid}::`))continue;
        if(g.id===gameId||String(g.alias||'')===alias){ collision=true; break; }
      }
      if(!collision)return {id:gameId,alias};
    }
    throw new Error('GAME_CENTER_ID_EXHAUSTED');
  }
  _pruneHistory(sid=sessionId()){
    let dirty=false;
    const prefix=`${sid}::`;
    const terminals=[...this.games.entries()]
      .filter(([k,g])=>k.startsWith(prefix)&&terminal(g))
      .sort((a,b)=>Number(b[1].updatedAt||b[1].finishedAt||b[1].stoppedAt||0)-Number(a[1].updatedAt||a[1].finishedAt||a[1].stoppedAt||0));

    const perGroup=new Map();
    for(const [k,g] of terminals){
      const count=perGroup.get(g.chatId)||0;
      if(count>=MAX_COMPLETED_PER_GROUP){ this.games.delete(k); dirty=true; continue; }
      perGroup.set(g.chatId,count+1);
    }

    const remaining=[...this.games.entries()]
      .filter(([k,g])=>k.startsWith(prefix)&&terminal(g))
      .sort((a,b)=>Number(b[1].updatedAt||b[1].finishedAt||b[1].stoppedAt||0)-Number(a[1].updatedAt||a[1].finishedAt||a[1].stoppedAt||0));
    for(const [k] of remaining.slice(MAX_COMPLETED_PER_SESSION)){ this.games.delete(k); dirty=true; }
    return dirty;
  }
  _put(g){
    this._ensureLoaded();
    g.updatedAt=now();
    this.games.set(`${sessionId()}::${g.id}`,g);
    this._pruneHistory();
    this._save();
    return clone(g);
  }
  cleanup(){
    const sid=sessionId(),cutoff=now()-TTL_MS;
    let dirty=false;
    for(const [k,g] of this.games){
      if(k.startsWith(`${sid}::`)&&g.status==='playing'&&Number(g.updatedAt||g.startedAt||0)<cutoff){
        g.status='expired'; g.expiredAt=now(); g.updatedAt=g.expiredAt; dirty=true;
      }
    }
    if(this._pruneHistory(sid))dirty=true;
    if(dirty)this._save();
  }
  list(chatId,{activeOnly=true,type=null}={}){ this._ensureLoaded(); this.cleanup(); return [...this.games.entries()].filter(([k,g])=>k.startsWith(`${sessionId()}::`)&&g.chatId===chatId&&(!activeOnly||g.status==='playing')&&(!type||g.type===type)).map(([,g])=>clone(g)).sort((a,b)=>b.updatedAt-a.updatedAt); }
  get(chatId,ref=null,type=null){ const rows=this.list(chatId,{activeOnly:true,type}); if(!ref)return rows[0]||null; const n=norm(ref).replace(/^#/,''); return rows.find(g=>g.id===ref||norm(g.alias)===n)||null; }
  _startGuard(chatId,type){ const rows=this.list(chatId); if(rows.some(g=>g.type===type))return 'duplicate'; if(rows.length>=MAX_ACTIVE_PER_GROUP)return 'limit'; return null; }
  stop(chatId,ref=null){ const g=this.get(chatId,ref); if(!g)return null; const live=this.games.get(`${sessionId()}::${g.id}`); live.status='stopped'; live.stoppedAt=now(); return this._put(live); }
  stopAll(chatId){ return this.list(chatId).map(g=>this.stop(chatId,g.id)); }

  startPrefer(chatId,by){ const error=this._startGuard(chatId,'prefer'); if(error)return {error}; const pick=PREFER_BANK[crypto.randomInt(0,PREFER_BANK.length)],ids=this._newIdentity('prefer'); return this._put({id:ids.id,alias:ids.alias,chatId,type:'prefer',status:'playing',by,choices:pick,votes:{},startedAt:now()}); }
  votePrefer(chatId,userId,input,ref=null){ const g=this.get(chatId,ref,'prefer'); if(!g)return {handled:false}; const n=norm(input); let choice=null; if(['1','a','gauche'].includes(n))choice=0; if(['2','b','droite'].includes(n))choice=1; if(choice===null)return {handled:false}; const live=this.games.get(`${sessionId()}::${g.id}`); live.votes[userId]=choice; this._put(live); const counts=[0,0]; Object.values(live.votes).forEach(v=>counts[v]++); return {handled:true,choice,counts,game:clone(live)}; }

  startChain(chatId,by){ const error=this._startGuard(chatId,'word-chain'); if(error)return {error}; const seed=CHAIN_WORDS[crypto.randomInt(0,CHAIN_WORDS.length)],ids=this._newIdentity('chain'); return this._put({id:ids.id,alias:ids.alias,chatId,type:'word-chain',status:'playing',by,lastWord:seed,used:[seed],turn:0,scores:{},history:[],startedAt:now()}); }
  playChain(chatId,userId,input,ref=null){ const g=this.get(chatId,ref,'word-chain'); if(!g)return {handled:false}; const word=cleanWord(input); if(word.length<2)return {handled:false}; const live=this.games.get(`${sessionId()}::${g.id}`),expected=live.lastWord.slice(-1); if(word[0]!==expected)return {handled:true,ok:false,reason:'letter',expected,game:clone(live)}; if(live.used.includes(word))return {handled:true,ok:false,reason:'used',game:clone(live)}; live.lastWord=word; live.used.push(word); live.turn++; live.scores[userId]=(live.scores[userId]||0)+1; live.history.push({userId,word,ts:now()}); live.history=live.history.slice(-MAX_HISTORY); this._put(live); return {handled:true,ok:true,next:word.slice(-1),score:live.scores[userId],game:clone(live)}; }

  startNoYesNo(chatId,by){ const error=this._startGuard(chatId,'no-yes-no'); if(error)return {error}; const ids=this._newIdentity('noyesno'); return this._put({id:ids.id,alias:ids.alias,chatId,type:'no-yes-no',status:'playing',by,eliminated:{},startedAt:now()}); }
  inspectNoYesNo(chatId,userId,text){ const g=this.get(chatId,null,'no-yes-no'); if(!g)return {handled:false}; const live=this.games.get(`${sessionId()}::${g.id}`); if(live.eliminated[userId])return {handled:false}; const tokens=norm(text).split(/\s+/).map(x=>x.replace(/[^a-z]/g,'')); const forbidden=tokens.find(x=>x==='oui'||x==='non'); if(!forbidden)return {handled:false}; live.eliminated[userId]={word:forbidden,ts:now()}; this._put(live); return {handled:true,eliminated:true,word:forbidden,game:clone(live)}; }

  startGuessNumber(chatId,by,{min=1,max=100}={}){ const error=this._startGuard(chatId,'guess-number'); if(error)return {error}; min=Math.max(-9999,Number(min)||1); max=Math.min(999999,Number(max)||100); if(max<=min)max=min+100; const target=crypto.randomInt(min,max+1),ids=this._newIdentity('number'); return this._put({id:ids.id,alias:ids.alias,chatId,type:'guess-number',status:'playing',by,min,max,target,attempts:0,players:{},startedAt:now()}); }
  guessNumber(chatId,userId,input,ref=null){ const g=this.get(chatId,ref,'guess-number'); if(!g)return {handled:false}; if(!/^-?\d+$/.test(String(input).trim()))return {handled:false}; const n=Number(input),live=this.games.get(`${sessionId()}::${g.id}`); if(n<live.min||n>live.max)return {handled:true,ok:false,reason:'range',game:clone(live)}; live.attempts++; live.players[userId]=(live.players[userId]||0)+1; if(n===live.target){ live.status='finished'; live.winner=userId; live.finishedAt=now(); this._put(live); return {handled:true,ok:true,won:true,number:n,attempts:live.attempts,game:clone(live)}; } this._put(live); return {handled:true,ok:true,won:false,hint:n<live.target?'higher':'lower',game:clone(live)}; }

  startTicTacToe(chatId,by,opponent){ const error=this._startGuard(chatId,'tic-tac-toe'); if(error)return {error}; if(!opponent||opponent===by)return {error:'opponent'}; const ids=this._newIdentity('ttt'); return this._put({id:ids.id,alias:ids.alias,chatId,type:'tic-tac-toe',status:'playing',playerX:by,playerO:opponent,turn:'X',board:Array(9).fill(null),moves:0,startedAt:now()}); }
  playTicTacToe(chatId,userId,input,ref=null){ const g=this.get(chatId,ref,'tic-tac-toe'); if(!g)return {handled:false}; if(!/^[1-9]$/.test(String(input).trim()))return {handled:false}; const live=this.games.get(`${sessionId()}::${g.id}`); const symbol=userId===live.playerX?'X':userId===live.playerO?'O':null; if(!symbol)return {handled:true,ok:false,reason:'not-player',game:clone(live)}; if(symbol!==live.turn)return {handled:true,ok:false,reason:'turn',game:clone(live)}; const cell=Number(input)-1; if(live.board[cell])return {handled:true,ok:false,reason:'occupied',game:clone(live)}; live.board[cell]=symbol; live.moves++; const won=WIN_LINES.some(line=>line.every(i=>live.board[i]===symbol)); if(won){ live.status='finished'; live.winner=userId; live.finishedAt=now(); this._put(live); return {handled:true,ok:true,won:true,draw:false,symbol,board:boardText(live.board),game:clone(live)}; } if(live.moves>=9){ live.status='finished'; live.finishedAt=now(); this._put(live); return {handled:true,ok:true,won:false,draw:true,symbol,board:boardText(live.board),game:clone(live)}; } live.turn=symbol==='X'?'O':'X'; this._put(live); return {handled:true,ok:true,won:false,draw:false,symbol,board:boardText(live.board),next:live.turn==='X'?live.playerX:live.playerO,game:clone(live)}; }

  stats(chatId){ const rows=this.list(chatId,{activeOnly:false}); return {active:rows.filter(g=>g.status==='playing').length,total:rows.length,types:rows.reduce((a,g)=>(a[g.type]=(a[g.type]||0)+1,a),{})}; }
}

const engine = new GameCenterEngine();
module.exports={GameCenterEngine,engine,norm,cleanWord,mention,boardText,MAX_ACTIVE_PER_GROUP,MAX_COMPLETED_PER_GROUP,MAX_COMPLETED_PER_SESSION,TTL_MS};
