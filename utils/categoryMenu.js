'use strict';

const { loadCommands } = require('./commandLoader');

const CATEGORY_ALIASES = new Map([
  ['ia', '🤖 IA'],
  ['ai', '🤖 IA'],
  ['intelligence artificielle', '🤖 IA'],
  ['telechargement', '📥 Téléchargements'],
  ['telechargements', '📥 Téléchargements'],
  ['téléchargement', '📥 Téléchargements'],
  ['téléchargements', '📥 Téléchargements'],
  ['download', '📥 Téléchargements'],
  ['downloads', '📥 Téléchargements'],
  ['groupe', '⚙️ Gestion de groupe'],
  ['groupes', '⚙️ Gestion de groupe'],
  ['group', '⚙️ Gestion de groupe'],
  ['groups', '⚙️ Gestion de groupe'],
  ['gestion groupe', '⚙️ Gestion de groupe'],
  ['gestion de groupe', '⚙️ Gestion de groupe'],
  ['outil', '🛠️ Outils généraux'],
  ['outils', '🛠️ Outils généraux'],
  ['tools', '🛠️ Outils généraux'],
  ['outil general', '🛠️ Outils généraux'],
  ['outils generaux', '🛠️ Outils généraux'],
  ['jeux', '🎮 Jeux & Fun'],
  ['jeu', '🎮 Jeux & Fun'],
  ['games', '🎮 Jeux & Fun'],
  ['fun', '🎮 Jeux & Fun'],
  ['protection', '🛡️ Protections'],
  ['protections', '🛡️ Protections'],
  ['securite', '🛡️ Protections'],
  ['sécurité', '🛡️ Protections'],
  ['security', '🛡️ Protections'],
  ['anime', '🌸 Anime'],
  ['animes', '🌸 Anime'],
  ['recherche', '🔍 Recherche'],
  ['recherches', '🔍 Recherche'],
  ['search', '🔍 Recherche'],
  ['owner', '👑 Owner'],
  ['proprietaire', '👑 Owner'],
  ['propriétaire', '👑 Owner'],
  ['configuration', '🔧 Configuration'],
  ['config', '🔧 Configuration'],
  ['settings', '🔧 Configuration'],
  ['parametres', '🔧 Configuration'],
  ['paramètres', '🔧 Configuration'],
]);

const DISPLAY = {
  '🤖 IA': '🤖 IA',
  '📥 Téléchargements': '📥 Téléchargements',
  '⚙️ Gestion de groupe': '👥 Gestion de groupe',
  '🛠️ Outils généraux': '🛠️ Outils généraux',
  '🎮 Jeux & Fun': '🎮 Jeux & Fun',
  '🛡️ Protections': '🛡️ Protections',
  '🌸 Anime': '🌸 Anime',
  '🔍 Recherche': '🔎 Recherche',
  '👑 Owner': '👑 Owner',
  '🔧 Configuration': '⚙️ Configuration',
};

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9& ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalAliasMap() {
  const map = new Map();
  for (const [alias, category] of CATEGORY_ALIASES) map.set(normalize(alias), category);
  return map;
}

const NORMALIZED_ALIASES = canonicalAliasMap();

function availableCategories() {
  const result = new Set();
  const seen = new Set();
  for (const cmd of loadCommands().values()) {
    if (!cmd || seen.has(cmd)) continue;
    seen.add(cmd);
    result.add(cmd.category || '🔮 ᴀᴜᴛʀᴇs');
  }
  return result;
}

function resolveCategory(label) {
  const normalized = normalize(label);
  if (!normalized) return null;

  const available = availableCategories();
  const aliased = NORMALIZED_ALIASES.get(normalized);
  if (aliased && available.has(aliased)) return aliased;

  for (const category of available) {
    if (normalize(category) === normalized || normalize(DISPLAY[category]) === normalized) return category;
  }
  return null;
}

function commandsForCategory(category) {
  const commands = [];
  const seen = new Set();
  for (const cmd of loadCommands().values()) {
    if (!cmd || seen.has(cmd) || cmd.category !== category) continue;
    seen.add(cmd);
    commands.push(cmd);
  }
  return commands.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function buildCategoryText(category, commands) {
  const display = DISPLAY[category] || category;
  let text = `╭── ${display} ──\n\n`;
  for (const cmd of commands) text += `• ${cmd.name}\n`;
  text += `\nTotal : ${commands.length} commandes\n`;
  text += '\n>Powered by 🌹 𝐌ꝛ⥔𝕿𝖗𝖊𝖘𝖔𝖗 🌹';
  return text;
}

function extractRequestedCategory(body, prefix = '.') {
  let input = String(body || '').trim();
  if (prefix && input.startsWith(prefix)) input = input.slice(prefix.length).trim();
  const match = input.match(/^(.+?)\s+menu$/i);
  return match ? match[1].trim() : null;
}

async function handleCategoryMenuPhrase(sock, msg, context, body, prefix) {
  const requested = extractRequestedCategory(body, prefix);
  if (!requested) return false;

  const category = resolveCategory(requested);
  if (!category) return false;

  const commands = commandsForCategory(category);
  const from = context?.from || msg?.key?.remoteJid;
  if (!from) return false;

  await sock.sendMessage(from, { text: buildCategoryText(category, commands) }, { quoted: msg });
  return true;
}

module.exports = {
  CATEGORY_ALIASES,
  normalize,
  resolveCategory,
  commandsForCategory,
  buildCategoryText,
  extractRequestedCategory,
  handleCategoryMenuPhrase,
};
