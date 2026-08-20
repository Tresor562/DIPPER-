'use strict';

const { MAX_STYLE, THEMES, normalizeStyle, getStyleName } = require('./styleCatalog');

let _styleActif = 0;

function getStyle(){ return _styleActif; }
function setStyle(n){ const value=Number(n); if(Number.isInteger(value)&&value>=0&&value<=MAX_STYLE) _styleActif=value; return _styleActif; }

function personaFromTheme(theme){
  const line=(text)=>`${theme.mark} ${text}`.trim();
  return {
    footer:()=>`> *${theme.signature}*`,
    error:()=>line(theme.error),
    wait:()=>line(theme.wait),
    success:()=>line(theme.success),
    denied:()=>line(theme.denied),
    groupOnly:()=>line('Commande disponible uniquement en groupe.'),
    adminOnly:()=>line('Commande réservée aux administrateurs du groupe.'),
    botAdmin:()=>line('Le bot doit être administrateur pour effectuer cette action.'),
  };
}

const PERSONAS=Object.fromEntries(Object.entries(THEMES).map(([id,theme])=>[Number(id),personaFromTheme(theme)]));
const STYLE_NAMES=Object.fromEntries(Object.entries(THEMES).map(([id,theme])=>[Number(id),theme.name]));

function getPhrases(overrideStyle){
  const selected=(overrideStyle!==undefined&&overrideStyle!==null)?normalizeStyle(overrideStyle):_styleActif;
  return PERSONAS[selected]||PERSONAS[0];
}

module.exports={getStyle,setStyle,getPhrases,getStyleName,STYLE_NAMES,PERSONAS,MAX_STYLE};
