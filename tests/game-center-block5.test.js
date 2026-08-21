'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const {GameCenterEngine}=require('../utils/gameCenterEngine');
const {
  MIN_SECRET_PLAYERS,MAX_SECRET_PLAYERS,buildSecretFriendPlan,crownOfDay
}=require('../utils/gameCenterBlock5');
const {participantIds,sendSecretAssignments}=require('../utils/gameCenterWhatsappBlock5');

function temp(){ return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-game-center-v5-')); }
function run(sid,fn){ return sessionContext.run(sid,fn); }
function freshCommand(){
  const modules=[
    '../commands/games_entertainment/gamecenter',
    '../utils/gameCenterWhatsappBlock5','../utils/gameCenterWhatsappBlock4','../utils/gameCenterWhatsappBlock3','../utils/gameCenterWhatsappBlock2',
    '../utils/gameCenterBlock5','../utils/gameCenterBlock4','../utils/gameCenterBlock3','../utils/gameCenterBlock2','../utils/gameCenterEngine'
  ].map(require.resolve);
  for(const p of modules)delete require.cache[p];
  const mod=require('../utils/gameCenterEngine');
  mod.engine.root=temp(); mod.engine.games.clear(); mod.engine._loadedSessions.clear();
  require('../utils/gameCenterBlock2'); require('../utils/gameCenterBlock3'); require('../utils/gameCenterBlock4'); require('../utils/gameCenterBlock5');
  return require('../commands/games_entertainment/gamecenter');
}
function sockMock({failJid=null}={}){ const sent=[]; return {sent,user:{id:'bot@s.whatsapp.net'},async sendMessage(jid,payload){ sent.push({jid,payload}); if(jid===failJid)throw new Error('simulated send failure'); return {key:{id:`m${sent.length}`}}; }}; }
function msg(chat,user,text,mentions=[]){
  const contextInfo=mentions.length?{mentionedJid:mentions}:undefined;
  return {key:{remoteJid:chat,participant:chat.endsWith('@g.us')?user:undefined,fromMe:false,id:`${chat}-${user}-${Date.now()}`},message:contextInfo?{extendedTextMessage:{text,contextInfo}}:{conversation:text},pushName:user.split('@')[0]};
}
function extra(chat,user,sock,flags={}){ return {from:chat,sender:user,isGroup:true,isAdmin:false,isOwner:false,isSupremeOwner:false,groupMetadata:{subject:'Groupe Test',participants:[]},...flags,phrases:{footer:()=>'> test'},reply:async text=>sock.sendMessage(chat,{text})}; }

test('Meilleur membre: auto-vote refusé, vote remplaçable et classement',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('best-flow',()=>{
    const g=e.startBestMember('g@g.us','host');
    assert.equal(e.voteBestMember('g@g.us','u1','u1',g.alias).reason,'self');
    e.voteBestMember('g@g.us','u1','a',g.alias);
    e.voteBestMember('g@g.us','u1','b',g.alias);
    e.voteBestMember('g@g.us','u2','b',g.alias);
    const r=e.closeBestMember('g@g.us',g.alias);
    assert.deepEqual(r.winners,['b']); assert.equal(r.totalVotes,2); assert.equal(r.ranking[0].score,2);
    assert.equal(e.get('g@g.us',g.alias,'best-member'),null);
  });
});

test('Roi/Reine/Souverain du jour: résultat déterministe malgré ordre des participants',()=>{
  run('crown-day',()=>{
    const ids=['3@s.whatsapp.net','1@s.whatsapp.net','2@s.whatsapp.net','4@s.whatsapp.net'];
    const a=crownOfDay('g@g.us',ids,'crown','2026-08-21');
    const b=crownOfDay('g@g.us',[...ids].reverse(),'crown','2026-08-21');
    assert.deepEqual(a,b); assert.ok(ids.includes(a.winner)); assert.equal(a.count,4);
  });
});

test('Secret Friend: permutation sans auto-attribution et sans cible dupliquée',()=>{
  for(let n=MIN_SECRET_PLAYERS;n<=MAX_SECRET_PLAYERS;n+=3){
    const ids=Array.from({length:n},(_,i)=>`${1000+i}@s.whatsapp.net`);
    for(let trial=0;trial<10;trial++){
      const plan=buildSecretFriendPlan(ids); assert.ok(!plan.error); assert.equal(plan.pairs.length,n);
      assert.ok(plan.pairs.every(pair=>pair.from!==pair.to));
      assert.equal(new Set(plan.pairs.map(pair=>pair.from)).size,n);
      assert.equal(new Set(plan.pairs.map(pair=>pair.to)).size,n);
    }
  }
});

test('Secret Friend: bornes de participants appliquées',()=>{
  assert.equal(buildSecretFriendPlan(['a','b']).error,'min');
  assert.equal(buildSecretFriendPlan(Array.from({length:MAX_SECRET_PLAYERS+1},(_,i)=>String(i))).error,'max');
});

test('Secret Friend: les paires ne sont jamais persistées dans games.json',()=>{
  const root=temp(),e=new GameCenterEngine({root});
  run('secret-private',()=>{
    const players=['p1@s.whatsapp.net','p2@s.whatsapp.net','p3@s.whatsapp.net','p4@s.whatsapp.net'];
    const g=e.startSecretFriend('g@g.us','host@s.whatsapp.net',players);
    assert.equal(g.secretPlan.length,players.length);
    let raw=fs.readFileSync(path.join(root,'secret-private','games.json'),'utf8');
    for(const jid of players)assert.equal(raw.includes(jid),false);
    assert.equal(raw.includes('secretPlan'),false);
    const final=e.finishSecretFriend('g@g.us',g.alias,{sent:4,failed:0});
    assert.equal(final.status,'finished');
    raw=fs.readFileSync(path.join(root,'secret-private','games.json'),'utf8');
    assert.equal(raw.includes('secretPlan'),false);
  });
});

test('Secret Friend: distribution partielle devient cancelled',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('secret-cancel',()=>{
    const g=e.startSecretFriend('g@g.us','host',['a@s.whatsapp.net','b@s.whatsapp.net','c@s.whatsapp.net']);
    const final=e.finishSecretFriend('g@g.us',g.alias,{sent:2,failed:1,cancelled:true});
    assert.equal(final.status,'cancelled'); assert.equal(final.delivery.failed,1); assert.ok(final.cancelledAt);
  });
});

test('participants Secret Friend: bot, doublons et JIDs non humains exclus',()=>{
  const metadata={participants:[
    {id:'a@s.whatsapp.net'},{id:'a@s.whatsapp.net'},{id:'b@lid'},{id:'bot@s.whatsapp.net'},{id:'status@broadcast'},{id:'x@g.us'}
  ]};
  assert.deepEqual(participantIds(metadata,['bot@s.whatsapp.net']),['a@s.whatsapp.net','b@lid']);
});

test('envoi Secret Friend réussi: uniquement des DMs et mentions de la cible',async()=>{
  const pairs=buildSecretFriendPlan(['a@s.whatsapp.net','b@s.whatsapp.net','c@s.whatsapp.net']).pairs;
  const sock=sockMock();
  const r=await sendSecretAssignments(sock,pairs,{groupName:'Test',delayMs:0,retries:1});
  assert.equal(r.cancelled,false); assert.equal(r.sent.length,3); assert.equal(r.failed.length,0);
  assert.deepEqual(new Set(sock.sent.map(x=>x.jid)),new Set(pairs.map(x=>x.from)));
  for(const pair of pairs){
    const delivery=sock.sent.find(x=>x.jid===pair.from); assert.ok(delivery); assert.deepEqual(delivery.payload.mentions,[pair.to]);
    assert.notEqual(pair.from,pair.to);
  }
});

test('échec Secret Friend: annule les attributions déjà livrées',async()=>{
  const pairs=[
    {from:'a@s.whatsapp.net',to:'b@s.whatsapp.net'},
    {from:'b@s.whatsapp.net',to:'c@s.whatsapp.net'},
    {from:'c@s.whatsapp.net',to:'a@s.whatsapp.net'}
  ];
  const sock=sockMock({failJid:'b@s.whatsapp.net'});
  const r=await sendSecretAssignments(sock,pairs,{groupName:'Test',delayMs:0,retries:1});
  assert.equal(r.cancelled,true); assert.equal(r.failed.length,1); assert.equal(r.sent.length,2);
  const cancelMessages=sock.sent.filter(x=>/Secret Friend annulé/i.test(x.payload.text||''));
  assert.equal(cancelMessages.length,2);
});

test('WhatsApp: best @membre reste au vote même avec un jeu Devine actif',async()=>{
  const cmd=freshCommand(),sock=sockMock(),chat='best-cross@g.us',voter='u@s.whatsapp.net',target='t@s.whatsapp.net';
  await sessionContext.run('wa-best-cross',async()=>{
    const best=cmd.engine.startBestMember(chat,'host');
    const clue=cmd.engine.startClueGame(chat,'host',{kind:'character',category:'anime',rounds:1});
    const handled=await cmd.handleIncomingGameMessage(sock,msg(chat,voter,`best @t #${best.alias}`,[target]),extra(chat,voter,sock));
    assert.equal(handled,true); assert.equal(cmd.engine.get(chat,best.alias,'best-member').votes[voter],target);
    assert.deepEqual(cmd.engine.get(chat,clue.alias,'guess-character').attempts,{});
  });
});

test('Secret Friend via Game Center refuse un membre non-admin avant tout DM',async()=>{
  const cmd=freshCommand(),sock=sockMock(),chat='secret-admin@g.us',user='u@s.whatsapp.net';
  await sessionContext.run('wa-secret-admin',async()=>{
    const ex=extra(chat,user,sock,{groupMetadata:{subject:'Test',participants:[{id:'a@s.whatsapp.net'},{id:'b@s.whatsapp.net'},{id:'c@s.whatsapp.net'}]}});
    await cmd.execute(sock,msg(chat,user,'.games secretfriend'),['secretfriend'],ex);
    assert.equal(sock.sent.filter(x=>x.jid.endsWith('@s.whatsapp.net')).length,0);
    assert.match(sock.sent.at(-1).payload.text,/réservé aux admins/i);
  });
});
