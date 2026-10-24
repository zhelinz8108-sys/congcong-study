"""Exercise the fixed old-release archive guards with synthetic files only."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('retained_archive', Path(__file__).with_name('archive-retained-release.py'))
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)
helper = archive.helper
checks = []


def reject(name, function):
    try:
        function()
    except (ValueError, OSError) as error:
        checks.append(name)
        return error
    else:
        raise AssertionError('Expected rejection: ' + name)


class Fixture:
    def __init__(self, root):
        self.root = root
        self.app = root / 'app'
        self.releases = root / 'releases'
        self.data = root / 'data'
        self.proc = root / 'proc'
        for directory in (self.app, self.releases, self.data, self.proc):
            directory.mkdir()
        self.source = self.releases / archive.IDENTITY
        self.pending = self.releases / ('.archiving-' + archive.IDENTITY)
        self.archives = self.data / 'retained-release-archives'
        self.destination = self.archives / archive.IDENTITY
        self.receipt = self.archives / (archive.IDENTITY + '.json')
        self.source.mkdir()
        self.build(self.source, 'old-build')
        self.build(self.app, 'current-build')
        (self.source / 'lesson.txt').write_text('synthetic preserved lesson')
        (self.source / '.env.local').write_text('synthetic private value')
        (self.source / '.env.local').chmod(0o600)
        self.old = {'status': 'deployed', 'release': archive.RELEASE,
                    'commit': archive.RELEASE[:40], 'oldBuildId': 'old-build',
                    'newBuildId': 'october17-build', 'previousDirectory': str(self.source),
                    'timestamp': '2026-10-17T01:51:55+00:00'}
        self.latest = {'status': 'deployed', 'release': 'latest-release',
                       'newBuildId': 'current-build',
                       'previousDirectory': str(self.releases / 'previous-latest'),
                       'timestamp': '2026-10-24T12:05:35+00:00'}
        self.write_receipts()
        self.process = self.proc / '123'
        self.process.mkdir()
        (self.process / 'fd').mkdir()
        (self.process / 'cwd').symlink_to(self.app)
        (self.process / 'exe').symlink_to('/synthetic/interpreter')
        (self.process / 'maps').write_text('unrelated memory mappings')
        (self.process / 'cmdline').write_bytes(b'python3\0synthetic-test.py\0')

    def build(self, directory, value):
        (directory / '.next').mkdir()
        (directory / '.next/BUILD_ID').write_text(value)

    def write_receipts(self):
        for name, value in ((archive.RELEASE, self.old), ('latest-release', self.latest)):
            directory = self.data / 'backups' / ('before-main-' + name)
            directory.mkdir(parents=True, exist_ok=True)
            (directory / 'receipt.json').write_text(json.dumps(value))

    def guard(self):
        archive.guard(self.source, self.pending, self.destination)


with tempfile.TemporaryDirectory() as folder:
    fixture = Fixture(Path(folder))
    with patch.multiple(archive, APP=fixture.app, DATA=fixture.data, RELEASES=fixture.releases, PROC=fixture.proc), \
         patch.object(archive.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='')), \
         patch.object(archive.subprocess, 'check_output', return_value=str(fixture.app) + '\n'):
        fixture.guard()
        checks.append('verified-old-release-and-latest-current-build-accepted')
        fixture.latest['previousDirectory'] = str(fixture.source)
        fixture.write_receipts()
        reject('latest-rollback-copy-rejected', fixture.guard)
        fixture.latest['previousDirectory'] = str(fixture.releases / 'previous-latest')
        fixture.write_receipts()
        (fixture.app / '.next/BUILD_ID').write_text('unexpected-current-build')
        reject('current-build-mismatch-rejected', fixture.guard)
        (fixture.app / '.next/BUILD_ID').write_text('current-build')
        (fixture.source / '.next/BUILD_ID').write_text('unexpected-old-build')
        reject('old-build-mismatch-rejected', fixture.guard)
        (fixture.source / '.next/BUILD_ID').write_text('old-build')
        fixture.old['status'] = 'prepared'
        fixture.write_receipts()
        reject('unactivated-old-release-rejected', fixture.guard)
        fixture.old['status'] = 'deployed'
        fixture.write_receipts()
        for name in ('cwd', 'exe'):
            target = fixture.process / name
            previous = target.readlink()
            target.unlink(); target.symlink_to(fixture.source / 'lesson.txt')
            reject('process-' + name + '-reference-rejected', fixture.guard)
            target.unlink(); target.symlink_to(previous)
        descriptor = fixture.process / 'fd/7'
        descriptor.symlink_to(str(fixture.source / 'lesson.txt') + ' (deleted)')
        reject('process-open-deleted-file-reference-rejected', fixture.guard)
        descriptor.unlink()
        for name in ('maps', 'cmdline'):
            target = fixture.process / name
            original = target.read_bytes()
            target.write_bytes(b'unrelated prefix\0' + os.fsencode(fixture.source / 'lesson.txt'))
            reject('process-' + name + '-reference-rejected', fixture.guard)
            target.write_bytes(original)
        link = fixture.app / 'old-release-dependency'
        link.symlink_to(fixture.source / 'lesson.txt')
        reject('live-application-link-reference-rejected', fixture.guard)
        link.unlink()
        fixture.guard()

        # Retrying each supported pointer state still verifies the original build.
        fixture.archives.mkdir(mode=0o700)
        shutil.copytree(fixture.source, fixture.destination, symlinks=True)
        fixture.guard()
        fixture.source.rename(fixture.pending)
        fixture.guard()
        fixture.source.symlink_to(fixture.destination, target_is_directory=True)
        fixture.guard()
        (fixture.pending / '.next/BUILD_ID').unlink()
        fixture.guard()
        checks.append('partial-duplicate-cleanup-still-verifies-complete-archive')
        shutil.rmtree(fixture.pending)
        fixture.guard()
        checks.append('complete-copy-rename-and-linked-retry-states-accepted')


for refused_call in (1, 2):
    with tempfile.TemporaryDirectory() as folder:
        fixture = Fixture(Path(folder))
        fixture.archives.mkdir(mode=0o700)
        before = helper.tree(fixture.source)
        calls = []

        def before_release():
            calls.append(len(calls) + 1)
            if len(calls) == refused_call:
                raise ValueError('synthetic newly active reference')

        move = lambda callback: helper.move_verified(fixture.source, fixture.destination, fixture.pending,
                                                     fixture.receipt, archive.IDENTITY, before_release=callback)
        reject('recheck-before-' + ('rename' if refused_call == 1 else 'duplicate-release') + '-retains-all-files',
               lambda: move(before_release))
        assert len(calls) == refused_call
        assert helper.tree(fixture.destination) == before
        if refused_call == 1:
            assert not fixture.source.is_symlink()
            assert helper.tree(fixture.source) == before
            assert not fixture.pending.exists()
        else:
            assert fixture.source.is_symlink() and fixture.source.readlink() == fixture.destination
            assert helper.tree(fixture.pending) == before
        assert move(lambda: None) in ('archived-and-verified', 'already-archived')
        assert fixture.source.is_symlink() and not fixture.pending.exists()
        assert helper.tree(fixture.destination) == before
        checks.append(('before-rename' if refused_call == 1 else 'before-duplicate-release') + '-rejection-retries-successfully')


with tempfile.TemporaryDirectory() as folder:
    fixture = Fixture(Path(folder))
    before = helper.tree(fixture.source)
    lockdir = fixture.root / 'lock'
    path_type = type(Path())

    class SyntheticPath(path_type):
        def stat(self, *, follow_symlinks=True):
            result = super().stat(follow_symlinks=follow_symlinks)
            values = list(result)
            if self == fixture.releases:
                values[2] = result.st_dev + 1
            if self == lockdir:
                values[4] = 0
            return os.stat_result(values)

    original_path = Path

    def selected_path(value):
        return SyntheticPath(lockdir) if value == '/run/study-plan-release' else original_path(value)

    # Enough for the reserve alone, but not the selected old release as well.
    disk = SimpleNamespace(free=10 * archive.GIB + 64 * 1024**2)
    with patch.multiple(archive, APP=fixture.app, DATA=fixture.data, RELEASES=SyntheticPath(fixture.releases), PROC=fixture.proc), \
         patch.object(archive, 'Path', side_effect=selected_path), \
         patch.object(archive.os, 'geteuid', return_value=0), \
         patch.object(archive, 'guard', return_value=None), \
         patch.object(archive.shutil, 'disk_usage', return_value=disk):
        error = reject('insufficient-copy-space-retains-original-and-creates-no-archive', archive.run)
        assert 'Insufficient data-disk space' in str(error), str(error)
    assert helper.tree(fixture.source) == before
    assert not fixture.destination.exists() and not fixture.pending.exists()
    assert not fixture.archives.exists()


print(json.dumps({'status': 'pass', 'checks': checks, 'productionWrites': 0, 'networkCalls': 0}))
