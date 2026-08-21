'use strict';

const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const {engine}=require('../../utils/gameCenterEngine');
require('../../utils/gameCenterChess');

const prefix=config.prefix||'.';
const footer=()=>styleManager.getPhrases().footer();
const sep=()=>`\n\n${footer()}`;
const tag=id=>`@${String(id||'').split('@')[0]}`;
const refFrom=args=>String((args||[]).find(x=>String(x).startsWith('#'))||'').replace(/^#/,'')||null;

function gameText(view){
  return ['♟️ *ÉCHECS — GAME CENTER*','',`\`\`\`${view.board}\`\`\``,'' ,`⚪ ${tag(view.game.white)}`,`⚫ ${tag(view.game.black)}`,`${view.check?'🚨 ÉCHEC • ':''}➡️ Tour : ${tag(view.turn)}`,`🆔 #${view.game.alias}`].join('\n');
}

module.exports={
  name:'chess',aliases:['echecs','échecs'],category:'🎮 Jeux & Fun',
  description:'Duel d’échecs complet avec règles légales persistantes',
  usage:`${prefix}chess @membre | move e2e4 [#id] | status [#id] | resign [#id]`,
  groupOnly:true,adminOnly:false,botAdminNeeded:false,
  async execute(sock,msg,args,extra){
    const from=extra.from,sender=extra.sender,sub=String(args[0]||'').toLowerCase();
    const ctx=msg.message?.extendedTextMessage?.contextInfo||{};
    if(!sub||sub==='help'||sub==='menu')return extra.reply([
      '♟️ *ÉCHECS — GAME CENTER*','',
      `${prefix}chess @membre`,`${prefix}chess move e2e4`,`${prefix}chess move Nf3`,`${prefix}chess status`,`${prefix}chess resign`,'',
      'Le moteur vérifie les règles complètes : roque, promotion, en passant, échec/mat et nulles.'
    ].join('\n')+sep());
    if(sub.startsWith('@')||(!['move','joue','status','board','resign','abandon','stop'].includes(sub)&&(ctx.mentionedJid||[]).length)){
      const opponent=(ctx.mentionedJid||[])[0]||null;
      const g=engine.startChess(from,sender,opponent);
      if(g.error==='opponent')return extra.reply(`❌ Mentionne un autre membre : *${prefix}chess @membre*.${sep()}`);
      if(g.error)return extra.reply(`⚠️ Une partie d’échecs est déjà active ou la limite est atteinte.${sep()}`);
      const view=engine.chessView(from,g.alias);
      return sock.sendMessage(from,{text:`${gameText(view)}\n\n⚪ ${tag(g.white)} commence.\nJoue avec *${prefix}chess move e2e4*.${sep()}`,mentions:[g.white,g.black]},{quoted:msg});
    }
    if(sub==='move'||sub==='joue'){
      const ref=refFrom(args),move=String(args[1]||'').trim();
      if(!move||move.startsWith('#'))return extra.reply(`❌ Donne un coup, ex. *${prefix}chess move e2e4*.${sep()}`);
      const r=engine.playChessMove(from,sender,move,ref);
      if(!r.handled)return extra.reply(`❌ Aucune partie d’échecs active correspondante.${sep()}`);
      if(!r.ok&&r.reason==='not-player')return extra.reply(`🔒 Seuls les deux joueurs peuvent déplacer une pièce.${sep()}`);
      if(!r.ok&&r.reason==='turn')return sock.sendMessage(from,{text:`⏳ Ce n’est pas ton tour. À ${tag(r.turn)} de jouer.${sep()}`,mentions:[r.turn]},{quoted:msg});
      if(!r.ok)return extra.reply(`❌ Coup illégal : *${move}*.${sep()}`);
      if(r.finished){
        const type=r.result.type;
        if(r.game.winner)return sock.sendMessage(from,{text:`♟️ *PARTIE TERMINÉE*\n\n\`\`\`${r.board}\`\`\`\n\n🏆 ${tag(r.game.winner)} gagne par *${type}*.\n+50 XP • +40 Dipper Coins${sep()}`,mentions:[r.game.winner]},{quoted:msg});
        return extra.reply(`♟️ *PARTIE NULLE* — ${type}\n\n\`\`\`${r.board}\`\`\`${sep()}`);
      }
      return sock.sendMessage(from,{text:`♟️ Coup : *${r.move.san}*\n\n\`\`\`${r.board}\`\`\`\n\n${r.check?'🚨 *ÉCHEC !*\n':''}➡️ À ${tag(r.next)} de jouer.\n🆔 #${r.game.alias}${sep()}`,mentions:[r.next]},{quoted:msg});
    }
    if(sub==='status'||sub==='board'){
      const view=engine.chessView(from,refFrom(args));if(!view)return extra.reply(`❌ Aucune partie d’échecs active correspondante.${sep()}`);
      return sock.sendMessage(from,{text:gameText(view)+sep(),mentions:[view.game.white,view.game.black,view.turn]},{quoted:msg});
    }
    if(sub==='resign'||sub==='abandon'){
      const r=engine.resignChess(from,sender,refFrom(args));
      if(r.error==='not-player')return extra.reply(`🔒 Tu ne joues pas cette partie.${sep()}`);
      if(r.error)return extra.reply(`❌ Aucune partie d’échecs active correspondante.${sep()}`);
      return sock.sendMessage(from,{text:`🏳️ ${tag(r.loser)} abandonne.\n🏆 ${tag(r.winner)} remporte la partie.${sep()}`,mentions:[r.loser,r.winner]},{quoted:msg});
    }
    if(sub==='stop'){
      const g=engine.get(from,refFrom(args),'chess');if(!g)return extra.reply(`❌ Aucune partie d’échecs active.${sep()}`);
      if(sender!==g.by&&!extra.isAdmin&&!extra.isOwner&&!extra.isSupremeOwner)return extra.reply(`🔒 Seul le créateur ou un admin peut arrêter sans résultat.${sep()}`);
      engine.stop(from,g.alias);return extra.reply(`🛑 Partie d’échecs #${g.alias} arrêtée sans résultat.${sep()}`);
    }
    return extra.reply(`❓ Utilise *${prefix}chess* pour l’aide.${sep()}`);
  }
};
