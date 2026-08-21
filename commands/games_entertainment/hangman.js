'use strict';

const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const {engine}=require('../../utils/gameCenterEngine');
require('../../utils/gameCenterBlock10');

const prefix=config.prefix||'.';
const footer=()=>styleManager.getPhrases().footer();
const sep=()=>`\n\n${footer()}`;
const tag=id=>`@${String(id||'').split('@')[0]}`;
const refFrom=args=>String((args||[]).find(x=>String(x).startsWith('#'))||'').replace(/^#/,'')||null;

function board(g,mask){
  return [
    '🪢 *PENDU*',
    '',
    `Mot : *${mask}*`,
    `❌ Erreurs : *${g.wrongCount}/${g.maxWrong}*`,
    `🔤 Ratés : ${(g.wrong||[]).join(', ')||'—'}`,
    `🏷️ Catégorie : *${g.category}*`,
    `🆔 #${g.alias}`
  ].join('\n');
}

module.exports={
  name:'hangman',aliases:['pendu'],category:'🎮 Jeux & Fun',
  description:'Joue au pendu dans le Game Center',
  usage:`${prefix}hangman start [anime|tech|general] | lettre <x> [#id] | mot <mot> [#id] | status [#id]`,
  groupOnly:true,adminOnly:false,botAdminNeeded:false,
  async execute(sock,msg,args,extra){
    const from=extra.from,sender=extra.sender,sub=String(args[0]||'').toLowerCase();
    if(!sub||sub==='help'||sub==='menu')return extra.reply([
      '🪢 *PENDU — GAME CENTER*','',
      `${prefix}hangman start anime`,`${prefix}hangman start tech`,`${prefix}hangman start general`,
      `${prefix}hangman lettre a`,`${prefix}hangman mot javascript`,`${prefix}hangman status`,'',
      '💡 Si plusieurs références sont proposées, ajoute *#ID*.'
    ].join('\n')+sep());
    if(sub==='start'){
      const category=String(args[1]||'general').toLowerCase();
      const g=engine.startHangman(from,sender,{category});
      if(g.error==='category')return extra.reply(`❌ Catégorie invalide : *anime | tech | general*.${sep()}`);
      if(g.error)return extra.reply(`⚠️ Un Pendu est déjà actif ou la limite de parties est atteinte.${sep()}`);
      const mask=[...g.answer].map(()=>'_').join(' ');
      return extra.reply(`${board(g,mask)}\n\n➡️ Utilise *${prefix}hangman lettre a* ou *${prefix}hangman mot réponse*.${sep()}`);
    }
    if(sub==='status'){
      const ref=refFrom(args),g=engine.get(from,ref,'hangman');
      if(!g)return extra.reply(`❌ Aucun Pendu actif correspondant.${sep()}`);
      const {maskWord}=require('../../utils/gameCenterBlock10');
      return extra.reply(board(g,maskWord(g.answer,g.letters))+sep());
    }
    if(sub==='lettre'||sub==='letter'||sub==='mot'||sub==='word'){
      const ref=refFrom(args);
      const guess=String(args[1]||'').trim();
      if(!guess||guess.startsWith('#'))return extra.reply(`❌ Donne ${sub==='mot'||sub==='word'?'un mot':'une lettre'}.${sep()}`);
      if((sub==='lettre'||sub==='letter')&&require('../../utils/gameCenterBlock10').norm(guess).length!==1)return extra.reply(`❌ Donne une seule lettre.${sep()}`);
      const r=engine.playHangman(from,sender,guess,ref);
      if(!r.handled)return extra.reply(`❌ Aucun Pendu actif correspondant.${sep()}`);
      if(!r.ok&&r.reason==='duplicate')return extra.reply(`♻️ *${guess}* a déjà été essayé.\n${board(r.game,r.mask)}${sep()}`);
      if(r.won)return sock.sendMessage(from,{text:`${board(r.game,r.mask)}\n\n🏆 ${tag(sender)} a trouvé *${r.answer.toUpperCase()}* !\n+30 XP • +20 Dipper Coins${sep()}`,mentions:[sender]},{quoted:msg});
      if(r.lost)return extra.reply(`${board(r.game,r.mask)}\n\n💀 Partie terminée. Le mot était *${r.answer.toUpperCase()}*.${sep()}`);
      return extra.reply(`${board(r.game,r.mask)}\n\n${r.correct?'✅ Bonne lettre !':'❌ Raté !'}${sep()}`);
    }
    return extra.reply(`❓ Utilise *${prefix}hangman* pour voir les commandes.${sep()}`);
  }
};
