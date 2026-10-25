"""Fixed-path read-only storage/retention probe. No learning/config contents."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile

APP = '/www/study-plan'
RELEASES = '/www/study-plan-releases'
DATA = '/www/study-plan-data'
EXPECTED = 'f262dc6438e48d3992f1abe2d0e291ff3108b222'
LATEST_ROLLBACK = 'previous-' + EXPECTED + '-40091967756-1'
HELD_AUDIO = 'before-math-restore-40083040672-1'
FAILED = (
 '0b904ef68fb8ba4eb3a4bc0d8e1c09525e0dc1c3-39028619168-1',
 '5ea125771d897dc04da0cb87b67f2240364f2068-39028897397-1',
 '20cf84affaf384a0e46830642dbe5459021389dc-39029146667-1',
 '65fea257f62a880737c78add19283958b88d7dee-39034886777-1',
)
EXCLUDED = ('content/english-six', 'content/toefl-listening', 'public/uploads', 'public/listening', 'content/chinese-six/pages', 'content/grade6-bank/private')


def require(value):
    if not value:
        raise ValueError('Read-only preflight blocked')


def open_dir(value):
    require(Path(value).is_absolute())
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in Path(value).parts[1:]:
            require(part not in ('.', '..') and '/' not in part)
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except Exception:
        os.close(fd)
        raise


def child_dir(fd, name):
    require(isinstance(name, str) and 0 < len(name) <= 255 and '/' not in name and '\0' not in name and name not in ('.', '..'))
    return os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)


def small(fd, name):
    require(re.fullmatch(r'[A-Za-z0-9._-]{1,180}', name) and name not in ('.', '..'))
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
    try:
        before = os.fstat(descriptor)
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and 0 < before.st_size <= 16384)
        raw = os.read(descriptor, 16385)
        after = os.fstat(descriptor)
        require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) and len(raw) == before.st_size)
        return raw.decode('utf8')
    finally:
        os.close(descriptor)


def metadata(fd):
    try:
        value = json.loads(small(fd, 'release-metadata.json'))
        require(isinstance(value, dict) and set(value) == {'commit', 'buildId'})
        require(isinstance(value['commit'], str) and re.fullmatch(r'[0-9a-f]{40}', value['commit']))
        require(isinstance(value['buildId'], str) and re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value['buildId']))
        build = child_dir(fd, '.next')
        try:
            value['buildMatchesMetadata'] = small(build, 'BUILD_ID').strip() == value['buildId']
        finally:
            os.close(build)
        return value
    except (OSError, ValueError, TypeError, UnicodeError):
        return None


def excluded(name):
    return (any(part.startswith(('.env', '.next')) or part in ('.data', 'node_modules') for part in name.split('/'))
            or name.endswith('.private.json') or any(name == prefix or name.startswith(prefix + '/') for prefix in EXCLUDED))


def sizes(fd, code_only=False):
    """Stat only: never open file contents/follow symlinks; reject device changes."""
    device = os.fstat(fd).st_dev
    result = {'allocatedBytes': 0, 'regularBytes': 0, 'files': 0, 'symlinks': 0}
    seen = set()

    def walk(directory, prefix=''):
        for name in os.listdir(directory):
            relative = prefix + name
            if code_only and excluded(relative):
                continue
            info = os.stat(name, dir_fd=directory, follow_symlinks=False)
            require(info.st_dev == device)
            identity = (info.st_dev, info.st_ino)
            if identity in seen and not code_only:
                continue
            seen.add(identity)
            result['allocatedBytes'] += info.st_blocks * 512
            if stat.S_ISREG(info.st_mode):
                result['regularBytes'] += info.st_size
                result['files'] += 1
            elif stat.S_ISLNK(info.st_mode):
                result['symlinks'] += 1
            elif stat.S_ISDIR(info.st_mode):
                child = child_dir(directory, name)
                try:
                    require(os.fstat(child).st_dev == device)
                    walk(child, relative + '/')
                finally:
                    os.close(child)
            else:
                raise ValueError('Unsupported entry')

    walk(fd)
    return result


def safe_log(value):
    if type(value) in (int, float):
        return ' '.join(str(value))
    if isinstance(value, str) and re.fullmatch(r'[0-9a-f]{40}|[0-9a-f]{64}', value):
        return ' '.join(value)
    if isinstance(value, dict):
        return {key: (' '.join(item) if key == 'buildId' and isinstance(item, str) else safe_log(item)) for key, item in value.items()}
    if isinstance(value, list):
        return [safe_log(item) for item in value]
    return value


def probe():
    require(os.geteuid() == 0)
    handles = []
    try:
        app = open_dir(APP); handles.append(app)
        releases = open_dir(RELEASES); handles.append(releases)
        data = open_dir(DATA); handles.append(data)
        require(os.fstat(app).st_dev == os.fstat(releases).st_dev != os.fstat(data).st_dev)
        lockdir = open_dir('/run/study-plan-release'); handles.append(lockdir)
        lockdirinfo = os.fstat(lockdir)
        require(lockdirinfo.st_uid == 0 and stat.S_IMODE(lockdirinfo.st_mode) == 0o700)
        lock = os.open('lock', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=lockdir); handles.append(lock)
        lockinfo = os.fstat(lock)
        require(stat.S_ISREG(lockinfo.st_mode) and lockinfo.st_uid == 0 and lockinfo.st_nlink == 1 and stat.S_IMODE(lockinfo.st_mode) == 0o600)
        fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
        active = metadata(app)
        require(active and active['buildMatchesMetadata'])
        rows = []
        names = sorted(os.listdir(releases)); require(len(names) <= 300)
        for name in names:
            if not re.fullmatch(r'[A-Za-z0-9._-]{1,180}', name):
                continue
            info = os.stat(name, dir_fd=releases, follow_symlinks=False)
            if not stat.S_ISDIR(info.st_mode):
                continue
            folder = child_dir(releases, name)
            try:
                identity = metadata(folder)
                if identity:
                    role = ('rollback-of-current-commit' if name.startswith('previous-' + active['commit'] + '-')
                            else 'previous-math-release-rollback' if name == LATEST_ROLLBACK
                            else 'held-audio-rollback' if name == HELD_AUDIO else 'other-retained')
                    rows.append({'role': role,
                                 'metadata': identity, 'size': sizes(folder)})
            finally:
                os.close(folder)
        largest = 0
        for name in FAILED:
            # Only the same four pre-existing archived stages used by the
            # normal deployment threshold; no changes, hashes or source reads.
            folder = open_dir(DATA + '/failed-release-archives/' + name)
            try:
                largest = max(largest, sizes(folder, True)['regularBytes'])
            finally:
                os.close(folder)
        root_free, data_free = shutil.disk_usage(RELEASES).free, shutil.disk_usage(DATA).free
        required_root = 4 * 1024 ** 3 + largest + 64 * 1024 ** 2
        cache = open_dir(DATA + '/npm-cache/ubuntu/_cacache'); handles.append(cache)
        result = {'schema': 'english-six-deployment-read-only-v1', 'publicIdentityEncoding': 'space-separated characters',
                  'counterEncoding': 'space-separated decimal digits', 'readOnly': True,
                  'rootFreeBytes': root_free, 'dataFreeBytes': data_free, 'largestPriorCodeBytes': largest,
                  'requiredRootBytes': required_root, 'requiredDataBytes': 10 * 1024 ** 3,
                  'rootThresholdPasses': root_free >= required_root, 'dataThresholdPasses': data_free >= 10 * 1024 ** 3,
                  'activeMatchesExpected': active['commit'] == EXPECTED, 'active': active,
                  'retained': rows, 'reproducibleDownloadCacheAllocatedBytes': sizes(cache)['allocatedBytes']}
        require(metadata(app) == active)
        print('ENGLISH_DEPLOYMENT_CAPACITY ' + json.dumps(safe_log(result), separators=(',', ':')), flush=True)
    finally:
        for descriptor in reversed(handles):
            os.close(descriptor)


def self_test():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        (root / '.next').mkdir()
        (root / '.next/BUILD_ID').write_text('safe-build')
        (root / 'release-metadata.json').write_text(json.dumps({'commit': 'a' * 40, 'buildId': 'safe-build'}))
        (root / '.env.private').write_text('PRIVATE PLACEHOLDER NEVER READ')
        (root / 'outside-link').symlink_to('/etc/passwd')
        fd = open_dir(directory)
        try:
            require(metadata(fd) == {'commit': 'a' * 40, 'buildId': 'safe-build', 'buildMatchesMetadata': True})
            require(sizes(fd)['symlinks'] == 1)
            require(sizes(fd, True)['files'] == 1)
            (root / 'release-metadata.json').unlink(); (root / 'release-metadata.json').symlink_to('/etc/passwd')
            require(metadata(fd) is None)
            try:
                child_dir(fd, '../escape')
                raise AssertionError('Traversal accepted')
            except ValueError:
                pass
        finally:
            os.close(fd)
        require(safe_log({'count': 122334, 'readOnly': True, 'commit': 'a' * 40}) == {'count': '1 2 2 3 3 4', 'readOnly': True, 'commit': ' '.join('a' * 40)})
    print('Read-only storage synthetic checks passed.')


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--self-test']:
            self_test()
        elif sys.argv[1:]:
            raise ValueError('Unsupported invocation')
        else:
            probe()
    except Exception:
        print('Read-only deployment preflight blocked; no production files changed.', flush=True)
        sys.exit(1)
