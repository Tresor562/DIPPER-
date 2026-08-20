'use strict';
const fs=require('fs');const path=require('path');const{spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..');
const required=['package.json','index.js','api/server.js','utils/styleCatalog.js','utils/styleManager.js','utils/responseStyle.js','utils/styleMedia.js','utils/whatsappCarousel.js','commands/general_tools/menu.js','commands/general_tools/allmenu.js','commands/general_tools/stylelist.js','scripts/install-style-menu-v2.js'];
for(const rel of required){if(!fs.existsSync(path.join(ROOT,rel)))throw new Error(`[render-sim] fichier requis absent: ${rel}`);}
const pkg=require(path.join(ROOT,'package.json'));if(!pkg.engines?.node)throw new Error('[render-sim] engines.node absent');
function run(cmd,args,opts={}){const r=spawnSync(cmd,args,{cwd:ROOT,encoding:'utf8',env:{...process.env,PORT:process.env.PORT||'10000',RENDER:'true',PUBLIC_MODE:'true'},...opts});if(r.status!==0)throw new Error(`[render-sim] ${cmd} ${args.join(' ')}\n${r.stdout||''}\n${r.stderr||''}`);return r;}
for(const rel of required.filter(f=>f.endsWith('.js')))run(process.execPath,['--check',rel]);
run(process.execPath,['scripts/install-style-menu-v2.js']);
run(process.execPath,['scripts/install-style-menu-v2.js']); // idempotence obligatoire
run(process.execPath,['--test','tests/style-menu-v2.test.js']);
const menu=fs.readFileSync(path.join(ROOT,'commands/general_tools/menu.js'),'utf8');
for(const token of['style31','[STYLE MENU V2 32]','[THEME HEADER 21-31]','[THEME BOT NAME]'])if(!menu.includes(token))throw new Error(`[render-sim] menu final incomplet: ${token}`);
const handler=fs.readFileSync(path.join(ROOT,'handler.js'),'utf8');if(!handler.includes('[EXAUCEE STYLE BYPASS]'))throw new Error('[render-sim] Exaucée n’est pas protégée du décorateur global');
console.log('[render-sim] ✅ syntaxe + installateur x2 + 100000 invariants + fichiers Render validés');
