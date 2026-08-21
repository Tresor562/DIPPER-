'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const unoMod=require('../utils/gameCenterUno');
const profileMod=require('../utils/gameCenterProfiles');

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-uno-wa-'));}
function msg(chat,user,text){return{key:{remoteJid:chat,participant:user,fromMe:false},message:{conversation:text}};}
function extra(chat,user,sock){return{from:chat,sender:user,isGroup:true,isAdmin:false,isOwner:false,isSupremeOwner:false,phrases:{footer:()=>'> test'},reply:async text=>sock.sendMessage(chat,{text})};}
function sockMock({failJid=null}={}){const sent=[];return{sent,async sendMessage(jid,payload){sent.push({jid,payload});if(jid===failJid)throw new Error('dm fail');return{key:{id:`m${sent.length}`}};}};}
function fresh(root){unoMod.uno.root=root;unoMod.uno.sessions.clear();profileMod.profiles.root=root;profileMod.profiles.sessions.clear();delete require.cache[require.resolve('../commands/games_entertainment/uno')];return require('../commands/games_entertainment/uno');}

test('WhatsApp UNO: mains distribuées uniquement en DM',async()=>{
  const root=temp(),cmd=fresh(root),sock=sockMock(),chat='uno-wa@g.us',a='a@s.whatsapp.net',b='b@s.whatsapp.net';
  await sessionContext.run('uno-wa',async()=>{
    await cmd.execute(sock,msg(chat,a,'.uno create'),['create'],extra(chat,a,sock));
    await cmd.execute(sock,msg(chat,b,'.uno join'),['join'],extra(chat,b,sock));
    await cmd.execute(sock,msg(chat,a,'.uno start'),['start'],extra(chat,a,sock));
    const dm=sock.sent.filter(x=>x.jid===a||x.jid===b);assert.equal(dm.length,2);assert.ok(dm.every(x=>/TA MAIN UNO/i.test(x.payload.text||'')));
    const group=sock.sent.filter(x=>x.jid===chat).map(x=>x.payload.text||'').join('\n');assert.doesNotMatch(group,/1\. 🔴|1\. 🟡|1\. 🟢|1\. 🔵|1\. ⚫/);
    assert.match(group,/mains ont été envoyées en privé/i);
  });
});

test('WhatsApp UNO: échec d’un DM annule toute la partie',async()=>{
  const root=temp(),chat='uno-fail@g.us',a='a@s.whatsapp.net',b='b@s.whatsapp.net',sock=sockMock({failJid:b}),cmd=fresh(root);
  await sessionContext.run('uno-fail',async()=>{
    await cmd.execute(sock,msg(chat,a,'.uno create'),['create'],extra(chat,a,sock));await cmd.execute(sock,msg(chat,b,'.uno join'),['join'],extra(chat,b,sock));await cmd.execute(sock,msg(chat,a,'.uno start'),['start'],extra(chat,a,sock));
    assert.equal(unoMod.uno.status(chat),null);assert.match(sock.sent.filter(x=>x.jid===chat).at(-1).payload.text,/annulé/i);
    assert.ok(sock.sent.some(x=>x.jid===a&&/annulé/i.test(x.payload.text||'')));
  });
});

test('WhatsApp UNO: .uno hand ne publie jamais la main dans le groupe',async()=>{
  const root=temp(),chat='uno-hand@g.us',a='a@s.whatsapp.net',b='b@s.whatsapp.net',sock=sockMock(),cmd=fresh(root);
  await sessionContext.run('uno-hand',async()=>{
    await cmd.execute(sock,msg(chat,a,'.uno create'),['create'],extra(chat,a,sock));await cmd.execute(sock,msg(chat,b,'.uno join'),['join'],extra(chat,b,sock));await cmd.execute(sock,msg(chat,a,'.uno start'),['start'],extra(chat,a,sock));
    const before=sock.sent.length;await cmd.execute(sock,msg(chat,a,'.uno hand'),['hand'],extra(chat,a,sock));const added=sock.sent.slice(before);assert.equal(added[0].jid,a);assert.match(added[0].payload.text,/TA MAIN UNO/i);assert.equal(added[1].jid,chat);assert.doesNotMatch(added[1].payload.text,/1\./);
  });
});
