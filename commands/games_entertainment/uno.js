'use strict';

const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const {uno,cardText,COLOR_NAMES,MIN_UNO_PLAYERS,MAX_UNO_PLAYERS}=require('../../utils/gameCenterUno');

const prefix=config.prefix||'.';
const footer=()=>styleManager.getPhrases().footer();
const sep=()=>`\n\n${footer()}`;
const tag=id=>`@${String(id||'').split('@')[0]}`;
function handText(hand,alias){return['🃏 *TA MAIN UNO — PRIVÉE*','',...hand.map((c,i)=>`${i+1}. ${cardText(c)}`),'',`Joue dans le groupe : *${prefix}uno play <numéro> [couleur]*`,`🆔 #${alias}`].join('\n');}
function statusText(s){if(s.phase==='lobby')return`🃏 *UNO — LOBBY*\nJoueurs : *${s.players.length}/${MAX_UNO_PLAYERS}*\n${s.players.map(tag).join(' • ')}\n🆔 #${s.alias}`;return`🃏 *UNO*\nCarte : *${cardText(s.top)}* • couleur active : *${COLOR_NAMES[s.activeColor]}*\nTour : ${tag(s.turn)}\n${s.players.map(p=>`${tag(p)} (${s.counts[p]} cartes)`).join(' • ')}\n🆔 #${s.alias}`;}
async function dmHand(sock,user,hand,alias){await sock.sendMessage(user,{text:handText(hand,alias)});}

module.exports={
  name:'uno',aliases:['unogame'],category:'🎮 Jeux & Fun',description:'UNO multijoueur avec mains privées en DM',
  usage:`${prefix}uno create|join|leave|start|hand|play <n> [rouge|jaune|vert|bleu]|draw|status|stop`,
  groupOnly:true,adminOnly:false,botAdminNeeded:false,
  async execute(sock,msg,args,extra){
    const from=extra.from,sender=extra.sender,sub=String(args[0]||'').toLowerCase();
    if(!sub||sub==='help'||sub==='menu')return extra.reply(['🃏 *UNO — GAME CENTER*','',`${prefix}uno create`,`${prefix}uno join`,`${prefix}uno start`,`${prefix}uno hand`,`${prefix}uno play 3`,`${prefix}uno play 3 rouge  ← joker`,`${prefix}uno draw`,`${prefix}uno status`,`${prefix}uno leave`,`${prefix}uno stop`,'',`👥 ${MIN_UNO_PLAYERS}–${MAX_UNO_PLAYERS} joueurs. Les mains restent privées en DM.`].join('\n')+sep());
    if(sub==='create'){
      const g=uno.create(from,sender);if(g.error)return extra.reply(`⚠️ Une partie UNO existe déjà dans ce groupe.${sep()}`);
      return sock.sendMessage(from,{text:`🃏 *LOBBY UNO CRÉÉ*\nHôte : ${tag(sender)}\nRejoignez avec *${prefix}uno join*.\nPuis l’hôte lance avec *${prefix}uno start*.\n🆔 #${g.alias}${sep()}`,mentions:[sender]},{quoted:msg});
    }
    if(sub==='join'){
      const r=uno.join(from,sender);if(r.error==='joined')return extra.reply(`♻️ Tu es déjà inscrit(e).${sep()}`);if(r.error==='full')return extra.reply(`⛔ Lobby complet.${sep()}`);if(r.error)return extra.reply(`❌ Aucun lobby UNO ouvert.${sep()}`);
      return sock.sendMessage(from,{text:`✅ ${tag(sender)} rejoint UNO. *${r.game.players.length}/${MAX_UNO_PLAYERS}* joueurs.${sep()}`,mentions:[sender]},{quoted:msg});
    }
    if(sub==='leave'){
      const r=uno.leave(from,sender);if(r.error==='started')return extra.reply(`🔒 La partie a déjà commencé.${sep()}`);if(r.error)return extra.reply(`❌ Tu n’es pas dans un lobby UNO.${sep()}`);if(r.cancelled)return extra.reply(`🛑 L’hôte a quitté : lobby UNO annulé.${sep()}`);return extra.reply(`🚪 Tu as quitté le lobby UNO.${sep()}`);
    }
    if(sub==='start'){
      const r=uno.start(from,sender);if(r.error==='host')return extra.reply(`🔒 Seul l’hôte peut lancer la partie.${sep()}`);if(r.error==='players')return extra.reply(`❌ Il faut au moins ${MIN_UNO_PLAYERS} joueurs.${sep()}`);if(r.error)return extra.reply(`❌ Impossible de lancer cette partie UNO.${sep()}`);
      const delivered=[];let failed=null;
      for(const p of r.game.players){try{await dmHand(sock,p,r.game.hands[p],r.game.alias);delivered.push(p);}catch(_){failed=p;break;}}
      if(failed){uno.cancel(from);for(const p of delivered){try{await sock.sendMessage(p,{text:'🛑 UNO annulé : toutes les mains privées n’ont pas pu être distribuées.'});}catch(_){}}return extra.reply(`❌ UNO annulé : impossible d’envoyer une main privée à tous les joueurs.${sep()}`);}
      const s=uno.status(from);return sock.sendMessage(from,{text:`${statusText(s)}\n\n✅ Les mains ont été envoyées en privé.\n➡️ ${tag(s.turn)} commence.${sep()}`,mentions:s.players},{quoted:msg});
    }
    if(sub==='hand'||sub==='main'){
      const s=uno.status(from),hand=uno.hand(from,sender);if(!s||!hand)return extra.reply(`❌ Tu n’as pas de main UNO active.${sep()}`);
      try{await dmHand(sock,sender,hand,s.alias);return extra.reply(`📩 Ta main UNO vient de t’être renvoyée en privé.${sep()}`);}catch(_){return extra.reply(`❌ Impossible de t’envoyer ta main en privé actuellement.${sep()}`);}
    }
    if(sub==='play'||sub==='joue'){
      const index=Number(args[1]),color=args[2]||null,r=uno.play(from,sender,index,{color});
      if(r.error==='turn')return sock.sendMessage(from,{text:`⏳ Ce n’est pas ton tour. À ${tag(r.turn)} de jouer.${sep()}`,mentions:[r.turn]},{quoted:msg});
      if(r.error==='index')return extra.reply(`❌ Numéro de carte invalide. Consulte *${prefix}uno hand*.${sep()}`);
      if(r.error==='illegal')return extra.reply(`❌ Cette carte ne peut pas être jouée maintenant.${sep()}`);
      if(r.error==='color')return extra.reply(`🎨 Avec un Joker, précise : *rouge, jaune, vert* ou *bleu*.${sep()}`);
      if(r.error)return extra.reply(`❌ Aucune partie UNO jouable.${sep()}`);
      if(r.won)return sock.sendMessage(from,{text:`🃏 ${tag(sender)} joue *${cardText(r.card)}*.\n\n🏆 *UNO ! ${tag(sender)} gagne !*\n+75 XP • +60 Dipper Coins${sep()}`,mentions:[sender]},{quoted:msg});
      const s=uno.status(from);return sock.sendMessage(from,{text:`🃏 ${tag(sender)} joue *${cardText(r.card)}*.${r.penalty?`\n💥 Pénalité : +${r.penalty}.`:''}\n➡️ À ${tag(r.next)}.\n${s.players.map(p=>`${tag(p)} (${s.counts[p]})`).join(' • ')}${sep()}`,mentions:[sender,r.next,...s.players]},{quoted:msg});
    }
    if(sub==='draw'||sub==='pioche'){
      const r=uno.draw(from,sender);if(r.error==='turn')return sock.sendMessage(from,{text:`⏳ À ${tag(r.turn)} de jouer.${sep()}`,mentions:[r.turn]},{quoted:msg});if(r.error)return extra.reply(`❌ Aucune partie UNO jouable.${sep()}`);
      let dmOk=true;try{const s=uno.status(from);await dmHand(sock,sender,uno.hand(from,sender),s.alias);}catch(_){dmOk=false;}
      return sock.sendMessage(from,{text:`🃏 ${tag(sender)} pioche une carte.${dmOk?' 📩 Main mise à jour en privé.':' ⚠️ DM impossible : utilise .uno hand plus tard.'}\n➡️ À ${tag(r.next)}.${sep()}`,mentions:[sender,r.next]},{quoted:msg});
    }
    if(sub==='status'){
      const s=uno.status(from);if(!s)return extra.reply(`❌ Aucune partie UNO active.${sep()}`);return sock.sendMessage(from,{text:statusText(s)+sep(),mentions:s.players},{quoted:msg});
    }
    if(sub==='stop'){
      const g=uno.get(from);if(!g)return extra.reply(`❌ Aucune partie UNO active.${sep()}`);if(sender!==g.host&&!extra.isAdmin&&!extra.isOwner&&!extra.isSupremeOwner)return extra.reply(`🔒 Seul l’hôte ou un admin peut arrêter UNO.${sep()}`);uno.cancel(from);return extra.reply(`🛑 Partie UNO annulée.${sep()}`);
    }
    return extra.reply(`❓ Utilise *${prefix}uno* pour l’aide.${sep()}`);
  }
};
