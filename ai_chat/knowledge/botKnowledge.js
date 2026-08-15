'use strict';

function norm(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function arr(v){return Array.isArray(v)?v:(v?[v]:[]);}
function bool(obj, keys){for(const k of keys){if(obj && obj[k]===true)return true;}return false;}

class BotKnowledge {
  constructor({ getCommands = () => global.commands || new Map(), getDynamicCommands = null, capabilities = [] } = {}) {
    this.getCommands=getCommands;
    this.getDynamicCommands=getDynamicCommands;
    this.capabilities=capabilities;
    this.cache={at:0,items:[],stats:{}};
  }

  _record(key, cmd){
    const name=String(cmd?.name||cmd?.command||key||'').toLowerCase();
    const aliases=[...new Set(arr(cmd?.aliases||cmd?.alias).map(x=>String(x).toLowerCase()).filter(Boolean))];
    const description=String(cmd?.description||cmd?.desc||cmd?.help||'').trim();
    const usage=String(cmd?.usage||cmd?.syntax||'').trim();
    const category=String(cmd?.category||cmd?.type||cmd?.group||'general').trim().toLowerCase();
    const ownerOnly=bool(cmd,['owner','ownerOnly','isOwner','superOwner']);
    const adminOnly=bool(cmd,['admin','adminOnly','isAdmin']);
    const groupOnly=bool(cmd,['group','groupOnly','isGroup']);
    const privateOnly=bool(cmd,['private','privateOnly']);
    const botAdmin=bool(cmd,['botAdmin','botAdminOnly','requiresBotAdmin']);
    return {name,aliases,description,usage,category,ownerOnly,adminOnly,groupOnly,privateOnly,botAdmin};
  }

  refresh(force=false){
    if(!force && Date.now()-this.cache.at<30000)return this.cache;
    const registry=this.getCommands?.()||new Map();
    const seen=new Set(); const items=[];
    const entries=registry instanceof Map?[...registry.entries()]:Object.entries(registry||{});
    for(const [key,cmd] of entries){
      if(!cmd||typeof cmd!=='object')continue;
      const id=cmd;
      if(seen.has(id))continue;
      seen.add(id);
      const r=this._record(key,cmd);
      if(r.name)items.push(r);
    }
    const byCategory={};
    for(const c of items)byCategory[c.category]=(byCategory[c.category]||0)+1;
    this.cache={at:Date.now(),items,stats:{total:items.length,byCategory,owner:items.filter(x=>x.ownerOnly).length,admin:items.filter(x=>x.adminOnly).length,group:items.filter(x=>x.groupOnly).length}};
    return this.cache;
  }

  search(query,{limit=8}={}){
    const q=norm(query); const tokens=q.split(/[^a-z0-9]+/).filter(x=>x.length>1);
    const {items}=this.refresh();
    return items.map(c=>{
      const hay=norm([c.name,...c.aliases,c.description,c.usage,c.category].join(' '));
      let score=0;
      if(q===norm(c.name)||c.aliases.some(a=>norm(a)===q))score+=20;
      for(const t of tokens){if(norm(c.name).includes(t))score+=5;else if(c.aliases.some(a=>norm(a).includes(t)))score+=4;else if(hay.includes(t))score+=1;}
      return {c,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.c);
  }

  isBotQuestion(text=''){
    const t=norm(text);
    return /\b(bot|dipper|the big dipper|commande|commandes|menu|alias|owner|admin|groupe|fonction|fonctionnalite|peut il|peut-elle|sait faire)\b/.test(t);
  }

  buildContext(text,{sessionId='default',groupId=null}={}){
    if(!this.isBotQuestion(text))return '';
    const snap=this.refresh();
    const hits=this.search(text,{limit:10});
    let dynamic=[];
    try{dynamic=this.getDynamicCommands?.(sessionId,{groupId})||[];}catch(_){}
    const lines=[
      'CONNAISSANCE INTERNE THE BIG DIPPER — utilise seulement ces faits, n’invente pas de commande.',
      `Commandes statiques chargées: ${snap.stats.total}.`,
      `Catégories: ${Object.entries(snap.stats.byCategory).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}=${v}`).join(', ')||'aucune'}.`,
      `Restrictions détectées: owner=${snap.stats.owner}, admin=${snap.stats.admin}, group-only=${snap.stats.group}.`,
      dynamic.length?`Commandes dynamiques visibles ici: ${dynamic.map(x=>x.name).slice(0,30).join(', ')}.`:'',
      this.capabilities.length?`Capacités Exaucée intégrées: ${this.capabilities.join(', ')}.`:'',
      hits.length?'Commandes pertinentes:\n'+hits.map(c=>{
        const flags=[c.ownerOnly?'owner':null,c.adminOnly?'admin':null,c.groupOnly?'groupe':null,c.privateOnly?'privé':null,c.botAdmin?'bot-admin':null].filter(Boolean).join('|')||'standard';
        return `- .${c.name}${c.aliases.length?` (alias: ${c.aliases.join(', ')})`:''} [${c.category}; ${flags}]${c.description?` — ${c.description}`:''}${c.usage?` — usage: ${c.usage}`:''}`;
      }).join('\n'):'Aucune commande proche trouvée dans le registre actuel.',
      'Si une information manque, dis que tu ne peux pas la confirmer depuis le registre au lieu de deviner.'
    ].filter(Boolean);
    return lines.join('\n\n');
  }

  describe(name){
    const q=norm(name).replace(/^[.!/]/,'');
    const cmd=this.refresh().items.find(c=>norm(c.name)===q||c.aliases.some(a=>norm(a)===q));
    return cmd?structuredClone(cmd):null;
  }
}

module.exports={BotKnowledge};
