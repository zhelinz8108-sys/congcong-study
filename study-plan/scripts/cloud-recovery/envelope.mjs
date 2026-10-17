import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { need, sha, nofollow, noLinks, privateParent, parseArgs, validRun, safeFailure } from './security.mjs';
const scrypt = promisify(crypto.scrypt), MAGIC = Buffer.from('CCRECOV1'), MAX = 1024 * 1024 * 1024;
const KDF = {
    N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024
};
const passwordOk = password => need(typeof password === 'string' && Buffer.byteLength(password) >= 16 && Buffer.byteLength(password) <= 4096, 'PASSWORD_LENGTH_REJECTED');
async function openInput(filename) {
    await noLinks(filename);
    const h = await fs.open(filename, constants.O_RDONLY | nofollow);
    const stat = await h.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > MAX) {
        await h.close();
        need(false, 'INPUT_SIZE_OR_TYPE_REJECTED');
    }
    return {
        h, stat
    };
}
async function cleanupCreated(filename, identity) {
    const s = await fs.lstat(filename).catch(() => null);
    if (s && s.ino === identity.ino && s.dev === identity.dev && !s.isSymbolicLink())
        await fs.unlink(filename);
}
export async function encryptEnvelope({ inputPath, outputPath, password, kind, run }) {
    passwordOk(password);
    need(['credentials', 'database', 'legacy'].includes(kind) && validRun(run), 'INVALID_ENVELOPE_ID');
    await privateParent(outputPath);
    const { h: input, stat: original } = await openInput(inputPath);
    let output, identity;
    try {
        const salt = crypto.randomBytes(32), nonce = crypto.randomBytes(12);
        const key = await scrypt(password, salt, 32, KDF);
        const header = Buffer.from(JSON.stringify({
            schema: 'cloud-recovery-password-envelope/v1', kind, run, cipher: 'AES-256-GCM', kdf: 'scrypt', N: KDF.N, r: 8, p: 1, salt: salt.toString('base64'), nonce: nonce.toString('base64'), plaintextBytes: original.size
        }));
        const length = Buffer.alloc(4);
        length.writeUInt32BE(header.length);
        const aad = Buffer.concat([MAGIC, length, header]);
        output = await fs.open(outputPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | nofollow, 0o600);
        identity = await output.stat();
        const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
        cipher.setAAD(aad);
        const hash = crypto.createHash('sha256');
        let size = 0;
        const write = async (b) => {
            await output.writeFile(b);
            hash.update(b);
            size += b.length;
        };
        await write(aad);
        for await (const block of input.createReadStream({
            autoClose: false, highWaterMark: 1024 * 1024
        }))
            await write(cipher.update(block));
        await write(cipher.final());
        await write(cipher.getAuthTag());
        key.fill(0);
        await output.sync();
        const after = await input.stat();
        need(original.ino === after.ino && original.size === after.size && original.mtimeMs === after.mtimeMs && original.ctimeMs === after.ctimeMs, 'INPUT_CHANGED');
        return {
            kind, run, file: path.basename(outputPath), bytes: size, sha256: hash.digest('hex'), authenticated: true
        };
    }
    catch (error) {
        if (output) {
            await output.close();
            output = null;
            await cleanupCreated(outputPath, identity);
        }
        throw error;
    }
    finally {
        await input.close();
        if (output)
            await output.close();
    }
}
export async function decryptEnvelope({ inputPath, outputPath, password, kind, run }) {
    passwordOk(password);
    need(['credentials', 'database', 'legacy'].includes(kind) && validRun(run), 'INVALID_ENVELOPE_ID');
    await privateParent(outputPath);
    const { h: input, stat: original } = await openInput(inputPath);
    let output, identity;
    try {
        const prefix = Buffer.alloc(12);
        need((await input.read(prefix, 0, 12, 0)).bytesRead === 12 && prefix.subarray(0, 8).equals(MAGIC), 'INVALID_ENVELOPE_MAGIC');
        const len = prefix.readUInt32BE(8);
        need(len > 0 && len <= 4096 && original.size > 12 + len + 16, 'INVALID_HEADER_LENGTH');
        const raw = Buffer.alloc(len);
        need((await input.read(raw, 0, len, 12)).bytesRead === len, 'TRUNCATED_HEADER');
        const header = JSON.parse(raw);
        need(header.schema === 'cloud-recovery-password-envelope/v1' && header.kind === kind && header.run === run && header.cipher === 'AES-256-GCM' && header.kdf === 'scrypt' && header.N === 32768 && header.r === 8 && header.p === 1, 'ENVELOPE_METADATA_REJECTED');
        const salt = Buffer.from(header.salt, 'base64'), nonce = Buffer.from(header.nonce, 'base64');
        need(salt.length === 32 && salt.toString('base64') === header.salt && nonce.length === 12 && nonce.toString('base64') === header.nonce, 'INVALID_SALT_OR_NONCE');
        need(Number.isSafeInteger(header.plaintextBytes) && header.plaintextBytes > 0 && original.size === 12 + len + header.plaintextBytes + 16, 'INVALID_CIPHERTEXT_SIZE');
        const tag = Buffer.alloc(16);
        need((await input.read(tag, 0, 16, original.size - 16)).bytesRead === 16, 'TRUNCATED_TAG');
        const key = await scrypt(password, salt, 32, KDF), decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAAD(Buffer.concat([prefix, raw]));
        decipher.setAuthTag(tag);
        output = await fs.open(outputPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | nofollow, 0o600);
        identity = await output.stat();
        let bytes = 0;
        for await (const block of input.createReadStream({
            autoClose: false, start: 12 + len, end: original.size - 17, highWaterMark: 1024 * 1024
        })) {
            const plain = decipher.update(block);
            await output.writeFile(plain);
            bytes += plain.length;
        }
        const final = decipher.final();
        await output.writeFile(final);
        bytes += final.length;
        key.fill(0);
        need(bytes === header.plaintextBytes, 'DECRYPTED_SIZE_MISMATCH');
        await output.sync();
        const after = await input.stat();
        need(original.ino === after.ino && original.size === after.size && original.mtimeMs === after.mtimeMs && original.ctimeMs === after.ctimeMs, 'INPUT_CHANGED');
        return {
            status: 'verified', kind, run, bytes, authenticated: true
        };
    }
    catch (error) {
        if (output) {
            await output.close();
            output = null;
            await cleanupCreated(outputPath, identity);
        }
        throw error;
    }
    finally {
        await input.close();
        if (output)
            await output.close();
    }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const stage = process.argv[2];
    try {
        const a = parseArgs(process.argv.slice(3));
        need(['encrypt', 'decrypt'].includes(stage), 'INVALID_MODE');
        const result = await (stage === 'encrypt' ? encryptEnvelope : decryptEnvelope)({
            inputPath: a.input, outputPath: a.output, password: process.env.BACKUP_ENCRYPTION_PASSWORD, kind: a.kind, run: a.run
        });
        console.log(JSON.stringify(result));
    }
    catch {
        safeFailure('password-envelope-' + stage);
    }
}
