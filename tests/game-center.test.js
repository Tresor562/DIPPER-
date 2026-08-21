'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const {GameCenterEngine,MAX_COMPLETED_PER_GROUP,MAX_COMPLETED_PER_SESSION,TTL_MS}=require('../utils/gameCenterEngine');

function temp(){ return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-game-center-')); }
function run(sid,fn){ return sessionContext.run(sid,fn); }

test('isole strictement sessions et groupes',()=>{
  const root=temp(), e=new GameCenterEngine({root});
  run('bot-a',()=>{ e.startPrefer('group-1@g.us','u1'); e.startChain('group-2@g.us','u1'); });
  run('bot-b',()=>{ e.startGuessNumber('group-1@g.us','u2'); });
  run('bot-a',()=>{ assert.equal(e.list('group-1@g.us').length,1); assert.equal(e.list('group-2@g.us').length,1); });
  run('bot-b',()=>{ assert.equal(e.list('group-1@g.us').length,1); assert.equal(e.list('group-1@g.us')[0].type,'guess-number'); });
});

test('persistance atomique et rechargement',()=>{
  const root=temp();
  run('persist',()=>{
    const e1=new GameCenterEngine({root}); const g=e1.startPrefer('p@g.us','u'); e1.votePrefer('p@g.us','u1','1',g.alias);
    const e2=new GameCenterEngine({root}); const loaded=e2.get('p@g.us',g.alias,'prefer'); assert.equal(loaded.votes.u1,0);
  });
});

test('tu préfères remplace le vote, sans double comptage',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('vote',()=>{ const g=e.startPrefer('g@g.us','a'); let r=e.votePrefer('g@g.us','u','1',g.alias); assert.deepEqual(r.counts,[1,0]); r=e.votePrefer('g@g.us','u','2',g.alias); assert.deepEqual(r.counts,[0,1]); });
});

test('mot en chaîne applique lettre et unicité',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('chain',()=>{ const g=e.startChain('g@g.us','a'); const expected=g.lastWord.slice(-1); const good=expected+'test'+expected; let r=e.playChain('g@g.us','u',good,g.alias); assert.equal(r.ok,true); r=e.playChain('g@g.us','u',good,g.alias); assert.equal(r.reason,'used'); });
});

test('ni oui ni non ignore sous-chaînes et élimine mots entiers',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('nyn',()=>{ e.startNoYesNo('g@g.us','a'); assert.equal(e.inspectNoYesNo('g@g.us','u','nouille').handled,false); const r=e.inspectNoYesNo('g@g.us','u','je dis OUI !'); assert.equal(r.eliminated,true); assert.equal(r.word,'oui'); assert.equal(e.inspectNoYesNo('g@g.us','u','non').handled,false); });
});

test('devine le nombre: bornes, indices, victoire',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('number',()=>{ const g=e.startGuessNumber('g@g.us','a',{min:10,max:20}); const live=e.get('g@g.us',g.alias,'guess-number'); assert.equal(e.guessNumber('g@g.us','u','9',g.alias).reason,'range'); const target=live.target; if(target>10) assert.equal(e.guessNumber('g@g.us','u',String(target-1),g.alias).hint,'higher'); const win=e.guessNumber('g@g.us','u',String(target),g.alias); assert.equal(win.won,true); assert.equal(e.get('g@g.us',g.alias,'guess-number'),null); });
});

test('morpion: tours, case occupée et victoire',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('ttt',()=>{
    const g=e.startTicTacToe('g@g.us','x@s.whatsapp.net','o@s.whatsapp.net');
    assert.equal(e.playTicTacToe('g@g.us','o@s.whatsapp.net','1',g.alias).reason,'turn');
    assert.equal(e.playTicTacToe('g@g.us','x@s.whatsapp.net','1',g.alias).ok,true);
    assert.equal(e.playTicTacToe('g@g.us','o@s.whatsapp.net','1',g.alias).reason,'occupied');
    e.playTicTacToe('g@g.us','o@s.whatsapp.net','4',g.alias);
    e.playTicTacToe('g@g.us','x@s.whatsapp.net','2',g.alias);
    e.playTicTacToe('g@g.us','o@s.whatsapp.net','5',g.alias);
    const win=e.playTicTacToe('g@g.us','x@s.whatsapp.net','3',g.alias);
    assert.equal(win.won,true); assert.equal(win.game.winner,'x@s.whatsapp.net');
    assert.equal(e.get('g@g.us',g.alias,'tic-tac-toe'),null);
  });
});

test('morpion refuse adversaire absent ou soi-même',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('ttt-guard',()=>{ assert.equal(e.startTicTacToe('g@g.us','x','x').error,'opponent'); assert.equal(e.startTicTacToe('g@g.us','x',null).error,'opponent'); });
});

test('anti-spam: une seule partie active de chaque type par groupe',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('guard',()=>{ assert.ok(!e.startPrefer('g@g.us','u').error); assert.equal(e.startPrefer('g@g.us','u').error,'duplicate'); assert.ok(!e.startChain('g@g.us','u').error); assert.equal(e.startChain('g@g.us','u').error,'duplicate'); });
});

test('identifiants cryptographiques: alias 96 bits uniques et sans Math.random',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('crypto-ids',()=>{
    const aliases=new Set(), ids=new Set();
    for(let i=0;i<128;i++){
      const g=e.startPrefer(`crypto-${i}@g.us`,'owner');
      assert.match(g.alias,/^[0-9a-f]{12}$/);
      assert.ok(g.id.endsWith(`_${g.alias}`));
      aliases.add(g.alias); ids.add(g.id);
    }
    assert.equal(aliases.size,128); assert.equal(ids.size,128);
  });
});

test('rétention: historique terminé borné par groupe et persistance bornée',()=>{
  const root=temp(), e=new GameCenterEngine({root});
  run('bounded-group',()=>{
    const chat='history@g.us';
    for(let i=0;i<MAX_COMPLETED_PER_GROUP+25;i++){
      const g=e.startPrefer(chat,'owner'); e.stop(chat,g.alias);
    }
    const rows=e.list(chat,{activeOnly:false});
    assert.equal(rows.length,MAX_COMPLETED_PER_GROUP);
    assert.ok(rows.every(g=>g.status==='stopped'));
    const persisted=JSON.parse(fs.readFileSync(path.join(root,'bounded-group','games.json'),'utf8'));
    assert.equal(persisted.version,2); assert.equal(persisted.games.length,MAX_COMPLETED_PER_GROUP);
  });
});

test('rétention: historique terminé borné globalement par session sans toucher aux actifs',()=>{
  const root=temp(), e=new GameCenterEngine({root});
  run('bounded-session',()=>{
    for(let i=0;i<MAX_COMPLETED_PER_SESSION+20;i++){
      const chat=`archive-${i}@g.us`, g=e.startPrefer(chat,'owner'); e.stop(chat,g.alias);
    }
    const active=e.startPrefer('active@g.us','owner');
    const rows=[...e.games.entries()].filter(([k])=>k.startsWith('bounded-session::')).map(([,g])=>g);
    assert.equal(rows.filter(g=>g.status!=='playing').length,MAX_COMPLETED_PER_SESSION);
    assert.equal(rows.filter(g=>g.status==='playing').length,1);
    assert.ok(e.get('active@g.us',active.alias,'prefer'));
    const persisted=JSON.parse(fs.readFileSync(path.join(root,'bounded-session','games.json'),'utf8'));
    assert.equal(persisted.games.length,MAX_COMPLETED_PER_SESSION+1);
  });
});

test('cleanup expire les parties abandonnées puis les conserve comme historique borné',()=>{
  const e=new GameCenterEngine({root:temp()});
  run('expiry',()=>{
    const g=e.startPrefer('expire@g.us','owner');
    const live=e.games.get(`expiry::${g.id}`); live.updatedAt=Date.now()-TTL_MS-1000;
    e.cleanup();
    assert.equal(e.list('expire@g.us').length,0);
    const archived=e.list('expire@g.us',{activeOnly:false});
    assert.equal(archived.length,1); assert.equal(archived[0].status,'expired'); assert.ok(archived[0].expiredAt);
  });
});

test('stress déterministe: 10 000 opérations réparties entre groupes/sessions',()=>{
  const e=new GameCenterEngine({root:temp()}); let operations=0;
  for(let s=0;s<10;s++) run(`s${s}`,()=>{ for(let g=0;g<10;g++){ const chat=`g${g}@g.us`; const game=e.startPrefer(chat,'owner'); for(let u=0;u<100;u++){ const r=e.votePrefer(chat,`u${u}@s.whatsapp.net`,String((u%2)+1),game.alias); assert.equal(r.handled,true); operations++; } }});
  assert.equal(operations,10000);
  run('s0',()=>assert.equal(e.list('g0@g.us').length,1));
  run('s9',()=>assert.equal(e.list('g9@g.us').length,1));
});
