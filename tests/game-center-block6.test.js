'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const {GameCenterEngine}=require('../utils/gameCenterEngine');
const {MAX_ANON_PER_HOUR,MAX_ANON_TEXT}=require('../utils/gameCenterBlock6');

function temp(){ return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-game-center-v6-')); }
function run(sid,fn){ return sessionContext.run(sid,fn); }
function clearModules(paths){ for(const p of paths.map(require.resolve))delete require.cache[p]; }
function freshAnonCommand(){
  clearModules(['../commands/games_entertainment/anon','../utils/gameCenterBlock6','../utils/gameCenterEngine']);
  const mod=require('../utils/gameCenterEngine');
  mod.engine.root=temp(); mod.engine.games.clear(); mod.engine._loadedSessions.clear();
  require('../utils/gameCenterBlock6');
  return require('../commands/games_entertainment/anon');
}
function freshGameCenter(){
  const modules=[
    '../commands/games_entertainment/gamecenter',
    '../utils/gameCenterWhatsappBlock6','../utils/gameCenterWhatsappBlock5','../utils/gameCenterWhatsappBlock4','../utils/gameCenterWhatsappBlock3','../utils/gameCenterWhatsappBlock2',
    '../utils/gameCenterBlock6','../utils/gameCenterBlock5','../utils/gameCenterBlock4','../utils/gameCenterBlock3','../utils/gameCenterBlock2','../utils/gameCenterEngine'
  ];
  clearModules(modules);
  const mod=require('../utils/gameCenterEngine');
  mod.engine.root=temp(); mod.engine.games.clear(); mod.engine._loadedSessions.clear();
  require('../utils/gameCenterBlock2');require('../utils/gameCenterBlock3');require('../utils/gameCenterBlock4');require('../utils/gameCenterBlock5');require('../utils/gameCenterBlock6');
  return require('../commands/games_entertainment/gamecenter');
}
function sockMock({participants=[],failGroup=false}={}){
  const sent=[];
  return {
    sent,user:{id:'bot@s.whatsapp.net'},
    async groupMetadata(jid){ return {id:jid,subject:'Groupe Secret',participants}; },
    async sendMessage(jid,payload){ sent.push({jid,payload}); if(failGroup&&jid.endsWith('@g.us'))throw new Error('simulated group failure'); return {key:{id:`m${sent.length}`}}; }
  };
}
function msg(chat,user,text){ return {key:{remoteJid:chat,participant:chat.endsWith('@g.us')?user:undefined,fromMe:false,id:`${chat}-${Date.now()}`},message:{conversation:text},pushName:'Tester'}; }
function extra(chat,user,sock,flags={}){ return {from:chat,sender:user,isGroup:chat.endsWith('@g.us'),isAdmin:false,isOwner:false,isSupremeOwner:false,...flags,phrases:{footer:()=>'> test'},reply:async text=>sock.sendMessage(chat,{text})}; }

test('Questions anonymes: texte et JID brut ne sont jamais persistés',()=>{
  const root=temp(),e=new GameCenterEngine({root});
  run('anon-private-storage',()=>{
    const g=e.startAnonymousInbox('secret@g.us','admin@s.whatsapp.net');
    const sender='22997000000@s.whatsapp.net',question='Qui est ton personnage anime préféré ?';
    const r=e.submitAnonymousQuestion(g.alias,sender,question);
    assert.equal(r.ok,true); assert.equal(r.question,question);
    const raw=fs.readFileSync(path.join(root,'anon-private-storage','games.json'),'utf8');
    assert.equal(raw.includes(sender),false);
    assert.equal(raw.includes(question),false);
    assert.equal(raw.includes('senderHash'),false);
    assert.equal(raw.includes('contentHash'),true);
  });
});

test('Questions anonymes: longueur, liens, doublons et limite horaire',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('anon-guards',()=>{
    const g=e.startAnonymousInbox('g@g.us','admin'); const user='u@s.whatsapp.net';
    assert.equal(e.submitAnonymousQuestion(g.alias,user,'ok').error,'short');
    assert.equal(e.submitAnonymousQuestion(g.alias,user,'x'.repeat(MAX_ANON_TEXT+1)).error,'long');
    assert.equal(e.submitAnonymousQuestion(g.alias,user,'Va sur https://example.com').error,'links');
    assert.equal(e.submitAnonymousQuestion(g.alias,user,'Question identique').ok,true);
    assert.equal(e.submitAnonymousQuestion(g.alias,user,'Question identique').error,'duplicate');
    for(let i=1;i<MAX_ANON_PER_HOUR;i++)assert.equal(e.submitAnonymousQuestion(g.alias,user,`Question numéro ${i}`).ok,true);
    assert.equal(e.submitAnonymousQuestion(g.alias,user,'Une question de trop').error,'rate');
  });
});

test('Questions anonymes: rollback retire compteur et rate-limit après échec de livraison',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('anon-rollback',()=>{
    const g=e.startAnonymousInbox('g@g.us','admin');
    const r=e.submitAnonymousQuestion(g.alias,'u@s.whatsapp.net','Question temporaire'); assert.equal(r.ok,true);
    assert.equal(e.findAnonymousInbox(g.alias).count,1);
    assert.equal(e.rollbackAnonymousQuestion(g.alias,r.rateToken),true);
    const state=e.findAnonymousInbox(g.alias); assert.equal(state.count,0); assert.equal(state.questions.length,0);
    assert.equal(e.submitAnonymousQuestion(g.alias,'u@s.whatsapp.net','Question temporaire').ok,true);
  });
});

test('Questions anonymes: fermeture efface les données anti-spam actives',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('anon-close',()=>{
    const g=e.startAnonymousInbox('g@g.us','admin'); e.submitAnonymousQuestion(g.alias,'u@s.whatsapp.net','Question avant fermeture');
    const closed=e.closeAnonymousInbox('g@g.us',g.alias); assert.equal(closed.status,'closed'); assert.deepEqual(closed.anonRate,{});
    assert.equal(e.findAnonymousInbox(g.alias),null);
  });
});

test('Commande privée anon: un membre du groupe publie sans identité visible',async()=>{
  const cmd=freshAnonCommand(),group='target@g.us',user='22997000001@s.whatsapp.net';
  const sock=sockMock({participants:[{id:user},{id:'other@s.whatsapp.net'}]});
  await sessionContext.run('anon-wa-ok',async()=>{
    const {engine}=require('../utils/gameCenterEngine'); const g=engine.startAnonymousInbox(group,'admin@s.whatsapp.net');
    const ex=extra(user,user,sock); await cmd.execute(sock,msg(user,user,`.anon #${g.alias} Qui gagnerait ?`),[`#${g.alias}`,'Qui','gagnerait','?'],ex);
    const groupMessages=sock.sent.filter(x=>x.jid===group); assert.equal(groupMessages.length,1);
    const payload=groupMessages[0].payload; assert.match(payload.text,/QUESTION ANONYME/i); assert.match(payload.text,/Qui gagnerait/);
    assert.equal(payload.text.includes(user),false); assert.equal(Array.isArray(payload.mentions),false);
    const ack=sock.sent.filter(x=>x.jid===user).at(-1); assert.match(ack.payload.text,/QUESTION ENVOYÉE/i);
  });
});

test('Commande privée anon: non-membre bloqué avant publication',async()=>{
  const cmd=freshAnonCommand(),group='locked@g.us',user='intrus@s.whatsapp.net';
  const sock=sockMock({participants:[{id:'member@s.whatsapp.net'}]});
  await sessionContext.run('anon-wa-member',async()=>{
    const {engine}=require('../utils/gameCenterEngine'); const g=engine.startAnonymousInbox(group,'admin');
    await cmd.execute(sock,msg(user,user,'anon'),[`#${g.alias}`,'Question','interdite'],extra(user,user,sock));
    assert.equal(sock.sent.filter(x=>x.jid===group).length,0);
    assert.match(sock.sent.at(-1).payload.text,/réservée aux membres/i);
  });
});

test('Commande privée anon: échec groupe rollbacke complètement la question',async()=>{
  const cmd=freshAnonCommand(),group='fail@g.us',user='member@s.whatsapp.net';
  const sock=sockMock({participants:[{id:user}],failGroup:true});
  await sessionContext.run('anon-wa-fail',async()=>{
    const {engine}=require('../utils/gameCenterEngine'); const g=engine.startAnonymousInbox(group,'admin');
    await cmd.execute(sock,msg(user,user,'anon'),[`#${g.alias}`,'Question','à','rollback'],extra(user,user,sock));
    const state=engine.findAnonymousInbox(g.alias); assert.equal(state.count,0); assert.equal(state.questions.length,0);
    assert.match(sock.sent.at(-1).payload.text,/Rien n’a été comptabilisé/i);
  });
});

test('Commande anon appelée en groupe ne publie aucune question',async()=>{
  const cmd=freshAnonCommand(),group='public@g.us',user='member@s.whatsapp.net',sock=sockMock({participants:[{id:user}]});
  await sessionContext.run('anon-wa-group',async()=>{
    await cmd.execute(sock,msg(group,user,'.anon secret'),['#abc123','secret'],extra(group,user,sock));
    assert.equal(sock.sent.filter(x=>x.jid===group).length,1);
    assert.match(sock.sent[0].payload.text,/en privé au bot/i);
  });
});

test('Game Center: ouverture anonyme est réservée aux admins et fermeture au gestionnaire',async()=>{
  const cmd=freshGameCenter(),chat='anon-admin@g.us',user='u@s.whatsapp.net',admin='a@s.whatsapp.net',sock=sockMock();
  await sessionContext.run('anon-gamecenter',async()=>{
    await cmd.execute(sock,msg(chat,user,'.games anon'),['anon'],extra(chat,user,sock));
    assert.match(sock.sent.at(-1).payload.text,/Seuls les admins/i);
    await cmd.execute(sock,msg(chat,admin,'.games anon'),['anon'],extra(chat,admin,sock,{isAdmin:true}));
    const g=cmd.engine.list(chat,{type:'anonymous-inbox'})[0]; assert.ok(g); assert.match(sock.sent.at(-1).payload.text,new RegExp(g.alias,'i'));
    await cmd.execute(sock,msg(chat,user,`.games anonclose #${g.alias}`),['anonclose',`#${g.alias}`],extra(chat,user,sock));
    assert.match(sock.sent.at(-1).payload.text,/Seul le créateur ou un admin/i);
    await cmd.execute(sock,msg(chat,admin,`.games anonclose #${g.alias}`),['anonclose',`#${g.alias}`],extra(chat,admin,sock,{isAdmin:true}));
    assert.equal(cmd.engine.list(chat,{type:'anonymous-inbox'}).length,0);
  });
});
