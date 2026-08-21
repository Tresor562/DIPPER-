'use strict';

const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const sessionContext=require('./sessionContext');
const {profiles}=require('./gameCenterProfiles');

const MIN_BET=10;
const MAX_BET=500;
const CASINO_COOLDOWN_MS=1500;
const BLACKJACK_TTL_MS=30*60*1000;
const SLOT_SYMBOLS=[
  {symbol:'🍒',weight:30,mult:3},
  {symbol:'🍋',weight:25,mult:4},
  {symbol:'🍇',weight:20,mult:5},
  {symbol:'🔔',weight:12,mult:8},
  {symbol:'⭐',weight:8,mult:12},
  {symbol:'💎',weight:5,mult:25}
];
const SLOT_WEIGHT=SLOT_SYMBOLS.reduce((n,x)=>n+x.weight,0);
const RED_NUMBERS=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS=['♠️','♥️','♦️','♣️'];

function sid(){ return sessionContext.getCurrentSessionId(); }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function validBet(v){ const n=Math.trunc(Number(v)||0); return n>=MIN_BET&&n<=MAX_BET?n:null; }
function rouletteColor(n){ if(n===0)return 'green'; return RED_NUMBERS.has(n)?'red':'black'; }
function weightedSymbol(randomInt=crypto.randomInt){ const roll=randomInt(0,SLOT_WEIGHT); let c=0; for(const item of SLOT_SYMBOLS){ c+=item.weight; if(roll<c)return item; } return SLOT_SYMBOLS[0]; }
function spinSlots(randomInt=crypto.randomInt){
  const reels=[weightedSymbol(randomInt),weightedSymbol(randomInt),weightedSymbol(randomInt)];
  const same=reels.every(x=>x.symbol===reels[0].symbol); return {symbols:reels.map(x=>x.symbol),multiplier:same?reels[0].mult:0};
}
function parseRouletteChoice(input){
  const v=String(input||'').trim().toLowerCase();
  if(['red','rouge'].includes(v))return {type:'color',value:'red'};
  if(['black','noir'].includes(v))return {type:'color',value:'black'};
  if(['even','pair'].includes(v))return {type:'parity',value:'even'};
  if(['odd','impair'].includes(v))return {type:'parity',value:'odd'};
  if(/^\d+$/.test(v)){ const n=Number(v); if(n>=0&&n<=36)return {type:'number',value:n}; }
  return null;
}
function rouletteResult(choice,randomInt=crypto.randomInt){
  const number=randomInt(0,37),color=rouletteColor(number); let won=false,multiplier=0;
  if(choice.type==='color'){ won=number!==0&&color===choice.value; multiplier=won?2:0; }
  if(choice.type==='parity'){ won=number!==0&&((number%2===0?'even':'odd')===choice.value); multiplier=won?2:0; }
  if(choice.type==='number'){ won=number===choice.value; multiplier=won?36:0; }
  return {number,color,won,multiplier};
}
function createDeck(){ return SUITS.flatMap(suit=>RANKS.map(rank=>({rank,suit}))); }
function shuffleDeck(deck,randomInt=crypto.randomInt){
  const out=deck.map(x=>({...x}));
  for(let i=out.length-1;i>0;i--){ const j=randomInt(0,i+1); [out[i],out[j]]=[out[j],out[i]]; }
  return out;
}
function handValue(cards=[]){
  let total=0,aces=0;
  for(const c of cards){ if(c.rank==='A'){ total+=11; aces++; } else if(['J','Q','K'].includes(c.rank))total+=10; else total+=Number(c.rank); }
  while(total>21&&aces>0){ total-=10; aces--; }
  return total;
}
function isBlackjack(cards=[]){ return cards.length===2&&handValue(cards)===21; }
function cardText(c){ return `${c.rank}${c.suit}`; }
function handText(cards=[]){ return cards.map(cardText).join('  '); }

class CasinoStore{
  constructor({root=path.join(process.cwd(),'database','game-center')}={}){ this.root=root; this.sessions=new Map(); this.cooldowns=new Map(); }
  _file(session=sid()){ return path.join(this.root,session,'casino.json'); }
  _ensure(){
    const session=sid(); if(this.sessions.has(session))return this.sessions.get(session);
    const state={hands:{}}; try{ const raw=JSON.parse(fs.readFileSync(this._file(session),'utf8')); if(raw?.hands)state.hands=raw.hands; }catch(_){ }
    this.sessions.set(session,state); this._cleanup(state); return state;
  }
  _save(){ const session=sid(),state=this._ensure(),file=this._file(session); fs.mkdirSync(path.dirname(file),{recursive:true}); const tmp=`${file}.tmp`; fs.writeFileSync(tmp,JSON.stringify({version:1,hands:state.hands},null,2)); fs.renameSync(tmp,file); }
  _key(chatId,userId){ return `${chatId}::${userId}`; }
  _cleanup(state=this._ensure(),ts=Date.now()){
    let dirty=false; for(const [key,h] of Object.entries(state.hands)){ if(ts-Number(h.updatedAt||h.startedAt||0)>BLACKJACK_TTL_MS){ delete state.hands[key]; dirty=true; } }
    if(dirty){ try{ this._save(); }catch(_){} } return dirty;
  }
  _cooldown(userId,ts=Date.now()){
    const key=`${sid()}::${userId}`,last=this.cooldowns.get(key)||0,remaining=CASINO_COOLDOWN_MS-(ts-last);
    if(remaining>0)return remaining; this.cooldowns.set(key,ts); if(this.cooldowns.size>2000){ for(const k of [...this.cooldowns.keys()].slice(0,500))this.cooldowns.delete(k); } return 0;
  }
  slots(userId,bet,{randomInt=crypto.randomInt,ts=Date.now()}={}){
    bet=validBet(bet); if(!bet)return {ok:false,error:'bet'}; const cool=this._cooldown(userId,ts); if(cool)return {ok:false,error:'cooldown',remainingMs:cool};
    const debit=profiles.spendCoins(userId,bet); if(!debit.ok)return {ok:false,error:'funds',profile:debit.profile};
    const result=spinSlots(randomInt),payout=bet*result.multiplier; if(payout>0)profiles.addCoins(userId,payout);
    const p=profiles.get(userId); return {ok:true,bet,payout,net:payout-bet,...result,profile:p};
  }
  roulette(userId,bet,choiceInput,{randomInt=crypto.randomInt,ts=Date.now()}={}){
    bet=validBet(bet); if(!bet)return {ok:false,error:'bet'}; const choice=parseRouletteChoice(choiceInput); if(!choice)return {ok:false,error:'choice'};
    const cool=this._cooldown(userId,ts); if(cool)return {ok:false,error:'cooldown',remainingMs:cool}; const debit=profiles.spendCoins(userId,bet); if(!debit.ok)return {ok:false,error:'funds',profile:debit.profile};
    const result=rouletteResult(choice,randomInt),payout=bet*result.multiplier; if(payout>0)profiles.addCoins(userId,payout);
    return {ok:true,bet,choice,payout,net:payout-bet,...result,profile:profiles.get(userId)};
  }
  getHand(chatId,userId){ this._cleanup(); return clone(this._ensure().hands[this._key(chatId,userId)]||null); }
  startBlackjack(chatId,userId,bet,{randomInt=crypto.randomInt}={}){
    bet=validBet(bet); if(!bet)return {ok:false,error:'bet'}; const state=this._ensure(),key=this._key(chatId,userId); this._cleanup(state); if(state.hands[key])return {ok:false,error:'active',hand:clone(state.hands[key])};
    const debit=profiles.spendCoins(userId,bet); if(!debit.ok)return {ok:false,error:'funds',profile:debit.profile};
    const deck=shuffleDeck(createDeck(),randomInt),hand={id:`BJ-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,chatId,userId,bet,deck,player:[deck.pop(),deck.pop()],dealer:[deck.pop(),deck.pop()],status:'playing',startedAt:Date.now(),updatedAt:Date.now()};
    state.hands[key]=hand; this._save();
    if(isBlackjack(hand.player)||isBlackjack(hand.dealer))return this._settleNatural(key,hand);
    return {ok:true,finished:false,hand:clone(hand),playerValue:handValue(hand.player),dealerUp:clone(hand.dealer[0])};
  }
  _finish(key,hand,{outcome,payout=0,reason=''}){
    hand.status='finished'; hand.outcome=outcome; hand.payout=payout; hand.reason=reason; hand.finishedAt=Date.now(); hand.updatedAt=hand.finishedAt;
    if(payout>0)profiles.addCoins(hand.userId,payout);
    delete this._ensure().hands[key]; this._save();
    return {ok:true,finished:true,outcome,payout,net:payout-hand.bet,reason,hand:clone(hand),playerValue:handValue(hand.player),dealerValue:handValue(hand.dealer),profile:profiles.get(hand.userId)};
  }
  _settleNatural(key,hand){
    const p=isBlackjack(hand.player),d=isBlackjack(hand.dealer); if(p&&d)return this._finish(key,hand,{outcome:'push',payout:hand.bet,reason:'double-blackjack'}); if(p)return this._finish(key,hand,{outcome:'win',payout:Math.floor(hand.bet*2.5),reason:'blackjack'}); return this._finish(key,hand,{outcome:'loss',payout:0,reason:'dealer-blackjack'});
  }
  hitBlackjack(chatId,userId){
    const state=this._ensure(),key=this._key(chatId,userId),hand=state.hands[key]; if(!hand)return {ok:false,error:'not-found'};
    hand.player.push(hand.deck.pop()); hand.updatedAt=Date.now(); const value=handValue(hand.player);
    if(value>21)return this._finish(key,hand,{outcome:'loss',payout:0,reason:'bust'});
    if(value===21)return this.standBlackjack(chatId,userId);
    this._save(); return {ok:true,finished:false,hand:clone(hand),playerValue:value,dealerUp:clone(hand.dealer[0])};
  }
  standBlackjack(chatId,userId){
    const state=this._ensure(),key=this._key(chatId,userId),hand=state.hands[key]; if(!hand)return {ok:false,error:'not-found'};
    while(handValue(hand.dealer)<17)hand.dealer.push(hand.deck.pop());
    const pv=handValue(hand.player),dv=handValue(hand.dealer); let outcome='loss',payout=0,reason='dealer-higher';
    if(dv>21||pv>dv){ outcome='win'; payout=hand.bet*2; reason=dv>21?'dealer-bust':'player-higher'; }
    else if(pv===dv){ outcome='push'; payout=hand.bet; reason='push'; }
    return this._finish(key,hand,{outcome,payout,reason});
  }
  abortBlackjack(chatId,userId){
    const state=this._ensure(),key=this._key(chatId,userId),hand=state.hands[key]; if(!hand)return {ok:false,error:'not-found'};
    delete state.hands[key]; profiles.addCoins(userId,hand.bet); this._save(); return {ok:true,refunded:hand.bet,profile:profiles.get(userId)};
  }
  resetForTests(){ this.sessions.clear(); this.cooldowns.clear(); }
}

const casino=new CasinoStore();
module.exports={CasinoStore,casino,MIN_BET,MAX_BET,CASINO_COOLDOWN_MS,BLACKJACK_TTL_MS,SLOT_SYMBOLS,SLOT_WEIGHT,RED_NUMBERS,validBet,rouletteColor,weightedSymbol,spinSlots,parseRouletteChoice,rouletteResult,createDeck,shuffleDeck,handValue,isBlackjack,cardText,handText};
