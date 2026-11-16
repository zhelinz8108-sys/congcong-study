"""Synthetic legacy archive compatibility tests; no network or production files."""
import base64
import copy
import gzip
import hashlib
import importlib.util
import json
import lzma
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('vocab_legacy_fixture', Path(__file__).with_name('compact-extension-rollback.py'))
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
code = Path(helper.__file__).read_text()
checks = []
ATIME = 1900000000123456789
MTIME = 1700000000987654321


def sha(contents):
    return hashlib.sha256(contents).hexdigest()


def metadata(path):
    info = path.lstat()
    return {'mode': stat.S_IMODE(info.st_mode), 'uid': info.st_uid, 'gid': info.st_gid,
            'atime': info.st_atime_ns, 'mtime': info.st_mtime_ns,
            'xattrs': {name: base64.b64encode(os.getxattr(path, name, follow_symlinks=False)).decode('ascii')
                       for name in os.listxattr(path, follow_symlinks=False)}}


def fixture(root, name):
    source = root / (name + '-source'); source.mkdir(mode=0o700)
    (source / 'nested').mkdir(mode=0o750)
    data = source / 'nested/data.txt'
    data.write_bytes(b'complete synthetic legacy file bytes\n' * 30000); data.chmod(0o640)
    os.link(data, source / 'alias.txt')
    (source / '.env.fixture').write_text('synthetic fixture only\n'); (source / '.env.fixture').chmod(0o600)
    (source / 'inside-link').symlink_to('nested/data.txt')
    (source / 'outside-link').symlink_to('/synthetic/external/maintained-data')
    os.setxattr(data, 'user.fixture', b'legacy\0\xff')
    os.setxattr(source / 'nested', 'user.directory', b'kept directory metadata')
    entries = [source, *sorted(source.rglob('*'))]
    # Future atimes remain stable on relatime filesystems while fixture hashes
    # are computed; GNU tar records nanoseconds explicitly with PAX headers.
    for path in entries:
        os.utime(path, ns=(ATIME, MTIME), follow_symlinks=False)
    rows = {}
    for path in entries:
        info = path.lstat(); details = metadata(path)
        kind = 'directory' if path.is_dir() and not path.is_symlink() else 'symlink' if path.is_symlink() else 'file'
        row = {'kind': kind, 'mode': details['mode'], 'uid': details['uid'], 'gid': details['gid'],
               'atimeNs': str(details['atime']), 'mtimeNs': str(details['mtime']), 'xattrs': details['xattrs']}
        if kind == 'file':
            row.update(size=info.st_size, sha256=sha(path.read_bytes()),
                       hardlinkGroup=['alias.txt', 'nested/data.txt'] if info.st_nlink > 1 else [])
        elif kind == 'symlink':
            row['target'] = os.readlink(path)
        rows[path.relative_to(source).as_posix()] = row
    manifest = {'version': 1, 'entries': rows}
    raw = json.dumps(manifest, ensure_ascii=False).encode()
    folder = root / name; folder.mkdir(mode=0o700)
    archive = folder / 'archive.tar.gz'
    subprocess.run(['tar', '--create', '--format=pax', '--numeric-owner', '--xattrs', '--acls', '--selinux',
                    '--atime-preserve=system', '-I', 'gzip -1', '--file', str(archive), '--directory', str(source), '.'],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    archive.chmod(0o600)
    receipt = {'version': 1, 'status': 'archived-and-verified', 'sourceBasename': source.name,
               'sourceIdentity': [source.stat().st_dev, source.stat().st_ino],
               'sourceMetadata': {'mode': 0o700, 'uid': os.getuid(), 'gid': os.getgid()},
               'archiveBytes': archive.stat().st_size, 'archiveSha256': helper.digest(archive), 'manifestSha256': sha(raw)}
    for filename, contents in [('manifest.json', raw), ('receipt.json', json.dumps(receipt).encode()),
                               ('restore.py', b'# original synthetic legacy restore helper\n'),
                               ('RESTORE_REQUIRED.txt', b'original synthetic legacy restore instructions\n')]:
        path = folder / filename; path.write_bytes(contents); path.chmod(0o700 if filename == 'restore.py' else 0o600)
        os.setxattr(path, 'user.retained-metadata', ('original-' + filename).encode())
        os.utime(path, ns=(ATIME, MTIME))
    return folder, manifest, receipt, raw


def assert_restored(target, modern):
    for name, expected in modern['files'].items():
        path = target / name; info = path.lstat(); details = metadata(path)
        assert details['mode'] == expected['mode'] and details['uid'] == expected['uid'] and details['gid'] == expected['gid']
        assert details['atime'] == expected['atime'] and details['mtime'] == expected['mtime']
        assert details['xattrs'] == expected['xattrs']
        if expected['kind'] == 'file':
            assert info.st_size == expected['size'] and sha(path.read_bytes()) == expected['sha256']
        elif expected['kind'] == 'link':
            assert os.readlink(path) == expected['link']
    assert (target / 'alias.txt').stat().st_ino == (target / 'nested/data.txt').stat().st_ino


def fixture_main(folder, arguments, restore_parent=None):
    """Exercise the real CLI branch as an unprivileged CI fixture owner.

    Only the two root-ownership policies are modeled for this private temporary
    parent; the real archive checks and extraction run without mocks.
    """
    original_require = helper.require
    def fixture_policy(condition, message):
        if message == 'Preserving file ownership requires root':
            assert folder.is_relative_to(Path(tempfile.gettempdir()))
            return
        if message == 'Restore parent must be private root-owned mode 0700':
            assert restore_parent is not None and restore_parent.stat().st_uid == os.geteuid()
            assert stat.S_IMODE(restore_parent.stat().st_mode) == 0o700
            return
        return original_require(condition, message)
    with patch.object(helper, '__file__', str(folder / 'restore.py')), patch.object(sys, 'argv', ['restore.py', *arguments]), \
            patch.object(helper, 'require', side_effect=fixture_policy):
        helper.main()


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    folder, legacy, receipt, raw = fixture(root, 'legacy-complete')
    before = helper.snapshot(folder)
    modern = helper.normalize_legacy_manifest(folder, legacy, receipt, raw)
    assert modern['legacySchema'] == 'entries-v1'
    assert modern['files']['nested/data.txt']['atime'] == ATIME
    assert modern['files']['nested/data.txt']['hardlinkGroup'] == ['alias.txt', 'nested/data.txt']
    assert helper.load_vocab_archive_manifest(folder) == modern
    stream = helper.verify_archive(folder, modern)
    assert {name: row for name, row in helper.snapshot(folder).items() if name != '.'} == {name: row for name, row in before.items() if name != '.'}
    with gzip.open(folder / 'archive.tar.gz', 'rb') as incoming:
        original_tar = incoming.read()
    assert stream == {'tarSha256': sha(original_tar), 'tarBytes': len(original_tar)}
    restored = root / 'legacy-restored'; restored.mkdir(mode=0o700)
    helper.extract_archive(folder / 'archive.tar.gz', restored)
    helper.verify_full_restoration(restored, modern)
    assert_restored(restored, modern)
    checks.append('known-legacy-schema-normalizes-and-complete-gzip-verification-restores-hardlinks-times-ownership-and-xattrs')

    names = ('restore.py', 'manifest.json', 'receipt.json', 'RESTORE_REQUIRED.txt')
    old_metadata = {name: metadata(folder / name) for name in names}
    old_bytes = {name: (folder / name).read_bytes() for name in names}
    gzip_before = (folder / 'archive.tar.gz').read_bytes()
    original_verify = helper.verify_archive
    observed = []
    def verify_replacement(candidate_folder, candidate):
        assert (folder / 'archive.tar.gz').read_bytes() == gzip_before
        result = original_verify(candidate_folder, candidate)
        if candidate.get('archiveFile') == 'archive.tar.xz.pending':
            observed.append('replacement verified before gzip release')
            assert result == stream and candidate['tarSha256'] == stream['tarSha256'] and candidate['tarBytes'] == stream['tarBytes']
            for name in names:
                saved = folder / (name + '.before-vocab')
                assert saved.read_bytes() == old_bytes[name] and metadata(saved) == old_metadata[name]
        return result
    with patch.object(helper, 'verify_archive', side_effect=verify_replacement):
        updated = helper.recompress_vocab_base(folder, modern, code)
    assert observed == ['replacement verified before gzip release']
    assert updated['archiveFile'] == 'archive.tar.xz' and not (folder / 'archive.tar.gz').exists()
    assert updated['tarSha256'] == sha(original_tar) and updated['tarBytes'] == len(original_tar)
    with lzma.open(folder / 'archive.tar.xz', 'rb') as incoming:
        assert incoming.read() == original_tar
    assert helper.load_vocab_archive_manifest(folder) == updated
    helper.verify_archive(folder, updated)
    restored = root / 'modern-restored'; restored.mkdir(mode=0o700)
    helper.extract_archive(folder / 'archive.tar.xz', restored)
    helper.verify_full_restoration(restored, updated)
    assert_restored(restored, updated)
    for name in names:
        assert (folder / (name + '.before-vocab')).read_bytes() == old_bytes[name]
        assert metadata(folder / (name + '.before-vocab')) == old_metadata[name]
    checks.append('legacy-recompression-keeps-exact-old-helper-manifest-receipt-instructions-and-xattrs-until-xz-stream-is-verified')

    for field, wrong in [('tarSha256', '0' * 64), ('tarBytes', updated['tarBytes'] + 1)]:
        wrong_manifest = copy.deepcopy(updated); wrong_manifest[field] = wrong
        try:
            helper.verify_archive(folder, wrong_manifest)
        except ValueError:
            assert (folder / 'archive.tar.xz').exists() and not (folder / '.verify').exists()
        else:
            raise AssertionError('Incorrect raw tar stream checksum/length accepted')
    checks.append('xz-verification-rejects-wrong-raw-tar-sha256-or-byte-count')

    fixture_main(folder, ['--verify'])
    cli_target = root / 'modern-cli-restored'
    fixture_main(folder, ['--restore', str(cli_target)], root)
    assert_restored(cli_target, updated)
    checks.append('real-verify-and-restore-cli-branches-load-modern-manifest-and-preserve-legacy-metadata')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    folder, legacy, receipt, raw = fixture(root, 'new-helper-old-manifest')
    (folder / 'restore.py').write_text(code)
    fixture_main(folder, ['--verify'])
    cli_target = root / 'legacy-cli-restored'
    fixture_main(folder, ['--restore', str(cli_target)], root)
    assert_restored(cli_target, helper.load_vocab_archive_manifest(folder))
    assert (folder / 'manifest.json').read_bytes() == raw
    checks.append('new-helper-with-still-legacy-manifest-supports-verification-and-full-restoration')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    folder, original, receipt, original_raw = fixture(root, 'malformed-legacy')
    mutations = [
        lambda value: value.update(version=True),
        lambda value: value.update(entries=[]),
        lambda value: value['entries']['nested/data.txt'].update(hardlinkGroup=[1, 2]),
        lambda value: value['entries']['nested/data.txt'].update(hardlinkGroup=['nested/data.txt', 'missing']),
        lambda value: value['entries']['nested/data.txt'].update(hardlinkGroup=['nested']),
        lambda value: value['entries']['nested/data.txt'].update(hardlinkGroup=['nested/data.txt']),
        lambda value: value['entries']['alias.txt'].update(mode=0o600),
        lambda value: value['entries']['alias.txt'].update(mtimeNs=str(MTIME + 1)),
        lambda value: value['entries']['alias.txt'].update(sha256='0' * 64),
        lambda value: value['entries']['alias.txt'].update(xattrs={'user.changed': base64.b64encode(b'other').decode()}),
        lambda value: value['entries']['.'].update(atimeNs=[ATIME]),
        lambda value: value['entries']['.'].update(mtimeNs='1e9'),
        lambda value: value['entries']['.'].update(mode=True),
        lambda value: value['entries']['.'].update(kind='socket'),
        lambda value: value['entries']['.'].update(xattrs={'user.bad': 'not base64!'}),
        lambda value: value['entries'].update({'../outside': value['entries'].pop('.')}),
        lambda value: value['entries'].update({'/absolute': value['entries'].pop('.')}),
    ]
    for mutate in mutations:
        malformed = copy.deepcopy(original); mutate(malformed)
        raw = json.dumps(malformed).encode(); matching_receipt = {**receipt, 'manifestSha256': sha(raw)}
        before = helper.snapshot(folder)
        with patch.object(helper, 'verify_archive', side_effect=AssertionError('Must reject schema before verification')), \
                patch.object(helper, 'retain_vocab_metadata', side_effect=AssertionError('Must reject schema before mutation')), \
                patch.object(helper, 'recompress_retained', side_effect=AssertionError('Must reject schema before compression')):
            try:
                helper.normalize_legacy_manifest(folder, malformed, matching_receipt, raw)
            except ValueError:
                assert helper.snapshot(folder) == before
            else:
                raise AssertionError('Malformed legacy structure accepted')
    checks.append('unknown-path-types-integer-hardlink-groups-asymmetry-metadata-mismatch-and-invalid-times-are-rejected-without-writes')
    for field, wrong in [('manifestSha256', '0' * 64), ('archiveBytes', receipt['archiveBytes'] + 1), ('archiveSha256', '0' * 64)]:
        altered = {**receipt, field: wrong}
        before = helper.snapshot(folder)
        with patch.object(Path, 'mkdir', side_effect=AssertionError('Integrity rejection must precede temporary writes')):
            try:
                modern = helper.normalize_legacy_manifest(folder, original, altered, original_raw)
                helper.verify_archive(folder, modern)
            except ValueError:
                assert helper.snapshot(folder) == before
            else:
                raise AssertionError('Incorrect archive/manifest receipt hash or byte count accepted')
    checks.append('wrong-original-gzip-hash-size-or-manifest-hash-fails-before-any-filesystem-write')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    folder, legacy, receipt, raw = fixture(root, 'concurrent-gzip-change')
    modern = helper.load_vocab_archive_manifest(folder)
    original_verify = helper.verify_archive
    original = (folder / 'archive.tar.gz').read_bytes()
    names = ('restore.py', 'manifest.json', 'receipt.json', 'RESTORE_REQUIRED.txt')
    original_metadata = {name: ((folder / name).read_bytes(), metadata(folder / name)) for name in names}
    changed = original + b'legitimate concurrent archive change'
    def change_original_after_verify(candidate_folder, candidate):
        result = original_verify(candidate_folder, candidate)
        if candidate.get('archiveFile') == 'archive.tar.xz.pending':
            (folder / 'archive.tar.gz').write_bytes(changed)
        return result
    with patch.object(helper, 'verify_archive', side_effect=change_original_after_verify):
        try:
            helper.recompress_vocab_base(folder, modern, code)
        except ValueError:
            assert (folder / 'archive.tar.gz').read_bytes() == changed
            for name in names:
                assert ((folder / name).read_bytes(), metadata(folder / name)) == original_metadata[name]
            assert not (folder / 'archive.tar.xz.pending').exists()
            assert (folder / 'archive.tar.xz').is_file()
            recovered = {**modern, 'archiveFile': 'archive.tar.xz',
                         'archiveSha256': helper.digest(folder / 'archive.tar.xz')}
            original_verify(folder, recovered)
        else:
            raise AssertionError('Concurrently changed original gzip was released')
    checks.append('concurrent-gzip-change-retains-the-changed-original-and-verified-xz-with-current-metadata-untouched')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    folder, legacy, receipt, raw = fixture(root, 'final-gzip-release-change')
    modern = helper.load_vocab_archive_manifest(folder)
    original_replace = helper.replace_private
    original = (folder / 'archive.tar.gz').read_bytes()
    changed = original + b'concurrent change after metadata installation'
    def change_original_after_metadata(target, contents, mode=0o600):
        result = original_replace(target, contents, mode)
        if target == folder / 'receipt.json':
            (folder / 'archive.tar.gz').write_bytes(changed)
        return result
    with patch.object(helper, 'replace_private', side_effect=change_original_after_metadata):
        try:
            helper.recompress_vocab_base(folder, modern, code)
        except ValueError:
            assert (folder / 'archive.tar.gz').read_bytes() == changed
            current = helper.load_vocab_archive_manifest(folder)
            assert current['archiveFile'] == 'archive.tar.xz'
            helper.verify_archive(folder, current)
            assert (folder / 'manifest.json.before-vocab').read_bytes() == raw
        else:
            raise AssertionError('Original gzip changed immediately before release was deleted')
    checks.append('final-unlink-guard-retains-concurrently-changed-gzip-and-the-verified-modern-replacement')

print(json.dumps({'passed': True, 'checks': checks, 'productionWrites': 0, 'networkCalls': 0}))
