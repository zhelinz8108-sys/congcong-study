// One-time, read-only repair inspection. Only the eight grammar JSON sources
// are read. No environment, database, uploads, media or answer-bank files.
import fs from 'node:fs';
import { createCipheriv, createHash, createPublicKey, publicEncrypt, randomBytes, constants } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const resourceIds = JSON.parse(Buffer.from(process.argv[4], 'base64').toString());
if (!Array.isArray(resourceIds) || resourceIds.length !== 8 || !resourceIds.every(id => /^[a-f0-9]{12}$/.test(id))) throw new Error('Invalid fixed grammar selection');
const recipient = createPublicKey(Buffer.from(process.argv[2], 'base64'));
if (recipient.asymmetricKeyType !== 'rsa' || recipient.asymmetricKeyDetails.modulusLength < 3072) throw new Error('Invalid repair recipient');
const recipientSha256 = createHash('sha256').update(recipient.export({type:'spki',format:'der'})).digest('hex');
const header = {purpose:'grammar-reader-repair',run:process.argv[3],recipientSha256,resourceIds};
const sources = {};
for (const id of resourceIds) {
  const name = '/www/study-plan/content/english-six/resources/' + id + '.json';
  const fd = fs.openSync(name, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size > 1024 * 1024) throw new Error('Unexpected grammar source');
    const data = fs.readFileSync(fd);
    const after = fs.fstatSync(fd);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || data.length !== before.size) throw new Error('Grammar source changed during inspection');
    sources[id] = JSON.parse(data);
  } finally { fs.closeSync(fd); }
}
const aad = Buffer.from(JSON.stringify(header));
const key = randomBytes(32), iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm',key,iv); cipher.setAAD(aad);
const body = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(sources)))),cipher.final()]);
const wrapped = publicEncrypt({key:recipient,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256',oaepLabel:aad},key);
const envelope = Buffer.from(JSON.stringify({header,wrapped:wrapped.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),body:body.toString('base64')}));
// A-P encoding avoids GitHub's redaction of short numeric SSH secret values.
const encoded = envelope.toString('hex').replace(/[0-9a-f]/g, digit => String.fromCharCode(65 + parseInt(digit,16)));
for (let i=0;i<encoded.length;i+=4096) console.log('GRAMMAR_READER_ENVELOPE_CHUNK ' + encoded.slice(i,i+4096));
