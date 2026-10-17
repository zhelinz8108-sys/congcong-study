"""Use only synthetic files to test verified relocation and rejection paths."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('archive_stage', Path(__file__).with_name('archive-failed-release-stages.py'))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
checks = []


def reject(name, function):
    try:
        function()
    except (ValueError, OSError):
        checks.append(name)
    else:
        raise AssertionError(name)


with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    releases = root / 'releases'; archives = root / 'archives'
    releases.mkdir(); archives.mkdir(mode=0o700)
    identity = helper.FAILED_RELEASES[0]
    source = releases / identity

    def stage():
        source.mkdir()
        (source / 'scripts').mkdir()
        (source / 'package.json').write_text('{"fixture":true}')
        (source / 'scripts/release-production.sh').write_text('# fixture')
        (source / '资料.txt').write_text('synthetic lesson')

    stage()
    before = helper.tree(source)
    assert helper.relocate(releases, archives, identity) == 'archived-and-verified'
    assert source.is_symlink() and source.readlink() == archives / identity
    assert helper.tree(archives / identity) == before
    assert (source / '资料.txt').read_text() == 'synthetic lesson'
    assert helper.relocate(releases, archives, identity) == 'already-archived'
    checks.append('verified-full-copy-preserves-original-path-and-retry')
    source.unlink()
    import shutil
    shutil.rmtree(archives / identity); (archives / (identity + '.json')).unlink()
    stage()
    (source / '.env.local').write_text('synthetic private value')
    (source / '.env.local').chmod(0o600)
    (source / '.next').mkdir()
    (source / '.next/BUILD_ID').write_text('synthetic-build')
    (source / 'node_modules/.bin').mkdir(parents=True)
    (source / 'node_modules/tool').write_text('synthetic tool')
    (source / 'node_modules/.bin/tool').symlink_to('../tool')
    outside = root / 'outside'; outside.mkdir()
    (outside / 'upload.txt').write_text('synthetic upload')
    (source / 'external').symlink_to('../outside')
    reject('external-relative-link-rejected', lambda: helper.relocate(releases, archives, identity))
    (source / 'external').unlink()
    (source / 'external').symlink_to(outside)
    complete = helper.tree(source)
    assert not any('upload.txt' in name for name in complete), 'External uploads must not be traversed'
    assert helper.relocate(releases, archives, identity) == 'archived-and-verified'
    assert helper.tree(archives / identity) == complete
    assert (source / '.env.local').read_text() == 'synthetic private value'
    assert (source / 'node_modules/.bin/tool').read_text() == 'synthetic tool'
    assert (outside / 'upload.txt').read_text() == 'synthetic upload'
    checks.append('configuration-build-and-links-preserved-without-copying-linked-uploads')
    source.unlink(); shutil.rmtree(archives / identity); (archives / (identity + '.json')).unlink()
    stage(); before = helper.tree(source)
    os.mkfifo(source / 'socket-fixture')
    reject('special-file-rejected', lambda: helper.relocate(releases, archives, identity))
    (source / 'socket-fixture').unlink()
    reject('active-application-rejected', lambda: helper.ensure_inactive(source, identity, app=source))
    with patch.object(helper.subprocess, 'run', return_value=SimpleNamespace(stdout='active-worker')):
        reject('active-worker-rejected', lambda: helper.ensure_inactive(source, identity, app=root / 'active-app'))
    with patch.object(helper.subprocess, 'run', return_value=SimpleNamespace(stdout='')):
        helper.ensure_inactive(source, identity, app=root / 'active-app')
    checks.append('inactive-worker-required-before-relocation')
    reject('other-releases-not-allowed', lambda: helper.relocate(releases, archives, 'previous-important'))
    original_copy = helper.shutil.copytree

    def corrupt(*args, **kwargs):
        result = original_copy(*args, **kwargs)
        (Path(args[1]) / '资料.txt').write_text('damaged')
        return result

    with patch.object(helper.shutil, 'copytree', side_effect=corrupt):
        reject('copy-corruption-retains-source', lambda: helper.relocate(releases, archives, identity))
    assert helper.tree(source) == before and not (archives / identity).exists()
    with patch.object(Path, 'symlink_to', side_effect=OSError('synthetic link failure')):
        reject('failed-pointer-restores-original-source', lambda: helper.relocate(releases, archives, identity))
    assert not source.is_symlink() and helper.tree(source) == before
    assert helper.tree(archives / identity) == before
    checks.append('all-source-files-retained-on-failure')
    assert helper.relocate(releases, archives, identity) == 'archived-and-verified'
    checks.append('verified-copy-resumes-after-pointer-failure')
    cache = root / 'download-cache'; cache.mkdir()
    (cache / 'blob').write_text('synthetic npm package bytes')
    cache_target = root / 'cache-on-data'
    assert helper.move_verified(cache, cache_target, root / 'pending-cache', root / 'cache-receipt.json', 'ubuntu-npm-cacache', mutable=True) == 'archived-and-verified'
    (cache_target / 'new-download').write_text('legitimate later cache write')
    assert helper.move_verified(cache, cache_target, root / 'pending-cache', root / 'cache-receipt.json', 'ubuntu-npm-cacache', mutable=True) == 'already-on-data-disk'
    assert (cache / 'new-download').read_text() == 'legitimate later cache write'
    checks.append('download-cache-remains-writable-through-original-path')

for interrupted in ('partial-copy', 'before-receipt', 'before-pointer', 'during-cleanup', 'changed-archive', 'changed-pending'):
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        releases = root / 'releases'; archives = root / 'archives'
        releases.mkdir(); archives.mkdir(mode=0o700)
        source = releases / identity; source.mkdir()
        (source / 'package.json').write_text('{"fixture":true}')
        (source / 'scripts').mkdir()
        (source / 'scripts/release-production.sh').write_text('fixture')
        (source / '.env.local').write_text('synthetic private value')
        (source / '.env.local').chmod(0o600)
        before = helper.tree(source)
        destination = archives / identity
        pending = releases / ('.archiving-' + identity)
        if interrupted == 'partial-copy':
            partial = archives / (identity + '.partial'); partial.mkdir()
            (partial / 'unfinished').write_text('preserve interrupted copy')
        else:
            shutil.copytree(source, destination)
        if interrupted in ('before-pointer', 'during-cleanup', 'changed-pending'):
            source.rename(pending)
        if interrupted in ('during-cleanup', 'changed-pending'):
            source.symlink_to(destination)
        if interrupted == 'during-cleanup':
            (pending / '.env.local').unlink()
        if interrupted == 'changed-archive':
            (destination / 'package.json').write_text('changed archive')
        if interrupted == 'changed-pending':
            (pending / 'package.json').write_text('changed pending')
        if interrupted.startswith('changed-'):
            reject(interrupted + '-retains-both-copies', lambda: helper.relocate(releases, archives, identity))
            assert source.exists() and destination.exists()
            if interrupted == 'changed-pending':
                assert (pending / 'package.json').read_text() == 'changed pending'
            else:
                assert helper.tree(source) == before
        else:
            assert helper.relocate(releases, archives, identity) in ('archived-and-verified', 'already-archived')
            assert source.is_symlink() and helper.tree(destination) == before
            assert not pending.exists()
            if interrupted == 'partial-copy':
                saved = list(archives.glob(identity + '.interrupted-*'))
                assert len(saved) == 1 and (saved[0] / 'unfinished').read_text() == 'preserve interrupted copy'
            checks.append(interrupted + '-resumes-with-complete-verified-copy')

with patch.object(helper.fcntl, 'flock', side_effect=[BlockingIOError(), None]) as lock_call, patch.object(helper.time, 'sleep'):
    helper.acquire_lock(object())
    assert lock_call.call_count == 2
    checks.append('waits-for-disconnected-worker-lock-before-any-mutation')
print(json.dumps({'status': 'pass', 'checks': checks, 'productionWrites': 0, 'networkCalls': 0}))
