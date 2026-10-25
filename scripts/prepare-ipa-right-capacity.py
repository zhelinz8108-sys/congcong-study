"""Retain two exact oldest snapshots before placing IPA after Chinese meanings."""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys


def load(filename, name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


if 'CORE' not in globals():
    CORE = load('prepare-english-six-capacity.py', 'reviewed_retention_core')
BASE, CACHE, RESTORE = CORE.BASE, CORE.CACHE, CORE.RESTORE
EXPECTED_ACTIVE = ('f475be68d01c429544df5293187e4c8c47be28c6', 'gbWgJuLGn6MSak8fbtx1_')
PROTECTED = {EXPECTED_ACTIVE,
 ('bd75c1df88402a39f7ff88a4e56507a541d5fc84', '7mglR1NTW6_-WYfrmWYVZ'),
 ('bd600f0d040dd8c4228b2e603d59967ae79f594b', 'vCaNCuZePJOvSAivnnFkG')}
ROSTER = (
 ('6b7d383b45b8d2bb72df4dca9b6325e8ec55acc3', 'TeGnpP_edFHWhUmsmVykN', 2219925504),
 ('ddddbe938feffb520bf3673edae51ba75872791e', '2-GGz-N9kRguKiip52Bnw', 2219786240),
)
ARCHIVE_CAP = 1380000000
SIDECAR_CAP = 32 * 1024 ** 2
TEMPORARY_FLOOR = 1536 * 1024 ** 2


def require(value):
    CORE.require(value)


def budget(initial, remaining, required, already_written=None):
    """Hard caps, not estimated compression ratios, determine every phase."""
    free = initial
    phases = []
    for commit, build, minimum_source in remaining:
        cost = 0 if (commit, build) == already_written else ARCHIVE_CAP + SIDECAR_CAP
        free -= cost
        require(free >= TEMPORARY_FLOOR)
        copy_free = free
        free += minimum_source
        phases.append((copy_free, free))
    require(free >= required)
    return phases


def private_dir(parent, name, create=False):
    if create:
        try: os.mkdir(name, 0o700, dir_fd=parent)
        except FileExistsError: pass
    fd = BASE.child_dir(parent, name)
    info = os.fstat(fd)
    try:
        require(info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o700
                and info.st_dev == os.fstat(parent).st_dev)
        CACHE.no_submounts(fd)
        os.fsync(parent)
        return fd
    except BaseException:
        os.close(fd); raise


def leaf_name(item):
    return item[0] + '-' + item[1]


def completed_stage(parent, releases, item):
    """Only a fully verified durable stage is skipped on safe reentry."""
    leaf = leaf_name(item)
    directory = private_dir(parent, leaf)
    try:
        folder = CORE.ROOT_ARCHIVES + '/' + leaf
        receipt = json.loads(BASE.small(directory, 'receipt.json'))
        require(receipt['status'] == 'verified-compressed-retention-complete'
                and receipt['sourceMetadata'] == {'commit': item[0], 'buildId': item[1]})
        require(type(receipt['archiveBytes']) is int and 0 < receipt['archiveBytes'] <= ARCHIVE_CAP)
        manifest = RESTORE.load_manifest(folder + '/manifest.json')
        raw = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
        require(hashlib.sha256(raw).hexdigest() == receipt['manifestSha256'])
        require(RESTORE.verify_archive(folder + '/archive.tar.gz', manifest)['archiveSha256'] == receipt['archiveSha256'])
        name = receipt['sourceBasename']
        require(isinstance(name, str) and name not in ('', '.', '..') and '/' not in name)
        require(stat.S_ISLNK(os.stat(name, dir_fd=releases, follow_symlinks=False).st_mode)
                and os.readlink(name, dir_fd=releases) == folder and 'original.pending' not in os.listdir(directory))
        return receipt['archiveBytes']
    finally:
        os.close(directory)


def prepare():
    require(os.geteuid() == 0 and not ({item[0:2] for item in ROSTER} & PROTECTED))
    CORE.EXPECTED_ACTIVE = EXPECTED_ACTIVE
    handles = []
    try:
        app = BASE.open_dir(BASE.APP); handles.append(app)
        releases = BASE.open_dir(BASE.RELEASES); handles.append(releases)
        data = BASE.open_dir(BASE.DATA); handles.append(data)
        lockdir = BASE.open_dir('/run/study-plan-release'); handles.append(lockdir)
        require(os.fstat(lockdir).st_uid == 0 and stat.S_IMODE(os.fstat(lockdir).st_mode) == 0o700)
        CACHE.no_submounts(lockdir)
        lock = os.open('lock', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=lockdir); handles.append(lock)
        info = os.fstat(lock)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        require(os.fstat(app).st_dev == os.fstat(releases).st_dev != os.fstat(data).st_dev)
        require(CORE.pair(BASE.metadata(app)) == EXPECTED_ACTIVE)
        CORE.healthy()
        required = CORE.deployment_required_root()
        require(CORE.shutil.disk_usage(BASE.DATA).free >= CORE.MIN_DATA_FREE)
        selected, names, protected, owned = {}, {}, {EXPECTED_ACTIVE: (app, CORE.core(os.fstat(app)))}, {}
        for name in sorted(os.listdir(releases)):
            if not __import__('re').fullmatch(r'[A-Za-z0-9._-]{1,180}', name): continue
            entry = os.stat(name, dir_fd=releases, follow_symlinks=False)
            if not stat.S_ISDIR(entry.st_mode): continue
            fd = BASE.child_dir(releases, name)
            meta = BASE.metadata(fd)
            pair = CORE.pair(meta) if meta else None
            if pair not in PROTECTED and pair not in {item[0:2] for item in ROSTER}:
                os.close(fd); continue
            require(os.fstat(fd).st_dev == os.fstat(releases).st_dev and pair not in protected and pair not in selected)
            handles.append(fd); owned[fd] = CORE.core(os.fstat(fd))
            if pair in PROTECTED:
                protected[pair] = fd, owned[fd]
            else:
                CACHE.no_submounts(fd); selected[pair] = fd; names[pair] = name
        require(set(protected) == PROTECTED)
        www = BASE.open_dir('/www'); handles.append(www)
        archive_root = private_dir(www, 'study-plan-retained-compressed'); handles.append(archive_root)
        archive_bytes, done = 0, set()
        for item in ROSTER:
            if item[0:2] not in selected:
                archive_bytes += completed_stage(archive_root, releases, item); done.add(item[0:2])
            else:
                # Partial stages are preserved and require evidence-based review;
                # never overwrite or remove an existing archive on a retry.
                try:
                    os.stat(leaf_name(item), dir_fd=archive_root, follow_symlinks=False)
                    raise ValueError('An incomplete private stage requires review')
                except FileNotFoundError:
                    pass
        remaining = [item for item in ROSTER if item[0:2] not in done]
        budget(CORE.shutil.disk_usage(BASE.RELEASES).free, remaining, required)
        captures = {}
        for item in remaining:
            fd = selected[item[0:2]]
            manifest, snapshot, allocated = RESTORE.source_manifest_fd(fd)
            raw = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
            require(allocated >= item[2] and len(raw) < SIDECAR_CAP - 1024 ** 2)
            captures[item[0:2]] = manifest, snapshot, raw
        def guard(current=None):
            targets = [os.readlink('/proc/self/fd/' + str(fd)) for fd in selected.values()]
            CORE.assert_runtime_idle(targets, owned)
            for identity, (fd, expected) in protected.items():
                require(CORE.core(os.fstat(fd)) == expected and CORE.pair(BASE.metadata(fd)) == identity)
            require(CORE.shutil.disk_usage(BASE.DATA).free >= CORE.MIN_DATA_FREE)
            pending = [item for item in ROSTER if item[0:2] not in done]
            budget(CORE.shutil.disk_usage(BASE.RELEASES).free, pending, required, already_written=current)
        guard()
        for item in remaining:
            identity = item[0:2]; source = selected[identity]
            manifest, source_snapshot, raw = captures.pop(identity)
            guard(); CACHE.no_submounts(source)
            os.mkdir(leaf_name(item), 0o700, dir_fd=archive_root); os.fsync(archive_root)
            destination = private_dir(archive_root, leaf_name(item)); handles.append(destination)
            folder = CORE.ROOT_ARCHIVES + '/' + leaf_name(item)
            CORE.private_write(destination, 'manifest.json', raw)
            restore_source = globals().get('RESTORE_SOURCE')
            if restore_source is None: restore_source = Path(__file__).with_name('restore-retained-compressed-release.py').read_bytes()
            CORE.private_write(destination, 'restore.py', restore_source, 0o700)
            instructions = ('Private complete compressed rollback material. Not a runnable release directory.\n'
                'Verify: python3 ' + folder + '/restore.py --verify ' + folder + '/archive.tar.gz --manifest ' + folder + '/manifest.json\n'
                'Restore only to a NEW directory below a root-owned0700 parent, with sufficient extra space:\n'
                'python3 ' + folder + '/restore.py --restore ' + folder + '/archive.tar.gz --manifest ' + folder + '/manifest.json --destination NEW_PRIVATE_DIRECTORY\n'
                'No service activation or database restoration is performed.\n')
            CORE.private_write(destination, 'RESTORE_REQUIRED.txt', instructions.encode())
            receipt = {'version': 1, 'status': 'archive-incomplete-original-intact',
                'sourceMetadata': {'commit': item[0], 'buildId': item[1]}, 'sourceBasename': names[identity],
                'sourceIdentity': list(CORE.core(os.fstat(source))), 'manifestSha256': hashlib.sha256(raw).hexdigest()}
            CORE.replace_receipt(destination, receipt)
            archive = os.open('archive.tar.gz.partial', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=destination)
            try: size = CORE.write_gzip(source, archive, ARCHIVE_CAP, TEMPORARY_FLOOR)
            finally: os.close(archive)
            verification = RESTORE.verify_archive(folder + '/archive.tar.gz.partial', manifest)
            RESTORE.verify_source_tree(os.readlink('/proc/self/fd/' + str(source)), manifest, (os.fstat(source).st_dev, os.fstat(source).st_ino))
            require(CORE.snapshot(source, True)[1] == source_snapshot)
            os.rename('archive.tar.gz.partial', 'archive.tar.gz', src_dir_fd=destination, dst_dir_fd=destination); os.fsync(destination)
            receipt.update(status='verified-retained', archiveBytes=size, archiveSha256=verification['archiveSha256'])
            CORE.replace_receipt(destination, receipt)
            os.fsync(destination); os.fsync(archive_root); os.fsync(www)
            CORE.release_verified_source(source, releases, names[identity], folder, destination,
                                         manifest, source_snapshot, receipt, lambda: guard(identity))
            receipt['status'] = 'verified-compressed-retention-complete'; CORE.replace_receipt(destination, receipt)
            done.add(identity); archive_bytes += size
            owned.pop(source); selected.pop(identity); handles.remove(source); os.close(source)
            CORE.healthy(); guard()
            print('IPA_RIGHT_RETENTION_PROGRESS ' + json.dumps(BASE.safe_log({'completedSnapshots': len(done),
                'rootFreeBytes': CORE.shutil.disk_usage(BASE.RELEASES).free, 'dataFreeBytes': CORE.shutil.disk_usage(BASE.DATA).free}), separators=(',', ':')), flush=True)
        require(len(done) == 2 and CORE.shutil.disk_usage(BASE.RELEASES).free >= required and CORE.shutil.disk_usage(BASE.DATA).free >= CORE.MIN_DATA_FREE)
        CORE.healthy(); guard()
        CORE.report_verified(required, archive_bytes, 'verified-ipa-right-capacity')
    finally:
        for fd in reversed(handles): os.close(fd)


if __name__ == '__main__':
    try:
        require(sys.argv[1:] == ['--apply']); prepare()
    except Exception:
        print('IPA right layout snapshot preparation stopped safely; retained copies require review.', flush=True)
        sys.exit(1)
