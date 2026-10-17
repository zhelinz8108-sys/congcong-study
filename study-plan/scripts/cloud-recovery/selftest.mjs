// Synthetic fixtures only. Does not read production, local env, or real SSH keys.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { encryptEnvelope, decryptEnvelope } from './envelope.mjs';
import { SOURCE_FILES, packCredentials, unpackCredentials } from './credentials.mjs';
import { sha, writeNew } from './security.mjs';
import { checkArtifacts } from './artifact-check.mjs';
const exec = promisify(execFile), run = '123456789-1', password = 'synthetic-test-password-not-production';
const fixtureParent = process.env.CLOUD_RECOVERY_TEST_PARENT || os.tmpdir();
const root = await fs.mkdtemp(path.join(fixtureParent, 'congcong-recovery-selftest-'));
await fs.chmod(root, 0o700);
const identity = await fs.lstat(root);
let serial = 0;
const results = [];
// Windows mode bits do not restrict inherited ACLs. Restrict only this fresh
// synthetic fixture tree so OpenSSH can validate copied fake private keys.
if (process.platform === 'win32') {
    const output = await exec('whoami', ['/user', '/fo', 'csv', '/nh'], {
        windowsHide: true
    });
    const sid = output.stdout.match(/S-1-5-[0-9-]+/)?.[0];
    assert.ok(sid);
    await exec('icacls', [root, '/inheritance:r', '/grant:r', '*' + sid + ':(OI)(CI)F'], {
        windowsHide: true
    });
}
async function dir() {
    const d = path.join(root, 'case-' + (++serial));
    await fs.mkdir(d, {
        mode: 0o700
    });
    return d;
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
            name, ok: false, errorCode: error.code || error.message
        });
    }
}
async function exists(p) {
    return Boolean(await fs.lstat(p).catch(() => null));
}
async function makeKey(name) {
    const filename = path.join(root, name);
    await exec('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', filename], {
        windowsHide: true, timeout: 10000
    });
    return {
        filename, raw: await fs.readFile(filename), pub: await fs.readFile(filename + '.pub')
    };
}
const bootstrap = await makeKey('synthetic-bootstrap'), actions = await makeKey('synthetic-actions');
function snapshot() {
    const raws = [Buffer.from('DUMMY_APP=fixture\nDUMMY_EXEC=$(never-execute-this)\n'), Buffer.from('DUMMY_SYSTEMD=fixture\n'), Buffer.from('DUMMY_LOCAL=fixture\n'), bootstrap.raw, bootstrap.pub];
    return {
        schema: 'cloud-recovery-source-snapshot/v1', run, files: SOURCE_FILES.slice(0, 5).map((x, i) => ({
            name: x.name, source: x.source, bytes: raws[i].length, sha256: sha(raws[i]), dataBase64: raws[i].toString('base64')
        }))
    };
}
async function packed(d, s = snapshot()) {
    const snap = path.join(d, 'snapshot.json'), bundle = path.join(d, 'bundle.json');
    await writeNew(snap, Buffer.from(JSON.stringify(s)));
    await packCredentials({
        snapshotPath: snap, actionsKeyPath: actions.filename, outputPath: bundle, run
    });
    return bundle;
}
try {
    await test('authenticated-roundtrip-and-private-mode', async () => {
        const d = await dir(), plain = path.join(d, 'plain'), cipher = path.join(d, 'cipher'), out = path.join(d, 'out');
        const bytes = Buffer.alloc(2 * 1024 * 1024 + 17, 0x61);
        await writeNew(plain, bytes);
        const encrypted = await encryptEnvelope({
            inputPath: plain, outputPath: cipher, password, kind: 'database', run
        });
        assert.equal(encrypted.authenticated, true);
        await decryptEnvelope({
            inputPath: cipher, outputPath: out, password, kind: 'database', run
        });
        assert.deepEqual(await fs.readFile(out), bytes);
        if (process.platform !== 'win32')
            assert.equal((await fs.stat(out)).mode & 0o777, 0o600);
    });
    await test('wrong-password-removes-only-new-output', async () => {
        const d = await dir(), p = path.join(d, 'p'), c = path.join(d, 'c'), out = path.join(d, 'out');
        await writeNew(p, Buffer.from('fake secret'));
        await encryptEnvelope({
            inputPath: p, outputPath: c, password, kind: 'credentials', run
        });
        await assert.rejects(decryptEnvelope({
            inputPath: c, outputPath: out, password: password + 'wrong', kind: 'credentials', run
        }));
        assert.equal(await exists(out), false);
        assert.equal((await fs.readFile(p)).toString(), 'fake secret');
    });
    await test('ciphertext-tampering-is-authentication-failure', async () => {
        const d = await dir(), p = path.join(d, 'p'), c = path.join(d, 'c'), out = path.join(d, 'out');
        await writeNew(p, Buffer.alloc(100, 7));
        await encryptEnvelope({
            inputPath: p, outputPath: c, password, kind: 'credentials', run
        });
        const raw = await fs.readFile(c);
        raw[raw.length - 17] ^= 1;
        await fs.writeFile(c, raw);
        await assert.rejects(decryptEnvelope({
            inputPath: c, outputPath: out, password, kind: 'credentials', run
        }));
        assert.equal(await exists(out), false);
    });
    await test('kind-and-run-are-bound-to-authenticated-header', async () => {
        const d = await dir(), p = path.join(d, 'p'), c = path.join(d, 'c');
        await writeNew(p, Buffer.from('fixture'));
        await encryptEnvelope({
            inputPath: p, outputPath: c, password, kind: 'credentials', run
        });
        await assert.rejects(decryptEnvelope({
            inputPath: c, outputPath: path.join(d, 'wrong-kind'), password, kind: 'database', run
        }));
        await assert.rejects(decryptEnvelope({
            inputPath: c, outputPath: path.join(d, 'wrong-run'), password, kind: 'credentials', run: '123456789-2'
        }));
    });
    await test('encryption-is-randomized', async () => {
        const d = await dir(), p = path.join(d, 'p');
        await writeNew(p, Buffer.from('same fixture'));
        const a = await encryptEnvelope({
            inputPath: p, outputPath: path.join(d, 'a'), password, kind: 'legacy', run
        }), b = await encryptEnvelope({
            inputPath: p, outputPath: path.join(d, 'b'), password, kind: 'legacy', run
        });
        assert.notEqual(a.sha256, b.sha256);
    });
    await test('encrypt-and-decrypt-never-overwrite', async () => {
        const d = await dir(), p = path.join(d, 'p'), c = path.join(d, 'c'), existing = path.join(d, 'existing');
        await writeNew(p, Buffer.from('fixture'));
        await writeNew(existing, Buffer.from('keep me'));
        await assert.rejects(encryptEnvelope({
            inputPath: p, outputPath: existing, password, kind: 'database', run
        }));
        await encryptEnvelope({
            inputPath: p, outputPath: c, password, kind: 'database', run
        });
        await assert.rejects(decryptEnvelope({
            inputPath: c, outputPath: existing, password, kind: 'database', run
        }));
        assert.equal((await fs.readFile(existing)).toString(), 'keep me');
    });
    await test('linked-input-rejected', async () => {
        const d = await dir(), p = path.join(d, 'p');
        await writeNew(p, Buffer.from('fixture'));
        await fs.link(p, path.join(d, 'hardlink'));
        await assert.rejects(encryptEnvelope({
            inputPath: p, outputPath: path.join(d, 'out'), password, kind: 'database', run
        }));
    });
    await test('symlink-parent-rejected', async () => {
        const d = await dir(), real = path.join(d, 'real'), link = path.join(d, 'link'), p = path.join(d, 'p');
        await fs.mkdir(real, {
            mode: 0o700
        });
        await fs.symlink(real, link, process.platform === 'win32' ? 'junction' : 'dir');
        await writeNew(p, Buffer.from('fixture'));
        await assert.rejects(encryptEnvelope({
            inputPath: p, outputPath: path.join(link, 'out'), password, kind: 'credentials', run
        }));
        assert.equal(await exists(path.join(real, 'out')), false);
    });
    await test('six-source-credential-restore-and-two-keypairs', async () => {
        const d = await dir(), bundle = await packed(d), target = path.join(d, 'restore');
        const result = await unpackCredentials({
            bundlePath: bundle, targetDirectory: target, run
        });
        assert.equal(result.files, 6);
        assert.equal(result.twoKeyFingerprintsVerified, true);
        assert.equal(result.bootstrapPublicKeyMatches, true);
        assert.equal(result.environmentExecuted, false);
        assert.equal((await fs.readdir(target)).length, 6);
        const raw = JSON.parse(await fs.readFile(bundle, 'utf8'));
        assert.notEqual(raw.keyFingerprints.actions, raw.keyFingerprints.bootstrap);
        assert.equal(process.env.DUMMY_APP, undefined);
    });
    await test('credential-hash-tampering-rejected-before-target-creation', async () => {
        const d = await dir(), bundle = await packed(d), raw = JSON.parse(await fs.readFile(bundle));
        raw.files[0].dataBase64 = Buffer.from('changed').toString('base64');
        await fs.writeFile(bundle, JSON.stringify(raw));
        const target = path.join(d, 'restore');
        await assert.rejects(unpackCredentials({
            bundlePath: bundle, targetDirectory: target, run
        }));
        assert.equal(await exists(target), false);
    });
    await test('unexpected-entry-and-traversal-rejected', async () => {
        const d = await dir(), bundle = await packed(d), raw = JSON.parse(await fs.readFile(bundle));
        raw.files[0].name = '../outside';
        await fs.writeFile(bundle, JSON.stringify(raw));
        await assert.rejects(unpackCredentials({
            bundlePath: bundle, targetDirectory: path.join(d, 'restore'), run
        }));
        raw.files[0].name = SOURCE_FILES[0].name;
        raw.files.push(raw.files[0]);
        await fs.writeFile(bundle, JSON.stringify(raw));
        await assert.rejects(unpackCredentials({
            bundlePath: bundle, targetDirectory: path.join(d, 'restore2'), run
        }));
    });
    await test('source-provenance-is-an-exact-whitelist', async () => {
        const d = await dir(), s = snapshot();
        s.files[0].source = '/etc/passwd';
        await assert.rejects(packed(d, s));
    });
    await test('wrong-bootstrap-public-key-is-rejected', async () => {
        const d = await dir(), s = snapshot();
        s.files[4] = {
            ...s.files[4], bytes: actions.pub.length, sha256: sha(actions.pub), dataBase64: actions.pub.toString('base64')
        };
        await assert.rejects(packed(d, s));
    });
    await test('private-fingerprint-mismatch-is-not-success', async () => {
        const d = await dir(), bundle = await packed(d), raw = JSON.parse(await fs.readFile(bundle));
        raw.keyFingerprints.actions = 'SHA256:wrong';
        await fs.writeFile(bundle, JSON.stringify(raw));
        await assert.rejects(unpackCredentials({
            bundlePath: bundle, targetDirectory: path.join(d, 'restore'), run
        }));
    });
    await test('existing-credential-target-is-never-overwritten', async () => {
        const d = await dir(), bundle = await packed(d), target = path.join(d, 'restore');
        await fs.mkdir(target, {
            mode: 0o700
        });
        await writeNew(path.join(target, 'keep'), Buffer.from('keep'));
        await assert.rejects(unpackCredentials({
            bundlePath: bundle, targetDirectory: target, run
        }));
        assert.equal((await fs.readFile(path.join(target, 'keep'))).toString(), 'keep');
    });
    await test('credential-restore-symlink-target-rejected', async () => {
        const d = await dir(), bundle = await packed(d), real = path.join(d, 'real'), link = path.join(d, 'link');
        await fs.mkdir(real, {
            mode: 0o700
        });
        await fs.symlink(real, link, process.platform === 'win32' ? 'junction' : 'dir');
        await assert.rejects(unpackCredentials({
            bundlePath: bundle, targetDirectory: path.join(link, 'restore'), run
        }));
        assert.equal(await exists(path.join(real, 'restore')), false);
    });
    await test('artifact-allowlist-and-ciphertext-hashes', async () => {
        const d = await dir();
        const a = Buffer.from('cipher fixture a'), b = Buffer.from('cipher fixture b');
        await writeNew(path.join(d, 'credentials.ccre'), a);
        await writeNew(path.join(d, 'database.ccre'), b);
        const receipt = {
            schema: 'cloud-recovery-safe-receipt/v1', run, remoteRoot: '/www/study-plan-data/cloud-recovery/' + run, plaintextCredentialsPublished: false, productionDatabaseRestored: false, legacyEncrypted: true, legacyArtifactUploaded: false, envelopes: [{
                    file: 'credentials.ccre', kind: 'credentials', bytes: a.length, sha256: sha(a)
                }, {
                    file: 'database.ccre', kind: 'database', bytes: b.length, sha256: sha(b)
                }, {
                    file: 'legacy.ccre', kind: 'legacy', bytes: 158552700, sha256: 'a'.repeat(64)
                }]
        };
        await writeNew(path.join(d, 'SAFE-RECEIPT.json'), Buffer.from(JSON.stringify(receipt)));
        assert.equal((await checkArtifacts({
            directory: d, run
        })).artifactEnvelopes, 2);
        await fs.writeFile(path.join(d, 'database.ccre'), Buffer.from('corrupt'));
        await assert.rejects(checkArtifacts({
            directory: d, run
        }));
        await writeNew(path.join(d, 'unexpected'), Buffer.from('no'));
        await assert.rejects(checkArtifacts({
            directory: d, run
        }));
    });
}
finally {
    const actual = await fs.lstat(root);
    assert.equal(actual.ino, identity.ino);
    assert.equal(actual.dev, identity.dev);
    assert.equal(actual.isSymbolicLink(), false);
    assert.equal(path.dirname(path.resolve(root)), path.resolve(fixtureParent));
    await fs.rm(root, {
        recursive: true
    });
}
const failed = results.filter(x => !x.ok);
console.log(JSON.stringify({
    status: failed.length ? 'failed' : 'passed', tests: results.length, passed: results.length - failed.length, failed: failed.map(x => ({
        name: x.name, errorCode: x.errorCode
    })), productionConnections: 0, realCredentialsRead: false, studentRecordsRead: false, dockerRestoreExecuted: false
}));
if (failed.length)
    process.exitCode = 1;
