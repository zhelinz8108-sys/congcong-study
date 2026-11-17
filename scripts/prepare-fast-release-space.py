"""Release only fixed, obsolete generated trees; keep live/latest rollback data.

The user authorized removing unused server content. This operation never
selects source, materials, uploads, configuration, backups or retained archives.
Default is a read-only plan. No compression or release thresholds change.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
import stat

LIVE = Path('/www/study-plan')
RELEASES = Path('/www/study-plan-releases')
BACKUPS = Path('/www/study-plan-data/backups')
LOCK = Path('/run/study-plan-release/lock')
COMMIT = 'c64ae9005711af6475daf44698224ba85048916a'
PROTECTED = 'previous-' + COMMIT + '-43834284884-1'
OLDER = 'previous-37adda11b81ee4c73c90d931656c0f5d22902103-43653324834-1'
TARGET_FREE = 5 * 1024**3 + 64 * 1024**2


class SpaceError(ValueError):
    def __init__(self, message, **metrics):
        super().__init__(message); self.metrics = metrics


def require(condition, message, **metrics):
    if not condition:
        raise SpaceError(message, **metrics)


def no_links(path):
    path = Path(path)
    require(path.is_absolute() and '..' not in path.parts, 'Expected a fixed absolute path')
    require(all(not entry.is_symlink() for entry in (path, *path.parents)), 'Symbolic-link parent rejected')


def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def read_regular(path, private=False):
    no_links(path.parent)
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, 'rb') as incoming:
        before = os.fstat(incoming.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size <= 65536,
                'Expected bounded regular release metadata')
        if private:
            require(before.st_uid == os.geteuid() and stat.S_IMODE(before.st_mode) & 0o077 == 0,
                    'Release receipt must retain private ownership and permissions')
        raw = incoming.read(65537)
        require(len(raw) <= 65536 and identity(os.fstat(incoming.fileno())) == identity(before),
                'Release metadata changed while reading')
    return raw


def build_id(directory):
    no_links(directory / '.next')
    value = read_regular(directory / '.next/BUILD_ID').decode().strip()
    require(value and len(value) <= 128, 'Invalid release build identity')
    return value


def assert_inactive(directory):
    resolved = directory.resolve()
    for process in Path('/proc').iterdir():
        if not process.name.isdigit() or int(process.name) == os.getpid():
            continue
        try:
            cwd = (process / 'cwd').resolve(strict=True)
            require(not cwd.is_relative_to(resolved), 'A process still uses the reviewed rollback')
            command = (process / 'cmdline').read_bytes()
            require(os.fsencode(str(resolved) + '/') not in command and os.fsencode(str(resolved)) not in command.split(b'\0'),
                    'A worker still references the reviewed rollback')
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            continue


def validate_layout(live, releases, backups):
    for directory in (live, releases, backups, releases / PROTECTED, releases / OLDER):
        no_links(directory)
        require(directory.is_dir(), 'Required intact release directory is unavailable')
    protected, older = releases / PROTECTED, releases / OLDER
    require(live.resolve() not in (protected.resolve(), older.resolve()) and protected.resolve() != older.resolve(),
            'Live and protected rollback identities must remain distinct')
    device = live.stat().st_dev
    require(releases.stat().st_dev == protected.stat().st_dev == older.stat().st_dev == device,
            'Release paths must remain on the same root filesystem')
    metadata = json.loads(read_regular(live / 'release-metadata.json'))
    current_build = build_id(live)
    require(isinstance(metadata, dict) and metadata.get('commit') == COMMIT and metadata.get('buildId') == current_build,
            'Current release commit or build identity differs')
    for release, directory in ((PROTECTED, protected), (OLDER, older)):
        receipt = json.loads(read_regular(backups / ('before-main-' + release.removeprefix('previous-')) / 'receipt.json', private=True))
        require(isinstance(receipt, dict) and receipt.get('status') == 'deployed' and
                receipt.get('commit') == release.removeprefix('previous-').split('-')[0] and
                receipt.get('previousDirectory') == str(directory) and receipt.get('oldBuildId') == build_id(directory),
                'Reviewed rollback receipt or build identity differs')
        if release == PROTECTED:
            require(receipt.get('commit') == COMMIT and receipt.get('newBuildId') == current_build,
                    'Latest successful release receipt does not match the current application')
        assert_inactive(directory)
    return device


def scan_generated(path, device):
    """Never traverse links, mounted subtrees or special runtime files."""
    no_links(path)
    require(path.exists(), 'Planned generated tree disappeared')
    result = {}
    pending = [path]
    while pending:
        entry = pending.pop()
        info = entry.lstat()
        require(info.st_dev == device and (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode)),
                'Cross-filesystem or special generated entry rejected')
        result[entry.relative_to(path).as_posix()] = identity(info)
        if stat.S_ISDIR(info.st_mode):
            pending.extend(entry.iterdir())
    return result


def deletion_plan(live, releases, device):
    older = releases / OLDER
    candidates = []
    modules = older / 'node_modules'
    if os.path.lexists(modules):
        require(modules.is_dir() and not modules.is_symlink(), 'Obsolete dependencies must be a real directory')
        candidates.append(('older-node-modules', modules))
    generated = older / '.next'
    no_links(generated)
    for child in sorted(generated.iterdir()):
        if child.name != 'BUILD_ID':
            candidates.append(('older-next-generated', child))
    webpack = live / '.next/cache/webpack'
    if os.path.lexists(webpack):
        require(webpack.is_dir() and not webpack.is_symlink(), 'Live webpack cache must be a real directory')
        candidates.append(('live-webpack-cache', webpack))
    return [(label, path, scan_generated(path, device)) for label, path in candidates]


def summary(plan):
    totals = {}
    for label, _path, rows in plan:
        item = totals.setdefault(label, {'entries': 0, 'fileMiB': 0, 'bytes': 0})
        item['entries'] += len(rows)
        item['bytes'] += sum(row[6] for row in rows.values() if stat.S_ISREG(row[2]))
    for item in totals.values():
        item['fileMiB'] = item.pop('bytes') // 1024**2
    return totals


def recover_space(live, releases, backups, available, apply=False, target=TARGET_FREE):
    initial = available()
    if initial >= target:
        return {'changed': False, 'rootFreeMiB': initial // 1024**2, 'spacePreparationNeeded': False}
    require(getattr(shutil.rmtree, 'avoids_symlink_attacks', False), 'A descriptor-safe rmtree implementation is required')
    device = validate_layout(live, releases, backups)
    plan = deletion_plan(live, releases, device)
    metrics = {'rootFreeMiB': initial // 1024**2, 'requiredRootMiB': (target + 1024**2 - 1) // 1024**2,
               'generatedCandidates': summary(plan)}
    if not apply:
        return {'changed': False, 'dryRun': True, **metrics}
    # Validate every target again before the first deletion. Failure leaves all
    # generated trees, current app and latest rollback untouched.
    validate_layout(live, releases, backups)
    require(all(scan_generated(path, device) == rows for _label, path, rows in plan),
            'Generated content changed during preflight; nothing was removed')
    removed = 0
    for _label, path, rows in plan:
        if available() >= target:
            break
        validate_layout(live, releases, backups)
        require(scan_generated(path, device) == rows, 'Generated content changed; remaining targets retained')
        if stat.S_ISDIR(path.lstat().st_mode):
            shutil.rmtree(path)
        else:
            path.unlink()
        removed += 1
    final = available()
    require(final >= target, 'Reviewed generated content was insufficient; deployment remains blocked',
            removedTargets=removed, **{**metrics, 'rootFreeMiB': final // 1024**2})
    return {'changed': removed > 0, 'removedTargets': removed, 'rootFreeMiB': final // 1024**2,
            'requiredRootMiB': metrics['requiredRootMiB'], 'generatedCandidates': metrics['generatedCandidates']}


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    require(os.geteuid() == 0, 'Root is required for fixed release-space preparation')
    no_links(LOCK)
    descriptor = os.open(LOCK, os.O_RDWR | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'r+') as lock:
        info = os.fstat(lock.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o600,
                'Invalid private release lock')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = recover_space(LIVE, RELEASES, BACKUPS, lambda: shutil.disk_usage(RELEASES).free, apply=args.apply)
        print(json.dumps({'fastReleaseSpace': result}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except (SpaceError, OSError, ValueError) as error:
        print(json.dumps({'fastReleaseSpaceBlocked': True, 'reason': str(error) if isinstance(error, SpaceError) else type(error).__name__,
                          **getattr(error, 'metrics', {})}), flush=True)
        raise SystemExit(1) from None
