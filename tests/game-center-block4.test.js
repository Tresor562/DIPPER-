'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const {GameCenterEngine}=require('../utils/gameCenterEngine');
const {
  SONG_BANK,MAX_CLUE_ATTEMPTS,clueQuestion,availableCategories
}=require('../utils/gameCenterBlock4');

function temp(){ return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-game-center-v4-')); }
function run(sid,fn){ return sessionContext.run(sid,fn); }
function freshCommand(){
  const modules=[
    '../commands/games_entertainment/gamecenter',
    '../utils/gameCenterWhatsappBlock4','../utils/gameCenterWhatsappBlock3','../utils/gameCenterWhatsappBlock2',
    '../utils/gameCenterBlock4','../utils/gameCenterBlock3','../utils/gameCenterBlock2','../utils/gameCenterEngine'
  ].map(require.resolve);
  for(const p of modules)delete require.cache[p];
  const mod=require('../utils/gameCenterEngine');
  mod.engine.root=temp(); mod.engine.games.clear(); mod.engine._loadedSessions.clear();
  require('../utils/gameCenterBlock2'); require('../utils/gameCenterBlock3'); require('../utils/gameCenterBlock4');
  return require('../commands/games_entertainment/gamecenter');
}
function sockMock(){ const sent=[]; return {sent,user:{id:'999999@s.whatsapp.net'},async sendMessage(jid,payload){ sent.push({jid,payload}); return {key:{id:`m${sent.length}`}}; }}; }
function msg(chat,user,text,mentions=[]){
  const contextInfo=mentions.length?{mentionedJid:mentions}:undefined;
  return {key:{remoteJid:chat,participant:chat.endsWith('@g.us')?user:undefined,fromMe:false,id:`${chat}-${user}-${Date.now()}`},message:contextInfo?{extendedTextMessage:{text,contextInfo}}:{conversation:text},pushName:user.split('@')[0]};
}
function extra(chat,user,sock,flags={}){ return {from:chat,sender:user,isGroup:true,isAdmin:false,isOwner:false,isSupremeOwner:false,...flags,phrases:{footer:()=>'> test'},reply:async text=>sock.sendMessage(chat,{text})}; }

test('Devine personnage: catégorie, score, progression et fin',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('character-flow',()=>{
    let g=e.startClueGame('g@g.us','host',{kind:'character',category:'anime',rounds:2});
    assert.equal(g.type,'guess-character'); assert.equal(g.category,'anime'); assert.equal(g.rounds,2);
    let q=clueQuestion(g);
    let r=e.answerClueGame('g@g.us','u1',q.answers[0],g.alias);
    assert.equal(r.correct,true); assert.equal(r.finished,false); assert.equal(r.game.round,2);
    q=clueQuestion(r.game);
    r=e.answerClueGame('g@g.us','u1',q.answers[0],g.alias);
    assert.equal(r.finished,true); assert.equal(r.ranking[0].userId,'u1'); assert.equal(r.ranking[0].score,2);
    assert.equal(e.get('g@g.us',g.alias,'guess-character'),null);
  });
});

test('Devine: catégories invalides et doublons par type sont bloqués',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('guess-guards',()=>{
    assert.equal(e.startClueGame('g@g.us','h',{kind:'song',category:'film'}).error,'category');
    assert.ok(availableCategories('song').includes('anime'));
    assert.ok(!e.startClueGame('g@g.us','h',{kind:'song',category:'anime',rounds:1}).error);
    assert.equal(e.startClueGame('g@g.us','h',{kind:'song',category:'international',rounds:1}).error,'duplicate');
    assert.ok(!e.startClueGame('g@g.us','h',{kind:'character',category:'anime',rounds:1}).error);
  });
});

test('Devine chanson: banque sans paroles reproduites',()=>{
  assert.ok(SONG_BANK.length>=8);
  for(const item of SONG_BANK){
    assert.equal(Object.prototype.hasOwnProperty.call(item,'lyrics'),false);
    assert.ok(item.clue.length<=40);
    assert.ok(Array.isArray(item.hints)&&item.hints.length>=2);
    assert.ok(Array.isArray(item.answers)&&item.answers.length>=1);
  }
});

test('Devine: indice progressif, doublon et limite anti-spam',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('guess-limit',()=>{
    const g=e.startClueGame('g@g.us','host',{kind:'screen',category:'film',rounds:1});
    let r=e.answerClueGame('g@g.us','spam','mauvaise réponse 0',g.alias); assert.equal(r.hint,null);
    assert.equal(e.answerClueGame('g@g.us','spam','mauvaise réponse 0',g.alias).reason,'duplicate');
    r=e.answerClueGame('g@g.us','spam','mauvaise réponse 1',g.alias); assert.equal(r.hint,null);
    r=e.answerClueGame('g@g.us','spam','mauvaise réponse 2',g.alias); assert.ok(r.hint);
    for(let i=3;i<MAX_CLUE_ATTEMPTS;i++)e.answerClueGame('g@g.us','spam',`mauvaise réponse ${i}`,g.alias);
    r=e.answerClueGame('g@g.us','spam','encore une réponse',g.alias); assert.equal(r.reason,'limit');
    const q=clueQuestion(e.get('g@g.us',g.alias,'guess-screen'));
    r=e.answerClueGame('g@g.us','winner',q.answers[0],g.alias); assert.equal(r.finished,true); assert.equal(r.game.winner,'winner');
  });
});

test('Devine: skip révèle puis avance sans donner de point',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('guess-skip',()=>{
    const g=e.startClueGame('g@g.us','host',{kind:'song',category:'mix',rounds:2});
    const first=clueQuestion(g).answers[0];
    let r=e.skipClueGame('g@g.us',g.alias); assert.equal(r.finished,false); assert.equal(r.answerText,first); assert.deepEqual(r.game.scores,{});
    const second=clueQuestion(r.game).answers[0];
    r=e.skipClueGame('g@g.us',g.alias); assert.equal(r.finished,true); assert.equal(r.answerText,second); assert.deepEqual(r.ranking,[]);
  });
});

test('Devine: persistance des essais et de la manche',()=>{
  const root=temp();
  run('guess-persist',()=>{
    const e1=new GameCenterEngine({root}); const g=e1.startClueGame('g@g.us','h',{kind:'character',category:'mix',rounds:2});
    e1.answerClueGame('g@g.us','u','réponse fausse',g.alias);
    const e2=new GameCenterEngine({root}); const loaded=e2.get('g@g.us',g.alias,'guess-character');
    assert.equal(loaded.round,1); assert.equal(loaded.attempts.u.count,1); assert.equal(loaded.wrong,1);
  });
});

test('Routeur Block4: vote et histoire ne sont jamais interprétés comme réponses Devine',()=>{
  const block=require('../utils/gameCenterWhatsappBlock4');
  const rows=[{type:'guess-character'},{type:'guess-song'}];
  assert.deepEqual(block.candidateTypes(rows,'vote @membre'),[]);
  assert.deepEqual(block.candidateTypes(rows,'+ une nouvelle ligne'),[]);
  assert.deepEqual(block.candidateTypes(rows,'1'),[]);
  assert.deepEqual(new Set(block.candidateTypes(rows,'Naruto')),new Set(['guess-character','guess-song']));
});

test('WhatsApp: deux jeux Devine exigent #ID et ne mutent aucune partie',async()=>{
  const cmd=freshCommand(), sock=sockMock(), chat='guess-amb@g.us', user='u@s.whatsapp.net';
  await sessionContext.run('wa-guess-amb',async()=>{
    const c=cmd.engine.startClueGame(chat,'host',{kind:'character',category:'anime',rounds:1});
    const s=cmd.engine.startClueGame(chat,'host',{kind:'song',category:'anime',rounds:1});
    const handled=await cmd.handleIncomingGameMessage(sock,msg(chat,user,'Naruto'),extra(chat,user,sock));
    assert.equal(handled,true); assert.match(sock.sent.at(-1).payload.text,/ambiguë/i);
    assert.deepEqual(cmd.engine.get(chat,c.alias,'guess-character').attempts,{});
    assert.deepEqual(cmd.engine.get(chat,s.alias,'guess-song').attempts,{});
  });
});

test('WhatsApp: #ID route exactement vers le jeu Devine ciblé',async()=>{
  const cmd=freshCommand(), sock=sockMock(), chat='guess-route@g.us', user='u@s.whatsapp.net';
  await sessionContext.run('wa-guess-route',async()=>{
    const c=cmd.engine.startClueGame(chat,'host',{kind:'character',category:'anime',rounds:1});
    const s=cmd.engine.startClueGame(chat,'host',{kind:'song',category:'anime',rounds:1});
    const q=clueQuestion(c);
    const handled=await cmd.handleIncomingGameMessage(sock,msg(chat,user,`${q.answers[0]} #${c.alias}`),extra(chat,user,sock));
    assert.equal(handled,true); assert.equal(cmd.engine.get(chat,c.alias,'guess-character'),null);
    assert.deepEqual(cmd.engine.get(chat,s.alias,'guess-song').attempts,{});
  });
});

test('WhatsApp: Rébus + Devine libre devient ambigu sans #ID',async()=>{
  const cmd=freshCommand(), sock=sockMock(), chat='guess-cross@g.us', user='u@s.whatsapp.net';
  await sessionContext.run('wa-guess-cross',async()=>{
    const r=cmd.engine.startRebus(chat,'host',{rounds:1});
    const c=cmd.engine.startClueGame(chat,'host',{kind:'character',category:'anime',rounds:1});
    const handled=await cmd.handleIncomingGameMessage(sock,msg(chat,user,'Batman'),extra(chat,user,sock));
    assert.equal(handled,true); assert.match(sock.sent.at(-1).payload.text,/ambiguë/i);
    assert.deepEqual(cmd.engine.get(chat,r.alias,'rebus').attempts,{});
    assert.deepEqual(cmd.engine.get(chat,c.alias,'guess-character').attempts,{});
  });
});

test('stress Block4: 1 250 essais isolés entre groupes et sessions',()=>{
  const e=new GameCenterEngine({root:temp()}); let operations=0;
  for(let s=0;s<5;s++)run(`guess-stress-${s}`,()=>{
    for(let g=0;g<5;g++){
      const chat=`guess-${g}@g.us`, game=e.startClueGame(chat,'host',{kind:'character',category:'anime',rounds:1});
      for(let u=0;u<50;u++){
        const r=e.answerClueGame(chat,`u${u}@s.whatsapp.net`,`faux-${u}`,game.alias);
        assert.equal(r.handled,true); operations++;
      }
    }
  });
  assert.equal(operations,1250);
  run('guess-stress-0',()=>assert.equal(e.list('guess-0@g.us',{type:'guess-character'}).length,1));
  run('guess-stress-4',()=>assert.equal(e.list('guess-4@g.us',{type:'guess-character'}).length,1));
});
