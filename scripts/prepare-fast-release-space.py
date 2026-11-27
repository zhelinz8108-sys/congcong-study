"""Release only fixed, obsolete generated trees; keep live/latest rollback data.

The user authorized removing unused server content. Generated trees are
preferred; an older source/material file is eligible only when independent
byte-identical live and latest-rollback copies both remain verified intact.
Uploads, independent media, configuration, backups and archives are excluded.
Default is a read-only plan. The runner supplies its measured checkout size.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat

LIVE = Path('/www/study-plan')
RELEASES = Path('/www/study-plan-releases')
BACKUPS = Path('/www/study-plan-data/backups')
LOCK = Path('/run/study-plan-release/lock')
COMMIT = 'c4c9eabd8613a4fe2b3560c021ec2c8bbe3629d5'
PROTECTED = 'previous-' + COMMIT + '-46011125811-1'
OLDER = 'previous-e07c65023715f6e74f67fa0dfe0756055caa2f44-45671713553-1'
EARLIER_DUPLICATES = 'previous-0add12fc94fdb6c2e0337dfd3b5eaadd4fe51a6d-44058067878-1'
DUPLICATE_RELEASES = (
    'previous-fc5895eae61b5b45c5a07c2fd91e3103361aa194-45669142939-1',
    'previous-bef9f3ddf790c6e5cb6cd530d9ecf5271b8b184f-45662919143-1',
    'previous-73d0d0dfdf73a4ad54e8a8ba7574dc02f06fc4e0-45661308854-1',
    'previous-60e9a73333ac50cff76867aecae88251ba10f940-45659180284-1',
    'previous-77e3a9de01775fc9f44db0fb5864091062b72579-45656349855-1',
    'previous-047c09791c7f5f806a2f42eb258d86869bfc9a02-45651888404-1',
    'previous-71560cdce049c6ddb45d340b8caee863df5d82ef-45649029009-1',
    'previous-36257f85ce485a9961f3b3043baac2ca4479000c-45644748583-1',
    'previous-2b199d450530813404cfe0050dc9d7fefe7d16af-45637628339-1',
    'previous-d067d900c73c374d43baba0767c271d60de0709e-45628569365-1',
    'previous-1da25d63eed7d354651c886ac468fffb69347499-45625924120-1',
    'previous-8a5022b071b5a30b97e2dccadc87cfe60fa8a222-45552652858-1',
    'previous-52494df3c4d4b439d6dbad8d9f24668aec494035-44885842599-1',
    'previous-d83c175cef7c8682638a9a6a45ac950c81c1a856-44837004221-1',
    'previous-b3409a406ec02d37596557c257f9b438790a31ac-44464580830-1',
    'previous-be86fb9e392bc3e9779b4465e751d228eb9c7df9-44458782126-1',
    EARLIER_DUPLICATES,
    'previous-c64ae9005711af6475daf44698224ba85048916a-43834284884-1',
    'previous-37adda11b81ee4c73c90d931656c0f5d22902103-43653324834-1',
)
TARGET_FREE = 5 * 1024**3 + 64 * 1024**2
BUILD_HEADROOM = 4 * 1024**3
UNMEASURED_UPLOAD_MARGIN = 256 * 1024**2
TRANSFER_HEADROOM = 64 * 1024**2
DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
DUPLICATE_ROOTS = ('src', 'content', 'public', 'scripts')


class SpaceError(ValueError):
    def __init__(self, message, **metrics):
        super().__init__(message); self.metrics = metrics


class InsufficientCapacity(SpaceError):
    """The verified candidates alone would not leave enough build space."""


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


def validate_layout(live, releases, backups, older_release=OLDER):
    require(older_release in (OLDER, *DUPLICATE_RELEASES), 'Unknown older release')
    for directory in (live, releases, backups, releases / PROTECTED, releases / older_release):
        no_links(directory)
        require(directory.is_dir(), 'Required intact release directory is unavailable')
    protected, older = releases / PROTECTED, releases / older_release
    require(live.resolve() not in (protected.resolve(), older.resolve()) and protected.resolve() != older.resolve(),
            'Live and protected rollback identities must remain distinct')
    device = live.stat().st_dev
    require(releases.stat().st_dev == protected.stat().st_dev == older.stat().st_dev == device,
            'Release paths must remain on the same root filesystem')
    metadata = json.loads(read_regular(live / 'release-metadata.json'))
    current_build = build_id(live)
    require(isinstance(metadata, dict) and metadata.get('commit') == COMMIT and metadata.get('buildId') == current_build,
            'Current release commit or build identity differs')
    for release, directory in ((PROTECTED, protected), (older_release, older)):
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
    # Only the diagnosed older rollback's named Next output namespaces. An
    # arbitrary similarly named directory without a build marker is retained.
    for generated in sorted(older.iterdir()):
        if not generated.name.startswith(('.next-before-', '.next-failed-', '.next-english-')):
            continue
        no_links(generated)
        if not generated.is_dir():
            continue
        evidence = False
        for name in ('BUILD_ID', 'build-manifest.json', 'routes-manifest.json'):
            marker = generated / name
            if os.path.lexists(marker):
                no_links(marker)
                info = marker.lstat()
                require(stat.S_ISREG(info.st_mode) and info.st_dev == device and info.st_size > 0,
                        'Unexpected compiled-output marker')
                evidence = True
        if evidence:
            candidates.append(('older-extra-next-generated', generated))
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


def duplicate_allowed(relative):
    parts = relative.parts
    if not parts or parts[0] not in DUPLICATE_ROOTS:
        return False
    if parts[0] == 'scripts' and (len(parts) != 2 or not re.fullmatch(r'(?:test|check|audit|verify)-[a-z0-9-]+\.mjs', parts[1])):
        return False
    if any(part.startswith('.env') or part in ('.data', 'uploads', 'media') for part in parts):
        return False
    # Only a third obsolete listening copy may be pruned. The same nofollow,
    # single-link checks require two independent real retained media files.
    if 'listening' in parts and parts[:2] != ('public', 'listening'):
        return False
    if parts[:2] in (('content', 'english-six'), ('content', 'toefl-listening')):
        return False
    name = relative.name.lower()
    # This checked-in question catalogue is course content. Release and backup
    # manifests retain the existing exclusion, even if their contents match.
    course_catalogue = parts == ('content', 'grade6-bank', 'manifest.json')
    if ('manifest' in name and not course_catalogue) or 'receipt' in name or name in ('build_id', 'release-metadata.json'):
        return False
    if '.enc' in (suffix.lower() for suffix in relative.suffixes) or name.endswith('.enc'):
        if not name.endswith('.enc') or parts[:4] not in (
                ('content', 'grade6-bank', 'sealed', 'private'),
                ('content', 'chinese-six', 'sealed', 'pages')):
            return False
    return not set(suffix.lower() for suffix in relative.suffixes).intersection(
        ('.db', '.sqlite', '.sqlite3', '.sql', '.dump', '.backup', '.bak', '.zip', '.tar',
         '.gz', '.xz', '.bz2', '.zst', '.tgz', '.7z', '.rar', '.lzma', '.db-wal', '.db-shm'))


def open_directory(path):
    descriptor = os.open('/', DIRECTORY_FLAGS)
    try:
        for part in path.parts[1:]:
            child = os.open(part, DIRECTORY_FLAGS, dir_fd=descriptor)
            os.close(descriptor); descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor); raise


def inspect_duplicate(paths, device, expected=None, remove=False):
    """Hold three nofollow file/parent descriptors through the final unlink."""
    parents, descriptors, signatures, hashes, allocated = [], [], [], [], 0
    try:
        for path in paths:
            parent = open_directory(path.parent); parents.append(parent)
            descriptor = os.open(path.name, FILE_FLAGS, dir_fd=parent); descriptors.append(descriptor)
            info = os.fstat(descriptor)
            require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_dev == device,
                    'Duplicate copy must remain a regular single-link root-filesystem file')
            signatures.append(identity(info))
            if len(descriptors) == 1:
                allocated = info.st_blocks * 512
        require(len({row[:2] for row in signatures}) == 3, 'Duplicate copies must be independent files')
        require(len({row[6] for row in signatures}) == 1, 'Independent copies differ in size')
        if expected:
            require(signatures == expected['signatures'], 'Duplicate file identity changed; remaining copies retained')
        for descriptor in descriptors:
            with os.fdopen(os.dup(descriptor), 'rb') as incoming:
                checksum = hashlib.sha256()
                while chunk := incoming.read(1024 * 1024):
                    checksum.update(chunk)
                hashes.append(checksum.hexdigest())
        require(len(set(hashes)) == 1 and (not expected or hashes[0] == expected['sha256']),
                'Independent copies differ in bytes; remaining copies retained')
        for path, parent, descriptor, signature in zip(paths, parents, descriptors, signatures):
            require(identity(os.fstat(descriptor)) == signature and
                    identity(os.stat(path.name, dir_fd=parent, follow_symlinks=False)) == signature,
                    'Duplicate copy changed during verification; remaining copies retained')
        if remove:
            os.unlink(paths[0].name, dir_fd=parents[0])
        return {'paths': paths, 'signatures': signatures, 'sha256': hashes[0], 'allocated': allocated}
    finally:
        for descriptor in descriptors + parents:
            os.close(descriptor)


def duplicate_plan(live, releases, device, older_release=OLDER):
    older, protected = releases / older_release, releases / PROTECTED
    plans, skipped = [], 0
    for name in DUPLICATE_ROOTS:
        base = older / name
        if not base.is_dir() or base.is_symlink():
            continue
        for directory, directories, files in os.walk(base, followlinks=False):
            parent = Path(directory)
            directories[:] = [name for name in sorted(directories)
                              if duplicate_allowed((parent / name).relative_to(older)) and not (parent / name).is_symlink()]
            for name in sorted(files):
                path = parent / name; relative = path.relative_to(older)
                if not duplicate_allowed(relative):
                    skipped += 1; continue
                try:
                    candidate = inspect_duplicate((path, live / relative, protected / relative), device)
                    if candidate['allocated'] > 0:
                        plans.append(candidate)
                except (OSError, SpaceError):
                    skipped += 1
    return sorted(plans, key=lambda row: row['allocated'], reverse=True), skipped


def empty_source_directories(older, device):
    """Collect only already-empty branches below a reviewed inactive src tree."""
    source = older / 'src'
    if source.is_symlink() or not source.is_dir():
        return []
    plan = []

    def visit(path, descriptor):
        info = os.fstat(descriptor)
        if info.st_dev != device:
            return False
        empty = True
        with os.scandir(descriptor) as entries:
            for entry in entries:
                child = path / entry.name
                if not entry.is_dir(follow_symlinks=False) or not duplicate_allowed(child.relative_to(older)):
                    empty = False
                    continue
                nested = os.open(entry.name, DIRECTORY_FLAGS, dir_fd=descriptor)
                try:
                    if not visit(child, nested):
                        empty = False
                finally:
                    os.close(nested)
        if empty and path != source:
            plan.append((path, identity(info)[:5], info.st_blocks * 512))
        return empty

    descriptor = open_directory(source)
    try:
        visit(source, descriptor)
    finally:
        os.close(descriptor)
    return plan


def prune_duplicates(live, releases, backups, device, available, target, apply=True):
    validate_layout(live, releases, backups)
    roots = [releases / OLDER, live, releases / PROTECTED]
    plans, skipped = duplicate_plan(live, releases, device)
    capacity = sum(row['allocated'] for row in plans)
    for release in DUPLICATE_RELEASES:
        if capacity >= target - available():
            break
        earlier = releases / release
        if not os.path.lexists(earlier):
            continue
        validate_layout(live, releases, backups, release)
        extra, extra_skipped = duplicate_plan(live, releases, device, release)
        plans.extend(extra)
        capacity += sum(row['allocated'] for row in extra)
        skipped += extra_skipped
        roots.append(earlier)
    root_ids = {path: identity(path.stat())[:5] for path in roots}
    require(len({row[:2] for row in root_ids.values()}) == len(roots), 'Release directories must be distinct')
    directories = []
    if capacity < target - available():
        for older in roots:
            if older.parent == releases and older.name != PROTECTED:
                directories.extend(empty_source_directories(older, device))
    directory_bytes = sum(allocated for _, _, allocated in directories)
    metrics = {'duplicateCandidates': len(plans), 'duplicateCandidateMiB': capacity // 1024**2,
               'duplicateSkipped': skipped, 'emptySourceDirectories': len(directories),
               'emptySourceMiB': directory_bytes // 1024**2}
    if not apply:
        return metrics
    if capacity + directory_bytes < max(0, target - available()):
        raise InsufficientCapacity('Verified duplicate capacity is insufficient; no duplicate files were removed', **metrics)
    removed = 0
    for plan in plans:
        if available() >= target:
            break
        for path in roots:
            no_links(path)
            require(identity(path.stat())[:5] == root_ids[path], 'Retained release root changed; remaining copies retained')
        inspect_duplicate(plan['paths'], device, expected=plan, remove=True)
        removed += 1
    removed_dirs = 0
    for directory, signature, _ in directories:
        if available() >= target:
            break
        parent = open_directory(directory.parent)
        try:
            info = os.stat(directory.name, dir_fd=parent, follow_symlinks=False)
            require(identity(info)[:5] == signature, 'Empty source directory changed during verification')
            # rmdir itself rejects new files, directory links and mounted trees.
            os.rmdir(directory.name, dir_fd=parent)
        finally:
            os.close(parent)
        removed_dirs += 1
    require(available() >= target, 'Concurrent disk use exhausted verified duplicate savings',
            duplicateFilesRemoved=removed, emptyDirectoriesRemoved=removed_dirs, **metrics)
    return {'duplicateFilesRemoved': removed, 'emptyDirectoriesRemoved': removed_dirs, **metrics}


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
        estimated = sum(row[6] for _label, _path, rows in plan for row in rows.values() if stat.S_ISREG(row[2]))
        if initial + estimated < target:
            metrics.update(prune_duplicates(live, releases, backups, device, available, target, apply=False))
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
    duplicates = {}
    if available() < target:
        try:
            duplicates = prune_duplicates(live, releases, backups, device, available, target)
        except SpaceError as error:
            error.metrics = {**metrics, 'removedTargets': removed, **error.metrics, 'rootFreeMiB': available() // 1024**2}
            raise
    final = available()
    require(final >= target, 'Reviewed generated content was insufficient; deployment remains blocked',
            removedTargets=removed, **{**metrics, 'rootFreeMiB': final // 1024**2})
    return {'changed': bool(removed or duplicates.get('duplicateFilesRemoved') or duplicates.get('emptyDirectoriesRemoved')),
            'removedTargets': removed, 'rootFreeMiB': final // 1024**2,
            'requiredRootMiB': metrics['requiredRootMiB'], 'generatedCandidates': metrics['generatedCandidates'], **duplicates}


def target_for_upload(upload_bytes, largest_file_bytes=None):
    if upload_bytes is None:
        require(largest_file_bytes is None, 'A largest file size requires a checkout size')
        return TARGET_FREE
    require(upload_bytes > 0, 'A positive checkout size is required')
    if largest_file_bytes is None:
        return BUILD_HEADROOM + upload_bytes + UNMEASURED_UPLOAD_MARGIN
    require(0 < largest_file_bytes <= upload_bytes, 'Invalid largest checkout file size')
    # rsync writes one temporary replacement at a time beside the seeded files.
    return BUILD_HEADROOM + upload_bytes + largest_file_bytes + TRANSFER_HEADROOM


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--apply', action='store_true')
    parser.add_argument('--upload-bytes', type=int, help='Allocated bytes in the clean runner checkout')
    parser.add_argument('--largest-file-bytes', type=int, help='Size of the largest regular file in that checkout')
    args = parser.parse_args()
    target = target_for_upload(args.upload_bytes, args.largest_file_bytes)
    require(os.geteuid() == 0, 'Root is required for fixed release-space preparation')
    no_links(LOCK)
    descriptor = os.open(LOCK, os.O_RDWR | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'r+') as lock:
        info = os.fstat(lock.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o600,
                'Invalid private release lock')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = recover_space(LIVE, RELEASES, BACKUPS, lambda: shutil.disk_usage(RELEASES).free,
                               apply=args.apply, target=target)
        print(json.dumps({'fastReleaseSpace': result}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except (SpaceError, OSError, ValueError) as error:
        print(json.dumps({'fastReleaseSpaceBlocked': True, 'reason': str(error) if isinstance(error, SpaceError) else type(error).__name__,
                          **getattr(error, 'metrics', {})}), flush=True)
        raise SystemExit(75 if isinstance(error, InsufficientCapacity) else 1) from None
