'use strict';

const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const sessionContext=require('./sessionContext');
const {profiles}=require('./gameCenterProfiles');

const MAX_RPG_LEVEL=100;
const EXPLORE_COOLDOWN_MS=5000;
const REST_COOLDOWN_MS=5*60*1000;
const CLASSES={
  warrior:{id:'warrior',name:'Guerrier',emoji:'⚔️',maxHp:140,attack:18,defense:9},
  mage:{id:'mage',name:'Mage',emoji:'🪄',maxHp:100,attack:25,defense:4},
  rogue:{id:'rogue',name:'Assassin',emoji:'🗡️',maxHp:115,attack:21,defense:6}
};
const MONSTERS=[
  {id:'slime',name:'Slime',emoji:'🟢',hp:35,attack:8,defense:1,xp:20,coins:[8,16]},
  {id:'wolf',name:'Loup noir',emoji:'🐺',hp:55,attack:12,defense:3,xp:30,coins:[12,24]},
  {id:'goblin',name:'Gobelin',emoji:'👺',hp:70,attack:15,defense:5,xp:45,coins:[18,34]},
  {id:'golem',name:'Golem',emoji:'🗿',hp:100,attack:18,defense:9,xp:65,coins:[28,48]},
  {id:'dragon',name:'Dragon',emoji:'🐉',hp:145,attack:24,defense:10,xp:100,coins:[50,90]}
];

function sid(){return sessionContext.getCurrentSessionId();}
function clone(v){return JSON.parse(JSON.stringify(v));}
function levelFromXp(xp){return Math.min(MAX_RPG_LEVEL,Math.floor(Math.max(0,Number(xp)||0)/100)+1);}
function classStats(classId,level=1){const c=CLASSES[classId]||CLASSES.warrior,l=Math.max(1,Math.min(MAX_RPG_LEVEL,Number(level)||1));return{maxHp:c.maxHp+(l-1)*8,attack:c.attack+(l-1)*2,defense:c.defense+Math.floor((l-1)*1.2)};}
function defaultCharacter(userId,classId){const stats=classStats(classId,1),ts=Date.now();return{userId:String(userId),classId,level:1,xp:0,hp:stats.maxHp,maxHp:stats.maxHp,attack:stats.attack,defense:stats.defense,potions:2,victories:0,defeats:0,explorations:0,encounter:null,lastExploreAt:0,lastRestAt:0,createdAt:ts,updatedAt:ts};}
function damage(attack,defense,randomInt=crypto.randomInt){const variance=randomInt(-2,4);return Math.max(1,Math.trunc(attack)-Math.trunc(defense)+variance);}
function monsterForLevel(level,randomInt=crypto.randomInt){const maxIndex=Math.min(MONSTERS.length-1,Math.max(0,Math.floor((level-1)/3)+1));const base=MONSTERS[randomInt(0,maxIndex+1)],scale=1+Math.max(0,level-1)*0.08;return{id:`${base.id}-${crypto.randomBytes(3).toString('hex')}`,baseId:base.id,name:base.name,emoji:base.emoji,maxHp:Math.round(base.hp*scale),hp:Math.round(base.hp*scale),attack:Math.round(base.attack*scale),defense:Math.round(base.defense*scale),xp:Math.round(base.xp*scale),coins:[Math.round(base.coins[0]*scale),Math.round(base.coins[1]*scale)]};}

class RpgStore{
  constructor({root=path.join(process.cwd(),'database','game-center')}={}){this.root=root;this.sessions=new Map();}
  _file(session=sid()){return path.join(this.root,session,'rpg.json');}
  _ensure(){const session=sid();if(this.sessions.has(session))return this.sessions.get(session);const chars=new Map();try{const data=JSON.parse(fs.readFileSync(this._file(session),'utf8'));for(const c of data.characters||[])if(c?.userId)chars.set(String(c.userId),c);}catch(_){}this.sessions.set(session,chars);return chars;}
  _save(){const file=this._file(),map=this._ensure();fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify({version:1,characters:[...map.values()]},null,2));fs.renameSync(tmp,file);}
  get(userId){return clone(this._ensure().get(String(userId))||null);}
  start(userId,classId='warrior'){
    classId=String(classId||'').toLowerCase();if(!CLASSES[classId])return{ok:false,error:'class'};const map=this._ensure(),key=String(userId);if(map.has(key))return{ok:false,error:'exists',character:clone(map.get(key))};const c=defaultCharacter(key,classId);map.set(key,c);this._save();return{ok:true,character:clone(c)};
  }
  _sync(c){const oldLevel=c.level;c.level=levelFromXp(c.xp);const stats=classStats(c.classId,c.level);const hpGain=Math.max(0,stats.maxHp-c.maxHp);c.maxHp=stats.maxHp;c.attack=stats.attack;c.defense=stats.defense;if(c.level>oldLevel)c.hp=Math.min(c.maxHp,c.hp+hpGain+20);return c.level>oldLevel;}
  explore(userId,{ts=Date.now(),randomInt=crypto.randomInt}={}){
    const map=this._ensure(),c=map.get(String(userId));if(!c)return{ok:false,error:'not-started'};if(c.encounter)return{ok:false,error:'encounter',character:clone(c)};const remaining=EXPLORE_COOLDOWN_MS-(ts-Number(c.lastExploreAt||0));if(c.lastExploreAt&&remaining>0)return{ok:false,error:'cooldown',remainingMs:remaining};c.lastExploreAt=ts;c.explorations++;const roll=randomInt(0,100);
    if(roll<65){c.encounter=monsterForLevel(c.level,randomInt);c.updatedAt=ts;this._save();return{ok:true,type:'monster',monster:clone(c.encounter),character:clone(c)};}
    if(roll<90){const coins=randomInt(10,36)+c.level*2,xp=randomInt(8,21);c.xp+=xp;const levelUp=this._sync(c);c.updatedAt=ts;profiles.addCoins(userId,coins);profiles.addXp(userId,xp);this._save();return{ok:true,type:'treasure',coins,xp,levelUp,character:clone(c)};}
    const heal=Math.max(1,Math.round(c.maxHp*0.35));const before=c.hp;c.hp=Math.min(c.maxHp,c.hp+heal);c.updatedAt=ts;this._save();return{ok:true,type:'fountain',healed:c.hp-before,character:clone(c)};
  }
  attack(userId,{randomInt=crypto.randomInt}={}){
    const map=this._ensure(),c=map.get(String(userId));if(!c)return{ok:false,error:'not-started'};if(!c.encounter)return{ok:false,error:'no-encounter',character:clone(c)};const m=c.encounter,pDamage=damage(c.attack,m.defense,randomInt);m.hp=Math.max(0,m.hp-pDamage);
    if(m.hp<=0){const coins=randomInt(m.coins[0],m.coins[1]+1),xp=m.xp;c.victories++;c.xp+=xp;c.encounter=null;const levelUp=this._sync(c);if(randomInt(0,100)<18)c.potions=Math.min(20,c.potions+1);c.updatedAt=Date.now();profiles.addCoins(userId,coins);profiles.addXp(userId,xp);profiles.recordResult(userId,'win');this._save();return{ok:true,won:true,playerDamage:pDamage,coins,xp,levelUp,character:clone(c),monster:clone(m)};}
    const mDamage=damage(m.attack,c.defense,randomInt);c.hp=Math.max(0,c.hp-mDamage);
    if(c.hp<=0){c.defeats++;c.encounter=null;c.hp=Math.max(1,Math.round(c.maxHp*0.5));c.updatedAt=Date.now();profiles.recordResult(userId,'loss');this._save();return{ok:true,lost:true,playerDamage:pDamage,monsterDamage:mDamage,character:clone(c),monster:clone(m)};}
    c.updatedAt=Date.now();this._save();return{ok:true,won:false,lost:false,playerDamage:pDamage,monsterDamage:mDamage,character:clone(c),monster:clone(m)};
  }
  potion(userId){const map=this._ensure(),c=map.get(String(userId));if(!c)return{ok:false,error:'not-started'};if(c.potions<=0)return{ok:false,error:'none'};if(c.hp>=c.maxHp)return{ok:false,error:'full'};const before=c.hp;c.potions--;c.hp=Math.min(c.maxHp,c.hp+Math.max(25,Math.round(c.maxHp*0.4)));c.updatedAt=Date.now();this._save();return{ok:true,healed:c.hp-before,character:clone(c)};}
  rest(userId,{ts=Date.now()}={}){const map=this._ensure(),c=map.get(String(userId));if(!c)return{ok:false,error:'not-started'};if(c.encounter)return{ok:false,error:'encounter'};const remaining=REST_COOLDOWN_MS-(ts-Number(c.lastRestAt||0));if(c.lastRestAt&&remaining>0)return{ok:false,error:'cooldown',remainingMs:remaining};const before=c.hp;c.hp=c.maxHp;c.lastRestAt=ts;c.updatedAt=ts;this._save();return{ok:true,healed:c.hp-before,character:clone(c)};}
  flee(userId){const map=this._ensure(),c=map.get(String(userId));if(!c)return{ok:false,error:'not-started'};if(!c.encounter)return{ok:false,error:'no-encounter'};const monster=clone(c.encounter);c.encounter=null;c.updatedAt=Date.now();this._save();return{ok:true,monster,character:clone(c)};}
  resetForTests(){this.sessions.clear();}
}

const rpg=new RpgStore();
module.exports={RpgStore,rpg,CLASSES,MONSTERS,MAX_RPG_LEVEL,EXPLORE_COOLDOWN_MS,REST_COOLDOWN_MS,levelFromXp,classStats,defaultCharacter,damage,monsterForLevel};
