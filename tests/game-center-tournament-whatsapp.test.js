'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const tournamentMod=require('../utils/gameCenterTournament');

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-tourney-wa-'));}
function sockMock(){const sent=[];return{sent,async sendMessage(jid,payload){sent.push({jid,payload});return{key:{id:`m${sent.length}`}};}};}
function msg(chat,user,text){return{key:{remoteJid:chat,participant:user,fromMe:false},message:{conversation:text}};}
function extra(chat,user,sock,{admin=false,name='Groupe'}={}){return{from:chat,sender:user,isGroup:true,isAdmin:admin,isOwner:false,isSupremeOwner:false,groupMetadata:{subject:name},phrases:{footer:()=>'> test'},reply:async text=>sock.sendMessage(chat,{text})};}
function fresh(root){tournamentMod.tournaments.root=root;tournamentMod.tournaments.resetForTests();delete require.cache[require.resolve('../commands/games_entertainment/tourney')];return require('../commands/games_entertainment/tourney');}

test('WhatsApp tournoi: création et join réservés aux admins',async()=>{
  const cmd=fresh(temp()),sock=sockMock(),g='g@g.us',u='u@s.whatsapp.net';
  await sessionContext.run('tw-admin',async()=>{await cmd.execute(sock,msg(g,u,'.tourney create general 3'),['create','general','3'],extra(g,u,sock,{admin:false}));assert.match(sock.sent.at(-1).payload.text,/réservée aux admins/i);await cmd.execute(sock,msg(g,u,'.tourney create general 3'),['create','general','3'],extra(g,u,sock,{admin:true,name:'Alpha'}));assert.match(sock.sent.at(-1).payload.text,/TOURNOI CRÉÉ/i);});
});

test('WhatsApp tournoi: deux sessions/groupes parcourent le même Quiz Race',async()=>{
  const cmd=fresh(temp()),sock=sockMock(),ga='ga@g.us',gb='gb@g.us',ua='a@s.whatsapp.net',ub='b@s.whatsapp.net';let code;
  await sessionContext.run('tw-A',async()=>{await cmd.execute(sock,msg(ga,ua,'.tourney create anime 3'),['create','anime','3'],extra(ga,ua,sock,{admin:true,name:'Alpha'}));code=(sock.sent.at(-1).payload.text.match(/#([a-f0-9]{12})/)||[])[1];assert.ok(code);});
  await sessionContext.run('tw-B',async()=>{await cmd.execute(sock,msg(gb,ub,`.tourney join #${code}`),['join',`#${code}`],extra(gb,ub,sock,{admin:true,name:'Beta'}));assert.match(sock.sent.at(-1).payload.text,/rejoint/i);});
  await sessionContext.run('tw-A',async()=>{await cmd.execute(sock,msg(ga,ua,`.tourney start #${code}`),['start',`#${code}`],extra(ga,ua,sock,{admin:true,name:'Alpha'}));assert.match(sock.sent.at(-1).payload.text,/LANCÉ/i);await cmd.execute(sock,msg(ga,ua,`.tourney next #${code}`),['next',`#${code}`],extra(ga,ua,sock,{name:'Alpha'}));assert.match(sock.sent.at(-1).payload.text,/QUIZ RACE/);});
  await sessionContext.run('tw-B',async()=>{await cmd.execute(sock,msg(gb,ub,`.tourney next #${code}`),['next',`#${code}`],extra(gb,ub,sock,{name:'Beta'}));assert.match(sock.sent.at(-1).payload.text,/QUIZ RACE/);});
});

test('WhatsApp tournoi: groupe intrus ne peut demander une question',async()=>{
  const cmd=fresh(temp()),sock=sockMock(),ga='ga@g.us',gb='gb@g.us',u='a@s.whatsapp.net';let code;
  await sessionContext.run('tw-intruder',async()=>{await cmd.execute(sock,msg(ga,u,'.tourney create general 3'),['create','general','3'],extra(ga,u,sock,{admin:true,name:'A'}));code=(sock.sent.at(-1).payload.text.match(/#([a-f0-9]{12})/)||[])[1];tournamentMod.tournaments.join(code,{chatId:'joined@g.us',groupName:'J'});tournamentMod.tournaments.start(code,{chatId:ga,userId:u});await cmd.execute(sock,msg(gb,u,`.tourney next #${code}`),['next',`#${code}`],extra(gb,u,sock,{name:'Intrus'}));assert.match(sock.sent.at(-1).payload.text,/pas inscrit/i);});
});
