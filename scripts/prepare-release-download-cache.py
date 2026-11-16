"""Recover only verified, unneeded npm content-addressed download objects.

Current package-lock objects, cache indexes, logs, dependencies and learner
files are never candidates. Production paths and recovery limits are fixed.
"""
import argparse
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat

DATA = Path('/www/study-plan-data')
CACHE = DATA / 'npm-cache/ubuntu/_cacache'
PACKAGE_LOCK = Path('/www/study-plan/package-lock.json')
RELEASE_LOCK = Path('/run/study-plan-release/lock')
TARGET_FREE = 10 * 1024**3 + 256 * 1024**2
MAX_RECOVERY = 512 * 1024**2
OWNER = (1000, 1001)
BUCKET = re.compile(r'[0-9a-f]{2}')
OBJECT = re.compile(r'[0-9a-f]{124}')
DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
OBJECT_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK


class RecoveryError(ValueError):
    def __init__(self, message, **metrics):
        super().__init__(message)
        self.metrics = metrics


def require(condition, message, **metrics):
    if not condition:
        raise RecoveryError(message, **metrics)


def open_directory(path):
    """Open every component without following a directory symbolic link."""
    path = Path(path)
    require(path.is_absolute() and '..' not in path.parts, 'Expected an absolute fixed directory')
    descriptor = os.open('/', DIRECTORY_FLAGS)
    try:
        for part in path.parts[1:]:
            child = os.open(part, DIRECTORY_FLAGS, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def signature(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_blocks, info.st_mtime_ns,
            info.st_ctime_ns)


def read_package_lock(path):
    parent = open_directory(Path(path).parent)
    try:
        descriptor = os.open(Path(path).name, OBJECT_FLAGS, dir_fd=parent)
    finally:
        os.close(parent)
    with os.fdopen(descriptor, 'rb') as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size <= 16 * 1024**2,
                'Expected a bounded regular active package lock')
        contents = stream.read(16 * 1024**2 + 1)
        require(len(contents) <= 16 * 1024**2, 'Active package lock exceeded its bounded size')
        require(signature(os.fstat(stream.fileno())) == signature(before), 'Active package lock changed while reading')
    document = json.loads(contents)
    require(isinstance(document, dict) and isinstance(document.get('packages'), dict), 'Unsupported active package lock')
    protected = set()
    for package in document['packages'].values():
        require(isinstance(package, dict), 'Invalid active package-lock entry')
        integrity = package.get('integrity', '')
        require(isinstance(integrity, str), 'Invalid package integrity')
        found = False
        for token in integrity.split():
            if not token.startswith('sha512-'):
                continue
            digest = base64.b64decode(token[7:].split('?', 1)[0], validate=True)
            require(len(digest) == 64, 'Invalid SHA-512 package integrity')
            protected.add(digest.hex())
            found = True
        if package.get('resolved') and not package.get('link'):
            require(found, 'Every resolved active package must have SHA-512 protection')
    require(protected, 'No active package objects could be protected')
    return protected, signature(before), hashlib.sha256(contents).hexdigest()


def assert_current_paths(cache, cache_info, package_lock, lock_signature):
    current_cache = open_directory(cache)
    try:
        require(signature(os.fstat(current_cache))[:6] == signature(cache_info)[:6],
                'Cache directory changed; remaining objects retained')
    finally:
        os.close(current_cache)
    parent = open_directory(Path(package_lock).parent)
    try:
        descriptor = os.open(Path(package_lock).name, OBJECT_FLAGS, dir_fd=parent)
    finally:
        os.close(parent)
    try:
        require(signature(os.fstat(descriptor)) == lock_signature,
                'Active package lock changed; remaining objects retained')
    finally:
        os.close(descriptor)


def open_object_parent(cache_descriptor, parts):
    parent = os.dup(cache_descriptor)
    try:
        for part in parts[:-1]:
            child = os.open(part, DIRECTORY_FLAGS, dir_fd=parent)
            os.close(parent)
            parent = child
        return parent
    except BaseException:
        os.close(parent)
        raise


def inspect_object(cache_descriptor, parts, owner, protected):
    """Return a stable object identity only after verifying its addressed bytes."""
    digest = ''.join(parts[2:])
    if digest in protected:
        return None
    parent = descriptor = None
    try:
        parent = open_object_parent(cache_descriptor, parts)
        descriptor = os.open(parts[-1], OBJECT_FLAGS, dir_fd=parent)
        before = os.fstat(descriptor)
        if not (stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
                (before.st_uid, before.st_gid) == owner and before.st_blocks > 0):
            return None
        with os.fdopen(descriptor, 'rb', closefd=False) as stream:
            actual = hashlib.file_digest(stream, 'sha512').hexdigest()
        if actual != digest:
            return None
        after = os.fstat(descriptor)
        linked = os.stat(parts[-1], dir_fd=parent, follow_symlinks=False)
        if signature(before) != signature(after) or signature(after) != signature(linked):
            return None
        return {'parts': parts, 'signature': signature(after), 'allocated': after.st_blocks * 512,
                'modified': after.st_mtime_ns}
    except (OSError, ValueError):
        return None
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if parent is not None:
            os.close(parent)


def collect_candidates(cache_descriptor, owner, protected):
    """Only visit the exact lowercase SHA-512 npm object namespace."""
    candidates = []
    try:
        content = os.open('content-v2', DIRECTORY_FLAGS, dir_fd=cache_descriptor)
    except FileNotFoundError:
        return candidates
    try:
        try:
            namespace = os.open('sha512', DIRECTORY_FLAGS, dir_fd=content)
        except FileNotFoundError:
            return candidates
        try:
            for first in sorted(os.listdir(namespace)):
                if not BUCKET.fullmatch(first):
                    continue
                first_descriptor = None
                try:
                    first_descriptor = os.open(first, DIRECTORY_FLAGS, dir_fd=namespace)
                    for second in sorted(os.listdir(first_descriptor)):
                        if not BUCKET.fullmatch(second):
                            continue
                        second_descriptor = None
                        try:
                            second_descriptor = os.open(second, DIRECTORY_FLAGS, dir_fd=first_descriptor)
                            for name in sorted(os.listdir(second_descriptor)):
                                if not OBJECT.fullmatch(name):
                                    continue
                                parts = ('content-v2', 'sha512', first, second, name)
                                candidate = inspect_object(cache_descriptor, parts, owner, protected)
                                if candidate:
                                    candidates.append(candidate)
                        except OSError:
                            continue
                        finally:
                            if second_descriptor is not None:
                                os.close(second_descriptor)
                except OSError:
                    continue
                finally:
                    if first_descriptor is not None:
                        os.close(first_descriptor)
        finally:
            os.close(namespace)
    finally:
        os.close(content)
    return sorted(candidates, key=lambda candidate: (candidate['modified'], candidate['parts']))


def recover_cache(cache, package_lock, available, owner=OWNER, target=TARGET_FREE,
                  maximum=MAX_RECOVERY, device=None):
    """Parameters permit synthetic tests; the CLI always uses fixed paths."""
    initial = available()
    if initial >= target:
        return {'cacheObjectsReleased': 0, 'reclaimedMiB': 0, 'dataFreeMiB': initial // 1024**2,
                'cacheRecoveryNeeded': False}
    require(target - initial <= maximum, 'Required download-cache recovery exceeds the fixed limit',
            neededMiB=(target - initial + 1024**2 - 1) // 1024**2)
    descriptor = open_directory(cache)
    try:
        cache_info = os.fstat(descriptor)
        require((cache_info.st_uid, cache_info.st_gid) == owner, 'Unexpected npm cache owner')
        require(device is None or cache_info.st_dev == device, 'Cache must reside on the known data disk')
        protected, lock_signature, lock_digest = read_package_lock(package_lock)
        candidates = collect_candidates(descriptor, owner, protected)
        selected, allocated = [], 0
        needed = target - initial
        for candidate in candidates:
            if allocated + candidate['allocated'] > maximum:
                continue
            selected.append(candidate)
            allocated += candidate['allocated']
            if allocated >= needed:
                break
        require(allocated >= needed, 'Insufficient verified unused cache objects; no objects were removed',
                eligibleMiB=sum(candidate['allocated'] for candidate in candidates) // 1024**2,
                neededMiB=(needed + 1024**2 - 1) // 1024**2)
        # Complete planning and verification precede any deletion. A changed
        # object, lock or cache directory causes a stop without starting cleanup.
        for candidate in selected:
            current = inspect_object(descriptor, candidate['parts'], owner, protected)
            require(current is not None and current['signature'] == candidate['signature'],
                    'Planned download-cache object changed; no objects were removed')
        current_protected, current_signature, current_digest = read_package_lock(package_lock)
        require((current_protected, current_signature, current_digest) == (protected, lock_signature, lock_digest),
                'Active package lock changed; no objects were removed')
        assert_current_paths(cache, cache_info, package_lock, lock_signature)
        removed = reclaimed = 0
        for candidate in selected:
            if available() >= target:
                break
            assert_current_paths(cache, cache_info, package_lock, lock_signature)
            parent = open_object_parent(descriptor, candidate['parts'])
            file_descriptor = None
            try:
                file_descriptor = os.open(candidate['parts'][-1], OBJECT_FLAGS, dir_fd=parent)
                before = os.fstat(file_descriptor)
                require(signature(before) == candidate['signature'], 'Download-cache object changed; remaining objects retained')
                with os.fdopen(file_descriptor, 'rb', closefd=False) as stream:
                    actual = hashlib.file_digest(stream, 'sha512').hexdigest()
                require(actual == ''.join(candidate['parts'][2:]), 'Download-cache digest changed; remaining objects retained')
                linked = os.stat(candidate['parts'][-1], dir_fd=parent, follow_symlinks=False)
                require(signature(os.fstat(file_descriptor)) == signature(before) == signature(linked),
                        'Download-cache identity changed; remaining objects retained')
                os.unlink(candidate['parts'][-1], dir_fd=parent)
                os.fsync(parent)
                removed += 1
                reclaimed += candidate['allocated']
            finally:
                if file_descriptor is not None:
                    os.close(file_descriptor)
                os.close(parent)
        final = available()
        require(final >= target, 'Concurrent disk use consumed recovered cache capacity; release remains blocked')
        return {'cacheObjectsReleased': removed, 'reclaimedMiB': reclaimed // 1024**2,
                'dataFreeMiB': final // 1024**2, 'cacheRecoveryNeeded': True}
    finally:
        os.close(descriptor)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', required=True)
    parser.parse_args()
    require(os.geteuid() == 0, 'Root is required for the fixed release cache operation')
    lock_parent = open_directory(RELEASE_LOCK.parent)
    try:
        parent_info = os.fstat(lock_parent)
        require(parent_info.st_uid == 0 and stat.S_IMODE(parent_info.st_mode) == 0o700,
                'Expected the existing private release lock directory')
        lock_descriptor = os.open(RELEASE_LOCK.name, os.O_RDWR | os.O_NOFOLLOW, dir_fd=lock_parent)
    finally:
        os.close(lock_parent)
    with os.fdopen(lock_descriptor, 'r+') as lock:
        info = os.fstat(lock.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and
                stat.S_IMODE(info.st_mode) == 0o600, 'Invalid existing release lock')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        data_descriptor = open_directory(DATA)
        try:
            data_device = os.fstat(data_descriptor).st_dev
            require(data_device != Path('/').stat().st_dev,
                    'The known data disk must be mounted separately')
        finally:
            os.close(data_descriptor)
        result = recover_cache(CACHE, PACKAGE_LOCK, lambda: shutil.disk_usage(DATA).free, device=data_device)
        print(json.dumps(result), flush=True)


if __name__ == '__main__':
    try:
        main()
    except RecoveryError as error:
        print(json.dumps({'cacheRecoveryBlocked': True, 'reason': str(error), **error.metrics}), flush=True)
        raise SystemExit(1)
    except (OSError, ValueError, TypeError, KeyError):
        # Do not expose object addresses, package names or private file contents
        # through filesystem/JSON exceptions in a public Actions log.
        print(json.dumps({'cacheRecoveryBlocked': True, 'reason': 'Invalid or changed filesystem metadata'}), flush=True)
        raise SystemExit(1)
