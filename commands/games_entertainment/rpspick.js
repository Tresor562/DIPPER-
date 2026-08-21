'use strict';

const config = require('../../config');
const styleManager = require('../../utils/styleManager');
const { THEMES } = require('../../utils/styleCatalog');
const { engine } = require('../../utils/gameCenterEngine');
require('../../utils/gameCenterBlock2');

const prefix=config.prefix||'.';
const footer=()=>styleManager.getPhrases().footer();
const sep=()=>`\n\n${footer()}`;
const tag=id=>`@${String(id||'').split('@')[0]}`;
function theme(){ return THEMES[styleManager.getStyle()]||THEMES[0]; }
function banner(label,emoji='✊'){ return `${emoji} *${theme().botName} — ${label}*`; }

module.exports={
  name:'rpspick',
  aliases:['rpsmove','rpschoix','pfcchoix'],
  category:'🎮 Jeux & Fun',
  description:'Choix privé pour un duel Pierre-Feuille-Ciseaux du Game Center',
  usage:`${prefix}rpspick #id pierre|feuille|ciseaux`,
  async execute(sock,msg,args,extra){
    const from=extra.from, sender=extra.sender;
    if(from?.endsWith('@g.us')) return extra.reply(`🔐 Pour garder le duel équitable, envoie cette commande *en privé au bot*.${sep()}`);

    const ref=String(args[0]||'').replace(/^#/,'').trim();
    const choice=String(args[1]||'').trim();
    if(!ref||!choice)return extra.reply(`Usage : *${prefix}rpspick #ID pierre*\nChoix : *pierre*, *feuille* ou *ciseaux*.${sep()}`);

    const r=engine.pickRps(sender,ref,choice);
    if(r.error==='not-found')return extra.reply(`❌ Duel introuvable, terminé, ou tu n’en fais pas partie.${sep()}`);
    if(r.error==='ambiguous')return extra.reply(`⚠️ Plusieurs duels correspondent à cet ID. Utilise l’ID exact indiqué dans le groupe.${sep()}`);
    if(!r.ok&&r.reason==='choice')return extra.reply(`❌ Choix invalide : *pierre*, *feuille* ou *ciseaux*.${sep()}`);
    if(!r.ok&&r.reason==='already')return extra.reply(`🔒 Ton choix est déjà verrouillé. Il ne peut plus être modifié.${sep()}`);

    if(r.waiting)return extra.reply(`${banner('CHOIX VERROUILLÉ','🔐')}\n\nTon choix est enregistré. Il reste secret jusqu’au choix de ton adversaire.${sep()}`);

    await extra.reply(`${banner('CHOIX VERROUILLÉ','🔐')}\n\nLes deux choix sont maintenant reçus. Résultat envoyé dans le groupe.${sep()}`);

    const [a,b]=r.game.players;
    const result=r.draw
      ? `🤝 *Égalité !*`
      : `🏆 ${tag(r.winner)} remporte le duel !`;
    const text=[
      banner('RÉSULTAT PIERRE • FEUILLE • CISEAUX','✊'),'',
      `${tag(a)} → *${r.choices[a]}*`,
      `${tag(b)} → *${r.choices[b]}*`,'',
      result,
      `ID : #${r.game.alias}`
    ].join('\n')+sep();
    return sock.sendMessage(r.game.chatId,{text,mentions:[a,b].filter(Boolean)});
  }
};
