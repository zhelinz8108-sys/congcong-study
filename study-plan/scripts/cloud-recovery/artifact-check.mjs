import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { need, readRegular, noLinks, nofollow, parseArgs, validRun, safeFailure } from './security.mjs';
export async function checkArtifacts({ directory, run }) {
    need(validRun(run), 'INVALID_RUN');
    await noLinks(directory);
    const names = (await fs.readdir(directory)).sort();
    need(JSON.stringify(names) === JSON.stringify(['SAFE-RECEIPT.json', 'credentials.ccre', 'database.ccre']), 'ARTIFACT_FILE_SET_REJECTED');
    const receipt = JSON.parse(await readRegular(path.join(directory, 'SAFE-RECEIPT.json'), 65536));
    need(receipt.schema === 'cloud-recovery-safe-receipt/v1' && receipt.run === run && receipt.remoteRoot === '/www/study-plan-data/cloud-recovery/' + run && receipt.plaintextCredentialsPublished === false && receipt.productionDatabaseRestored === false && receipt.legacyEncrypted === true && receipt.legacyArtifactUploaded === false && Array.isArray(receipt.envelopes) && receipt.envelopes.length === 3, 'ARTIFACT_RECEIPT_REJECTED');
    for (const [index, kind] of ['credentials', 'database'].entries()) {
        const item = receipt.envelopes[index];
        need(item.file === kind + '.ccre' && item.kind === kind && Number.isSafeInteger(item.bytes) && item.bytes > 0 && item.bytes <= 512 * 1024 ** 2 + 8192 && /^[a-f0-9]{64}$/.test(item.sha256), 'ARTIFACT_ENTRY_REJECTED');
        const filename = path.join(directory, item.file);
        await noLinks(filename);
        const h = await fs.open(filename, nofollow);
        try {
            const s = await h.stat();
            need(s.isFile() && s.nlink === 1 && s.size === item.bytes, 'CIPHER_FILE_REJECTED');
            const hash = crypto.createHash('sha256');
            for await (const block of h.createReadStream({
                autoClose: false
            }))
                hash.update(block);
            need(hash.digest('hex') === item.sha256, 'CIPHER_HASH_MISMATCH');
        }
        finally {
            await h.close();
        }
    }
    const legacy = receipt.envelopes[2];
    need(legacy.file === 'legacy.ccre' && legacy.kind === 'legacy' && Number.isSafeInteger(legacy.bytes) && legacy.bytes > 158552226 && legacy.bytes < 158560418 && /^[a-f0-9]{64}$/.test(legacy.sha256), 'LEGACY_METADATA_REJECTED');
    return {
        status: 'verified-encrypted-artifacts', run, artifactEnvelopes: 2, persistentEnvelopes: 3, plaintextCredentialsPublished: false
    };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const a = parseArgs(process.argv.slice(2));
        console.log(JSON.stringify(await checkArtifacts({
            directory: a.directory, run: a.run
        })));
    }
    catch {
        safeFailure('encrypted-artifact-check');
    }
}
