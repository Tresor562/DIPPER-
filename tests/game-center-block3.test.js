'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const {GameCenterEngine}=require('../utils/gameCenterEngine');
const {
  likelyQuestion,intruderQuestion,rebusQuestion,dailyChallenge,
  MAX_TRUTH_HISTORY,MAX_STORY_LINES,MAX_STORY_LINE_LENGTH,MAX_REBUS_ATTEMPTS
}=require('../utils/gameCenterBlock3');
require('../utils/gameCenterBlock2');

function temp(){ return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-game-center-v3-')); }
function run(sid,fn){ return sessionContext.run(sid,fn); }
function freshCommand(){
  const paths=[
    '../commands/games_entertainment/gamecenter','../utils/gameCenterWhatsappBlock3','../utils/gameCenterWhatsappBlock2',
    '../utils/gameCenterBlock3','../utils/gameCenterBlock2','../utils/gameCenterEngine'
  ].map(require.resolve);
  for(const p of paths)delete require.cache[p];
  const mod=require('../utils/gameCenterEngine');
  mod.engine.root=temp(); mod.engine.games.clear(); mod.engine._loadedSessions.clear();
  require('../utils/gameCenterBlock2'); require('../utils/gameCenterBlock3');
  return require('../commands/games_entertainment/gamecenter');
}
function sockMock(){ const sent=[]; return {sent,user:{id:'999999@s.whatsapp.net'},async sendMessage(jid,payload){ sent.push({jid,payload}); return {key:{id:`m${sent.length}`}}; }}; }
function msg(chat,user,text,mentions=[]){
  const contextInfo=mentions.length?{mentionedJid:mentions}:undefined;
  return {key:{remoteJid:chat,participant:chat.endsWith('@g.us')?user:undefined,fromMe:false,id:`${chat}-${user}-${Date.now()}`},message:contextInfo?{extendedTextMessage:{text,contextInfo}}:{conversation:text},pushName:user.split('@')[0]};
}
function extra(chat,user,sock,flags={}){ return {from:chat,sender:user,isGroup:true,isAdmin:false,isOwner:false,isSupremeOwner:false,...flags,phrases:{footer:()=>'> test'},reply:async text=>sock.sendMessage(chat,{text})}; }

test('Action/Vérité: historique borné et gages sûrs',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('truth-safe',()=>{
    const g=e.startTruthDare('g@g.us','host',{mode:'mix'}); assert.ok(!g.error);
    for(let i=0;i<MAX_TRUTH_HISTORY+25;i++){
      const r=e.nextTruthDare('g@g.us',`u${i%7}`,'auto',g.alias);
      assert.equal(r.handled,true);
      assert.doesNotMatch(r.prompt,/galerie|historique d'appel|mot de passe|capture d'écran privée/i);
    }
    const live=e.get('g@g.us',g.alias,'truth-dare');
    assert.equal(live.history.length,MAX_TRUTH_HISTORY);
    assert.equal(live.round,MAX_TRUTH_HISTORY+25);
  });
});

test('Qui est le plus susceptible: vote remplaçable, manches et classement',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('likely',()=>{
    const g=e.startLikely('g@g.us','host',{rounds:2}); assert.ok(likelyQuestion(g));
    e.voteLikely('g@g.us','u1','a',g.alias);
    e.voteLikely('g@g.us','u1','b',g.alias);
    const vote=e.voteLikely('g@g.us','u2','b',g.alias);
    assert.equal(vote.counts.b,2); assert.equal(vote.counts.a,undefined);
    let r=e.closeLikelyRound('g@g.us',g.alias);
    assert.equal(r.finished,false); assert.deepEqual(r.leaders,['b']); assert.equal(r.game.round,2);
    e.voteLikely('g@g.us','u1','a',g.alias);
    r=e.closeLikelyRound('g@g.us',g.alias);
    assert.equal(r.finished,true); assert.equal(r.ranking[0].userId,'b'); assert.equal(r.ranking[0].score,2);
  });
});

test('Histoire collaborative: lignes nettoyées, doublons bloqués et taille bornée',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('story',()=>{
    const g=e.startStory('g@g.us','host',{title:'Notre aventure'});
    let r=e.addStoryLine('g@g.us','u0','+ '+('x'.repeat(MAX_STORY_LINE_LENGTH+100)),g.alias);
    assert.equal(r.ok,true); assert.equal(r.line.length,MAX_STORY_LINE_LENGTH);
    assert.equal(e.addStoryLine('g@g.us','u0','+ '+('x'.repeat(MAX_STORY_LINE_LENGTH+100)),g.alias).reason,'duplicate');
    for(let i=1;i<MAX_STORY_LINES;i++)r=e.addStoryLine('g@g.us',`u${i%5}`,`+ ligne ${i}`,g.alias);
    assert.equal(r.finished,true); assert.equal(r.game.lines.length,MAX_STORY_LINES);
    assert.equal(e.get('g@g.us',g.alias,'story'),null);
  });
});

test('Trouve l’intrus: un essai par joueur et fin correcte',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('intruder',()=>{
    const g=e.startIntruder('g@g.us','host',{rounds:1}); const q=intruderQuestion(g);
    const wrong=String(((q.answer+1)%4)+1);
    let r=e.answerIntruder('g@g.us','u1',wrong,g.alias); assert.equal(r.correct,false);
    r=e.answerIntruder('g@g.us','u1',String(q.answer+1),g.alias); assert.equal(r.reason,'already');
    r=e.answerIntruder('g@g.us','u2',String(q.answer+1),g.alias); assert.equal(r.finished,true); assert.equal(r.answerText,q.options[q.answer]);
  });
});

test('Rébus: doublons et spam bornés par joueur',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('rebus-limit',()=>{
    const g=e.startRebus('g@g.us','host',{rounds:1}); const q=rebusQuestion(g);
    let r=e.answerRebus('g@g.us','spam','mauvaise 0',g.alias); assert.equal(r.correct,false);
    assert.equal(e.answerRebus('g@g.us','spam','mauvaise 0',g.alias).reason,'duplicate');
    for(let i=1;i<MAX_REBUS_ATTEMPTS;i++)e.answerRebus('g@g.us','spam',`mauvaise ${i}`,g.alias);
    r=e.answerRebus('g@g.us','spam','encore une',g.alias); assert.equal(r.reason,'limit');
    r=e.answerRebus('g@g.us','winner',q.answers[0],g.alias); assert.equal(r.finished,true); assert.equal(r.game.winner,'winner');
  });
});

test('Défi du jour: déterministe pour une session, un groupe et une date',()=>{
  run('daily',()=>{
    const a=dailyChallenge('g@g.us','2026-08-21');
    const b=dailyChallenge('g@g.us','2026-08-21');
    assert.deepEqual(a,b); assert.ok(a.challenge.length>20); assert.equal(a.day,'2026-08-21');
  });
});

test('WhatsApp: vote susceptible exige le mot vote et une mention',async()=>{
  const cmd=freshCommand(), sock=sockMock(), chat='likely@g.us', host='host@s.whatsapp.net', voter='voter@s.whatsapp.net', target='target@s.whatsapp.net';
  await sessionContext.run('wa-likely',async()=>{
    const g=cmd.engine.startLikely(chat,host,{rounds:1});
    let handled=await cmd.handleIncomingGameMessage(sock,msg(chat,voter,'vote quelqu’un'),extra(chat,voter,sock));
    assert.equal(handled,true); assert.match(sock.sent.at(-1).payload.text,/Mentionne une personne/i);
    handled=await cmd.handleIncomingGameMessage(sock,msg(chat,voter,`vote @target #${g.alias}`,[target]),extra(chat,voter,sock));
    assert.equal(handled,true); assert.equal(cmd.engine.get(chat,g.alias,'most-likely').votes[voter],target);
  });
});

test('WhatsApp: histoire ne capture que les messages commençant par +',async()=>{
  const cmd=freshCommand(), sock=sockMock(), chat='story@g.us', user='u@s.whatsapp.net';
  await sessionContext.run('wa-story',async()=>{
    const g=cmd.engine.startStory(chat,user,{title:'Test'});
    let handled=await cmd.handleIncomingGameMessage(sock,msg(chat,user,'message normal'),extra(chat,user,sock));
    assert.equal(handled,false); assert.equal(cmd.engine.get(chat,g.alias,'story').lines.length,0);
    handled=await cmd.handleIncomingGameMessage(sock,msg(chat,user,`+ première ligne #${g.alias}`),extra(chat,user,sock));
    assert.equal(handled,true); assert.equal(cmd.engine.get(chat,g.alias,'story').lines.length,1);
  });
});

test('WhatsApp: Quiz + Intrus sur 1..4 est ambigu sans #ID et ne modifie rien',async()=>{
  const cmd=freshCommand(), sock=sockMock(), chat='cross@g.us', user='u@s.whatsapp.net';
  await sessionContext.run('wa-cross',async()=>{
    const q=cmd.engine.startQuiz(chat,'host',{category:'general',rounds:1});
    const i=cmd.engine.startIntruder(chat,'host',{rounds:1});
    const handled=await cmd.handleIncomingGameMessage(sock,msg(chat,user,'1'),extra(chat,user,sock));
    assert.equal(handled,true); assert.match(sock.sent.at(-1).payload.text,/ambiguë/i);
    assert.deepEqual(cmd.engine.get(chat,q.alias,'quiz').roundAttempts,{});
    assert.deepEqual(cmd.engine.get(chat,i.alias,'intruder').roundAttempts,{});
  });
});
