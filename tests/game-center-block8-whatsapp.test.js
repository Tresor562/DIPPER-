'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');

function temp(){ return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-game-center-v8-wa-')); }
function fresh(){
  const paths=['../commands/games_entertainment/casino','../utils/gameCenterWhatsappBlock8','../utils/gameCenterCasino','../utils/gameCenterProfiles'].map(require.resolve);
  for(const p of paths)delete require.cache[p];
  const profiles=require('../utils/gameCenterProfiles');profiles.profiles.root=temp();profiles.profiles.sessions.clear();
  const casino=require('../utils/gameCenterCasino');casino.casino.root=profiles.profiles.root;casino.casino.sessions.clear();casino.casino.cooldowns.clear();
  return require('../commands/games_entertainment/casino');
}
function sockMock(){const sent=[];return{sent,user:{id:'bot@s.whatsapp.net'},async sendMessage(jid,payload){sent.push({jid,payload});return{key:{id:`m${sent.length}`}};}};}
function msg(chat,user,text){return{key:{remoteJid:chat,participant:chat.endsWith('@g.us')?user:undefined,fromMe:false,id:'m1'},message:{conversation:text}};}
function extra(chat,user,sock){return{from:chat,sender:user,isGroup:chat.endsWith('@g.us'),isAdmin:false,isOwner:false,isSupremeOwner:false,phrases:{footer:()=>'> test'},reply:async text=>sock.sendMessage(chat,{text})};}

test('WhatsApp casino: menu annonce clairement monnaie virtuelle et commandes',async()=>{
  const cmd=fresh(),sock=sockMock(),user='u@s.whatsapp.net';
  await sessionContext.run('casino-wa-menu',async()=>{
    await cmd.execute(sock,msg(user,user,'.casino'),[],extra(user,user,sock));
    const text=sock.sent.at(-1).payload.text;assert.match(text,/ARCADE CASINO VIRTUELLE/i);assert.match(text,/aucune valeur réelle/i);assert.match(text,/slots 50/i);assert.match(text,/blackjack 50/i);
  });
});

test('WhatsApp casino: mise hors bornes refusée sans modifier le solde',async()=>{
  const cmd=fresh(),sock=sockMock(),user='u@s.whatsapp.net';
  await sessionContext.run('casino-wa-bet',async()=>{
    const {profiles}=require('../utils/gameCenterProfiles');const before=profiles.get(user).coins;
    await cmd.execute(sock,msg(user,user,'.casino slots 1'),['slots','1'],extra(user,user,sock));
    assert.match(sock.sent.at(-1).payload.text,/10 à 500/i);assert.equal(profiles.get(user).coins,before);
  });
});

test('WhatsApp casino: hit sans main retourne une erreur propre',async()=>{
  const cmd=fresh(),sock=sockMock(),chat='c@g.us',user='u@s.whatsapp.net';
  await sessionContext.run('casino-wa-hit',async()=>{
    await cmd.execute(sock,msg(chat,user,'.casino hit'),['hit'],extra(chat,user,sock));
    assert.match(sock.sent.at(-1).payload.text,/Aucune main de blackjack active/i);
  });
});
