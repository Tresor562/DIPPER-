'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const {TournamentStore,MIN_TOURNEY_ROUNDS,MAX_TOURNEY_ROUNDS,parseChoice}=require('../utils/gameCenterTournament');

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-tourney-'));}
function run(sid,fn){return sessionContext.run(sid,fn);}
function setup(){return new TournamentStore({root:temp()});}

test('Tournoi: choix 1-4 et A-D uniquement',()=>{assert.equal(parseChoice('1'),0);assert.equal(parseChoice('B'),1);assert.equal(parseChoice('4'),3);assert.equal(parseChoice('5'),null);});

test('Tournoi: création borne catégorie et nombre de manches',()=>{
  const t=setup();const bad=t.create({chatId:'g1@g.us',groupName:'G1',organizer:'u',category:'x'});assert.equal(bad.error,'category');
  const a=t.create({chatId:'g1@g.us',groupName:' G1 \n test ',organizer:'u',category:'general',rounds:99,randomInt:(a)=>a});assert.ok(a.code);assert.ok(a.rounds<=MAX_TOURNEY_ROUNDS);assert.ok(a.rounds>=MIN_TOURNEY_ROUNDS);assert.equal(a.groups[0].name,'G1 test');
});

test('Tournoi: deux groupes minimum et seul organisateur démarre',()=>{
  const t=setup(),x=t.create({chatId:'g1@g.us',groupName:'G1',organizer:'u1',rounds:3,randomInt:(a)=>a});assert.equal(t.start(x.code,{chatId:'g1@g.us',userId:'u1'}).error,'groups');
  assert.equal(t.join(x.code,{chatId:'g2@g.us',groupName:'G2'}).ok,true);assert.equal(t.start(x.code,{chatId:'g2@g.us',userId:'u2'}).error,'owner');assert.equal(t.start(x.code,{chatId:'g1@g.us',userId:'u1'}).ok,true);assert.equal(t.join(x.code,{chatId:'g3@g.us',groupName:'G3'}).error,'started');
});

test('Tournoi: mêmes questions dans tous les groupes et réponse verrouillée',()=>{
  const t=setup(),x=t.create({chatId:'g1@g.us',groupName:'G1',organizer:'u1',category:'anime',rounds:3,randomInt:(a)=>a});t.join(x.code,{chatId:'g2@g.us',groupName:'G2'});t.start(x.code,{chatId:'g1@g.us',userId:'u1'});
  const q1=t.next(x.code,'g1@g.us'),q2=t.next(x.code,'g2@g.us');assert.equal(q1.question,q2.question);assert.deepEqual(q1.options,q2.options);assert.equal(t.next(x.code,'g1@g.us').question,q1.question);
  const r=t.answer(x.code,'g1@g.us','1');assert.equal(r.ok,true);assert.equal(t.answer(x.code,'g1@g.us','2').error,'next');
});

test('Tournoi: score calculé par le moteur et classement sans JID membre',()=>{
  const t=setup(),x=t.create({chatId:'g1@g.us',groupName:'Alpha',organizer:'u1',category:'general',rounds:3,randomInt:(a)=>a});t.join(x.code,{chatId:'g2@g.us',groupName:'Beta'});t.start(x.code,{chatId:'g1@g.us',userId:'u1'});
  for(const group of ['g1@g.us','g2@g.us']){
    for(let i=0;i<3;i++){const q=t.next(x.code,group),raw=t.get(x.code),g=raw.groups[group],bank=require('../utils/gameCenterBlock2').QUIZ_BANKS[raw.category],answer=bank[g.current.questionIndex].answer+1;t.answer(x.code,group,group==='g1@g.us'?String(answer):String(answer===1?2:1));}
  }
  const top=t.top(x.code);assert.equal(top.status,'finished');assert.equal(top.rows[0].name,'Alpha');assert.equal(top.rows[0].score,30);assert.equal(top.rows[1].score,0);const raw=JSON.stringify(top);assert.doesNotMatch(raw,/u1|@s\.whatsapp\.net/);
});

test('Tournoi: store global accessible entre deux sessions du même bot',()=>{
  const t=setup();let code;
  run('session-A',()=>{code=t.create({chatId:'ga@g.us',groupName:'Groupe A',organizer:'a',rounds:3,randomInt:(a)=>a}).code;});
  run('session-B',()=>{assert.equal(t.join(code,{chatId:'gb@g.us',groupName:'Groupe B'}).ok,true);});
  run('session-A',()=>assert.equal(t.start(code,{chatId:'ga@g.us',userId:'a'}).ok,true));
  run('session-B',()=>assert.equal(t.next(code,'gb@g.us').ok,true));
  run('session-A',()=>assert.equal(t.next(code,'ga@g.us').ok,true));
});

test('Tournoi: groupe non inscrit ne peut ni lire question ni répondre',()=>{
  const t=setup(),x=t.create({chatId:'g1@g.us',groupName:'G1',organizer:'u1',rounds:3,randomInt:(a)=>a});t.join(x.code,{chatId:'g2@g.us',groupName:'G2'});t.start(x.code,{chatId:'g1@g.us',userId:'u1'});assert.equal(t.next(x.code,'intrus@g.us').error,'group');assert.equal(t.answer(x.code,'intrus@g.us','1').error,'group');
});

test('Tournoi: persistance disque conserve progression',()=>{
  const root=temp(),t=new TournamentStore({root}),x=t.create({chatId:'g1@g.us',groupName:'G1',organizer:'u1',rounds:3,randomInt:(a)=>a});t.join(x.code,{chatId:'g2@g.us',groupName:'G2'});t.start(x.code,{chatId:'g1@g.us',userId:'u1'});t.next(x.code,'g1@g.us');t.answer(x.code,'g1@g.us','1');const reload=new TournamentStore({root});assert.equal(reload.get(x.code).groups['g1@g.us'].index,1);
});

test('Stress tournoi: 200 tournois cross-session, 400 groupes',()=>{
  const t=setup();let ops=0;for(let i=0;i<200;i++){const g1=`a${i}@g.us`,g2=`b${i}@g.us`;let code;run(`ta${i}`,()=>{code=t.create({chatId:g1,groupName:`A${i}`,organizer:'u',rounds:3,randomInt:(a)=>a}).code;});run(`tb${i}`,()=>t.join(code,{chatId:g2,groupName:`B${i}`}));run(`ta${i}`,()=>{assert.equal(t.start(code,{chatId:g1,userId:'u'}).ok,true);assert.equal(t.next(code,g1).ok,true);});run(`tb${i}`,()=>assert.equal(t.next(code,g2).ok,true));ops++;}assert.equal(ops,200);
});
