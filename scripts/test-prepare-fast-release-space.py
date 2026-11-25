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

assert helper.target_for_upload(None) == helper.TARGET_FREE
for mib in (710, 1200):
    assert helper.target_for_upload(mib * 1024**2) == (4096 + mib + 256) * 1024**2
for largest_mib in (9, 400):
    assert helper.target_for_upload(722 * 1024**2, largest_mib * 1024**2) == (4096 + 722 + largest_mib + 64) * 1024**2
for invalid in ((-1,), (0,), (None, 1), (100, -1), (100, 0), (100, 101)):
    try:
        helper.target_for_upload(*invalid)
    except helper.SpaceError:
        pass
    else:
        raise AssertionError('Invalid upload size was accepted')
checks.append('measured-upload-keeps-full-build-headroom-and-transfer-margin')

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

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); live, releases, backups, protected, older, receipts = fixture(root)
    extra = [older / '.next-before-reviewed', older / '.next-failed-reviewed', older / '.next-english-reviewed']
    for path, marker in zip(extra, ('BUILD_ID', 'build-manifest.json', 'routes-manifest.json')):
        write(path / marker, 'compiled-build' if marker == 'BUILD_ID' else '{}')
        write(path / 'server/chunk.js', 'generated compiled bytes')
    unknown = older / '.next-before-not-compiled'; write(unknown / 'keep.txt', 'no compiled evidence, retain')
    write(protected / '.next-before-keep/BUILD_ID', 'latest rollback retained')
    write(live / '.next-before-keep/BUILD_ID', 'current application retained')
    protected_before, live_before = snapshot(protected), snapshot(live)
    available = lambda: helper.TARGET_FREE if all(not path.exists() for path in extra) else 0
    with patch.object(helper, 'assert_inactive'):
        result = helper.recover_space(live, releases, backups, available, apply=True)
    assert result['removedTargets'] == 3 and (older / 'node_modules').exists()
    assert (unknown / 'keep.txt').exists() and snapshot(protected) == protected_before and snapshot(live) == live_before
    checks.append('only-older-next-prefix-directories-with-compiled-evidence-are-removed-first')

assert helper.duplicate_allowed(Path('content/grade6-bank/sealed/private/static.png.enc'))
assert helper.duplicate_allowed(Path('content/chinese-six/sealed/pages/static.png.enc'))
assert helper.duplicate_allowed(Path('public/listening/a.mp3'))
assert helper.duplicate_allowed(Path('content/grade6-bank/manifest.json'))
for prefix in ('test', 'check', 'audit', 'verify'):
    assert helper.duplicate_allowed(Path(f'scripts/{prefix}-atlas.mjs'))
for relative in ('src/.env.private', 'src/.data/student.json', 'public/uploads/user.pdf',
                 'scripts/release-production.sh', 'scripts/migrate-data.mjs', 'scripts/test-data.db.mjs',
                 'scripts/test-manifest.mjs', 'scripts/fixtures/test-atlas.mjs', 'scripts/.env.test',
                 'content/english-six/resource.json', 'content/toefl-listening/audio.mp3', 'content/media/audio.mp3',
                 'content/snapshot.db', 'content/snapshot.dump.enc', 'content/archive.tar.gz.enc',
                 'content/manifest.json.enc', 'content/grade6-bank/backup-manifest.json',
                 'content/grade6-bank/private/manifest.json', 'content/questions/static.png.enc', 'src/other.json.enc',
                 'content/grade6-bank/sealed/private/snapshot.dump.enc',
                 'content/chinese-six/sealed/pages/archive.tar.gz.enc',
                 'src/receipt.json', 'src/BUILD_ID', 'public/release-metadata.json'):
    assert not helper.duplicate_allowed(Path(relative)), relative
checks.append('duplicate-exclusions-cover-independent-media-databases-archives-config-and-metadata-even-when-encrypted')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); live, releases, backups, protected, older, _ = fixture(root)
    matched = Path('scripts/test-atlas.mjs')
    changed = Path('scripts/check-figures.mjs')
    for folder in (live, protected, older):
        write(folder / matched, 'synthetic test code\n' * 1000)
        write(folder / changed, 'old' if folder == older else 'new')
        write(folder / 'scripts/migrate-data.mjs', 'synthetic migration')
    plans, _ = helper.duplicate_plan(live, releases, live.stat().st_dev)
    assert [p['paths'][0] for p in plans if p['paths'][0].parent == older / 'scripts'] == [older / matched]
    retained = [snapshot(live), snapshot(protected)]
    with patch.object(helper, 'assert_inactive'):
        result = helper.prune_duplicates(live, releases, backups, live.stat().st_dev,
                                         lambda: 0 if (older / matched).exists() else 4096, 4096)
    assert result['duplicateFilesRemoved'] == 1 and not (older / matched).exists()
    assert (older / changed).is_file() and (older / 'scripts/migrate-data.mjs').is_file()
    assert [snapshot(live), snapshot(protected)] == retained
    checks.append('only-third-byte-identical-verification-script-is-reclaimed')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); live, releases, backups, protected, older, receipts = fixture(root)
    for directory in (live, protected, older):
        write(directory / 'content/grade6-bank/sealed/private/000-matched.png.enc', 'identical encrypted static lesson bytes\n' * 1000)
        write(directory / 'content/unique.txt', 'same size, different bytes' if directory == protected else 'a different old lesson!!!')
    old_before, live_before, protected_before = snapshot(older), snapshot(live), snapshot(protected)
    with patch.object(helper, 'assert_inactive'):
        try:
            helper.prune_duplicates(live, releases, backups, live.stat().st_dev, lambda: 0, 1024**3)
        except helper.SpaceError:
            assert snapshot(older) == old_before and snapshot(live) == live_before and snapshot(protected) == protected_before
        else:
            raise AssertionError('Insufficient duplicate preflight capacity caused partial deletion')
    target_file = older / 'content/grade6-bank/sealed/private/000-matched.png.enc'
    available = lambda: 4096 if not target_file.exists() else 0
    with patch.object(helper, 'assert_inactive'):
        result = helper.prune_duplicates(live, releases, backups, live.stat().st_dev, available, 4096)
    assert result['duplicateFilesRemoved'] == 1 and not target_file.exists()
    assert snapshot(live) == live_before and snapshot(protected) == protected_before
    assert (older / 'src/source.ts').exists() and (older / 'content/unique.txt').exists()
    checks.append('insufficient-duplicate-capacity-removes-nothing-and-sufficient-capacity-stops-after-actual-space-is-recovered')
    checks.append('only-older-triple-verified-duplicate-is-unlinked-with-live-and-latest-copy-bytes-unchanged')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); live, releases, backups, protected, older, receipts = fixture(root)
    for directory in (live, protected, older):
        write(directory / 'content/000-largest.json', 'same verified lesson\n' * 1000)
    older_before, protected_before = snapshot(older), snapshot(protected)
    original_inspect = helper.inspect_duplicate
    def changed_retained(paths, device, expected=None, remove=False):
        if remove:
            (live / 'content/000-largest.json').write_text('legitimate later edit')
        return original_inspect(paths, device, expected=expected, remove=remove)
    with patch.object(helper, 'assert_inactive'), patch.object(helper, 'inspect_duplicate', side_effect=changed_retained):
        try:
            helper.prune_duplicates(live, releases, backups, live.stat().st_dev, lambda: 0, 4096)
        except helper.SpaceError:
            assert snapshot(older) == older_before and snapshot(protected) == protected_before
            assert (live / 'content/000-largest.json').read_text() == 'legitimate later edit'
        else:
            raise AssertionError('Changed retained copy allowed the older file to be removed')
    checks.append('retained-inode-metadata-and-content-are-rechecked-immediately-before-older-duplicate-unlink')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); live, releases, backups, protected, older, receipts = fixture(root)
    relative = Path('public/listening/001.mp3')
    for directory in (live, protected, older):
        write(directory / relative, 'synthetic identical listening audio\n' * 2000)
    live_before, protected_before = snapshot(live), snapshot(protected)
    available = lambda: 4096 if not (older / relative).exists() else 0
    with patch.object(helper, 'assert_inactive'):
        result = helper.prune_duplicates(live, releases, backups, live.stat().st_dev, available, 4096)
    assert result['duplicateFilesRemoved'] == 1 and not (older / relative).exists()
    assert snapshot(live) == live_before and snapshot(protected) == protected_before
    checks.append('obsolete-third-listening-copy-only-removed-with-two-independent-real-media-originals-unchanged')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); live, releases, backups, protected, older, receipts = fixture(root)
    relative = Path('public/listening/sound.mp3')
    linked = root / 'canonical-listening'
    (live / 'public/listening').rename(linked)
    (live / 'public/listening').symlink_to(linked, target_is_directory=True)
    before = snapshot(root)
    plans, _ = helper.duplicate_plan(live, releases, live.stat().st_dev)
    assert not any(plan['paths'][0] == older / relative for plan in plans)
    assert snapshot(root) == before
    checks.append('symlinked-canonical-listening-storage-cannot-qualify-an-obsolete-copy-for-removal')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); live, releases, backups, protected, older, _ = fixture(root)
    earlier = releases / helper.EARLIER_DUPLICATES
    write(earlier / '.next/BUILD_ID', 'earlier-build')
    receipt_id = earlier.name.removeprefix('previous-')
    receipt = backups / ('before-main-' + receipt_id) / 'receipt.json'
    record = {'status': 'deployed', 'commit': receipt_id.split('-')[0],
              'previousDirectory': str(earlier), 'oldBuildId': 'earlier-build'}
    write(receipt, json.dumps(record)); receipt.chmod(0o600)
    relative = Path('src/earlier-only.ts')
    for directory in (live, protected, earlier):
        write(directory / relative, 'identical fixture' * 1300)
    write(earlier / 'src/unique.ts', 'retain this older revision')
    write(earlier / 'node_modules/keep', 'outside duplicate-file scope')
    primary, _ = helper.duplicate_plan(live, releases, live.stat().st_dev)
    candidates = {plan['paths'][0]: plan['allocated'] for plan in primary}
    initial_capacity = sum(candidates.values())
    candidates[earlier / relative] = (earlier / relative).stat().st_blocks * 512
    def available():
        return sum(size for path, size in candidates.items() if not path.exists())
    def prune(target, apply=True):
        return helper.prune_duplicates(live, releases, backups, live.stat().st_dev, available, target, apply=apply)
    live_before, protected_before = snapshot(live), snapshot(protected)
    with patch.object(helper, 'assert_inactive'):
        write(receipt, json.dumps({**record, 'oldBuildId': 'unexpected'}))
        assert prune(initial_capacity, apply=False)['duplicateCandidates'] == len(primary)
        expect_rejected(lambda: prune(initial_capacity + 1), root)
        write(receipt, json.dumps(record))
        expect_rejected(lambda: prune(sum(candidates.values()) + 1), root)
        assert prune(initial_capacity + 1)['duplicateFilesRemoved'] == len(candidates)
    assert snapshot(live) == live_before and snapshot(protected) == protected_before
    assert (earlier / 'src/unique.ts').is_file() and (earlier / 'node_modules/keep').is_file()
    checks.append('secondary-rollback-only-when-needed-with-receipt-intact-and-sufficient-combined-triple-verified-bytes')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); live, releases, backups, protected, older, _ = fixture(root)
    catalogue = Path('content/grade6-bank/manifest.json')
    for version in (live, protected, older):
        write(version / catalogue, '{"version":1,"collections":[]}')
        (version / 'src/routes/old/nested').mkdir(parents=True)
        (version / 'src/.data/preserved').mkdir(parents=True)
        (version / 'src/uploads/preserved').mkdir(parents=True)
    (older / 'src/redirect').symlink_to(root / 'outside', target_is_directory=True)
    write(older / 'src/unique/old.ts', 'a different release')
    (older / 'public/empty').mkdir()
    device = live.stat().st_dev
    plans, _ = helper.duplicate_plan(live, releases, device)
    assert older / catalogue in [candidate['paths'][0] for candidate in plans]
    dirs = helper.empty_source_directories(older, device)
    assert [row[0] for row in dirs] == [older / 'src/routes/old/nested', older / 'src/routes/old', older / 'src/routes']
    # tmpfs can allocate zero blocks for an empty directory. Model ext4 blocks here.
    dirs = [(path, signature, 4096) for path, signature, _ in dirs]
    allocations = {row['paths'][0]: row['allocated'] for row in plans}
    allocations.update({path: size for path, _, size in dirs})
    free = lambda: sum(size for path, size in allocations.items() if not path.exists())
    total = sum(allocations.values())
    retained = [snapshot(live), snapshot(protected), snapshot(root / 'outside')]
    with patch.object(helper, 'assert_inactive'), patch.object(helper, 'empty_source_directories', return_value=dirs):
        expect_rejected(lambda: helper.prune_duplicates(live, releases, backups, device, free, total + 1), root)
        before = snapshot(root)
        assert helper.prune_duplicates(live, releases, backups, device, free, total, apply=False)['emptySourceDirectories'] == 3
        assert snapshot(root) == before
        result = helper.prune_duplicates(live, releases, backups, device, free, total)
    assert result['emptyDirectoriesRemoved'] == 3 and not (older / catalogue).exists()
    assert retained == [snapshot(live), snapshot(protected), snapshot(root / 'outside')]
    for name in ('src', 'src/.data/preserved', 'src/uploads/preserved', 'src/redirect', 'src/unique/old.ts', 'public/empty'):
        assert (older / name).exists()
    checks.append('only-already-empty-historical-source-branches-and-third-course-catalogue-reclaimed-after-full-capacity-proof')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); live, releases, backups, protected, older, _ = fixture(root)
    device = live.stat().st_dev
    candidate = older / 'src/was-empty'
    candidate.mkdir()
    [(path, signature, _)] = helper.empty_source_directories(older, device)
    write(candidate / 'arrived.ts', 'keep new contents')
    with patch.object(helper, 'assert_inactive'), patch.object(helper, 'duplicate_plan', return_value=([], 0)), \
         patch.object(helper, 'empty_source_directories', return_value=[(path, signature, 4096)]):
        expect_rejected(lambda: helper.prune_duplicates(live, releases, backups, device, lambda: 0, 4096), root)
    checks.append('directory-that-becomes-nonempty-after-planning-cannot-be-removed')

print(json.dumps({'passed': True, 'checks': checks, 'productionWrites': 0, 'networkCalls': 0}))
