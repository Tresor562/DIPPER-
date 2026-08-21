'use strict';

const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const {tournaments,MIN_TOURNEY_GROUPS,MAX_TOURNEY_GROUPS,MIN_TOURNEY_ROUNDS,MAX_TOURNEY_ROUNDS}=require('../../utils/gameCenterTournament');
const {buildComparableIds}=require('../../utils/jidHelpers');

const prefix=config.prefix||'.';
const footer=()=>styleManager.getPhrases().footer();
const sep=()=>`\n\n${footer()}`;
const codeFrom=args=>String((args||[]).find(x=>String(x).startsWith('#'))||'').replace(/^#/,'').toLowerCase();
const isAdminish=extra=>Boolean(extra.isAdmin||extra.isOwner||extra.isSupremeOwner);
function sameUser(a,b){const aa=buildComparableIds(a),bb=buildComparableIds(b);return aa.some(x=>bb.includes(x));}
function groupName(extra){return extra.groupMetadata?.subject||'Groupe WhatsApp';}
function topText(top){return[`🏆 *TOURNOI #${top.code}* — ${top.status.toUpperCase()}`,'',...top.rows.map(r=>`${r.rank}. *${r.name}* — ${r.score} pts • ${r.correct} ✅ • ${r.progress}/${top.rounds}`)].join('\n');}

module.exports={
  name:'tourney',aliases:['tournament','tournoi','gametournament'],category:'🎮 Jeux & Fun',description:'Tournoi Quiz Race entre plusieurs groupes et sessions du bot',
  usage:`${prefix}tourney create general 5 | join #code | start #code | next #code | answer #code 2 | top #code | stop #code`,groupOnly:true,adminOnly:false,botAdminNeeded:false,
  async execute(sock,msg,args,extra){
    const from=extra.from,sender=extra.sender,sub=String(args[0]||'').toLowerCase();
    if(!sub||sub==='help'||sub==='menu')return extra.reply([
      '🏆 *TOURNOI INTERGROUPES — QUIZ RACE*','',
      `${prefix}tourney create general 5  ← admin`,`${prefix}tourney join #code  ← admin`,`${prefix}tourney start #code  ← organisateur`,
      `${prefix}tourney next #code`,`${prefix}tourney answer #code 2`,`${prefix}tourney top #code`,`${prefix}tourney stop #code`,'',
      `👥 ${MIN_TOURNEY_GROUPS}–${MAX_TOURNEY_GROUPS} groupes • ${MIN_TOURNEY_ROUNDS}–${MAX_TOURNEY_ROUNDS} questions.`,
      'Chaque groupe reçoit la même séquence. Une seule réponse de groupe est acceptée par manche.'
    ].join('\n')+sep());
    if(sub==='create'){
      if(!isAdminish(extra))return extra.reply(`🔒 Création réservée aux admins du groupe.${sep()}`);
      const category=String(args[1]||'general').toLowerCase(),rounds=Number(args[2])||5;
      const t=tournaments.create({chatId:from,groupName:groupName(extra),organizer:sender,category,rounds});
      if(t.error==='category')return extra.reply(`❌ Catégorie : *general | anime | football*.${sep()}`);if(t.error)return extra.reply(`⚠️ Ce groupe organise déjà un tournoi actif.${sep()}`);
      return extra.reply(`🏆 *TOURNOI CRÉÉ*\nCatégorie : *${t.category}* • ${t.rounds} questions\nCode : *#${t.code}*\n\nPartage ce code aux autres groupes. Leurs admins utilisent *${prefix}tourney join #${t.code}*.${sep()}`);
    }
    const code=codeFrom(args);if(!code)return extra.reply(`❌ Indique le code du tournoi, ex. *#a1b2c3...*.${sep()}`);
    if(sub==='join'){
      if(!isAdminish(extra))return extra.reply(`🔒 Inscription du groupe réservée aux admins.${sep()}`);
      const r=tournaments.join(code,{chatId:from,groupName:groupName(extra)});if(r.error==='started')return extra.reply(`❌ Le tournoi a déjà commencé.${sep()}`);if(r.error==='joined')return extra.reply(`♻️ Ce groupe est déjà inscrit.${sep()}`);if(r.error==='full')return extra.reply(`⛔ Tournoi complet.${sep()}`);if(r.error)return extra.reply(`❌ Tournoi introuvable.${sep()}`);
      return extra.reply(`✅ *${groupName(extra)}* rejoint le tournoi #${code}.\nGroupes inscrits : *${r.tournament.groups.length}/${MAX_TOURNEY_GROUPS}*.${sep()}`);
    }
    if(sub==='start'){
      if(!isAdminish(extra))return extra.reply(`🔒 Réservé aux admins.${sep()}`);const t=tournaments.get(code);if(!t)return extra.reply(`❌ Tournoi introuvable.${sep()}`);if(t.ownerGroup!==from||!sameUser(sender,t.organizer))return extra.reply(`🔒 Seul l’organisateur depuis son groupe d’origine peut lancer.${sep()}`);
      const r=tournaments.start(code,{chatId:from,userId:t.organizer});if(r.error==='groups')return extra.reply(`❌ Il faut au moins ${MIN_TOURNEY_GROUPS} groupes.${sep()}`);if(r.error)return extra.reply(`❌ Impossible de lancer ce tournoi.${sep()}`);
      return extra.reply(`🚀 *TOURNOI LANCÉ !*\n${r.tournament.groups.length} groupes • ${r.tournament.rounds} questions.\n\nDans chaque groupe : *${prefix}tourney next #${code}*.${sep()}`);
    }
    if(sub==='next'){
      const r=tournaments.next(code,from);if(r.error==='group')return extra.reply(`🔒 Ce groupe n’est pas inscrit.${sep()}`);if(r.error==='phase')return extra.reply(`⏳ Le tournoi n’a pas encore commencé.${sep()}`);if(r.error==='finished')return extra.reply(`✅ Ce groupe a terminé. Consulte *${prefix}tourney top #${code}*.${sep()}`);if(r.error)return extra.reply(`❌ Tournoi introuvable.${sep()}`);
      return extra.reply([`🏆 *QUIZ RACE #${code}* — ${r.number}/${r.total}`,'',`*${r.question}*`,'',...r.options.map((o,i)=>`${i+1}. ${o}`),'',`Réponse du groupe : *${prefix}tourney answer #${code} <1-4>*`].join('\n')+sep());
    }
    if(sub==='answer'||sub==='reponse'||sub==='réponse'){
      const choice=args.find((x,i)=>i>0&&!String(x).startsWith('#'));
      const r=tournaments.answer(code,from,choice);if(r.error==='next')return extra.reply(`❌ Demande d’abord la question avec *${prefix}tourney next #${code}*.${sep()}`);if(r.error==='choice')return extra.reply(`❌ Réponds par *1, 2, 3 ou 4*.${sep()}`);if(r.error==='group')return extra.reply(`🔒 Ce groupe n’est pas inscrit.${sep()}`);if(r.error==='finished')return extra.reply(`✅ Ce groupe a déjà terminé.${sep()}`);if(r.error)return extra.reply(`❌ Tournoi indisponible.${sep()}`);
      const verdict=r.correct?'✅ *BONNE RÉPONSE !* +10 pts':`❌ Mauvaise réponse. Bonne réponse : *${r.correctChoice+1}. ${r.correctText}*`;
      const next=r.finished?'🏁 Votre groupe a terminé le tournoi.':`➡️ Question suivante : *${prefix}tourney next #${code}*`;
      return extra.reply(`${verdict}\nScore du groupe : *${r.score} pts*\n${next}${r.tournamentFinished?`\n\n${topText({code,status:'finished',rounds:r.leaderboard[0]?.progress||0,rows:r.leaderboard})}`:''}${sep()}`);
    }
    if(sub==='top'||sub==='leaderboard'||sub==='classement'){
      const top=tournaments.top(code);if(!top)return extra.reply(`❌ Tournoi introuvable.${sep()}`);return extra.reply(topText(top)+sep());
    }
    if(sub==='status'){
      const t=tournaments.public(code);if(!t)return extra.reply(`❌ Tournoi introuvable.${sep()}`);return extra.reply(`🏆 *#${code}* • ${t.category} • ${t.status}\nQuestions : ${t.rounds}\nGroupes : ${t.groups.length}\n${t.groups.map(g=>`• ${g.name} — ${g.score} pts (${g.index}/${t.rounds})`).join('\n')}${sep()}`);
    }
    if(sub==='stop'){
      const t=tournaments.get(code);if(!t)return extra.reply(`❌ Tournoi introuvable.${sep()}`);if(t.ownerGroup!==from||(!sameUser(sender,t.organizer)&&!extra.isOwner&&!extra.isSupremeOwner))return extra.reply(`🔒 Seul l’organisateur peut arrêter ce tournoi depuis son groupe.${sep()}`);
      const r=tournaments.stop(code,{chatId:from,userId:t.organizer});if(r.error)return extra.reply(`❌ Impossible d’arrêter le tournoi.${sep()}`);return extra.reply(`🛑 Tournoi #${code} arrêté.${sep()}`);
    }
    return extra.reply(`❓ Utilise *${prefix}tourney* pour l’aide.${sep()}`);
  }
};
