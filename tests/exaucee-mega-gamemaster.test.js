'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {TournamentDirector,balancedTeams}=require('../ai_chat/games/tournamentDirector');
const {designFromText}=require('../ai_chat/games/gameDesigner');
const {validateQuestions}=require('../ai_chat/games/gameContentGenerator');

class FakeScheduler{
  constructor(){this.tasks=[];}
  schedule(t){this.tasks.push({...t,status:'pending'});return t;}
  list(){return this.tasks;}
  cancel(id){const x=this.tasks.find(t=>t.id===id);if(x)x.status='cancelled';return Boolean(x);}
}
function tempFile(){const d=fs.mkdtempSync(path.join(os.tmpdir(),'exa-gm3-'));return{dir:d,file:path.join(d,'events.json')};}

test('description naturelle produit un grand quiz programmé',()=>{
  const now=new Date('2026-08-16T12:00:00');
  const s=designFromText('Organise demain à 20h un quiz Naruto de 30 questions pour 1000 participants en 8 équipes',{now,by:'owner'});
  assert.equal(s.gameType,'quiz');assert.equal(s.theme,'Naruto');assert.equal(s.rounds.length,30);assert.equal(s.maxPlayers,1000);assert.equal(s.teamMode,true);assert.equal(s.teamCount,8);assert.equal(new Date(s.startAt).getHours(),20);
});

test('équipes restent équilibrées à grande échelle',()=>{
  const players=Array.from({length:1000},(_,i)=>`u${i}`);const teams=balancedTeams(players,8);const sizes=teams.map(t=>t.members.length);
  assert.equal(teams.length,8);assert.ok(Math.max(...sizes)-Math.min(...sizes)<=1);assert.equal(sizes.reduce((a,b)=>a+b,0),1000);
});

test('1000 joueurs peuvent être inscrits et conservés',()=>{
  const {dir,file}=tempFile();try{const td=new TournamentDirector({file,scheduler:new FakeScheduler()});const e=td.create('g@g.us',{title:'Mega',startAt:Date.now()+60000,maxPlayers:1000,minPlayers:2,gameType:'quiz',rounds:[{id:'r1',name:'M1',type:'quiz',answers:['a'],prompt:'Q?',timeLimitSec:30}]});for(let i=0;i<1000;i++)assert.equal(td.register('g@g.us',e.alias,`u${i}@s.whatsapp.net`).ok,true);assert.equal(Object.keys(td.get('g@g.us',e.alias).players).length,1000);assert.equal(td.register('g@g.us',e.alias,'overflow@s.whatsapp.net').reason,'full');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('quiz accepte une seule réponse par joueur et récompense la rapidité',()=>{
  const {dir,file}=tempFile();try{const td=new TournamentDirector({file,scheduler:new FakeScheduler()});const e=td.create('g@g.us',{title:'Quiz',startAt:Date.now()+60000,gameType:'quiz',rounds:[{id:'r1',name:'M1',type:'quiz',answers:['konoha'],prompt:'Village ?',points:1,timeLimitSec:30}]});td.register('g@g.us',e.alias,'a@s.whatsapp.net');td.register('g@g.us',e.alias,'b@s.whatsapp.net');td.start('g@g.us',e.alias);const first=td.submitQuizAnswer('g@g.us',e.alias,'a@s.whatsapp.net','Konoha');const duplicate=td.submitQuizAnswer('g@g.us',e.alias,'a@s.whatsapp.net','konoha');const second=td.submitQuizAnswer('g@g.us',e.alias,'b@s.whatsapp.net','konoha');assert.equal(first.correct,true);assert.equal(first.points,3);assert.equal(duplicate.duplicate,true);assert.equal(second.points,2);assert.equal(td.standings('g@g.us',e.alias)[0].userId,'a@s.whatsapp.net');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('jeu créatif accepte un verdict structuré une seule fois',()=>{
  const {dir,file}=tempFile();try{const td=new TournamentDirector({file,scheduler:new FakeScheduler()});const e=td.create('g@g.us',{title:'Créatif',startAt:Date.now()+1000,gameType:'custom',rounds:[{id:'r1',name:'Défi',mode:'ai_judge',prompt:'Écris une punchline',criteria:'originale',points:5,timeLimitSec:30}]});td.register('g@g.us',e.alias,'a@s.whatsapp.net');td.register('g@g.us',e.alias,'b@s.whatsapp.net');td.start('g@g.us',e.alias);const r=td.submitJudgedAnswer('g@g.us',e.alias,'a@s.whatsapp.net','Ma réponse',{accepted:true,points:4,feedback:'Solide'});const d=td.submitJudgedAnswer('g@g.us',e.alias,'a@s.whatsapp.net','Encore',{accepted:true,points:5});assert.equal(r.accepted,true);assert.equal(r.points,4);assert.equal(d.duplicate,true);assert.equal(td.standings('g@g.us',e.alias)[0].score,4);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('points individuels alimentent aussi le score des équipes',()=>{
  const {dir,file}=tempFile();try{const td=new TournamentDirector({file,scheduler:new FakeScheduler()});const e=td.create('g@g.us',{title:'Teams',startAt:Date.now()+1000,gameType:'custom',teamMode:true,teamCount:2,rounds:[{id:'r1',name:'M1',mode:'participation',prompt:'go',points:2}]});for(const u of ['a@s.whatsapp.net','b@s.whatsapp.net','c@s.whatsapp.net','d@s.whatsapp.net'])td.register('g@g.us',e.alias,u);td.start('g@g.us',e.alias);td.score('g@g.us',e.alias,'a@s.whatsapp.net',3);const teams=td.teamStandings('g@g.us',e.alias);assert.equal(teams[0].score,3);assert.equal(teams.reduce((n,x)=>n+x.score,0),3);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('fin de tournoi produit classement et récompenses',()=>{
  const {dir,file}=tempFile();try{const td=new TournamentDirector({file,scheduler:new FakeScheduler()});const e=td.create('g@g.us',{title:'Finale',gameType:'quiz',startAt:Date.now()+1000,rounds:[{id:'r1',name:'M1',answers:['x']}]});td.register('g@g.us',e.alias,'a@s.whatsapp.net');td.register('g@g.us',e.alias,'b@s.whatsapp.net');td.start('g@g.us',e.alias);td.score('g@g.us',e.alias,'a@s.whatsapp.net',8);td.score('g@g.us',e.alias,'b@s.whatsapp.net',5);const r=td.finish('g@g.us',e.alias);assert.equal(r.ranking[0].userId,'a@s.whatsapp.net');assert.equal(r.awards[0].rank,1);assert.equal(r.event.status,'finished');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('contenu IA invalide est filtré/dédupliqué',()=>{const rows=validateQuestions([{q:'Q1',a:['A']},{q:'Q1',a:['A']},{question:'Q2',answer:'B'},{q:'',a:[]}],10);assert.equal(rows.length,2);assert.deepEqual(rows[1].a,['b']);});
