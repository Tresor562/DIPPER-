'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const {GameCenterEngine}=require('../utils/gameCenterEngine');
const profileMod=require('../utils/gameCenterProfiles');
const {BANK,MAX_WRONG,maskWord}=require('../utils/gameCenterBlock10');

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-game-center-v10-'));}
function run(sid,fn){return sessionContext.run(sid,fn);}
function setup(){const root=temp();profileMod.profiles.root=root;profileMod.profiles.sessions.clear();return{root,e:new GameCenterEngine({root})};}
function sockMock(){const sent=[];return{sent,async sendMessage(jid,payload){sent.push({jid,payload});return{key:{id:`m${sent.length}`}};}};}
function msg(chat,user,text){return{key:{remoteJid:chat,participant:user,fromMe:false},message:{conversation:text}};}
function extra(chat,user,sock){return{from:chat,sender:user,isGroup:true,isAdmin:false,isOwner:false,isSupremeOwner:false,phrases:{footer:()=>'> test'},reply:async text=>sock.sendMessage(chat,{text})};}
function freshCommand(root){for(const p of ['../commands/games_entertainment/hangman','../utils/gameCenterBlock10','../utils/gameCenterEngine'].map(require.resolve))delete require.cache[p];const mod=require('../utils/gameCenterEngine');mod.engine.root=root;mod.engine.games.clear();mod.engine._loadedSessions.clear();require('../utils/gameCenterBlock10');return require('../commands/games_entertainment/hangman');}

test('Pendu: catégories disponibles et mot masqué',()=>{
  assert.ok(BANK.anime.length>=10);assert.ok(BANK.tech.length>=10);assert.ok(BANK.general.length>=10);
  assert.equal(maskWord('naruto',['n','a']),'N A _ _ _ _');
});

test('Pendu: bonne lettre, doublon et mauvaise lettre',()=>{
  const {e}=setup();run('hangman-flow',()=>{
    const g=e.startHangman('g@g.us','host',{category:'anime',randomInt:()=>0});assert.equal(g.answer,'naruto');
    let r=e.playHangman('g@g.us','u','n',g.alias);assert.equal(r.ok,true);assert.equal(r.correct,true);assert.match(r.mask,/N/);
    r=e.playHangman('g@g.us','u','n',g.alias);assert.equal(r.reason,'duplicate');
    r=e.playHangman('g@g.us','u','z',g.alias);assert.equal(r.ok,true);assert.equal(r.correct,false);assert.equal(r.game.wrongCount,1);
  });
});

test('Pendu: mot complet gagne et récompense une seule fois',()=>{
  const {e}=setup();run('hangman-win',()=>{
    const before=profileMod.profiles.get('u').coins;
    const g=e.startHangman('g@g.us','host',{category:'tech',randomInt:()=>1});
    const r=e.playHangman('g@g.us','u',g.answer,g.alias);assert.equal(r.won,true);assert.equal(r.game.status,'finished');
    const p=profileMod.profiles.get('u');assert.equal(p.coins,before+20);assert.equal(p.xp,30);assert.equal(p.wins,1);
    assert.equal(e.playHangman('g@g.us','u',g.answer,g.alias).handled,false);
    assert.equal(profileMod.profiles.get('u').coins,before+20);
  });
});

test('Pendu: huit erreurs terminent la partie sans récompense',()=>{
  const {e}=setup();run('hangman-loss',()=>{
    const before=profileMod.profiles.get('u').coins;
    const g=e.startHangman('g@g.us','host',{category:'anime',randomInt:()=>0});
    const misses=['b','c','d','f','h','j','k','q'];let r;
    for(const x of misses)r=e.playHangman('g@g.us','u',x,g.alias);
    assert.equal(r.lost,true);assert.equal(r.game.wrongCount,MAX_WRONG);assert.equal(r.answer,'naruto');assert.equal(profileMod.profiles.get('u').coins,before);
  });
});

test('Pendu: une seule partie par groupe mais isolation entre sessions',()=>{
  const {e}=setup();
  run('hangman-s1',()=>{assert.ok(e.startHangman('g@g.us','a',{randomInt:()=>0}).id);assert.equal(e.startHangman('g@g.us','b',{randomInt:()=>0}).error,'duplicate');});
  run('hangman-s2',()=>assert.ok(e.startHangman('g@g.us','b',{randomInt:()=>0}).id));
});

test('WhatsApp Pendu: démarrage, lettre et status restent explicites',async()=>{
  const root=temp(),cmd=freshCommand(root),sock=sockMock(),chat='hangman-wa@g.us',user='u@s.whatsapp.net';
  await sessionContext.run('hangman-wa',async()=>{
    await cmd.execute(sock,msg(chat,user,'.hangman start anime'),['start','anime'],extra(chat,user,sock));
    assert.match(sock.sent.at(-1).payload.text,/PENDU/i);assert.match(sock.sent.at(-1).payload.text,/lettre/i);
    const active=cmd.engine.get(chat,null,'hangman');assert.ok(active);
    const letter=active.answer[0];
    await cmd.execute(sock,msg(chat,user,`.hangman lettre ${letter}`),['lettre',letter],extra(chat,user,sock));
    assert.match(sock.sent.at(-1).payload.text,/Bonne lettre/i);
    await cmd.execute(sock,msg(chat,user,'.hangman status'),['status'],extra(chat,user,sock));
    assert.match(sock.sent.at(-1).payload.text,new RegExp(`#${active.alias}`));
  });
});

test('Stress Pendu: 3000 parties multi-session sans état croisé',()=>{
  const {e}=setup();let ops=0;
  for(let s=0;s<30;s++)run(`hangman-stress-${s}`,()=>{
    for(let i=0;i<100;i++){
      const chat=`g${i}@g.us`;const g=e.startHangman(chat,'host',{category:'general',randomInt:()=>i%BANK.general.length});assert.ok(g.id);
      const r=e.playHangman(chat,'u',g.answer,g.alias);assert.equal(r.won,true);ops++;
    }
  });
  assert.equal(ops,3000);
});
