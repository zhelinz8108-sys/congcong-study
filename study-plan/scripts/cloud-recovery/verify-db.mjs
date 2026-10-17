import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { need, readRegular, noLinks, parseArgs, safeFailure } from './security.mjs';
async function docker(args, { inputPath, input } = {}) {
    const child = spawn('docker', args, {
        stdio: ['pipe', 'pipe', 'pipe'], env: {
            ...process.env
        }, windowsHide: true
    });
    let bytes = 0, out = [];
    child.stderr.on('data', () => {
    });
    child.stdin.on('error', () => {
    });
    const closed = new Promise((resolve, reject) => {
        child.once('error', () => reject(new Error('DOCKER_START_FAILED')));
        child.once('close', code => code === 0 ? resolve() : reject(new Error('DOCKER_OPERATION_FAILED')));
    });
    const stdout = (async () => {
        for await (const block of child.stdout) {
            bytes += block.length;
            need(bytes <= 1024 * 1024, 'DOCKER_OUTPUT_TOO_LARGE');
            out.push(block);
        }
    })();
    const stdin = inputPath ? pipeline(fs.createReadStream(inputPath), child.stdin) : (async () => child.stdin.end(input))();
    try {
        await Promise.all([closed, stdout, stdin]);
    }
    catch {
        child.kill();
        throw new Error('ISOLATED_DATABASE_OPERATION_FAILED');
    }
    return Buffer.concat(out).toString().trim();
}
export async function verifyDatabase({ dumpPath }) {
    await noLinks(dumpPath);
    const info = await fsp.lstat(dumpPath);
    need(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size > 5 && info.size <= 512 * 1024 ** 2, 'DUMP_INPUT_REJECTED');
    const h = await fsp.open(dumpPath, 'r');
    try {
        const prefix = Buffer.alloc(5);
        await h.read(prefix, 0, 5, 0);
        need(prefix.toString() === 'PGDMP', 'CUSTOM_DUMP_REQUIRED');
    }
    finally {
        await h.close();
    }
    const name = 'congcong-recovery-drill-' + crypto.randomUUID(), password = crypto.randomBytes(32).toString('hex');
    let container;
    const original = process.env.POSTGRES_PASSWORD;
    process.env.POSTGRES_PASSWORD = password;
    try {
        container = await docker(['run', '--detach', '--rm', '--name', name, '--network', 'none', '--label', 'congcong-recovery-drill=' + name, '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_DB=recovery_drill', 'postgres:16']);
        need(/^[a-f0-9]{64}$/.test(container), 'CONTAINER_ID_REJECTED');
        let ready = false;
        for (let i = 0; i < 60; i++) {
            try {
                await docker(['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'recovery_drill']);
                ready = true;
                break;
            }
            catch {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        need(ready, 'ISOLATED_DATABASE_NOT_READY');
        const version = await docker(['exec', '--user', 'postgres', container, 'psql', '-X', '-qAt', '-d', 'recovery_drill', '-c', 'SHOW server_version_num;']);
        need(/^16\d{4}$/.test(version), 'POSTGRES16_REQUIRED');
        await docker(['exec', '--interactive', '--user', 'postgres', container, 'pg_restore', '--exit-on-error', '--no-owner', '--no-privileges', '--dbname=recovery_drill'], {
            inputPath: dumpPath
        });
        const required = await docker(['exec', '--user', 'postgres', container, 'psql', '-X', '-qAt', '-d', 'recovery_drill', '-c', "SELECT count(*) FROM pg_stat_user_tables WHERE schemaname='public' AND relname IN ('study_subjects','student_cloud_state','grade6_bank_responses');"]);
        need(required === '3', 'REQUIRED_APPLICATION_TABLES_MISSING');
        const sql = "SELECT format('SELECT count(*) FROM %I.%I;',schemaname,relname) FROM pg_stat_user_tables ORDER BY schemaname,relname \\gexec\n";
        const counts = await docker(['exec', '--interactive', '--user', 'postgres', container, 'psql', '-X', '-qAt', '--set', 'ON_ERROR_STOP=1', '-d', 'recovery_drill'], {
            input: sql
        });
        const lines = counts ? counts.split(/\r?\n/) : [];
        need(lines.length >= 3 && lines.every(x => /^\d+$/.test(x)), 'AGGREGATE_COUNT_OUTPUT_REJECTED');
        const total = lines.reduce((s, x) => s + BigInt(x), 0n);
        return {
            status: 'verified-isolated-database-restore', postgresMajor: 16, tables: lines.length, totalRecords: total.toString(), productionDatabaseRestored: false, studentRecordsPrinted: false, network: 'none'
        };
    }
    finally {
        if (container && /^[a-f0-9]{64}$/.test(container))
            await docker(['rm', '--force', container]).catch(() => {
            });
        if (original === undefined)
            delete process.env.POSTGRES_PASSWORD;
        else
            process.env.POSTGRES_PASSWORD = original;
    }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const a = parseArgs(process.argv.slice(2));
        console.log(JSON.stringify(await verifyDatabase({
            dumpPath: a.dump
        })));
    }
    catch {
        safeFailure('isolated-database-restore');
    }
}
