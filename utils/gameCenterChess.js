'use strict';

const {Chess}=require('chess.js');
const sessionContext=require('./sessionContext');
const {GameCenterEngine}=require('./gameCenterEngine');
const {profiles}=require('./gameCenterProfiles');

const MAX_CHESS_PLIES=300;
const PIECES={wp:'♙',wn:'♘',wb:'♗',wr:'♖',wq:'♕',wk:'♔',bp:'♟',bn:'♞',bb:'♝',br:'♜',bq:'♛',bk:'♚'};
function sid(){return sessionContext.getCurrentSessionId();}
function clone(v){return JSON.parse(JSON.stringify(v));}
function live(engine,g){return engine.games.get(`${sid()}::${g.id}`);}
function playerFor(state,color){return color==='w'?state.white:state.black;}
function colorFor(state,userId){return userId===state.white?'w':userId===state.black?'b':null;}
function chessFromState(state){
  const chess=new Chess();
  for(const san of state.moves||[]){try{chess.move(san);}catch(error){throw new Error(`CHESS_CORRUPT_HISTORY:${san}`);}}
  return chess;
}
function renderBoard(chess){
  const rows=chess.board();
  const lines=rows.map((row,i)=>`${8-i} ${row.map(p=>p?PIECES[`${p.color}${p.type}`]:'·').join(' ')}`);
  lines.push('  a b c d e f g h');
  return lines.join('\n');
}
function gameResult(chess){
  if(chess.isCheckmate())return{over:true,type:'checkmate',winner:chess.turn()==='w'?'b':'w'};
  if(chess.isStalemate())return{over:true,type:'stalemate',winner:null};
  if(chess.isThreefoldRepetition())return{over:true,type:'threefold',winner:null};
  if(chess.isInsufficientMaterial())return{over:true,type:'insufficient',winner:null};
  if(chess.isDraw())return{over:true,type:'draw',winner:null};
  return{over:false,type:null,winner:null};
}
function rewardResult(state,result){
  if(result.winner){const winner=playerFor(state,result.winner),loser=playerFor(state,result.winner==='w'?'b':'w');profiles.recordResult(winner,'win',{xp:50,coins:40});profiles.recordResult(loser,'loss',{xp:10,coins:0});}
  else{profiles.recordResult(state.white,'draw',{xp:15,coins:10});profiles.recordResult(state.black,'draw',{xp:15,coins:10});}
}

if(typeof GameCenterEngine.prototype.startChess!=='function'){
  GameCenterEngine.prototype.startChess=function(chatId,by,opponent){
    if(!opponent||opponent===by)return{error:'opponent'};
    const error=this._startGuard(chatId,'chess');if(error)return{error};
    const ids=this._newIdentity('chess'),chess=new Chess();
    return this._put({id:ids.id,alias:ids.alias,chatId,type:'chess',status:'playing',by,white:by,black:opponent,fen:chess.fen(),moves:[],plies:0,lastMove:null,startedAt:Date.now()});
  };
  GameCenterEngine.prototype.playChessMove=function(chatId,userId,input,ref=null){
    const g=this.get(chatId,ref,'chess');if(!g)return{handled:false};
    const state=live(this,g),color=colorFor(state,userId);if(!color)return{handled:true,ok:false,reason:'not-player',game:clone(state)};
    let chess;try{chess=chessFromState(state);}catch(_){return{handled:true,ok:false,reason:'corrupt',game:clone(state)};}
    if(chess.turn()!==color)return{handled:true,ok:false,reason:'turn',turn:playerFor(state,chess.turn()),game:clone(state)};
    const raw=String(input||'').trim();if(!raw)return{handled:true,ok:false,reason:'move',game:clone(state)};
    let move;try{move=chess.move(raw);}catch(_){return{handled:true,ok:false,reason:'illegal',game:clone(state)};}
    if(!move)return{handled:true,ok:false,reason:'illegal',game:clone(state)};
    state.moves=state.moves||[];state.moves.push(move.san);state.fen=chess.fen();state.plies=state.moves.length;state.lastMove={by:userId,san:move.san,from:move.from,to:move.to,ts:Date.now()};
    let result=gameResult(chess);
    if(!result.over&&state.plies>=MAX_CHESS_PLIES)result={over:true,type:'move-limit',winner:null};
    if(result.over){state.status='finished';state.finishedAt=Date.now();state.result=result;state.winner=result.winner?playerFor(state,result.winner):null;this._put(state);rewardResult(state,result);return{handled:true,ok:true,finished:true,result,move,board:renderBoard(chess),game:clone(state)};}
    this._put(state);return{handled:true,ok:true,finished:false,check:chess.inCheck(),move,board:renderBoard(chess),next:playerFor(state,chess.turn()),game:clone(state)};
  };
  GameCenterEngine.prototype.resignChess=function(chatId,userId,ref=null){
    const g=this.get(chatId,ref,'chess');if(!g)return{error:'not-found'};const state=live(this,g),color=colorFor(state,userId);if(!color)return{error:'not-player'};
    const winnerColor=color==='w'?'b':'w',result={over:true,type:'resignation',winner:winnerColor};state.status='finished';state.finishedAt=Date.now();state.result=result;state.winner=playerFor(state,winnerColor);this._put(state);rewardResult(state,result);return{ok:true,winner:state.winner,loser:userId,game:clone(state)};
  };
  GameCenterEngine.prototype.chessView=function(chatId,ref=null){const g=this.get(chatId,ref,'chess');if(!g)return null;let chess;try{chess=chessFromState(g);}catch(_){return{game:g,error:'corrupt'};}return{game:g,board:renderBoard(chess),turn:playerFor(g,chess.turn()),check:chess.inCheck()};};
}

module.exports={MAX_CHESS_PLIES,PIECES,renderBoard,gameResult,colorFor,playerFor,chessFromState};
