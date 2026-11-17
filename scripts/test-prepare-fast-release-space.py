"""Fixed generated-directory cleanup with temporary fixtures only."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('fast_space_fixture', Path(__file__).with_name('prepare-fast-release-space.py'))
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
checks = []


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True); path.write_text(text)


def fixture(root):
    live = root / 'live'; releases = root / 'releases'; backups = root / 'backups'
    protected = releases / helper.PROTECTED; older = releases / helper.OLDER
    for path, value in ((live, 'live-build'), (protected, 'protected-build'), (older, 'older-build')):
        write(path / '.next/BUILD_ID', value)
        write(path / '.next/server/runtime.js', 'generated runtime')
        write(path / '.next/cache/webpack/pack.bin', 'generated webpack cache')
        write(path / '.next/cache/fetch-cache/keep', 'other cache')
        write(path / 'node_modules/pkg/index.js', 'installed dependency')
        for name in ('.env.fixture', '.data/records', 'src/source.ts', 'content/material.txt', 'public/uploads/user.pdf', 'public/listening/sound.mp3'):
            write(path / name, 'preserved synthetic data ' + name)
    write(live / 'release-metadata.json', json.dumps({'commit': helper.COMMIT, 'buildId': 'live-build'}))
    receipt_paths = []
    for identity, directory in ((helper.PROTECTED, protected), (helper.OLDER, older)):
        receipt = backups / ('before-main-' + identity.removeprefix('previous-')) / 'receipt.json'
        write(receipt, json.dumps({'status': 'deployed', 'commit': identity.removeprefix('previous-').split('-')[0],
                                  'previousDirectory': str(directory), 'oldBuildId': helper.build_id(directory), 'newBuildId': 'live-build'}))
        receipt.chmod(0o600); receipt_paths.append(receipt)
    write(root / 'archives/keep.tar.gz', 'preserved historical archive')
    write(root / 'outside/learning.txt', 'external learning bytes')
    foreign = older / 'node_modules/.bin/external'; foreign.parent.mkdir()
    foreign.symlink_to(root / 'outside', target_is_directory=True)
    return live, releases, backups, protected, older, receipt_paths


def snapshot(root):
    result = {}
    for path in sorted(root.rglob('*')):
        name = str(path.relative_to(root))
        if path.is_symlink():
            result[name] = ('link', os.readlink(path))
        elif path.is_dir():
            result[name] = ('directory',)
        else:
            result[name] = ('file', path.read_bytes(), path.stat().st_mode)
    return result


def expect_rejected(call, root):
    before = snapshot(root)
    try:
        call()
    except (helper.SpaceError, OSError, ValueError):
        assert snapshot(root) == before, 'Rejected preflight removed or changed files'
    else:
        raise AssertionError('Unsafe cleanup accepted')


assert helper.recover_space(Path('/not-present'), Path('/not-present'), Path('/not-present'), lambda: helper.TARGET_FREE, apply=True)['changed'] is False
checks.append('enough-root-space-skips-all-history-and-filesystem-inspection')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); live, releases, backups, protected, older, receipts = fixture(root)
    before = snapshot(root)
    with patch.object(helper, 'assert_inactive'):
        result = helper.recover_space(live, releases, backups, lambda: 0)
    assert result['dryRun'] is True and snapshot(root) == before
    checks.append('default-dry-run-verifies-and-plans-without-removing-anything')

    mutations = [
        (live / 'release-metadata.json', 'commit', '0' * 40),
        (live / 'release-metadata.json', 'buildId', 'wrong-current-build'),
        (receipts[0], 'status', 'rolled-back'), (receipts[0], 'oldBuildId', 'wrong-protected-build'),
        (receipts[0], 'newBuildId', 'wrong-current-build'), (receipts[0], 'previousDirectory', str(older)),
        (receipts[1], 'status', 'rolled-back'), (receipts[1], 'oldBuildId', 'wrong-older-build'),
        (receipts[1], 'commit', '0' * 40), (receipts[1], 'previousDirectory', str(live)),
    ]
    for path, key, wrong in mutations:
        original = path.read_bytes(); value = json.loads(original); value[key] = wrong
        path.write_text(json.dumps(value))
        with patch.object(helper, 'assert_inactive'):
            expect_rejected(lambda: helper.recover_space(live, releases, backups, lambda: 0, apply=True), root)
        path.write_bytes(original)
    for directory in (live, protected, older):
        path = directory / '.next/BUILD_ID'; original = path.read_bytes(); path.write_text('wrong-build')
        with patch.object(helper, 'assert_inactive'):
            expect_rejected(lambda: helper.recover_space(live, releases, backups, lambda: 0, apply=True), root)
        path.write_bytes(original)
    checks.append('all-three-build-identities-and-both-successful-receipts-required-before-any-deletion')

    with patch.object(helper, 'assert_inactive', side_effect=helper.SpaceError('synthetic worker still active')):
        expect_rejected(lambda: helper.recover_space(live, releases, backups, lambda: 0, apply=True), root)
    checks.append('worker-use-refuses-cleanup-with-zero-deletions')

    modules = older / 'node_modules'; renamed = older / 'kept-modules'
    modules.rename(renamed); modules.symlink_to(renamed, target_is_directory=True)
    with patch.object(helper, 'assert_inactive'):
        expect_rejected(lambda: helper.recover_space(live, releases, backups, lambda: 0, apply=True), root)
    modules.unlink(); renamed.rename(modules)
    with patch.object(helper, 'assert_inactive'):
        expect_rejected(lambda: helper.recover_space(protected, releases, backups, lambda: 0, apply=True), root)
    checks.append('top-level-symlinks-and-live-protected-aliases-rejected')

    outside_before = snapshot(root / 'outside'); protected_before = snapshot(protected)
    live_compiled_before = (live / '.next/server/runtime.js').read_bytes()
    current_modules_before = snapshot(live / 'node_modules')
    def free_after_all_generated():
        remaining = [path for path in (older / '.next').iterdir() if path.name != 'BUILD_ID']
        return helper.TARGET_FREE if not modules.exists() and not remaining and not (live / '.next/cache/webpack').exists() else 0
    with patch.object(helper, 'assert_inactive'):
        result = helper.recover_space(live, releases, backups, free_after_all_generated, apply=True)
    assert result['changed'] and result['rootFreeMiB'] == helper.TARGET_FREE // 1024**2
    assert helper.build_id(older) == 'older-build' and not modules.exists()
    assert [path.name for path in (older / '.next').iterdir()] == ['BUILD_ID']
    assert snapshot(root / 'outside') == outside_before and snapshot(protected) == protected_before
    assert (live / '.next/server/runtime.js').read_bytes() == live_compiled_before
    assert snapshot(live / 'node_modules') == current_modules_before
    assert (live / '.next/cache/fetch-cache/keep').read_text() == 'other cache'
    for directory in (live, protected, older):
        for name in ('.env.fixture', '.data/records', 'src/source.ts', 'content/material.txt', 'public/uploads/user.pdf', 'public/listening/sound.mp3'):
            assert (directory / name).read_text() == 'preserved synthetic data ' + name
    assert (root / 'archives/keep.tar.gz').read_text() == 'preserved historical archive'
    assert helper.recover_space(live, releases, backups, free_after_all_generated, apply=True)['changed'] is False
    checks.append('only-old-generated-trees-and-live-webpack-removed-with-buildid-data-archives-and-latest-rollback-unchanged')
    checks.append('nested-external-link-is-unlinked-without-following-or-changing-the-target')
    checks.append('completed-cleanup-is-idempotent')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); live, releases, backups, protected, older, receipts = fixture(root)
    available = lambda: helper.TARGET_FREE if not (older / 'node_modules').exists() else 0
    with patch.object(helper, 'assert_inactive'):
        result = helper.recover_space(live, releases, backups, available, apply=True)
    assert result['removedTargets'] == 1
    assert (older / '.next/server/runtime.js').exists() and (live / '.next/cache/webpack').exists()
    checks.append('actual-free-capacity-stops-after-first-sufficient-target')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); live, releases, backups, protected, older, receipts = fixture(root)
    protected_before = snapshot(protected)
    with patch.object(helper, 'assert_inactive'):
        try:
            helper.recover_space(live, releases, backups, lambda: 0, apply=True)
        except helper.SpaceError as error:
            assert error.metrics['rootFreeMiB'] == 0 and error.metrics['removedTargets'] > 0
            assert snapshot(protected) == protected_before and helper.build_id(older) == 'older-build'
        else:
            raise AssertionError('Insufficient actual space accepted')
        expect_rejected(lambda: helper.recover_space(live, releases, backups, lambda: 0, apply=True), root)
    checks.append('insufficient-fixed-generated-capacity-fails-closed-quickly-and-retries-without-new-deletions')

print(json.dumps({'passed': True, 'checks': checks, 'productionWrites': 0, 'networkCalls': 0}))
