"""Remove only two fixed, unused Webpack compiler caches during archive prep.

Compiled server/static output, uploads, learner records and all backups remain
outside the selected directories. No deployment process is stopped or changed.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess

MIB = 1024**2
TARGET_FREE = 5184 * MIB
MAXIMUM = 1024**3
ROOT = Path('/www/study-plan-releases')
CANDIDATES = (
    ROOT / 'previous-37adda11b81ee4c73c90d931656c0f5d22902103-43653324834-1/.next/cache/webpack',
    Path('/www/study-plan/.next/cache/webpack'),
)
OWNERS = frozenset({0, 1000})
QUARANTINE = '.webpack-unused-c64-cleanup'
DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


class CleanupError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise CleanupError(message)


def open_directory(path, owners=OWNERS):
    path = Path(path)
    require(path.is_absolute() and '..' not in path.parts, 'Expected a fixed absolute directory')
    descriptor = os.open('/', DIRECTORY_FLAGS)
    try:
        require(os.fstat(descriptor).st_uid in owners, 'Unexpected directory owner')
        for part in path.parts[1:]:
            child = os.open(part, DIRECTORY_FLAGS, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
            require(os.fstat(descriptor).st_uid in owners, 'Unexpected directory owner')
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid)


def tree_snapshot(descriptor, owners):
    result = {}
    allocated = os.fstat(descriptor).st_blocks * 512

    def visit(directory, prefix):
        nonlocal allocated
        for name in sorted(os.listdir(directory)):
            info = os.stat(name, dir_fd=directory, follow_symlinks=False)
            require(info.st_uid in owners, 'Unexpected compiler-cache owner')
            require(stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode),
                    'Compiler cache contains an unsupported file type')
            key = prefix + (name,)
            result[key] = (identity(info), info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
            allocated += info.st_blocks * 512
            if stat.S_ISDIR(info.st_mode):
                child = os.open(name, DIRECTORY_FLAGS, dir_fd=directory)
                try:
                    require(identity(os.fstat(child)) == identity(info), 'Compiler-cache directory changed')
                    visit(child, key)
                finally:
                    os.close(child)

    visit(descriptor, ())
    return result, allocated


def cache_busy(path):
    """Inspect process references without logging arguments or private names."""
    path = Path(path)
    for process in Path('/proc').iterdir():
        if not process.name.isdigit() or int(process.name) == os.getpid():
            continue
        try:
            cwd = (process / 'cwd').resolve(strict=True)
            if cwd.is_relative_to(path):
                return True
            for descriptor in (process / 'fd').iterdir():
                try:
                    reference = Path(os.readlink(descriptor))
                    if reference.is_absolute() and reference.is_relative_to(path):
                        return True
                except FileNotFoundError:
                    continue
        except (FileNotFoundError, ProcessLookupError):
            continue
        except PermissionError:
            return True
    return False


def cleanup_cache(target, maximum=MAXIMUM, owners=OWNERS, busy=cache_busy, before_rename=None):
    target = Path(target)
    require(target.parts[-3:] == ('.next', 'cache', 'webpack'), 'Only a Webpack compiler-cache directory is eligible')
    require(shutil.rmtree.avoids_symlink_attacks, 'Descriptor-safe directory removal is required')
    try:
        parent = open_directory(target.parent, owners=owners)
    except FileNotFoundError:
        return {'releasedBytes': 0, 'cacheRemoved': False}
    descriptor = None
    renamed = False
    try:
        try:
            info = os.stat(target.name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            return {'releasedBytes': 0, 'cacheRemoved': False}
        require(stat.S_ISDIR(info.st_mode) and info.st_uid in owners, 'Unexpected compiler-cache directory')
        descriptor = os.open(target.name, DIRECTORY_FLAGS, dir_fd=parent)
        require(identity(os.fstat(descriptor)) == identity(info), 'Compiler cache changed before inspection')
        before, allocated = tree_snapshot(descriptor, owners)
        require(allocated <= maximum, 'Compiler-cache cleanup would exceed its fixed limit')
        require(not busy(target), 'A process still uses the compiler cache')
        try:
            os.stat(QUARANTINE, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise CleanupError('An earlier compiler-cache cleanup needs review')
        if before_rename is not None:
            before_rename()
        require(identity(os.stat(target.name, dir_fd=parent, follow_symlinks=False)) == identity(info),
                'Compiler cache was replaced; no cache removed')
        require(tree_snapshot(descriptor, owners) == (before, allocated), 'Compiler cache changed; no cache removed')
        os.rename(target.name, QUARANTINE, src_dir_fd=parent, dst_dir_fd=parent)
        renamed = True
        os.fsync(parent)
        require(identity(os.stat(QUARANTINE, dir_fd=parent, follow_symlinks=False)) == identity(info),
                'Renamed compiler-cache identity differs')
        require(not busy(target.parent / QUARANTINE), 'A process still uses the renamed compiler cache')
        require(tree_snapshot(descriptor, owners) == (before, allocated), 'Renamed compiler cache changed')
        shutil.rmtree(QUARANTINE, dir_fd=parent)
        renamed = False
        os.fsync(parent)
        return {'releasedBytes': allocated, 'cacheRemoved': True}
    except BaseException:
        if renamed:
            try:
                os.stat(target.name, dir_fd=parent, follow_symlinks=False)
            except FileNotFoundError:
                os.rename(QUARANTINE, target.name, src_dir_fd=parent, dst_dir_fd=parent)
                os.fsync(parent)
        raise
    finally:
        if descriptor is not None:
            os.close(descriptor)
        os.close(parent)


def preparation_worker_present():
    matches = 0
    for process in Path('/proc').iterdir():
        if not process.name.isdigit():
            continue
        try:
            if process.stat().st_uid != 0 or not (process / 'comm').read_text().startswith('python'):
                continue
            with (process / 'cmdline').open('rb') as stream:
                arguments = stream.read(512 * 1024).rstrip(b'\0').split(b'\0')
            if arguments and arguments[-1] == b'--apply-vocab':
                matches += 1
        except (FileNotFoundError, ProcessLookupError):
            continue
    return matches == 1


def recover(candidates, available, worker_present, maximum=MAXIMUM, target_free=TARGET_FREE, cleanup=cleanup_cache):
    initial = available()
    if initial >= target_free:
        return {'releasedBytes': 0, 'cachesRemoved': 0, 'rootFreeBytes': initial, 'cleanupNeeded': False}
    if not worker_present():
        return {'releasedBytes': 0, 'cachesRemoved': 0, 'rootFreeBytes': initial, 'preparationWorkerPresent': False}
    released = removed = 0
    for target in candidates:
        if available() >= target_free or not worker_present():
            break
        result = cleanup(target, maximum=maximum - released)
        released += result['releasedBytes']
        removed += int(result['cacheRemoved'])
        require(released <= maximum, 'Compiler-cache cleanup exceeded its fixed limit')
    return {'releasedBytes': released, 'cachesRemoved': removed, 'rootFreeBytes': available(), 'cleanupNeeded': True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', required=True)
    parser.parse_args()
    require(os.geteuid() == 0, 'Root is required for fixed compiler-cache cleanup')
    available = lambda: shutil.disk_usage(ROOT).free
    if available() >= TARGET_FREE or not preparation_worker_present():
        print(json.dumps({'cleanupSkipped': True, 'rootFreeMiB': available() // MIB}), flush=True)
        return
    require(subprocess.run(['systemctl', 'is-active', '--quiet', 'study-plan.service']).returncode == 0,
            'The existing production service must remain active')
    directory = Path('/run/study-plan-unused-cache-cleanup')
    run_descriptor = open_directory(directory.parent)
    try:
        try:
            os.mkdir(directory.name, mode=0o700, dir_fd=run_descriptor)
        except FileExistsError:
            pass
    finally:
        os.close(run_descriptor)
    descriptor = open_directory(directory)
    try:
        info = os.fstat(descriptor)
        require(info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o700, 'Invalid private cleanup lock directory')
        lock_descriptor = os.open('lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=descriptor)
    finally:
        os.close(descriptor)
    with os.fdopen(lock_descriptor, 'r+') as lock:
        info = os.fstat(lock.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and
                stat.S_IMODE(info.st_mode) == 0o600, 'Invalid cleanup lock')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = recover(CANDIDATES, available, preparation_worker_present)
        print(json.dumps({'cachesRemoved': result['cachesRemoved'],
                          'releasedMiB': result['releasedBytes'] // MIB,
                          'rootFreeMiB': result['rootFreeBytes'] // MIB}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except (CleanupError, OSError, ValueError):
        print(json.dumps({'cleanupBlocked': True, 'reason': 'Compiler-cache ownership, path or active-use check failed'}), flush=True)
        raise SystemExit(1)
