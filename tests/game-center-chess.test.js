'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sessionContext=require('../utils/sessionContext');
const profileMod=require('../utils/gameCenterProfiles');
const {GameCenterEngine}=require('../utils/gameCenterEngine');
require('../utils/gameCenterChess');
const {chessFromState}=require('../utils/gameCenterChess');

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'dipper-chess-'));}
function run(sid,fn){return sessionContext.run(sid,fn);}
function setup(){const root=temp();profileMod.profiles.root=root;profileMod.profiles.sessions.clear();return{root,e:new GameCenterEngine({root})};}

test('Échecs: création, joueurs et tours sont stricts',()=>{
  const {e}=setup();run('chess-turns',()=>{
    assert.equal(e.startChess('g@g.us','w','w').error,'opponent');
    const g=e.startChess('g@g.us','w','b');assert.ok(g.id);assert.equal(g.white,'w');assert.equal(g.black,'b');
    assert.equal(e.playChessMove('g@g.us','x','e4',g.alias).reason,'not-player');
    assert.equal(e.playChessMove('g@g.us','b','e5',g.alias).reason,'turn');
    const r=e.playChessMove('g@g.us','w','e2e4',g.alias);assert.equal(r.ok,true);assert.equal(r.move.san,'e4');assert.equal(r.next,'b');
    assert.equal(e.playChessMove('g@g.us','w','Nf3',g.alias).reason,'turn');
  });
});

test('Échecs: coups illégaux ne modifient pas la position',()=>{
  const {e}=setup();run('chess-illegal',()=>{
    const g=e.startChess('g@g.us','w','b');const before=e.chessView('g@g.us',g.alias).game.fen;
    const r=e.playChessMove('g@g.us','w','e2e5',g.alias);assert.equal(r.reason,'illegal');assert.equal(e.chessView('g@g.us',g.alias).game.fen,before);
  });
});

test('Échecs: mat du berger inversé/Fool mate détecté et récompensé une fois',()=>{
  const {e}=setup();run('chess-mate',()=>{
    const beforeW=profileMod.profiles.get('w').coins,beforeB=profileMod.profiles.get('b').coins;
    const g=e.startChess('g@g.us','w','b');
    assert.equal(e.playChessMove('g@g.us','w','f3',g.alias).finished,false);
    assert.equal(e.playChessMove('g@g.us','b','e5',g.alias).finished,false);
    assert.equal(e.playChessMove('g@g.us','w','g4',g.alias).finished,false);
    const mate=e.playChessMove('g@g.us','b','Qh4#',g.alias);assert.equal(mate.finished,true);assert.equal(mate.result.type,'checkmate');assert.equal(mate.game.winner,'b');
    assert.equal(profileMod.profiles.get('b').coins,beforeB+40);assert.equal(profileMod.profiles.get('w').coins,beforeW);
    assert.equal(e.playChessMove('g@g.us','b','Qh4#',g.alias).handled,false);
  });
});

test('Échecs: triple répétition survit à la reconstruction par historique SAN',()=>{
  const {e}=setup();run('chess-threefold',()=>{
    const g=e.startChess('g@g.us','w','b');let r;
    const seq=[['w','Nf3'],['b','Nf6'],['w','Ng1'],['b','Ng8'],['w','Nf3'],['b','Nf6'],['w','Ng1'],['b','Ng8']];
    for(const [u,m] of seq)r=e.playChessMove('g@g.us',u,m,g.alias);
    assert.equal(r.finished,true);assert.equal(r.result.type,'threefold');assert.equal(r.result.winner,null);
  });
});

test('Échecs: état persiste et se reconstruit après nouveau moteur',()=>{
  const {root,e}=setup();run('chess-persist',()=>{
    const g=e.startChess('g@g.us','w','b');e.playChessMove('g@g.us','w','e4',g.alias);e.playChessMove('g@g.us','b','c5',g.alias);
    const e2=new GameCenterEngine({root});const view=e2.chessView('g@g.us',g.alias);assert.ok(view);assert.equal(view.turn,'w');assert.equal(view.game.moves.length,2);assert.equal(chessFromState(view.game).history().join(' '),'e4 c5');
  });
});

test('Échecs: abandon règle une seule fois les profils',()=>{
  const {e}=setup();run('chess-resign',()=>{
    const before=profileMod.profiles.get('w').coins,g=e.startChess('g@g.us','w','b');
    const r=e.resignChess('g@g.us','b',g.alias);assert.equal(r.ok,true);assert.equal(r.winner,'w');assert.equal(profileMod.profiles.get('w').coins,before+40);assert.equal(e.resignChess('g@g.us','b',g.alias).error,'not-found');
  });
});

test('Échecs: isolation multi-session',()=>{
  const {e}=setup();run('chess-s1',()=>assert.ok(e.startChess('g@g.us','a','b').id));run('chess-s2',()=>assert.ok(e.startChess('g@g.us','c','d').id));
  run('chess-s1',()=>assert.equal(e.chessView('g@g.us').game.white,'a'));run('chess-s2',()=>assert.equal(e.chessView('g@g.us').game.white,'c'));
});

test('Stress échecs: 1000 ouvertures légales multi-session',()=>{
  const {e}=setup();let ops=0;
  for(let s=0;s<20;s++)run(`chess-stress-${s}`,()=>{
    for(let i=0;i<50;i++){
      const chat=`c${i}@g.us`,g=e.startChess(chat,'w','b');assert.ok(g.id);
      assert.equal(e.playChessMove(chat,'w','e4',g.alias).ok,true);assert.equal(e.playChessMove(chat,'b','e5',g.alias).ok,true);ops++;
    }
  });assert.equal(ops,1000);
});
