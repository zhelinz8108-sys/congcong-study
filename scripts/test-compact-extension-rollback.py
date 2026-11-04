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
    os.setxattr(source / '资料.txt', 'user.fixture', b'kept')
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
        with patch.object(Path, 'symlink_to', side_effect=OSError('synthetic pointer failure')):
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

    link = root / 'linked-parent'; link.symlink_to(root, target_is_directory=True)
    try:
        helper.no_links(link / 'child')
    except ValueError:
        checks.append('symbolic-link-parent-rejected')
    else:
        raise AssertionError('linked parent accepted')

print(json.dumps({'passed': True, 'checks': checks, 'productionWrites': 0, 'networkCalls': 0}))
