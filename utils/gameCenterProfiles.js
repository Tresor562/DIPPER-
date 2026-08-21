'use strict';

const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const sessionContext=require('./sessionContext');

const START_COINS=250;
const MAX_COINS=1_000_000_000;
const MAX_XP=1_000_000_000;
const FISH_COOLDOWN_MS=30_000;
const MAX_ACHIEVEMENTS=50;
const FISH_TABLE=[
  {id:'sardine',name:'Sardine',emoji:'🐟',weight:4300,minCoins:8,maxCoins:18,xp:5},
  {id:'tilapia',name:'Tilapia',emoji:'🐠',weight:2700,minCoins:15,maxCoins:30,xp:8},
  {id:'catfish',name:'Poisson-chat',emoji:'🐡',weight:1500,minCoins:25,maxCoins:50,xp:12},
  {id:'golden_carp',name:'Carpe dorée',emoji:'✨🐟',weight:800,minCoins:60,maxCoins:110,xp:25},
  {id:'shark',name:'Requin',emoji:'🦈',weight:500,minCoins:100,maxCoins:180,xp:40},
  {id:'leviathan',name:'Léviathan',emoji:'🐉🌊',weight:200,minCoins:300,maxCoins:500,xp:100}
];
const FISH_WEIGHT=FISH_TABLE.reduce((n,x)=>n+x.weight,0);

function sid(){ return sessionContext.getCurrentSessionId(); }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function clampInt(v,min,max){ const n=Math.trunc(Number(v)||0); return Math.max(min,Math.min(max,n)); }
function levelFromXp(xp){ return Math.max(1,Math.floor(Math.sqrt(Math.max(0,xp)/100))+1); }
function defaultProfile(userId){
  const ts=Date.now();
  return {userId:String(userId),xp:0,level:1,coins:START_COINS,played:0,wins:0,losses:0,draws:0,streak:0,bestStreak:0,achievements:[],fishing:{casts:0,catches:0,totalCoins:0,lastFishAt:0,inventory:{}},createdAt:ts,updatedAt:ts};
}
function drawFish(randomInt=crypto.randomInt){
  const roll=randomInt(0,FISH_WEIGHT); let cursor=0;
  for(const fish of FISH_TABLE){ cursor+=fish.weight; if(roll<cursor)return fish; }
  return FISH_TABLE[0];
}
function achievementCatalog(){
  return {
    first_catch:{id:'first_catch',emoji:'🎣',name:'Premier poisson'},
    fisher_10:{id:'fisher_10',emoji:'🐟',name:'Pêcheur x10'},
    fisher_50:{id:'fisher_50',emoji:'🌊',name:'Maître pêcheur'},
    rich_1000:{id:'rich_1000',emoji:'🪙',name:'1 000 Dipper Coins'},
    level_5:{id:'level_5',emoji:'⭐',name:'Niveau 5'},
    first_win:{id:'first_win',emoji:'🏆',name:'Première victoire'},
    streak_5:{id:'streak_5',emoji:'🔥',name:'Série de 5 victoires'}
  };
}

class GameProfileStore{
  constructor({root=path.join(process.cwd(),'database','game-center')}={}){ this.root=root; this.sessions=new Map(); }
  _file(session=sid()){ return path.join(this.root,session,'profiles.json'); }
  _ensure(){
    const session=sid(); if(this.sessions.has(session))return this.sessions.get(session);
    const map=new Map();
    try{
      const data=JSON.parse(fs.readFileSync(this._file(session),'utf8'));
      for(const p of data.profiles||[]){ if(p?.userId)map.set(String(p.userId),p); }
    }catch(_){ }
    this.sessions.set(session,map); return map;
  }
  _save(){
    const session=sid(),map=this._ensure(),file=this._file(session); fs.mkdirSync(path.dirname(file),{recursive:true});
    const tmp=`${file}.tmp`; fs.writeFileSync(tmp,JSON.stringify({version:1,profiles:[...map.values()]},null,2)); fs.renameSync(tmp,file);
  }
  _live(userId){ const map=this._ensure(),key=String(userId); if(!map.has(key))map.set(key,defaultProfile(key)); return map.get(key); }
  _unlock(p){
    const catalog=achievementCatalog(),wanted=[];
    if((p.fishing?.catches||0)>=1)wanted.push('first_catch');
    if((p.fishing?.catches||0)>=10)wanted.push('fisher_10');
    if((p.fishing?.catches||0)>=50)wanted.push('fisher_50');
    if(p.coins>=1000)wanted.push('rich_1000');
    if(p.level>=5)wanted.push('level_5');
    if(p.wins>=1)wanted.push('first_win');
    if(p.bestStreak>=5)wanted.push('streak_5');
    const have=new Set((p.achievements||[]).map(x=>x.id));
    const added=[];
    for(const id of wanted){ if(!have.has(id)){ const item={...catalog[id],unlockedAt:Date.now()}; p.achievements.push(item); have.add(id); added.push(item); } }
    p.achievements=p.achievements.slice(-MAX_ACHIEVEMENTS); return added;
  }
  get(userId,{create=true}={}){
    const map=this._ensure(),key=String(userId),existed=map.has(key);
    if(!existed&&!create)return null;
    const p=this._live(key);
    if(create&&!existed)this._save();
    return clone(p);
  }
  addXp(userId,amount){ const p=this._live(userId),before=p.level; p.xp=clampInt(p.xp+amount,0,MAX_XP); p.level=levelFromXp(p.xp); p.updatedAt=Date.now(); const achievements=this._unlock(p); this._save(); return {profile:clone(p),levelUp:p.level>before,achievements}; }
  addCoins(userId,amount){ const p=this._live(userId); p.coins=clampInt(p.coins+amount,0,MAX_COINS); p.updatedAt=Date.now(); const achievements=this._unlock(p); this._save(); return {profile:clone(p),achievements}; }
  spendCoins(userId,amount){ amount=clampInt(amount,0,MAX_COINS); const p=this._live(userId); if(amount<=0)return {ok:false,error:'amount',profile:clone(p)}; if(p.coins<amount)return {ok:false,error:'funds',profile:clone(p)}; p.coins-=amount; p.updatedAt=Date.now(); this._save(); return {ok:true,profile:clone(p)}; }
  recordResult(userId,result='draw',{xp=0,coins=0}={}){
    const p=this._live(userId); p.played++;
    if(result==='win'){ p.wins++; p.streak++; p.bestStreak=Math.max(p.bestStreak,p.streak); }
    else if(result==='loss'){ p.losses++; p.streak=0; }
    else { p.draws++; }
    p.xp=clampInt(p.xp+xp,0,MAX_XP); p.coins=clampInt(p.coins+coins,0,MAX_COINS); p.level=levelFromXp(p.xp); p.updatedAt=Date.now(); const achievements=this._unlock(p); this._save(); return {profile:clone(p),achievements};
  }
  fish(userId,{ts=Date.now(),randomInt=crypto.randomInt}={}){
    const p=this._live(userId),last=Number(p.fishing?.lastFishAt||0),remaining=FISH_COOLDOWN_MS-(ts-last);
    if(last&&remaining>0)return {ok:false,error:'cooldown',remainingMs:remaining,profile:clone(p)};
    const fish=drawFish(randomInt),coins=randomInt(fish.minCoins,fish.maxCoins+1);
    p.fishing=p.fishing||{casts:0,catches:0,totalCoins:0,lastFishAt:0,inventory:{}};
    p.fishing.casts++; p.fishing.catches++; p.fishing.totalCoins=clampInt((p.fishing.totalCoins||0)+coins,0,MAX_COINS); p.fishing.lastFishAt=ts;
    p.fishing.inventory=p.fishing.inventory||{}; p.fishing.inventory[fish.id]=(p.fishing.inventory[fish.id]||0)+1;
    p.coins=clampInt(p.coins+coins,0,MAX_COINS); p.xp=clampInt(p.xp+fish.xp,0,MAX_XP); p.level=levelFromXp(p.xp); p.updatedAt=ts;
    const achievements=this._unlock(p); this._save(); return {ok:true,fish:clone(fish),coins,xp:fish.xp,profile:clone(p),achievements};
  }
  leaderboard(metric='xp',limit=10){
    const key=String(metric||'xp').toLowerCase(),allowed=new Set(['xp','coins','wins','fish']); if(!allowed.has(key))return {error:'metric'};
    const rows=[...this._ensure().values()].map(p=>({userId:p.userId,value:key==='fish'?(p.fishing?.catches||0):Number(p[key]||0),level:p.level||1}));
    rows.sort((a,b)=>b.value-a.value||String(a.userId).localeCompare(String(b.userId))); return {metric:key,rows:rows.slice(0,Math.max(1,Math.min(Number(limit)||10,25))).map((r,i)=>({...r,rank:i+1}))};
  }
  resetForTests(){ this.sessions.clear(); }
}

const profiles=new GameProfileStore();
module.exports={GameProfileStore,profiles,START_COINS,MAX_COINS,MAX_XP,FISH_COOLDOWN_MS,FISH_TABLE,FISH_WEIGHT,levelFromXp,drawFish,achievementCatalog};
