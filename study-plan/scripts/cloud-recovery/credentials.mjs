import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { need, sha, readRegular, writeNew, noLinks, privateParent, parseArgs, validRun, safeFailure } from './security.mjs';
const exec = promisify(execFile), BOOT = '/www/study-plan-data/private-cloud-handoff/2026-10-17/bootstrap-credentials/';
export const SOURCE_FILES = [
    {
        name: 'server-app-env', source: '/www/study-plan/.env.local', file: 'server-app.env.local', cap: 65536
    },
    {
        name: 'server-systemd-env', source: '/etc/study-plan.env', file: 'server-systemd.env', cap: 65536
    },
    {
        name: 'bootstrap-workspace-env', source: BOOT + 'workspace.env.local', file: 'bootstrap-workspace.env.local', cap: 65536
    },
    {
        name: 'bootstrap-deployment-key', source: BOOT + 'deployment_ssh_key', file: 'bootstrap-deployment-key', cap: 16384
    },
    {
        name: 'bootstrap-deployment-key-public', source: BOOT + 'deployment_ssh_key.pub', file: 'bootstrap-deployment-key.pub', cap: 4096
    },
    {
        name: 'actions-deployment-key', source: 'github-actions-secret:SERVER_SSH_KEY', file: 'actions-deployment-key', cap: 16384
    }
];
function decode(item, definition) {
    need(item && item.name === definition.name && item.source === definition.source && Number.isSafeInteger(item.bytes) && item.bytes > 0 && item.bytes <= definition.cap && /^[a-f0-9]{64}$/.test(item.sha256) && typeof item.dataBase64 === 'string', 'CREDENTIAL_ENTRY_REJECTED');
    const raw = Buffer.from(item.dataBase64, 'base64');
    need(raw.toString('base64') === item.dataBase64 && raw.length === item.bytes && sha(raw) === item.sha256, 'CREDENTIAL_HASH_OR_SIZE_MISMATCH');
    return raw;
}
async function publicKey(filename) {
    let output;
    try {
        output = await exec('ssh-keygen', ['-y', '-P', '', '-f', filename], {
            timeout: 10000, maxBuffer: 32768, windowsHide: true
        });
    }
    catch {
        need(false, 'SSH_KEY_INVALID');
    }
    const fields = output.stdout.trim().split(/\s+/);
    need(fields.length >= 2 && ['ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521'].includes(fields[0]), 'SSH_PUBLIC_TYPE_REJECTED');
    const blob = Buffer.from(fields[1], 'base64');
    need(blob.length > 16 && blob.toString('base64') === fields[1], 'SSH_PUBLIC_BLOB_REJECTED');
    return {
        canonical: fields.slice(0, 2).join(' '), fingerprint: 'SHA256:' + crypto.createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')
    };
}
async function verifyKeys(directory) {
    const actions = await publicKey(path.join(directory, 'actions-deployment-key'));
    const bootstrap = await publicKey(path.join(directory, 'bootstrap-deployment-key'));
    const supplied = (await readRegular(path.join(directory, 'bootstrap-deployment-key.pub'), 4096)).toString('ascii').trim().split(/\s+/).slice(0, 2).join(' ');
    need(bootstrap.canonical === supplied, 'BOOTSTRAP_KEYPAIR_MISMATCH');
    return {
        actions: actions.fingerprint, bootstrap: bootstrap.fingerprint
    };
}
export async function packCredentials({ snapshotPath, actionsKeyPath, outputPath, run }) {
    need(validRun(run), 'INVALID_RUN');
    const snapshot = JSON.parse(await readRegular(snapshotPath, 1024 * 1024));
    need(snapshot.schema === 'cloud-recovery-source-snapshot/v1' && snapshot.run === run && Array.isArray(snapshot.files) && snapshot.files.length === 5, 'SNAPSHOT_SHAPE_REJECTED');
    const items = [];
    for (let i = 0; i < 5; i++) {
        decode(snapshot.files[i], SOURCE_FILES[i]);
        items.push(snapshot.files[i]);
    }
    const key = await readRegular(actionsKeyPath, 16384);
    items.push({
        name: SOURCE_FILES[5].name, source: SOURCE_FILES[5].source, bytes: key.length, sha256: sha(key), dataBase64: key.toString('base64')
    });
    await privateParent(outputPath);
    const temporary = await fs.mkdtemp(path.join(path.dirname(outputPath), 'credential-key-check-'));
    await fs.chmod(temporary, 0o700);
    try {
        for (const index of [3, 4, 5])
            await writeNew(path.join(temporary, SOURCE_FILES[index].file), decode(items[index], SOURCE_FILES[index]));
        const fingerprints = await verifyKeys(temporary);
        const bundle = {
            schema: 'cloud-recovery-credentials/v1', run, files: items, keyFingerprints: fingerprints
        };
        await writeNew(outputPath, Buffer.from(JSON.stringify(bundle)));
        return {
            status: 'packed', files: 6, bytes: items.reduce((s, x) => s + x.bytes, 0), twoKeyFingerprintsVerified: true
        };
    }
    finally {
        for (const file of ['bootstrap-deployment-key', 'bootstrap-deployment-key.pub', 'actions-deployment-key'])
            await fs.unlink(path.join(temporary, file)).catch(() => {
            });
        await fs.rmdir(temporary).catch(() => {
        });
    }
}
export async function unpackCredentials({ bundlePath, targetDirectory, run }) {
    need(validRun(run), 'INVALID_RUN');
    await noLinks(targetDirectory);
    need(!(await fs.lstat(targetDirectory).catch(e => {
        if (e.code === 'ENOENT')
            return null;
        throw e;
    })), 'RESTORE_TARGET_EXISTS');
    const bundle = JSON.parse(await readRegular(bundlePath, 1024 * 1024));
    need(bundle.schema === 'cloud-recovery-credentials/v1' && bundle.run === run && Array.isArray(bundle.files) && bundle.files.length === 6 && bundle.keyFingerprints && typeof bundle.keyFingerprints.actions === 'string' && typeof bundle.keyFingerprints.bootstrap === 'string', 'BUNDLE_SHAPE_REJECTED');
    const values = bundle.files.map((x, i) => decode(x, SOURCE_FILES[i]));
    await privateParent(targetDirectory);
    await fs.mkdir(targetDirectory, {
        mode: 0o700
    });
    for (let i = 0; i < values.length; i++)
        await writeNew(path.join(targetDirectory, SOURCE_FILES[i].file), values[i]);
    const fingerprints = await verifyKeys(targetDirectory);
    need(fingerprints.actions === bundle.keyFingerprints.actions && fingerprints.bootstrap === bundle.keyFingerprints.bootstrap, 'RESTORED_KEY_FINGERPRINT_MISMATCH');
    for (let i = 0; i < values.length; i++)
        need(sha(await readRegular(path.join(targetDirectory, SOURCE_FILES[i].file), SOURCE_FILES[i].cap)) === bundle.files[i].sha256, 'RESTORED_HASH_MISMATCH');
    return {
        status: 'verified', files: 6, bytes: values.reduce((s, x) => s + x.length, 0), twoKeyFingerprintsVerified: true, bootstrapPublicKeyMatches: true, environmentExecuted: false
    };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const mode = process.argv[2];
    try {
        const a = parseArgs(process.argv.slice(3));
        need(['pack', 'unpack'].includes(mode), 'INVALID_MODE');
        const result = await (mode === 'pack' ? packCredentials({
            snapshotPath: a.snapshot, actionsKeyPath: a['actions-key'], outputPath: a.output, run: a.run
        }) : unpackCredentials({
            bundlePath: a.bundle, targetDirectory: a.target, run: a.run
        }));
        console.log(JSON.stringify(result));
    }
    catch {
        safeFailure('credentials-' + mode);
    }
}
