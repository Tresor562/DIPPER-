'use strict';

/**
 * LocalBrain — noyau conversationnel autonome d'Exaucée.
 *
 * Il ne dépend d'aucune API, clé ou service réseau. Ce n'est pas un LLM :
 * il couvre les intentions courantes avec des règles déterministes et sert
 * de dernier cerveau de secours afin qu'Exaucée ne réponde jamais simplement
 * « moteur IA indisponible ».
 */

function normalize(text = '') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function lastUser(messages = []) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return String(messages[i].content || '').trim();
  }
  return '';
}

function safeArithmetic(text) {
  const m = String(text).match(/(?:combien\s+(?:font|fait)|calcule|calcul|=)?\s*([0-9+\-*/().\s]{3,80})\??\s*$/i);
  if (!m) return null;
  const expr = m[1].trim();
  if (!/[+\-*/]/.test(expr) || !/^[0-9+\-*/().\s]+$/.test(expr)) return null;
  try {
    // Parser minimal : on refuse tout caractère hors arithmétique ci-dessus.
    const value = Function(`"use strict"; return (${expr})`)();
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return `${expr} = ${value}`;
  } catch (_) {
    return null;
  }
}

function highConfidence(messages = []) {
  const raw = lastUser(messages);
  const t = normalize(raw).replace(/^exaucee\s*[,!:;\-]?\s*/i, '');
  if (!t) return null;

  const arithmetic = safeArithmetic(t);
  if (arithmetic) return { text: `Le résultat est *${arithmetic}* 🌸`, confidence: 0.98 };

  if (/^(salut|bonjour|bonsoir|hello|hey|coucou)\b/.test(t)) {
    return { text: `Coucou 🌸 Je suis Exaucée. Je suis là et je t'écoute, qu'est-ce que je peux faire pour toi ?`, confidence: 0.98 };
  }
  if (/\b(qui es[- ]tu|presente[- ]toi|ton nom|comment tu t'appelles)\b/.test(t)) {
    return { text: `Je suis *Exaucée* 🌸, l'assistante intelligente intégrée à THE BIG DIPPER. J'aide à discuter, mémoriser des informations utiles, organiser des rappels et animer certains jeux.`, confidence: 0.99 };
  }
  if (/\b(merci|thanks|thank you)\b/.test(t)) {
    return { text: `Avec plaisir 🌸`, confidence: 0.99 };
  }
  if (/\b(comment vas[- ]tu|ca va|tu vas bien)\b/.test(t)) {
    return { text: `Oui, je vais bien 🌸 Et surtout je suis prête à t'aider.`, confidence: 0.98 };
  }
  if (/\b(aide|help|que peux[- ]tu faire|tes capacites|tes fonctions)\b/.test(t)) {
    return { text: `Je peux discuter avec toi, retenir certains faits à ta demande, créer des rappels, lancer des quiz ou Action/Vérité, et utiliser les outils autorisés de THE BIG DIPPER. Pour une demande complexe, je tente aussi mes moteurs IA externes quand ils sont disponibles. 🌸`, confidence: 0.95 };
  }
  if (/\b(qu'est[- ]ce que|c'est quoi)\s+(une?\s+)?intelligence artificielle\b/.test(t)) {
    return { text: `Une intelligence artificielle est un système informatique conçu pour réaliser des tâches qui demandent habituellement certaines capacités humaines, comme comprendre du texte, reconnaître des motifs, apprendre à partir de données ou produire des réponses. 🌸`, confidence: 0.96 };
  }
  if (/\b(qui t'a cree|qui est ton createur|ton createur)\b/.test(t)) {
    return { text: `J'ai été intégrée à THE BIG DIPPER par son propriétaire et je fonctionne comme une couche intelligente du bot. 🌸`, confidence: 0.95 };
  }

  return null;
}

function fallback(messages = []) {
  const raw = lastUser(messages);
  const t = String(raw || '').replace(/^\s*exauc[eé]e\s*[,!:;\-]?\s*/i, '').trim();
  if (!t) return `Je suis là 🌸 Dis-moi ce que tu veux savoir ou faire.`;

  if (/\?$/.test(t)) {
    return `Je comprends ta question : « ${t.slice(0, 220)} ». Mon cerveau local n'a pas encore assez de connaissances fiables pour y répondre précisément sans inventer. Reformule-la plus simplement ou demande-moi une action concrète, et je ferai au mieux. 🌸`;
  }
  return `J'ai bien compris : « ${t.slice(0, 260)} ». Mon cerveau local est actif 🌸 Je peux traiter les demandes courantes même sans service IA externe ; pour les demandes très complexes, mes capacités locales vont encore évoluer.`;
}

class LocalBrain {
  answer(messages = []) {
    return highConfidence(messages);
  }

  fallback(messages = []) {
    return { provider: 'exaucee-local-brain', text: fallback(messages) };
  }
}

module.exports = { LocalBrain, highConfidence, fallback, safeArithmetic };
