"""Stat-only reproducible cache sizing; process paths stay private in memory."""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile

if 'BASE' not in globals():
    spec = importlib.util.spec_from_file_location('storage_probe', Path(__file__).with_name('probe-english-six-deployment.py'))
    BASE = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(BASE)

PROTECTED = {'e00733cfa66583481e42f2acac0b4756c29e4383', 'f262dc6438e48d3992f1abe2d0e291ff3108b222',
             '4d65d765912e1f9baf4553c7df5bebe9b16274eb', 'bdc35f288531062f5abb029cd263bbd9b51d65b0'}


def directory_identity(fd):
    info = os.fstat(fd)
    return hashlib.sha256(json.dumps([info.st_dev, info.st_ino, info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)]).encode()).hexdigest()


def references(targets):
    """Never return/log PIDs, paths, UIDs or argv; inspect no environ/config."""
    hit = [False] * len(targets)
    stable = True
    before = set(path.name for path in Path('/proc').glob('[0-9]*') if path.name.isdigit())
    for pid in before:
        try:
            process = Path('/proc') / pid
            raw = (process / 'stat').read_text()
            identity = raw[raw.rfind(')') + 2:].split()[19]
            paths = []
            for name in ('cwd', 'exe'):
                try:
                    paths.append(os.readlink(process / name).removesuffix(' (deleted)'))
                except FileNotFoundError:
                    pass  # Kernel threads can have no cwd/exe/user-space fds.
            for fd in (process / 'fd').iterdir():
                try:
                    paths.append(os.readlink(fd).removesuffix(' (deleted)'))
                except FileNotFoundError:
                    pass
            again = (process / 'stat').read_text()
            stable = stable and again[again.rfind(')') + 2:].split()[19] == identity
            for number, target in enumerate(targets):
                hit[number] = hit[number] or any(value == target or value.startswith(target + '/') for value in paths)
        except (FileNotFoundError, PermissionError, ProcessLookupError, OSError, IndexError):
            stable = False
    after = set(path.name for path in Path('/proc').glob('[0-9]*') if path.name.isdigit())
    return {'stableScan': stable and before == after, 'references': hit}


def no_submounts(fd):
    root = os.readlink('/proc/self/fd/' + str(fd))
    with open('/proc/self/mountinfo', encoding='utf8') as source:
        for line in source:
            point = line.split()[4]
            for encoded, actual in (('\\040', ' '), ('\\011', '\t'), ('\\012', '\n'), ('\\134', '\\')):
                point = point.replace(encoded, actual)
            BASE.require(point != root and not point.startswith(root + '/'))


def describe(fd, label, device, meta=None):
    no_submounts(fd)
    info = os.fstat(fd)
    size = BASE.sizes(fd)
    return {'cache': label, 'metadata': meta, 'onRootFilesystem': info.st_dev == device,
            'directoryIdentitySha256': directory_identity(fd), 'size': size,
            'noSymlinks': size['symlinks'] == 0}


def main():
    BASE.require(os.geteuid() == 0)
    handles = []
    try:
        app = BASE.open_dir(BASE.APP); handles.append(app)
        releases = BASE.open_dir(BASE.RELEASES); handles.append(releases)
        lockdir = BASE.open_dir('/run/study-plan-release'); handles.append(lockdir)
        lock = os.open('lock', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=lockdir); handles.append(lock)
        info = os.fstat(lock)
        BASE.require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1)
        fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
        active = BASE.metadata(app)
        BASE.require(active and active['buildMatchesMetadata'] and active['commit'] in PROTECTED)
        device = os.fstat(app).st_dev
        rows, targets, root_retained = [], [], []
        for name in sorted(os.listdir(releases)):
            if not re.fullmatch(r'[A-Za-z0-9._-]{1,180}', name):
                continue
            entry = os.stat(name, dir_fd=releases, follow_symlinks=False)
            if not stat.S_ISDIR(entry.st_mode):
                continue
            source = BASE.child_dir(releases, name)
            try:
                meta = BASE.metadata(source)
                if not meta:
                    continue
                on_root = os.fstat(source).st_dev == device
                protected = meta['commit'] in PROTECTED or meta['commit'] == active['commit']
                root_retained.append({'metadata': meta, 'onRootFilesystem': on_root, 'protected': protected})
                if protected or not on_root:
                    continue
                no_submounts(source)
                next_fd = BASE.child_dir(source, '.next')
                try:
                    try:
                        cache = BASE.child_dir(next_fd, 'cache')
                    except FileNotFoundError:
                        continue
                    try:
                        for label in ('webpack', 'swc'):
                            try:
                                selected = BASE.child_dir(cache, label)
                            except FileNotFoundError:
                                continue
                            try:
                                rows.append(describe(selected, 'inactive-' + label, device, meta))
                                # Entire source must have no runtime references,
                                # not just the selected reproducible cache.
                                targets.append(os.readlink('/proc/self/fd/' + str(source)))
                            finally:
                                os.close(selected)
                    finally:
                        os.close(cache)
                finally:
                    os.close(next_fd)
            finally:
                os.close(source)
        for location, label in (('/root/.npm/_cacache', 'root-npm-download'),):
            try:
                cache = BASE.open_dir(location)
            except FileNotFoundError:
                continue
            try:
                rows.append(describe(cache, label, device))
                targets.append(os.readlink('/proc/self/fd/' + str(cache)))
            finally:
                os.close(cache)
        apt = BASE.open_dir('/var/cache/apt/archives')
        try:
            no_submounts(apt)
            files = [os.stat(name, dir_fd=apt, follow_symlinks=False) for name in os.listdir(apt) if name.endswith('.deb')]
            BASE.require(all(stat.S_ISREG(item.st_mode) and item.st_nlink == 1 for item in files))
            rows.append({'cache': 'apt-package-downloads', 'metadata': None, 'onRootFilesystem': os.fstat(apt).st_dev == device,
                         'directoryIdentitySha256': directory_identity(apt), 'noSymlinks': True,
                         'size': {'allocatedBytes': sum(item.st_blocks * 512 for item in files), 'regularBytes': sum(item.st_size for item in files), 'files': len(files), 'symlinks': 0}})
            targets.append(os.readlink('/proc/self/fd/' + str(apt)))
        finally:
            os.close(apt)
        usage = references(targets)
        for row, used in zip(rows, usage['references']):
            row['noRuntimeReferences'] = not used
        BASE.require(BASE.metadata(app) == active)
        result = {'schema': 'inactive-reproducible-cache-read-only-v1', 'readOnly': True,
                  'rootFreeBytes': shutil.disk_usage(BASE.RELEASES).free, 'dataFreeBytes': shutil.disk_usage(BASE.DATA).free,
                  'active': active, 'retained': root_retained, 'processScanStable': usage['stableScan'], 'caches': rows}
        print('RETAINED_COMPILE_CACHE_REPORT ' + json.dumps(BASE.safe_log(result), separators=(',', ':')), flush=True)
    finally:
        for descriptor in reversed(handles):
            os.close(descriptor)


def self_test():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory); (root / 'cache').mkdir(); (root / 'cache/item.pack').write_bytes(b'reproducible' * 4096)
        fd = BASE.open_dir(str(root / 'cache'))
        try:
            before = directory_identity(fd)
            result = describe(fd, 'synthetic-webpack', os.fstat(fd).st_dev)
            BASE.require(result['noSymlinks'] and result['onRootFilesystem'] and result['size']['files'] == 1)
            BASE.require(before == directory_identity(fd))
            (root / 'cache/link').symlink_to('/never-follow')
            BASE.require(not describe(fd, 'synthetic-webpack', os.fstat(fd).st_dev)['noSymlinks'])
            BASE.require(references([str(root / 'unrelated')])['references'] == [False])
            ready_read, ready_write = os.pipe()
            stop_read, stop_write = os.pipe()
            child = os.fork()
            if child == 0:
                try:
                    os.close(ready_read); os.close(stop_write)
                    os.close(fd)
                    busy = os.open(root / 'cache/item.pack', os.O_RDONLY)
                    os.write(ready_write, b'1')
                    os.read(stop_read, 1)
                    os.close(busy)
                finally:
                    os._exit(0)
            os.close(ready_write); os.close(stop_read)
            try:
                BASE.require(os.read(ready_read, 1) == b'1')
                os.close(fd); fd = None
                BASE.require(references([str(root / 'cache')])['references'] == [True])
            finally:
                os.close(ready_read); os.close(stop_write)
                os.waitpid(child, 0)
                fd = BASE.open_dir(str(root / 'cache'))
        finally:
            os.close(fd)
    print('Read-only compile-cache sizing and private process-reference checks passed.')


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--self-test']:
            self_test()
        elif sys.argv[1:]:
            raise ValueError('Unsupported invocation')
        else:
            main()
    except Exception:
        print('Read-only compile-cache sizing blocked; no production files changed.', flush=True)
        sys.exit(1)
