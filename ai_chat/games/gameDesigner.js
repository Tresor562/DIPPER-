'use strict';

function normalize(s=''){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}

function parseClock(text, now=new Date()) {
  const raw=normalize(text); const m=raw.match(/\b(?:a|vers)\s*(\d{1,2})(?:[:h](\d{2}))?\b/); if(!m)return null;
  const d=new Date(now); d.setSeconds(0,0); d.setHours(Math.min(23,Number(m[1])),Math.min(59,Number(m[2]||0)),0,0);
  if(/demain/.test(raw))d.setDate(d.getDate()+1); else if(/apres demain/.test(raw))d.setDate(d.getDate()+2); else if(d<=now)d.setDate(d.getDate()+1);
  return d.getTime();
}

function inferGameType(text=''){
  const t=normalize(text);
  if(/quiz|question/.test(t))return'quiz';
  if(/pendu/.test(t))return'hangman';
  if(/personnage mystere|devine.*personnage/.test(t))return'mystery-character';
  if(/action.*verite|verite.*action/.test(t))return'truth-or-dare';
  if(/elimination|battle royale|survivant/.test(t))return'elimination';
  if(/tournoi|bracket|duel/.test(t))return'tournament';
  return'custom';
}

function inferFormat(text=''){
  const t=normalize(text);
  if(/elimination directe|knockout|bracket/.test(t))return'knockout';
  if(/equipes?|team/.test(t))return'teams';
  if(/ligue|round robin|chacun contre/.test(t))return'league';
  if(/survie|survivant/.test(t))return'survival';
  return'points';
}

function inferRounds(text='',fallback=5){const t=normalize(text);const m=t.match(/(\d{1,3})\s*(?:manches?|rounds?|questions?)/);return Math.max(1,Math.min(200,Number(m?.[1]||fallback)));}
function inferMaxPlayers(text='',fallback=500){const t=normalize(text);const m=t.match(/(?:max(?:imum)?|jusqu a|pour)\s*(\d{1,4})\s*(?:joueurs?|participants?|personnes?|membres?)/);return Math.max(2,Math.min(5000,Number(m?.[1]||fallback)));}
function inferTeamCount(text='',fallback=2){const t=normalize(text);const m=t.match(/(\d{1,2})\s*equipes?/);return Math.max(2,Math.min(16,Number(m?.[1]||fallback)));}
function inferTheme(text=''){const raw=String(text);const m=raw.match(/(?:sur|theme|thème)\s+([\p{L}\p{N} _-]{3,80})(?=,|\.|\ba\s+\d|\bà\s+\d|$)/iu);if(m)return m[1].trim();if(/naruto/i.test(raw))return'Naruto';if(/anime/i.test(raw))return'anime';return'général';}

function buildRounds({gameType,rounds,theme}){
  return Array.from({length:rounds},(_,i)=>({id:`round_${i+1}`,name:`Manche ${i+1}`,type:gameType,status:'pending',theme,points:i<Math.ceil(rounds*.6)?1:i<rounds-1?2:3,timeLimitSec:gameType==='quiz'?30:60}));
}

function designFromText(text,{now=new Date(),by=null}={}){
  const gameType=inferGameType(text),format=inferFormat(text),rounds=inferRounds(text,gameType==='quiz'?10:5),theme=inferTheme(text),startAt=parseClock(text,now)||Date.now()+5*60*1000;
  const maxPlayers=inferMaxPlayers(text);const teamMode=format==='teams'||/equipes?|team/i.test(text);const teamCount=inferTeamCount(text);
  return {title:`${gameType==='quiz'?'Quiz':gameType==='tournament'?'Tournoi':'Jeu'} ${theme}`.trim(),description:String(text).slice(0,1000),theme,gameType,format,startAt,registrationOpensAt:Date.now()+1000,registrationClosesAt:startAt,maxPlayers,minPlayers:2,teamMode,teamCount,rounds:buildRounds({gameType,rounds,theme}),by,rewards:[{rank:1,label:'🥇 Champion',points:100},{rank:2,label:'🥈 Finaliste',points:60},{rank:3,label:'🥉 Top 3',points:35}],rules:['Respecter les réponses des autres joueurs.','Une seule participation par personne et par manche.','Les décisions automatiques utilisent les timestamps et scores enregistrés.']};
}

function describePlan(spec){return [`🎮 *${spec.title}*`,`Type : ${spec.gameType} • Format : ${spec.format}`,`Thème : ${spec.theme}`,`Début : ${new Date(spec.startAt).toLocaleString('fr-FR')}`,`Manches : ${spec.rounds.length}`,`Capacité : ${spec.maxPlayers} participants`,spec.teamMode?`Équipes : ${spec.teamCount}`:'Mode individuel',`Récompenses : ${spec.rewards.map(r=>`${r.rank}→${r.label}`).join(' | ')}`].join('\n');}

module.exports={parseClock,inferGameType,inferFormat,inferRounds,inferMaxPlayers,inferTeamCount,inferTheme,buildRounds,designFromText,describePlan};
