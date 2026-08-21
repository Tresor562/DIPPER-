'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const {uno}=require('../utils/gameCenterUno');
const {werewolf}=require('../utils/gameCenterWerewolf');
const {tournaments}=require('../utils/gameCenterTournament');
const profileMod=require('../utils/gameCenterProfiles');

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-games-menu-'));}
function sockMock(){const sent=[];return{sent,user:{id:'bot@s.whatsapp.net'},async sendMessage(jid,payload){sent.push({jid,payload});return{key:{id:`m${sent.length}`}};}};}
function msg(chat,user,text,mentions=[]){const contextInfo=mentions.length?{mentionedJid:mentions}:undefined;return{key:{remoteJid:chat,participant:user,fromMe:false},message:contextInfo?{extendedTextMessage:{text,contextInfo}}:{conversation:text}};}
function extra(chat,user,sock,{admin=false,name='Test'}={}){return{from:chat,sender:user,isGroup:true,isAdmin:admin,isOwner:false,isSupremeOwner:false,groupMetadata:{subject:name,participants:[]},phrases:{footer:()=>'> test'},reply:async text=>sock.sendMessage(chat,{text})};}
function fresh(){const root=temp();uno.root=root;uno.sessions.clear();werewolf.root=root;werewolf.sessions.clear();tournaments.root=path.join(root,'competitions');tournaments.resetForTests();profileMod.profiles.root=root;profileMod.profiles.sessions.clear();for(const p of ['../commands/games_entertainment/gamecenter','../utils/gameCenterEngine'].map(require.resolve))delete require.cache[p];const engineMod=require('../utils/gameCenterEngine');engineMod.engine.root=root;engineMod.engine.games.clear();engineMod.engine._loadedSessions.clear();return require('../commands/games_entertainment/gamecenter');}

test('Menu central expose tous les moteurs avancés',()=>{const cmd=fresh(),text=cmd.menuText();for(const word of ['casino','rpg','hangman','objectzoom','chess','uno','wolf','tourney'])assert.match(text,new RegExp(word,'i'));});

test('games casino délègue vers le vrai menu casino',async()=>{const cmd=fresh(),sock=sockMock(),chat='g@g.us',user='u@s.whatsapp.net';await sessionContext.run('menu-casino',async()=>{await cmd.execute(sock,msg(chat,user,'.games casino'),['casino'],extra(chat,user,sock));assert.match(sock.sent.at(-1).payload.text,/CASINO|ARCADE/i);assert.match(sock.sent.at(-1).payload.text,/virtuelle|virtuel/i);});});

test('games uno create délègue et list affiche UNO',async()=>{const cmd=fresh(),sock=sockMock(),chat='uno@g.us',user='u@s.whatsapp.net';await sessionContext.run('menu-uno',async()=>{await cmd.execute(sock,msg(chat,user,'.games uno create'),['uno','create'],extra(chat,user,sock));assert.ok(uno.get(chat));await cmd.execute(sock,msg(chat,user,'.games list'),['list'],extra(chat,user,sock));assert.match(sock.sent.at(-1).payload.text,/UNO/i);});});

test('games wolf create délègue et list affiche Loup-Garou',async()=>{const cmd=fresh(),sock=sockMock(),chat='wolf@g.us',user='u@s.whatsapp.net';await sessionContext.run('menu-wolf',async()=>{await cmd.execute(sock,msg(chat,user,'.games wolf create'),['wolf','create'],extra(chat,user,sock));assert.ok(werewolf.get(chat));await cmd.execute(sock,msg(chat,user,'.games list'),['list'],extra(chat,user,sock));assert.match(sock.sent.at(-1).payload.text,/Loup-Garou/i);});});

test('games stopall admin arrête moteur + UNO + Loup-Garou',async()=>{const cmd=fresh(),sock=sockMock(),chat='all@g.us',user='u@s.whatsapp.net';await sessionContext.run('menu-stopall',async()=>{cmd.engine.startPrefer(chat,user);uno.create(chat,user);werewolf.create(chat,user);assert.ok(cmd.engine.list(chat).length);assert.ok(uno.get(chat));assert.ok(werewolf.get(chat));await cmd.execute(sock,msg(chat,user,'.games stopall'),['stopall'],extra(chat,user,sock,{admin:true}));assert.equal(cmd.engine.list(chat).length,0);assert.equal(uno.get(chat),null);assert.equal(werewolf.get(chat),null);assert.match(sock.sent.at(-1).payload.text,/3 partie/i);});});

test('games tourney délègue vers aide tournoi',async()=>{const cmd=fresh(),sock=sockMock(),chat='t@g.us',user='u@s.whatsapp.net';await sessionContext.run('menu-tourney',async()=>{await cmd.execute(sock,msg(chat,user,'.games tourney'),['tourney'],extra(chat,user,sock));assert.match(sock.sent.at(-1).payload.text,/TOURNOI INTERGROUPES/i);});});
