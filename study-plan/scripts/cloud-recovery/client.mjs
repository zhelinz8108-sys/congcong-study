import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { encryptEnvelope } from './envelope.mjs';
import { packCredentials } from './credentials.mjs';
import { deriveLegacySealRequest } from './legacy-seal.mjs';
import { need, noLinks, writeNew, readRegular, parseArgs, validRun, safeFailure } from './security.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOST = '124.223.31.175', PUBLIC_HOST = '124.223.31.175 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILhHI4cyauQRPMvmv+cz69EU3Txi13IfojtfKuQs6Mka';
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
function under(parent, child) {
    const p = path.resolve(parent), c = path.resolve(child);
    return c.startsWith(p + path.sep);
}
async function removeOwn(dir, identity, parent) {
    need(under(parent, dir), 'CLEANUP_PATH_REJECTED');
    const actual = await fsp.lstat(dir);
    need(actual.isDirectory() && !actual.isSymbolicLink() && actual.ino === identity.ino && actual.dev === identity.dev, 'CLEANUP_IDENTITY_REJECTED');
    await fsp.rm(dir, {
        recursive: true
    });
}
async function sshClient(work) {
    need(process.env.SERVER_HOST === HOST && process.env.SERVER_USER === 'ubuntu' && (!process.env.SERVER_PORT || process.env.SERVER_PORT === '22'), 'SERVER_IDENTITY_REJECTED');
    const key = process.env.SERVER_SSH_KEY;
    need(typeof key === 'string' && Buffer.byteLength(key) > 128 && Buffer.byteLength(key) <= 16384, 'DEPLOYMENT_KEY_MISSING');
    const known = await readRegular(path.join(HERE, 'known_hosts'), 4096);
    need(known.toString().trim() === PUBLIC_HOST, 'TRUSTED_HOST_KEY_CHANGED');
    const keyFile = path.join(work, 'actions-deployment-key');
    await writeNew(keyFile, Buffer.from(key.endsWith('\n') ? key : key + '\n'));
    const code = (await readRegular(path.join(HERE, 'remote.py'), 128 * 1024)).toString('base64');
    return {
        keyFile, run: async (mode, run, nonce, { args = [], inputFile, inputBuffer, outputPath } = {}) => {
            need(validRun(run) && /^[a-f0-9]{32}$/.test(nonce), 'REMOTE_RUN_REJECTED');
            const python = `import base64;exec(compile(base64.b64decode("${code}"),"<cloud-recovery>","exec"))`;
            const command = ['sudo', '-n', 'python3', '-c', quote(python), ...[mode, run, nonce, ...args].map(x => quote(String(x)))].join(' ');
            const child = spawn('ssh', ['-i', keyFile, '-p', '22', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'HostKeyAlgorithms=ssh-ed25519', '-o', 'UserKnownHostsFile=' + path.join(HERE, 'known_hosts'), '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', 'ubuntu@' + HOST, command], {
                stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
            });
            const closed = new Promise((resolve, reject) => {
                child.once('error', () => reject(new Error('SSH_START_FAILED')));
                child.once('close', code => code === 0 ? resolve() : reject(new Error('SSH_OPERATION_FAILED')));
            });
            child.stderr.on('data', () => {
            });
            child.stdin.on('error', () => {
            });
            let chunks = [], length = 0;
            const outgoing = outputPath ? pipeline(child.stdout, fs.createWriteStream(outputPath, {
                flags: 'wx', mode: 0o600
            })) : (async () => {
                for await (const block of child.stdout) {
                    length += block.length;
                    need(length <= 65536, 'REMOTE_RESPONSE_TOO_LARGE');
                    chunks.push(block);
                }
            })();
            const incoming = inputFile ? pipeline(fs.createReadStream(inputFile), child.stdin) : (async () => {
                child.stdin.end(inputBuffer);
            })();
            try {
                await Promise.all([closed, outgoing, incoming]);
            }
            catch {
                child.kill();
                throw new Error('FIXED_REMOTE_OPERATION_FAILED');
            }
            return outputPath ? null : JSON.parse(Buffer.concat(chunks).toString());
        }
    };
}
export async function backup({ run, artifactDirectory }) {
    need(validRun(run) && typeof process.env.RUNNER_TEMP === 'string', 'RUNNER_CONTEXT_REQUIRED');
    need(typeof process.env.BACKUP_ENCRYPTION_PASSWORD === 'string' && Buffer.byteLength(process.env.BACKUP_ENCRYPTION_PASSWORD) >= 16 && Buffer.byteLength(process.env.BACKUP_ENCRYPTION_PASSWORD) <= 4096, 'BACKUP_PASSWORD_REQUIRED');
    const parent = path.resolve(process.env.RUNNER_TEMP);
    need(under(parent, artifactDirectory), 'ARTIFACT_PATH_REJECTED');
    await noLinks(artifactDirectory);
    await fsp.mkdir(artifactDirectory, {
        mode: 0o700
    });
    const work = await fsp.mkdtemp(path.join(parent, 'cloud-recovery-work-'));
    await fsp.chmod(work, 0o700);
    const identity = await fsp.lstat(work), nonce = crypto.randomBytes(16).toString('hex');
    let connection, attempted = false;
    try {
        connection = await sshClient(work);
        attempted = true;
        await connection.run('prepare', run, nonce);
        const snapshot = path.join(work, 'source-snapshot.json'), dump = path.join(work, 'database.dump'), bundle = path.join(work, 'credentials.bundle.json');
        await connection.run('snapshot', run, nonce, {
            outputPath: snapshot
        });
        await connection.run('database', run, nonce, {
            outputPath: dump
        });
        await packCredentials({
            snapshotPath: snapshot, actionsKeyPath: connection.keyFile, outputPath: bundle, run
        });
        await fsp.unlink(snapshot);
        const envelopes = [];
        for (const [kind, inputPath] of [['credentials', bundle], ['database', dump]]) {
            const outputPath = path.join(work, kind + '.ccre');
            const info = await encryptEnvelope({
                inputPath, outputPath, password: process.env.BACKUP_ENCRYPTION_PASSWORD, kind, run
            });
            await connection.run('store', run, nonce, {
                args: [info.file, String(info.bytes), info.sha256], inputFile: outputPath
            });
            await fsp.unlink(inputPath);
            if (kind !== 'legacy') {
                const destination = path.join(artifactDirectory, info.file);
                await fsp.copyFile(outputPath, destination, fs.constants.COPYFILE_EXCL);
                await fsp.chmod(destination, 0o600);
            }
            if (kind === 'database')
                await connection.run('cleanup', run, nonce);
            envelopes.push({
                file: info.file, bytes: info.bytes, sha256: info.sha256, kind
            });
        }
        // Only this legacy package's derived AES key crosses SSH stdin. Neither
        // the password nor credential/database package keys leave Actions.
        const request = await deriveLegacySealRequest({
            password: process.env.BACKUP_ENCRYPTION_PASSWORD, run, ownerNonce: nonce
        });
        const descriptor = Buffer.from(JSON.stringify(request));
        need(descriptor.length <= 8192, 'LEGACY_DESCRIPTOR_TOO_LARGE');
        try {
            const source = (await readRegular(path.join(HERE, 'legacy-seal.mjs'), 128 * 1024)).toString('base64');
            const info = await connection.run('legacy-seal', run, nonce, {
                args: [source], inputBuffer: descriptor
            });
            const expectedCipherBytes = 158552226 + 12 + Buffer.from(request.headerBase64, 'base64').length + 16;
            need(JSON.stringify(Object.keys(info).sort()) === JSON.stringify(['status', 'kind', 'run', 'file', 'bytes', 'sha256'].sort()) && info.status === 'sealed' && info.kind === 'legacy' && info.run === run && info.file === 'legacy.ccre' && info.bytes === expectedCipherBytes && /^[a-f0-9]{64}$/.test(info.sha256), 'LEGACY_SEAL_RESULT_REJECTED');
            envelopes.push({
                file: info.file, bytes: info.bytes, sha256: info.sha256, kind: 'legacy'
            });
        }
        finally {
            descriptor.fill(0);
        }
        await connection.run('cleanup', run, nonce);
        const receipt = {
            schema: 'cloud-recovery-safe-receipt/v1', run, nonce, createdAtUtc: new Date().toISOString(), remoteRoot: '/www/study-plan-data/cloud-recovery/' + run, envelopes, plaintextCredentialsPublished: false, productionDatabaseRestored: false, legacyEncrypted: true, legacyArtifactUploaded: false
        };
        const raw = Buffer.from(JSON.stringify(receipt, null, 2) + '\n');
        await connection.run('finalize', run, nonce, {
            inputBuffer: raw
        });
        await writeNew(path.join(artifactDirectory, 'SAFE-RECEIPT.json'), raw);
        return {
            status: 'backed-up', run, persistentEnvelopes: 3, artifactEnvelopes: 2, credentialFiles: 6, plaintextCredentialsPublished: false, productionDatabaseRestored: false, legacyEncrypted: true
        };
    }
    finally {
        if (attempted && connection)
            await connection.run('cleanup', run, nonce).catch(() => {
            });
        await removeOwn(work, identity, parent);
    }
}
export async function verifyPersistent({ run, receiptPath }) {
    need(validRun(run) && process.env.RUNNER_TEMP, 'RUNNER_CONTEXT_REQUIRED');
    const receipt = JSON.parse(await readRegular(receiptPath, 65536));
    need(receipt.schema === 'cloud-recovery-safe-receipt/v1' && receipt.run === run && /^[a-f0-9]{32}$/.test(receipt.nonce), 'RECEIPT_REJECTED');
    const parent = path.resolve(process.env.RUNNER_TEMP), work = await fsp.mkdtemp(path.join(parent, 'cloud-recovery-readback-'));
    await fsp.chmod(work, 0o700);
    const identity = await fsp.lstat(work);
    try {
        const connection = await sshClient(work);
        const result = await connection.run('inspect', run, receipt.nonce);
        need(result.status === 'verified-persistent-cipher-copies' && JSON.stringify(result.envelopes) === JSON.stringify(receipt.envelopes), 'PERSISTENT_COPY_MISMATCH');
        return {
            status: result.status, run, envelopes: 3, isolatedRestorePerformed: false
        };
    }
    finally {
        await removeOwn(work, identity, parent);
    }
}
export async function fetchLegacyCipher({ run, receiptPath, directory }) {
    need(validRun(run) && process.env.RUNNER_TEMP && under(process.env.RUNNER_TEMP, directory), 'RUNNER_CONTEXT_REQUIRED');
    await noLinks(directory);
    await fsp.mkdir(directory, {
        mode: 0o700
    });
    const receipt = JSON.parse(await readRegular(receiptPath, 65536));
    need(receipt.schema === 'cloud-recovery-safe-receipt/v1' && receipt.run === run && /^[a-f0-9]{32}$/.test(receipt.nonce), 'RECEIPT_REJECTED');
    const item = receipt.envelopes?.find(e => e.kind === 'legacy');
    need(item?.file === 'legacy.ccre' && Number.isSafeInteger(item.bytes) && item.bytes > 158552226 && item.bytes < 158560418 && /^[a-f0-9]{64}$/.test(item.sha256), 'LEGACY_CIPHER_RECORD_REJECTED');
    const parent = path.resolve(process.env.RUNNER_TEMP), work = await fsp.mkdtemp(path.join(parent, 'cloud-recovery-legacy-key-'));
    await fsp.chmod(work, 0o700);
    const identity = await fsp.lstat(work);
    try {
        const connection = await sshClient(work);
        const outputPath = path.join(directory, 'legacy.ccre');
        await connection.run('legacy-cipher', run, receipt.nonce, {
            outputPath
        });
        const file = await fsp.open(outputPath, 'r');
        try {
            need((await file.stat()).size === item.bytes, 'LEGACY_CIPHER_SIZE_MISMATCH');
            const hash = crypto.createHash('sha256');
            for await (const b of file.createReadStream({
                autoClose: false
            }))
                hash.update(b);
            need(hash.digest('hex') === item.sha256, 'LEGACY_CIPHER_HASH_MISMATCH');
        }
        finally {
            await file.close();
        }
        return {
            status: 'verified-legacy-cipher-downloaded', run, bytes: item.bytes, temporaryDeploymentKeyRemoved: true
        };
    }
    finally {
        await removeOwn(work, identity, parent);
    }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const mode = process.argv[2];
    try {
        const a = parseArgs(process.argv.slice(3));
        need(['backup', 'verify-persistent', 'fetch-legacy'].includes(mode), 'INVALID_MODE');
        console.log(JSON.stringify(await (mode === 'backup' ? backup({
            run: a.run, artifactDirectory: a.artifacts
        }) : mode === 'verify-persistent' ? verifyPersistent({
            run: a.run, receiptPath: a.receipt
        }) : fetchLegacyCipher({
            run: a.run, receiptPath: a.receipt, directory: a.directory
        }))));
    }
    catch {
        safeFailure('cloud-recovery-' + mode);
    }
}
