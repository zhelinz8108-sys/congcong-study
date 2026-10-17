import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const fail = code => {
    const e = new Error(code);
    e.code = code;
    throw e;
};
export const need = (value, code) => {
    if (!value)
        fail(code);
};
export const sha = raw => crypto.createHash('sha256').update(raw).digest('hex');
export const nofollow = constants.O_NOFOLLOW || 0;
export const validRun = run => /^[1-9][0-9]{0,19}-[1-9][0-9]{0,5}$/.test(run);
export async function noLinks(filename) {
    let p = path.resolve(filename);
    for (;;) {
        const s = await fs.lstat(p).catch(e => {
            if (e.code === 'ENOENT')
                return null;
            throw e;
        });
        need(!s?.isSymbolicLink(), 'SYMLINK_REJECTED');
        const up = path.dirname(p);
        if (up === p)
            break;
        p = up;
    }
}
export async function privateParent(filename) {
    await noLinks(filename);
    const s = await fs.stat(path.dirname(path.resolve(filename)));
    need(s.isDirectory(), 'PARENT_NOT_DIRECTORY');
    if (process.platform !== 'win32')
        need((s.mode & 0o777) === 0o700 && s.uid === process.getuid(), 'PARENT_NOT_PRIVATE');
}
export async function readRegular(filename, cap) {
    await noLinks(filename);
    const h = await fs.open(filename, constants.O_RDONLY | nofollow);
    try {
        const s = await h.stat();
        need(s.isFile() && s.nlink === 1 && s.size >= 1 && s.size <= cap, 'INPUT_NOT_REGULAR_OR_SIZE');
        const b = await h.readFile();
        const a = await h.stat();
        need(b.length === s.size && s.ino === a.ino && s.size === a.size && s.mtimeMs === a.mtimeMs && s.ctimeMs === a.ctimeMs, 'INPUT_CHANGED');
        return b;
    }
    finally {
        await h.close();
    }
}
export async function writeNew(filename, raw) {
    await privateParent(filename);
    const h = await fs.open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | nofollow, 0o600);
    try {
        await h.writeFile(raw);
        await h.sync();
    }
    finally {
        await h.close();
    }
}
export function parseArgs(args) {
    const result = {};
    for (let i = 0; i < args.length; i += 2) {
        need(/^--[a-z][a-z-]*$/.test(args[i]) && typeof args[i + 1] === 'string' && !Object.hasOwn(result, args[i]), 'INVALID_ARGUMENTS');
        result[args[i].slice(2)] = args[i + 1];
    }
    return result;
}
export const isMain = meta => process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(meta).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
export function safeFailure(stage) {
    console.error(JSON.stringify({
        status: 'failed', stage
    }));
    process.exitCode = 1;
}
