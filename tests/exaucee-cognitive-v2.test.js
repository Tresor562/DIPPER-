'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const { MemoryStore, relevance }=require('../ai_chat/memory/store');
const { analyzeRequest, directive }=require('../ai_chat/cognition/cognitivePolicy');
const { createGuaranteedBrain }=require('../ai_chat/core');

test('mémoire: un ancien souvenir pertinent remonte avant un récent hors sujet',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'exa-mem-'));
  try{
    const m=new MemoryStore({root}); const ids={sessionId:'s',chatId:'c',userId:'u'};
    m.remember(ids,{type:'fact',value:'Mon projet préféré est KnowMe et je veux améliorer son système social.'});
    m.remember(ids,{type:'fact',value:'J’ai mangé du riz ce matin.'});
    const ctx=m.getRelevantContext(ids,'Parle-moi de mon projet KnowMe');
    assert.match(ctx.facts.map(x=>x.value).join('\n'),/KnowMe/);
    assert.ok(relevance('KnowMe plateforme sociale','question sur KnowMe')>relevance('météo demain','question sur KnowMe'));
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('politique: détecte recherche fraîche, action et complexité',()=>{
  const current=analyzeRequest('Quel est le prix actuel du Bitcoin ?');
  assert.equal(current.asksCurrent,true); assert.equal(current.asksResearch,true);
  const action=analyzeRequest('Organise un tournoi demain et ferme le groupe pendant les manches');
  assert.equal(action.asksAction,true); assert.equal(action.mode,'agent');
  const deep=analyzeRequest('Analyse en profondeur cette architecture et compare plusieurs stratégies');
  assert.equal(deep.complex,true); assert.match(directive(deep),/complexe/i);
});

test('brain wrapper: injecte la politique cognitive et élève le mode complexe',async()=>{
  let seen;
  const primary={localBrain:{fallback:()=>({text:'fallback'})},async complete(req){seen=req;return {text:'réponse valide',provider:'mock'};}};
  const brain=createGuaranteedBrain(primary);
  const out=await brain.complete({messages:[{role:'system',content:'base'},{role:'user',content:'Analyse en profondeur ce problème'}],mode:'normal'});
  assert.equal(out.text,'réponse valide');
  assert.equal(seen.mode,'deep');
  assert.match(seen.messages[0].content,/POLITIQUE COGNITIVE DU TOUR/);
});
