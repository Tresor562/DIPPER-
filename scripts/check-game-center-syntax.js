'use strict';

const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=path.join(__dirname,'..');
const files=[];
function addDir(dir,filter){
  const abs=path.join(root,dir);
  for(const name of fs.readdirSync(abs)){const full=path.join(abs,name);if(fs.statSync(full).isFile()&&filter(name,full))files.push(path.relative(root,full));}
}
addDir('utils',(name)=>/^gameCenter.*\.js$/i.test(name));
addDir('commands/games_entertainment',(name)=>name.endsWith('.js'));
files.push('scripts/install-game-center.js');

const unique=[...new Set(files)].sort();
let failed=0;
for(const file of unique){
  const r=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
  if(r.status!==0){failed++;console.error(`\n[syntax] FAIL ${file}\n${r.stderr||r.stdout}`);}
}
if(failed){console.error(`\nGame Center syntax audit failed: ${failed}/${unique.length}`);process.exit(1);}
console.log(`Game Center syntax audit OK: ${unique.length} files`);
