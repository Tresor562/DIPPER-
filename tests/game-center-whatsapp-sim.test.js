'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');

function freshCommand(){
  const enginePath=require.resolve('../utils/gameCenterEngine');
  delete require.cache[enginePath];
  const mod=require('../utils/gameCenterEngine');
  mod.engine.root=fs.mkdtempSync(path.join(os.tmpdir(),'dipper-wa-sim-'));
  mod.engine.games.clear(); mod.engine._loadedSessions.clear();
  const cmdPath=require.resolve('../commands/games_entertainment/gamecenter'); delete require.cache[cmdPath];
  return require('../commands/games_entertainment/gamecenter');
}
function sockMock(){ const sent=[]; return {sent,async sendMessage(jid,payload){ sent.push({jid,payload}); return {key:{id:`m${sent.length}`}}; }}; }
function msg(chat,user,text){ return {key:{remoteJid:chat,participant:user,fromMe:false,id:`${chat}-${user}-${Math.random()}`},message:{conversation:text},pushName:user.split('@')[0]}; }
function extra(chat,user,sock){ return {from:chat,sender:user,isGroup:true,isAdmin:false,isOwner:false,isSupremeOwner:false,phrases:{footer:()=>'> test'},reply:async text=>sock.sendMessage(chat,{text})}; }

test('simulation WhatsApp: lancement, votes et groupes isolés',async()=>{
  const cmd=freshCommand(), sock=sockMock();
  await sessionContext.run('sim-a',async()=>{
    await cmd.execute(sock,msg('g1@g.us','owner@s.whatsapp.net','.games prefer'),['prefer'],extra('g1@g.us','owner@s.whatsapp.net',sock));
    await cmd.execute(sock,msg('g2@g.us','owner@s.whatsapp.net','.games number'),['number','1','10'],extra('g2@g.us','owner@s.whatsapp.net',sock));
    const p=cmd.engine.list('g1@g.us')[0], n=cmd.engine.list('g2@g.us')[0];
    assert.equal(p.type,'prefer'); assert.equal(n.type,'guess-number');
    const handled=await cmd.handleIncomingGameMessage(sock,msg('g1@g.us','u1@s.whatsapp.net','1'),extra('g1@g.us','u1@s.whatsapp.net',sock));
    assert.equal(handled,true); assert.equal(cmd.engine.get('g1@g.us',p.alias,'prefer').votes['u1@s.whatsapp.net'],0);
    assert.equal(cmd.engine.get('g2@g.us',n.alias,'guess-number').attempts,0);
  });
});

test('simulation multi-session: même JID de groupe sans fuite',async()=>{
  const cmd=freshCommand(), sock=sockMock(), chat='same@g.us';
  await sessionContext.run('session-1',async()=>cmd.execute(sock,msg(chat,'a@s.whatsapp.net','.games chain'),['chain'],extra(chat,'a@s.whatsapp.net',sock)));
  await sessionContext.run('session-2',async()=>cmd.execute(sock,msg(chat,'b@s.whatsapp.net','.games prefer'),['prefer'],extra(chat,'b@s.whatsapp.net',sock)));
  await sessionContext.run('session-1',async()=>assert.equal(cmd.engine.list(chat)[0].type,'word-chain'));
  await sessionContext.run('session-2',async()=>assert.equal(cmd.engine.list(chat)[0].type,'prefer'));
});

test('simulation 2 000 messages naturels concurrentiels sans réponse parasite hors partie',async()=>{
  const cmd=freshCommand(), sock=sockMock(); let handled=0;
  const jobs=[];
  for(let s=0;s<4;s++) jobs.push(sessionContext.run(`sess-${s}`,async()=>{
    for(let g=0;g<5;g++){
      const chat=`group-${g}@g.us`;
      for(let i=0;i<100;i++){
        const user=`u${i}@s.whatsapp.net`;
        const ok=await cmd.handleIncomingGameMessage(sock,msg(chat,user,'conversation normale sans jeu'),extra(chat,user,sock));
        if(ok)handled++;
      }
    }
  }));
  await Promise.all(jobs);
  assert.equal(handled,0); assert.equal(sock.sent.length,0);
});

test('réponses utilisent le footer/style fourni par le runtime',async()=>{
  const cmd=freshCommand(), sock=sockMock();
  await sessionContext.run('style',async()=>{
    await cmd.execute(sock,msg('g@g.us','u@s.whatsapp.net','.games prefer'),['prefer'],extra('g@g.us','u@s.whatsapp.net',sock));
    assert.match(sock.sent.at(-1).payload.text,/> \*.*\*/);
  });
});
