// One-time legacy package key delegation. Password never leaves Actions.
// Standalone built-in-only module: the server executes this reviewed source
// in memory, and receives the descriptor only on SSH stdin.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const scrypt = promisify(crypto.scrypt);
const MAGIC = Buffer.from('CCRECOV1');
const ROOT = '/www/study-plan-data/cloud-recovery';
const SOURCE = '/www/study-plan-data/private-cloud-handoff/2026-10-17/materials-3b2d7ca9-66e3-4677-9234-232292bd76ed/legacy/congcong-study-local-20260530.zip';
const SOURCE_SIZE = 158552226;
const SOURCE_PIN = '2db9545b43d96479ebad0c459711a1473da8216b08da8aae4b35fff5e17e3abc';
const NOFOLLOW = constants.O_NOFOLLOW || 0;
const KDF = {
    N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024
};
const validRun = value => typeof value === 'string' && /^[1-9][0-9]{0,19}-[1-9][0-9]{0,5}$/.test(value);
const need = (ok, code) => {
    if (!ok)
        throw new Error(code);
};
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function canonicalBase64(value, bytes) {
    need(typeof value === 'string', 'INVALID_BASE64');
    const raw = Buffer.from(value, 'base64');
    need(raw.length === bytes && raw.toString('base64') === value, 'INVALID_BASE64');
    return raw;
}
export async function deriveLegacySealRequest({ password, run, ownerNonce, plaintextBytes = SOURCE_SIZE }) {
    need(typeof password === 'string' && Buffer.byteLength(password) >= 16 && Buffer.byteLength(password) <= 4096, 'PASSWORD_REQUIRED');
    need(validRun(run) && /^[a-f0-9]{32}$/.test(ownerNonce) && Number.isSafeInteger(plaintextBytes) && plaintextBytes > 0, 'INVALID_PACKAGE_ID');
    const salt = crypto.randomBytes(32), nonce = crypto.randomBytes(12);
    const key = await scrypt(password, salt, 32, KDF);
    try {
        const header = Buffer.from(JSON.stringify({
            schema: 'cloud-recovery-password-envelope/v1', kind: 'legacy', run, cipher: 'AES-256-GCM', kdf: 'scrypt', N: 32768, r: 8, p: 1, salt: salt.toString('base64'), nonce: nonce.toString('base64'), plaintextBytes
        }));
        return {
            schema: 'cloud-recovery-legacy-seal-request/v1', run, ownerNonce, headerBase64: header.toString('base64'), keyBase64: key.toString('base64')
        };
    }
    finally {
        key.fill(0);
    }
}
function validateRequest(request, run, ownerNonce, sourceSize) {
    need(exactKeys(request, ['schema', 'run', 'ownerNonce', 'headerBase64', 'keyBase64']), 'REQUEST_KEYS_REJECTED');
    need(request.schema === 'cloud-recovery-legacy-seal-request/v1' && validRun(run) && request.run === run && /^[a-f0-9]{32}$/.test(ownerNonce) && request.ownerNonce === ownerNonce, 'REQUEST_ID_REJECTED');
    need(typeof request.headerBase64 === 'string' && request.headerBase64.length <= 5464, 'HEADER_TOO_LARGE');
    const raw = Buffer.from(request.headerBase64, 'base64');
    need(raw.length > 0 && raw.length <= 4096 && raw.toString('base64') === request.headerBase64, 'HEADER_BASE64_REJECTED');
    const header = JSON.parse(raw.toString('utf8'));
    need(exactKeys(header, ['schema', 'kind', 'run', 'cipher', 'kdf', 'N', 'r', 'p', 'salt', 'nonce', 'plaintextBytes']), 'HEADER_KEYS_REJECTED');
    need(header.schema === 'cloud-recovery-password-envelope/v1' && header.kind === 'legacy' && header.run === run && header.cipher === 'AES-256-GCM' && header.kdf === 'scrypt' && header.N === 32768 && header.r === 8 && header.p === 1 && header.plaintextBytes === sourceSize, 'HEADER_FIELDS_REJECTED');
    canonicalBase64(header.salt, 32);
    const nonce = canonicalBase64(header.nonce, 12), key = canonicalBase64(request.keyBase64, 32);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(raw.length);
    return {
        key, nonce, aad: Buffer.concat([MAGIC, length, raw])
    };
}
async function noLinks(filename) {
    let current = path.resolve(filename);
    for (;;) {
        const info = await fs.lstat(current).catch(error => {
            if (error.code === 'ENOENT')
                return null;
            throw error;
        });
        need(!info?.isSymbolicLink(), 'SYMLINK_REJECTED');
        const parent = path.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
}
function privateFile(info, ownerUid) {
    need(info.isFile() && info.nlink === 1, 'REGULAR_FILE_REQUIRED');
    if (process.platform !== 'win32')
        need(info.uid === ownerUid && (info.mode & 0o777) === 0o600, 'PRIVATE_FILE_REQUIRED');
}
function stable(before, after) {
    return before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs;
}
// Testable encryption core. The server entry below supplies only fixed paths,
// the real pinned size/SHA, root ownership and the 10 GiB reserve.
export async function sealWithDerivedRequest({ request, run, ownerNonce, inputPath, outputPath, sourceSize, sourceSha256, reserveBytes = 10 * 1024 ** 3, ownerUid = process.getuid?.() }) {
    need(Number.isSafeInteger(sourceSize) && sourceSize > 0 && sourceSize <= SOURCE_SIZE && /^[a-f0-9]{64}$/.test(sourceSha256), 'SOURCE_PIN_REJECTED');
    need(Number.isSafeInteger(reserveBytes) && reserveBytes >= 0, 'RESERVE_REJECTED');
    const { key, nonce, aad } = validateRequest(request, run, ownerNonce, sourceSize);
    let incoming, outgoing, outputIdentity, created = false;
    try {
        await noLinks(inputPath);
        await noLinks(outputPath);
        const parent = await fs.stat(path.dirname(outputPath));
        need(parent.isDirectory(), 'OUTPUT_PARENT_REJECTED');
        if (process.platform !== 'win32')
            need(parent.uid === ownerUid && (parent.mode & 0o777) === 0o700, 'PRIVATE_PARENT_REQUIRED');
        if (reserveBytes) {
            const space = await fs.statfs(path.dirname(outputPath));
            need(space.bavail * space.bsize >= sourceSize + aad.length + 16 + reserveBytes, 'RESERVE_INSUFFICIENT');
        }
        incoming = await fs.open(inputPath, constants.O_RDONLY | NOFOLLOW);
        const before = await incoming.stat();
        privateFile(before, ownerUid);
        need(before.size === sourceSize, 'SOURCE_SIZE_MISMATCH');
        outgoing = await fs.open(outputPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
        outputIdentity = await outgoing.stat();
        created = true;
        privateFile(outputIdentity, ownerUid);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
        cipher.setAAD(aad);
        const cipherHash = crypto.createHash('sha256'), sourceHash = crypto.createHash('sha256');
        let bytes = 0, sourceBytes = 0;
        const write = async (block) => {
            await outgoing.writeFile(block);
            cipherHash.update(block);
            bytes += block.length;
        };
        await write(aad);
        for await (const block of incoming.createReadStream({
            autoClose: false, highWaterMark: 1024 * 1024
        })) {
            sourceBytes += block.length;
            need(sourceBytes <= sourceSize, 'SOURCE_GREW');
            sourceHash.update(block);
            await write(cipher.update(block));
        }
        need(sourceBytes === sourceSize && sourceHash.digest('hex') === sourceSha256 && stable(before, await incoming.stat()), 'SOURCE_HASH_OR_STABILITY_MISMATCH');
        await write(cipher.final());
        await write(cipher.getAuthTag());
        await outgoing.sync();
        privateFile(await outgoing.stat(), ownerUid);
        await outgoing.close();
        outgoing = null;
        const expectedCipherSha = cipherHash.digest('hex'), check = await fs.open(outputPath, constants.O_RDONLY | NOFOLLOW);
        try {
            const metadata = await check.stat();
            privateFile(metadata, ownerUid);
            need(metadata.ino === outputIdentity.ino && metadata.dev === outputIdentity.dev && metadata.size === bytes, 'CIPHER_IDENTITY_MISMATCH');
            const actual = crypto.createHash('sha256');
            for await (const block of check.createReadStream({
                autoClose: false
            }))
                actual.update(block);
            need(actual.digest('hex') === expectedCipherSha, 'CIPHER_REHASH_MISMATCH');
        }
        finally {
            await check.close();
        }
        if (process.platform !== 'win32') {
            const directory = await fs.open(path.dirname(outputPath), constants.O_RDONLY | constants.O_DIRECTORY | NOFOLLOW);
            try {
                await directory.sync();
            }
            finally {
                await directory.close();
            }
        }
        if (reserveBytes) {
            const space = await fs.statfs(path.dirname(outputPath));
            need(space.bavail * space.bsize >= reserveBytes, 'RESERVE_LOST_DURING_SEAL');
        }
        return {
            status: 'sealed', kind: 'legacy', run, file: path.basename(outputPath), bytes, sha256: expectedCipherSha
        };
    }
    catch (error) {
        if (outgoing) {
            await outgoing.close();
            outgoing = null;
        }
        if (created) {
            const item = await fs.lstat(outputPath).catch(() => null);
            if (item && !item.isSymbolicLink() && item.ino === outputIdentity.ino && item.dev === outputIdentity.dev)
                await fs.unlink(outputPath);
        }
        throw error;
    }
    finally {
        key.fill(0);
        if (incoming)
            await incoming.close();
        if (outgoing)
            await outgoing.close();
    }
}
async function serverEntry() {
    need(process.platform !== 'win32' && process.getuid() === 0, 'ROOT_LINUX_REQUIRED');
    let size = 0;
    const parts = [];
    for await (const block of process.stdin) {
        size += block.length;
        need(size <= 8192, 'DESCRIPTOR_TOO_LARGE');
        parts.push(block);
    }
    const descriptor = Buffer.concat(parts), request = JSON.parse(descriptor.toString('utf8'));
    need(validRun(request.run) && /^[a-f0-9]{32}$/.test(request.ownerNonce), 'PACKAGE_ID_REJECTED');
    const directory = path.join(ROOT, request.run);
    await noLinks(directory);
    const info = await fs.stat(directory);
    need(info.isDirectory() && info.uid === 0 && (info.mode & 0o777) === 0o700, 'RUN_DIRECTORY_REJECTED');
    const ownerPath = path.join(directory, '.OWNER.json');
    await noLinks(ownerPath);
    const ownerFile = await fs.open(ownerPath, constants.O_RDONLY | NOFOLLOW);
    let owner;
    try {
        const metadata = await ownerFile.stat();
        privateFile(metadata, 0);
        need(metadata.size <= 4096, 'OWNER_SIZE_REJECTED');
        owner = JSON.parse(await ownerFile.readFile('utf8'));
    }
    finally {
        await ownerFile.close();
    }
    need(exactKeys(owner, ['schema', 'run', 'nonce']) && owner.schema === 'cloud-recovery-owner/v1' && owner.run === request.run && owner.nonce === request.ownerNonce, 'RUN_OWNER_MISMATCH');
    const result = await sealWithDerivedRequest({
        request, run: request.run, ownerNonce: request.ownerNonce, inputPath: SOURCE, outputPath: path.join(directory, 'legacy.ccre'), sourceSize: SOURCE_SIZE, sourceSha256: SOURCE_PIN, reserveBytes: 10 * 1024 ** 3, ownerUid: 0
    });
    descriptor.fill(0);
    console.log(JSON.stringify(result));
}
const directFile = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (process.argv[1] === 'server' || directFile) {
    try {
        need(process.argv[1] === 'server' || process.argv[2] === 'server', 'SERVER_MODE_REQUIRED');
        await serverEntry();
    }
    catch {
        console.error(JSON.stringify({
            status: 'failed', stage: 'legacy-one-time-key-seal'
        }));
        process.exitCode = 1;
    }
}
