'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const QRCode = require('qrcode');
const engine = require('../../utils/downloadEngine');

const CAT = '📥 DOWNLOAD / FILE TOOLS';

function firstUrl(args) {
  return String(args?.[0] || '').trim();
}
function errText(e) {
  const m = String(e?.response?.data?.message || e?.message || e || 'Erreur inconnue');
  return `❌ *Download Tools*\n${m.slice(0, 700)}`;
}

async function sendDownloaded(sock, msg, extra, rawUrl, hint) {
  const { reply, from } = extra;
  if (!rawUrl) return reply(`⚠️ Lien requis. Exemple : .${hint || 'download'} https://...`);
  let file;
  try {
    await reply('📥 *Téléchargement en cours…*');
    const direct = await engine.resolveUrl(rawUrl, hint);
    const got = await engine.download(direct);
    file = got.file;
    const lower = String(got.contentType || '').toLowerCase();
    const data = fs.readFileSync(file);
    const opts = from?.endsWith('@g.us') ? { quoted: msg } : undefined;
    if (lower.startsWith('image/') && got.bytes <= 15 * 1024 * 1024) {
      await sock.sendMessage(from, { image: data, caption: `📥 *${got.fileName}*\n💾 ${engine.human(got.bytes)}` }, opts);
    } else if (lower.startsWith('video/') && got.bytes <= 30 * 1024 * 1024) {
      await sock.sendMessage(from, { video: data, mimetype: got.contentType, fileName: got.fileName, caption: `📥 *${got.fileName}*\n💾 ${engine.human(got.bytes)}` }, opts);
    } else if (lower.startsWith('audio/') && got.bytes <= 30 * 1024 * 1024) {
      await sock.sendMessage(from, { audio: data, mimetype: got.contentType, fileName: got.fileName, ptt: false }, opts);
    } else {
      await sock.sendMessage(from, { document: data, mimetype: got.contentType || 'application/octet-stream', fileName: got.fileName, caption: `📥 *Téléchargé par THE BIG DIPPER*\n💾 ${engine.human(got.bytes)}` }, opts);
    }
  } catch (e) {
    await reply(errText(e));
  } finally { engine.cleanup(file); }
}

function hostCommand(name, hint, description, aliases = []) {
  return {
    name, aliases, category: CAT, description, usage: `.${name} <lien public>`,
    async execute(sock, msg, args, extra) { return sendDownloaded(sock, msg, extra, firstUrl(args), hint || name); }
  };
}

const commands = [
  hostCommand('mediafire','mediafire','Télécharger un fichier MediaFire public'),
  hostCommand('gdrive','gdrive','Télécharger un fichier Google Drive public'),
  hostCommand('dropbox','dropbox','Télécharger un partage Dropbox public'),
  hostCommand('onedrive','onedrive','Télécharger un lien OneDrive public/direct'),
  hostCommand('mega','mega','Télécharger un lien MEGA direct/public'),
  hostCommand('box','box','Télécharger un lien Box public/direct'),
  hostCommand('pixeldrain','pixeldrain','Télécharger un lien PixelDrain direct/public'),
  hostCommand('workupload','workupload','Télécharger un lien WorkUpload direct/public'),
  hostCommand('sendcm','sendcm','Télécharger un lien Send.cm direct/public'),
  hostCommand('fileio','fileio','Télécharger un lien File.io public'),
  hostCommand('gofile','gofile','Télécharger un lien GoFile direct/public'),
  hostCommand('krakenfiles','krakenfiles','Télécharger un lien KrakenFiles direct/public'),
  hostCommand('streamtape','streamtape','Télécharger un fichier Streamtape direct/public'),
  hostCommand('direct','direct','Télécharger une URL directe'),
  hostCommand('fetch','direct','Récupérer un fichier HTTP/HTTPS public'),
  hostCommand('download','direct','Downloader universel',['dl','getfile','sendfile','autodl','smartdl']),
  hostCommand('audiodl','direct','Télécharger un audio public'),
  hostCommand('videodl','direct','Télécharger une vidéo publique'),
  hostCommand('imgdl','direct','Télécharger une image publique'),
  hostCommand('pdfdl','direct','Télécharger un PDF public'),
];

commands.push({
  name:'downloadinfo', aliases:['linkinfo','safeinfo','inspectfile'], category:CAT,
  description:'Inspecter un lien public avant téléchargement', usage:'.downloadinfo <url>',
  async execute(sock,msg,args,extra){
    const {reply,phrases}=extra; const url=firstUrl(args); if(!url)return reply('⚠️ URL requise.');
    try { const i=await engine.headInfo(await engine.resolveUrl(url)); await reply(`🔎 *Informations du lien*\n\n📄 Nom : ${i.fileName}\n🧩 Type : ${i.contentType}\n💾 Taille : ${i.size?engine.human(i.size):'inconnue'}\n🌐 URL finale : ${i.finalUrl}\n✅ Réseau public vérifié\n\n${phrases?.footer?.()||''}`); } catch(e){await reply(errText(e));}
  }
});

for (const [name, field, desc] of [
  ['finalurl','finalUrl','Afficher l’URL finale après redirections'],
  ['contenttype','contentType','Afficher le type MIME'],
  ['linksize','size','Afficher la taille distante'],
  ['filenameurl','fileName','Afficher le nom du fichier distant'],
  ['checklink','status','Vérifier si un lien public répond']
]) {
  commands.push({ name, aliases:[], category:CAT, description:desc, usage:`.${name} <url>`, async execute(sock,msg,args,extra){ try{const i=await engine.headInfo(await engine.resolveUrl(firstUrl(args))); let v=i[field]; if(field==='size')v=i.size?engine.human(i.size):'inconnue'; await extra.reply(`🔗 *${name}*\n${v ?? 'indisponible'}`);}catch(e){await extra.reply(errText(e));} } });
}

commands.push({
  name:'headers', aliases:[], category:CAT, description:'Afficher des en-têtes HTTP publics sûrs', usage:'.headers <url>',
  async execute(sock,msg,args,extra){ try{const i=await engine.headInfo(await engine.resolveUrl(firstUrl(args))); const h=i.headers||{}; const allow=['content-type','content-length','last-modified','etag','cache-control','server']; const text=allow.filter(k=>h[k]).map(k=>`${k}: ${h[k]}`).join('\n')||'Aucun en-tête utile.'; await extra.reply(`🌐 *Headers*\n\n${text}`);}catch(e){await extra.reply(errText(e));} }
});

commands.push({
  name:'resolve', aliases:['unshort','directlink'], category:CAT, description:'Suivre les redirections publiques', usage:'.resolve <url>',
  async execute(sock,msg,args,extra){ try{const i=await engine.headInfo(await engine.resolveUrl(firstUrl(args))); await extra.reply(`🔗 *URL finale*\n${i.finalUrl}`);}catch(e){await extra.reply(errText(e));} }
});

commands.push({
  name:'qrlink', aliases:['qrfile'], category:CAT, description:'Générer un QR code pour une URL', usage:'.qrlink <url>',
  async execute(sock,msg,args,extra){ const {from,reply}=extra; const url=firstUrl(args); try{await engine.assertPublicUrl(url); const png=await QRCode.toBuffer(url,{width:720,margin:2}); await sock.sendMessage(from,{image:png,caption:'🔗 *QR — lien public*'},{quoted:msg});}catch(e){await reply(errText(e));} }
});

commands.push({
  name:'ghrepo', aliases:[], category:CAT, description:'Informations d’un dépôt GitHub public', usage:'.ghrepo owner/repo',
  async execute(sock,msg,args,extra){ try{const r=await engine.githubRepoInfo(args[0]); await extra.reply(`🐙 *GitHub Repo*\n\n📦 ${r.full_name}\n⭐ ${r.stargazers_count}\n🍴 ${r.forks_count}\n🧑‍💻 ${r.language||'N/A'}\n🌿 Branche : ${r.default_branch}\n📄 Licence : ${r.license?.spdx_id||'N/A'}\n📝 ${String(r.description||'').slice(0,300)}`);}catch(e){await extra.reply(errText(e));} }
});

commands.push({
  name:'ghzip', aliases:['ghclone'], category:CAT, description:'Télécharger l’archive ZIP d’un dépôt GitHub public', usage:'.ghzip owner/repo',
  async execute(sock,msg,args,extra){ try{const r=await engine.githubRepoInfo(args[0]); return sendDownloaded(sock,msg,extra,`${r.html_url}/archive/refs/heads/${encodeURIComponent(r.default_branch)}.zip`,'direct');}catch(e){await extra.reply(errText(e));} }
});

commands.push({
  name:'githubdl', aliases:['ghfile'], category:CAT, description:'Télécharger un fichier GitHub public', usage:'.githubdl <url GitHub>',
  async execute(sock,msg,args,extra){ return sendDownloaded(sock,msg,extra,firstUrl(args),'githubdl'); }
});

commands.push({
  name:'ghrelease', aliases:[], category:CAT, description:'Afficher la dernière release GitHub', usage:'.ghrelease owner/repo',
  async execute(sock,msg,args,extra){ try{const {repo,releases}=await engine.githubReleases(args[0]); const r=releases[0]; if(!r)return extra.reply('ℹ️ Aucune release publique.'); const assets=(r.assets||[]).slice(0,8).map(a=>`• ${a.name} — ${engine.human(a.size)}`).join('\n'); await extra.reply(`🚀 *${repo.full_name} — ${r.name||r.tag_name}*\n\n🏷️ ${r.tag_name}\n📅 ${r.published_at||''}\n${assets||'Aucun asset.'}`);}catch(e){await extra.reply(errText(e));} }
});

commands.push({
  name:'ghreleases', aliases:[], category:CAT, description:'Lister les releases GitHub', usage:'.ghreleases owner/repo',
  async execute(sock,msg,args,extra){ try{const {repo,releases}=await engine.githubReleases(args[0]); await extra.reply(`🚀 *Releases — ${repo.full_name}*\n\n${releases.slice(0,10).map(r=>`• ${r.tag_name} — ${r.name||''}`).join('\n')||'Aucune release.'}`);}catch(e){await extra.reply(errText(e));} }
});

commands.push({
  name:'ghasset', aliases:['githubapk'], category:CAT, description:'Lister les assets d’une release GitHub', usage:'.ghasset owner/repo',
  async execute(sock,msg,args,extra){ try{const {repo,releases}=await engine.githubReleases(args[0]); const r=releases[0]; if(!r)return extra.reply('ℹ️ Aucune release.'); const assets=(r.assets||[]); await extra.reply(`📦 *Assets — ${repo.full_name} ${r.tag_name}*\n\n${assets.slice(0,15).map((a,i)=>`${i+1}. ${a.name} — ${engine.human(a.size)}\n${a.browser_download_url}`).join('\n\n')||'Aucun asset.'}`);}catch(e){await extra.reply(errText(e));} }
});

commands.push({
  name:'ghbranch', aliases:[], category:CAT, description:'Afficher la branche par défaut GitHub', usage:'.ghbranch owner/repo', async execute(sock,msg,args,extra){try{const r=await engine.githubRepoInfo(args[0]);await extra.reply(`🌿 Branche par défaut : *${r.default_branch}*`);}catch(e){await extra.reply(errText(e));}}
});
commands.push({
  name:'ghtag', aliases:[], category:CAT, description:'Lister les tags GitHub', usage:'.ghtag owner/repo', async execute(sock,msg,args,extra){try{const r=await engine.githubRepoInfo(args[0]);const x=await axios.get(`${r.url}/tags?per_page=15`,{timeout:20000,headers:{'User-Agent':'THE_BIG_DIPPER'}});await extra.reply(`🏷️ *Tags — ${r.full_name}*\n\n${x.data.map(t=>`• ${t.name}`).join('\n')||'Aucun tag.'}`);}catch(e){await extra.reply(errText(e));}}
});

commands.push({
  name:'npm', aliases:[], category:CAT, description:'Infos package npm', usage:'.npm <package>',
  async execute(sock,msg,args,extra){try{const p=await engine.npmInfo(args[0]);const latest=p['dist-tags']?.latest;const v=p.versions?.[latest]||{};await extra.reply(`📦 *npm — ${p.name}*\n\n🏷️ ${latest||'N/A'}\n📝 ${String(p.description||'').slice(0,300)}\n📜 Licence : ${v.license||p.license||'N/A'}\n🔗 ${p.homepage||v.homepage||''}`);}catch(e){await extra.reply(errText(e));}}
});
commands.push({
  name:'npmdl', aliases:[], category:CAT, description:'Télécharger le tarball de la dernière version npm', usage:'.npmdl <package>',
  async execute(sock,msg,args,extra){try{const p=await engine.npmInfo(args[0]);const latest=p['dist-tags']?.latest;const tar=p.versions?.[latest]?.dist?.tarball;if(!tar)throw new Error('Tarball npm introuvable.');return sendDownloaded(sock,msg,extra,tar,'direct');}catch(e){await extra.reply(errText(e));}}
});
commands.push({
  name:'pypi', aliases:[], category:CAT, description:'Infos package PyPI', usage:'.pypi <package>',
  async execute(sock,msg,args,extra){try{const p=await engine.pypiInfo(args[0]);await extra.reply(`🐍 *PyPI — ${p.info.name}*\n\n🏷️ ${p.info.version}\n📝 ${String(p.info.summary||'').slice(0,300)}\n📜 ${p.info.license||'N/A'}\n🔗 ${p.info.home_page||p.info.project_url||''}`);}catch(e){await extra.reply(errText(e));}}
});
commands.push({
  name:'pypidl', aliases:[], category:CAT, description:'Télécharger une distribution PyPI', usage:'.pypidl <package>',
  async execute(sock,msg,args,extra){try{const p=await engine.pypiInfo(args[0]);const files=p.urls||[];const chosen=files.find(f=>f.packagetype==='sdist')||files[0];if(!chosen)throw new Error('Distribution PyPI introuvable.');return sendDownloaded(sock,msg,extra,chosen.url,'direct');}catch(e){await extra.reply(errText(e));}}
});

commands.push({
  name:'dlmenu', aliases:[], category:CAT, description:'Menu rapide Download Tools', usage:'.dlmenu',
  async execute(sock,msg,args,extra){await extra.reply('📥 *DOWNLOAD / FILE TOOLS*\n\n☁️ `.mediafire .gdrive .dropbox .onedrive .mega .box .pixeldrain .gofile .direct`\n🐙 `.ghrepo .ghzip .ghrelease .ghreleases .ghasset .githubdl .ghtag`\n📦 `.npm .npmdl .pypi .pypidl`\n🔎 `.downloadinfo .finalurl .headers .contenttype .linksize .checklink .qrlink`\n⚡ `.download` / `.dl` pour le moteur universel.');}
});

// File queue/history commands are intentionally lightweight for now: the downloader
// streams directly to a temporary file and removes it immediately after WhatsApp send.
for (const [name,text] of [
  ['downloadstatus','Les téléchargements sont traités immédiatement dans cette version.'],['downloads','Aucun stockage permanent : les fichiers temporaires sont supprimés après envoi.'],['queue','La file est vide : traitement direct actif.'],['clearqueue','La file directe ne conserve aucun élément.'],['recentdl','Historique persistant non activé pour protéger la confidentialité.'],['historydl','Historique persistant non activé pour protéger la confidentialité.'],['myfiles','Aucun fichier permanent : nettoyage automatique après envoi.'],['clearmyfiles','Aucun fichier permanent à supprimer.'],['storage','Stockage temporaire uniquement, nettoyé après chaque opération.'],['uploadstatus','Aucun upload asynchrone actif.']
]) commands.push({name,aliases:[],category:CAT,description:text,usage:`.${name}`,async execute(sock,msg,args,extra){await extra.reply(`ℹ️ ${text}`);}});

for (const [name] of [['cancel'],['retry'],['pause'],['resume']]) commands.push({name,aliases:[],category:CAT,description:'Contrôle de téléchargement',usage:`.${name} <id>`,async execute(sock,msg,args,extra){await extra.reply('ℹ️ Le moteur actuel est synchrone par requête et ne garde pas de tâche en arrière-plan.');}});

module.exports = commands;
