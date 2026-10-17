// Synthetic cross-process and cross-implementation tests; no server or secret.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deriveLegacySealRequest, sealWithDerivedRequest } from './legacy-seal.mjs';
import { decryptEnvelope } from './envelope.mjs';
import { writeNew } from './security.mjs';
const password = 'synthetic-legacy-password-only', run = '123456789-2', ownerNonce = 'a'.repeat(32);
const here = path.dirname(fileURLToPath(import.meta.url)), parent = process.env.CLOUD_RECOVERY_TEST_PARENT || os.tmpdir();
const root = await fs.mkdtemp(path.join(parent, 'congcong-legacy-seal-test-'));
await fs.chmod(root, 0o700);
const identity = await fs.lstat(root), results = [];
let serial = 0;
const sha = raw => crypto.createHash('sha256').update(raw).digest('hex');
const exists = async (filename) => Boolean(await fs.lstat(filename).catch(() => null));
async function fixture(bytes = 4097) {
    const directory = path.join(root, 'case-' + (++serial));
    await fs.mkdir(directory, {
        mode: 0o700
    });
    const source = path.join(directory, 'source.zip'), output = path.join(directory, 'legacy.ccre'), raw = Buffer.alloc(bytes, 0x43);
    await writeNew(source, raw);
    const request = await deriveLegacySealRequest({
        password, run, ownerNonce, plaintextBytes: raw.length
    });
    return {
        directory, source, output, raw, request, options: {
            request, run, ownerNonce, inputPath: source, outputPath: output, sourceSize: raw.length, sourceSha256: sha(raw), reserveBytes: 0
        }
    };
}
async function test(name, fn) {
    try {
        await fn();
        results.push({
            name, ok: true
        });
    }
    catch (error) {
        results.push({
            name, ok: false, code: error.code || error.message
        });
    }
}
async function sealInChild(f) {
    const module = await fs.readFile(path.join(here, 'legacy-seal.mjs'), 'utf8');
    const publicOptions = {
        ...f.options
    };
    delete publicOptions.request;
    const append = `\nconst parts=[];for await(const b of process.stdin)parts.push(b);const req=JSON.parse(Buffer.concat(parts));try{console.log(JSON.stringify(await sealWithDerivedRequest({...${JSON.stringify(publicOptions)},request:req})));}catch{console.error('synthetic-child-failed');process.exitCode=1;}`;
    const args = ['--input-type=module', '-e', module + append];
    assert.equal(JSON.stringify(args).includes(password), false);
    assert.equal(JSON.stringify(args).includes(f.request.keyBase64), false);
    const child = spawn(process.execPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => stdout += b);
    child.stderr.on('data', b => stderr += b);
    child.stdin.on('error', () => {
    });
    const closed = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', code => code === 0 ? resolve() : reject(new Error('CHILD_SEAL_FAILED')));
    });
    child.stdin.end(JSON.stringify(f.request));
    await closed;
    assert.equal(stdout.includes(f.request.keyBase64) || stderr.includes(f.request.keyBase64) || stdout.includes(password) || stderr.includes(password), false);
    return JSON.parse(stdout);
}
try {
    await test('stdin-only-cross-process-seal-decrypts-with-original-decryptor', async () => {
        const f = await fixture(3 * 1024 * 1024 + 17), result = await sealInChild(f), restored = path.join(f.directory, 'restored.zip');
        assert.deepEqual(Object.keys(result).sort(), ['status', 'kind', 'run', 'file', 'bytes', 'sha256'].sort());
        assert.equal(result.status, 'sealed');
        assert.equal(result.run, run);
        assert.equal(result.sha256, sha(await fs.readFile(f.output)));
        await decryptEnvelope({
            inputPath: f.output, outputPath: restored, password, kind: 'legacy', run
        });
        assert.deepEqual(await fs.readFile(restored), f.raw);
    });
    await test('wrong-password-fails-original-decryptor-without-leftover-plaintext', async () => {
        const f = await fixture(), restored = path.join(f.directory, 'restored');
        await sealWithDerivedRequest(f.options);
        await assert.rejects(decryptEnvelope({
            inputPath: f.output, outputPath: restored, password: password + 'wrong', kind: 'legacy', run
        }));
        assert.equal(await exists(restored), false);
    });
    await test('delegated-cipher-tampering-fails-authentication', async () => {
        const f = await fixture(), restored = path.join(f.directory, 'restored');
        await sealWithDerivedRequest(f.options);
        const bytes = await fs.readFile(f.output);
        bytes[bytes.length - 17] ^= 1;
        await fs.writeFile(f.output, bytes);
        await assert.rejects(decryptEnvelope({
            inputPath: f.output, outputPath: restored, password, kind: 'legacy', run
        }));
        assert.equal(await exists(restored), false);
    });
    await test('wrong-run-or-owner-is-rejected-before-output', async () => {
        const f = await fixture();
        await assert.rejects(sealWithDerivedRequest({
            ...f.options, run: '123456789-3'
        }));
        await assert.rejects(sealWithDerivedRequest({
            ...f.options, ownerNonce: 'b'.repeat(32)
        }));
        assert.equal(await exists(f.output), false);
    });
    await test('source-pin-failure-removes-only-new-cipher-inode', async () => {
        const f = await fixture();
        await assert.rejects(sealWithDerivedRequest({
            ...f.options, sourceSha256: '0'.repeat(64)
        }));
        assert.equal(await exists(f.output), false);
        assert.deepEqual(await fs.readFile(f.source), f.raw);
    });
    await test('existing-cipher-is-never-overwritten-or-deleted', async () => {
        const f = await fixture(), original = Buffer.from('preserve-existing');
        await writeNew(f.output, original);
        await assert.rejects(sealWithDerivedRequest(f.options));
        assert.deepEqual(await fs.readFile(f.output), original);
    });
    await test('descriptor-and-header-allowlists-and-canonical-key', async () => {
        const f = await fixture();
        await assert.rejects(sealWithDerivedRequest({
            ...f.options, request: {
                ...f.request, password
            }
        }));
        const header = JSON.parse(Buffer.from(f.request.headerBase64, 'base64'));
        header.plaintextBytes++;
        await assert.rejects(sealWithDerivedRequest({
            ...f.options, request: {
                ...f.request, headerBase64: Buffer.from(JSON.stringify(header)).toString('base64')
            }
        }));
        await assert.rejects(sealWithDerivedRequest({
            ...f.options, request: {
                ...f.request, keyBase64: f.request.keyBase64 + '\n'
            }
        }));
        assert.equal(await exists(f.output), false);
    });
    await test('wrong-delegated-key-cannot-pass-password-recovery', async () => {
        const f = await fixture(), restored = path.join(f.directory, 'restored');
        const request = {
            ...f.request, keyBase64: crypto.randomBytes(32).toString('base64')
        };
        await sealWithDerivedRequest({
            ...f.options, request
        });
        await assert.rejects(decryptEnvelope({
            inputPath: f.output, outputPath: restored, password, kind: 'legacy', run
        }));
        assert.equal(await exists(restored), false);
    });
    await test('source-hardlink-and-symlink-output-parent-rejected', async () => {
        const f = await fixture();
        await fs.link(f.source, path.join(f.directory, 'source-link'));
        await assert.rejects(sealWithDerivedRequest(f.options));
        assert.equal(await exists(f.output), false);
        const g = await fixture(), actual = path.join(g.directory, 'actual'), alias = path.join(g.directory, 'alias');
        await fs.mkdir(actual, {
            mode: 0o700
        });
        await fs.symlink(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
        await assert.rejects(sealWithDerivedRequest({
            ...g.options, outputPath: path.join(alias, 'legacy.ccre')
        }));
        assert.equal(await exists(path.join(actual, 'legacy.ccre')), false);
    });
    await test('insufficient-disk-reserve-refuses-before-output', async () => {
        const f = await fixture();
        await assert.rejects(sealWithDerivedRequest({
            ...f.options, reserveBytes: 2 ** 52
        }));
        assert.equal(await exists(f.output), false);
    });
}
finally {
    const current = await fs.lstat(root);
    assert.equal(current.ino, identity.ino);
    assert.equal(current.dev, identity.dev);
    assert.equal(current.isSymbolicLink(), false);
    assert.equal(path.dirname(path.resolve(root)), path.resolve(parent));
    await fs.rm(root, {
        recursive: true
    });
}
const failed = results.filter(x => !x.ok);
console.log(JSON.stringify({
    status: failed.length ? 'failed' : 'passed', tests: results.length, passed: results.length - failed.length, failed, crossProcessKeyViaStdin: true, originalPasswordDecryptorUsed: true, productionConnections: 0, realCredentialsRead: false
}));
if (failed.length)
    process.exitCode = 1;
