// Read-only production source export. Only an encrypted payload goes to stdout.
// The private authoring key exists solely in the requesting workspace.
import { readFileSync, readdirSync } from 'node:fs';
import { createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
const recipient = createPublicKey("-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VuAyEAaBgfcEkkQ2NCt4R5DJVQS4o7Qmh0fAPMaGr2W1WGTxc=\n-----END PUBLIC KEY-----\n");
const purpose = 'english-six-knowledge-v1';
const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
if (!/^[a-f0-9]{64}$/i.test(secret ?? '')) throw new Error('Existing content configuration is required');
const seed = Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'hex'), Buffer.from(purpose), Buffer.from('x25519-private'), 32));
const productionPrivate = createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b656e04220420','hex'),seed]),format:'der',type:'pkcs8'});
seed.fill(0);
const envelope = JSON.parse(readFileSync('content/english-six-knowledge/sealed/book.encrypted.json','utf8'));
const shared = diffieHellman({privateKey:productionPrivate,publicKey:createPublicKey({key:Buffer.from(envelope.ephemeralPublicKey,'base64'),format:'der',type:'spki'})});
const key = Buffer.from(hkdfSync('sha256',shared,Buffer.from(envelope.salt,'base64'),Buffer.from(purpose+':payload'),32));shared.fill(0);
const d = createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));d.setAAD(Buffer.from(purpose));d.setAuthTag(Buffer.from(envelope.tag,'base64'));
const book = JSON.parse(Buffer.concat([d.update(Buffer.from(envelope.ciphertext,'base64')),d.final()]).toString('utf8'));key.fill(0);
const questions=[];
for(const directory of ['content/english-six/practice','content/english-six/bank/papers']) {
 for(const name of readdirSync(directory).filter(name=>name.endsWith('.json'))) {
  const paper=JSON.parse(readFileSync(directory+'/'+name,'utf8'));
  if(paper.edition && paper.edition!=='new') continue;
  for(const q of paper.questions??[]) questions.push({unit:paper.unit,id:q.id,topic:q.topic,prompt:q.prompt,context:q.context,options:q.options});
 }
}
const payload=Buffer.from(JSON.stringify({book,questions,recipientPublicKey:createPublicKey(productionPrivate).export({format:'pem',type:'spki'}).toString()}));
if(payload.length>64*1024*1024) throw new Error('Source context too large');
const authoringPurpose='extension-authoring-context-v1';
const ephemeral=generateKeyPairSync('x25519'),salt=randomBytes(32),iv=randomBytes(12);
const transport=Buffer.from(hkdfSync('sha256',diffieHellman({privateKey:ephemeral.privateKey,publicKey:recipient}),salt,Buffer.from(authoringPurpose),32));
const cipher=createCipheriv('aes-256-gcm',transport,iv);cipher.setAAD(Buffer.from(authoringPurpose));
const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);transport.fill(0);payload.fill(0);
process.stdout.write(JSON.stringify({version:1,ephemeralPublicKey:ephemeral.publicKey.export({format:'der',type:'spki'}).toString('base64'),salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')}));
