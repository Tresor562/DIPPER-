'use strict';

const config = require('../../config');
const styleManager = require('../../utils/styleManager');
const { engine } = require('../../utils/gameCenterEngine');
require('../../utils/gameCenterBlock2');
require('../../utils/gameCenterBlock3');
require('../../utils/gameCenterBlock4');
require('../../utils/gameCenterBlock5');
const advanced = require('../../utils/gameCenterWhatsappBlock2');
const social = require('../../utils/gameCenterWhatsappBlock3');
const clues = require('../../utils/gameCenterWhatsappBlock4');
const awards = require('../../utils/gameCenterWhatsappBlock5');

const prefix=config.prefix||'.';
const footer=()=>styleManager.getPhrases().footer();
const sep=()=>`\n\n${footer()}`;
const tag=id=>`@${String(id||'').split('@')[0]}`;
const gameLabel=type=>awards.labelForType(type)||clues.labelForType(type)||social.labelForType(type)||advanced.labelForType(type);

function menuText(){
  return [
    '🎮 *THE BIG DIPPER — GAME CENTER*',
    '',
    `${prefix}games prefer  → 🤔 Tu préfères`,
    `${prefix}games chain   → 🔤 Mot en chaîne`,
    `${prefix}games noyesno → 🚫 Ni Oui Ni Non`,
    `${prefix}games number  → 🎯 Devine le nombre`,
    `${prefix}games ttt @membre → ❌⭕ Morpion`,
    ...advanced.menuLines(prefix),
    ...social.menuLines(prefix),
    ...clues.menuLines(prefix),
    ...awards.menuLines(prefix),
    `${prefix}games list    → 📋 Parties actives`,
    `${prefix}games stop [#id] → 🛑 Arrêter une partie`,
    '',
    '💡 Quand plusieurs parties peuvent comprendre la même réponse, ajoute *#ID* pour viser la bonne partie.'
  ].join('\n')+sep();
}

function activeText(from){
  const rows=engine.list(from);
  if(!rows.length)return `🎮 *Aucune partie active dans ce groupe.*${sep()}`;
  return ['🎮 *PARTIES ACTIVES*','',...rows.map((g,i)=>`${i+1}. *${gameLabel(g.type)}*  #${g.alias}`)].join('\n')+sep();
}
function refFrom(text=''){ return String(text).match(/#([a-z0-9_-]{2,32})/i)?.[1]||null; }
function stripRef(text=''){ return String(text).replace(/#[a-z0-9_-]{2,32}/ig,'').trim(); }
function candidateTypes(rows,input){
  const n=String(input||'').trim().toLowerCase(); const set=new Set();
  if(rows.some(g=>g.type==='prefer')&&/^(1|2|a|b|gauche|droite)$/i.test(n))set.add('prefer');
  if(rows.some(g=>g.type==='guess-number')&&/^-?\d+$/.test(n))set.add('guess-number');
  if(rows.some(g=>g.type==='tic-tac-toe')&&/^[1-9]$/.test(n))set.add('tic-tac-toe');
  if(rows.some(g=>g.type==='word-chain')&&/^[a-zA-ZÀ-ÿ-]{2,}$/.test(n))set.add('word-chain');
  for(const type of advanced.candidateTypes(rows,n))set.add(type);
  for(const type of social.candidateTypes(rows,n))set.add(type);
  for(const type of clues.candidateTypes(rows,n))set.add(type);
  for(const type of awards.candidateTypes(rows,n))set.add(type);
  return [...set];
}

async function handleIncomingGameMessage(sock,msg,extra={}){
  const from=extra.from||msg.key.remoteJid;
  if(!from?.endsWith('@g.us')||msg.key.fromMe)return false;
  const sender=extra.sender||msg.key.participant||msg.key.remoteJid;
  const body=(msg.message?.conversation||msg.message?.extendedTextMessage?.text||'').trim();
  if(!body||body.startsWith(prefix))return false;
  const ref=refFrom(body), cleaned=stripRef(body);
  const routeCtx={from,sender,cleaned,ref,sep,tag};

  const nyn=engine.inspectNoYesNo(from,sender,cleaned);
  if(nyn.handled&&nyn.eliminated){
    await sock.sendMessage(from,{text:`🚫 ${tag(sender)} a dit *${nyn.word.toUpperCase()}* !\n💥 Éliminé(e) de la partie #${nyn.game.alias}.${sep()}`,mentions:[sender]},{quoted:msg});
    return true;
  }

  const active=engine.list(from);
  if(/^best\b/i.test(cleaned)&&active.some(g=>g.type==='best-member')){
    if(await awards.handleIncoming(sock,msg,extra,routeCtx))return true;
  }
  if(/^vote\b/i.test(cleaned)&&active.some(g=>g.type==='most-likely')){
    if(await social.handleIncoming(sock,msg,extra,routeCtx))return true;
  }
  if(/^\+\s*\S/i.test(cleaned)&&active.some(g=>g.type==='story')){
    if(await social.handleIncoming(sock,msg,extra,routeCtx))return true;
  }

  if(!ref){
    const interactive=active.filter(g=>g.type!=='no-yes-no'&&g.type!=='rps'&&g.type!=='truth-dare');
    const candidates=candidateTypes(interactive,cleaned);
    if(candidates.length>1){
      const ids=interactive.filter(g=>candidates.includes(g.type)).map(g=>`#${g.alias} (${gameLabel(g.type)})`).join(' • ');
      await sock.sendMessage(from,{text:`🎮 *Réponse ambiguë*\nCette réponse peut aller à plusieurs parties : ${ids}\n\nRenvoie-la avec l’ID, ex. *${cleaned} #abcdef*.${sep()}`},{quoted:msg});
      return true;
    }
  }

  if(await awards.handleIncoming(sock,msg,extra,routeCtx))return true;
  if(await social.handleIncoming(sock,msg,extra,routeCtx))return true;
  if(await clues.handleIncoming(sock,msg,extra,routeCtx))return true;
  if(await advanced.handleIncoming(sock,msg,extra,routeCtx))return true;

  const prefer=engine.votePrefer(from,sender,cleaned,ref);
  if(prefer.handled){
    await sock.sendMessage(from,{text:`🗳️ Vote enregistré pour ${tag(sender)}.\n1️⃣ ${prefer.game.choices[0]} — *${prefer.counts[0]}*\n2️⃣ ${prefer.game.choices[1]} — *${prefer.counts[1]}*\n#${prefer.game.alias}${sep()}`,mentions:[sender]},{quoted:msg});
    return true;
  }

  const num=engine.guessNumber(from,sender,cleaned,ref);
  if(num.handled){
    let text;
    if(!num.ok&&num.reason==='range') text=`⚠️ Choisis un nombre entre *${num.game.min}* et *${num.game.max}*. #${num.game.alias}`;
    else if(num.won) text=`🏆 ${tag(sender)} a trouvé *${num.number}* en ${num.attempts} tentative(s) !\n🎯 Partie #${num.game.alias} terminée.`;
    else text=`${num.hint==='higher'?'⬆️ Plus grand !':'⬇️ Plus petit !'}  #${num.game.alias}`;
    await sock.sendMessage(from,{text:text+sep(),mentions:[sender]},{quoted:msg});
    return true;
  }

  const ttt=engine.playTicTacToe(from,sender,cleaned,ref);
  if(ttt.handled){
    let text;
    if(!ttt.ok&&ttt.reason==='not-player') text='🔒 Cette partie appartient aux deux joueurs défiés.';
    else if(!ttt.ok&&ttt.reason==='turn') text=`⏳ Ce n’est pas ton tour. #${ttt.game.alias}`;
    else if(!ttt.ok&&ttt.reason==='occupied') text=`⚠️ Cette case est déjà prise. #${ttt.game.alias}`;
    else if(ttt.won) text=`❌⭕ *MORPION*\n\n${ttt.board}\n\n🏆 ${tag(sender)} gagne la partie #${ttt.game.alias} !`;
    else if(ttt.draw) text=`❌⭕ *MORPION*\n\n${ttt.board}\n\n🤝 Match nul. Partie #${ttt.game.alias} terminée.`;
    else text=`❌⭕ *MORPION*\n\n${ttt.board}\n\n➡️ À ${tag(ttt.next)} de jouer.\nID : #${ttt.game.alias}`;
    const mentions=[sender,ttt.next].filter(Boolean);
    await sock.sendMessage(from,{text:text+sep(),mentions},{quoted:msg});
    return true;
  }

  const chain=engine.playChain(from,sender,cleaned,ref);
  if(chain.handled){
    let text;
    if(chain.ok) text=`✅ ${tag(sender)} → *${chain.game.lastWord}*\n➡️ Prochain mot en *${chain.next.toUpperCase()}*\n⭐ Score : ${chain.score}  #${chain.game.alias}`;
    else if(chain.reason==='used') text=`♻️ *${cleaned}* a déjà été utilisé. #${chain.game.alias}`;
    else text=`❌ Le mot doit commencer par *${chain.expected.toUpperCase()}*. #${chain.game.alias}`;
    await sock.sendMessage(from,{text:text+sep(),mentions:[sender]},{quoted:msg});
    return true;
  }
  return false;
}

module.exports={
  name:'games', aliases:['game','jeux','gamecenter'], category:'🎮 Jeux & Fun',
  description:'Centre de jeux multijoueurs de THE BIG DIPPER', usage:`${prefix}games [prefer|chain|noyesno|number|ttt|quiz|riddle|math|rps|dice|draw|truth|dare|likely|story|intruder|rebus|daily|character|song|movie|best|crown|secretfriend|list|stop]`,
  groupOnly:true, adminOnly:false, botAdminNeeded:false,
  async execute(sock,msg,args,extra){
    const from=extra.from, sender=extra.sender;
    const sub=String(args[0]||'').toLowerCase();
    if(!sub||sub==='menu') return extra.reply(menuText());
    if(sub==='list'||sub==='active') return extra.reply(activeText(from));
    if(sub==='stop'){
      const ref=String(args[1]||'').replace(/^#/,'')||null;
      const rows=engine.list(from);
      if(!rows.length)return extra.reply(`❌ Aucune partie active.${sep()}`);
      if(!ref&&rows.length>1)return extra.reply(`⚠️ Plusieurs parties sont actives. Indique l’ID : *${prefix}games stop #ID*.${sep()}`);
      const current=engine.get(from,ref);
      if(!current)return extra.reply(`❌ Aucune partie correspondante.${sep()}`);
      if(!advanced.canManage(current,sender,extra))return extra.reply(`🔒 Seul le créateur, un joueur du duel ou un admin peut arrêter cette partie.${sep()}`);
      const g=engine.stop(from,current.alias);
      return extra.reply(`🛑 Partie *${gameLabel(g.type)}* #${g.alias} arrêtée.${sep()}`);
    }
    if(sub==='stopall'){
      if(!extra.isAdmin&&!extra.isOwner&&!extra.isSupremeOwner)return extra.reply(`🔒 Réservé aux admins.${sep()}`);
      const rows=engine.stopAll(from); return extra.reply(`🛑 ${rows.length} partie(s) arrêtée(s).${sep()}`);
    }
    if(sub==='prefer'){
      const g=engine.startPrefer(from,sender); if(g.error)return extra.reply(`⚠️ Une partie identique existe déjà ou le groupe a trop de parties actives.${sep()}`);
      return extra.reply(`🤔 *TU PRÉFÈRES...*\n\n1️⃣ ${g.choices[0]}\n2️⃣ ${g.choices[1]}\n\nRéponds *1* ou *2*.\nID : #${g.alias}${sep()}`);
    }
    if(sub==='chain'){
      const g=engine.startChain(from,sender); if(g.error)return extra.reply(`⚠️ Une partie Mot en chaîne est déjà active ou la limite est atteinte.${sep()}`);
      return extra.reply(`🔤 *MOT EN CHAÎNE*\n\nMot de départ : *${g.lastWord.toUpperCase()}*\n➡️ Envoie un mot qui commence par *${g.lastWord.slice(-1).toUpperCase()}*.\nID : #${g.alias}${sep()}`);
    }
    if(sub==='noyesno'||sub==='niouininon'){
      const g=engine.startNoYesNo(from,sender); if(g.error)return extra.reply(`⚠️ Une partie Ni Oui Ni Non est déjà active ou la limite est atteinte.${sep()}`);
      return extra.reply(`🚫 *NI OUI NI NON*\n\nÀ partir de maintenant, le bot surveille les réponses naturelles du groupe.\nDire *oui* ou *non* = élimination.\nID : #${g.alias}${sep()}`);
    }
    if(sub==='number'||sub==='nombre'){
      const min=Number(args[1])||1,max=Number(args[2])||100; const g=engine.startGuessNumber(from,sender,{min,max}); if(g.error)return extra.reply(`⚠️ Une partie Devine le nombre est déjà active ou la limite est atteinte.${sep()}`);
      return extra.reply(`🎯 *DEVINE LE NOMBRE*\n\nJ'ai choisi un nombre entre *${g.min}* et *${g.max}*.\nEnvoie tes propositions directement dans le groupe.\nID : #${g.alias}${sep()}`);
    }
    if(['ttt','morpion','tictactoe'].includes(sub)){
      const ctx=msg.message?.extendedTextMessage?.contextInfo||{};
      const opponent=(ctx.mentionedJid||[])[0]||ctx.participant||null;
      const g=engine.startTicTacToe(from,sender,opponent);
      if(g.error==='opponent')return extra.reply(`❌ Mentionne un autre membre : *${prefix}games ttt @membre*${sep()}`);
      if(g.error)return extra.reply(`⚠️ Une partie de Morpion est déjà active ou la limite est atteinte.${sep()}`);
      return sock.sendMessage(from,{text:`❌⭕ *MORPION*\n\n${g.board.map((v,i)=>i+1).map((v,i)=>`${v}${i%3===2?'\n':' │ '}`).join('').trim()}\n\n❌ ${tag(g.playerX)} commence.\n⭕ ${tag(g.playerO)} joue ensuite.\n\nEnvoyez un chiffre *1 à 9*.\nID : #${g.alias}${sep()}`,mentions:[g.playerX,g.playerO]},{quoted:msg});
    }
    if(awards.SUPPORTED.has(sub))return awards.handleSubcommand(sock,msg,args,extra,{prefix,sep,tag});
    if(clues.SUPPORTED.has(sub))return clues.handleSubcommand(sock,msg,args,extra,{prefix,sep,tag});
    if(social.SUPPORTED.has(sub))return social.handleSubcommand(sock,msg,args,extra,{prefix,sep,tag});
    if(advanced.SUPPORTED.has(sub))return advanced.handleSubcommand(sock,msg,args,extra,{prefix,sep,tag});
    return extra.reply(menuText());
  },
  handleIncomingGameMessage,
  engine,
  candidateTypes
};
