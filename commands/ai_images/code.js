/**
 * Code Command — THE BIG DIPPER
 * ─────────────────────────────────────────────
 * .code → génère/corrige du code OU explique un concept de programmation
 * (fusion de "code" et "programming" : détection automatique d'intention)
 *
 * Modèle : Mistral (spécialisé code, rapide et précis)
 * Cooldown : 20s anti-spam
 */

const { checkCooldown, cooldownMessage, callMistral, askAI, SC } = require('../../utils/aiEngine');
const config = require('../../config.js');
const PFX    = config.prefix || '.';
const CAT    = '🤖 IA';

// Détecte le langage dans la demande et adapte le système
function detectLanguage(text) {
  const t = text.toLowerCase();
  if (t.includes('python'))     return 'Python';
  if (t.includes('javascript') || t.includes('js') || t.includes('node')) return 'JavaScript';
  if (t.includes('java '))      return 'Java';
  if (t.includes('php'))        return 'PHP';
  if (t.includes('c++') || t.includes('cpp')) return 'C++';
  if (t.includes('rust'))       return 'Rust';
  if (t.includes('typescript') || t.includes('ts')) return 'TypeScript';
  if (t.includes('sql'))        return 'SQL';
  if (t.includes('html') || t.includes('css')) return 'HTML/CSS';
  if (t.includes('bash') || t.includes('shell')) return 'Bash';
  return null;
}

// Détecte une intention pédagogique (concept à expliquer) plutôt qu'une demande de code
function detectConceptualIntent(text) {
  const t = text.toLowerCase();
  const triggers = [
    'explique', 'expliquer', "qu'est-ce que", 'qu est ce que', "c'est quoi",
    'comment fonctionne', 'concept de', 'cours sur', 'apprendre',
    'définition de', 'difference entre', 'différence entre'
  ];
  return triggers.some(trigger => t.includes(trigger));
}

const SYSTEM_CODE = `Tu es un expert développeur full-stack. 
Pour chaque demande de code :
1. Fournis du code propre, commenté et fonctionnel
2. Explique brièvement ce que fait le code
3. Signale les points importants ou pièges éventuels
4. Utilise des blocs de code markdown avec le bon langage
Réponds toujours en français.`;

const SYSTEM_PROG = `Tu es un mentor en programmation expérimenté.
Explique de façon claire et progressive :
- Le concept demandé avec une définition simple
- Un exemple concret et commenté
- Les bonnes pratiques à suivre
- Les erreurs courantes à éviter
Structure ta réponse de manière pédagogique. Réponds en français.`;

module.exports = {
  name: 'code',
  aliases: ['coder', 'gencode', 'fixcode', 'darkcode', 'prog', 'cours', 'coder2', 'darkprog'],
  category: CAT,
  description: '『 THE BIG DIPPER 』➪ ɢᴇ́ɴᴇ̀ʀᴇ/ᴄᴏʀʀɪɢᴇ ᴅᴜ ᴄᴏᴅᴇ ᴏᴜ ᴇxᴘʟɪǫᴜᴇ ᴜɴ ᴄᴏɴᴄᴇᴘᴛ 💻',
  usage: `${PFX}code <demande de code ou concept à expliquer>`,

  async execute(sock, msg, args, extra) {
    const { reply, from, sender, phrases } = extra;
    const { blocked, remaining } = checkCooldown('code', sender, 20);
    if (blocked) return reply(cooldownMessage(remaining, phrases));

    if (!args.length) {
      return reply(
        `*📌 ${SC('usage')} :* \`${PFX}code <demande>\`\n` +
        `_ᴇx : \`${PFX}code fonction Python qui trie une liste\`_\n` +
        `_ᴇx : \`${PFX}code explique les closures en JavaScript\`_\n\n${phrases.footer()}`
      );
    }

    const request      = args.join(' ');
    const isConceptual = detectConceptualIntent(request);

    await sock.sendMessage(from, { react: { text: isConceptual ? '📚' : '💻', key: msg.key } }).catch(() => {});

    try {
      let answer, headerIcon, headerLabel;

      if (isConceptual) {
        // Mode pédagogique (ex-.programming)
        answer      = await callMistral(`Explique le concept de programmation : ${request}`, SYSTEM_PROG);
        headerIcon  = '📚';
        headerLabel = SC('cours de programmation');
      } else {
        // Mode génération de code
        const lang  = detectLanguage(request);
        const prompt = lang
          ? `Génère du code ${lang} pour : ${request}`
          : `Génère du code pour : ${request}`;
        answer      = await callMistral(prompt, SYSTEM_CODE);
        headerIcon  = '💻';
        headerLabel = `${SC('code généré')}${lang ? ` [${lang}]` : ''}`;
      }

      await reply(
        `╭╼≪• *${headerIcon} ${headerLabel}* •≫╾╮\n` +
        `┃\n` +
        `┃ 💡 _${request.slice(0, 80)}_\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n` +
        answer + '\n\n' + phrases.footer()
      );
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`*❌ ${SC('erreur')} :* _${err.message}_\n\n${phrases.footer()}`);
    }
  }
};
