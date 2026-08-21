'use strict';

const styleManager = require('./styleManager');
const { THEMES } = require('./styleCatalog');
const { engine } = require('./gameCenterEngine');
const {
  GUESS_TYPES,clueQuestion,availableCategories,MAX_CLUE_ATTEMPTS
} = require('./gameCenterBlock4');

const SUPPORTED = new Set(['character','personnage','song','chanson','movie','film','screen','guessanime','guessnext','cluenext']);

function theme(){ return THEMES[styleManager.getStyle()] || THEMES[0]; }
function banner(label,emoji='🎮'){ return `${emoji} *${theme().botName} — ${label}*`; }
function labelForType(type){
  return ({
    'guess-character':'🎭 Devine le personnage',
    'guess-song':'🎵 Devine la chanson',
    'guess-screen':'🎬 Devine le film / anime'
  })[type] || null;
}
function menuLines(prefix){
  return [
    `${prefix}games character anime|film|game|mix [manches] → 🎭 Devine le personnage`,
    `${prefix}games song anime|international|mix [manches] → 🎵 Devine la chanson`,
    `${prefix}games movie anime|film|mix [manches] → 🎬 Devine le film / anime`,
    `${prefix}games guessnext [#id] → ⏭️ Révéler et passer l’indice`
  ];
}
function plausibleGuess(input){
  const value=String(input||'').trim();
  if(!value||/^(vote\b|\+\s)/i.test(value)||/^\d+$/.test(value))return false;
  return /[a-zA-ZÀ-ÿ]/.test(value)&&value.replace(/\s+/g,'').length>=2;
}
function candidateTypes(rows,input){
  if(!plausibleGuess(input))return [];
  return rows.filter(g=>GUESS_TYPES.has(g.type)).map(g=>g.type);
}
function formatRanking(rows=[],tag=x=>x){
  if(!rows.length)return 'Aucun point marqué.';
  return rows.slice(0,10).map(r=>`${r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':'▫️'} ${tag(r.userId)} — *${r.score}*`).join('\n');
}
function formatClue(game){
  const q=clueQuestion(game);
  if(!q)return `${banner('DEVINE','🧩')}\n\nIndice indisponible.`;
  const meta={
    character:{title:'DEVINE LE PERSONNAGE',emoji:'🎭',instruction:'Envoie le nom du personnage.'},
    song:{title:'DEVINE LA CHANSON',emoji:'🎵',instruction:'Envoie le titre de la chanson.'},
    screen:{title:'DEVINE LE FILM / ANIME',emoji:'🎬',instruction:'Envoie le titre du film ou de l’anime.'}
  }[game.kind]||{title:'DEVINE',emoji:'🧩',instruction:'Envoie ta réponse.'};
  return [
    banner(meta.title,meta.emoji),'',
    `📚 Catégorie : *${String(game.category||'mix').toUpperCase()}*`,
    `🎯 Manche : *${game.round}/${game.rounds}*`,`🆔 #${game.alias}`,'',
    `Indice : *${q.clue}*`,'',meta.instruction,
    `Maximum : *${MAX_CLUE_ATTEMPTS}* essais différents par joueur et par manche.`
  ].join('\n');
}
function canManage(game,sender,extra){ return Boolean(extra.isAdmin||extra.isOwner||extra.isSupremeOwner||game?.by===sender); }
function parseConfig(args,index,kind,forcedCategory=null){
  const allowed=new Set(availableCategories(kind));
  if(forcedCategory)return {category:forcedCategory,rounds:Number(args[index])||3};
  const raw=String(args[index]||'').toLowerCase();
  if(allowed.has(raw))return {category:raw,rounds:Number(args[index+1])||3};
  if(/^\d+$/.test(raw))return {category:'mix',rounds:Number(raw)||3};
  return {category:'mix',rounds:3,invalid:raw?true:false};
}

async function handleIncoming(sock,msg,extra,ctx){
  const {from,sender,cleaned,ref,sep,tag}=ctx;
  if(!plausibleGuess(cleaned))return false;
  const result=engine.answerClueGame(from,sender,cleaned,ref);
  if(!result.handled)return false;
  let text;
  if(!result.ok&&result.reason==='duplicate')text=`♻️ ${tag(sender)}, tu as déjà essayé cette réponse. #${result.game.alias}`;
  else if(!result.ok&&result.reason==='limit')text=`⛔ ${tag(sender)}, tu as atteint la limite de *${MAX_CLUE_ATTEMPTS}* essais pour cette manche. #${result.game.alias}`;
  else if(!result.correct)text=`❌ Pas encore.${result.hint?`\n💡 Indice supplémentaire : *${result.hint}*`:''}\n🎯 Essais restants pour toi : *${result.attemptsLeft}*\n#${result.game.alias}`;
  else if(result.finished)text=[banner('PARTIE TERMINÉE','🏆'),'',`✅ Réponse : *${result.answerText}*`,'',formatRanking(result.ranking,tag)].join('\n');
  else text=[`✅ *${tag(sender)} trouve la bonne réponse !*`,`Réponse : *${result.answerText}*`,'',formatClue(result.game)].join('\n');
  await sock.sendMessage(from,{text:text+sep(),mentions:[sender,...(result.ranking||[]).map(r=>r.userId)]},{quoted:msg});
  return true;
}

async function handleSubcommand(sock,msg,args,extra,{prefix,sep,tag}){
  const from=extra.from, sender=extra.sender, sub=String(args[0]||'').toLowerCase();
  let kind=null, forcedCategory=null;
  if(['character','personnage'].includes(sub))kind='character';
  if(['song','chanson'].includes(sub))kind='song';
  if(['movie','film','screen'].includes(sub))kind='screen';
  if(sub==='guessanime'){ kind='screen'; forcedCategory='anime'; }

  if(kind){
    const cfg=parseConfig(args,1,kind,forcedCategory);
    if(cfg.invalid){
      const choices=availableCategories(kind).join(', ');
      return extra.reply(`❌ Catégorie inconnue. Choisis : *${choices}*.${sep()}`);
    }
    const g=engine.startClueGame(from,sender,{kind,category:cfg.category,rounds:cfg.rounds});
    if(g.error==='category')return extra.reply(`❌ Catégorie indisponible pour ce jeu.${sep()}`);
    if(g.error)return extra.reply(`⚠️ Une partie identique est déjà active ou la limite de parties est atteinte.${sep()}`);
    return extra.reply(formatClue(g)+sep());
  }

  if(sub==='guessnext'||sub==='cluenext'){
    const ref=String(args[1]||'').replace(/^#/,'')||null;
    const games=engine.list(from).filter(g=>GUESS_TYPES.has(g.type));
    if(!games.length)return extra.reply(`❌ Aucun jeu « Devine… » actif.${sep()}`);
    if(!ref&&games.length>1)return extra.reply(`⚠️ Plusieurs jeux « Devine… » sont actifs. Indique l’ID : *${prefix}games guessnext #ID*.${sep()}`);
    const g=ref?engine.get(from,ref):(games[0]||null);
    if(!g||!GUESS_TYPES.has(g.type))return extra.reply(`❌ Partie « Devine… » introuvable.${sep()}`);
    if(!canManage(g,sender,extra))return extra.reply(`🔒 Seul le créateur ou un admin peut révéler la réponse et passer.${sep()}`);
    const result=engine.skipClueGame(from,g.alias);
    if(result.finished)return sock.sendMessage(from,{text:[banner('PARTIE TERMINÉE','🏁'),'',`✅ Réponse révélée : *${result.answerText}*`,'',formatRanking(result.ranking,tag)].join('\n')+sep(),mentions:(result.ranking||[]).map(r=>r.userId)},{quoted:msg});
    return extra.reply(`⏭️ Réponse révélée : *${result.answerText}*\n\n${formatClue(result.game)}${sep()}`);
  }

  return null;
}

module.exports={SUPPORTED,menuLines,candidateTypes,plausibleGuess,handleIncoming,handleSubcommand,labelForType,banner,formatClue,canManage,parseConfig};
