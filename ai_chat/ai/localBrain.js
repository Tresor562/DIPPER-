'use strict';

function normalize(text = '') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function hash(text = '') {
  let h = 0;
  for (const c of String(text)) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function pick(list, seed = '') { return list[hash(seed) % list.length]; }

function lastUser(messages = []) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === 'user') return String(messages[i].content || '').trim();
  return '';
}

function recent(messages = [], role) {
  return messages.filter(m => m?.role === role).slice(-4).map(m => String(m.content || '')).filter(Boolean);
}

function safeArithmetic(text) {
  const m = String(text).match(/(?:combien\s+(?:font|fait)|calcule|calcul|=)?\s*(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)\s*\??$/i);
  if (!m) return null;
  const a = Number(m[1]), op = m[2], b = Number(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (op === '/' && b === 0) return 'Division par zéro impossible';
  const value = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b;
  return Number.isFinite(value) ? `${a} ${op} ${b} = ${value}` : null;
}

function stripContextHints(text = '') {
  return String(text).replace(/\n\n\[Contexte implicite:[\s\S]*$/i, '').trim();
}

function detectMood(t) {
  if (/\b(triste|mal|deprime|fatigue|angoisse|peur|stresse|seul|seule)\b/.test(t)) return 'low';
  if (/\b(content|heureux|super|genial|cool|incroyable)\b/.test(t)) return 'high';
  return 'neutral';
}

function conversationalFallback(messages = []) {
  const raw = stripContextHints(lastUser(messages));
  const t = normalize(raw).replace(/^exaucee\s*[,!:;\-]?\s*/i, '');
  const previousAssistant = recent(messages, 'assistant').at(-1) || '';
  const seed = raw + previousAssistant;

  if (!t) return pick([
    `Je suis là. Vas-y, je t'écoute.`,
    `Oui ? Dis-moi.`,
    `Je t'écoute, continue.`
  ], seed);

  const mood = detectMood(t);
  if (mood === 'low') {
    return pick([
      `Ça n'a pas l'air simple. Raconte-moi ce qui s'est passé, même en vrac, et on remet ça au clair ensemble.`,
      `Je vois que ça te pèse. Dis-moi juste ce qui te dérange le plus là, maintenant — on part de ça.`,
      `D'accord. Je reste avec toi sur le sujet. Qu'est-ce qui t'a mis dans cet état ?`
    ], seed);
  }

  if (/^(oui|ok|d'accord|vas[- ]y|continue|encore)\b/.test(t) && previousAssistant) {
    return pick([
      `D'accord, je continue à partir de là.`,
      `Très bien, on garde ce fil.`,
      `Ça marche, je poursuis.`
    ], seed) + ` ${previousAssistant.length > 500 ? 'Je vais aller à l’essentiel pour la suite.' : ''}`.trim();
  }

  if (/\b(tu en penses quoi|ton avis|qu'en penses tu)\b/.test(t)) {
    return pick([
      `Mon avis dépend surtout de ce que tu veux obtenir. Si tu me donnes le contexte ou les deux options, je te dirai clairement laquelle me paraît la meilleure et pourquoi.`,
      `Je peux te donner un vrai avis, pas juste te dire “ça dépend”. Donne-moi les éléments importants et je tranche avec les avantages, les risques et ce que je choisirais.`
    ], seed);
  }

  if (/\b(aide[- ]moi|j'ai besoin d'aide|je fais comment)\b/.test(t)) {
    return pick([
      `Oui. Dis-moi où tu bloques exactement et ce que tu as déjà essayé ; je vais partir de là plutôt que te faire recommencer depuis zéro.`,
      `On va le résoudre. Donne-moi le résultat que tu veux obtenir, ce qui se passe actuellement et, s'il y en a une, l'erreur exacte.`
    ], seed);
  }

  if (/\?$/.test(raw)) {
    return pick([
      `Je peux raisonner dessus, mais je préfère éviter de t'inventer un fait. Donne-moi un peu plus de contexte ou un exemple concret et je te répondrai plus précisément.`,
      `Je comprends ce que tu cherches. Là, mon noyau local n'a pas assez d'information fiable pour affirmer une réponse précise. Si tu me précises le contexte, je peux analyser le problème avec toi.`,
      `Je ne veux pas te répondre au hasard. Reformule avec le détail qui te semble le plus important et je vais pousser le raisonnement plus loin.`
    ], seed);
  }

  return pick([
    `D'accord. Continue, je suis le fil. Si tu veux que j'agisse dessus, dis-moi simplement ce que tu veux obtenir.`,
    `Je te suis. On peut creuser ça, le transformer en plan concret ou juste en discuter — à toi de voir.`,
    `Je vois où tu veux en venir. Donne-moi la suite ou le point précis sur lequel tu veux que je me concentre.`
  ], seed);
}

function highConfidence(messages = []) {
  const raw = stripContextHints(lastUser(messages));
  const t = normalize(raw).replace(/^exaucee\s*[,!:;\-]?\s*/i, '');
  if (!t) return null;
  const arithmetic = safeArithmetic(t);
  if (arithmetic) return { text: pick([`Ça donne *${arithmetic}*.`, `Résultat : *${arithmetic}*.`, `*${arithmetic}*.`], raw), confidence: 0.99 };
  if (/^(salut|bonjour|bonsoir|hello|hey|coucou)\b/.test(t)) return { text: pick([`Coucou 🌸 Qu'est-ce qu'on fait ?`, `Hey, je suis là. Tu veux parler de quoi ?`, `Salut 🌸 Dis-moi.`], raw), confidence: 0.98 };
  if (/\b(qui es[- ]tu|presente[- ]toi|ton nom|comment tu t'appelles)\b/.test(t)) return { text: `Je suis Exaucée 🌸 Je vis dans THE BIG DIPPER : je peux discuter, garder le contexte, mémoriser ce que tu me demandes, gérer des rappels et des jeux, et utiliser les outils du bot quand j'en ai l'autorisation.`, confidence: 0.99 };
  if (/\b(merci|thanks|thank you)\b/.test(t)) return { text: pick([`Avec plaisir.`, `Toujours 🌸`, `Pas de souci.`], raw), confidence: 0.99 };
  if (/\b(comment vas[- ]tu|ca va|tu vas bien)\b/.test(t)) return { text: pick([`Oui, tranquille 🌸 Et toi ?`, `Ça va bien. Quoi de neuf de ton côté ?`, `Oui. Je suis en forme, vas-y 😌`], raw), confidence: 0.98 };
  if (/\b(aide|help|que peux[- ]tu faire|tes capacites|tes fonctions)\b/.test(t)) return { text: `Je peux tenir une conversation dans la durée, retenir des éléments utiles, gérer rappels et jeux, comprendre des demandes en langage naturel et utiliser les commandes/outils autorisés du bot. Si une demande exige une information que je n'ai pas localement, je peux aussi consulter un moteur externe quand il est disponible.`, confidence: 0.96 };
  if (/\b(qu'est[- ]ce que|c'est quoi)\s+(une?\s+)?intelligence artificielle\b/.test(t)) return { text: `Une intelligence artificielle est un système capable d'effectuer des tâches qui demandent normalement certaines formes de perception, de compréhension, de prédiction ou de génération. Les modèles de langage, par exemple, apprennent des structures du langage à partir de grandes quantités de données puis génèrent du texte en fonction du contexte.`, confidence: 0.97 };
  return null;
}

class LocalBrain {
  answer(messages = []) { return highConfidence(messages); }
  fallback(messages = []) { return { provider: 'exaucee-local-brain', text: conversationalFallback(messages) }; }
}

module.exports = { LocalBrain, highConfidence, conversationalFallback, safeArithmetic, stripContextHints };
