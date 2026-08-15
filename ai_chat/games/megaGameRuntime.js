'use strict';

const { designFromText, describePlan } = require('./gameDesigner');
const { enrichGameSpec, judgeCreativeAnswer } = require('./gameContentGenerator');

const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const refOf=s=>String(s||'').match(/#([a-z0-9_-]{2,32})/i)?.[1]||null;
const mention=id=>`@${String(id||'').split('@')[0]}`;

function isDesignIntent(text='') {
  const t=norm(text);
  return /\b(?:organise|prepare|programme|planifie|cree|fais|lance)\b/.test(t)
    && /\b(?:jeu|quiz|tournoi|competition|concours|battle royale|pendu|personnage mystere|action.*verite)\b/.test(t)
    && (/\b(?:demain|aujourd hui|ce soir|a\s*\d{1,2}(?:h|:)|vers\s*\d{1,2})\b/.test(t) || /\b(?:organise|programme|planifie|prepare)\b/.test(t));
}
function eventListText(td,chatId){const rows=td.list(chatId,{activeOnly:true});if(!rows.length)return'Aucun événement Game Master actif ici.';return ['🏟️ *Événements Exaucée*',...rows.map((e,i)=>`${i+1}. *${e.title}* #${e.alias} — ${e.status} — ${Object.keys(e.players||{}).length}/${e.maxPlayers}`)].join('\n');}
function rankingText(td,chatId,ref){const board=td.standings(chatId,ref,20);if(!board.length)return'Aucun classement disponible pour cet événement.';return ['🏆 *Classement*',...board.map(x=>`${x.rank}. ${mention(x.userId)} — ${x.score} pt${x.score===1?'':'s'}`)].join('\n');}
function activeByType(td,chatId,ref,type=null){if(ref){const e=td.get(chatId,ref);return e?.status==='playing'&&(!type||e.gameType===type)?e:null;}const rows=td.list(chatId,{activeOnly:true}).filter(e=>e.status==='playing'&&(!type||e.gameType===type));return rows.length===1?rows[0]:null;}

async function handleMegaGameMaster(exaucee,{chatId,userId,text,msg,actor={},send}){
  const raw=String(text||'').trim(),t=norm(raw),td=exaucee.tournamentDirector;if(!td)return false;const ref=refOf(raw);const canManage=Boolean(actor.isOwner||actor.isSuperMe||actor.isAdmin);
  if (/\b(?:liste|montre|affiche)\b.*\b(?:tournois?|evenements?|competitions?|jeux programmes?)\b/.test(t)) { await send(eventListText(td,chatId)); return true; }
  if (/\b(?:je participe|inscris moi|je m inscris|participer)\b/.test(t) && ref) { const r=td.register(chatId,ref,userId,{name:msg?.pushName||''}); const messages={not_found:`Je ne trouve pas l’événement #${ref}.`,closed:'Les inscriptions sont fermées.',full:'Toutes les places sont déjà prises.'}; await send(r.ok?`✅ Inscription confirmée pour *${r.event.title}* #${r.event.alias}.\nParticipants : ${r.count}/${r.event.maxPlayers}`:(messages[r.reason]||'Inscription impossible.')); return true; }
  if (/\b(?:je me retire|desinscris moi|annule mon inscription)\b/.test(t)&&ref){await send(td.unregister(chatId,ref,userId)?`Tu es retiré de #${ref}.`:`Je ne trouve pas ton inscription sur #${ref}.`);return true;}
  if (/\b(?:classement|leaderboard|scores?)\b/.test(t) && ref){await send(rankingText(td,chatId,ref));return true;}
  if (canManage && ref && /\b(?:demarre|commence|lance)\b.*\b(?:maintenant|tout de suite)\b/.test(t)) { const r=td.start(chatId,ref); if(!r.ok){await send(r.reason==='not_enough_players'?`Il faut encore des joueurs : ${r.count}/${r.min}.`:`Je ne trouve pas #${ref}.`);return true;} await send(`🚀 *${r.event.title}* démarre !\n${Object.keys(r.event.players).length} participant(s).\nManche 1 : ${r.round?.name||'Départ'}${r.round?.prompt?`\n\n${r.round.prompt}`:''}`);return true; }
  if (canManage && ref && /\b(?:manche suivante|round suivant|prochaine manche)\b/.test(t)) { const r=td.nextRound(chatId,ref); if(!r.ok){await send(`Je ne trouve pas #${ref}.`);return true;} if(r.finished){await send(`🏁 Événement terminé.\n${rankingText(td,chatId,ref)}`);return true;} await send(`➡️ *${r.round.name}* commence — #${r.event.alias}${r.round?.prompt?`\n\n${r.round.prompt}`:''}`);return true; }
  if (canManage && ref && /\b(?:termine|cloture|finis)\b.*\b(?:tournoi|jeu|evenement|competition)?\b/.test(t)) { const r=td.finish(chatId,ref);if(!r.ok){await send(`Je ne trouve pas #${ref}.`);return true;} const awards=(r.awards||[]).map(a=>`${a.label} : ${mention(a.userId)} (${a.score} pts)`).join('\n'); await send(`🏁 *${r.event.title} terminé !*\n\n${rankingText(td,chatId,ref)}${awards?`\n\n🎁 *Récompenses*\n${awards}`:''}`);return true; }
  if (canManage && ref && /\b(?:annule|arrete|supprime)\b.*\b(?:tournoi|jeu|evenement|competition)\b/.test(t)) {const e=td.cancel(chatId,ref);await send(e?`🛑 *${e.title}* #${e.alias} est annulé.`:`Je ne trouve pas #${ref}.`);return true;}
  const scoreM=raw.match(/(?:donne|ajoute|attribue)\s+(-?\d+)\s*(?:points?|pts?)\s+(?:a|à)\s+@?(\d{5,20}).*#([a-z0-9_-]{2,32})/i);
  if(canManage&&scoreM){const jid=scoreM[2].includes('@')?scoreM[2]:`${scoreM[2]}@s.whatsapp.net`;const r=td.score(chatId,scoreM[3],jid,Number(scoreM[1]),'attribution manuelle');await send(r?`✅ ${scoreM[1]} point(s) attribué(s) à ${mention(jid)}.\n${rankingText(td,chatId,scoreM[3])}`:`Je ne trouve pas #${scoreM[3]}.`);return true;}
  if (canManage && isDesignIntent(raw)) { let spec=designFromText(raw,{by:userId}); spec=await enrichGameSpec(exaucee.ai,spec); const event=td.create(chatId,spec); await send(`${describePlan(event)}\n\n✅ J’ai préparé et programmé l’événement.\nID : #${event.alias}\nContenu : ${event.metadata?.contentSource||'plan local'}\nLes inscriptions, manches, chronos, arbitrage, classement et récompenses seront gérés automatiquement.\nPour participer : *je participe #${event.alias}*`); return true; }

  const live=activeByType(td,chatId,ref,null);
  if(live && live.players?.[userId]){
    const cleaned=raw.replace(/#[a-z0-9_-]{2,32}/i,'').replace(/^\s*(?:reponse|réponse|answer)\s*[:=-]?\s*/i,'').trim();
    if(!cleaned)return false;
    if(live.gameType==='quiz'){
      const r=td.submitQuizAnswer(chatId,live.id,userId,cleaned);if(r.handled){if(r.duplicate){await send(`Une seule réponse par manche pour #${live.alias} 👀`);return true;}await send(r.correct?`✅ Bonne réponse ${mention(userId)} ! +${r.points} pt${r.points===1?'':'s'}.`:`❌ Réponse enregistrée. On attend la fin du chrono.`);return true;}
    } else {
      const round=live.rounds?.[live.currentRound];if(!round)return false;let verdict;
      if(round.mode==='participation')verdict={accepted:true,points:round.points,feedback:'Participation validée.'};
      else if(round.mode==='first_response')verdict={accepted:true,points:round.points,feedback:'Réponse prise en compte.'};
      else if(round.mode==='vote')verdict={accepted:true,points:0,feedback:'Vote enregistré.'};
      else verdict=await judgeCreativeAnswer(exaucee.ai,{round,answer:cleaned});
      const r=td.submitJudgedAnswer(chatId,live.id,userId,cleaned,verdict);if(r.handled){if(r.duplicate){await send(`Une seule participation par manche pour #${live.alias}.`);return true;}await send(`${r.accepted?'✅':'❌'} ${r.feedback||'Réponse enregistrée.'}${r.points?` +${r.points} pt${r.points===1?'':'s'}`:''}`);return true;}
    }
  }
  return false;
}

module.exports={handleMegaGameMaster,isDesignIntent,eventListText,rankingText,activeByType};
