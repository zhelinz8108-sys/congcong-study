"""Synthetic preparation tests; never load production configuration or data."""
import copy
import hashlib
import importlib.util
import contextlib
import io
import json
import os
from pathlib import Path
import stat
import tempfile

spec = importlib.util.spec_from_file_location('english_prepare', Path(__file__).with_name('prepare-english-six-capacity.py'))
P = importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
CHECKS = 0


def check(value):
    global CHECKS
    assert value
    CHECKS += 1


def blocked(callback):
    try:
        callback()
    except Exception:
        check(True)
        return
    raise AssertionError('Unsafe action accepted')


def fixture(parent, name):
    root = parent / name; root.mkdir(mode=0o700)
    releases = root / 'releases'; releases.mkdir()
    source = releases / 'synthetic-old-build'; source.mkdir()
    (source / 'nested').mkdir()
    (source / 'nested/secret').write_bytes(b'synthetic private snapshot, never logged\0' * 256)
    os.link(source / 'nested/secret', source / 'hardlink')
    (source / '.env.local').write_bytes(b'SYNTHETIC=private-placeholder\n')
    outside = root / 'outside'; outside.write_bytes(b'outside marker stays intact')
    (source / 'outside-symlink').symlink_to(outside)
    (source / 'empty').mkdir()
    archive = root / 'private-archive'; archive.mkdir(mode=0o700)
    source_fd = P.BASE.open_dir(str(source)); release_fd = P.BASE.open_dir(str(releases)); archive_fd = P.BASE.open_dir(str(archive))
    manifest, snapshot, size = P.RESTORE.source_manifest_fd(source_fd)
    raw = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
    P.private_write(archive_fd, 'manifest.json', raw)
    target = os.open('archive.tar.gz', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=archive_fd)
    original_releases = P.BASE.RELEASES; P.BASE.RELEASES = str(releases)
    try:
        compressed = P.write_gzip(source_fd, target, 1024 * 1024, 0)
    finally:
        P.BASE.RELEASES = original_releases; os.close(target)
    verified = P.RESTORE.verify_archive(str(archive / 'archive.tar.gz'), manifest)
    receipt = {'version': 1, 'status': 'verified-retained', 'manifestSha256': hashlib.sha256(raw).hexdigest(),
               'archiveSha256': verified['archiveSha256'], 'archiveBytes': compressed}
    P.replace_receipt(archive_fd, receipt)
    return root, releases, source, archive, source_fd, release_fd, archive_fd, manifest, snapshot, receipt, size


def close_fixture(fixture):
    for fd in fixture[4:7]: os.close(fd)


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    # Reproducible cache removal preserves inode/owner/mode and unrelated files.
    cache = root / 'webpack'; (cache / 'client-production').mkdir(parents=True)
    (cache / 'client-production/cache.pack').write_bytes(b'reproducible' * 1000)
    marker = root / 'runtime-server.js'; marker.write_bytes(b'protected runtime artifact')
    fd = P.BASE.open_dir(str(cache))
    try:
        before = P.core(os.fstat(fd)); _, snap = P.snapshot(fd)
        P.remove_contents(fd, snap)
        check(P.core(os.fstat(fd)) == before and not list(cache.iterdir()))
        check(marker.read_bytes() == b'protected runtime artifact')
        (cache / 'cache.pack').write_bytes(b'old cache')
        _, snap = P.snapshot(fd)
        (cache / 'cache.pack').unlink(); (cache / 'cache.pack').symlink_to(marker)
        blocked(lambda: P.remove_contents(fd, snap))
        check(marker.read_bytes() == b'protected runtime artifact')
        blocked(lambda: P.snapshot(fd))
    finally: os.close(fd)

    # A same-name ordinary file replacement after stat must not be unlinked.
    race = root / 'leaf-race'; race.mkdir(); (race / 'cache.pack').write_bytes(b'old pack')
    fd = P.BASE.open_dir(str(race))
    original_stat = os.stat
    try:
        _, snap = P.snapshot(fd); swapped = [False]
        def changing_stat(path, *args, **kwargs):
            value = original_stat(path, *args, **kwargs)
            if path == 'cache.pack' and kwargs.get('dir_fd') == fd and not swapped[0]:
                swapped[0] = True
                os.rename('cache.pack', 'cache.saved', src_dir_fd=fd, dst_dir_fd=fd)
                (race / 'cache.pack').write_bytes(b'unrelated replacement stays')
            return value
        os.stat = changing_stat
        blocked(lambda: P.remove_contents(fd, snap))
        check((race / 'cache.pack').read_bytes() == b'unrelated replacement stays')
    finally: os.stat = original_stat; os.close(fd)

    # Cache quarantine preserves the original directory and never replaces a new path.
    for conflict in (False, True):
        scope = root / ('quarantine-conflict' if conflict else 'quarantine-success')
        source = scope / 'old-source'; parent = source / '.next/cache'; webpack = parent / 'webpack'
        webpack.mkdir(parents=True); (webpack / 'cache.pack').write_bytes(b'reproducible')
        private = scope / 'private'; private.mkdir(mode=0o700)
        source_fd = P.BASE.open_dir(str(source)); next_fd = P.BASE.open_dir(str(source / '.next'))
        parent_fd = P.BASE.open_dir(str(parent)); cache_fd = P.BASE.open_dir(str(webpack)); quarantine = P.BASE.open_dir(str(private))
        try:
            cache_core = P.core(os.fstat(cache_fd)); _, snap = P.snapshot(cache_fd)
            def proof():
                if conflict:
                    webpack.mkdir(); (webpack / 'new-marker').write_bytes(b'never overwrite')
            action = lambda: P.clear_cache_quarantined(cache_fd, source_fd, next_fd, parent_fd, quarantine, 'exact-cache', snap, {}, proof)
            if conflict:
                blocked(action)
                check((webpack / 'new-marker').read_bytes() == b'never overwrite')
                check((private / 'exact-cache').is_dir())
            else:
                action()
                check(webpack.is_dir() and not list(webpack.iterdir()) and P.core(os.stat(webpack)) == cache_core)
                check(not list(private.iterdir()))
        finally:
            for opened in (source_fd, next_fd, parent_fd, cache_fd, quarantine): os.close(opened)

    f = fixture(root, 'success')
    try:
        _r, releases, source, archive, source_fd, releases_fd, archive_fd, manifest, snap, receipt, size = f
        P.RESTORE.verify_source_tree(str(source), manifest)
        check(P.snapshot(source_fd, True)[1] == snap)  # No atime/identity drift.
        phases = []
        P.release_verified_source(source_fd, releases_fd, source.name, str(archive), archive_fd,
                                  manifest, snap, receipt, lambda: phases.append(os.readlink('/proc/self/fd/' + str(source_fd))))
        check(source.is_symlink() and source.readlink() == archive)
        check(len(phases) == 2 and phases[0] != phases[1] and phases[1] == str(archive / 'original.pending'))
        check((f[0] / 'outside').read_bytes() == b'outside marker stays intact')
        check(not any(path.name.startswith('.retained-compressed-') for path in releases.iterdir()))
        restored = f[0] / 'restored'
        P.RESTORE.restore_archive(str(archive / 'archive.tar.gz'), manifest, str(restored))
        P.RESTORE.verify_tree(str(restored), manifest)
        check((restored / '.env.local').read_bytes() == b'SYNTHETIC=private-placeholder\n')
        check((restored / 'hardlink').stat().st_ino == (restored / 'nested/secret').stat().st_ino)
        # A completed preparation is verified read-only on reentry.
        archive_root = f[0] / 'archive-root'; archive_root.mkdir(mode=0o700)
        relocated = archive_root / (P.SOURCE_META[0] + '-' + P.SOURCE_META[1])
        archive.rename(relocated); source.unlink(); source.symlink_to(relocated)
        receipt.update(status='verified-compressed-retention-complete', sourceBasename=source.name,
                       sourceMetadata={'commit': P.SOURCE_META[0], 'buildId': P.SOURCE_META[1]})
        P.replace_receipt(archive_fd, receipt)
        selected, cache_fds, roster = {}, [], []
        for number, (commit, build, _hash) in enumerate(P.WEBPACK):
            item = f[0] / ('cache-build-' + str(number)); (item / '.next/cache/webpack').mkdir(parents=True)
            selected[(commit, build)] = P.BASE.open_dir(str(item)); cache_fds.append(selected[(commit, build)])
            cache_pin = P.BASE.open_dir(str(item / '.next/cache/webpack'))
            try: roster.append((commit, build, P.CACHE.directory_identity(cache_pin)))
            finally: os.close(cache_pin)
        originals = (P.ROOT_ARCHIVES, P.WEBPACK, P.healthy, P.deployment_required_root, P.MIN_DATA_FREE, P.BASE.RELEASES, P.BASE.DATA)
        try:
            P.ROOT_ARCHIVES = str(archive_root); P.WEBPACK = tuple(roster)
            P.healthy = lambda: None; P.deployment_required_root = lambda: 0; P.MIN_DATA_FREE = 0
            P.BASE.RELEASES = str(releases); P.BASE.DATA = str(f[0])
            captured = io.StringIO()
            with contextlib.redirect_stdout(captured):
                P.verify_completed_retention(releases_fd, selected, {})
                P.verify_completed_retention(releases_fd, selected, {})
            check(captured.getvalue().count('already-verified') == 2)
            check(source.is_symlink() and source.readlink() == relocated and not (relocated / 'original.pending').exists())
        finally:
            (P.ROOT_ARCHIVES, P.WEBPACK, P.healthy, P.deployment_required_root, P.MIN_DATA_FREE, P.BASE.RELEASES, P.BASE.DATA) = originals
            for opened in cache_fds: os.close(opened)
    finally: close_fixture(f)

    for scenario in ('corrupt', 'changed-source', 'missing-receipt', 'pending-use', 'mount-race'):
        f = fixture(root, scenario)
        try:
            _r, releases, source, archive, source_fd, releases_fd, archive_fd, manifest, snap, receipt, size = f
            calls = [0]
            original_mount = P.CACHE.no_submounts
            if scenario == 'corrupt':
                file = archive / 'archive.tar.gz'; data = bytearray(file.read_bytes()); data[len(data)//2] ^= 1; file.write_bytes(data)
            elif scenario == 'changed-source':
                (source / '.env.local').write_bytes(b'synthetic external writer')
            elif scenario == 'missing-receipt':
                (archive / 'receipt.json').unlink()
            def guard():
                calls[0] += 1
                if scenario == 'pending-use' and calls[0] == 2: raise ValueError('Busy pending source')
            if scenario == 'mount-race':
                P.CACHE.no_submounts = lambda _fd: (_ for _ in ()).throw(ValueError('Synthetic mount insertion'))
            try:
                blocked(lambda: P.release_verified_source(source_fd, releases_fd, source.name, str(archive), archive_fd,
                                                          manifest, snap, receipt, guard))
            finally: P.CACHE.no_submounts = original_mount
            if scenario == 'pending-use':
                check((archive / 'original.pending/.env.local').read_bytes() == b'SYNTHETIC=private-placeholder\n')
            else:
                check(source.is_dir() and not source.is_symlink())
            check((f[0] / 'outside').read_bytes() == b'outside marker stays intact')
        finally: close_fixture(f)

print('PASS: private gzip verification precedes release; inode/type/symlink guards; full hardlink/private-file restoration; corrupt archive, changed source, missing receipt, pending use and mount insertion preserve originals (' + str(CHECKS) + ' checks).')
