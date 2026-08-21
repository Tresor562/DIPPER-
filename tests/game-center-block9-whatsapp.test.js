'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-rpg-wa-'));}
function fresh(){
  const paths=['../commands/games_entertainment/rpg','../utils/gameCenterWhatsappBlock9','../utils/gameCenterRpg','../utils/gameCenterProfiles'].map(require.resolve);for(const p of paths)delete require.cache[p];
  const profiles=require('../utils/gameCenterProfiles');const root=temp();profiles.profiles.root=root;profiles.profiles.sessions.clear();
  const rpg=require('../utils/gameCenterRpg');rpg.rpg.root=root;rpg.rpg.sessions.clear();return require('../commands/games_entertainment/rpg');
}
function sockMock(){const sent=[];return{sent,user:{id:'bot@s.whatsapp.net'},async sendMessage(jid,payload){sent.push({jid,payload});return{key:{id:`m${sent.length}`}};}};}
function msg(chat,user,text){return{key:{remoteJid:chat,participant:chat.endsWith('@g.us')?user:undefined,fromMe:false,id:'m1'},message:{conversation:text}};}
function extra(chat,user,sock){return{from:chat,sender:user,isGroup:chat.endsWith('@g.us'),isAdmin:false,isOwner:false,isSupremeOwner:false,phrases:{footer:()=>'> test'},reply:async text=>sock.sendMessage(chat,{text})};}

test('WhatsApp RPG: menu explique les classes et actions',async()=>{
  const cmd=fresh(),sock=sockMock(),u='u@s.whatsapp.net';await sessionContext.run('rpg-wa-menu',async()=>{await cmd.execute(sock,msg(u,u,'.rpg'),[],extra(u,u,sock));const t=sock.sent.at(-1).payload.text;assert.match(t,/TERRES DU DIPPER/i);assert.match(t,/start warrior/i);assert.match(t,/rpg attack/i);});
});

test('WhatsApp RPG: classe invalide refusée puis mage créé',async()=>{
  const cmd=fresh(),sock=sockMock(),u='u@s.whatsapp.net';await sessionContext.run('rpg-wa-start',async()=>{
    await cmd.execute(sock,msg(u,u,'.rpg start paladin'),['start','paladin'],extra(u,u,sock));assert.match(sock.sent.at(-1).payload.text,/warrior.*mage.*rogue/i);
    await cmd.execute(sock,msg(u,u,'.rpg start mage'),['start','mage'],extra(u,u,sock));assert.match(sock.sent.at(-1).payload.text,/NOUVEAU HÉROS/i);assert.match(sock.sent.at(-1).payload.text,/Mage/i);
  });
});

test('WhatsApp RPG: attack sans rencontre renvoie vers explore',async()=>{
  const cmd=fresh(),sock=sockMock(),u='u@s.whatsapp.net';await sessionContext.run('rpg-wa-attack',async()=>{
    await cmd.execute(sock,msg(u,u,'.rpg start warrior'),['start','warrior'],extra(u,u,sock));await cmd.execute(sock,msg(u,u,'.rpg attack'),['attack'],extra(u,u,sock));assert.match(sock.sent.at(-1).payload.text,/Aucun monstre/i);assert.match(sock.sent.at(-1).payload.text,/rpg explore/i);
  });
});

test('WhatsApp RPG: profil affiche HP, niveau et potions',async()=>{
  const cmd=fresh(),sock=sockMock(),u='u@s.whatsapp.net';await sessionContext.run('rpg-wa-profile',async()=>{
    await cmd.execute(sock,msg(u,u,'.rpg start rogue'),['start','rogue'],extra(u,u,sock));await cmd.execute(sock,msg(u,u,'.rpg profile'),['profile'],extra(u,u,sock));const t=sock.sent.at(-1).payload.text;assert.match(t,/HP/i);assert.match(t,/Niveau/i);assert.match(t,/Potions/i);
  });
});
