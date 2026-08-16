'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {CognitiveEngine,detectIntents,extractConstraints,extractEntities}=require('../ai_chat/cognition/cognitiveEngine');
const {GeneralOrchestrator}=require('../ai_chat/cognition/generalOrchestrator');
const {MemoryStore}=require('../ai_chat/memory/store');
const {planQueries,sourceQuality}=require('../ai_chat/research/researchEngine');
const {parseWorkflowIntent,validateWorkflow,executeWorkflow}=require('../ai_chat/dynamic/workflowEngine');

class FakePrimary{
  constructor(){this.calls=[];this.localBrain={fallback:()=>({provider:'local',text:'fallback'})};}
  providerStatus(){return{ok:true};}
  async complete(req){this.calls.push(req);const sys=String(req.messages?.[0]?.content||'');if(/planificateur interne/i.test(sys))return{provider:'fake',text:'objectif: répondre précisément; contraintes: respecter tous les livrables; étapes: 1 analyser 2 répondre'};if(/contrôleur qualité interne/i.test(sys))return{provider:'fake',text:'{"ok":false,"issues":["oubli du deuxième livrable"],"repair":"ajoute le deuxième livrable"}'};if(req.messages?.some(m=>/Corrige la réponse précédente/.test(String(m.content))))return{provider:'fake',text:'Réponse réparée avec les deux livrables.'};return{provider:'fake',text:'Réponse candidate incomplète.'};}
}

test('cognition détecte plusieurs intentions, contraintes et entités',()=>{
  const text='Exaucée, demain à 20h recherche Naruto puis organise un quiz de 30 questions pour 100 participants et donne-moi un classement.';
  const intents=detectIntents(text);assert.ok(intents.includes('research'));assert.ok(intents.includes('action'));assert.ok(intents.includes('game'));
  const constraints=extractConstraints(text);assert.ok(constraints.some(x=>/30 questions/i.test(x)));assert.ok(constraints.some(x=>/100 participants/i.test(x)));
  const entities=extractEntities(text);assert.ok(entities.some(x=>/20h/i.test(x)));
  const a=new CognitiveEngine().analyze(text,{},{});assert.ok(a.complexity>=5);assert.equal(a.temporal.hasTime,true);
});

test('orchestrateur planifie, critique puis répare une demande complexe',async()=>{
  const primary=new FakePrimary();const o=new GeneralOrchestrator(primary,{localBrain:primary.localBrain});
  const r=await o.complete({mode:'deep',messages:[{role:'system',content:'Tu es Exaucée.'},{role:'user',content:'Analyse ce problème complexe et donne deux livrables détaillés.'}]});
  assert.match(r.text,/Réponse réparée/);assert.equal(r.orchestration.planned,true);assert.equal(r.orchestration.repaired,true);assert.ok(primary.calls.length>=3);
});

test('mémoire classe les souvenirs par pertinence et conserve objectifs',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exa-memory-'));try{const m=new MemoryStore({root:dir}),ids={sessionId:'s',chatId:'g',userId:'u'};m.remember(ids,{type:'fact',value:'La couleur préférée est bleue'});m.remember(ids,{type:'fact',value:'Le tournoi Naruto débute demain à 20h'});m.remember(ids,{type:'goal',value:'Organiser un tournoi Naruto de 30 questions'});const c=m.getRelevantContext(ids,'Naruto tournoi');assert.match(c.facts[c.facts.length-1].value,/Naruto/);assert.equal(c.goals.length,1);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('recherche construit plusieurs requêtes et privilégie sources institutionnelles',()=>{
  const qs=planQueries('Quel est le prix actuel du service et pourquoi a-t-il changé ?');assert.ok(qs.length>=2);assert.ok(qs.some(x=>/officiel|documentation/i.test(x)));assert.ok(sourceQuality('https://www.who.int/test')>sourceQuality('https://example.com/test'));
});

test('workflow dynamique avancé est validé et exécuté sans code arbitraire',async()=>{
  const parsed=parseWorkflowIntent('Crée une commande bienvenue qui envoie Salut {user} puis attend 1 seconde puis envoie Bienvenue {arg1}');
  assert.ok(parsed);assert.equal(validateWorkflow(parsed.workflow).ok,true);const sent=[];const r=await executeWorkflow(parsed.workflow,{userName:'Nexus',args:['ici'],send:async x=>sent.push(x)});assert.equal(r.handled,true);assert.equal(sent.length,2);assert.match(sent[0],/Nexus/);assert.match(sent[1],/ici/);
  assert.equal(validateWorkflow({type:'sequence',steps:Array.from({length:30},()=>({type:'reply',text:'x'}))}).ok,false);
});
