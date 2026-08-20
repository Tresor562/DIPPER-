'use strict';

// [STYLE COMPACT SEPARATORS 2026-08-16]
const styleManager=require('./styleManager');
const {THEMES,getTheme,normalizeStyle}=require('./styleCatalog');
const PROFILES=THEMES;
const TYPE_ICONS={info:'',wait:'⏳',success:'✅',warning:'⚠️',error:'❌',denied:'🔒',usage:'',list:''};

function activeStyle(style){
  if(style!==undefined&&style!==null)return normalizeStyle(style);
  try{return normalizeStyle(styleManager.getStyle());}catch(_){return 0;}
}
function getProfile(style){return getTheme(activeStyle(style));}
function separatorFor(style){return getProfile(style).separator||THEMES[0].separator;}
function normalizeLine(line){return String(line??'').replace(/[\u2500-\u257f≪≫╼╾]/g,' ').replace(/[ \t]{2,}/g,' ').trimEnd();}
function sanitizeLegacyText(text,style){
  if(typeof text!=='string'||!text)return text;
  const sep=separatorFor(style); const out=[]; let lastBlank=false;
  for(const raw of text.replace(/\r\n/g,'\n').split('\n')){
    const trimmed=raw.trim();
    if(trimmed&&/^[\s*`_~.·•✦★☆♰☩♔◈∞=+\-—–_<>\[\](){}|/\\:;,'"!?⚔️⭐🌑🍃🌀🕶️⬆️✨🌸💗♾️👁️🌿🎀🩸🗡️♟️🪷⚡⛓️☾👑🌒🕯️🔥☄️🦇🦋😈🎯💚🩵🟣⛩️୨ৎ]+$/u.test(trimmed)&&trimmed.length>8){if(out[out.length-1]!==sep)out.push(sep);lastBlank=false;continue;}
    const clean=normalizeLine(raw).replace(/^\s*[|:]+\s*/,'');
    const blank=!clean.trim(); if(blank&&lastBlank)continue; out.push(clean); lastBlank=blank;
  }
  while(out.length&&!out[0].trim())out.shift(); while(out.length&&!out[out.length-1].trim())out.pop();
  return out.join('\n');
}
function inferType(text){const t=String(text||'').toLowerCase();if(/❌|erreur|échec|echec|invalid/.test(t))return'error';if(/🔒|denied|refus|réservé|reserve/.test(t))return'denied';if(/⚠️|attention|warning/.test(t))return'warning';if(/⏳|traitement|chargement|en cours|processing/.test(t))return'wait';if(/✅|succès|succes|réussi|reussi|terminé|termine|completed/.test(t))return'success';return'info';}
function renderResponse({type='info',title='',body='',details='',footer=true,style}={}){const p=getProfile(style);const icon=TYPE_ICONS[type]||'';const lines=[];const head=[p.mark,icon,String(title||'').trim()].filter(Boolean).join(' ');if(head)lines.push(head);if(title)lines.push(separatorFor(style));let main=String(body||'').trim();if(!main)main=type==='wait'?p.wait:type==='success'?p.success:type==='error'?p.error:type==='denied'?p.denied:'';if(main)lines.push(main);if(details)lines.push('',String(details).trim());if(footer)lines.push('',p.signature);return sanitizeLegacyText(lines.join('\n'),style);}
function getLegacyPhrases(style){return styleManager.getPhrases(activeStyle(style));}
function decoratePayload(payload,style){if(!payload||typeof payload!=='object'||payload.react||payload.delete)return payload;const next={...payload};let changed=false;for(const key of['text','caption']){if(typeof next[key]==='string'){const cleaned=sanitizeLegacyText(next[key],style);if(cleaned!==next[key]){next[key]=cleaned;changed=true;}}}return changed?next:payload;}
module.exports={PROFILES,getProfile,separatorFor,sanitizeLegacyText,inferType,renderResponse,getLegacyPhrases,decoratePayload};
