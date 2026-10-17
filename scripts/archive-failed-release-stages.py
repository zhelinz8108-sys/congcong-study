"""Preserve this task's three unused release stages on the existing data disk."""
import argparse
import fcntl
import hashlib
import json
import os
import pwd
from pathlib import Path
import shutil
import stat
import subprocess

FAILED_RELEASES = (
    '0b904ef68fb8ba4eb3a4bc0d8e1c09525e0dc1c3-39028619168-1',
    '5ea125771d897dc04da0cb87b67f2240364f2068-39028897397-1',
    '20cf84affaf384a0e46830642dbe5459021389dc-39029146667-1',
)
RELEASES = Path('/www/study-plan-releases')
DATA = Path('/www/study-plan-data')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def no_links(path):
    require(all(not p.is_symlink() for p in (path, *path.parents)), 'Symlinked archive parent rejected')


def tree(path):
    no_links(path)
    result = {}
    for entry in [path, *sorted(path.rglob('*'))]:
        info = entry.lstat()
        require(stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode), 'Special files cannot be archived')
        relative = entry.relative_to(path).as_posix()
        digest = link = None
        if stat.S_ISLNK(info.st_mode):
            link = os.readlink(entry)
            if not os.path.isabs(link):
                target = os.path.normpath(entry.parent / link)
                require(os.path.commonpath([str(path), target]) == str(path), 'External relative link needs manual review')
        if stat.S_ISREG(info.st_mode):
            with entry.open('rb') as stream:
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        result[relative] = [stat.S_IMODE(info.st_mode), info.st_uid, info.st_gid, info.st_size if digest else 0, digest, link]
    return result


def digest(manifest):
    return hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def ensure_inactive(source, identity, app=Path('/www/study-plan')):
    require(not app.resolve().is_relative_to(source.resolve()), 'The active application cannot be archived')
    process = subprocess.run(['systemctl', 'list-units', '--no-legend', '--plain', '--state=active,activating,deactivating',
                              'study-plan-release-' + identity + '-*', 'study-plan-preflight-' + identity + '*'], capture_output=True, text=True, check=True)
    require(not process.stdout.strip(), 'A worker still uses this stage; leave it untouched')


def code_bytes(manifest):
    excluded = ('content/english-six', 'content/toefl-listening', 'public/uploads', 'public/listening', 'content/chinese-six/pages', 'content/grade6-bank/private')
    return sum(metadata[3] for name, metadata in manifest.items()
               if not any(part.startswith(('.env', '.next')) or part in ('.data', 'node_modules') for part in name.split('/'))
               and not name.endswith('.private.json') and not any(name == prefix or name.startswith(prefix + '/') for prefix in excluded))


def relocate(releases, archives, identity):
    require(identity in FAILED_RELEASES, 'Only the three failed releases created by this task are allowed')
    no_links(releases); no_links(archives)
    source = releases / identity
    destination = archives / identity
    pending = releases / ('.archiving-' + identity)
    receipt = archives / (identity + '.json')
    if source.exists() and not source.is_symlink():
        require((source / 'package.json').is_file() and (source / 'scripts/release-production.sh').is_file(), 'Not an unused application stage')
    return move_verified(source, destination, pending, receipt, identity)


def move_verified(source, destination, pending, receipt, identity, mutable=False):
    if source.is_symlink():
        require(source.readlink() == destination and destination.is_dir(), 'Unexpected stage symlink')
        if mutable:
            return 'already-on-data-disk'
        require(json.loads(receipt.read_text())['sha256'] == digest(tree(destination)), 'Existing archive verification failed')
        if pending.exists():
            require(tree(pending) == tree(destination), 'Interrupted archive differs; retain both copies')
            shutil.rmtree(pending)
        return 'already-archived'
    if not source.exists() and not pending.exists():
        return 'absent'
    require(not pending.exists(), 'Interrupted source rename needs recovery; leave both copies intact')
    before = tree(source)
    require(not destination.exists() and not receipt.exists(), 'Archive destination already exists; do not overwrite it')
    temporary = destination.parent / (identity + '.partial')
    require(not os.path.lexists(temporary), 'Partial archive already exists; do not overwrite it')
    try:
        shutil.copytree(source, temporary, symlinks=True)
        for name, metadata in before.items():
            target = temporary / name
            if (target.lstat().st_uid, target.lstat().st_gid) != tuple(metadata[1:3]):
                os.chown(target, metadata[1], metadata[2], follow_symlinks=False)
            if metadata[4] is not None:
                with target.open('rb') as stream:
                    os.fsync(stream.fileno())
        for target in sorted((p for p in temporary.rglob('*') if not p.is_symlink() and p.is_dir()), key=lambda p: len(p.parts), reverse=True):
            sync_directory(target)
        sync_directory(temporary)
        require(tree(temporary) == before and tree(source) == before, 'Copied stage verification failed; retain the original')
        temporary.rename(destination)
        sync_directory(destination.parent)
        with receipt.open('x') as out:
            json.dump({'release': identity, 'sha256': digest(before), 'files': len(before)}, out)
            out.flush(); os.fsync(out.fileno())
        os.chmod(receipt, 0o600)
        sync_directory(receipt.parent)
        source.rename(pending)
        sync_directory(source.parent)
        try:
            source.symlink_to(destination, target_is_directory=True)
            sync_directory(source.parent)
        except BaseException:
            pending.rename(source)
            raise
        require(tree(pending) == tree(destination), 'Archive changed before source space release; retain both copies')
        shutil.rmtree(pending)
        return 'archived-and-verified'
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def relocate_npm_cache(data):
    # Only npm's reproducible package-download cache is eligible. npmrc,
    # credentials, logs, installed dependencies and the active app are untouched.
    source = Path('/home/ubuntu/.npm/_cacache')
    if not source.exists() or source.is_symlink():
        return 'absent-or-already-external'
    no_links(source)
    user = pwd.getpwnam('ubuntu')
    require(source.stat().st_uid == user.pw_uid, 'Unexpected npm download-cache owner')
    contents = tree(source)
    require(shutil.disk_usage(data).free >= 10 * 1024**3 + sum(item[3] for item in contents.values()), 'Retain 10 GiB on data disk after npm cache relocation')
    base = data / 'npm-cache'
    no_links(base)
    if not base.exists():
        base.mkdir(mode=0o755); base.chmod(0o755)
    require(base.stat().st_uid == 0 and stat.S_IMODE(base.stat().st_mode) == 0o755, 'Invalid npm cache base')
    profile = base / 'ubuntu'
    no_links(profile)
    if not profile.exists():
        profile.mkdir(mode=0o700); os.chown(profile, user.pw_uid, user.pw_gid)
    require(profile.stat().st_uid == user.pw_uid and stat.S_IMODE(profile.stat().st_mode) == 0o700, 'Invalid npm cache profile')
    return move_verified(source, profile / '_cacache', source.parent / '.archiving-cacache',
                         profile / 'relocation.json', 'ubuntu-npm-cacache', mutable=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', required=True)
    parser.parse_args()
    require(os.geteuid() == 0, 'Archive relocation must run as root')
    no_links(RELEASES); no_links(DATA)
    require(RELEASES.is_dir() and DATA.is_dir(), 'Existing release and data directories are required')
    require(RELEASES.stat().st_dev != DATA.stat().st_dev, 'The existing data disk must be mounted separately')
    lockdir = Path('/run/study-plan-release')
    no_links(lockdir)
    lockdir.mkdir(mode=0o700, exist_ok=True)
    require(lockdir.stat().st_uid == 0 and stat.S_IMODE(lockdir.stat().st_mode) == 0o700, 'Invalid release lock directory')
    with os.fdopen(os.open(lockdir / 'lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600), 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        needed = 0
        largest = 0
        for identity in FAILED_RELEASES:
            candidate = RELEASES / identity
            if candidate.is_symlink():
                target = DATA / 'failed-release-archives' / identity
                require(candidate.readlink() == target, 'Unexpected existing stage symlink')
                largest = max(largest, code_bytes(tree(target)))
            elif candidate.exists():
                ensure_inactive(candidate, identity)
                contents = tree(candidate)
                needed += sum(item[3] for item in contents.values()); largest = max(largest, code_bytes(contents))
        print('::notice title=Release storage before archiving::' + json.dumps({'rootFreeMiB': shutil.disk_usage(RELEASES).free // 1024**2, 'dataFreeMiB': shutil.disk_usage(DATA).free // 1024**2, 'archiveMiB': needed // 1024**2}))
        require(shutil.disk_usage(DATA).free >= 10 * 1024**3 + needed, 'Retain 10 GiB of data-disk headroom after archiving')
        archives = DATA / 'failed-release-archives'
        no_links(archives)
        archives.mkdir(mode=0o700, exist_ok=True)
        require(archives.stat().st_uid == 0 and stat.S_IMODE(archives.stat().st_mode) == 0o700, 'Invalid private archive directory')
        outcomes = [relocate(RELEASES, archives, identity) for identity in FAILED_RELEASES]
        free = shutil.disk_usage(RELEASES).free
        cache = 'not-needed'
        if free < 4 * 1024**3 + largest + 64 * 1024**2:
            cache = relocate_npm_cache(DATA)
            free = shutil.disk_usage(RELEASES).free
        print('::notice title=Release storage::' + json.dumps({'rootFreeMiB': free // 1024**2, 'dataFreeMiB': shutil.disk_usage(DATA).free // 1024**2, 'stages': outcomes, 'npmDownloadCache': cache}))
        require(free >= 4 * 1024**3 + largest + 64 * 1024**2, 'Root disk still lacks room for a new upload and 4 GiB build headroom; existing application and archives are retained')


if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        print('::error title=Release storage::' + str(error))
        raise
