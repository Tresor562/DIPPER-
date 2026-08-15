'use strict';

function norm(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}

function analyzeRequest(text='', { isGroup=false }={}) {
  const t=norm(text);
  const asksCurrent=/\b(aujourd'hui|actuel|actuellement|maintenant|dernier|derniere|recent|recente|prix|meteo|score|president|ceo|version|sortie|date)\b/.test(t);
  const asksResearch=/\b(cherche|recherche|verifie|source|sources|web|internet|trouve|recoupe)\b/.test(t)||asksCurrent;
  const asksAction=/\b(execute|lance|cree|modifie|supprime|programme|planifie|envoie|ferme|ouvre|organise|corrige)\b/.test(t);
  const complex=/\b(analyse|compare|explique pourquoi|raisonne|diagnostique|plan detaille|plusieurs etapes|en profondeur|architecture|strategie)\b/.test(t)||t.length>650;
  const ambiguous=/^(oui|non|ok|vas-y|continue|lui|elle|ca|ça|le premier|le deuxieme|pourquoi|comment)$/i.test(String(text).trim());
  const sensitive=/\b(api[_ -]?key|token|secret|password|mot de passe|cookie|session)\b/i.test(text);
  const mode=asksAction?'agent':complex?'deep':ambiguous?'normal':'normal';
  return { asksCurrent, asksResearch, asksAction, complex, ambiguous, sensitive, isGroup:Boolean(isGroup), mode };
}

function directive(meta={}) {
  const rules=[
    'Réponds d’abord à la dernière demande explicite de l’utilisateur, sans dériver vers un ancien sujet.',
    'Utilise l’historique seulement pour résoudre les références et conserver la continuité.',
    'Si une information manque réellement, dis exactement laquelle; ne demande pas du contexte vague.',
    'Distingue les faits, les inférences et les suppositions. N’invente pas de fait pour remplir un vide.',
    'Ne répète pas une formulation récente si tu peux répondre plus directement.'
  ];
  if(meta.asksCurrent) rules.push('La demande dépend d’informations potentiellement récentes: utilise une recherche ou une source fraîche avant d’affirmer un fait temporel.');
  if(meta.asksResearch) rules.push('La demande nécessite une recherche: synthétise les résultats, recoupe les sources et signale les contradictions importantes.');
  if(meta.asksAction) rules.push('La demande implique une action: sépare compréhension, vérification des permissions, exécution réelle et compte-rendu; ne prétends jamais avoir agi sans résultat confirmé.');
  if(meta.complex) rules.push('La demande est complexe: construis mentalement un plan, vérifie les hypothèses, puis donne une réponse structurée et utile sans exposer de raisonnement interne détaillé.');
  if(meta.ambiguous) rules.push('Le message est court/elliptique: résous-le à partir des derniers tours pertinents; ne demande une clarification que si plusieurs interprétations restent réellement plausibles.');
  if(meta.sensitive) rules.push('Le message contient potentiellement des données sensibles: n’envoie rien à un fournisseur externe et ne les répète pas dans la réponse.');
  return `POLITIQUE COGNITIVE DU TOUR\n- ${rules.join('\n- ')}`;
}

module.exports={analyzeRequest,directive};
