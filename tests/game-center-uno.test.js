'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const profileMod=require('../utils/gameCenterProfiles');
const {UnoStore,createUnoDeck,canPlay,parseColor,cardText}=require('../utils/gameCenterUno');

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-uno-'));}
function run(sid,fn){return sessionContext.run(sid,fn);}
function setup(){const root=temp();profileMod.profiles.root=root;profileMod.profiles.sessions.clear();return{root,uno:new UnoStore({root})};}
const C=(color,value)=>({color,value,id:`${color}:${value}`});

test('UNO: deck standard contient exactement 108 cartes',()=>{
  const deck=createUnoDeck();assert.equal(deck.length,108);
  for(const color of ['R','Y','G','B']){assert.equal(deck.filter(c=>c.color===color&&c.value==='0').length,1);assert.equal(deck.filter(c=>c.color===color&&c.value==='draw2').length,2);}
  assert.equal(deck.filter(c=>c.value==='wild').length,4);assert.equal(deck.filter(c=>c.value==='draw4').length,4);
});

test('UNO: couleurs et compatibilité de cartes',()=>{
  assert.equal(parseColor('rouge'),'R');assert.equal(parseColor('blue'),'B');assert.equal(parseColor('x'),null);
  assert.equal(canPlay(C('R','5'),C('R','2'),'R'),true);assert.equal(canPlay(C('B','2'),C('R','2'),'R'),true);assert.equal(canPlay(C('W','wild'),C('R','2'),'R'),true);assert.equal(canPlay(C('B','7'),C('R','2'),'R'),false);
  assert.match(cardText(C('G','reverse')),/↔/);
});

test('UNO: lobby, join, leave et limites de phase',()=>{
  const {uno}=setup();run('uno-lobby',()=>{
    const g=uno.create('g@g.us','host');assert.ok(g.id);assert.equal(uno.create('g@g.us','x').error,'duplicate');
    assert.equal(uno.join('g@g.us','p2').ok,true);assert.equal(uno.join('g@g.us','p2').error,'joined');
    assert.equal(uno.leave('g@g.us','p2').ok,true);assert.equal(uno.join('g@g.us','p2').ok,true);
    assert.equal(uno.start('g@g.us','p2').error,'host');assert.equal(uno.start('g@g.us','host',{randomInt:(a)=>a}).ok,true);assert.equal(uno.join('g@g.us','p3').error,'started');
  });
});

test('UNO: démarrage distribue sept cartes sans exposer les mains dans status',()=>{
  const {root,uno}=setup();run('uno-private',()=>{
    uno.create('g@g.us','h');uno.join('g@g.us','p');const r=uno.start('g@g.us','h',{randomInt:(a)=>a});assert.equal(r.game.hands.h.length,7);assert.equal(r.game.hands.p.length,7);
    const s=uno.status('g@g.us');assert.equal('hands' in s,false);assert.equal(s.counts.h,7);assert.equal(s.counts.p,7);
    const raw=fs.readFileSync(path.join(root,'uno-private','uno-private.json'),'utf8');assert.match(raw,/"hands"/);assert.match(raw,/"h"/);
  });
});

test('UNO: carte illégale et mauvais tour ne changent pas la main',()=>{
  const {uno}=setup();run('uno-rules',()=>{
    uno.create('g@g.us','h');uno.join('g@g.us','p');uno.start('g@g.us','h',{randomInt:(a)=>a});const g=uno._live('g@g.us');
    g.turnIndex=0;g.activeColor='R';g.discard=[C('R','5')];g.hands.h=[C('B','7'),C('R','9')];g.hands.p=[C('G','1')];uno._save();
    assert.equal(uno.play('g@g.us','p',1).error,'turn');assert.equal(uno.play('g@g.us','h',1).error,'illegal');assert.equal(uno.hand('g@g.us','h').length,2);
    const r=uno.play('g@g.us','h',2);assert.equal(r.ok,true);assert.equal(r.card.value,'9');
  });
});

test('UNO: +2 pioche deux cartes au joueur suivant et saute son tour',()=>{
  const {uno}=setup();run('uno-draw2',()=>{
    uno.create('g@g.us','a');uno.join('g@g.us','b');uno.join('g@g.us','c');uno.start('g@g.us','a',{randomInt:(a)=>a});const g=uno._live('g@g.us');
    g.players=['a','b','c'];g.turnIndex=0;g.direction=1;g.activeColor='R';g.discard=[C('R','5')];g.hands.a=[C('R','draw2'),C('B','1')];g.hands.b=[C('G','2')];g.hands.c=[C('Y','3')];g.deck=[C('B','4'),C('G','5'),C('Y','6')];uno._save();
    const r=uno.play('g@g.us','a',1);assert.equal(r.penalty,2);assert.equal(uno.hand('g@g.us','b').length,3);assert.equal(r.next,'c');
  });
});

test('UNO: Joker exige une couleur et applique la couleur choisie',()=>{
  const {uno}=setup();run('uno-wild',()=>{
    uno.create('g@g.us','a');uno.join('g@g.us','b');uno.start('g@g.us','a',{randomInt:(a)=>a});const g=uno._live('g@g.us');g.turnIndex=0;g.discard=[C('R','5')];g.activeColor='R';g.hands.a=[C('W','wild'),C('R','1')];g.hands.b=[C('G','2')];uno._save();
    assert.equal(uno.play('g@g.us','a',1).error,'color');const r=uno.play('g@g.us','a',1,{color:'vert'});assert.equal(r.ok,true);assert.equal(uno.status('g@g.us').activeColor,'G');
  });
});

test('UNO: victoire supprime la partie et récompense une fois',()=>{
  const {uno}=setup();run('uno-win',()=>{
    uno.create('g@g.us','a');uno.join('g@g.us','b');uno.start('g@g.us','a',{randomInt:(a)=>a});const g=uno._live('g@g.us');g.turnIndex=0;g.discard=[C('R','5')];g.activeColor='R';g.hands.a=[C('R','9')];g.hands.b=[C('G','2')];uno._save();
    const before=profileMod.profiles.get('a').coins,r=uno.play('g@g.us','a',1);assert.equal(r.won,true);assert.equal(uno.status('g@g.us'),null);assert.equal(profileMod.profiles.get('a').coins,before+60);
    assert.equal(uno.play('g@g.us','a',1).error,'not-found');assert.equal(profileMod.profiles.get('a').coins,before+60);
  });
});

test('UNO: persistance et isolation multi-session',()=>{
  const {root,uno}=setup();run('uno-s1',()=>{uno.create('g@g.us','a');uno.join('g@g.us','b');});run('uno-s2',()=>{uno.create('g@g.us','c');uno.join('g@g.us','d');});
  const reloaded=new UnoStore({root});run('uno-s1',()=>assert.deepEqual(reloaded.status('g@g.us').players,['a','b']));run('uno-s2',()=>assert.deepEqual(reloaded.status('g@g.us').players,['c','d']));
});

test('Stress UNO: 500 lobbies et distributions multi-session',()=>{
  const {uno}=setup();let ops=0;for(let s=0;s<10;s++)run(`uno-stress-${s}`,()=>{for(let i=0;i<50;i++){const chat=`u${i}@g.us`;uno.create(chat,'a');uno.join(chat,'b');const r=uno.start(chat,'a',{randomInt:(a)=>a});assert.equal(r.ok,true);assert.equal(uno.hand(chat,'a').length,7);uno.cancel(chat);ops++;}});assert.equal(ops,500);
});
