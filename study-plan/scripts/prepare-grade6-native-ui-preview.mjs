import fs from "node:fs/promises";
import path from "node:path";
// Mechanical copy of the actual frontend and public authoring fixtures for QA.
// Authoring rows may await independent review; this is never a release bundle.
// Local preview has its own no-network/no-persistence progress hook.
const dest=path.resolve("../tmp/native-bank-preview"), root=path.resolve("content/grade6-bank");
const preview=JSON.parse(await fs.readFile("../tmp/grade6-bank-native/preview.public.json","utf8"));
const questions=JSON.parse(await fs.readFile(path.join(root,"questions.public.json"),"utf8"));
const manifest=JSON.parse(await fs.readFile(path.join(root,"manifest.json"),"utf8"));
const native=new Map(preview.questions.map(q=>[q.id,q]));
const selected=questions.filter(q=>native.has(q.id)).map(q=>({...q,...native.get(q.id),questionImages:[]}));
const collections=manifest.collections.filter(c=>c.questions.some(q=>native.has(q.id))).map(c=>{
  const questions=c.questions.filter(q=>native.has(q.id));
  const difficultyCounts=Object.fromEntries([1,2,3,4].map(level=>[level,questions.filter(q=>q.difficulty===level).length]));
  // Keep the published chapter counts and original numbers. This sparse,
  // authoring-only fixture must not renumber a question for QA.
  return {...c,questions,difficultyCounts};
});
if(!collections.length || selected.some(q=>!q.native || q.questionImages.length)) throw new Error("Invalid public-only preview fixture");
await fs.writeFile(path.join(dest,"fixture.public.json"),JSON.stringify({collections,questions:selected}));
for(const file of ["components/grade6-bank.tsx","components/grade6-bank.module.css","components/grade6-bank-native.tsx","components/grade6-bank-native.module.css","lib/grade6-bank-types.ts","lib/grade6-bank-native-types.ts","lib/grade6-bank-native-validation.ts","lib/grade6-bank-input-schema.ts"]){
  await fs.mkdir(path.dirname(path.join(dest,"src",file)),{recursive:true}); await fs.copyFile(path.join("src",file),path.join(dest,"src",file));
}
console.log(JSON.stringify({publicPreviewQuestions:selected.length,collections:collections.map(c=>({id:c.id,previewCount:c.questions.length,originalCount:c.questionCount})),realStudentWrites:0}));
