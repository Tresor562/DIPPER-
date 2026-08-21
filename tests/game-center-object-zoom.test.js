'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sharp=require('sharp');
const sessionContext=require('../utils/sessionContext');
const {GameCenterEngine}=require('../utils/gameCenterEngine');
const profileMod=require('../utils/gameCenterProfiles');
const {makeZoomBuffer,MAX_OBJECT_ATTEMPTS_PER_PLAYER}=require('../utils/gameCenterObjectZoom');
const {imageMessageFrom,downloadImageBuffer}=require('../utils/gameCenterObjectMedia');

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-object-zoom-'));}
function run(sid,fn){return sessionContext.run(sid,fn);}
function setup(){const root=temp();profileMod.profiles.root=root;profileMod.profiles.sessions.clear();return{root,e:new GameCenterEngine({root})};}

test('Objet zoomé: crop réel produit un JPEG carré 640x640',async()=>{
  const source=await sharp({create:{width:1200,height:800,channels:3,background:{r:40,g:120,b:200}}}).png().toBuffer();
  const out=await makeZoomBuffer(source,{ratio:0.3,size:640});
  const meta=await sharp(out).metadata();
  assert.equal(meta.width,640);assert.equal(meta.height,640);assert.equal(meta.format,'jpeg');
});

test('Objet zoomé: image invalide refusée',async()=>{
  await assert.rejects(()=>makeZoomBuffer(Buffer.from('bad')),/INVALID_MEDIA/);
});

test('Média objet: image directe et image citée reconnues',()=>{
  const direct={message:{imageMessage:{mimetype:'image/jpeg'}}};
  assert.equal(imageMessageFrom(direct).mimetype,'image/jpeg');
  const quoted={message:{extendedTextMessage:{contextInfo:{quotedMessage:{imageMessage:{mimetype:'image/png'}}}}}};
  assert.equal(imageMessageFrom(quoted).mimetype,'image/png');
});

test('Média objet: téléchargement borné collecte le flux',async()=>{
  async function* downloader(){yield Buffer.from('abc');yield Buffer.from('def');}
  const buf=await downloadImageBuffer({fileLength:6},{downloader,maxBytes:10});
  assert.equal(buf.toString(),'abcdef');
});

test('Média objet: flux trop lourd interrompu',async()=>{
  async function* downloader(){yield Buffer.alloc(8);yield Buffer.alloc(8);}
  await assert.rejects(()=>downloadImageBuffer({},{downloader,maxBytes:10}),/TOO_LARGE/);
});

test('Objet zoomé: hôte exclu, doublons et limite par joueur',()=>{
  const {e}=setup();run('object-flow',()=>{
    const g=e.startObjectZoom('g@g.us','host','Téléphone portable');assert.ok(g.id);
    assert.equal(e.guessObjectZoom('g@g.us','host','téléphone portable',g.alias).reason,'host');
    let r=e.guessObjectZoom('g@g.us','u','radio',g.alias);assert.equal(r.won,false);
    assert.equal(e.guessObjectZoom('g@g.us','u','radio',g.alias).reason,'duplicate');
    for(let i=1;i<MAX_OBJECT_ATTEMPTS_PER_PLAYER;i++)e.guessObjectZoom('g@g.us','u',`x${i}`,g.alias);
    assert.equal(e.guessObjectZoom('g@g.us','u','encore',g.alias).reason,'limit');
  });
});

test('Objet zoomé: victoire récompensée une seule fois',()=>{
  const {e}=setup();run('object-win',()=>{
    const before=profileMod.profiles.get('u').coins;const g=e.startObjectZoom('g@g.us','host','Clavier mécanique');
    const r=e.guessObjectZoom('g@g.us','u','clavier mecanique',g.alias);assert.equal(r.won,true);assert.equal(r.answer,'Clavier mécanique');
    const p=profileMod.profiles.get('u');assert.equal(p.coins,before+30);assert.equal(p.xp,40);assert.equal(p.wins,1);
    assert.equal(e.guessObjectZoom('g@g.us','u','clavier mecanique',g.alias).handled,false);assert.equal(profileMod.profiles.get('u').coins,before+30);
  });
});

test('Objet zoomé: isolation multi-session',()=>{
  const {e}=setup();
  run('object-s1',()=>assert.ok(e.startObjectZoom('g@g.us','h1','souris').id));
  run('object-s2',()=>assert.ok(e.startObjectZoom('g@g.us','h2','ecran').id));
  run('object-s1',()=>assert.equal(e.get('g@g.us',null,'object-zoom').answer,'souris'));
  run('object-s2',()=>assert.equal(e.get('g@g.us',null,'object-zoom').answer,'ecran'));
});

test('Stress Objet zoomé: 2000 parties indépendantes',()=>{
  const {e}=setup();let ops=0;
  for(let s=0;s<20;s++)run(`object-stress-${s}`,()=>{
    for(let i=0;i<100;i++){
      const chat=`o${i}@g.us`,g=e.startObjectZoom(chat,'host',`objet ${i}`);assert.ok(g.id);
      const r=e.guessObjectZoom(chat,'u',`objet ${i}`,g.alias);assert.equal(r.won,true);ops++;
    }
  });
  assert.equal(ops,2000);
});
