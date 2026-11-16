"""Synthetic-only tests; no production paths or network calls."""
import importlib.util
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('compact_fixture', Path(__file__).with_name('compact-extension-rollback.py'))
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
code = Path(helper.__file__).read_text()
checks = []


def fixture(root, name):
    source = root / name; source.mkdir()
    (source / '.next').mkdir(); (source / '.next/BUILD_ID').write_text('synthetic-build')
    (source / '.env.fixture').write_text('synthetic fixture only'); (source / '.env.fixture').chmod(0o600)
    (source / '资料.txt').write_text('synthetic learning bytes\n' * 20)
    (source / 'linked-data').symlink_to('/synthetic/external/data')
    (source / 'internal').symlink_to('资料.txt')
    (source / 'empty').mkdir()
    os.setxattr(source / '资料.txt', 'user.fixture', b'kept\0\xff')
    os.setxattr(source, 'user.root-fixture', b'root metadata')
    os.link(source / '资料.txt', source / 'hardcopy')
    return source


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    source = fixture(root, 'old-rollback'); before = helper.snapshot(source)
    destination = root / 'private-archive'
    result = helper.compact(source, destination, code)
    assert result['restorationVerified'] and source.is_symlink()
    assert source.readlink() == destination / 'RESTORE_REQUIRED.txt'
    import json
    manifest = json.loads((destination / 'manifest.json').read_text())
    assert manifest['files'] == before
    helper.verify_archive(destination, manifest)
    assert (destination / 'restore.py').read_text() == code
    checks.append('full-restoration-hashes-modes-owners-mtimes-links-xattrs-preserved')
    assert not (root / '.compacting-old-rollback').exists()
    checks.append('only-verified-duplicate-released')
    updated = helper.recompress_retained(destination, manifest, code)
    assert updated['archiveFile'] == 'archive.tar.xz'
    assert updated['files'] == before
    assert (destination / 'archive.tar.xz').is_file() and not (destination / 'archive.tar.gz').exists()
    helper.verify_archive(destination, updated)
    assert helper.recompress_retained(destination, updated, code) == updated
    restored = root / 'full-restore'; restored.mkdir(mode=0o700)
    helper.extract_archive(destination / 'archive.tar.xz', restored)
    assert helper.snapshot(restored) == before
    checks.append('xz-replacement-verified-before-old-generated-archive-release')
    checks.append('xz-restore-preserves-all-file-metadata-and-hardlinks-without-external-xz')

    failure_source = fixture(root, 'recompress-failure')
    failure_destination = root / 'recompress-failure-archive'
    helper.compact(failure_source, failure_destination, code)
    failure_manifest = json.loads((failure_destination / 'manifest.json').read_text())
    original_archive_sha = helper.digest(failure_destination / 'archive.tar.gz')
    try:
        with patch.object(helper, 'verify_archive', side_effect=ValueError('synthetic replacement corruption')):
            helper.recompress_retained(failure_destination, failure_manifest, code)
    except ValueError:
        assert helper.digest(failure_destination / 'archive.tar.gz') == original_archive_sha
        assert json.loads((failure_destination / 'manifest.json').read_text()) == failure_manifest
        assert not (failure_destination / 'archive.tar.xz.pending').exists()
    else:
        raise AssertionError('unverified replacement accepted')
    checks.append('failed-recompression-keeps-original-verified-backup-usable')


    source = fixture(root, 'verification-failure'); before = helper.snapshot(source)
    try:
        with patch.object(helper, 'verify_archive', side_effect=ValueError('synthetic corruption')):
            helper.compact(source, root / 'failed-archive', code)
    except ValueError:
        assert source.is_dir() and not source.is_symlink() and helper.snapshot(source) == before
    else:
        raise AssertionError('verification failure accepted')
    checks.append('corrupt-archive-retains-entire-original')

    source = fixture(root, 'concurrent-change')
    original_verify = helper.verify_archive
    def changed(folder, manifest):
        original_verify(folder, manifest)
        (source / '资料.txt').write_text('legitimate later update')
    try:
        with patch.object(helper, 'verify_archive', side_effect=changed):
            helper.compact(source, root / 'changed-archive', code)
    except ValueError:
        assert source.is_dir() and not source.is_symlink()
        assert (source / '资料.txt').read_text() == 'legitimate later update'
    else:
        raise AssertionError('changed source accepted')
    checks.append('concurrent-change-retains-both-copies')

    source = fixture(root, 'pointer-failure'); before = helper.snapshot(source)
    try:
        original_symlink = Path.symlink_to
        def pointer_failure(path, target, *args, **kwargs):
            if path == source:
                raise OSError('synthetic pointer failure')
            return original_symlink(path, target, *args, **kwargs)
        with patch.object(Path, 'symlink_to', pointer_failure):
            helper.compact(source, root / 'pointer-archive', code)
    except OSError:
        assert source.is_dir() and helper.snapshot(source) == before
    else:
        raise AssertionError('pointer failure accepted')
    checks.append('pointer-failure-restores-original-path')

    source = fixture(root, 'low-space'); before = helper.snapshot(source)
    try:
        with patch.object(helper.shutil, 'disk_usage', return_value=SimpleNamespace(free=1024)):
            helper.compact(source, root / 'low-space-archive', code)
    except ValueError:
        assert helper.snapshot(source) == before and not (root / 'low-space-archive').exists()
    else:
        raise AssertionError('low space accepted')
    checks.append('insufficient-scratch-keeps-original')

    source = fixture(root, 'retry-partial'); before = helper.snapshot(source)
    destination = root / 'partial-archive'; destination.mkdir(mode=0o700)
    partial = destination / 'archive.tar.gz'; partial.write_bytes(b'incomplete generated gzip'); partial.chmod(0o600)
    helper.compact(source, destination, code)
    assert source.is_symlink() and json.loads((destination / 'manifest.json').read_text())['files'] == before
    checks.append('only-unverified-generated-partial-is-rebuilt-with-original-intact')

    source = fixture(root, 'streaming-verification')
    (source / 'large-plain-file').write_bytes(b'complete decompressed content\n' * 150000)
    before = helper.snapshot(source)
    destination = root / 'streaming-archive'
    # Reproduce a verification failure after metadata was written, before
    # any rename, then resume that exact archive with the source unchanged.
    with patch.object(helper, 'verify_archive', side_effect=ValueError('synthetic insufficient scratch')):
        try:
            helper.compact(source, destination, code)
        except ValueError:
            assert helper.snapshot(source) == before
        else:
            raise AssertionError('failed verification should preserve source')
    archive_sha = helper.digest(destination / 'archive.tar.gz')
    with patch.object(helper.shutil, 'disk_usage', return_value=SimpleNamespace(free=512 * 1024**2 + 65536)):
        helper.compact(source, destination, code)
    assert source.is_symlink() and helper.digest(destination / 'archive.tar.gz') == archive_sha
    manifest = json.loads((destination / 'manifest.json').read_text())
    restored = root / 'streaming-restored'; restored.mkdir(mode=0o700)
    helper.extract_archive(destination / 'archive.tar.gz', restored)
    assert helper.snapshot(restored) == before
    checks.append('large-plain-file-fully-verified-without-file-sized-scratch-and-restored-exactly')
    checks.append('failed-verification-resumes-same-archive-only-with-identical-intact-source')
    altered = {**manifest, 'files': {name: dict(row) for name, row in manifest['files'].items()}}
    altered['files']['large-plain-file']['sha256'] = '0' * 64
    try:
        helper.verify_archive(destination, altered)
    except ValueError:
        checks.append('streaming-verification-rejects-wrong-decompressed-content-hash')
    else:
        raise AssertionError('decompressed content mismatch accepted')

    source = fixture(root, 'pending-changed-source')
    destination = root / 'pending-changed-archive'
    with patch.object(helper, 'verify_archive', side_effect=ValueError('synthetic verification interruption')):
        try:
            helper.compact(source, destination, code)
        except ValueError:
            pass
    (source / '资料.txt').write_text('a later legitimate update')
    changed = helper.snapshot(source)
    try:
        helper.compact(source, destination, code)
    except ValueError:
        assert helper.snapshot(source) == changed and not source.is_symlink()
        checks.append('pending-archive-retry-refuses-changed-source-and-retains-both')
    else:
        raise AssertionError('changed pending source accepted')

    link = root / 'linked-parent'; link.symlink_to(root, target_is_directory=True)
    try:
        helper.no_links(link / 'child')
    except ValueError:
        checks.append('symbolic-link-parent-rejected')
    else:
        raise AssertionError('linked parent accepted')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); releases = root / 'releases'; releases.mkdir()
    backups = root / 'backups'; backups.mkdir()
    identity = helper.ASTRA_PROTECTED[0]
    protected = fixture(releases, identity)
    receipt_folder = backups / ('before-main-' + identity.removeprefix('previous-')); receipt_folder.mkdir()
    receipt_path = receipt_folder / 'receipt.json'
    receipt_path.write_text(json.dumps({'status': 'deployed', 'previousDirectory': str(protected), 'oldBuildId': 'synthetic-build'}))
    with patch.object(helper, 'RELEASES', releases), patch.object(helper, 'BACKUPS', backups):
        for free_values, expected in [
            ([6], []),
            ([3, 6], [helper.IDENTITY]),
            ([3, 3, 6], [helper.IDENTITY, helper.NEWER[0]]),
            ([3, 3, 4], [helper.IDENTITY, *helper.NEWER]),
        ]:
            with patch.object(helper, 'preserve_reviewed') as preserve, patch.object(helper.shutil, 'disk_usage', side_effect=[SimpleNamespace(free=n * 1024**3) for n in free_values]):
                helper.preserve_astra_rollbacks(code)
                assert [call.args[0] for call in preserve.call_args_list] == expected
                assert identity not in expected
        checks.append('astra-only-fixed-older-identities-until-five-gib-with-latest-rollback-protected')
        (protected / '.next/BUILD_ID').write_text('unexpected-build')
        with patch.object(helper, 'preserve_reviewed') as preserve, patch.object(helper.shutil, 'disk_usage', return_value=SimpleNamespace(free=3 * 1024**3)):
            try:
                helper.preserve_astra_rollbacks(code)
            except ValueError:
                preserve.assert_not_called()
            else:
                raise AssertionError('protected rollback identity mismatch accepted')
        (protected / '.next/BUILD_ID').write_text('synthetic-build')
        receipt_path.write_text(json.dumps({'status': 'rolled-back', 'previousDirectory': str(protected), 'oldBuildId': 'synthetic-build'}))
        with patch.object(helper, 'preserve_reviewed') as preserve, patch.object(helper.shutil, 'disk_usage', return_value=SimpleNamespace(free=3 * 1024**3)):
            try:
                helper.preserve_astra_rollbacks(code)
            except ValueError:
                preserve.assert_not_called()
            else:
                raise AssertionError('unsuccessful protected receipt accepted')
        checks.append('astra-requires-successful-receipt-and-protected-build-before-any-archive-write')
        receipt_path.unlink()
        before = helper.snapshot(protected)
        with patch.object(helper, 'preserve_reviewed') as preserve, patch.object(helper, 'reviewed_receipt', side_effect=AssertionError('Unneeded historical read')), patch.object(helper.shutil, 'disk_usage', return_value=SimpleNamespace(free=5 * 1024**3)):
            helper.preserve_astra_rollbacks(code)
            preserve.assert_not_called()
            assert helper.snapshot(protected) == before
        checks.append('sufficient-space-never-reads-or-modifies-historical-backups')
        with patch.object(helper, 'preserve_reviewed') as preserve, patch.object(helper.shutil, 'disk_usage', return_value=SimpleNamespace(free=3 * 1024**3)):
            try:
                helper.preserve_astra_rollbacks(code)
            except FileNotFoundError:
                preserve.assert_not_called()
            else:
                raise AssertionError('missing receipt accepted when archiving is needed')
        checks.append('insufficient-space-still-requires-the-original-receipt')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); releases = root / 'releases'; releases.mkdir()
    backups = root / 'backups'; backups.mkdir()
    protected = fixture(releases, helper.SHORT_CHOICES_PROTECTED)
    older = fixture(releases, helper.SHORT_CHOICES_ARCHIVE)
    archive_root = root / 'archives'; archive_root.mkdir(mode=0o700)
    receipts = {}
    for identity in (helper.SHORT_CHOICES_PROTECTED, helper.SHORT_CHOICES_ARCHIVE):
        folder = backups / ('before-main-' + identity.removeprefix('previous-')); folder.mkdir()
        receipts[identity] = folder / 'receipt.json'
        receipts[identity].write_text(json.dumps({'status': 'deployed', 'previousDirectory': str(releases / identity), 'oldBuildId': 'synthetic-build'}))
    protected_before = helper.snapshot(protected)
    older_before = helper.snapshot(older)
    with patch.object(helper, 'RELEASES', releases), patch.object(helper, 'BACKUPS', backups), patch.object(helper, 'ARCHIVE_ROOT', archive_root):
        with patch.object(helper, 'reviewed_receipt', side_effect=AssertionError('Unneeded historical read')), patch.object(helper.shutil, 'disk_usage', return_value=SimpleNamespace(free=5 * 1024**3)):
            helper.preserve_short_choices_rollback(code)
        assert helper.snapshot(protected) == protected_before and helper.snapshot(older) == older_before
        # Every failure must leave both original directories untouched.
        for identity, field, wrong_value in [
            (helper.SHORT_CHOICES_PROTECTED, 'status', 'rolled-back'),
            (helper.SHORT_CHOICES_PROTECTED, 'oldBuildId', 'wrong-build'),
            (helper.SHORT_CHOICES_PROTECTED, 'previousDirectory', '/wrong/path'),
            (helper.SHORT_CHOICES_ARCHIVE, 'status', 'rolled-back'),
            (helper.SHORT_CHOICES_ARCHIVE, 'oldBuildId', 'wrong-build'),
        ]:
            receipt = receipts[identity]; original = receipt.read_text()
            contents = json.loads(original); contents[field] = wrong_value; receipt.write_text(json.dumps(contents))
            with patch.object(helper.shutil, 'disk_usage', return_value=SimpleNamespace(free=3 * 1024**3)):
                try:
                    helper.preserve_short_choices_rollback(code)
                except ValueError:
                    assert helper.snapshot(protected) == protected_before and helper.snapshot(older) == older_before
                    assert not list(archive_root.iterdir())
                else:
                    raise AssertionError('mismatched short-choice rollout receipt accepted')
            receipt.write_text(original)
        with patch.object(helper.shutil, 'disk_usage', return_value=SimpleNamespace(free=3 * 1024**3)):
            helper.preserve_short_choices_rollback(code)
            assert older.is_symlink() and helper.snapshot(protected) == protected_before
            helper.preserve_short_choices_rollback(code)
            assert helper.snapshot(protected) == protected_before
        manifest = json.loads((archive_root / helper.SHORT_CHOICES_ARCHIVE / 'manifest.json').read_text())
        restored = root / 'restored'; restored.mkdir(mode=0o700)
        helper.extract_archive(archive_root / helper.SHORT_CHOICES_ARCHIVE / manifest['archiveFile'], restored)
        assert helper.snapshot(restored) == older_before
        assert list(archive_root.iterdir()) == [archive_root / helper.SHORT_CHOICES_ARCHIVE]
        checks.append('short-choices-keeps-newest-full-rollback-and-only-archives-exact-older-version')
        checks.append('short-choices-rejects-bad-protected-or-target-receipts-with-both-originals-intact')
        checks.append('short-choices-archive-restores-exactly-and-retry-is-idempotent')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); releases = root / 'releases'; releases.mkdir()
    backups = root / 'backups'; backups.mkdir()
    archive_root = root / 'extension'; archive_root.mkdir(mode=0o700)
    protected = fixture(releases, helper.VOCAB_PROTECTED)
    older = fixture(releases, helper.VOCAB_ARCHIVE)
    assert helper.VOCAB_PROTECTED == 'previous-37adda11b81ee4c73c90d931656c0f5d22902103-43653324834-1'
    assert helper.VOCAB_ARCHIVE == 'previous-ac22b62892a02aca54c136a5c702580500fea2cd-41871923456-1'
    assert helper.VOCAB_REQUIRED_FREE >= 5 * 1024**3 + 64 * 1024**2
    receipts = {}
    for identity in (helper.VOCAB_PROTECTED, helper.VOCAB_ARCHIVE):
        folder = backups / ('before-main-' + identity.removeprefix('previous-')); folder.mkdir()
        receipts[identity] = folder / 'receipt.json'
        receipts[identity].write_text(json.dumps({'status': 'deployed', 'previousDirectory': str(releases / identity), 'oldBuildId': 'synthetic-build'}))
    protected_before = helper.snapshot(protected); older_before = helper.snapshot(older)
    plans = [(root / 'legacy-a', {'fixture': 'a'}), (root / 'legacy-b', {'fixture': 'b'})]
    with patch.object(helper, 'RELEASES', releases), patch.object(helper, 'BACKUPS', backups), patch.object(helper, 'ARCHIVE_ROOT', archive_root):
        with patch.object(helper, 'reviewed_receipt', side_effect=AssertionError('Unneeded historical read')), \
                patch.object(helper, 'preflight_vocab_base_archives', side_effect=AssertionError('Unneeded archive preflight')), \
                patch.object(helper, 'preserve_reviewed') as preserve, \
                patch.object(helper, 'recompress_vocab_base') as recompress, \
                patch.object(helper.shutil, 'disk_usage', return_value=SimpleNamespace(free=helper.VOCAB_REQUIRED_FREE)):
            helper.preserve_vocab_rollbacks(code)
            preserve.assert_not_called(); recompress.assert_not_called()
        assert helper.snapshot(protected) == protected_before and helper.snapshot(older) == older_before
        checks.append('vocab-sufficient-space-does-not-read-or-change-historical-backups')

        # Both the newest intact rollback and the exact older candidate must
        # have a successful receipt and matching build before any archive write.
        for identity, field, wrong_value in [
            (helper.VOCAB_PROTECTED, 'status', 'rolled-back'),
            (helper.VOCAB_PROTECTED, 'oldBuildId', 'wrong-build'),
            (helper.VOCAB_PROTECTED, 'previousDirectory', '/wrong/path'),
            (helper.VOCAB_ARCHIVE, 'status', 'rolled-back'),
            (helper.VOCAB_ARCHIVE, 'oldBuildId', 'wrong-build'),
            (helper.VOCAB_ARCHIVE, 'previousDirectory', '/wrong/path'),
        ]:
            receipt = receipts[identity]; original = receipt.read_text()
            contents = json.loads(original); contents[field] = wrong_value; receipt.write_text(json.dumps(contents))
            with patch.object(helper.shutil, 'disk_usage', return_value=SimpleNamespace(free=3 * 1024**3)), \
                    patch.object(helper, 'preflight_vocab_base_archives') as preflight, \
                    patch.object(helper, 'preserve_reviewed') as preserve, \
                    patch.object(helper, 'recompress_vocab_base') as recompress:
                try:
                    helper.preserve_vocab_rollbacks(code)
                except ValueError:
                    preserve.assert_not_called(); recompress.assert_not_called(); preflight.assert_not_called()
                    assert helper.snapshot(protected) == protected_before and helper.snapshot(older) == older_before
                else:
                    raise AssertionError('Mismatched vocabulary rollout receipt accepted')
            receipt.write_text(original)
        checks.append('vocab-both-successful-receipts-and-builds-verified-before-preflight-or-write')

        for blocked in (protected, older):
            def check_inactive(source):
                if source == blocked:
                    raise ValueError('synthetic active rollback')
            with patch.object(helper.shutil, 'disk_usage', return_value=SimpleNamespace(free=3 * 1024**3)), \
                    patch.object(helper, 'inactive', side_effect=check_inactive), \
                    patch.object(helper, 'preflight_vocab_base_archives') as preflight, \
                    patch.object(helper, 'preserve_reviewed') as preserve, \
                    patch.object(helper, 'recompress_vocab_base') as recompress:
                try:
                    helper.preserve_vocab_rollbacks(code)
                except ValueError:
                    preserve.assert_not_called(); recompress.assert_not_called(); preflight.assert_not_called()
                else:
                    raise AssertionError('Active vocabulary rollback accepted')
        checks.append('vocab-requires-both-protected-and-target-rollbacks-inactive')

        with patch.object(helper.shutil, 'disk_usage', return_value=SimpleNamespace(free=3 * 1024**3)), \
                patch.object(helper, 'preflight_vocab_base_archives', side_effect=ValueError('synthetic incompatible legacy manifest')), \
                patch.object(helper, 'preserve_reviewed') as preserve, \
                patch.object(helper, 'recompress_vocab_base') as recompress:
            try:
                helper.preserve_vocab_rollbacks(code)
            except ValueError:
                preserve.assert_not_called(); recompress.assert_not_called()
                assert helper.snapshot(protected) == protected_before and helper.snapshot(older) == older_before
                assert not list(archive_root.iterdir())
            else:
                raise AssertionError('Legacy preflight failure allowed an archive mutation')
        checks.append('vocab-incompatible-base-archive-preflight-fails-before-any-mutation')

        # Disk capacity changes only when the synthetic operations complete;
        # this checks behavior without depending on how often usage is read.
        for reaches_after in (0, 1, 2):
            free = SimpleNamespace(value=3 * 1024**3)
            calls = []
            def preserve_exact(identity, source_code):
                assert identity == helper.VOCAB_ARCHIVE and source_code == code
                calls.append(('preserve', identity))
                free.value = helper.VOCAB_REQUIRED_FREE if reaches_after == 0 else 4 * 1024**3
            def recompress_exact(folder, manifest, source_code):
                assert source_code == code and (folder, manifest) in plans
                calls.append(('recompress', folder))
                count = sum(kind == 'recompress' for kind, _identity in calls)
                if count >= reaches_after:
                    free.value = helper.VOCAB_REQUIRED_FREE
            with patch.object(helper.shutil, 'disk_usage', side_effect=lambda _path: SimpleNamespace(free=free.value)), \
                    patch.object(helper, 'inactive') as check_inactive, \
                    patch.object(helper, 'preflight_vocab_base_archives', return_value=plans) as preflight, \
                    patch.object(helper, 'preserve_reviewed', side_effect=preserve_exact), \
                    patch.object(helper, 'recompress_vocab_base', side_effect=recompress_exact):
                helper.preserve_vocab_rollbacks(code)
                preflight.assert_called_once()
                assert set(call.args[0] for call in check_inactive.call_args_list) >= {protected, older}
                assert calls == [('preserve', helper.VOCAB_ARCHIVE)] + [('recompress', folder) for folder, _manifest in plans[:reaches_after]]
            assert helper.snapshot(protected) == protected_before and helper.snapshot(older) == older_before
        checks.append('vocab-only-exact-older-rollback-and-preflighted-base-archives-until-actual-capacity-suffices')

        with patch.object(helper.shutil, 'disk_usage', return_value=SimpleNamespace(free=3 * 1024**3)), \
                patch.object(helper, 'preflight_vocab_base_archives', return_value=[]), \
                patch.object(helper, 'preserve_reviewed') as preserve, \
                patch.object(helper, 'recompress_vocab_base') as recompress:
            try:
                helper.preserve_vocab_rollbacks(code)
            except ValueError:
                preserve.assert_called_once_with(helper.VOCAB_ARCHIVE, code)
                recompress.assert_not_called()
                assert helper.snapshot(protected) == protected_before
            else:
                raise AssertionError('Insufficient final root capacity accepted')
        checks.append('vocab-final-capacity-shortfall-fails-closed-with-newest-rollback-intact')

with tempfile.TemporaryDirectory() as directory:
    import copy
    root = Path(directory)
    source = fixture(root, 'vocab-base-source'); source_before = helper.snapshot(source)
    folder = root / 'vocab-base-archive'
    helper.compact(source, folder, code)
    original_manifest = json.loads((folder / 'manifest.json').read_text())
    assert helper.compatible_vocab_manifest(original_manifest)
    # Never infer timestamp units or tolerate bool-as-int metadata, missing
    # xattrs, unsafe paths, unknown entry kinds or ambiguous archive formats.
    incompatible = []
    for field, value in [('version', True), ('version', '1'), ('files', []), ('archiveSha256', 'invalid'), ('archiveFile', 'other.tar')]:
        altered = copy.deepcopy(original_manifest); altered[field] = value; incompatible.append(altered)
    for field, value in [('mtime', 1.5), ('mode', True), ('uid', -1), ('kind', 'socket'), ('xattrs', []), ('mode', 0o10000)]:
        altered = copy.deepcopy(original_manifest); altered['files']['.'][field] = value; incompatible.append(altered)
    altered = copy.deepcopy(original_manifest); altered['files']['.'].pop('xattrs'); incompatible.append(altered)
    altered = copy.deepcopy(original_manifest); altered['files']['../outside'] = altered['files'].pop('.'); incompatible.append(altered)
    altered = copy.deepcopy(original_manifest); altered['files']['/absolute'] = altered['files'].pop('.'); incompatible.append(altered)
    assert all(not helper.compatible_vocab_manifest(value) for value in incompatible)
    shape = helper.manifest_shape({'private-top-level-name': 'secret value', 'entries': [{'private-entry-name': 'secret bytes', 'mtime_ns': 1}]})
    assert 'private-top-level-name' not in json.dumps(shape) and 'private-entry-name' not in json.dumps(shape)
    assert 'secret' not in json.dumps(shape) and shape['recordContainerType'] == 'list'
    checks.append('vocab-legacy-schema-is-strict-and-schema-diagnostics-never-log-entry-names-or-values')

    names = ('restore.py', 'manifest.json', 'receipt.json', 'RESTORE_REQUIRED.txt')
    original_metadata = {name: helper.entry_record(folder / name) for name in names}
    original_bytes = {name: (folder / name).read_bytes() for name in names}
    original_gzip_sha = helper.digest(folder / 'archive.tar.gz')
    original_verify = helper.verify_archive
    verified = []
    def verify_before_release(candidate_folder, manifest):
        assert helper.digest(folder / 'archive.tar.gz') == original_gzip_sha
        verified.append(manifest.get('archiveFile', 'archive.tar.gz'))
        if manifest.get('archiveFile') == 'archive.tar.xz.pending':
            for name in names:
                assert (folder / (name + '.before-vocab')).read_bytes() == original_bytes[name]
        return original_verify(candidate_folder, manifest)
    with patch.object(helper, 'verify_archive', side_effect=verify_before_release):
        updated = helper.recompress_vocab_base(folder, original_manifest, code + '\n# synthetic helper update\n')
    assert verified == ['archive.tar.gz', 'archive.tar.xz.pending']
    assert updated['archiveFile'] == 'archive.tar.xz' and not (folder / 'archive.tar.gz').exists()
    for name in names:
        retained = folder / (name + '.before-vocab')
        assert retained.read_bytes() == original_bytes[name]
        assert helper.entry_record(retained) == original_metadata[name]
    assert (folder / 'restore.py').read_text() == code + '\n# synthetic helper update\n'
    helper.verify_archive(folder, updated)
    restored = root / 'vocab-base-restored'; restored.mkdir(mode=0o700)
    helper.extract_archive(folder / 'archive.tar.xz', restored)
    assert helper.snapshot(restored) == source_before
    retained_before = {name: (folder / (name + '.before-vocab')).read_bytes() for name in names}
    assert helper.recompress_vocab_base(folder, updated, code) == updated
    assert retained_before == {name: (folder / (name + '.before-vocab')).read_bytes() for name in names}
    checks.append('vocab-legacy-helper-manifest-receipt-instructions-retained-exactly-before-verified-xz-replacement')
    checks.append('vocab-base-recompression-restores-exactly-and-idempotent-xz-keeps-original-metadata')

    bad_source = fixture(root, 'vocab-base-bad-source')
    bad_folder = root / 'vocab-base-bad-archive'
    helper.compact(bad_source, bad_folder, code)
    bad_manifest = json.loads((bad_folder / 'manifest.json').read_text())
    bad_before = helper.snapshot(bad_folder)
    with patch.object(helper, 'verify_archive', side_effect=ValueError('synthetic original corruption')):
        try:
            helper.recompress_vocab_base(bad_folder, bad_manifest, code)
        except ValueError:
            assert helper.snapshot(bad_folder) == bad_before
            assert not any((bad_folder / (name + '.before-vocab')).exists() for name in names)
        else:
            raise AssertionError('Unverified legacy original allowed metadata mutation')
    checks.append('vocab-original-gzip-integrity-checked-before-any-metadata-retention-or-recompression')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); base = root / 'legacy-base'; base.mkdir(mode=0o700)
    commit = helper.VOCAB_BASE_COMMITS[0]
    folder = base / (commit + '-synthetic-build'); folder.mkdir(mode=0o700)
    legacy_manifest = {'entries': [{'private-file-name': 'synthetic fixture'}], 'archive_sha256': '0' * 64}
    for name, contents in [
        ('manifest.json', json.dumps(legacy_manifest)), ('receipt.json', '{}'),
        ('restore.py', '# original synthetic helper'), ('RESTORE_REQUIRED.txt', 'original synthetic instructions'),
    ]:
        (folder / name).write_text(contents); (folder / name).chmod(0o600)
    before = helper.snapshot(base)
    with patch.object(helper, 'BASE_ARCHIVE_ROOT', base), \
            patch.object(helper, 'preserve_reviewed') as preserve, \
            patch.object(helper, 'recompress_retained') as recompress, \
            patch.object(helper, 'retain_vocab_metadata') as retain:
        try:
            helper.preflight_vocab_base_archives()
        except ValueError:
            preserve.assert_not_called(); recompress.assert_not_called(); retain.assert_not_called()
            assert helper.snapshot(base) == before
        else:
            raise AssertionError('Initial incompatible legacy archive schema accepted')
    checks.append('vocab-real-base-preflight-rejects-unknown-first-schema-with-all-original-bytes-intact')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); base = root / 'compatible-legacy-base'; base.mkdir(mode=0o700)
    source = fixture(root, 'vocab-preflight-source')
    template = root / 'vocab-preflight-template'
    helper.compact(source, template, code)
    folders = []
    for commit in helper.VOCAB_BASE_COMMITS:
        folder = base / (commit + '-synthetic-build')
        helper.shutil.copytree(template, folder)
        manifest_path = folder / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        manifest['release'] = 'previous-' + commit + '-1-1'
        manifest_path.write_text(json.dumps(manifest))
        receipt_path = folder / 'receipt.json'
        receipt = json.loads(receipt_path.read_text()); receipt['release'] = manifest['release']
        receipt_path.write_text(json.dumps(receipt))
        folders.append(folder)
    before = helper.snapshot(base)
    with patch.object(helper, 'BASE_ARCHIVE_ROOT', base):
        plans = helper.preflight_vocab_base_archives()
    assert helper.snapshot(base) == before
    assert len(plans) == len(helper.VOCAB_BASE_COMMITS) and [folder for folder, _plan in plans] == folders
    for folder, marker in plans:
        assert set(marker) == {'verifiedManifestSha256'}, 'Preflight must not retain expanded entry maps'
        assert marker['verifiedManifestSha256'] == helper.digest(folder / 'manifest.json')
        assert 'files' not in marker and 'entries' not in marker
    checks.append('vocab-compatible-base-preflight-keeps-only-small-checksum-plans-without-changing-files')

    folder, marker = plans[0]
    manifest_path = folder / 'manifest.json'
    manifest_path.write_bytes(manifest_path.read_bytes() + b'\n')
    changed = helper.snapshot(base)
    with patch.object(helper, 'verify_archive') as verify, \
            patch.object(helper, 'retain_vocab_metadata') as retain, \
            patch.object(helper, 'recompress_retained') as recompress:
        try:
            helper.recompress_vocab_base(folder, marker, code)
        except ValueError:
            verify.assert_not_called(); retain.assert_not_called(); recompress.assert_not_called()
            assert helper.snapshot(base) == changed
            assert not any((folder / (name + '.before-vocab')).exists() for name in ('restore.py', 'manifest.json', 'receipt.json', 'RESTORE_REQUIRED.txt'))
        else:
            raise AssertionError('Manifest changed after preflight was allowed to mutate retained archives')
    checks.append('vocab-small-preflight-marker-rejects-later-manifest-changes-before-verification-or-mutation')

print(json.dumps({'passed': True, 'checks': checks, 'productionWrites': 0, 'networkCalls': 0}))
