'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const profileMod=require('../utils/gameCenterProfiles');
const {RpgStore,CLASSES,classStats,levelFromXp,EXPLORE_COOLDOWN_MS,REST_COOLDOWN_MS}=require('../utils/gameCenterRpg');

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-game-center-v9-'));}
function run(sid,fn){return sessionContext.run(sid,fn);}
function setup(){const root=temp();profileMod.profiles.root=root;profileMod.profiles.sessions.clear();const rpg=new RpgStore({root});return{root,rpg,profiles:profileMod.profiles};}
function seq(values){let i=0;return(min,max)=>{const v=values[Math.min(i++,values.length-1)];return Math.max(min,Math.min(max-1,v));};}
function live(store,user){return store._ensure().get(String(user));}

test('RPG: classes et progression ont des stats cohérentes',()=>{
  assert.ok(CLASSES.warrior.maxHp>CLASSES.mage.maxHp);assert.ok(CLASSES.mage.attack>CLASSES.warrior.attack);
  assert.equal(levelFromXp(0),1);assert.equal(levelFromXp(99),1);assert.equal(levelFromXp(100),2);assert.equal(levelFromXp(999999),100);
  assert.ok(classStats('warrior',10).attack>classStats('warrior',1).attack);
});

test('RPG: création, classe invalide et doublon',()=>{
  const {rpg}=setup();run('rpg-start',()=>{
    assert.equal(rpg.start('u','paladin').error,'class');
    const a=rpg.start('u','mage');assert.equal(a.ok,true);assert.equal(a.character.classId,'mage');assert.equal(a.character.potions,2);
    assert.equal(rpg.start('u','warrior').error,'exists');
  });
});

test('RPG: personnage persiste et reste isolé entre sessions',()=>{
  const {root,rpg}=setup();run('rpg-s1',()=>rpg.start('u','rogue'));
  run('rpg-s2',()=>assert.equal(rpg.get('u'),null));
  const reload=new RpgStore({root});run('rpg-s1',()=>assert.equal(reload.get('u').classId,'rogue'));
});

test('RPG: exploration trésor crédite XP RPG + profil + Dipper Coins',()=>{
  const {rpg,profiles}=setup();run('rpg-treasure',()=>{
    rpg.start('u','warrior');const before=profiles.get('u').coins;
    const r=rpg.explore('u',{ts:10000,randomInt:seq([70,10,8])});
    assert.equal(r.type,'treasure');assert.equal(r.coins,12);assert.equal(r.xp,8);assert.equal(r.character.xp,8);assert.equal(profiles.get('u').coins,before+12);assert.equal(profiles.get('u').xp,8);
  });
});

test('RPG: source soigne sans dépasser les HP max',()=>{
  const {rpg}=setup();run('rpg-fountain',()=>{
    rpg.start('u','warrior');live(rpg,'u').hp=20;rpg._save();
    const r=rpg.explore('u',{ts:10000,randomInt:()=>95});assert.equal(r.type,'fountain');assert.ok(r.character.hp>20);assert.ok(r.character.hp<=r.character.maxHp);
  });
});

test('RPG: rencontre bloque une deuxième exploration jusqu’à résolution',()=>{
  const {rpg}=setup();run('rpg-encounter',()=>{
    rpg.start('u','mage');const r=rpg.explore('u',{ts:10000,randomInt:seq([0,0])});assert.equal(r.type,'monster');assert.ok(r.monster.hp>0);
    assert.equal(rpg.explore('u',{ts:20000,randomInt:()=>90}).error,'encounter');
  });
});

test('RPG: victoire combat verse récompenses et enregistre victoire profil',()=>{
  const {rpg,profiles}=setup();run('rpg-win',()=>{
    rpg.start('u','warrior');const c=live(rpg,'u');c.encounter={id:'m',baseId:'slime',name:'Test Slime',emoji:'🟢',maxHp:1,hp:1,attack:1,defense:0,xp:120,coins:[20,20]};rpg._save();
    const before=profiles.get('u').coins;const r=rpg.attack('u',{randomInt:seq([-2,20,99])});
    assert.equal(r.won,true);assert.equal(r.character.encounter,null);assert.equal(r.character.victories,1);assert.equal(r.levelUp,true);assert.equal(r.character.level,2);assert.equal(profiles.get('u').coins,before+20);assert.equal(profiles.get('u').wins,1);
  });
});

test('RPG: K.O. clôt le combat et rend 50 % des HP au héros',()=>{
  const {rpg,profiles}=setup();run('rpg-loss',()=>{
    rpg.start('u','mage');const c=live(rpg,'u');c.hp=1;c.encounter={id:'boss',baseId:'dragon',name:'Boss',emoji:'🐉',maxHp:999,hp:999,attack:999,defense:999,xp:1,coins:[1,1]};rpg._save();
    const r=rpg.attack('u',{randomInt:(min,max)=>max-1});assert.equal(r.lost,true);assert.equal(r.character.encounter,null);assert.equal(r.character.defeats,1);assert.equal(r.character.hp,Math.round(r.character.maxHp*0.5));assert.equal(profiles.get('u').losses,1);
  });
});

test('RPG: potion soigne, se consomme et refuse HP pleins',()=>{
  const {rpg}=setup();run('rpg-potion',()=>{
    rpg.start('u','rogue');assert.equal(rpg.potion('u').error,'full');const c=live(rpg,'u');c.hp=10;rpg._save();
    const r=rpg.potion('u');assert.equal(r.ok,true);assert.ok(r.healed>0);assert.equal(r.character.potions,1);
  });
});

test('RPG: repos respecte cooldown et est interdit en combat',()=>{
  const {rpg}=setup();run('rpg-rest',()=>{
    rpg.start('u','warrior');live(rpg,'u').hp=30;rpg._save();const a=rpg.rest('u',{ts:100000});assert.equal(a.ok,true);assert.equal(a.character.hp,a.character.maxHp);
    assert.equal(rpg.rest('u',{ts:100001}).error,'cooldown');assert.ok(rpg.rest('u',{ts:100001}).remainingMs<=REST_COOLDOWN_MS);
    const c=live(rpg,'u');c.encounter={id:'m',name:'M',emoji:'👾',hp:5,maxHp:5,attack:1,defense:1,xp:1,coins:[1,1]};rpg._save();assert.equal(rpg.rest('u',{ts:100000+REST_COOLDOWN_MS}).error,'encounter');
  });
});

test('RPG: fuite supprime seulement la rencontre',()=>{
  const {rpg}=setup();run('rpg-flee',()=>{
    rpg.start('u','warrior');rpg.explore('u',{ts:10000,randomInt:seq([0,0])});const r=rpg.flee('u');assert.equal(r.ok,true);assert.equal(rpg.get('u').encounter,null);assert.equal(rpg.flee('u').error,'no-encounter');
  });
});

test('RPG: cooldown exploration empêche le spam hors combat',()=>{
  const {rpg}=setup();run('rpg-cooldown',()=>{
    rpg.start('u','warrior');const a=rpg.explore('u',{ts:10000,randomInt:seq([95])});assert.equal(a.type,'fountain');const b=rpg.explore('u',{ts:10001,randomInt:()=>95});assert.equal(b.error,'cooldown');assert.ok(b.remainingMs<=EXPLORE_COOLDOWN_MS);
  });
});

test('Stress RPG: 1 000 explorations de trésor sur 10 sessions restent isolées',()=>{
  const {rpg}=setup();let ops=0;
  for(let s=0;s<10;s++)run(`rpg-stress-${s}`,()=>{rpg.start('u','warrior');for(let i=0;i<100;i++){const c=live(rpg,'u');c.lastExploreAt=0;rpg._save();const r=rpg.explore('u',{ts:10000+i,randomInt:seq([70,10,8])});assert.equal(r.type,'treasure');ops++;}});
  assert.equal(ops,1000);run('rpg-stress-0',()=>assert.ok(rpg.get('u').xp>0));run('rpg-stress-9',()=>assert.ok(rpg.get('u').xp>0));
});
