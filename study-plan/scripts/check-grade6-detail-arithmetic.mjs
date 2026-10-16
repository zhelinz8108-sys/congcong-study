import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDetailedWork} from './grade6-bank-detailed-authoring.mjs';

// Independent exact-rational checker. It checks whole equality chains, not
// just the first number on the right of an equals sign. No eval or learner I/O.
const gcd=(a,b)=>{a=a<0n?-a:a;while(b){[a,b]=[b,a%b];}return a;};
const r=(n,d=1n)=>{if(!d)throw Error('Zero divisor');if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return{n:n/g,d:d/g};};
const eq=(a,b)=>a.n===b.n&&a.d===b.d;
export function exactExpression(s){
 s=s.replace(/([²³])\//g,'$1÷').replace(/[＋]/g,'+').replace(/[−－]/g,'-').replace(/[×]/g,'*').replace(/[÷]/g,'÷').replace(/[／]/g,'÷').replace(/[（]/g,'(').replace(/[）]/g,')').replace(/[²]/g,'^2').replace(/[³]/g,'^3').replace(/[⁴]/g,'^4').replace(/[ \t]/g,'').replace(/(\d+)又(\d+\/\d+)/g,'($1+$2)');
 // In teaching prose a/b is a fraction atom, while ÷ or ／ denotes
 // division. Otherwise 1/2÷1/4 would wrongly be read as 1÷2÷1÷4.
 const tokens=s.match(/(?:\d+(?:\.\d+)?|\.\d+)(?:\/(?:\d+(?:\.\d+)?|\.\d+))?|[()+*/÷^\-]/g)||[];
 if(!s||tokens.join('')!==s)throw Error('Unsupported numeric expression');
 let i=0;
 const decimal=t=>{const[a,b='']=t.split('.');return r(BigInt((a||'0')+b),10n**BigInt(b.length));};
 const atom=()=>{const t=tokens[i++];if(t==='('){const value=add();if(tokens[i++]!==')')throw Error('Unclosed group');return value;}if(t==='-'){const a=atom();return r(-a.n,a.d);}if(t==='+')return atom();if(!/^(?:\d+(?:\.\d+)?|\.\d+)(?:\/(?:\d+(?:\.\d+)?|\.\d+))?$/.test(t||''))throw Error('Not a number');const[a,b]=t.split('/');const n=decimal(a);if(!b)return n;const d=decimal(b);return r(n.n*d.d,n.d*d.n);};
 const power=()=>{let a=atom();if(tokens[i]==='^'){i++;const b=power();if(b.d!==1n||b.n<0n||b.n>12n)throw Error('Unsupported exponent');a=r(a.n**b.n,a.d**b.n);}return a;};
 const mul=()=>{let a=power();while(tokens[i]==='*'||tokens[i]==='/'||tokens[i]==='÷'){const o=tokens[i++],b=power();a=o==='*'?r(a.n*b.n,a.d*b.d):r(a.n*b.d,a.d*b.n);}return a;};
 const add=()=>{let a=mul();while(tokens[i]==='+'||tokens[i]==='-'){const o=tokens[i++],b=mul();a=r(a.n*b.d+(o==='+'?1n:-1n)*b.n*a.d,a.d*b.d);}return a;};
 const value=add();if(i!==tokens.length)throw Error('Remaining tokens');return value;
}
export function checkArithmeticText(text){
 const results=[];
 text=text.replace(/(\d+)\\frac\{(\d+)\}\{(\d+)\}/g,'($1+$2/$3)').replace(/\\(?:dfrac|tfrac|frac)\{(\d+)\}\{(\d+)\}/g,'($1/$2)').replace(/\\times/g,'×').replace(/\\div/g,'÷').replace(/\\(?:left|right|quad|qquad|,|!|;)/g,'')
  // A count of units is multiplication, not a tail of an equality.
  .replace(/(\d+)\s*个\s*(\d+(?:\.\d+)?(?:\/\d+)?)/g,'$1×$2')
  .replace(/(\d+(?:\.\d+)?)\s*%/g,'($1÷100)')
  .replace(/(\d+)\s*乘\s*(\(?\d+)/g,'$1×$2')
  .replace(/除(\d+(?:\.\d+)?)(?=[=＝])/g,'÷$1');
 for(const match of text.matchAll(/[\d.+\-－−＋×÷*/／^=＝()（）²³⁴又 \t]+/g)){
  const chain=match[0].trim().replace(/^[.]+|[.]+$/g,'');
  if(!/[=＝]/.test(chain))continue;
  const sides=chain.split(/[=＝]/).map(s=>s.trim());
  if(sides.length<2||sides.some(s=>!s))continue;
  const before=text[match.index-1]||'',after=text.slice(match.index+match[0].length);
  // Ratios, units, unsupported TeX and continuing expressions must not be
  // truncated into false equalities such as the tail "200＝50" of a fraction.
  if(/[{}A-Za-zπ∶:：…]/.test(before)||/^[{}A-Za-z∶:：…]/.test(after)||/^\.\.\./.test(after))continue;
  // Leading operators after omitted variables / prose are incomplete.
  if(/^[＋×÷*／]/.test(chain)||/^循环/.test(text.slice(Math.max(0,match.index-2),match.index)))continue;
  try{const values=sides.map(exactExpression);
   const remainder=after.match(/^(?:块|个|件|根|盒|本)?余\s*(\d+(?:\.\d+)?)/);
   if(remainder&&sides.length===2&&sides[0].includes('÷')){
    const operands=sides[0].split('÷');if(operands.length!==2)continue;
    const a=exactExpression(operands[0]),b=exactExpression(operands[1]),q=values[1],rem=exactExpression(remainder[1]);
    results.push({chain:chain+'余'+remainder[1],valid:eq(a,r(b.n*q.n*rem.d+rem.n*b.d*q.d,b.d*q.d*rem.d))});
   }else results.push({chain,valid:values.every(v=>eq(v,values[0]))});
  }catch{/* Unsupported or non-mathematical fragments are not certified. */}
 }
 return results;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const work=await readDetailedWork(),mismatches=[],counts={};let checks=0,checkedQuestions=0;
 for(const row of work.solutions){
  const results=[row.thought,...row.steps.map(s=>s.content),row.answerSummary,...row.pitfalls].flatMap(checkArithmeticText);
  if(results.length)checkedQuestions++;checks+=results.length;
  for(const result of results)if(!result.valid)mismatches.push({id:row.id,...result});
 }
 for(const collection of work.manifest.collections){const ids=new Set(collection.questions.map(q=>q.id));counts[collection.id]=mismatches.filter(r=>ids.has(r.id)).length;}
 const report={version:1,draftRows:work.total,publicDigest:work.publicDigest,resolvedDigest:work.resolvedDigest,checkedQuestions,exactEqualityChains:checks,mismatches,mismatchCounts:counts,limitations:'Checks arithmetic equalities only. Correct modeling, graph interpretation and every subquestion still require content review.',studentWrites:0};
 if(process.argv.includes('--report'))await fs.writeFile('content/grade6-bank/private/detailed/arithmetic-review.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({draftRows:work.total,checkedQuestions,exactEqualityChains:checks,mismatches:mismatches.length,mismatchCounts:counts,studentWrites:0}));
 if(mismatches.length)process.exitCode=1;
}
