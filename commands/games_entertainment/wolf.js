'use strict';

const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const {werewolf,MIN_WOLF_PLAYERS,MAX_WOLF_PLAYERS,ROLE_LABELS,rosterText}=require('../../utils/gameCenterWerewolf');

const prefix=config.prefix||'.';
const footer=()=>styleManager.getPhrases().footer();
const sep=()=>`\n\n${footer()}`;
const tag=id=>`@${String(id||'').split('@')[0]}`;
function roleDm(g,p){const role=g.roles[p],wolves=g.players.filter(x=>g.roles[x]==='wolf'&&x!==p);let action='Aucune action nocturne.';if(role==='wolf')action=`Cette nuit : *${prefix}wolfact #${g.alias} kill <numéro>*${wolves.length?`\n🐺 Alliés : ${wolves.map(tag).join(', ')}`:''}`;if(role==='seer')action=`Cette nuit : *${prefix}wolfact #${g.alias} see <numéro>*`;if(role==='doctor')action=`Cette nuit : *${prefix}wolfact #${g.alias} save <numéro>*`;return[`🌙 *LOUP-GAROU — RÔLE PRIVÉ*`,`Ton rôle : *${ROLE_LABELS[role]}*`,'',rosterText(g),'',action,`🆔 #${g.alias}`].join('\n');}
function publicRoster(s){return s.players.map((p,i)=>`${i+1}. ${tag(p)} ${s.alive[p]?'🟢':'💀'}`).join('\n');}
function finishText(r){return[`🏁 *LOUP-GAROU TERMINÉ*`,`Victoire : *${r.winner==='wolves'?'🐺 LOUPS':'🏘️ VILLAGE'}*`,'',r.roster].join('\n');}

module.exports={
  name:'wolf',aliases:['werewolf','loupgarou','loup-garou'],category:'🎮 Jeux & Fun',description:'Loup-Garou multijoueur avec rôles et nuit privés',
  usage:`${prefix}wolf create|join|leave|start|status|vote <n>|force|stop`,groupOnly:true,adminOnly:false,botAdminNeeded:false,
  async execute(sock,msg,args,extra){const from=extra.from,sender=extra.sender,sub=String(args[0]||'').toLowerCase();
    if(!sub||sub==='help'||sub==='menu')return extra.reply(['🐺 *LOUP-GAROU — GAME CENTER*','',`${prefix}wolf create`,`${prefix}wolf join`,`${prefix}wolf start`,`${prefix}wolf status`,`${prefix}wolf vote <numéro>`,`${prefix}wolf force  ← hôte/admin si partie bloquée`,`${prefix}wolf stop`,'',`👥 ${MIN_WOLF_PLAYERS}–${MAX_WOLF_PLAYERS} joueurs. Rôles et actions de nuit en DM.`].join('\n')+sep());
    if(sub==='create'){const g=werewolf.create(from,sender);if(g.error)return extra.reply(`⚠️ Une partie Loup-Garou existe déjà.${sep()}`);return sock.sendMessage(from,{text:`🐺 *LOBBY LOUP-GAROU*\nHôte : ${tag(sender)}\nRejoignez : *${prefix}wolf join*\nLancement : *${prefix}wolf start*\n🆔 #${g.alias}${sep()}`,mentions:[sender]},{quoted:msg});}
    if(sub==='join'){const r=werewolf.join(from,sender);if(r.error==='joined')return extra.reply(`♻️ Tu es déjà inscrit(e).${sep()}`);if(r.error==='full')return extra.reply(`⛔ Lobby complet.${sep()}`);if(r.error)return extra.reply(`❌ Aucun lobby ouvert.${sep()}`);return sock.sendMessage(from,{text:`✅ ${tag(sender)} rejoint Loup-Garou. *${r.game.players.length}/${MAX_WOLF_PLAYERS}*.${sep()}`,mentions:[sender]},{quoted:msg});}
    if(sub==='leave'){const r=werewolf.leave(from,sender);if(r.error==='started')return extra.reply(`🔒 La partie a déjà commencé.${sep()}`);if(r.error)return extra.reply(`❌ Tu n’es pas dans ce lobby.${sep()}`);if(r.cancelled)return extra.reply(`🛑 L’hôte a quitté : lobby annulé.${sep()}`);return extra.reply(`🚪 Tu as quitté le lobby.${sep()}`);}
    if(sub==='start'){
      const r=werewolf.start(from,sender);if(r.error==='host')return extra.reply(`🔒 Seul l’hôte peut lancer.${sep()}`);if(r.error==='players')return extra.reply(`❌ Il faut au moins ${MIN_WOLF_PLAYERS} joueurs.${sep()}`);if(r.error)return extra.reply(`❌ Impossible de lancer cette partie.${sep()}`);
      const delivered=[];let failed=null;for(const p of r.game.players){try{await sock.sendMessage(p,{text:roleDm(r.game,p),mentions:r.game.players});delivered.push(p);}catch(_){failed=p;break;}}
      if(failed){werewolf.cancel(from);for(const p of delivered){try{await sock.sendMessage(p,{text:'🛑 Loup-Garou annulé : tous les rôles privés n’ont pas pu être distribués.'});}catch(_){}}return extra.reply(`❌ Partie annulée : impossible d’envoyer tous les rôles en privé.${sep()}`);}
      return sock.sendMessage(from,{text:`🌙 *NUIT 1*\nLes rôles ont été distribués en privé.\nLes joueurs ayant une action utilisent *${prefix}wolfact* dans leur DM avec le bot.\n🆔 #${r.game.alias}${sep()}`,mentions:r.game.players},{quoted:msg});
    }
    if(sub==='status'||sub==='roster'){const s=werewolf.public(from);if(!s)return extra.reply(`❌ Aucune partie active.${sep()}`);return sock.sendMessage(from,{text:`🐺 *LOUP-GAROU*\nPhase : *${s.phase.toUpperCase()}* • manche ${s.round}\nVivants : *${s.aliveCount}/${s.players.length}*\n\n${publicRoster(s)}\n🆔 #${s.alias}${sep()}`,mentions:s.players},{quoted:msg});}
    if(sub==='vote'){
      const r=werewolf.vote(from,sender,args[1]);if(r.error==='phase')return extra.reply(`❌ Le vote public n’est disponible que le jour.${sep()}`);if(r.error==='dead')return extra.reply(`💀 Un joueur éliminé ne vote plus.${sep()}`);if(r.error==='self')return extra.reply(`❌ Tu ne peux pas voter contre toi-même.${sep()}`);if(r.error)return extra.reply(`❌ Cible invalide. Utilise *${prefix}wolf status* pour les numéros.${sep()}`);
      if(!r.ready)return sock.sendMessage(from,{text:`🗳️ Vote de ${tag(sender)} enregistré.${sep()}`,mentions:[sender]},{quoted:msg});const x=r.resolution;if(x.finished)return sock.sendMessage(from,{text:finishText(x)+sep(),mentions:x.game.players},{quoted:msg});const line=x.eliminated?`☀️ ${tag(x.eliminated)} est éliminé(e) par le village.`:`☀️ Égalité : personne n’est éliminé.`;return sock.sendMessage(from,{text:`${line}\n\n🌙 *NUIT ${x.game.round}* — actions privées avec *${prefix}wolfact #${x.game.alias} ...*.${sep()}`,mentions:x.game.players},{quoted:msg});
    }
    if(sub==='force'){
      const g=werewolf.get(from);if(!g)return extra.reply(`❌ Aucune partie active.${sep()}`);if(sender!==g.host&&!extra.isAdmin&&!extra.isOwner&&!extra.isSupremeOwner)return extra.reply(`🔒 Réservé à l’hôte/admin.${sep()}`);
      const previousPhase=g.phase,r=werewolf.forceResolve(from);if(r.error==='phase')return extra.reply(`❌ Rien à forcer dans le lobby.${sep()}`);if(r.error)return extra.reply(`❌ Impossible de résoudre cette phase.${sep()}`);
      if(r.finished)return sock.sendMessage(from,{text:finishText(r)+sep(),mentions:r.game.players},{quoted:msg});
      if(previousPhase==='night'){const line=r.victim&&!r.saved?`🌅 ${tag(r.victim)} n’a pas survécu à la nuit.`:'🌅 Personne ne meurt cette nuit.';return sock.sendMessage(from,{text:`${line}\n☀️ Votez avec *${prefix}wolf vote <numéro>*.${sep()}`,mentions:r.game.players},{quoted:msg});}
      return sock.sendMessage(from,{text:`☀️ ${r.eliminated?`${tag(r.eliminated)} est éliminé(e).`:'Personne n’est éliminé.'}\n🌙 Nuit ${r.game.round}.${sep()}`,mentions:r.game.players},{quoted:msg});
    }
    if(sub==='stop'){const g=werewolf.get(from);if(!g)return extra.reply(`❌ Aucune partie active.${sep()}`);if(sender!==g.host&&!extra.isAdmin&&!extra.isOwner&&!extra.isSupremeOwner)return extra.reply(`🔒 Réservé à l’hôte/admin.${sep()}`);werewolf.cancel(from);return extra.reply(`🛑 Partie Loup-Garou annulée sans résultat.${sep()}`);}
    return extra.reply(`❓ Utilise *${prefix}wolf* pour l’aide.${sep()}`);
  }
};
