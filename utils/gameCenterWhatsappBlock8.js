'use strict';

const styleManager=require('./styleManager');
const {THEMES}=require('./styleCatalog');
const {profiles}=require('./gameCenterProfiles');
const {casino,MIN_BET,MAX_BET,handValue,handText}=require('./gameCenterCasino');

const SUPPORTED=new Set(['casino','slots','slot','roulette','blackjack','bj','hit','stand','abort']);
function theme(){ return THEMES[styleManager.getStyle()]||THEMES[0]; }
function banner(label,emoji='🎰'){ return `${emoji} *${theme().botName} — ${label}*`; }
function fmt(n){ return Number(n||0).toLocaleString('fr-FR'); }
function menuLines(prefix){
  return [
    `${prefix}games casino → 🎰 Arcade casino 100 % virtuelle`,
    `Direct : ${prefix}casino slots 50 | roulette 50 rouge | blackjack 50`
  ];
}
function labelForType(){ return null; }
function disclaimer(){ return '🛡️ *Dipper Coins uniquement* — aucune valeur réelle, aucun achat, aucun retrait.'; }
function betError(r){
  if(r?.error==='bet')return `❌ Mise autorisée : *${MIN_BET} à ${MAX_BET} Dipper Coins*.`;
  if(r?.error==='funds')return `❌ Solde virtuel insuffisant. Solde : *${fmt(r.profile?.coins)} DC*.`;
  if(r?.error==='cooldown')return `⏳ Trop rapide. Réessaie dans *${Math.ceil((r.remainingMs||0)/1000)} s*.`;
  return null;
}
function casinoMenu(prefix){
  return [
    banner('ARCADE CASINO VIRTUELLE'),'',
    `🎰 *${prefix}casino slots 50*`,
    `🎡 *${prefix}casino roulette 50 rouge|noir|pair|impair|0-36*`,
    `🃏 *${prefix}casino blackjack 50*`,
    `   puis *${prefix}casino hit* / *stand* / *abort*`,'',
    `Mise : *${MIN_BET}–${MAX_BET} DC*`,'',disclaimer()
  ].join('\n');
}
function slotsText(r){
  const result=r.multiplier>0?`🏆 Gain brut : *${fmt(r.payout)} DC*  •  Net : *${r.net>=0?'+':''}${fmt(r.net)} DC*`:`💨 Aucun alignement. Net : *-${fmt(r.bet)} DC*`;
  return [banner('SLOTS','🎰'),'',`┃ ${r.symbols.join(' │ ')} ┃`,'',result,`💰 Solde : *${fmt(r.profile.coins)} DC*`,'',disclaimer()].join('\n');
}
function rouletteText(r){
  const color=r.color==='red'?'🔴 ROUGE':r.color==='black'?'⚫ NOIR':'🟢 ZÉRO';
  const result=r.won?`🏆 Gagné : *${fmt(r.payout)} DC*  •  Net : *+${fmt(r.net)} DC*`:`💨 Perdu : *-${fmt(r.bet)} DC*`;
  return [banner('ROULETTE EUROPÉENNE','🎡'),'',`Résultat : *${r.number}* ${color}`,result,`💰 Solde : *${fmt(r.profile.coins)} DC*`,'',disclaimer()].join('\n');
}
function blackjackPlaying(r,prefix){
  return [
    banner('BLACKJACK','🃏'),'',
    `🧑 Tes cartes : ${handText(r.hand.player)}  → *${r.playerValue}*`,
    `🎩 Dealer : ${handText([r.dealerUp])}  → *${handValue([r.dealerUp])}* + ?`,'',
    `Mise : *${fmt(r.hand.bet)} DC*`,
    `Main : *${r.hand.id}*`,'',
    `➡️ *${prefix}casino hit* — tirer`,
    `⏹️ *${prefix}casino stand* — rester`,
    `↩️ *${prefix}casino abort* — annuler et récupérer la mise`,'',disclaimer()
  ].join('\n');
}
function blackjackFinished(r){
  const icon=r.outcome==='win'?'🏆':r.outcome==='push'?'🤝':'💥';
  const label=r.outcome==='win'?'VICTOIRE':r.outcome==='push'?'ÉGALITÉ':'DÉFAITE';
  return [
    banner(`BLACKJACK — ${label}`,icon),'',
    `🧑 Toi : ${handText(r.hand.player)}  → *${r.playerValue}*`,
    `🎩 Dealer : ${handText(r.hand.dealer)}  → *${r.dealerValue}*`,'',
    `💳 Mise : *${fmt(r.hand.bet)} DC*`,
    `💰 Paiement : *${fmt(r.payout)} DC*  •  Net : *${r.net>=0?'+':''}${fmt(r.net)} DC*`,
    `🏦 Solde : *${fmt(r.profile.coins)} DC*`,'',disclaimer()
  ].join('\n');
}
async function executeCasino(sock,msg,args,extra,{prefix,sep}){
  const sub=String(args[0]||'').toLowerCase();
  if(!sub||sub==='menu'||sub==='casino')return extra.reply(casinoMenu(prefix)+sep());
  if(['slots','slot'].includes(sub)){
    const r=casino.slots(extra.sender,args[1]); const err=betError(r); if(err)return extra.reply(err+sep());
    return extra.reply(slotsText(r)+sep());
  }
  if(sub==='roulette'){
    const r=casino.roulette(extra.sender,args[1],args[2]); const err=betError(r);
    if(err)return extra.reply(err+sep());
    if(r.error==='choice')return extra.reply(`❌ Choix : *rouge*, *noir*, *pair*, *impair* ou un numéro *0–36*.${sep()}`);
    return extra.reply(rouletteText(r)+sep());
  }
  if(['blackjack','bj'].includes(sub)){
    const r=casino.startBlackjack(extra.from,extra.sender,args[1]); const err=betError(r); if(err)return extra.reply(err+sep());
    if(r.error==='active')return extra.reply(`⚠️ Une main est déjà active ici. Utilise *${prefix}casino hit*, *stand* ou *abort*.${sep()}`);
    return extra.reply((r.finished?blackjackFinished(r):blackjackPlaying(r,prefix))+sep());
  }
  if(sub==='hit'){
    const r=casino.hitBlackjack(extra.from,extra.sender); if(r.error==='not-found')return extra.reply(`❌ Aucune main de blackjack active ici.${sep()}`);
    return extra.reply((r.finished?blackjackFinished(r):blackjackPlaying(r,prefix))+sep());
  }
  if(sub==='stand'){
    const r=casino.standBlackjack(extra.from,extra.sender); if(r.error==='not-found')return extra.reply(`❌ Aucune main de blackjack active ici.${sep()}`);
    return extra.reply(blackjackFinished(r)+sep());
  }
  if(sub==='abort'){
    const r=casino.abortBlackjack(extra.from,extra.sender); if(r.error==='not-found')return extra.reply(`❌ Aucune main de blackjack active ici.${sep()}`);
    return extra.reply(`${banner('BLACKJACK ANNULÉ','↩️')}\n\nMise remboursée : *${fmt(r.refunded)} DC*\nSolde : *${fmt(r.profile.coins)} DC*${sep()}`);
  }
  return extra.reply(casinoMenu(prefix)+sep());
}

module.exports={SUPPORTED,menuLines,labelForType,casinoMenu,slotsText,rouletteText,blackjackPlaying,blackjackFinished,betError,executeCasino,disclaimer};
