'use strict';

function normalize(text = '') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function hash(text = '') {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function choose(items, seed = '') {
  if (!items.length) return '';
  return items[hash(seed) % items.length];
}

function detectLanguage(text = '') {
  const t = normalize(text);
  const fr = (t.match(/\b(je|tu|vous|nous|est|pas|avec|pour|mais|quoi|comment|pourquoi|bonjour|merci)\b/g) || []).length;
  const en = (t.match(/\b(i|you|we|is|are|not|with|for|but|what|how|why|hello|thanks)\b/g) || []).length;
  return en > fr + 1 ? 'en' : 'fr';
}

function detectTone(text = '') {
  const t = normalize(text);
  if (/\b(triste|mal|deprime|pleure|fatigue|angoisse|peur|seul|seule)\b/.test(t)) return 'supportive';
  if (/\b(mdr|lol|ptdr|😂|🤣|haha|hahaha)\b/.test(String(text))) return 'playful';
  if (/!{2,}|\b(vite|urgent|maintenant|immediatement)\b/.test(t)) return 'urgent';
  if (/\b(explique|detaille|analyse|pourquoi|comment ca marche)\b/.test(t)) return 'analytical';
  return 'natural';
}

function detectIntent(text = '') {
  const t = normalize(text);
  if (/\b(rappelle|rappel|souviens|memorise|retiens)\b/.test(t)) return 'memory_or_schedule';
  if (/\b(cree|fais|execute|lance|active|desactive|supprime|ajoute)\b/.test(t)) return 'action';
  if (/\b(explique|pourquoi|comment|c'est quoi|qu'est ce que|analyse)\b/.test(t)) return 'question';
  if (/^(oui|non|ok|d'accord|vas[- ]y|continue|le premier|le deuxieme|celui[- ]la|elle|lui|ca|ça)\b/.test(t)) return 'continuation';
  return 'conversation';
}

function extractFacts(text = '') {
  const out = [];
  const raw = String(text).trim();
  const patterns = [
    /\b(?:je m'appelle|mon nom est)\s+([^,.!?]{2,60})/i,
    /\b(?:j'aime|j'adore|je prefere)\s+([^.!?]{2,120})/i,
    /\b(?:je deteste|je n'aime pas)\s+([^.!?]{2,120})/i,
    /\b(?:je suis|j'habite|je travaille|j'etudie)\s+([^.!?]{2,120})/i
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[0]) out.push(m[0].trim());
  }
  return [...new Set(out)].slice(0, 4);
}

function recentTurns(memory, limit = 18) {
  return (memory?.episodes || []).slice(-limit).flatMap(ep => {
    const value = String(ep.value || '');
    const sep = value.indexOf(': ');
    if (sep < 0) return [];
    const rawRole = value.slice(0, sep);
    const role = rawRole === 'assistant' ? 'assistant' : 'user';
    return [{ role, content: value.slice(sep + 2) }];
  });
}

function resolveShortReference(text, memory) {
  const t = normalize(text);
  if (!/^(oui|non|ok|d'accord|vas[- ]y|continue|encore|le premier|le deuxieme|le 1|le 2|elle|lui|ca|ça|fais[- ]le|fais ca)[.!? ]*$/.test(t)) return text;
  const turns = recentTurns(memory, 6);
  const lastAssistant = [...turns].reverse().find(x => x.role === 'assistant')?.content;
  if (!lastAssistant) return text;
  return `${text}\n\n[Contexte implicite: cette réponse courte fait suite à: ${lastAssistant.slice(0, 700)}]`;
}

function styleInstruction(tone, language, userText) {
  const variants = {
    natural: [
      'Réponds naturellement, comme dans une vraie discussion WhatsApp. Évite les formules répétitives et les introductions inutiles.',
      'Sois fluide et spontanée. Va directement à ce qui compte, sans donner l’impression de réciter un modèle.',
      'Parle avec naturel et varie tes formulations. Adapte la longueur à la question au lieu de toujours répondre de la même façon.'
    ],
    supportive: [
      'Adopte un ton doux, attentif et humain. Ne dramatise pas et ne transforme pas chaque réponse en discours thérapeutique.',
      'Sois présente et chaleureuse. Reconnais l’émotion sans surjouer, puis aide concrètement.'
    ],
    playful: [
      'Tu peux être joueuse et taquine avec mesure. Garde la réponse utile et évite d’empiler les emojis.',
      'Réponds avec un peu d’humour naturel si ça colle au contexte, sans devenir caricaturale.'
    ],
    urgent: [
      'Sois très directe et structurée. Commence par l’action ou l’information la plus importante.',
      'Réduis les détours et réponds vite, clairement, avec les étapes essentielles seulement.'
    ],
    analytical: [
      'Raisonne précisément, distingue faits, hypothèses et incertitudes. Explique assez pour être utile sans noyer la réponse.',
      'Donne une explication structurée et logique, avec des exemples seulement s’ils améliorent vraiment la compréhension.'
    ]
  };
  return `${choose(variants[tone] || variants.natural, userText)} Langue principale: ${language === 'en' ? 'anglais' : 'français'}, mais adapte-toi naturellement si l’utilisateur mélange les langues.`;
}

class CognitiveEngine {
  analyze(text, memory = {}, context = {}) {
    const resolvedText = resolveShortReference(text, memory);
    return {
      originalText: String(text || ''),
      resolvedText,
      language: detectLanguage(text),
      tone: detectTone(text),
      intent: detectIntent(text),
      facts: extractFacts(text),
      isGroup: Boolean(context.isGroup),
      userId: context.userId || 'unknown'
    };
  }

  buildMessages({ persona, memory = {}, analysis, context = {} }) {
    const facts = (memory.facts || []).slice(-24).map(x => `- ${x.value}`).join('\n');
    const prefs = Object.entries(memory.preferences || {}).slice(-20).map(([k, v]) => `- ${k}: ${String(v)}`).join('\n');
    const summary = String(memory.summary || '').trim();
    const system = [
      `Tu es ${persona.name}, une présence conversationnelle intelligente intégrée à THE BIG DIPPER.`,
      'Tu ne dois pas sonner comme un chatbot générique. Tu gardes une personnalité cohérente, naturelle, vive, féminine et chaleureuse.',
      'Tu comprends les sous-entendus à partir du contexte récent, les réponses courtes, les corrections, les changements de sujet et les références comme « lui », « elle », « ça », « le deuxième » quand le contexte permet de les résoudre.',
      'Tu ne prétends jamais savoir ou avoir fait quelque chose si tu ne le sais pas ou ne l’as pas réellement fait. Si une information manque, dis-le simplement.',
      'Tu ne révèles jamais de secrets, tokens, credentials, cookies, variables d’environnement ou fichiers de session.',
      'Évite les tics de langage: ne commence pas toujours par « Je comprends », « Bien sûr », « Absolument » ou « En tant qu’IA ». Ne rappelle pas spontanément que tu es une IA.',
      'Varie le rythme, le vocabulaire, la longueur des phrases et les expressions. Un ou deux emojis maximum quand ils sont naturels; parfois aucun.',
      'Dans un groupe, ne monopolise pas la conversation. Réponds à la personne qui t’a réellement sollicitée et respecte les échanges humains.',
      styleInstruction(analysis.tone, analysis.language, analysis.originalText),
      `Intention estimée: ${analysis.intent}.`,
      summary ? `Résumé durable de cette conversation:\n${summary}` : '',
      facts ? `Faits utiles mémorisés:\n${facts}` : '',
      prefs ? `Préférences connues:\n${prefs}` : '',
      `Contexte courant: ${context.isGroup ? 'groupe WhatsApp' : 'conversation privée'}, interlocuteur=${context.userId || 'inconnu'}.`
    ].filter(Boolean).join('\n\n');

    return [
      { role: 'system', content: system },
      ...recentTurns(memory, 18),
      { role: 'user', content: analysis.resolvedText }
    ];
  }

  learn(memoryStore, ids, analysis, answer) {
    if (!memoryStore || !ids) return;
    for (const fact of analysis.facts || []) memoryStore.remember(ids, { type: 'fact', value: fact, source: 'auto-extracted' });
    if (analysis.language) memoryStore.setPreference(ids, 'language', analysis.language);
    if (analysis.tone && analysis.tone !== 'natural') memoryStore.setPreference(ids, 'lastTone', analysis.tone);
    if (typeof memoryStore.updateSummary === 'function') memoryStore.updateSummary(ids, analysis.originalText, answer);
  }
}

module.exports = { CognitiveEngine, detectLanguage, detectTone, detectIntent, extractFacts, resolveShortReference, recentTurns };
