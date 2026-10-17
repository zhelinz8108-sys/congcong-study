"""Seed only current Git-tracked regular files into a new isolated release."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys

MAX_MANIFEST = 16 * 1024 * 1024
SOURCE = Path('/www/study-plan')
RELEASES = Path('/www/study-plan-releases')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def excluded(name):
    parts = name.split('/')
    return any(p.startswith(('.env', '.next')) or p in ('.data', 'node_modules') or p.endswith('.log') for p in parts) or any(
        name == prefix or name.startswith(prefix + '/')
        for prefix in ('public/listening', 'public/uploads', 'content/english-six', 'content/toefl-listening'))


def valid_path(name):
    require(isinstance(name, str) and name and len(name.encode('utf-8')) <= 4096, 'Invalid manifest path')
    require(not name.startswith('/') and not any(p in ('', '.', '..') for p in name.split('/')), 'Unsafe manifest path')
    require(not any(ord(c) < 32 or ord(c) == 127 or c in '\\:' for c in name), 'Unsafe manifest characters')
    require(not excluded(name), 'Excluded manifest path')


def linked(path, info=None):
    try:
        info = info or path.lstat()
    except FileNotFoundError:
        return False
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, 'st_file_attributes', 0) & 0x400)


def no_link(path):
    for part in (path, *path.parents):
        require(not linked(part), 'Symbolic link rejected')


def source_file(root, name):
    current = root
    parts = name.split('/')
    for index, part in enumerate(parts):
        current /= part
        try:
            info = current.lstat()
        except FileNotFoundError:
            return None
        require(not linked(current, info), 'Symbolic link rejected')
        require(stat.S_ISREG(info.st_mode) if index == len(parts) - 1 else stat.S_ISDIR(info.st_mode), 'Source is not a regular file path')
    return current


def decode_manifest(raw):
    require(0 < len(raw) <= MAX_MANIFEST and raw.endswith(b'\0'), 'Invalid bounded NUL manifest')
    paths = raw[:-1].decode('utf-8', 'strict').split('\0')
    require(len(paths) <= 100000 and len(set(paths)) == len(paths), 'Duplicate or excessive manifest entries')
    for name in paths:
        valid_path(name)
    return paths


def make_manifest(repository, project='study-plan'):
    repository = repository.resolve()
    require(project == 'study-plan', 'Unexpected project')
    result = subprocess.run(['git', '-c', 'safe.directory=' + str(repository), '-c', 'core.autocrlf=false',
                             'ls-tree', '--full-tree', '-r', '-z', 'HEAD', '--', project + '/'],
                            cwd=repository, check=True, stdout=subprocess.PIPE)
    paths = []
    project_root = repository / project
    no_link(project_root)
    for entry in result.stdout.split(b'\0'):
        if not entry:
            continue
        metadata, filename = entry.split(b'\t', 1)
        mode, kind, _ = metadata.split(b' ')
        name = filename.decode('utf-8', 'strict')
        require(name.startswith(project + '/'), 'Unexpected Git path')
        name = name[len(project) + 1:]
        if excluded(name):
            continue
        valid_path(name)
        require(mode in (b'100644', b'100755') and kind == b'blob', 'Git path is not a regular file')
        require(source_file(project_root, name) is not None, 'Tracked checkout file is missing')
        paths.append(name)
    paths.sort()
    raw = b''.join(name.encode('utf-8') + b'\0' for name in paths)
    decode_manifest(raw)
    return raw


def seed(source, destination, raw):
    paths = decode_manifest(raw)
    source = Path(os.path.abspath(source))
    destination = Path(os.path.abspath(destination))
    no_link(source)
    no_link(destination)
    require(source.is_dir() and destination.is_dir() and source != destination, 'Invalid seed roots')
    require(not list(destination.iterdir()), 'Release stage must be empty')
    # Validate the entire allowlist before writing anything. Missing old files
    # are left for the authoritative runner rsync; directories/links fail.
    candidates = [(name, source_file(source, name)) for name in paths]
    copied = missing = copied_bytes = 0
    for name, filename in candidates:
        if filename is None:
            missing += 1
            continue
        no_link(filename)
        src_fd = os.open(filename, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
        with os.fdopen(src_fd, 'rb') as incoming:
            before = os.fstat(incoming.fileno())
            require(stat.S_ISREG(before.st_mode), 'Source changed type')
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            no_link(target)
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
            with os.fdopen(fd, 'wb') as outgoing:
                shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
                outgoing.flush()
                after = os.fstat(incoming.fileno())
                require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                        (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'Source changed during seed')
                require(os.fstat(outgoing.fileno()).st_size == before.st_size, 'Incomplete seed copy')
            os.chmod(target, stat.S_IMODE(before.st_mode) & 0o777)
            os.utime(target, ns=(before.st_atime_ns, before.st_mtime_ns))
            copied += 1
            copied_bytes += before.st_size
    return {'status': 'seeded-isolated-release', 'manifestFiles': len(paths), 'copiedFiles': copied,
            'missingFilesForRunner': missing, 'copiedBytes': copied_bytes, 'activeModified': False}


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    manifest = sub.add_parser('manifest')
    manifest.add_argument('--output', required=True)
    remote = sub.add_parser('seed')
    remote.add_argument('--release', required=True)
    args = parser.parse_args()
    if args.command == 'manifest':
        raw = make_manifest(Path.cwd())
        output = Path(args.output)
        no_link(output)
        with output.open('xb') as stream:
            stream.write(raw)
        print(json.dumps({'status': 'tracked-seed-manifest-created', 'files': len(decode_manifest(raw))}))
    else:
        require(re.fullmatch('[a-f0-9]{40}-[1-9][0-9]{0,19}-[1-9][0-9]{0,5}', args.release), 'Invalid release identity')
        print(json.dumps(seed(SOURCE, RELEASES / args.release, sys.stdin.buffer.read(MAX_MANIFEST + 1))))


if __name__ == '__main__':
    main()
