'use strict';

const styleManager = require('./styleManager');
const { THEMES } = require('./styleCatalog');
const { engine } = require('./gameCenterEngine');
require('./gameCenterBlock6');

const SUPPORTED = new Set(['anon','anonymous','anonyme','anonclose','anonymousclose','anonymeclose']);

function theme(){ return THEMES[styleManager.getStyle()] || THEMES[0]; }
function banner(label,emoji='🕶️'){ return `${emoji} *${theme().botName} — ${label}*`; }
function labelForType(type){ return type==='anonymous-inbox'?'🕶️ Questions anonymes':null; }
function menuLines(prefix){
  return [
    `${prefix}games anon → 🕶️ Ouvrir les questions anonymes`,
    `${prefix}games anonclose [#id] → 🔒 Fermer la boîte anonyme`,
    `En privé : ${prefix}anon #id ta question → ✉️ Envoyer anonymement`
  ];
}
function canManage(game,sender,extra){ return Boolean(extra.isAdmin||extra.isOwner||extra.isSupremeOwner||game?.by===sender); }
function refArg(value){ return String(value||'').replace(/^#/,'')||null; }

async function handleSubcommand(sock,msg,args,extra,{prefix,sep}){
  const from=extra.from, sender=extra.sender, sub=String(args[0]||'').toLowerCase();

  if(['anon','anonymous','anonyme'].includes(sub)){
    if(!extra.isAdmin&&!extra.isOwner&&!extra.isSupremeOwner){
      return extra.reply(`🔒 Seuls les admins peuvent ouvrir une boîte de questions anonymes.${sep()}`);
    }
    const g=engine.startAnonymousInbox(from,sender);
    if(g.error)return extra.reply(`⚠️ Une boîte anonyme est déjà ouverte dans ce groupe ou la limite de parties est atteinte.${sep()}`);
    return extra.reply([
      banner('QUESTIONS ANONYMES'),'',
      'La boîte est ouverte. Les membres peuvent envoyer une question au bot *en privé* avec :',
      `*${prefix}anon #${g.alias} votre question*`,'',
      '🔐 Le groupe ne voit pas l’identité de l’auteur.',
      '🛡️ Anti-spam : 5 questions maximum par heure et par membre.',
      '🚫 Les liens sont refusés dans les questions anonymes.',
      `🆔 Boîte : #${g.alias}`
    ].join('\n')+sep());
  }

  if(['anonclose','anonymousclose','anonymeclose'].includes(sub)){
    const ref=refArg(args[1]);
    const rows=engine.list(from,{type:'anonymous-inbox'});
    if(!rows.length)return extra.reply(`❌ Aucune boîte anonyme ouverte.${sep()}`);
    if(!ref&&rows.length>1)return extra.reply(`⚠️ Indique l’ID : *${prefix}games anonclose #ID*.${sep()}`);
    const g=engine.get(from,ref,'anonymous-inbox')||(!ref&&rows.length===1?rows[0]:null);
    if(!g)return extra.reply(`❌ Boîte anonyme introuvable.${sep()}`);
    if(!canManage(g,sender,extra))return extra.reply(`🔒 Seul le créateur ou un admin peut fermer cette boîte.${sep()}`);
    const closed=engine.closeAnonymousInbox(from,g.alias);
    return extra.reply(`${banner('BOÎTE FERMÉE','🔒')}\n\nQuestions reçues : *${closed.count||0}*\nID : #${closed.alias}${sep()}`);
  }

  return null;
}

module.exports={SUPPORTED,menuLines,handleSubcommand,labelForType,canManage,banner};
