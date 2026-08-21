'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const profileMod=require('../utils/gameCenterProfiles');
const {WerewolfStore,buildRoles,checkWinner,MIN_WOLF_PLAYERS,MAX_WOLF_PLAYERS}=require('../utils/gameCenterWerewolf');

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-wolf-'));}
function run(sid,fn){return sessionContext.run(sid,fn);}
function setup(){const root=temp();profileMod.profiles.root=root;profileMod.profiles.sessions.clear();return{root,w:new WerewolfStore({root})};}
function fill(w,chat,count){const players=Array.from({length:count},(_,i)=>`p${i}@s.whatsapp.net`);w.create(chat,players[0]);for(const p of players.slice(1))w.join(chat,p);return players;}
function indexOf(g,p){return g.players.indexOf(p)+1;}

test('Loup-Garou: rôles respectent les bornes et proportions',()=>{
  for(let n=MIN_WOLF_PLAYERS;n<=MAX_WOLF_PLAYERS;n++){
    const roles=buildRoles(n,(a)=>a);assert.equal(roles.length,n);assert.equal(roles.filter(r=>r==='wolf').length,Math.max(1,Math.floor(n/4)));
    assert.equal(roles.filter(r=>r==='seer').length,n>=6?1:0);assert.equal(roles.filter(r=>r==='doctor').length,n>=7?1:0);
  }
});

test('Loup-Garou: état public ne contient ni rôles ni actions de nuit',()=>{
  const {w}=setup();run('wolf-public',()=>{fill(w,'g@g.us',7);w.start('g@g.us','p0@s.whatsapp.net',{randomInt:(a)=>a});const pub=w.public('g@g.us');assert.equal('roles' in pub,false);assert.equal('night' in pub,false);assert.equal('votes' in pub,false);});
});

test('Loup-Garou: permissions nocturnes et cibles sont strictes',()=>{
  const {w}=setup();run('wolf-actions',()=>{
    fill(w,'g@g.us',7);w.start('g@g.us','p0@s.whatsapp.net',{randomInt:(a)=>a});const g=w.get('g@g.us');const wolf=g.players.find(p=>g.roles[p]==='wolf'),seer=g.players.find(p=>g.roles[p]==='seer'),doctor=g.players.find(p=>g.roles[p]==='doctor'),villager=g.players.find(p=>g.roles[p]==='villager');
    assert.equal(w.nightAction(g.alias,villager,'kill',indexOf(g,wolf)).error,'role');assert.equal(w.nightAction(g.alias,wolf,'kill',indexOf(g,wolf)).error,'self');
    assert.equal(w.nightAction(g.alias,wolf,'kill',indexOf(g,doctor)).ok,true);assert.equal(w.nightAction(g.alias,seer,'see',indexOf(g,wolf)).seenIsWolf,true);assert.equal(w.nightAction(g.alias,seer,'see',indexOf(g,villager)).error,'done');
    const r=w.nightAction(g.alias,doctor,'save',indexOf(g,doctor));assert.equal(r.ok,true);assert.ok(r.resolution);assert.equal(r.resolution.game.phase,'day');
  });
});

test('Loup-Garou: médecin peut sauver la cible de la nuit',()=>{
  const {w}=setup();run('wolf-save',()=>{
    fill(w,'g@g.us',7);w.start('g@g.us','p0@s.whatsapp.net',{randomInt:(a)=>a});const g=w.get('g@g.us'),wolf=g.players.find(p=>g.roles[p]==='wolf'),seer=g.players.find(p=>g.roles[p]==='seer'),doctor=g.players.find(p=>g.roles[p]==='doctor'),target=g.players.find(p=>g.roles[p]==='villager');
    w.nightAction(g.alias,seer,'see',indexOf(g,wolf));w.nightAction(g.alias,doctor,'save',indexOf(g,target));const r=w.nightAction(g.alias,wolf,'kill',indexOf(g,target));assert.equal(r.resolution.saved,true);assert.equal(r.resolution.victim,target);assert.equal(r.resolution.game.alive[target],true);
  });
});

test('Loup-Garou: cycle nuit puis vote du village peut éliminer le loup et finir',()=>{
  const {w}=setup();run('wolf-village-win',()=>{
    const players=fill(w,'g@g.us',5);w.start('g@g.us',players[0],{randomInt:(a)=>a});let g=w.get('g@g.us'),wolf=g.players.find(p=>g.roles[p]==='wolf'),victim=g.players.find(p=>p!==wolf);
    const night=w.nightAction(g.alias,wolf,'kill',indexOf(g,victim));assert.ok(night.resolution);assert.equal(night.resolution.game.phase,'day');g=w.get('g@g.us');const alive=g.players.filter(p=>g.alive[p]);
    let final=null;for(const p of alive){const target=p===wolf?alive.find(x=>x!==wolf):wolf;const r=w.vote('g@g.us',p,indexOf(g,target));if(r.resolution)final=r.resolution;}
    assert.ok(final);assert.equal(final.finished,true);assert.equal(final.winner,'village');assert.equal(w.get('g@g.us'),null);
  });
});

test('Loup-Garou: victoire des loups détectée quand ils égalent les autres',()=>{
  const {w}=setup();run('wolf-winner-rule',()=>{fill(w,'g@g.us',5);w.start('g@g.us','p0@s.whatsapp.net',{randomInt:(a)=>a});const g=w._ensure().games['g@g.us'],wolf=g.players.find(p=>g.roles[p]==='wolf'),others=g.players.filter(p=>p!==wolf);g.alive[others[0]]=false;g.alive[others[1]]=false;g.alive[others[2]]=false;assert.equal(checkWinner(g),'wolves');});
});

test('Loup-Garou: forceResolve débloque nuit et jour sans accès externe aux internals',()=>{
  const {w}=setup();run('wolf-force',()=>{fill(w,'g@g.us',5);w.start('g@g.us','p0@s.whatsapp.net',{randomInt:(a)=>a});let r=w.forceResolve('g@g.us');assert.equal(r.finished,false);assert.equal(r.game.phase,'day');r=w.forceResolve('g@g.us');assert.equal(r.finished,false);assert.equal(r.game.phase,'night');});
});

test('Loup-Garou: persistance privée et isolation multi-session',()=>{
  const {root,w}=setup();run('wolf-s1',()=>{fill(w,'g@g.us',5);w.start('g@g.us','p0@s.whatsapp.net',{randomInt:(a)=>a});});run('wolf-s2',()=>{fill(w,'g@g.us',6);w.start('g@g.us','p0@s.whatsapp.net',{randomInt:(a)=>a});});const reload=new WerewolfStore({root});run('wolf-s1',()=>assert.equal(reload.get('g@g.us').players.length,5));run('wolf-s2',()=>assert.equal(reload.get('g@g.us').players.length,6));
});

test('Stress Loup-Garou: 1000 distributions de rôles valides',()=>{
  let ops=0;for(let n=5;n<=14;n++){for(let i=0;i<100;i++){const roles=buildRoles(n);assert.equal(roles.length,n);assert.ok(roles.includes('wolf'));ops++;}}assert.equal(ops,1000);
});
