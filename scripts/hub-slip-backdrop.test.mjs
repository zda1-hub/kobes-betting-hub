import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../hub-slip-backdrop.js',import.meta.url),'utf8');
function run(code,hasOffer=true){const classes=new Set(['home-page']);const layer={hidden:true};const bands=[];const offer={hidden:false,before:b=>bands.push(b)};const document={body:{classList:{contains:c=>classes.has(c),add:c=>classes.add(c)}},querySelector:s=>s==='.hub-slips-backdrop'?layer:hasOffer?offer:null,createElement:()=>({setAttribute(){}})};vm.runInNewContext(code,{document});return{classes,layer,bands};}
test('approved background activates without changing existing content nodes',()=>{const s=run(source);assert.equal(s.layer.hidden,false);assert.equal(s.bands.length,1);});
test('one-switch rollback leaves plain homepage with no decorative band',()=>{const s=run(source.replace('const ENABLED = true','const ENABLED = false'));assert.equal(s.layer.hidden,true);assert.equal(s.bands.length,0);assert.equal(s.classes.has('has-slip-backdrop'),false);});
test('missing promotion does not reserve unexplained top space',()=>{assert.equal(run(source,false).bands.length,0);});
