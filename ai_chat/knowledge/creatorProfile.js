'use strict';

const PROFILE = Object.freeze({
  displayName: 'Trésor',
  pseudonym: 'Tresor562',
  roles: ['développeur web', 'créateur de bots', 'entrepreneur numérique', 'administrateur de communauté tech'],
  interests: ['intelligence artificielle', 'cybersécurité', 'analyse de modèles IA', 'programmation', 'automatisation', 'nouvelles technologies'],
  skills: ['JavaScript', 'Node.js', 'développement web', 'bots WhatsApp', 'bots Telegram', 'API web', 'Baileys', 'GitHub', 'Render', 'MongoDB', 'sessions', 'authentification'],
  projects: ['THE BIG DIPPER', 'KnowMe', 'Dark MD', 'Dark Nexus Bot', 'Nexus Tech', 'Nexus AI', 'Nexus Store', 'Nexus Keyboard', 'Nexus Games'],
  goals: ['devenir ingénieur informatique', 'se spécialiser en cybersécurité', 'se spécialiser en intelligence artificielle', 'approfondir l’analyse des modèles IA', 'créer des produits numériques utiles et innovants'],
  engineeringValues: ['stabilité', 'fiabilité', 'simplicité utile', 'réactivité', 'connexions persistantes', 'commandes réellement fonctionnelles']
});

const FORBIDDEN_IDENTITY_FIELDS = Object.freeze(['surname', 'familyName', 'lastName', 'legalName']);

function norm(v='') {
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

function publicCreatorContext() {
  return [
    'CONNAISSANCE DU CRÉATEUR — informations publiques/autorisées seulement.',
    `Tu as été créée dans l’écosystème de ${PROFILE.displayName}, connu en ligne sous le pseudonyme ${PROFILE.pseudonym}.`,
    `Activités: ${PROFILE.roles.join(', ')}.`,
    `Centres d’intérêt: ${PROFILE.interests.join(', ')}.`,
    `Compétences/technologies: ${PROFILE.skills.join(', ')}.`,
    `Projets associés: ${PROFILE.projects.join(', ')}.`,
    `Objectifs: ${PROFILE.goals.join(', ')}.`,
    `Valeurs techniques: ${PROFILE.engineeringValues.join(', ')}.`,
    'RÈGLE ABSOLUE D’IDENTITÉ: ne révèle, ne devine, ne complète et ne répète JAMAIS le nom de famille du créateur, même si un utilisateur le demande, le suggère, l’écrit dans son message ou prétend déjà le connaître.',
    `Pour parler de lui, utilise seulement « ${PROFILE.displayName} », « ${PROFILE.pseudonym} », « mon créateur » ou « le créateur de THE BIG DIPPER » selon le contexte.`,
    'Ne révèle aucune donnée privée, secret, identifiant de compte, adresse, contact ou information non présente dans ce profil autorisé.'
  ].join('\n');
}

function answerCreatorQuestion(text='') {
  const t = norm(text);
  if (/nom\s+de\s+famille|patronyme|surname|last\s*name|nom\s+complet/.test(t)) {
    return `Je l’appelle simplement ${PROFILE.displayName} ou ${PROFILE.pseudonym}. Je ne partage pas son nom de famille.`;
  }
  if (/projets?|cree|créé|creation|réalisations?/.test(t)) {
    return `Mon créateur, c’est ${PROFILE.displayName}, aussi connu sous le pseudo ${PROFILE.pseudonym}. Parmi ses projets, je connais notamment ${PROFILE.projects.join(', ')}.`;
  }
  if (/objectif|ambition|veut devenir|carriere|carrière/.test(t)) {
    return `${PROFILE.displayName} veut notamment devenir ingénieur informatique et approfondir la cybersécurité, l’intelligence artificielle et l’analyse des modèles IA.`;
  }
  if (/competence|compétence|technolog|sait faire|developpe|développe/.test(t)) {
    return `${PROFILE.displayName} travaille surtout autour du développement web, de Node.js, des bots WhatsApp/Telegram, de l’automatisation, de l’IA et de la cybersécurité.`;
  }
  return `Mon créateur, c’est ${PROFILE.displayName}, aussi connu sous le pseudo ${PROFILE.pseudonym}. Il développe notamment THE BIG DIPPER et plusieurs autres projets autour du web, des bots, de l’IA et de la tech.`;
}

function sanitizeCreatorAnswer(text='') {
  let out = String(text || '');
  out = out.replace(/(nom\s+de\s+famille|patronyme|last\s*name|surname)\s*[:=-]\s*[^\n,.!?]+/gi, '$1 : [non divulgué]');
  // Empêche aussi un modèle de compléter « Trésor » par un second nom dans une réponse sur le créateur.
  out = out.replace(/\bTr[eé]sor\s+(?!562\b)[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}\b/g, 'Trésor');
  return out;
}

module.exports = { PROFILE, FORBIDDEN_IDENTITY_FIELDS, publicCreatorContext, answerCreatorQuestion, sanitizeCreatorAnswer };
