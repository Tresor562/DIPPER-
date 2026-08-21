'use strict';

const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const sessionContext=require('./sessionContext');
const {profiles}=require('./gameCenterProfiles');

const MIN_UNO_PLAYERS=2,MAX_UNO_PLAYERS=10,UNO_TTL_MS=6*60*60*1000;
const COLORS=['R','Y','G','B'];
const COLOR_NAMES={R:'rouge',Y:'jaune',G:'vert',B:'bleu'};
const COLOR_EMOJI={R:'🔴',Y:'🟡',G:'🟢',B:'🔵',W:'⚫'};
function sid(){return sessionContext.getCurrentSessionId();}
function clone(v){return JSON.parse(JSON.stringify(v));}
function card(color,value){return{color,value,id:`${color}:${value}`};}
function createUnoDeck(){
  const deck=[];
  for(const c of COLORS){deck.push(card(c,'0'));for(let n=1;n<=9;n++){deck.push(card(c,String(n)),card(c,String(n)));}for(let i=0;i<2;i++)deck.push(card(c,'skip'),card(c,'reverse'),card(c,'draw2'));}
  for(let i=0;i<4;i++)deck.push(card('W','wild'),card('W','draw4'));
  return deck;
}
function shuffle(deck,randomInt=crypto.randomInt){const out=deck.map(clone);for(let i=out.length-1;i>0;i--){const j=randomInt(0,i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
function cardText(c){if(!c)return'—';const v=c.value==='skip'?'⛔':c.value==='reverse'?'↔️':c.value==='draw2'?'+2':c.value==='wild'?'JOKER':'+4';return`${COLOR_EMOJI[c.color]||''}${v}`;}
function parseColor(v){const n=String(v||'').toLowerCase();if(['r','red','rouge'].includes(n))return'R';if(['y','yellow','jaune'].includes(n))return'Y';if(['g','green','vert'].includes(n))return'G';if(['b','blue','bleu'].includes(n))return'B';return null;}
function canPlay(c,top,activeColor){return c.color==='W'||c.color===activeColor||c.value===top.value;}
function nextIndex(game,steps=1){const n=game.players.length;let i=game.turnIndex;for(let s=0;s<steps;s++)i=(i+game.direction+n)%n;return i;}
function defaultState(){return{version:1,games:{}};}

class UnoStore{
  constructor({root=path.join(process.cwd(),'database','game-center')}={}){this.root=root;this.sessions=new Map();}
  _file(session=sid()){return path.join(this.root,session,'uno-private.json');}
  _ensure(){const session=sid();if(this.sessions.has(session))return this.sessions.get(session);let state=defaultState();try{const data=JSON.parse(fs.readFileSync(this._file(session),'utf8'));if(data?.games)state=data;}catch(_){}this.sessions.set(session,state);this.cleanup();return state;}
  _save(){const file=this._file(),state=this._ensure();fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(state,null,2));fs.renameSync(tmp,file);}
  cleanup(ts=Date.now()){const state=this.sessions.get(sid());if(!state)return;let dirty=false;for(const [chat,g] of Object.entries(state.games)){if(ts-Number(g.updatedAt||g.createdAt||0)>UNO_TTL_MS){delete state.games[chat];dirty=true;}}if(dirty)this._save();}
  get(chatId){const g=this._ensure().games[chatId];return g?clone(g):null;}
  _live(chatId){return this._ensure().games[chatId]||null;}
  create(chatId,host){const state=this._ensure();if(state.games[chatId])return{error:'duplicate'};const alias=crypto.randomBytes(6).toString('hex');const ts=Date.now();state.games[chatId]={id:`uno_${ts.toString(36)}_${alias}`,alias,chatId,host,phase:'lobby',players:[host],hands:{},deck:[],discard:[],turnIndex:0,direction:1,activeColor:null,createdAt:ts,updatedAt:ts};this._save();return clone(state.games[chatId]);}
  join(chatId,userId){const g=this._live(chatId);if(!g)return{error:'not-found'};if(g.phase!=='lobby')return{error:'started'};if(g.players.includes(userId))return{error:'joined'};if(g.players.length>=MAX_UNO_PLAYERS)return{error:'full'};g.players.push(userId);g.updatedAt=Date.now();this._save();return{ok:true,game:clone(g)};}
  leave(chatId,userId){const g=this._live(chatId);if(!g)return{error:'not-found'};if(g.phase!=='lobby')return{error:'started'};if(!g.players.includes(userId))return{error:'not-player'};if(userId===g.host){delete this._ensure().games[chatId];this._save();return{ok:true,cancelled:true};}g.players=g.players.filter(x=>x!==userId);g.updatedAt=Date.now();this._save();return{ok:true,game:clone(g)};}
  start(chatId,by,{randomInt=crypto.randomInt}={}){
    const g=this._live(chatId);if(!g)return{error:'not-found'};if(g.host!==by)return{error:'host'};if(g.phase!=='lobby')return{error:'started'};if(g.players.length<MIN_UNO_PLAYERS)return{error:'players'};
    g.deck=shuffle(createUnoDeck(),randomInt);g.hands={};for(const p of g.players){g.hands[p]=[];for(let i=0;i<7;i++)g.hands[p].push(g.deck.pop());}
    let topIndex=g.deck.findLastIndex?g.deck.findLastIndex(c=>c.color!=='W'&&!['draw2','skip','reverse'].includes(c.value)):-1;
    if(topIndex<0){for(let i=g.deck.length-1;i>=0;i--)if(g.deck[i].color!=='W'&&!['draw2','skip','reverse'].includes(g.deck[i].value)){topIndex=i;break;}}
    const [top]=g.deck.splice(topIndex,1);g.discard=[top];g.activeColor=top.color;g.turnIndex=0;g.direction=1;g.phase='playing';g.updatedAt=Date.now();this._save();return{ok:true,game:clone(g)};
  }
  cancel(chatId){const state=this._ensure(),g=state.games[chatId];if(!g)return false;delete state.games[chatId];this._save();return true;}
  hand(chatId,userId){const g=this._live(chatId);if(!g||g.phase!=='playing')return null;const hand=g.hands[userId];return hand?clone(hand):null;}
  status(chatId){const g=this._live(chatId);if(!g)return null;return{alias:g.alias,phase:g.phase,host:g.host,players:[...g.players],counts:Object.fromEntries(g.players.map(p=>[p,(g.hands[p]||[]).length])),top:g.discard.at(-1)||null,activeColor:g.activeColor,turn:g.phase==='playing'?g.players[g.turnIndex]:null,direction:g.direction};}
  _drawOne(g){if(!g.deck.length){const top=g.discard.pop();g.deck=shuffle(g.discard);g.discard=[top];}return g.deck.pop()||null;}
  draw(chatId,userId){const g=this._live(chatId);if(!g||g.phase!=='playing')return{error:'not-found'};if(g.players[g.turnIndex]!==userId)return{error:'turn',turn:g.players[g.turnIndex]};const c=this._drawOne(g);if(c)g.hands[userId].push(c);g.turnIndex=nextIndex(g,1);g.updatedAt=Date.now();this._save();return{ok:true,card:clone(c),next:g.players[g.turnIndex],game:clone(g)};}
  play(chatId,userId,index,{color=null}={}){
    const g=this._live(chatId);if(!g||g.phase!=='playing')return{error:'not-found'};if(g.players[g.turnIndex]!==userId)return{error:'turn',turn:g.players[g.turnIndex]};const hand=g.hands[userId]||[],i=Number(index)-1;if(!Number.isInteger(i)||i<0||i>=hand.length)return{error:'index'};const c=hand[i],top=g.discard.at(-1);if(!canPlay(c,top,g.activeColor))return{error:'illegal'};let chosen=c.color==='W'?parseColor(color):c.color;if(c.color==='W'&&!chosen)return{error:'color'};
    hand.splice(i,1);g.discard.push(c);g.activeColor=chosen;let steps=1,penalty=0;
    if(c.value==='reverse'){g.direction*=-1;if(g.players.length===2)steps=2;}
    if(c.value==='skip')steps=2;
    if(c.value==='draw2'||c.value==='draw4'){penalty=c.value==='draw2'?2:4;const victimIndex=nextIndex(g,1),victim=g.players[victimIndex];for(let n=0;n<penalty;n++){const d=this._drawOne(g);if(d)g.hands[victim].push(d);}steps=2;}
    const won=hand.length===0;
    if(won){const winner=userId,others=g.players.filter(p=>p!==winner);profiles.recordResult(winner,'win',{xp:75,coins:60});for(const p of others)profiles.recordResult(p,'loss',{xp:10,coins:0});const result={ok:true,won:true,winner,card:clone(c),penalty,game:clone(g)};delete this._ensure().games[chatId];this._save();return result;}
    g.turnIndex=nextIndex(g,steps);g.updatedAt=Date.now();this._save();return{ok:true,won:false,card:clone(c),penalty,next:g.players[g.turnIndex],game:clone(g)};
  }
  resetForTests(){this.sessions.clear();}
}

const uno=new UnoStore();
module.exports={UnoStore,uno,MIN_UNO_PLAYERS,MAX_UNO_PLAYERS,UNO_TTL_MS,COLORS,COLOR_NAMES,COLOR_EMOJI,createUnoDeck,shuffle,cardText,parseColor,canPlay,nextIndex};
