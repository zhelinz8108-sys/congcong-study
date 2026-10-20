"""Verify rollback selection and data preservation using synthetic directories."""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('retained_archive', Path(__file__).with_name('archive-retained-release-20261020.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
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
    releases = root / 'releases'; releases.mkdir()
    data = root / 'data'; data.mkdir()
    app = root / 'active'; (app / '.next').mkdir(parents=True)
    (app / '.next/BUILD_ID').write_text('current-build')
    source = releases / ('previous-' + module.IDENTITY)
    (source / '.next').mkdir(parents=True)
    (source / '.next/BUILD_ID').write_text('old-build')
    (source / '.env.local').write_text('synthetic private setting')
    (source / '.env.local').chmod(0o600)
    (source / 'lesson.txt').write_text('synthetic rollback lesson')
    latest = releases / 'previous-latest'
    (latest / '.next').mkdir(parents=True)
    (latest / '.next/BUILD_ID').write_text('recent-build')
    backups = data / 'backups'; backups.mkdir()
    selected_dir = backups / ('before-main-' + module.IDENTITY); selected_dir.mkdir()
    selected = {'status': 'deployed', 'release': module.IDENTITY, 'previousDirectory': str(source), 'oldBuildId': 'old-build', 'newBuildId': 'recent-build', 'timestamp': '2026-10-15T00:00:00Z'}
    (selected_dir / 'receipt.json').write_text(json.dumps(selected))
    latest_dir = backups / 'before-main-latest'; latest_dir.mkdir()
    latest_receipt = {'status': 'deployed', 'release': 'latest', 'previousDirectory': str(latest), 'oldBuildId': 'recent-build', 'newBuildId': 'current-build', 'timestamp': '2026-10-19T00:00:00Z'}
    (latest_dir / 'receipt.json').write_text(json.dumps(latest_receipt))
    assert module.validate_release(releases, data, app)[0] == source
    checks.append('only-selected-older-successful-rollback-eligible')
    (app / '.next/BUILD_ID').write_text('unexpected-current-build')
    reject('current-build-mismatch-rejected', lambda: module.validate_release(releases, data, app))
    (app / '.next/BUILD_ID').write_text('current-build')
    (source / '.next/BUILD_ID').write_text('unexpected-old-build')
    reject('rollback-build-mismatch-rejected', lambda: module.validate_release(releases, data, app))
    (source / '.next/BUILD_ID').write_text('old-build')
    (latest_dir / 'receipt.json').unlink()
    reject('most-recent-rollback-must-remain-in-place', lambda: module.validate_release(releases, data, app))
    (latest_dir / 'receipt.json').write_text(json.dumps(latest_receipt))
    latest.rename(releases / 'latest-moved')
    latest.symlink_to(releases / 'latest-moved')
    reject('latest-rollback-symlink-rejected', lambda: module.validate_release(releases, data, app))
    latest.unlink(); (releases / 'latest-moved').rename(latest)
    before = module.helpers.tree(source)
    destination = data / 'retained-release-archives' / source.name
    destination.parent.mkdir(mode=0o700)
    # Filesystem identity and ownership checks are mandatory in production.
    # The shared copy/verify/recover routine can be exercised on one temporary disk.
    assert module.helpers.move_verified(source, destination, releases / ('.archiving-' + source.name), destination.parent / (source.name + '.json'), source.name) == 'archived-and-verified'
    assert module.helpers.tree(destination) == before
    assert (source / 'lesson.txt').read_text() == 'synthetic rollback lesson'
    assert (source / '.env.local').stat().st_mode & 0o777 == 0o600
    assert (latest / '.next/BUILD_ID').read_text() == 'recent-build'
    assert (app / '.next/BUILD_ID').read_text() == 'current-build'
    assert module.validate_release(releases, data, app)[1] == destination
    checks.append('all-files-permissions-original-path-current-and-latest-builds-preserved')
    assert module.helpers.move_verified(source, destination, releases / ('.archiving-' + source.name), destination.parent / (source.name + '.json'), source.name) == 'already-archived'
    checks.append('verified-relocation-retry-preserves-the-only-archive')
    process = root / 'synthetic-proc' / '123'; process.mkdir(parents=True)
    (process / 'cwd').symlink_to(destination)
    real_path = module.Path
    with patch.object(module, 'Path', side_effect=lambda value: root / 'synthetic-proc' if value == '/proc' else real_path(value)):
        reject('process-working-in-source-rejected', lambda: module.ensure_no_process_uses(source))

print(json.dumps({'status': 'passed', 'checks': checks, 'productionWrites': 0, 'networkCalls': 0}))
