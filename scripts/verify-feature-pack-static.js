'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(ROOT, rel));

const requiredFiles = [
  'commands/bot_sovereignty/autotyping.js',
  'commands/bot_sovereignty/autorecording.js',
  'commands/bot_sovereignty/pair.js',
  'commands/general_tools/repo.js',
  'commands/general_tools/boutique.js',
  'commands/general_tools/stylelist.js',
  'commands/games_entertainment/hackpranks.js',
  'commands/group_management/antiwalink.js',
  'commands/group_management/antigroupmention.js',
  'commands/group_management/protections.js',
  'commands/social_media_download/socialsearch.js',
  'utils/connectionPresentation.js',
  'utils/interactiveCarousel.js',
  'utils/featurePackRuntime.js',
  'scripts/install-global-footer.js',
  'scripts/install-style-layout.js',
  'scripts/install-anime-carousel.js',
  'scripts/install-feature-pack-runtime.js',
];
for (const rel of requiredFiles) {
  if (!exists(rel)) throw new Error(`[feature-pack-static] fichier manquant: ${rel}`);
}

const repo = read('commands/general_tools/repo.js');
if (/github\.com/i.test(repo)) throw new Error('[feature-pack-static] repo.js contient encore un lien GitHub');
for (const url of ['https://the-big-dipper.onrender.com', 'https://t.me/the_big_dipper_bot']) {
  if (!repo.includes(url)) throw new Error(`[feature-pack-static] lien connexion absent: ${url}`);
}

const prank = read('commands/games_entertainment/hackpranks.js');
for (const name of ['fakehack','crackpass','spyphone','traceip','clonesession']) {
  if (!prank.includes(`name:'${name}'`)) throw new Error(`[feature-pack-static] prank absent: ${name}`);
}
if (!/SIMULATION TERMINÉE/.test(prank) || !/Aucun compte/.test(prank)) {
  throw new Error('[feature-pack-static] disclaimer prank absent');
}

const social = read('commands/social_media_download/socialsearch.js');
for (const name of ['pinterest2','tiktoksearch','youtubesearch','soundcloudsearch','spotifysearch','bilibilisearch','instagramsearch','facebooksearch','xsearch']) {
  if (!social.includes(`name:'${name}'`)) throw new Error(`[feature-pack-static] recherche sociale absente: ${name}`);
}
if (!social.includes('sendMediaCarousel')) throw new Error('[feature-pack-static] socialsearch sans carousel');

const protections = read('commands/group_management/protections.js');
if (!/name\s*:\s*['"]antiforward['"]/.test(protections)) throw new Error('[feature-pack-static] antiforward historique absent');
const groupMention = read('commands/group_management/antigroupmention.js');
if (!/name\s*:\s*['"]antigroupmention['"]/.test(groupMention)) throw new Error('[feature-pack-static] antigroupmention historique absent');

// Le runtime délègue la construction newsletter/externalAdReply à
// connectionPresentation.buildConnectionContext(). On vérifie donc ici le
// contrat de délégation et non des détails d'implémentation déplacés ailleurs.
const runtime = read('utils/featurePackRuntime.js');
for (const invariant of ['applyAutoPresence','handleAdminAtAll','handleAntiwalink','buildConnectionContext']) {
  if (!runtime.includes(invariant)) throw new Error(`[feature-pack-static] runtime invariant absent: ${invariant}`);
}

const presentation = read('utils/connectionPresentation.js');
for (const invariant of ['resolveOwnerProfileThumbnail','forwardedNewsletterMessageInfo','externalAdReply']) {
  if (!presentation.includes(invariant)) throw new Error(`[feature-pack-static] présentation connexion absente: ${invariant}`);
}

const footer = read('scripts/install-global-footer.js');
for (const marker of ['menu','ping','welcomeMsg','goodbyeMsg']) {
  if (!footer.includes(marker)) throw new Error(`[feature-pack-static] footer cible absent: ${marker}`);
}
if (!footer.includes('[NON TARGET FOOTER CLEANUP]')) throw new Error('[feature-pack-static] nettoyage footer anime absent');

const pair = read('commands/bot_sovereignty/pair.js');
for (const invariant of ['styleManager.getStyle()','renderResponse','separatorFor']) {
  if (!pair.includes(invariant)) throw new Error(`[feature-pack-static] pair non stylé: ${invariant}`);
}

const style = read('scripts/install-style-layout.js');
for (let i = 0; i <= 20; i++) {
  if (!new RegExp(`\\b${i}:`).test(style)) throw new Error(`[feature-pack-static] séparateur style${i} absent`);
}

const anime = read('scripts/install-anime-carousel.js');
for (const name of ['waifu','neko','waifuhd']) {
  if (!anime.includes(`'${name}'`)) throw new Error(`[feature-pack-static] anime carousel absent: ${name}`);
}
if (!anime.includes('sendMediaCarousel')) throw new Error('[feature-pack-static] anime sans carousel');

for (const rel of requiredFiles.filter(rel => rel.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(ROOT, rel)], { encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) throw new Error(`[feature-pack-static] syntaxe ${rel}: ${result.stderr || result.stdout}`);
}

console.log('[feature-pack-static] ✅ commandes, protections, carrousels, styles, footer ciblé et présentation validés');
