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
    'Ne révèle aucune donnée privée, secret, identifiant de compte, adresse, contact ou information non présente dans ce profil autorisé. Si on demande une information personnelle absente, dis simplement que tu ne la partages pas ou que tu ne peux pas la confirmer.'
  ].join('\n');
}

function sanitizeCreatorAnswer(text='') {
  // Le profil ne contient volontairement aucun patronyme. Cette fonction empêche aussi
  // les modèles de présenter un nom légal complet comme information autorisée.
  let out = String(text || '');
  out = out.replace(/(nom\s+de\s+famille|patronyme|last\s*name|surname)\s*[:=-]\s*[^\n,.!?]+/gi, '$1 : [non divulgué]');
  return out;
}

module.exports = { PROFILE, FORBIDDEN_IDENTITY_FIELDS, publicCreatorContext, sanitizeCreatorAnswer };
