'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const wolfMod=require('../utils/gameCenterWerewolf');
const profileMod=require('../utils/gameCenterProfiles');

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-wolf-wa-'));}
function msg(chat,user,text){return{key:{remoteJid:chat,participant:chat.endsWith('@g.us')?user:undefined,fromMe:false},message:{conversation:text}};}
function extra(chat,user,sock){return{from:chat,sender:user,isGroup:chat.endsWith('@g.us'),isAdmin:false,isOwner:false,isSupremeOwner:false,phrases:{footer:()=>'> test'},reply:async text=>sock.sendMessage(chat,{text})};}
function sockMock({failJid=null}={}){const sent=[];return{sent,async sendMessage(jid,payload){sent.push({jid,payload});if(jid===failJid)throw new Error('dm fail');return{key:{id:`m${sent.length}`}};}};}
function fresh(root){wolfMod.werewolf.root=root;wolfMod.werewolf.sessions.clear();profileMod.profiles.root=root;profileMod.profiles.sessions.clear();for(const p of ['../commands/games_entertainment/wolf','../commands/games_entertainment/wolfact'].map(require.resolve))delete require.cache[p];return{wolf:require('../commands/games_entertainment/wolf'),act:require('../commands/games_entertainment/wolfact')};}
async function lobby(cmd,sock,chat,players){await cmd.execute(sock,msg(chat,players[0],'.wolf create'),['create'],extra(chat,players[0],sock));for(const p of players.slice(1))await cmd.execute(sock,msg(chat,p,'.wolf join'),['join'],extra(chat,p,sock));}

test('WhatsApp Loup-Garou: rôles uniquement en DM, jamais dans le groupe',async()=>{
  const root=temp(),sock=sockMock(),{wolf}=fresh(root),chat='wolf-wa@g.us',players=Array.from({length:6},(_,i)=>`p${i}@s.whatsapp.net`);
  await sessionContext.run('wolf-wa',async()=>{await lobby(wolf,sock,chat,players);await wolf.execute(sock,msg(chat,players[0],'.wolf start'),['start'],extra(chat,players[0],sock));
    const dms=sock.sent.filter(x=>players.includes(x.jid));assert.equal(dms.length,players.length);assert.ok(dms.every(x=>/Ton rôle/i.test(x.payload.text||'')));
    const group=sock.sent.filter(x=>x.jid===chat).map(x=>x.payload.text||'').join('\n');assert.doesNotMatch(group,/Ton rôle|Voyant\(e\)|Villageois\(e\)|Médecin/);assert.match(group,/NUIT 1/);
  });
});

test('WhatsApp Loup-Garou: échec d’un DM rôle annule tout',async()=>{
  const root=temp(),chat='wolf-fail@g.us',players=Array.from({length:5},(_,i)=>`p${i}@s.whatsapp.net`),sock=sockMock({failJid:players[3]}),{wolf}=fresh(root);
  await sessionContext.run('wolf-fail',async()=>{await lobby(wolf,sock,chat,players);await wolf.execute(sock,msg(chat,players[0],'.wolf start'),['start'],extra(chat,players[0],sock));assert.equal(wolfMod.werewolf.get(chat),null);assert.match(sock.sent.filter(x=>x.jid===chat).at(-1).payload.text,/annulée/i);});
});

test('wolfact utilisée dans un groupe refuse avant toute mutation',async()=>{
  const root=temp(),sock=sockMock(),{wolf,act}=fresh(root),chat='wolf-private@g.us',players=Array.from({length:5},(_,i)=>`p${i}@s.whatsapp.net`);
  await sessionContext.run('wolf-private',async()=>{await lobby(wolf,sock,chat,players);await wolf.execute(sock,msg(chat,players[0],'.wolf start'),['start'],extra(chat,players[0],sock));const g=wolfMod.werewolf.get(chat),wolfPlayer=g.players.find(p=>g.roles[p]==='wolf'),before=JSON.stringify(g.night);await act.execute(sock,msg(chat,wolfPlayer,`.wolfact #${g.alias} kill 2`),[`#${g.alias}`,'kill','2'],extra(chat,wolfPlayer,sock));assert.match(sock.sent.at(-1).payload.text,/strictement privée/i);assert.equal(JSON.stringify(wolfMod.werewolf.get(chat).night),before);});
});

test('wolfact voyante révèle seulement loup/pas loup dans le DM',async()=>{
  const root=temp(),sock=sockMock(),{wolf,act}=fresh(root),chat='wolf-seer@g.us',players=Array.from({length:6},(_,i)=>`p${i}@s.whatsapp.net`);
  await sessionContext.run('wolf-seer',async()=>{await lobby(wolf,sock,chat,players);await wolf.execute(sock,msg(chat,players[0],'.wolf start'),['start'],extra(chat,players[0],sock));const g=wolfMod.werewolf.get(chat),seer=g.players.find(p=>g.roles[p]==='seer'),wolfPlayer=g.players.find(p=>g.roles[p]==='wolf'),target=g.players.indexOf(wolfPlayer)+1;const privateExtra=extra(seer,seer,sock);await act.execute(sock,msg(seer,seer,`.wolfact #${g.alias} see ${target}`),[`#${g.alias}`,'see',String(target)],privateExtra);const text=sock.sent.at(-1).payload.text;assert.match(text,/LOUP/);assert.doesNotMatch(text,/rôle.*Loup-Garou/i);});
});

test('wolfact role retourne le rôle uniquement au demandeur privé',async()=>{
  const root=temp(),sock=sockMock(),{wolf,act}=fresh(root),chat='wolf-role@g.us',players=Array.from({length:5},(_,i)=>`p${i}@s.whatsapp.net`);
  await sessionContext.run('wolf-role',async()=>{await lobby(wolf,sock,chat,players);await wolf.execute(sock,msg(chat,players[0],'.wolf start'),['start'],extra(chat,players[0],sock));const g=wolfMod.werewolf.get(chat),user=players[2],beforeGroup=sock.sent.filter(x=>x.jid===chat).length;await act.execute(sock,msg(user,user,`.wolfact #${g.alias} role`),[`#${g.alias}`,'role'],extra(user,user,sock));assert.equal(sock.sent.at(-1).jid,user);assert.match(sock.sent.at(-1).payload.text,/RÔLE PRIVÉ/i);assert.equal(sock.sent.filter(x=>x.jid===chat).length,beforeGroup);});
});
