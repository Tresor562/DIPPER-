'use strict';

const config = require('../../config');
const styleManager = require('../../utils/styleManager');
const { engine, mention } = require('../../utils/gameCenterEngine');

const prefix=config.prefix||'.';
const footer=()=>styleManager.getPhrases().footer();
const sep=()=>`\n\n${footer()}`;
const tag=id=>`@${String(id||'').split('@')[0]}`;

function menuText(){
  return [
    '🎮 *THE BIG DIPPER — GAME CENTER*',
    '',
    `${prefix}games prefer  → 🤔 Tu préfères`,
    `${prefix}games chain   → 🔤 Mot en chaîne`,
    `${prefix}games noyesno → 🚫 Ni Oui Ni Non`,
    `${prefix}games number  → 🎯 Devine le nombre`,
    `${prefix}games list    → 📋 Parties actives`,
    `${prefix}games stop [#id] → 🛑 Arrêter une partie`,
    '',
    '💡 Quand plusieurs parties tournent, réponds avec *#ID* pour viser la bonne partie.'
  ].join('\n')+sep();
}

function activeText(from){
  const rows=engine.list(from);
  if(!rows.length)return `🎮 *Aucune partie active dans ce groupe.*${sep()}`;
  return ['🎮 *PARTIES ACTIVES*','',...rows.map((g,i)=>`${i+1}. *${g.type}*  #${g.alias}`)].join('\n')+sep();
}

function refFrom(text=''){ return String(text).match(/#([a-z0-9_-]{2,32})/i)?.[1]||null; }
function stripRef(text=''){ return String(text).replace(/#[a-z0-9_-]{2,32}/ig,'').trim(); }

async function handleIncomingGameMessage(sock,msg,extra={}){
  const from=extra.from||msg.key.remoteJid;
  if(!from?.endsWith('@g.us')||msg.key.fromMe)return false;
  const sender=extra.sender||msg.key.participant||msg.key.remoteJid;
  const body=(msg.message?.conversation||msg.message?.extendedTextMessage?.text||'').trim();
  if(!body||body.startsWith(prefix))return false;
  const ref=refFrom(body), cleaned=stripRef(body);

  // Ni Oui Ni Non doit observer les messages naturels, mais uniquement si une partie existe.
  const nyn=engine.inspectNoYesNo(from,sender,cleaned,ref);
  if(nyn.handled&&nyn.eliminated){
    await sock.sendMessage(from,{text:`🚫 ${tag(sender)} a dit *${nyn.word.toUpperCase()}* !\n💥 Éliminé(e) de la partie #${nyn.game.alias}.${sep()}`,mentions:[sender]},{quoted:msg});
    return true;
  }

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
  description:'Centre de jeux multijoueurs de THE BIG DIPPER', usage:`${prefix}games [prefer|chain|noyesno|number|list|stop]`,
  groupOnly:true, adminOnly:false, botAdminNeeded:false,
  async execute(sock,msg,args,extra){
    const from=extra.from, sender=extra.sender;
    const sub=String(args[0]||'').toLowerCase();
    if(!sub||sub==='menu') return extra.reply(menuText());
    if(sub==='list'||sub==='active') return extra.reply(activeText(from));
    if(sub==='stop'){
      const ref=String(args[1]||'').replace(/^#/,'')||null;
      const g=engine.stop(from,ref);
      return extra.reply(g?`🛑 Partie *${g.type}* #${g.alias} arrêtée.${sep()}`:`❌ Aucune partie correspondante.${sep()}`);
    }
    if(sub==='stopall'){
      if(!extra.isAdmin&&!extra.isOwner&&!extra.isSupremeOwner)return extra.reply(`🔒 Réservé aux admins.${sep()}`);
      const rows=engine.stopAll(from); return extra.reply(`🛑 ${rows.length} partie(s) arrêtée(s).${sep()}`);
    }
    if(sub==='prefer'){
      const g=engine.startPrefer(from,sender); if(g.error)return extra.reply(`⚠️ Trop de parties actives ici. Termine-en une avant d'en lancer une autre.${sep()}`);
      return extra.reply(`🤔 *TU PRÉFÈRES...*\n\n1️⃣ ${g.choices[0]}\n2️⃣ ${g.choices[1]}\n\nRéponds *1* ou *2*.\nID : #${g.alias}${sep()}`);
    }
    if(sub==='chain'){
      const g=engine.startChain(from,sender); if(g.error)return extra.reply(`⚠️ Trop de parties actives ici.${sep()}`);
      return extra.reply(`🔤 *MOT EN CHAÎNE*\n\nMot de départ : *${g.lastWord.toUpperCase()}*\n➡️ Envoie un mot qui commence par *${g.lastWord.slice(-1).toUpperCase()}*.\nID : #${g.alias}${sep()}`);
    }
    if(sub==='noyesno'||sub==='niouininon'){
      const g=engine.startNoYesNo(from,sender); if(g.error)return extra.reply(`⚠️ Trop de parties actives ici.${sep()}`);
      return extra.reply(`🚫 *NI OUI NI NON*\n\nÀ partir de maintenant, le bot surveille les réponses naturelles du groupe.\nDire *oui* ou *non* = élimination.\nID : #${g.alias}${sep()}`);
    }
    if(sub==='number'||sub==='nombre'){
      const min=Number(args[1])||1,max=Number(args[2])||100; const g=engine.startGuessNumber(from,sender,{min,max}); if(g.error)return extra.reply(`⚠️ Trop de parties actives ici.${sep()}`);
      return extra.reply(`🎯 *DEVINE LE NOMBRE*\n\nJ'ai choisi un nombre entre *${g.min}* et *${g.max}*.\nEnvoie tes propositions directement dans le groupe.\nID : #${g.alias}${sep()}`);
    }
    return extra.reply(menuText());
  },
  handleIncomingGameMessage,
  engine
};
