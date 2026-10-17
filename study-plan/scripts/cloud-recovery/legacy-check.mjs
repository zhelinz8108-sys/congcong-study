import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { need, noLinks, nofollow, parseArgs, safeFailure } from './security.mjs';
export async function checkLegacy(filename) {
    await noLinks(filename);
    const h = await fs.open(filename, nofollow);
    try {
        const s = await h.stat();
        need(s.isFile() && s.nlink === 1 && s.size === 158552226, 'LEGACY_SIZE_OR_TYPE_REJECTED');
        const hash = crypto.createHash('sha256');
        for await (const b of h.createReadStream({
            autoClose: false
        }))
            hash.update(b);
        need(hash.digest('hex') === '2db9545b43d96479ebad0c459711a1473da8216b08da8aae4b35fff5e17e3abc', 'LEGACY_PLAINTEXT_HASH_MISMATCH');
        return {
            status: 'verified-legacy-original-bytes', bytes: 158552226, unpacked: false, environmentOrDatabaseExecuted: false
        };
    }
    finally {
        await h.close();
    }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const a = parseArgs(process.argv.slice(2));
        console.log(JSON.stringify(await checkLegacy(a.input)));
    }
    catch {
        safeFailure('legacy-original-integrity');
    }
}
