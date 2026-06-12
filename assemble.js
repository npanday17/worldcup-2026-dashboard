'use strict';
const fs=require('fs');const path=require('path');const DIR=__dirname;
const engine=fs.readFileSync(path.join(DIR,'engine.js'),'utf8');
const data=fs.readFileSync(path.join(DIR,'data.json'),'utf8');
let tpl=fs.readFileSync(path.join(DIR,'ui_template.html'),'utf8');
tpl=tpl.replace('/*__ENGINE__*/',()=>engine);
tpl=tpl.replace('/*__DATA__*/',()=>data);
// index.html is the deploy artifact (served by Vercel at the domain root)
fs.writeFileSync(path.join(DIR,'index.html'),tpl);
console.log('Wrote index.html ('+tpl.length+' bytes)');
