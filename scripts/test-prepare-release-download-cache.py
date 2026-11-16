"""Synthetic cache objects only; no production paths, subprocesses or network."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('download_cache_fixture', Path(__file__).with_name('prepare-release-download-cache.py'))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
checks = []
owner = (os.getuid(), os.getgid())


def reject(label, callback):
    try:
        callback()
    except (ValueError, OSError):
        checks.append(label)
    else:
        raise AssertionError(label)


class Fixture:
    def __init__(self, folder):
        self.root = Path(folder)
        self.cache = self.root / 'cache'
        self.cache.mkdir()
        self.current, self.current_digest = self.object(b'current public package tarball' * 400)
        self.lock = self.root / 'package-lock.json'
        self.set_lock(self.current_digest)
        (self.cache / 'index-v5').mkdir()
        self.index = self.cache / 'index-v5/retained-index'
        self.index.write_bytes(b'synthetic index must remain')
        self.log = self.cache / 'retained-log'
        self.log.write_bytes(b'synthetic cache log must remain')
        self.outside = self.root / 'learner-data'
        self.outside.write_bytes(b'synthetic learning record must remain')

    def object(self, contents, addressed_digest=None):
        actual = hashlib.sha512(contents).hexdigest()
        digest = addressed_digest or actual
        path = self.cache / 'content-v2/sha512' / digest[:2] / digest[2:4] / digest[4:]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(contents)
        return path, actual

    def set_lock(self, digest):
        self.lock.write_text(json.dumps({'lockfileVersion': 3, 'packages': {
            '': {}, 'node_modules/synthetic-public-package': {
                'resolved': 'https://registry.npmjs.org/synthetic-public-package/-/package.tgz',
                'integrity': 'sha512-' + base64.b64encode(bytes.fromhex(digest)).decode(),
            },
        }}))

    def free_counter(self, initial=100):
        original = {path: path.lstat().st_blocks * 512 for path in self.cache.rglob('*')
                    if path.is_file() and not path.is_symlink()}
        return lambda: initial + sum(size for path, size in original.items() if not os.path.lexists(path))

    def retained(self):
        assert self.current.is_file()
        assert hashlib.sha512(self.current.read_bytes()).hexdigest() == self.current_digest
        assert self.index.read_bytes() == b'synthetic index must remain'
        assert self.log.read_bytes() == b'synthetic cache log must remain'
        assert self.outside.read_bytes() == b'synthetic learning record must remain'

    def recover(self, available, target, maximum=1024**2, **options):
        return helper.recover_cache(self.cache, self.lock, available, owner=owner,
                                    target=target, maximum=maximum, **options)


with tempfile.TemporaryDirectory() as folder:
    missing = Path(folder) / 'must-not-be-opened'
    with patch.object(helper, 'open_directory', side_effect=AssertionError('Cache inspected unnecessarily')):
        result = helper.recover_cache(missing, missing, lambda: helper.TARGET_FREE)
    assert result['cacheObjectsReleased'] == 0 and not result['cacheRecoveryNeeded']
    checks.append('sufficient-capacity-does-not-open-cache-or-active-lock')

with tempfile.TemporaryDirectory() as folder:
    f = Fixture(folder)
    unused, _ = f.object(b'unused public package download' * 200)
    allocated = unused.stat().st_blocks * 512
    available = f.free_counter()
    lock_before = f.lock.read_bytes()
    result = f.recover(available, 100 + allocated)
    assert result['cacheObjectsReleased'] == 1 and not unused.exists()
    f.retained()
    assert f.lock.read_bytes() == lock_before
    result = f.recover(available, 100 + allocated)
    assert result['cacheObjectsReleased'] == 0
    checks.append('only-unneeded-verified-content-reclaimed-current-lock-index-logs-and-data-preserved')
    checks.append('successful-recovery-is-idempotent')

with tempfile.TemporaryDirectory() as folder:
    f = Fixture(folder)
    valid, _ = f.object(b'eligible but insufficient' * 200)
    allocated = valid.stat().st_blocks * 512
    reject('insufficient-total-candidates-retains-every-object',
           lambda: f.recover(f.free_counter(), 100 + allocated + 4096))
    assert valid.exists()
    f.retained()
    reject('fixed-recovery-limit-rejects-before-cleanup',
           lambda: f.recover(f.free_counter(), 100 + allocated, maximum=allocated - 1))
    assert valid.exists()

with tempfile.TemporaryDirectory() as folder:
    f = Fixture(folder)
    valid, _ = f.object(b'only eligible object' * 200)
    bad_hash, _ = f.object(b'corrupt bytes', 'e' * 128)
    hardlink, _ = f.object(b'hard-linked object must stay')
    os.link(hardlink, f.root / 'outside-hardlink')
    symlink, _ = f.object(b'placeholder linked object')
    symlink.unlink()
    symlink.symlink_to(f.outside)
    fifo, _ = f.object(b'placeholder special file')
    fifo.unlink()
    os.mkfifo(fifo)
    owner_mismatch, _ = f.object(b'wrong owner object must stay')
    mismatch_inode = owner_mismatch.stat().st_ino
    original_fstat = os.fstat

    def owner_stat(descriptor):
        info = original_fstat(descriptor)
        if info.st_ino != mismatch_inode:
            return info
        fields = {key: getattr(info, key) for key in (
            'st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink', 'st_size',
            'st_blocks', 'st_mtime_ns', 'st_ctime_ns')}
        return SimpleNamespace(**{**fields, 'st_uid': owner[0] + 1})

    allocated = valid.stat().st_blocks * 512
    with patch.object(helper.os, 'fstat', side_effect=owner_stat):
        result = f.recover(f.free_counter(), 100 + allocated)
    assert result['cacheObjectsReleased'] == 1 and not valid.exists()
    for target in (bad_hash, hardlink, symlink, fifo, owner_mismatch):
        assert os.path.lexists(target)
    f.retained()
    checks.append('digest-mismatch-hardlink-symlink-special-file-and-owner-mismatch-are-not-candidates')

with tempfile.TemporaryDirectory() as folder:
    f = Fixture(folder)
    unused, _ = f.object(b'candidate under linked cache path')
    actual = f.cache
    link = f.root / 'cache-link'
    link.symlink_to(actual, target_is_directory=True)
    reject('symbolic-link-cache-parent-is-rejected',
           lambda: helper.recover_cache(link, f.lock, lambda: 100, owner=owner, target=101))
    assert unused.exists()
    f.retained()

with tempfile.TemporaryDirectory() as folder:
    f = Fixture(folder)
    unused, _ = f.object(b'candidate with special active lock')
    f.lock.unlink()
    os.mkfifo(f.lock)
    reject('special-active-lock-is-rejected-without-blocking',
           lambda: f.recover(lambda: 100, 101))
    assert unused.exists()
    f.retained()

with tempfile.TemporaryDirectory() as folder:
    f = Fixture(folder)
    unused, _ = f.object(b'candidate requiring locked namespace')
    namespace = f.cache / 'content-v2/sha512'
    real = f.root / 'outside-namespace'
    namespace.rename(real)
    namespace.symlink_to(real, target_is_directory=True)
    reject('symbolic-link-namespace-is-rejected', lambda: f.recover(lambda: 100, 101))
    assert (real / unused.relative_to(namespace)).exists()
    assert f.outside.read_bytes() == b'synthetic learning record must remain'

with tempfile.TemporaryDirectory() as folder:
    f = Fixture(folder)
    unused, _ = f.object(b'candidate that changes during planning')
    original_collect = helper.collect_candidates

    def changed_candidates(*arguments):
        result = original_collect(*arguments)
        unused.write_bytes(b'concurrent change')
        return result

    with patch.object(helper, 'collect_candidates', side_effect=changed_candidates):
        reject('concurrent-object-change-before-deletion-retains-all-copies',
               lambda: f.recover(lambda: 100, 101))
    assert unused.read_bytes() == b'concurrent change'
    f.retained()

with tempfile.TemporaryDirectory() as folder:
    f = Fixture(folder)
    unused, _ = f.object(b'candidate with changing active dependency lock')
    original_collect = helper.collect_candidates

    def changed_lock(*arguments):
        result = original_collect(*arguments)
        f.set_lock(hashlib.sha512(b'new active lock object').hexdigest())
        return result

    with patch.object(helper, 'collect_candidates', side_effect=changed_lock):
        reject('active-lock-change-before-deletion-retains-all-cache-objects',
               lambda: f.recover(lambda: 100, 101))
    assert unused.exists()
    f.retained()

with tempfile.TemporaryDirectory() as folder:
    f = Fixture(folder)
    unused, _ = f.object(b'candidate with changed root owner')
    reject('unexpected-cache-owner-is-rejected',
           lambda: helper.recover_cache(f.cache, f.lock, lambda: 100,
                                        owner=(owner[0] + 1, owner[1]), target=101))
    reject('cache-on-wrong-filesystem-is-rejected',
           lambda: f.recover(lambda: 100, 101, device=f.cache.stat().st_dev + 1))
    assert unused.exists()
    f.retained()

with tempfile.TemporaryDirectory() as folder:
    f = Fixture(folder)
    first, _ = f.object(b'oldest recoverable object' * 300)
    second, second_digest = f.object(b'next recoverable object' * 300)
    os.utime(first, ns=(1, 1))
    allocated = first.stat().st_blocks * 512 + second.stat().st_blocks * 512
    measured = f.free_counter()
    changed = False

    def concurrent_lock_change():
        global changed
        if not first.exists() and not changed:
            f.set_lock(second_digest)
            changed = True
        return measured()

    reject('active-lock-change-during-cleanup-retains-newly-required-next-object',
           lambda: f.recover(concurrent_lock_change, 100 + allocated))
    assert not first.exists() and second.exists()
    f.retained()

print(json.dumps({'passed': True, 'checks': checks, 'productionWrites': 0, 'networkCalls': 0}))
