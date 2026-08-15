'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {BotKnowledge}=require('../ai_chat/knowledge/botKnowledge');

function kb(){
  const a={name:'menu',aliases:['help'],description:'Affiche le menu',category:'general'};
  const b={name:'kickall',description:'Retire les membres',category:'owner_control',ownerOnly:true,groupOnly:true};
  const c={name:'anime',aliases:['animesearch'],description:'Recherche un anime',category:'anime'};
  return new BotKnowledge({getCommands:()=>new Map([['menu',a],['help',a],['kickall',b],['anime',c]])});
}

test('déduplique les aliases pointant vers le même objet',()=>{
  const snap=kb().refresh(true);
  assert.equal(snap.stats.total,3);
});

test('retrouve une commande par alias et description',()=>{
  const k=kb();
  assert.equal(k.describe('help').name,'menu');
  assert.equal(k.search('recherche anime')[0].name,'anime');
});

test('expose restrictions sans exécuter la commande',()=>{
  const x=kb().describe('kickall');
  assert.equal(x.ownerOnly,true);
  assert.equal(x.groupOnly,true);
});

test('répond factuellement au nombre de commandes',()=>{
  assert.match(kb().answer('combien de commandes a le bot'),/3 commandes statiques/);
});

test('ne fabrique pas une commande absente',()=>{
  const k=kb();
  assert.equal(k.describe('commandeimaginaire'),null);
  assert.equal(k.search('commandeimaginaire').length,0);
});
