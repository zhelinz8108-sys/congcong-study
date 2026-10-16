import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {readDetailedWork} from './grade6-bank-detailed-authoring.mjs';
export async function readOriginalAuthoring(){
 const root=path.resolve('content/grade6-bank/private'),rows=new Map();
 for(const name of (await fs.readdir(root)).filter(n=>/^native-(?:preparation|chapter\d|composite|.*special|.*enrichment)/.test(n)&&n.endsWith('.mjs')).sort()){
  const values=(await import(pathToFileURL(path.join(root,name)))).default;
  if(!Array.isArray(values))continue;
  for(const row of values){if(!row.id||!row.private||!row.native)continue;if(rows.has(row.id))throw Error('Duplicate original source');rows.set(row.id,row);}
 }
 return rows;
}
export function promptText(node){
 if(!node)return'';if(typeof node==='string')return node;if(Array.isArray(node))return node.map(promptText).join('');
 if(node.type==='text')return node.value;if(node.type==='math')return '$'+node.tex+'$';
 if(['blank','response'].includes(node.type))return '['+node.fieldId+']';
 if(node.type==='fraction')return '('+promptText(node.numerator)+')/('+promptText(node.denominator)+')';
 if(['diagram','drawing'].includes(node.type))return '[图：'+node.label+'；标注：'+(node.shapes||[]).filter(s=>s.type==='text').map(s=>s.value).join('；')+']';
 if(node.type==='table')return '\n'+node.rows.map(row=>row.map(promptText).join('｜')).join('\n');
 return promptText(node.content||node.blocks||node.text);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const sources=await readOriginalAuthoring(),work=await readDetailedWork(),details=new Map(work.solutions.map(r=>[r.id,r]));
 const args=process.argv.slice(2),ids=args.filter(a=>!a.startsWith('--'));
 for(const id of ids){const q=sources.get(id);if(!q)throw Error('Unknown ID '+id);console.log(JSON.stringify({id,prompt:promptText(q.native.blocks),fields:q.inputs,originalAnswer:q.private.answerText,...(args.includes('--details')?{detail:details.get(id)}:{})},null,2));}
}
