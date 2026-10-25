"""Exact inactive webpack eviction and one complete private compressed retention.

Production execution is intentionally disabled until the reviewed branch-only
workflow is separately approved. No application activation occurs in this file.
"""
import base64
import ctypes
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import urllib.request


def module(filename, name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


if 'BASE' not in globals():
    BASE = module('probe-english-six-deployment.py', 'english_capacity_base')
if 'CACHE' not in globals():
    CACHE = module('probe-retained-compile-cache.py', 'english_capacity_cache')
if 'RESTORE' not in globals():
    RESTORE = module('restore-retained-compressed-release.py', 'english_retained_restore')

ROOT_ARCHIVES = '/www/study-plan-retained-compressed'
SOURCE_META = ('7540ccd7cee2d07796cce61318e79d1d1be9e923', 'EPpoBco83u1HYQZh8zD5H')
SOURCE_ALLOCATED_MIN = 1800384512
MEASURED_GZIP = 963124911
MAX_ARCHIVE_BYTES = MEASURED_GZIP + 16 * 1024 ** 2
SIDECAR_BUDGET = 32 * 1024 ** 2
MIN_DATA_FREE = 10 * 1024 ** 3
MIN_STAGING_ROOT = 3 * 1024 ** 3
EXPECTED_ACTIVE = ('e00733cfa66583481e42f2acac0b4756c29e4383', 'Sas9SLDIjyshuasmBy6Tn')
PROTECTED = {
 EXPECTED_ACTIVE,
 ('f262dc6438e48d3992f1abe2d0e291ff3108b222', '1Wdbidu-xRXG3qD_eISz9'),
 ('4d65d765912e1f9baf4553c7df5bebe9b16274eb', 'Yj7rcLNGEw2ejYX1YscEO'),
 ('bdc35f288531062f5abb029cd263bbd9b51d65b0', 'DKRqust1YId2JJhNlB18x'),
}
WEBPACK = (
 ('583e90daf9220c1f7b2859ccd3cec808659cb240', 'CTUFbHkregPaq0jqd04A4', '8dddf5eec6f471bb0a31541ff370e145620ada243e08e5f49d91d36a69e4b461'),
 ('060b04a07bc3c1e9ef4dd2d51665d4b9623b039c', 'CNnG1Ctp93Itu8A4BKSRv', '33fcf33652765dc44f3a29e4c17c8a757f181f8ce565edd9f6fa6eacd303a15d'),
 ('d8e3459dcb31ce3fcdd56a7e934831d7d982fb20', 'mBJAoJPFvyKiNbDwdSMQZ', '61021a2f7b74caf245ebc0a91f852e5cc0a2764e3448213e937cb5e5c9fb87fe'),
)


def require(value):
    if not value:
        raise ValueError('Capacity preparation blocked')


def pair(meta):
    require(meta and meta['buildMatchesMetadata'])
    return meta['commit'], meta['buildId']


def core(info):
    return info.st_dev, info.st_ino, stat.S_IFMT(info.st_mode), info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)


def snapshot(fd, links=False):
    values = {}
    device = os.fstat(fd).st_dev
    allocated, seen = 0, set()
    def walk(directory, relative='.'):
        nonlocal allocated
        info = os.fstat(directory)
        require(info.st_dev == device)
        values[relative] = RESTORE._identity(info)
        if (info.st_dev, info.st_ino) not in seen:
            allocated += info.st_blocks * 512; seen.add((info.st_dev, info.st_ino))
        for name in sorted(os.listdir(directory)):
            before = os.stat(name, dir_fd=directory, follow_symlinks=False)
            require(before.st_dev == device)
            key = name if relative == '.' else relative + '/' + name
            require(stat.S_ISDIR(before.st_mode) or stat.S_ISREG(before.st_mode) or (links and stat.S_ISLNK(before.st_mode)))
            if stat.S_ISDIR(before.st_mode):
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME, dir_fd=directory)
                try:
                    require(RESTORE._identity(os.fstat(child)) == RESTORE._identity(before))
                    walk(child, key)
                finally:
                    os.close(child)
            else:
                require(links or before.st_nlink == 1)
                values[key] = RESTORE._identity(before)
                if (before.st_dev, before.st_ino) not in seen:
                    allocated += before.st_blocks * 512; seen.add((before.st_dev, before.st_ino))
    root = os.open('.', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME, dir_fd=fd)
    try:
        walk(root)
    finally:
        os.close(root)
    return allocated, values


def assert_runtime_idle(targets, owned):
    """Only exact validated O_RDONLY directory pins are exempt, never a PID."""
    for fd, expected in owned.items():
        info = os.fstat(fd)
        flags = fcntl.fcntl(fd, fcntl.F_GETFL)
        require(stat.S_ISDIR(info.st_mode) and core(info) == expected and not flags & os.O_PATH
                and flags & os.O_ACCMODE == os.O_RDONLY)
    before = set(path.name for path in Path('/proc').glob('[0-9]*') if path.name.isdigit())
    for pid in before:
        process = Path('/proc') / pid
        try:
            raw = (process / 'stat').read_text(); start = raw[raw.rfind(')') + 2:].split()[19]
            paths = []
            for name in ('cwd', 'exe'):
                try:
                    paths.append(os.readlink(process / name).removesuffix(' (deleted)'))
                except FileNotFoundError:
                    pass
            for entry in (process / 'fd').iterdir():
                if int(pid) == os.getpid() and int(entry.name) in owned:
                    fd = int(entry.name)
                    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
                    require(core(os.fstat(fd)) == owned[fd] and not flags & os.O_PATH and flags & os.O_ACCMODE == os.O_RDONLY)
                    continue
                try:
                    paths.append(os.readlink(entry).removesuffix(' (deleted)'))
                except FileNotFoundError:
                    pass
            require(not any(path == target or path.startswith(target + '/') for path in paths for target in targets))
            after = (process / 'stat').read_text()
            require(after[after.rfind(')') + 2:].split()[19] == start)
        except (OSError, IndexError):
            raise ValueError('Runtime-use proof changed')
    require(before == set(path.name for path in Path('/proc').glob('[0-9]*') if path.name.isdigit()))
    workers = subprocess.run(['systemctl', 'list-units', '--no-legend', '--plain', '--state=active,activating,deactivating',
                              'study-plan-release-*', 'study-plan-preflight-*', 'study-plan-math-restore-*'],
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True)
    require(not workers.stdout.strip())


def private_write(parent, name, data, mode=0o600):
    require('/' not in name and name not in ('', '.', '..'))
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode, dir_fd=parent)
    try:
        offset = 0
        while offset < len(data):
            offset += os.write(fd, data[offset:])
        os.fchmod(fd, mode); os.fsync(fd)
    finally:
        os.close(fd)
    os.fsync(parent)


def replace_receipt(parent, value):
    private_write(parent, 'receipt.pending.json', json.dumps(value, sort_keys=True).encode())
    os.replace('receipt.pending.json', 'receipt.json', src_dir_fd=parent, dst_dir_fd=parent)
    os.fsync(parent)


def require_bound(parent, name, fd):
    require(core(os.stat(name, dir_fd=parent, follow_symlinks=False)) == core(os.fstat(fd)))


def rename_no_replace(source_parent, source_name, destination_parent, destination_name):
    require('/' not in source_name and '/' not in destination_name and source_name not in ('', '.', '..') and destination_name not in ('', '.', '..'))
    libc = ctypes.CDLL(None, use_errno=True)
    operation = libc.renameat2
    operation.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    operation.restype = ctypes.c_int
    if operation(source_parent, os.fsencode(source_name), destination_parent, os.fsencode(destination_name), 1) != 0:
        raise OSError(ctypes.get_errno(), 'No-replace rename blocked')


def clear_cache_quarantined(fd, cache_source, next_fd, parent, quarantine, label, expected, owned, proof):
    CACHE.no_submounts(cache_source); CACHE.no_submounts(fd)
    require_bound(cache_source, '.next', next_fd)
    require_bound(next_fd, 'cache', parent)
    require_bound(parent, 'webpack', fd)
    require(snapshot(fd)[1] == expected)
    original_identity = core(os.fstat(fd))
    rename_no_replace(parent, 'webpack', quarantine, label)
    os.fsync(parent); os.fsync(quarantine)
    try:
        proof()
        CACHE.no_submounts(fd)
        require(core(os.fstat(fd)) == original_identity)
        remove_contents(fd, expected)
    finally:
        # Never overwrite a newly created path, even if an external build races.
        rename_no_replace(quarantine, label, parent, 'webpack')
        os.fsync(quarantine); os.fsync(parent)
    require_bound(parent, 'webpack', fd)
    require(core(os.fstat(fd)) == original_identity)


def release_verified_source(source, releases, original, folder, destination, manifest, source_snapshot, receipt, final_guard):
    """Archive and durable receipt must exist before any original entry moves."""
    require('/' not in original and original not in ('', '.', '..'))
    require(receipt['status'] == 'verified-retained')
    stored = json.loads(BASE.small(destination, 'receipt.json'))
    require(stored == receipt and receipt['manifestSha256'] == hashlib.sha256(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    require(RESTORE.verify_archive(folder + '/archive.tar.gz', manifest)['archiveSha256'] == receipt['archiveSha256'])
    source_path = os.readlink('/proc/self/fd/' + str(source))
    RESTORE.verify_tree(source_path, manifest, (os.fstat(source).st_dev, os.fstat(source).st_ino))
    require(snapshot(source, True)[1] == source_snapshot)
    final_guard()
    CACHE.no_submounts(source)
    pending = 'original.pending'
    try:
        os.stat(pending, dir_fd=destination, follow_symlinks=False)
        raise ValueError('Interrupted source release exists')
    except FileNotFoundError:
        pass
    require_bound(releases, original, source)
    rename_no_replace(releases, original, destination, pending); os.fsync(releases); os.fsync(destination)
    try:
        os.symlink(folder, original, dir_fd=releases); os.fsync(releases)
    except BaseException:
        rename_no_replace(destination, pending, releases, original); os.fsync(destination); os.fsync(releases)
        raise
    receipt['status'] = 'verified-retention-source-release-started'; replace_receipt(destination, receipt)
    CACHE.no_submounts(source)
    final_guard()  # Re-resolve pinned source fd to its renamed pending path.
    source_snapshot['.'] = RESTORE._identity(os.fstat(source))
    remove_contents(source, source_snapshot, manifest)
    require_bound(destination, pending, source)
    os.rmdir(pending, dir_fd=destination); os.fsync(destination)


def remove_contents(fd, expected, manifest=None):
    """No-follow pinned walk; original bytes have already been retained/verified."""
    unlinked = {}
    root_core = core(os.fstat(fd))
    def walk(directory, relative='.'):
        for name in sorted(os.listdir(directory)):
            key = name if relative == '.' else relative + '/' + name
            info = os.stat(name, dir_fd=directory, follow_symlinks=False)
            require(key in expected and (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid, info.st_size, info.st_mtime_ns) == expected[key][0:7])
            if stat.S_ISDIR(info.st_mode):
                require(info.st_ctime_ns == expected[key][7] and info.st_nlink == expected[key][8])
                child = BASE.child_dir(directory, name)
                try:
                    require(RESTORE._identity(os.fstat(child)) == RESTORE._identity(info))
                    walk(child, key)
                    require(core(os.stat(name, dir_fd=directory, follow_symlinks=False)) == core(os.fstat(child)))
                    os.rmdir(name, dir_fd=directory)
                finally:
                    os.close(child)
            else:
                require(stat.S_ISREG(info.st_mode) or (manifest is not None and stat.S_ISLNK(info.st_mode)))
                inode = info.st_dev, info.st_ino
                prior = unlinked.get(inode, 0)
                require(info.st_nlink == expected[key][8] - prior)
                if prior == 0:
                    require(info.st_ctime_ns == expected[key][7])
                if stat.S_ISREG(info.st_mode):
                    target = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME, dir_fd=directory)
                    try:
                        require(RESTORE._identity(os.fstat(target)) == RESTORE._identity(info))
                        if manifest is not None:
                            h = hashlib.sha256()
                            while True:
                                part = os.read(target, 1024 * 1024)
                                if not part: break
                                h.update(part)
                            require(h.hexdigest() == manifest['entries'][key]['sha256'])
                        require(RESTORE._identity(os.fstat(target)) == RESTORE._identity(info))
                        require(RESTORE._identity(os.stat(name, dir_fd=directory, follow_symlinks=False)) == RESTORE._identity(os.fstat(target)))
                        os.unlink(name, dir_fd=directory)
                    finally:
                        os.close(target)
                else:
                    require(os.readlink(name, dir_fd=directory) == manifest['entries'][key]['target'])
                    require(RESTORE._identity(os.stat(name, dir_fd=directory, follow_symlinks=False)) == RESTORE._identity(info))
                    os.unlink(name, dir_fd=directory)
                unlinked[inode] = prior + 1
        os.fsync(directory)
    walk(fd)
    require(core(os.fstat(fd)) == root_core and not os.listdir(fd))


def write_gzip(source, destination_fd, byte_limit, minimum_free):
    tar = subprocess.Popen(['tar', '--format=pax', '--numeric-owner', '--xattrs', '--xattrs-include=*', '--acls', '--sparse',
                            '--atime-preserve=system', '--pax-option=delete=atime,delete=ctime',
                            '-C', '/proc/self/fd/' + str(source), '-cpf', '-', '.'],
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, pass_fds=(source,))
    zipper = subprocess.Popen(['gzip', '-9', '-n', '-c'], stdin=tar.stdout, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    tar.stdout.close()
    size = 0
    try:
        while True:
            chunk = zipper.stdout.read(1024 * 1024)
            if not chunk: break
            size += len(chunk)
            require(size <= byte_limit and shutil.disk_usage(BASE.RELEASES).free >= minimum_free)
            offset = 0
            while offset < len(chunk):
                offset += os.write(destination_fd, chunk[offset:])
            require(shutil.disk_usage(BASE.RELEASES).free >= minimum_free)
        require(zipper.wait() == 0 and tar.wait() == 0)
        os.fsync(destination_fd)
    finally:
        zipper.stdout.close()
        for child in (zipper, tar):
            if child.poll() is None:
                child.terminate(); child.wait()
    return size


def healthy():
    with urllib.request.urlopen('http://127.0.0.1:3001/api/version', timeout=10) as response:
        require(json.load(response) == {'commit': EXPECTED_ACTIVE[0], 'buildId': EXPECTED_ACTIVE[1]})
    with urllib.request.urlopen('http://127.0.0.1:3001/api/health', timeout=10) as response:
        value = json.load(response)
    require(value.get('status') == 'ok' and value.get('checks') == {'database': True, 'storage': True})


def deployment_required_root():
    largest = 0
    for identity in BASE.FAILED:
        old = BASE.open_dir(BASE.DATA + '/failed-release-archives/' + identity)
        try: largest = max(largest, BASE.sizes(old, True)['regularBytes'])
        finally: os.close(old)
    required = 4 * 1024 ** 3 + largest + 64 * 1024 ** 2
    require(required >= 5052556926)
    return required


def report_verified(required, archive_bytes, status='verified'):
    print('ENGLISH_CAPACITY_PREPARED ' + json.dumps(BASE.safe_log({'status': status, 'rootFreeBytes': shutil.disk_usage(BASE.RELEASES).free,
          'dataFreeBytes': shutil.disk_usage(BASE.DATA).free, 'requiredRootBytes': required, 'requiredDataBytes': MIN_DATA_FREE,
          'archiveBytes': archive_bytes, 'sourceRetainedInFull': True, 'protectedBuildsUnchanged': True, 'dataDiskModified': False}), separators=(',', ':')), flush=True)


def verify_completed_retention(releases, selected, protected):
    root = BASE.open_dir(ROOT_ARCHIVES)
    folder = ROOT_ARCHIVES + '/' + SOURCE_META[0] + '-' + SOURCE_META[1]
    destination = None
    try:
        require(os.fstat(root).st_uid == os.geteuid() and stat.S_IMODE(os.fstat(root).st_mode) == 0o700)
        require(os.fstat(root).st_dev == os.fstat(releases).st_dev)
        CACHE.no_submounts(root)
        destination = BASE.child_dir(root, SOURCE_META[0] + '-' + SOURCE_META[1])
        require(os.fstat(destination).st_uid == os.geteuid() and stat.S_IMODE(os.fstat(destination).st_mode) == 0o700)
        receipt = json.loads(BASE.small(destination, 'receipt.json'))
        require(receipt['status'] == 'verified-compressed-retention-complete' and
                receipt['sourceMetadata'] == {'commit': SOURCE_META[0], 'buildId': SOURCE_META[1]})
        manifest = RESTORE.load_manifest(folder + '/manifest.json')
        raw = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
        require(hashlib.sha256(raw).hexdigest() == receipt['manifestSha256'])
        require(RESTORE.verify_archive(folder + '/archive.tar.gz', manifest)['archiveSha256'] == receipt['archiveSha256'])
        original = receipt['sourceBasename']
        require('/' not in original and original not in ('', '.', '..'))
        require(stat.S_ISLNK(os.stat(original, dir_fd=releases, follow_symlinks=False).st_mode)
                and os.readlink(original, dir_fd=releases) == folder and 'original.pending' not in os.listdir(destination))
        for commit, build, expected_hash in WEBPACK:
            next_fd = BASE.child_dir(selected[(commit, build)], '.next')
            cache = BASE.child_dir(next_fd, 'cache')
            try:
                webpack = BASE.child_dir(cache, 'webpack')
                try: require(CACHE.directory_identity(webpack) == expected_hash and not os.listdir(webpack))
                finally: os.close(webpack)
            finally: os.close(cache); os.close(next_fd)
        for identity, (fd, expected) in protected.items():
            require(core(os.fstat(fd)) == expected and pair(BASE.metadata(fd)) == identity)
        required = deployment_required_root()
        require(shutil.disk_usage(BASE.RELEASES).free >= required and shutil.disk_usage(BASE.DATA).free >= MIN_DATA_FREE)
        healthy(); report_verified(required, receipt['archiveBytes'], 'already-verified')
    finally:
        if destination is not None: os.close(destination)
        os.close(root)


def prepare():
    require(os.geteuid() == 0)
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
        initial_root = shutil.disk_usage(BASE.RELEASES).free
        initial_data = shutil.disk_usage(BASE.DATA).free
        require(initial_data >= MIN_DATA_FREE and os.fstat(app).st_dev == os.fstat(releases).st_dev != os.fstat(data).st_dev)
        require(pair(BASE.metadata(app)) == EXPECTED_ACTIVE)
        healthy()
        selected, protected, owned, names = {}, {EXPECTED_ACTIVE: (app, core(os.fstat(app)))}, {}, {}
        for name in sorted(os.listdir(releases)):
            if not __import__('re').fullmatch(r'[A-Za-z0-9._-]{1,180}', name): continue
            entry = os.stat(name, dir_fd=releases, follow_symlinks=False)
            if not stat.S_ISDIR(entry.st_mode): continue
            source = BASE.child_dir(releases, name)
            meta = BASE.metadata(source)
            identity = pair(meta) if meta else None
            wanted = identity == SOURCE_META or any(identity == cache[0:2] for cache in WEBPACK) or identity in PROTECTED
            if not wanted:
                os.close(source); continue
            require(os.fstat(source).st_dev == os.fstat(releases).st_dev and identity not in selected and identity not in protected)
            handles.append(source); owned[source] = core(os.fstat(source)); names[identity] = name
            if identity in PROTECTED:
                protected[identity] = (source, core(os.fstat(source)))
            else:
                CACHE.no_submounts(source); selected[identity] = source
        require(set(protected) == PROTECTED)
        if SOURCE_META not in selected:
            require(set(selected) == {entry[0:2] for entry in WEBPACK})
            verify_completed_retention(releases, selected, protected)
            return
        require(set(selected) == {SOURCE_META, *(entry[0:2] for entry in WEBPACK)})
        source = selected[SOURCE_META]
        source_path = os.readlink('/proc/self/fd/' + str(source))
        targets = [os.readlink('/proc/self/fd/' + str(fd)) for fd in selected.values()]
        caches = []
        for commit, build, expected_hash in WEBPACK:
            next_fd = BASE.child_dir(selected[(commit, build)], '.next'); handles.append(next_fd)
            cache_fd = BASE.child_dir(next_fd, 'cache'); handles.append(cache_fd)
            webpack = BASE.child_dir(cache_fd, 'webpack'); handles.append(webpack)
            owned[next_fd] = core(os.fstat(next_fd)); owned[cache_fd] = core(os.fstat(cache_fd)); owned[webpack] = core(os.fstat(webpack))
            require(CACHE.directory_identity(webpack) == expected_hash)
            allocated, entries = snapshot(webpack)
            allocated -= os.fstat(webpack).st_blocks * 512  # Preserve the top directory itself.
            caches.append((webpack, selected[(commit, build)], next_fd, cache_fd, allocated, entries))
        assert_runtime_idle(targets, owned)
        manifest, source_snapshot, source_allocated = RESTORE.source_manifest_fd(source)
        require(source_allocated >= SOURCE_ALLOCATED_MIN)
        required_root = deployment_required_root()
        manifest_raw = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
        require(len(manifest_raw) < SIDECAR_BUDGET - 1024 ** 2)
        cache_bytes = sum(item[4] for item in caches)
        require(initial_root + cache_bytes + SOURCE_ALLOCATED_MIN - MAX_ARCHIVE_BYTES - SIDECAR_BUDGET >= required_root)
        require(initial_root + cache_bytes - MAX_ARCHIVE_BYTES - SIDECAR_BUDGET >= MIN_STAGING_ROOT)
        www = BASE.open_dir('/www'); handles.append(www)
        try: os.mkdir('study-plan-retained-compressed', 0o700, dir_fd=www)
        except FileExistsError: pass
        archive_root = BASE.child_dir(www, 'study-plan-retained-compressed'); handles.append(archive_root)
        require(os.fstat(archive_root).st_uid == 0 and stat.S_IMODE(os.fstat(archive_root).st_mode) == 0o700 and os.fstat(archive_root).st_dev == os.fstat(releases).st_dev)
        os.fsync(www)
        CACHE.no_submounts(archive_root)
        leaf = SOURCE_META[0] + '-' + SOURCE_META[1]
        try:
            os.stat(leaf, dir_fd=archive_root, follow_symlinks=False)
            raise ValueError('Existing private retention requires verified reentry')
        except FileNotFoundError:
            pass
        try: os.mkdir('compile-quarantine', 0o700, dir_fd=archive_root)
        except FileExistsError: pass
        quarantine = BASE.child_dir(archive_root, 'compile-quarantine'); handles.append(quarantine)
        require(os.fstat(quarantine).st_uid == 0 and stat.S_IMODE(os.fstat(quarantine).st_mode) == 0o700 and not os.listdir(quarantine))
        os.fsync(archive_root)
        owned[quarantine] = core(os.fstat(quarantine))
        def proof():
            dynamic = [os.readlink('/proc/self/fd/' + str(fd)) for fd in selected.values()]
            dynamic.extend(os.readlink('/proc/self/fd/' + str(item[0])) for item in caches)
            assert_runtime_idle(dynamic, owned)
        for number, (fd, cache_source, next_fd, parent_fd, _, expected) in enumerate(caches):
            proof()
            clear_cache_quarantined(fd, cache_source, next_fd, parent_fd, quarantine,
                                    'webpack-' + WEBPACK[number][0], expected, owned, proof)
        for identity, (fd, expected) in protected.items():
            require(core(os.fstat(fd)) == expected and pair(BASE.metadata(fd)) == identity)
        os.mkdir(leaf, 0o700, dir_fd=archive_root)
        os.fsync(archive_root)
        destination = BASE.child_dir(archive_root, leaf); handles.append(destination)
        folder = ROOT_ARCHIVES + '/' + leaf
        private_write(destination, 'manifest.json', manifest_raw)
        restore_source = globals().get('RESTORE_SOURCE')
        if restore_source is None: restore_source = Path(__file__).with_name('restore-retained-compressed-release.py').read_bytes()
        private_write(destination, 'restore.py', restore_source, 0o700)
        instructions = ('Retained compressed application; this is not a runnable release directory.\n'
                        'No production activation is performed by the restore tool.\n'
                        'Verify: python3 ' + folder + '/restore.py --verify ' + folder + '/archive.tar.gz --manifest ' + folder + '/manifest.json\n'
                        'Restore only with sufficient space into a NEW directory below a private mode0700 parent:\n'
                        'python3 ' + folder + '/restore.py --restore ' + folder + '/archive.tar.gz --manifest ' + folder + '/manifest.json --destination NEW_PRIVATE_DIRECTORY\n')
        private_write(destination, 'RESTORE_REQUIRED.txt', instructions.encode())
        replace_receipt(destination, {'version': 1, 'status': 'archive-incomplete-original-intact',
                        'sourceMetadata': {'commit': SOURCE_META[0], 'buildId': SOURCE_META[1]},
                        'sourceBasename': names[SOURCE_META], 'sourceIdentity': list(core(os.fstat(source))),
                        'manifestSha256': hashlib.sha256(manifest_raw).hexdigest()})
        archive = os.open('archive.tar.gz.partial', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=destination)
        try: archive_bytes = write_gzip(source, archive, MAX_ARCHIVE_BYTES, MIN_STAGING_ROOT)
        finally: os.close(archive)
        verification = RESTORE.verify_archive(folder + '/archive.tar.gz.partial', manifest)
        RESTORE.verify_tree(source_path, manifest, (os.fstat(source).st_dev, os.fstat(source).st_ino))
        require(snapshot(source, True)[1] == source_snapshot)
        os.rename('archive.tar.gz.partial', 'archive.tar.gz', src_dir_fd=destination, dst_dir_fd=destination); os.fsync(destination)
        receipt = {'version': 1, 'status': 'verified-retained', 'sourceMetadata': {'commit': SOURCE_META[0], 'buildId': SOURCE_META[1]},
                   'sourceBasename': names[SOURCE_META], 'sourceIdentity': list(core(os.fstat(source))),
                   'archiveBytes': archive_bytes, 'archiveSha256': verification['archiveSha256'],
                   'manifestSha256': hashlib.sha256(manifest_raw).hexdigest(), 'evictedWebpackBytes': cache_bytes}
        replace_receipt(destination, receipt)
        os.fsync(destination); os.fsync(archive_root); os.fsync(www)
        def final_guard():
            proof()
            for identity, (fd, expected) in protected.items():
                require(core(os.fstat(fd)) == expected and pair(BASE.metadata(fd)) == identity)
            require(shutil.disk_usage(BASE.RELEASES).free + SOURCE_ALLOCATED_MIN >= required_root and shutil.disk_usage(BASE.DATA).free >= MIN_DATA_FREE)
        release_verified_source(source, releases, names[SOURCE_META], folder, destination, manifest, source_snapshot, receipt, final_guard)
        for identity, (fd, expected) in protected.items():
            require(core(os.fstat(fd)) == expected and pair(BASE.metadata(fd)) == identity)
        require(pair(BASE.metadata(app)) == EXPECTED_ACTIVE and shutil.disk_usage(BASE.RELEASES).free >= required_root and shutil.disk_usage(BASE.DATA).free >= MIN_DATA_FREE)
        healthy()
        receipt['status'] = 'verified-compressed-retention-complete'; replace_receipt(destination, receipt)
        report_verified(required_root, archive_bytes)
    finally:
        for fd in reversed(handles): os.close(fd)


if __name__ == '__main__':
    try:
        require(sys.argv[1:] == ['--apply'])
        prepare()
    except Exception:
        # Never publish paths, private records/configuration, process metadata,
        # archive digests or exception values through public workflow logs.
        print('Capacity preparation stopped safely; retained copies require review.', flush=True)
        sys.exit(1)
