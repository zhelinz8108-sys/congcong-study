"""Read-only, fixed-path deployment capacity probe. Never read learning/config data."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time

APP = Path('/www/study-plan')
RELEASES = Path('/www/study-plan-releases')
DATA = Path('/www/study-plan-data')
CACHE = DATA / 'npm-cache/ubuntu/_cacache'
CACHE_ORIGIN = Path('/home/ubuntu/.npm/_cacache')
RESTORE_RECEIPT = DATA / 'backups/math-restore-40083040672-1/receipt.json'
SHA = re.compile(r'[0-9a-f]{40}')
BUILD = re.compile(r'[A-Za-z0-9_-]{1,128}')


def log_counts(value):
    # The configured SSH-port mask also redacts the public digits "22" in byte
    # counters, making raw JSON numbers invalid. Space-separate only numeric
    # counters; never encode config/credential values or file contents.
    if type(value) in (int, float):
        return ' '.join(str(value))
    if isinstance(value, dict):
        return {key: log_counts(item) for key, item in value.items()}
    if isinstance(value, list):
        return [log_counts(item) for item in value]
    return value


def read_small_regular(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > 16384:
        raise ValueError('Unsupported metadata')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'r', encoding='utf-8') as source:
        return source.read(16385)


def metadata(path):
    try:
        value = json.loads(read_small_regular(path / 'release-metadata.json'))
        if not isinstance(value, dict) or set(value) != {'commit', 'buildId'}:
            return None
        if not isinstance(value['commit'], str) or not SHA.fullmatch(value['commit']):
            return None
        if not isinstance(value['buildId'], str) or not BUILD.fullmatch(value['buildId']):
            return None
        build = read_small_regular(path / '.next/BUILD_ID').strip()
        return {'commit': value['commit'], 'buildId': value['buildId'], 'buildMatchesMetadata': build == value['buildId']}
    except (OSError, ValueError, TypeError, UnicodeError):
        return None


def allocated(path):
    """Use stat only; do not open contents or traverse links/mounted filesystems."""
    if not os.path.lexists(path):
        return {'exists': False, 'allocatedBytes': 0, 'regularBytes': 0, 'files': 0, 'symlinks': 0}
    initial = path.lstat()
    result = {'exists': True, 'allocatedBytes': 0, 'regularBytes': 0, 'files': 0, 'symlinks': 0, 'otherDevicesSkipped': 0}
    seen = set()
    pending = [path]
    while pending:
        item = pending.pop()
        info = item.lstat()
        if info.st_dev != initial.st_dev:
            result['otherDevicesSkipped'] += 1
            continue
        identity = (info.st_dev, info.st_ino)
        if identity in seen:
            continue
        seen.add(identity)
        result['allocatedBytes'] += info.st_blocks * 512
        if stat.S_ISLNK(info.st_mode):
            result['symlinks'] += 1
        elif stat.S_ISREG(info.st_mode):
            result['regularBytes'] += info.st_size
            result['files'] += 1
        elif stat.S_ISDIR(info.st_mode):
            with os.scandir(item) as entries:
                pending.extend(Path(entry.path) for entry in entries)
        else:
            raise ValueError('Special filesystem entry encountered')
    return result


def used_working_directories():
    """Only use process cwd to flag retained releases; never inspect argv/env."""
    result = []
    for link in Path('/proc').glob('[0-9]*/cwd'):
        try:
            path = Path(os.readlink(link))
            if path == APP or path.is_relative_to(RELEASES) or path.is_relative_to(DATA / 'retained-release-archives') or path.is_relative_to(DATA / 'failed-release-archives'):
                result.append(path)
        except (FileNotFoundError, PermissionError, OSError):
            pass
    return result


def restore_pointer():
    try:
        value = json.loads(read_small_regular(RESTORE_RECEIPT))
        candidate = value.get('heldCurrent')
        if value.get('status') != 'restored' or not isinstance(candidate, str):
            return None
        path = Path(candidate)
        if path.parent != RELEASES or not re.fullmatch(r'before-math-restore-[1-9][0-9]{0,19}-[1-9][0-9]{0,5}', path.name):
            return None
        return str(path)
    except (OSError, ValueError, TypeError, UnicodeError):
        return None


def probe():
    if os.geteuid() != 0:
        raise ValueError('Root is required to stat existing retained releases')
    for path in (APP, RELEASES, DATA):
        if not path.is_dir() or path.is_symlink() or path.resolve() != path:
            raise ValueError('Expected known real deployment directories')
    lock_path = Path('/run/study-plan-release/lock')
    descriptor = os.open(lock_path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'rb') as lock:
        # Existing lock only, opened read-only. No production file is created.
        fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
        started = time.monotonic()
        current = metadata(APP)
        held = restore_pointer()
        used = used_working_directories()
        root_space = shutil.disk_usage(RELEASES)
        data_space = shutil.disk_usage(DATA)
        canonical = CACHE_ORIGIN.resolve()
        cache_result = {
            'origin': str(CACHE_ORIGIN),
            'originIsSymlink': CACHE_ORIGIN.is_symlink(),
            'canonical': str(canonical) if canonical in (CACHE_ORIGIN, CACHE) else 'outside-expected-cache-location',
            'expectedDataCache': str(CACHE),
            'expectedDataCacheSize': allocated(CACHE),
        }
        if canonical == CACHE_ORIGIN:
            cache_result['originSize'] = allocated(CACHE_ORIGIN)
        releases = []
        candidates = sorted(RELEASES.iterdir(), key=lambda p: p.name)
        if len(candidates) > 300:
            raise ValueError('Unexpected retained release count')
        for path in candidates:
            if not re.fullmatch(r'[A-Za-z0-9._-]{1,180}', path.name):
                continue
            if not path.is_dir():
                continue
            canonical = path.resolve()
            allowed = canonical.parent == RELEASES or canonical.is_relative_to(DATA / 'failed-release-archives') or canonical.is_relative_to(DATA / 'retained-release-archives')
            if not allowed:
                releases.append({'path': str(path), 'outsideKnownReleaseLocations': True})
                continue
            releases.append({
                'path': str(path), 'canonical': str(canonical), 'isSymlink': path.is_symlink(),
                'onRootFilesystem': canonical.stat().st_dev == RELEASES.stat().st_dev,
                'metadata': metadata(canonical), 'size': allocated(canonical),
                'usedByProcessCwd': any(cwd == canonical or cwd.is_relative_to(canonical) for cwd in used),
                'latestHeldRollback': str(path) == held,
            })
        result = {
            'schema': 'math-grading-deployment-capacity/v1',
            'counterEncoding': 'space-separated decimal digits',
            'readOnly': True,
            'root': {'freeBytes': root_space.free, 'totalBytes': root_space.total},
            'data': {'freeBytes': data_space.free, 'totalBytes': data_space.total},
            'current': {'path': str(APP), 'metadata': current, 'size': allocated(APP)},
            'latestHeldRollback': held,
            'npmDownloadCache': cache_result,
            'releases': releases,
            'elapsedSeconds': round(time.monotonic() - started, 2),
        }
        print(json.dumps(log_counts(result), separators=(',', ':')), flush=True)


def self_test():
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        app = root / 'app'
        app.mkdir()
        (app / '.next').mkdir()
        (app / '.next/BUILD_ID').write_text('safe-build')
        (app / 'release-metadata.json').write_text(json.dumps({'commit': 'a' * 40, 'buildId': 'safe-build'}))
        (root / 'private-placeholder').write_text('DO NOT READ OR PRINT THIS CONTENT')
        (app / 'external-link').symlink_to(root / 'private-placeholder')
        before = (root / 'private-placeholder').stat().st_size
        assert metadata(app) == {'commit': 'a' * 40, 'buildId': 'safe-build', 'buildMatchesMetadata': True}
        size = allocated(app)
        assert size['files'] == 2 and size['symlinks'] == 1
        assert before == (root / 'private-placeholder').stat().st_size
        (app / 'release-metadata.json').write_text(json.dumps({'commit': 'a' * 40, 'buildId': 'safe-build', 'secret': 'NEVER_PRINT'}))
        assert metadata(app) is None
        assert log_counts({'bytes': 122334, 'readOnly': True}) == {'bytes': '1 2 2 3 3 4', 'readOnly': True}
        (app / 'release-metadata.json').unlink()
        (app / 'release-metadata.json').symlink_to(root / 'private-placeholder')
        assert metadata(app) is None
    print('Read-only sizing probe tests passed: stat-only traversal, no link following, metadata allowlist.')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    elif sys.argv[1:]:
        print('::error::Unexpected probe arguments')
        sys.exit(1)
    else:
        try:
            probe()
        except Exception as error:
            print('::error::Read-only probe stopped (' + type(error).__name__ + '); no production files changed', flush=True)
            sys.exit(1)
