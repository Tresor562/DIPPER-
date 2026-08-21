'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const {GameCenterEngine}=require('../utils/gameCenterEngine');
const {quizQuestion,brainQuestion}=require('../utils/gameCenterBlock2');

function temp(){ return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-game-center-v2-')); }
function run(sid,fn){ return sessionContext.run(sid,fn); }
function wrongQuizChoice(q){ return String(((q.answer+1)%4)+1); }

function freshCommand(){
  const enginePath=require.resolve('../utils/gameCenterEngine');
  const blockPath=require.resolve('../utils/gameCenterBlock2');
  const advancedPath=require.resolve('../commands/games_entertainment/gamecenterBlock2');
  const cmdPath=require.resolve('../commands/games_entertainment/gamecenter');
  delete require.cache[cmdPath]; delete require.cache[advancedPath]; delete require.cache[blockPath]; delete require.cache[enginePath];
  const mod=require('../utils/gameCenterEngine');
  mod.engine.root=temp(); mod.engine.games.clear(); mod.engine._loadedSessions.clear();
  require('../utils/gameCenterBlock2');
  return require('../commands/games_entertainment/gamecenter');
}
function sockMock(){ const sent=[]; return {sent,user:{id:'999999@s.whatsapp.net'},async sendMessage(jid,payload){ sent.push({jid,payload}); return {key:{id:`m${sent.length}`}}; }}; }
function msg(chat,user,text,mentions=[]){
  const contextInfo=mentions.length?{mentionedJid:mentions}:undefined;
  return {key:{remoteJid:chat,participant:chat.endsWith('@g.us')?user:undefined,fromMe:false,id:`${chat}-${user}-${Math.random()}`},message:contextInfo?{extendedTextMessage:{text,contextInfo}}:{conversation:text},pushName:user.split('@')[0]};
}
function extra(chat,user,sock,flags={}){ return {from:chat,sender:user,isGroup:chat.endsWith('@g.us'),isAdmin:false,isOwner:false,isSupremeOwner:false,...flags,phrases:{footer:()=>'> test'},reply:async text=>sock.sendMessage(chat,{text})}; }

test('quiz: catégorie, un essai par joueur, score, progression et fin',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('quiz-flow',()=>{
    let g=e.startQuiz('g@g.us','host',{category:'anime',rounds:2});
    assert.equal(g.category,'anime'); assert.equal(g.rounds,2);
    let q=quizQuestion(g);
    let r=e.answerQuiz('g@g.us','u1',wrongQuizChoice(q),g.alias);
    assert.equal(r.correct,false);
    r=e.answerQuiz('g@g.us','u1',String(q.answer+1),g.alias);
    assert.equal(r.reason,'already');
    r=e.answerQuiz('g@g.us','u2',String(q.answer+1),g.alias);
    assert.equal(r.correct,true); assert.equal(r.finished,false); assert.equal(r.game.round,2);
    q=quizQuestion(r.game);
    r=e.answerQuiz('g@g.us','u1',String(q.answer+1),g.alias);
    assert.equal(r.finished,true); assert.equal(r.ranking[0].score,1);
    assert.equal(e.get('g@g.us',g.alias,'quiz'),null);
  });
});

test('quiz: catégories invalides et doublons sont bloqués',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('quiz-guards',()=>{
    assert.equal(e.startQuiz('g@g.us','h',{category:'inconnue'}).error,'category');
    assert.ok(!e.startQuiz('g@g.us','h',{category:'football',rounds:3}).error);
    assert.equal(e.startQuiz('g@g.us','h',{category:'general'}).error,'duplicate');
  });
});

test('énigmes: doublons ignorés, indice après trois erreurs, bonne réponse termine',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('riddle',()=>{
    const g=e.startBrain('g@g.us','h',{kind:'riddle',rounds:1});
    const q=brainQuestion(g);
    let r=e.answerBrain('g@g.us','u','réponse impossible 1',g.alias); assert.equal(r.correct,false); assert.equal(r.hint,null);
    r=e.answerBrain('g@g.us','u','réponse impossible 1',g.alias); assert.equal(r.reason,'duplicate');
    e.answerBrain('g@g.us','u','réponse impossible 2',g.alias);
    r=e.answerBrain('g@g.us','u','réponse impossible 3',g.alias); assert.ok(r.hint);
    r=e.answerBrain('g@g.us','u',q.answers[0],g.alias); assert.equal(r.finished,true); assert.equal(r.game.winner,'u');
  });
});

test('maths: questions générées avec réponse entière vérifiable',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('math',()=>{
    const g=e.startBrain('g@g.us','h',{kind:'math',difficulty:'hard',rounds:2});
    let q=brainQuestion(g); assert.match(q.answers[0],/^-?\d+$/);
    let r=e.answerBrain('g@g.us','u',q.answers[0],g.alias); assert.equal(r.correct,true); assert.equal(r.finished,false);
    q=brainQuestion(r.game); r=e.answerBrain('g@g.us','u',q.answers[0],g.alias); assert.equal(r.finished,true); assert.equal(r.ranking[0].score,2);
  });
});

test('PFC: choix verrouillés et secrets jusqu’au deuxième joueur',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('rps',()=>{
    const g=e.startRps('g@g.us','a@s.whatsapp.net','b@s.whatsapp.net');
    let r=e.pickRps('a@s.whatsapp.net',g.alias,'pierre');
    assert.equal(r.waiting,true); assert.equal(r.finished,undefined);
    r=e.pickRps('a@s.whatsapp.net',g.alias,'feuille'); assert.equal(r.reason,'already');
    r=e.pickRps('b@s.whatsapp.net',g.alias,'ciseaux');
    assert.equal(r.finished,true); assert.equal(r.winner,'a@s.whatsapp.net');
    assert.equal(r.choices['a@s.whatsapp.net'],'pierre'); assert.equal(r.choices['b@s.whatsapp.net'],'ciseaux');
    assert.equal(e.findActiveByAlias(g.alias,'rps').length,0);
  });
});

test('PFC: un tiers ne peut pas injecter un choix',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('rps-intruder',()=>{
    const g=e.startRps('g@g.us','a','b');
    const r=e.pickRps('intrus',g.alias,'pierre'); assert.equal(r.error,'not-found');
    assert.deepEqual(e.get('g@g.us',g.alias,'rps').picks,{});
  });
});

test('persistance block2: Quiz survit au rechargement du moteur',()=>{
  const root=temp();
  run('persist-v2',()=>{
    const e1=new GameCenterEngine({root}); const g=e1.startQuiz('g@g.us','h',{category:'general',rounds:2}); const q=quizQuestion(g);
    e1.answerQuiz('g@g.us','u',wrongQuizChoice(q),g.alias);
    const e2=new GameCenterEngine({root}); const loaded=e2.get('g@g.us',g.alias,'quiz');
    assert.equal(loaded.round,1); assert.ok(Object.prototype.hasOwnProperty.call(loaded.roundAttempts,'u'));
  });
});

test('WhatsApp: réponse chiffrée ambiguë ne modifie aucune partie sans #ID',async()=>{
  const cmd=freshCommand(), sock=sockMock(), chat='amb@g.us', host='host@s.whatsapp.net';
  await sessionContext.run('wa-amb',async()=>{
    const q=cmd.engine.startQuiz(chat,host,{category:'general',rounds:1});
    const n=cmd.engine.startGuessNumber(chat,host,{min:1,max:9});
    const beforeQ=cmd.engine.get(chat,q.alias,'quiz'), beforeN=cmd.engine.get(chat,n.alias,'guess-number');
    const handled=await cmd.handleIncomingGameMessage(sock,msg(chat,'u@s.whatsapp.net','1'),extra(chat,'u@s.whatsapp.net',sock));
    assert.equal(handled,true); assert.match(sock.sent.at(-1).payload.text,/ambiguë/i);
    assert.deepEqual(cmd.engine.get(chat,q.alias,'quiz').roundAttempts,beforeQ.roundAttempts);
    assert.equal(cmd.engine.get(chat,n.alias,'guess-number').attempts,beforeN.attempts);
  });
});

test('WhatsApp: #ID route la réponse exactement vers le Quiz ciblé',async()=>{
  const cmd=freshCommand(), sock=sockMock(), chat='route@g.us', host='host@s.whatsapp.net';
  await sessionContext.run('wa-route',async()=>{
    const qg=cmd.engine.startQuiz(chat,host,{category:'anime',rounds:1});
    const ng=cmd.engine.startGuessNumber(chat,host,{min:1,max:9});
    const q=quizQuestion(qg), text=`${q.answer+1} #${qg.alias}`;
    const handled=await cmd.handleIncomingGameMessage(sock,msg(chat,'u@s.whatsapp.net',text),extra(chat,'u@s.whatsapp.net',sock));
    assert.equal(handled,true); assert.equal(cmd.engine.get(chat,qg.alias,'quiz'),null);
    assert.equal(cmd.engine.get(chat,ng.alias,'guess-number').attempts,0);
  });
});

test('WhatsApp: PFC privé ne publie le résultat qu’après les deux choix',async()=>{
  const cmd=freshCommand(), sock=sockMock(), chat='rps@g.us', a='a@s.whatsapp.net', b='b@s.whatsapp.net';
  await sessionContext.run('wa-rps',async()=>{
    const g=cmd.engine.startRps(chat,a,b);
    const rpsPath=require.resolve('../commands/games_entertainment/rpspick'); delete require.cache[rpsPath];
    const rps=require('../commands/games_entertainment/rpspick');
    await rps.execute(sock,msg(a,a,`.rpspick #${g.alias} pierre`),[`#${g.alias}`,'pierre'],extra(a,a,sock));
    assert.equal(sock.sent.filter(x=>x.jid===chat).length,0);
    await rps.execute(sock,msg(b,b,`.rpspick #${g.alias} ciseaux`),[`#${g.alias}`,'ciseaux'],extra(b,b,sock));
    const groupMessages=sock.sent.filter(x=>x.jid===chat); assert.equal(groupMessages.length,1); assert.match(groupMessages[0].payload.text,/RÉSULTAT/i);
  });
});

test('stress block2: 5 000 tentatives réparties entre 50 groupes et 10 sessions',()=>{
  const e=new GameCenterEngine({root:temp()}); let operations=0;
  for(let s=0;s<10;s++)run(`stress-v2-${s}`,()=>{
    for(let g=0;g<5;g++){
      const chat=`quiz-${g}@g.us`, game=e.startQuiz(chat,'host',{category:g%2?'anime':'football',rounds:1}), q=quizQuestion(game), wrong=wrongQuizChoice(q);
      for(let u=0;u<100;u++){ const r=e.answerQuiz(chat,`u${u}@s.whatsapp.net`,wrong,game.alias); assert.equal(r.handled,true); operations++; }
    }
  });
  assert.equal(operations,5000);
  run('stress-v2-0',()=>assert.equal(e.list('quiz-0@g.us',{type:'quiz'}).length,1));
  run('stress-v2-9',()=>assert.equal(e.list('quiz-4@g.us',{type:'quiz'}).length,1));
});
