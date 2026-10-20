"""Test fixed webpack-only cleanup using synthetic files, without server access."""
import importlib.util
import json
from pathlib import Path
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('prune_webpack', Path(__file__).with_name('prune-retained-webpack-20261020.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
checks = []


def reject(name, operation):
    try:
        operation()
    except (ValueError, OSError):
        checks.append(name)
    else:
        raise AssertionError(name)


with tempfile.TemporaryDirectory() as folder:
    base = Path(folder)
    releases = base / 'releases'; releases.mkdir()
    data = base / 'data'; data.mkdir(); (data / 'backups').mkdir()
    app = base / 'app'
    old_id = module.SELECTED[0]
    old = releases / ('previous-' + old_id)
    recent = releases / ('previous-' + module.LATEST)
    for root, build in ((app, 'current'), (recent, 'recent'), (old, 'old')):
        for name in module.RUNTIME_FILES:
            file = root / name; file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(build if name == '.next/BUILD_ID' else '{"synthetic":true}')
        (root / '.next/static').mkdir()
        (root / '.next/cache/webpack/client-production').mkdir(parents=True)
        (root / '.next/cache/webpack/client-production/0.pack').write_bytes(b'fixture webpack cache')
        (root / '.env.local').write_text('synthetic private setting')
        (root / 'lesson.txt').write_text('synthetic learning material')
    for identity, path, before, after, timestamp in ((old_id, old, 'old', 'recent', '2026-10-15T00:00:00Z'), (module.LATEST, recent, 'recent', 'current', '2026-10-20T00:00:00Z')):
        folder = data / 'backups' / ('before-main-' + identity); folder.mkdir()
        (folder / 'receipt.json').write_text(json.dumps({'status': 'deployed', 'release': identity, 'previousDirectory': str(path), 'oldBuildId': before, 'newBuildId': after, 'timestamp': timestamp}))
    def plan(ids=(old_id,)):
        with patch.object(module.helpers, 'ensure_inactive'), patch.object(module, 'no_process_uses'):
            return module.prepare(releases, data, app, ids)
    current, latest, targets = plan()
    assert current == 'current' and len(targets) == 1 and targets[0]['bytes'] > 0
    checks.append('only-selected-old-webpack-cache-eligible')
    reject('most-recent-rollback-not-eligible', lambda: plan((module.LATEST,)))
    reject('arbitrary-release-not-eligible', lambda: plan(('unselected',)))
    (app / '.next/BUILD_ID').write_text('changed')
    reject('current-build-mismatch-stops-cleanup', plan)
    (app / '.next/BUILD_ID').write_text('current')
    cache = old / '.next/cache/webpack'
    (cache / 'unexpected.txt').write_text('retain unexpected material')
    reject('non-webpack-content-retained', plan)
    assert (cache / 'unexpected.txt').read_text() == 'retain unexpected material'
    (cache / 'unexpected.txt').unlink()
    (cache / 'escape').symlink_to(app)
    reject('symlink-inside-cache-rejected', plan)
    (cache / 'escape').unlink()
    cache.rename(cache.with_name('saved'))
    cache.symlink_to(app / '.next/cache/webpack')
    reject('cache-root-symlink-rejected', plan)
    cache.unlink(); cache.with_name('saved').rename(cache)
    _, _, targets = plan()
    runtime = module.runtime_identity(old)
    module.prune_one(targets[0])
    assert not cache.exists()
    assert module.runtime_identity(old) == runtime
    assert (old / '.env.local').read_text() == 'synthetic private setting'
    assert (old / 'lesson.txt').read_text() == 'synthetic learning material'
    assert (app / '.next/cache/webpack/client-production/0.pack').exists()
    assert (recent / '.next/cache/webpack/client-production/0.pack').exists()
    assert module.runtime_identity(recent) == latest
    checks.append('only-old-build-packs-removed-all-runtime-materials-settings-current-and-latest-retained')
    _, _, targets = plan()
    assert targets[0]['bytes'] == 0
    module.prune_one(targets[0])
    checks.append('already-clean-cache-is-safe-to-retry')

print(json.dumps({'status': 'passed', 'checks': checks, 'productionWrites': 0, 'networkCalls': 0}))
