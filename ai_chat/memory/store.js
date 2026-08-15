'use strict';

const fs = require('fs');
const path = require('path');

const sanitize = (v) => String(v || '').replace(/[^a-zA-Z0-9_@.+:-]/g, '_').slice(0, 180);
const STOP = new Set('le la les un une des de du d et ou a au aux en pour par sur dans avec sans ce cet cette ces je tu il elle on nous vous ils elles mon ma mes ton ta tes son sa ses qui que quoi est sont etre être avoir ai as a avons avez ont me te se y ne pas plus tres très comme'.split(/\s+/));
function words(v='') { return new Set(String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(x=>x.length>2&&!STOP.has(x))); }
function relevance(value, query, ts=0) {
  const A=words(value), B=words(query); let overlap=0;
  for (const w of B) if (A.has(w)) overlap++;
  const lexical = B.size ? overlap / B.size : 0;
  const ageHours = Math.max(0,(Date.now()-Number(ts||0))/3600000);
  const recency = 1/(1+ageHours/48);
  return lexical*0.82 + recency*0.18;
}

class MemoryStore {
  constructor({ root = path.join(process.cwd(), 'data', 'exaucee') } = {}) { this.root = root; this.cache = new Map(); }
  _scope(sessionId, chatId, userId) { return [sanitize(sessionId || 'default'), sanitize(chatId || 'private'), sanitize(userId || 'shared')].join('__'); }
  _file(scope) { return path.join(this.root, `${scope}.json`); }
  _load(scope) {
    if (this.cache.has(scope)) return this.cache.get(scope);
    let value = { facts: [], episodes: [], preferences: {}, summary: '', summaryTurns: 0, updatedAt: 0 };
    try { value = { ...value, ...JSON.parse(fs.readFileSync(this._file(scope), 'utf8')) }; } catch (_) {}
    this.cache.set(scope, value); return value;
  }
  getContext(ids) { return structuredClone(this._load(this._scope(ids.sessionId, ids.chatId, ids.userId))); }
  getRelevantContext(ids, query='', { facts=18, episodes=18 }={}) {
    const state=this._load(this._scope(ids.sessionId, ids.chatId, ids.userId));
    const rank = rows => [...(rows||[])].map((x,i)=>({ ...x, _score:relevance(x.value,query,x.ts), _i:i }))
      .sort((a,b)=>b._score-a._score || b._i-a._i).slice(0, Math.max(1, rows===state.facts?facts:episodes))
      .sort((a,b)=>a.ts-b.ts).map(({_score,_i,...x})=>x);
    return structuredClone({ ...state, facts:rank(state.facts), episodes:rank(state.episodes) });
  }
  remember(ids, item) {
    if (!item || !item.value) return false;
    const scope = this._scope(ids.sessionId, ids.chatId, ids.userId), state = this._load(scope);
    const bucket = item.type === 'episode' ? 'episodes' : 'facts';
    const value = String(item.value).slice(0, 3000);
    if (!state[bucket].slice(-30).some(x => String(x.value) === value)) state[bucket].push({ value, source:item.source||'conversation', ts:Date.now() });
    state[bucket] = state[bucket].slice(bucket === 'episodes' ? -400 : -250); state.updatedAt=Date.now(); this._persist(scope,state); return true;
  }
  setPreference(ids, key, value) { const scope=this._scope(ids.sessionId,ids.chatId,ids.userId), state=this._load(scope); state.preferences[sanitize(key)]=value; state.updatedAt=Date.now(); this._persist(scope,state); }
  updateSummary(ids, userText, assistantText) {
    const scope=this._scope(ids.sessionId,ids.chatId,ids.userId), state=this._load(scope); state.summaryTurns=Number(state.summaryTurns||0)+1;
    const important=[], u=String(userText||'').replace(/\s+/g,' ').trim(), a=String(assistantText||'').replace(/\s+/g,' ').trim();
    if(u) important.push(`U: ${u.slice(0,420)}`); if(a) important.push(`E: ${a.slice(0,420)}`);
    state.summary=[...String(state.summary||'').split('\n').filter(Boolean),...important].slice(-28).join('\n').slice(-9000); state.updatedAt=Date.now(); this._persist(scope,state); return state.summary;
  }
  clearConversation(ids,{keepFacts=true}={}) { const scope=this._scope(ids.sessionId,ids.chatId,ids.userId), state=this._load(scope); state.episodes=[]; state.summary=''; state.summaryTurns=0; if(!keepFacts) state.facts=[]; state.updatedAt=Date.now(); this._persist(scope,state); }
  _persist(scope,state) { fs.mkdirSync(this.root,{recursive:true}); const target=this._file(scope), tmp=`${target}.tmp`; fs.writeFileSync(tmp,JSON.stringify(state,null,2)); fs.renameSync(tmp,target); }
}
module.exports = { MemoryStore, relevance };
