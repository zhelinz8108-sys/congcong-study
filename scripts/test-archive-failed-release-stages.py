"""Use only synthetic files to test verified relocation and rejection paths."""
import importlib.util
import json
from pathlib import Path
import tempfile
from unittest.mock import patch

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
    releases.mkdir(); archives.mkdir()
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
    reject('environment-files-never-relocated', lambda: helper.relocate(releases, archives, identity))
    assert (source / '.env.local').is_file() and not (archives / identity).exists()
    (source / '.env.local').unlink()
    (source / '.next').mkdir()
    reject('built-or-running-release-never-relocated', lambda: helper.relocate(releases, archives, identity))
    (source / '.next').rmdir()
    (source / 'external').symlink_to(root / 'outside')
    reject('source-symlink-rejected', lambda: helper.relocate(releases, archives, identity))
    (source / 'external').unlink()
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
    cache = root / 'download-cache'; cache.mkdir()
    (cache / 'blob').write_text('synthetic npm package bytes')
    cache_target = root / 'cache-on-data'
    assert helper.move_verified(cache, cache_target, root / 'pending-cache', root / 'cache-receipt.json', 'ubuntu-npm-cacache', mutable=True) == 'archived-and-verified'
    (cache_target / 'new-download').write_text('legitimate later cache write')
    assert helper.move_verified(cache, cache_target, root / 'pending-cache', root / 'cache-receipt.json', 'ubuntu-npm-cacache', mutable=True) == 'already-on-data-disk'
    assert (cache / 'new-download').read_text() == 'legitimate later cache write'
    checks.append('download-cache-remains-writable-through-original-path')
print(json.dumps({'status': 'pass', 'checks': checks, 'productionWrites': 0, 'networkCalls': 0}))
