'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const {
  GameProfileStore,START_COINS,FISH_COOLDOWN_MS,FISH_WEIGHT,drawFish,levelFromXp
}=require('../utils/gameCenterProfiles');

function temp(){ return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-game-center-v7-')); }
function run(sid,fn){ return sessionContext.run(sid,fn); }
function clear(paths){ for(const p of paths.map(require.resolve))delete require.cache[p]; }
function freshBlock(){
  clear(['../utils/gameCenterWhatsappBlock7','../utils/gameCenterProfiles']);
  const store=require('../utils/gameCenterProfiles'); store.profiles.root=temp(); store.profiles.sessions.clear();
  return {store,block:require('../utils/gameCenterWhatsappBlock7')};
}
function freshCommand(name){
  clear([`../commands/games_entertainment/${name}`,'../utils/gameCenterWhatsappBlock7','../utils/gameCenterProfiles']);
  const store=require('../utils/gameCenterProfiles'); store.profiles.root=temp(); store.profiles.sessions.clear();
  return {store,cmd:require(`../commands/games_entertainment/${name}`)};
}
function sockMock(){ const sent=[]; return {sent,user:{id:'bot@s.whatsapp.net'},async sendMessage(jid,payload){ sent.push({jid,payload}); return {key:{id:`m${sent.length}`}}; }}; }
function msg(chat,user,text,mentions=[]){ const ci=mentions.length?{mentionedJid:mentions}:undefined; return {key:{remoteJid:chat,participant:chat.endsWith('@g.us')?user:undefined,fromMe:false,id:`m-${Date.now()}`},message:ci?{extendedTextMessage:{text,contextInfo:ci}}:{conversation:text}}; }
function extra(chat,user,sock,flags={}){ return {from:chat,sender:user,isGroup:chat.endsWith('@g.us'),isAdmin:false,isOwner:false,isSupremeOwner:false,groupMetadata:{participants:[]},...flags,phrases:{footer:()=>'> test'},reply:async text=>sock.sendMessage(chat,{text})}; }

test('Profil: création persistée même si le fichier contient déjà un autre joueur',()=>{
  const root=temp(),store=new GameProfileStore({root});
  run('profile-persist',()=>{
    store.get('a@s.whatsapp.net');
    store.get('b@s.whatsapp.net');
    const raw=JSON.parse(fs.readFileSync(path.join(root,'profile-persist','profiles.json'),'utf8'));
    assert.equal(raw.profiles.length,2);
    assert.deepEqual(new Set(raw.profiles.map(x=>x.userId)),new Set(['a@s.whatsapp.net','b@s.whatsapp.net']));
  });
});

test('Profils: isolation stricte entre sessions du bot',()=>{
  const root=temp(),store=new GameProfileStore({root}),user='same@s.whatsapp.net';
  run('profile-session-a',()=>store.addXp(user,900));
  run('profile-session-b',()=>{ const p=store.get(user); assert.equal(p.xp,0); assert.equal(p.coins,START_COINS); });
  run('profile-session-a',()=>assert.equal(store.get(user).xp,900));
});

test('Économie virtuelle: dépenses invalides ou trop grandes ne rendent jamais le solde négatif',()=>{
  const store=new GameProfileStore({root:temp()});
  run('coins-guard',()=>{
    const user='u@s.whatsapp.net';
    assert.equal(store.spendCoins(user,0).error,'amount');
    assert.equal(store.spendCoins(user,START_COINS+1).error,'funds');
    assert.equal(store.get(user).coins,START_COINS);
    const ok=store.spendCoins(user,100); assert.equal(ok.ok,true); assert.equal(ok.profile.coins,START_COINS-100);
  });
});

test('XP: calcul de niveau stable et succès niveau 5',()=>{
  const store=new GameProfileStore({root:temp()});
  assert.equal(levelFromXp(0),1); assert.equal(levelFromXp(100),2); assert.equal(levelFromXp(400),3); assert.equal(levelFromXp(1600),5);
  run('xp-level',()=>{
    const r=store.addXp('u@s.whatsapp.net',1600); assert.equal(r.profile.level,5); assert.ok(r.achievements.some(x=>x.id==='level_5'));
  });
});

test('Pêche: bornes de la table pondérée couvrent commun et légendaire',()=>{
  assert.equal(FISH_WEIGHT,10000);
  assert.equal(drawFish(()=>0).id,'sardine');
  assert.equal(drawFish(()=>9999).id,'leviathan');
});

test('Pêche: gain, inventaire, premier succès et cooldown',()=>{
  const store=new GameProfileStore({root:temp()});
  run('fish-flow',()=>{
    const randomInt=(min,max)=>min;
    const first=store.fish('u@s.whatsapp.net',{ts:1_000_000,randomInt});
    assert.equal(first.ok,true); assert.equal(first.fish.id,'sardine'); assert.equal(first.coins,8); assert.equal(first.profile.fishing.inventory.sardine,1);
    assert.ok(first.achievements.some(x=>x.id==='first_catch'));
    const blocked=store.fish('u@s.whatsapp.net',{ts:1_000_001,randomInt}); assert.equal(blocked.error,'cooldown'); assert.ok(blocked.remainingMs>0);
    const later=store.fish('u@s.whatsapp.net',{ts:1_000_000+FISH_COOLDOWN_MS,randomInt}); assert.equal(later.ok,true); assert.equal(later.profile.fishing.catches,2);
  });
});

test('Résultats: victoire, défaite et série alimentent le profil sans incohérence',()=>{
  const store=new GameProfileStore({root:temp()});
  run('profile-results',()=>{
    const u='u@s.whatsapp.net';
    for(let i=0;i<5;i++)store.recordResult(u,'win',{xp:10,coins:2});
    let p=store.get(u); assert.equal(p.wins,5); assert.equal(p.streak,5); assert.equal(p.bestStreak,5); assert.ok(p.achievements.some(x=>x.id==='streak_5'));
    store.recordResult(u,'loss'); p=store.get(u); assert.equal(p.losses,1); assert.equal(p.streak,0); assert.equal(p.played,6);
  });
});

test('Classement WhatsApp: un outsider à gros score ne fuit pas dans un autre groupe',()=>{
  const {store,block}=freshBlock();
  run('group-top-private',()=>{
    store.profiles.addXp('member1@s.whatsapp.net',100);
    store.profiles.addXp('member2@s.whatsapp.net',400);
    store.profiles.addXp('outsider@s.whatsapp.net',999999);
    const metadata={participants:[{id:'member1@s.whatsapp.net'},{id:'member2@s.whatsapp.net'}]};
    const board=block.groupLeaderboard(metadata,'xp',10);
    assert.deepEqual(board.rows.map(x=>x.userId),['member2@s.whatsapp.net','member1@s.whatsapp.net']);
    assert.equal(board.rows.some(x=>x.userId==='outsider@s.whatsapp.net'),false);
  });
});

test('Commande fish: première pêche répond puis la seconde applique le cooldown',async()=>{
  const {cmd}=freshCommand('fish'),sock=sockMock(),user='u@s.whatsapp.net';
  await sessionContext.run('wa-fish',async()=>{
    const ex=extra(user,user,sock);
    await cmd.execute(sock,msg(user,user,'.fish'),[],ex); assert.match(sock.sent.at(-1).payload.text,/PÊCHE/i);
    await cmd.execute(sock,msg(user,user,'.fish'),[],ex); assert.match(sock.sent.at(-1).payload.text,/Réessaie dans/i);
  });
});

test('Commande gameprofile: mention affiche le profil ciblé et signale monnaie virtuelle',async()=>{
  const {cmd}=freshCommand('gameprofile'),sock=sockMock(),chat='g@g.us',user='u@s.whatsapp.net',target='t@s.whatsapp.net';
  await sessionContext.run('wa-profile',async()=>{
    await cmd.execute(sock,msg(chat,user,'.gameprofile @t',[target]),[],extra(chat,user,sock));
    const out=sock.sent.at(-1); assert.deepEqual(out.payload.mentions,[target]); assert.match(out.payload.text,/Dipper Coins/i); assert.match(out.payload.text,/aucune valeur réelle/i);
  });
});

test('Commande gametop: classement ne contient que les profils des participants du groupe',async()=>{
  const {store,cmd}=freshCommand('gametop'),sock=sockMock(),chat='rank@g.us',u1='1@s.whatsapp.net',u2='2@s.whatsapp.net';
  await sessionContext.run('wa-top',async()=>{
    store.profiles.addXp(u1,100); store.profiles.addXp(u2,500); store.profiles.addXp('outside@s.whatsapp.net',9999);
    const ex=extra(chat,u1,sock,{groupMetadata:{participants:[{id:u1},{id:u2}]}});
    await cmd.execute(sock,msg(chat,u1,'.gametop xp'),['xp'],ex);
    const out=sock.sent.at(-1); assert.deepEqual(out.payload.mentions,[u2,u1]); assert.equal(out.payload.text.includes('outside'),false);
  });
});

test('Stress profils: 1 000 mutations réparties sur 10 sessions restent isolées',()=>{
  const store=new GameProfileStore({root:temp()}); let operations=0;
  for(let s=0;s<10;s++)run(`profile-stress-${s}`,()=>{
    for(let u=0;u<10;u++)for(let i=0;i<10;i++){ store.addXp(`u${u}@s.whatsapp.net`,1); operations++; }
  });
  assert.equal(operations,1000);
  run('profile-stress-0',()=>assert.equal(store.get('u0@s.whatsapp.net').xp,10));
  run('profile-stress-9',()=>assert.equal(store.get('u9@s.whatsapp.net').xp,10));
});
