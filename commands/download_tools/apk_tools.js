'use strict';

const axios = require('axios');
const engine = require('../../utils/downloadEngine');

const CAT = '📥 DOWNLOAD / FILE TOOLS';
const UA = 'THE_BIG_DIPPER/1.0';

function packageFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const i = parts.indexOf('packages');
    return i >= 0 ? parts[i + 1] : null;
  } catch { return null; }
}

async function searchApps(query) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Nom d’application requis.');
  const res = await axios.get('https://search.f-droid.org/api/search_apps', {
    params: { q }, timeout: 25000, headers: { 'User-Agent': UA }
  });
  return Array.isArray(res.data?.apps) ? res.data.apps : [];
}

async function packageInfo(pkg) {
  const p = String(pkg || '').trim();
  if (!p) throw new Error('Package Android requis.');
  const res = await axios.get(`https://f-droid.org/api/v1/packages/${encodeURIComponent(p)}`, { timeout: 25000, headers: { 'User-Agent': UA } });
  return res.data;
}

async function resolveApp(query) {
  const raw = String(query || '').trim();
  if (/^[a-zA-Z][\w]*(?:\.[\w]+){1,}$/.test(raw)) return { packageName: raw, name: raw, summary: '' };
  const apps = await searchApps(raw);
  if (!apps.length) throw new Error('Aucune application F-Droid trouvée.');
  const app = apps[0];
  const packageName = packageFromUrl(app.url);
  if (!packageName) throw new Error('Package F-Droid introuvable.');
  return { ...app, packageName };
}

async function sendApk(sock, msg, extra, query, requestedVersionCode) {
  const { reply, from } = extra;
  try {
    const app = await resolveApp(query);
    const info = await packageInfo(app.packageName);
    const packages = Array.isArray(info.packages) ? info.packages : [];
    let v = requestedVersionCode ? packages.find(x => String(x.versionCode) === String(requestedVersionCode)) : null;
    if (!v) v = packages.find(x => Number(x.versionCode) === Number(info.suggestedVersionCode)) || packages[0];
    if (!v) throw new Error('Aucune version APK publiée pour cette application.');
    const apkUrl = `https://f-droid.org/repo/${encodeURIComponent(app.packageName)}_${encodeURIComponent(v.versionCode)}.apk`;
    await reply(`📱 *APK F-Droid*\n\n📦 ${app.name || app.packageName}\n🆔 ${app.packageName}\n🏷️ ${v.versionName || '?'} (${v.versionCode})\n⬇️ Téléchargement…`);
    const got = await engine.download(apkUrl, { fileName: `${app.packageName}_${v.versionCode}.apk` });
    try {
      const data = require('fs').readFileSync(got.file);
      await sock.sendMessage(from, { document: data, mimetype: 'application/vnd.android.package-archive', fileName: got.fileName, caption: `📱 *${app.name || app.packageName}*\n🏷️ ${v.versionName || v.versionCode}\n🔐 Source : F-Droid public` }, from?.endsWith('@g.us') ? { quoted: msg } : undefined);
    } finally { engine.cleanup(got.file); }
  } catch (e) { await reply(`❌ *APK Tools*\n${String(e.response?.data?.message || e.message || e).slice(0,600)}`); }
}

const commands = [];
commands.push({
  name:'apksearch', aliases:['fdroid'], category:CAT, description:'Rechercher des applications Android libres sur F-Droid', usage:'.apksearch <nom>',
  async execute(sock,msg,args,extra){ try{const apps=await searchApps(args.join(' ')); if(!apps.length)return extra.reply('🔎 Aucun résultat F-Droid.'); const text=apps.slice(0,10).map((a,i)=>`${i+1}. *${a.name}*\n   ${packageFromUrl(a.url)||'?'}\n   ${a.summary||''}`).join('\n\n'); await extra.reply(`📱 *Recherche F-Droid*\n\n${text}`);}catch(e){await extra.reply(`❌ ${e.message}`);} }
});
commands.push({
  name:'apk', aliases:[], category:CAT, description:'Rechercher puis télécharger la version suggérée depuis F-Droid', usage:'.apk <nom ou package>',
  async execute(sock,msg,args,extra){ return sendApk(sock,msg,extra,args.join(' ')); }
});
commands.push({
  name:'apkdl', aliases:[], category:CAT, description:'Télécharger un APK F-Droid par package et versionCode', usage:'.apkdl <package> [versionCode]',
  async execute(sock,msg,args,extra){ return sendApk(sock,msg,extra,args[0],args[1]); }
});
commands.push({
  name:'apkinfo', aliases:['appinfo'], category:CAT, description:'Informations et versions d’une app F-Droid', usage:'.apkinfo <nom ou package>',
  async execute(sock,msg,args,extra){ try{const app=await resolveApp(args.join(' '));const info=await packageInfo(app.packageName);const versions=(info.packages||[]).slice(0,8).map(v=>`• ${v.versionName||'?'} — code ${v.versionCode}${Number(v.versionCode)===Number(info.suggestedVersionCode)?' ✅':''}`).join('\n');await extra.reply(`📱 *${app.name||app.packageName}*\n\n🆔 ${app.packageName}\n📝 ${app.summary||'N/A'}\n🏷️ Version suggérée : ${info.suggestedVersionCode||'N/A'}\n\n${versions||'Aucune version.'}`);}catch(e){await extra.reply(`❌ ${e.message}`);} }
});
commands.push({
  name:'apkversion', aliases:['appversion'], category:CAT, description:'Afficher les versions d’une app F-Droid', usage:'.apkversion <nom ou package>',
  async execute(sock,msg,args,extra){ try{const app=await resolveApp(args.join(' '));const info=await packageInfo(app.packageName);await extra.reply(`🏷️ *Versions — ${app.name||app.packageName}*\n\n${(info.packages||[]).slice(0,15).map(v=>`• ${v.versionName||'?'} (${v.versionCode})`).join('\n')||'Aucune version.'}`);}catch(e){await extra.reply(`❌ ${e.message}`);} }
});
commands.push({
  name:'package', aliases:[], category:CAT, description:'Trouver le package Android d’une app F-Droid', usage:'.package <nom>',
  async execute(sock,msg,args,extra){ try{const app=await resolveApp(args.join(' '));await extra.reply(`📦 *Package Android*\n${app.name||''}\n\`${app.packageName}\``);}catch(e){await extra.reply(`❌ ${e.message}`);} }
});
commands.push({
  name:'appicon', aliases:[], category:CAT, description:'Récupérer l’icône publique d’une app F-Droid', usage:'.appicon <nom>',
  async execute(sock,msg,args,extra){ try{const app=await resolveApp(args.join(' '));if(!app.icon)throw new Error('Icône indisponible.');await engine.assertPublicUrl(app.icon);await sock.sendMessage(extra.from,{image:{url:app.icon},caption:`📱 *${app.name}*\n🆔 ${app.packageName}`},{quoted:msg});}catch(e){await extra.reply(`❌ ${e.message}`);} }
});
commands.push({
  name:'apksum', aliases:['apkverify'], category:CAT, description:'Télécharger un APK F-Droid et calculer SHA-256', usage:'.apksum <package>',
  async execute(sock,msg,args,extra){ try{const app=await resolveApp(args[0]);const info=await packageInfo(app.packageName);const v=(info.packages||[]).find(x=>Number(x.versionCode)===Number(info.suggestedVersionCode))||(info.packages||[])[0];if(!v)throw new Error('Version introuvable.');const got=await engine.download(`https://f-droid.org/repo/${encodeURIComponent(app.packageName)}_${v.versionCode}.apk`);try{const h=require('crypto').createHash('sha256').update(require('fs').readFileSync(got.file)).digest('hex');await extra.reply(`🔐 *APK SHA-256*\n\n📦 ${app.packageName}\n🏷️ ${v.versionName||v.versionCode}\n\`${h}\``);}finally{engine.cleanup(got.file);}}catch(e){await extra.reply(`❌ ${e.message}`);} }
});

for (const name of ['splitapkinfo','xapkinfo','verifyapk','extractapk','certinfo']) {
  commands.push({name,aliases:[],category:CAT,description:'Analyse locale APK/XAPK',usage:`.${name} (répondre à un fichier)`,async execute(sock,msg,args,extra){await extra.reply(`🧩 *${name}* : le moteur de téléchargement APK est actif. L’analyse locale approfondie des APK/XAPK sera ajoutée avec le parseur de manifeste/signature Android.`);}});
}

module.exports = commands;
