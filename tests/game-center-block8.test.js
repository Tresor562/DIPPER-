'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const profileMod=require('../utils/gameCenterProfiles');
const {
  CasinoStore,MIN_BET,MAX_BET,SLOT_WEIGHT,rouletteColor,parseRouletteChoice,createDeck,handValue,isBlackjack
}=require('../utils/gameCenterCasino');

function temp(){ return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-game-center-v8-')); }
function run(sid,fn){ return sessionContext.run(sid,fn); }
function setup(){ const root=temp(); profileMod.profiles.root=root; profileMod.profiles.sessions.clear(); const casino=new CasinoStore({root}); return {root,casino,profiles:profileMod.profiles}; }
function noCooldown(store){ store._cooldown=()=>0; }
function setHand(store,chat,user,{player,dealer,deck=[]}){ const state=store._ensure(),key=store._key(chat,user),h=state.hands[key]; h.player=player;h.dealer=dealer;h.deck=deck;h.updatedAt=Date.now();store._save();return h; }

const C=(rank,suit='♠️')=>({rank,suit});

test('Casino virtuel: bornes de mise strictes',()=>{
  const {casino}=setup(); run('casino-bet',()=>{
    noCooldown(casino);
    assert.equal(casino.slots('u',MIN_BET-1).error,'bet');
    assert.equal(casino.slots('u',MAX_BET+1).error,'bet');
    assert.equal(casino.roulette('u',MIN_BET,'orange').error,'choice');
    assert.equal(casino.startBlackjack('c','u',0).error,'bet');
  });
});

test('Slots: jackpot déterministe crédite exactement le multiplicateur et jamais deux fois par appel',()=>{
  const {casino,profiles}=setup(); run('casino-slots',()=>{
    noCooldown(casino); assert.equal(SLOT_WEIGHT,100);
    const before=profiles.get('u').coins;
    const r=casino.slots('u',10,{randomInt:()=>99,ts:1});
    assert.equal(r.ok,true);assert.deepEqual(r.symbols,['💎','💎','💎']);assert.equal(r.multiplier,25);assert.equal(r.payout,250);assert.equal(r.net,240);
    assert.equal(profiles.get('u').coins,before+240);
  });
});

test('Slots: perte retire uniquement la mise',()=>{
  const {casino,profiles}=setup(); run('casino-slots-loss',()=>{
    noCooldown(casino);let i=0;const seq=[0,40,80];const rng=()=>seq[i++];const before=profiles.get('u').coins;
    const r=casino.slots('u',20,{randomInt:rng,ts:1});assert.equal(r.multiplier,0);assert.equal(r.payout,0);assert.equal(profiles.get('u').coins,before-20);
  });
});

test('Roulette européenne: couleurs et zéro sont corrects',()=>{
  assert.equal(rouletteColor(0),'green');assert.equal(rouletteColor(1),'red');assert.equal(rouletteColor(2),'black');
  assert.deepEqual(parseRouletteChoice('rouge'),{type:'color',value:'red'});assert.deepEqual(parseRouletteChoice('17'),{type:'number',value:17});assert.equal(parseRouletteChoice('37'),null);
});

test('Roulette: rouge gagne x2, zéro fait perdre pair, numéro exact gagne x36',()=>{
  const {casino,profiles}=setup();run('casino-roulette',()=>{
    noCooldown(casino);const start=profiles.get('u').coins;
    let r=casino.roulette('u',10,'rouge',{randomInt:()=>1,ts:1});assert.equal(r.won,true);assert.equal(r.payout,20);
    r=casino.roulette('u',10,'pair',{randomInt:()=>0,ts:2});assert.equal(r.won,false);assert.equal(r.payout,0);
    r=casino.roulette('u',10,'17',{randomInt:()=>17,ts:3});assert.equal(r.won,true);assert.equal(r.payout,360);
    assert.equal(profiles.get('u').coins,start+10-10+350);
  });
});

test('Casino: fonds insuffisants ne créent jamais de solde négatif',()=>{
  const {casino,profiles}=setup();run('casino-funds',()=>{
    noCooldown(casino);profiles.spendCoins('u',240);assert.equal(profiles.get('u').coins,10);
    const r=casino.slots('u',20,{randomInt:()=>0,ts:1});assert.equal(r.error,'funds');assert.equal(profiles.get('u').coins,10);
  });
});

test('Casino: cooldown anti-spam partagé par session et joueur',()=>{
  const {casino}=setup();run('casino-cooldown',()=>{
    const a=casino.slots('u',10,{randomInt:()=>0,ts:10000});assert.equal(a.ok,true);
    const b=casino.roulette('u',10,'rouge',{randomInt:()=>1,ts:10001});assert.equal(b.error,'cooldown');assert.ok(b.remainingMs>0);
  });
});

test('Paquet blackjack: 52 cartes uniques et valeur des As correcte',()=>{
  const deck=createDeck();assert.equal(deck.length,52);assert.equal(new Set(deck.map(x=>`${x.rank}${x.suit}`)).size,52);
  assert.equal(handValue([C('A'),C('K')]),21);assert.equal(isBlackjack([C('A'),C('K')]),true);
  assert.equal(handValue([C('A'),C('A'),C('9')]),21);assert.equal(handValue([C('A'),C('A'),C('K'),C('9')]),21);
});

test('Blackjack: victoire dealer bust paie x2 puis toute répétition est impossible',()=>{
  const {casino,profiles}=setup();run('casino-bj-win',()=>{
    const before=profiles.get('u').coins;const start=casino.startBlackjack('g','u',20,{randomInt:(a)=>a});assert.equal(start.ok,true);
    setHand(casino,'g','u',{player:[C('K'),C('Q')],dealer:[C('9'),C('7')],deck:[C('10')]});
    const r=casino.standBlackjack('g','u');assert.equal(r.outcome,'win');assert.equal(r.payout,40);assert.equal(profiles.get('u').coins,before+20);
    const balance=profiles.get('u').coins;assert.equal(casino.standBlackjack('g','u').error,'not-found');assert.equal(profiles.get('u').coins,balance);
  });
});

test('Blackjack: égalité rembourse exactement la mise',()=>{
  const {casino,profiles}=setup();run('casino-bj-push',()=>{
    const before=profiles.get('u').coins;casino.startBlackjack('g','u',30,{randomInt:(a)=>a});
    setHand(casino,'g','u',{player:[C('K'),C('8')],dealer:[C('Q'),C('8')],deck:[]});
    const r=casino.standBlackjack('g','u');assert.equal(r.outcome,'push');assert.equal(r.payout,30);assert.equal(profiles.get('u').coins,before);
  });
});

test('Blackjack: bust ne paie rien et supprime la main',()=>{
  const {casino,profiles}=setup();run('casino-bj-bust',()=>{
    const before=profiles.get('u').coins;casino.startBlackjack('g','u',25,{randomInt:(a)=>a});
    setHand(casino,'g','u',{player:[C('K'),C('9')],dealer:[C('10'),C('7')],deck:[C('5')]});
    const r=casino.hitBlackjack('g','u');assert.equal(r.finished,true);assert.equal(r.outcome,'loss');assert.equal(r.reason,'bust');assert.equal(profiles.get('u').coins,before-25);assert.equal(casino.getHand('g','u'),null);
  });
});

test('Blackjack: abort rembourse une fois et retire la main',()=>{
  const {casino,profiles}=setup();run('casino-bj-abort',()=>{
    const before=profiles.get('u').coins;casino.startBlackjack('g','u',40,{randomInt:(a)=>a});assert.equal(profiles.get('u').coins,before-40);
    const r=casino.abortBlackjack('g','u');assert.equal(r.ok,true);assert.equal(r.refunded,40);assert.equal(profiles.get('u').coins,before);
    assert.equal(casino.abortBlackjack('g','u').error,'not-found');assert.equal(profiles.get('u').coins,before);
  });
});

test('Blackjack: même joueur peut avoir une main distincte dans deux chats',()=>{
  const {casino}=setup();run('casino-bj-chats',()=>{
    assert.equal(casino.startBlackjack('g1','u',10,{randomInt:(a)=>a}).ok,true);
    assert.equal(casino.startBlackjack('g2','u',10,{randomInt:(a)=>a}).ok,true);
    assert.ok(casino.getHand('g1','u'));assert.ok(casino.getHand('g2','u'));
  });
});

test('Blackjack: mains isolées entre sessions',()=>{
  const {casino}=setup();run('casino-s1',()=>casino.startBlackjack('g','u',10,{randomInt:(a)=>a}));
  run('casino-s2',()=>assert.equal(casino.getHand('g','u'),null));
  run('casino-s1',()=>assert.ok(casino.getHand('g','u')));
});

test('Stress casino: 2 000 spins déterministes restent bornés et soldes >= 0',()=>{
  const {casino,profiles}=setup();let ops=0;
  for(let s=0;s<20;s++)run(`casino-stress-${s}`,()=>{
    noCooldown(casino);profiles.addCoins('u',2000);
    for(let i=0;i<100;i++){ const r=casino.slots('u',10,{randomInt:()=>0,ts:i});assert.equal(r.ok,true);assert.ok(r.profile.coins>=0);ops++; }
  });
  assert.equal(ops,2000);
});
