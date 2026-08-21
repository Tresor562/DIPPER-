'use strict';

const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const {werewolf,ROLE_LABELS}=require('../../utils/gameCenterWerewolf');

const prefix=config.prefix||'.';
const footer=()=>styleManager.getPhrases().footer();
const sep=()=>`\n\n${footer()}`;
const tag=id=>`@${String(id||'').split('@')[0]}`;
const aliasFrom=args=>String((args||[]).find(x=>String(x).startsWith('#'))||'').replace(/^#/,'').toLowerCase();
function finishText(r){return[`🏁 *LOUP-GAROU TERMINÉ*`,`Victoire : *${r.winner==='wolves'?'🐺 LOUPS':'🏘️ VILLAGE'}*`,'',r.roster].join('\n');}
function publicRoster(s){return s.players.map((p,i)=>`${i+1}. ${tag(p)} ${s.alive[p]?'🟢':'💀'}`).join('\n');}

async function announceResolution(sock,r){
  if(!r)return;
  if(r.finished){await sock.sendMessage(r.game.chatId,{text:finishText(r)+sep(),mentions:r.game.players});return;}
  const s=r.game;
  const line=r.victim&&!r.saved?`🌅 ${tag(r.victim)} n’a pas survécu à la nuit.`:r.victim&&r.saved?'🌅 Une attaque a eu lieu, mais la cible a été sauvée.':'🌅 Personne ne meurt cette nuit.';
  await sock.sendMessage(s.chatId,{text:`${line}\n\n☀️ *JOUR ${s.round}*\nVotez avec *${prefix}wolf vote <numéro>*.\n\n${publicRoster(s)}${sep()}`,mentions:s.players});
}

module.exports={
  name:'wolfact',aliases:['wolfaction','loupact'],category:'🎮 Jeux & Fun',description:'Action nocturne privée du Loup-Garou',
  usage:`${prefix}wolfact #ID role | kill <n> | see <n> | save <n>`,groupOnly:false,adminOnly:false,botAdminNeeded:false,
  async execute(sock,msg,args,extra){
    const from=extra.from||msg.key.remoteJid,sender=extra.sender||msg.key.participant||msg.key.remoteJid;
    if(String(from||'').endsWith('@g.us'))return extra.reply(`🔒 *Commande strictement privée.*\nOuvre le DM du bot pour tes actions nocturnes.${sep()}`);
    const alias=aliasFrom(args),sub=String(args.find(x=>!String(x).startsWith('#'))||'').toLowerCase();
    if(!alias)return extra.reply(`❌ Indique l’ID reçu en privé : *${prefix}wolfact #ID role*.${sep()}`);
    const info=werewolf.role(alias,sender);
    if(!info)return extra.reply(`❌ Partie introuvable ou tu n’en fais pas partie.${sep()}`);
    if(!sub||sub==='help'||sub==='menu'||sub==='role'||sub==='status'){
      let action='Aucune action nocturne pour ce rôle.';
      if(info.role==='wolf')action=`🐺 *${prefix}wolfact #${alias} kill <numéro>*`;
      if(info.role==='seer')action=`🔮 *${prefix}wolfact #${alias} see <numéro>*`;
      if(info.role==='doctor')action=`💉 *${prefix}wolfact #${alias} save <numéro>*`;
      return extra.reply([`🌙 *RÔLE PRIVÉ*`,`Rôle : *${ROLE_LABELS[info.role]}*`,`État : *${info.alive?'vivant':'éliminé'}* • phase *${info.phase}*`,'',info.roster,'',action,`🆔 #${alias}`].join('\n')+sep());
    }
    const subIndex=args.findIndex(x=>String(x).toLowerCase()===sub),target=args[subIndex+1];
    if(!['kill','see','save'].includes(sub))return extra.reply(`❓ Action invalide. Utilise *role*, *kill*, *see* ou *save*.${sep()}`);
    const r=werewolf.nightAction(alias,sender,sub,target);
    if(r.error==='phase')return extra.reply(`☀️ Ce n’est pas la phase de nuit.${sep()}`);
    if(r.error==='dead')return extra.reply(`💀 Tu es éliminé(e) et ne peux plus agir.${sep()}`);
    if(r.error==='role')return extra.reply(`🔒 Ton rôle ne permet pas cette action.${sep()}`);
    if(r.error==='done')return extra.reply(`♻️ Ton action spéciale de cette nuit est déjà enregistrée.${sep()}`);
    if(r.error==='self')return extra.reply(`❌ Cette action ne peut pas te cibler toi-même.${sep()}`);
    if(r.error==='wolf-target')return extra.reply(`🐺 Un loup ne peut pas attaquer un autre loup.${sep()}`);
    if(r.error)return extra.reply(`❌ Numéro de cible invalide. Consulte *${prefix}wolfact #${alias} role*.${sep()}`);
    let text='✅ Action nocturne enregistrée en privé.';
    if(sub==='see')text=`🔮 Résultat privé : ${tag(r.target)} est *${r.seenIsWolf?'LOUP 🐺':'PAS LOUP ✅'}*.`;
    if(sub==='save')text=`💉 Protection privée enregistrée pour ${tag(r.target)}.`;
    if(sub==='kill')text=`🐺 Vote d’attaque privé enregistré contre ${tag(r.target)}.`;
    await extra.reply(text+sep());
    if(r.resolution)await announceResolution(sock,r.resolution);
  }
};

module.exports.announceResolution=announceResolution;
