"""Remove only reproducible webpack packs from selected inactive older releases."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import urllib.request

if 'helpers' not in globals():
    spec = importlib.util.spec_from_file_location('archive_helpers', Path(__file__).with_name('archive-failed-release-stages.py'))
    helpers = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helpers)

LATEST = '583e90daf9220c1f7b2859ccd3cec808659cb240-39372078101-1'
SELECTED = (
    '062fb81fcbc09f1af719e297991e0e2760045e6d-38992301286-1',
    '7540ccd7cee2d07796cce61318e79d1d1be9e923-39011402024-1',
    '4965b74cab6699ed5cd84a9f1d22c7636a35ddb4-39036014429-1',
    'ebcd96e84e7cbd2fe1f5722b30b4ba398e21ce38-39207265508-1',
    '668e048befdfe29b9b7fd2d89cdb43f4145bfd3a-39367563526-1',
    'd8e3459dcb31ce3fcdd56a7e934831d7d982fb20-39371102342-1',
)
RELEASES = Path('/www/study-plan-releases')
DATA = Path('/www/study-plan-data')
APP = Path('/www/study-plan')
RUNTIME_FILES = ('package.json', 'package-lock.json', '.next/BUILD_ID', '.next/build-manifest.json',
                 '.next/routes-manifest.json', '.next/server/app-paths-manifest.json', 'node_modules/next/package.json')


def require(condition, message):
    helpers.require(condition, message)


def runtime_identity(source):
    result = {}
    for name in RUNTIME_FILES:
        file = source / name
        helpers.no_links(file)
        require(file.is_file(), 'Runtime files must be present')
        result[name] = hashlib.sha256(file.read_bytes()).hexdigest()
    for name in ('.next/server', '.next/static', 'node_modules/next'):
        helpers.no_links(source / name)
        require((source / name).is_dir(), 'Runtime directories must remain present')
    return result


def cache_size(cache):
    helpers.no_links(cache)
    if not cache.exists():
        return 0
    require(cache.is_dir(), 'Expected a webpack cache directory')
    total = 0
    for entry in cache.rglob('*'):
        info = entry.lstat()
        require(stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode), 'Cache symlinks and special files are rejected')
        if stat.S_ISREG(info.st_mode):
            require(re.fullmatch(r'(?:index|[0-9]+)\.pack(?:\.(?:gz|br))?(?:\.old)?', entry.name), 'Unexpected non-webpack file; leave the cache intact')
            total += info.st_size
    return total


def no_process_uses(source):
    source = source.resolve()
    for process in Path('/proc').iterdir():
        if not process.name.isdigit():
            continue
        for name in ('cwd', 'exe'):
            try:
                target = (process / name).readlink()
            except (FileNotFoundError, ProcessLookupError):
                continue
            require(not target.is_relative_to(source), 'A running process still uses the old release')


def prepare(releases=RELEASES, data=DATA, app=APP, identities=SELECTED):
    for parent in (releases, data, app, data / 'backups'):
        helpers.no_links(parent)
        require(parent.is_dir(), 'Expected existing real directories')
    receipts = {}
    for file in (data / 'backups').glob('before-main-*/receipt.json'):
        helpers.no_links(file)
        value = json.loads(file.read_text())
        if value.get('status') == 'deployed':
            require(isinstance(value.get('timestamp'), str), 'Release timestamp is required')
            require(value['release'] not in receipts, 'Duplicate successful release receipt')
            receipts[value['release']] = value
    require(receipts, 'Successful release receipts are required')
    latest = max(receipts.values(), key=lambda value: value['timestamp'])
    require(latest['release'] == LATEST, 'The current release changed; inspect again before cleanup')
    current_build = (app / '.next/BUILD_ID').read_text().strip()
    require(current_build == latest.get('newBuildId'), 'Current application identity mismatch')
    recent = releases / ('previous-' + LATEST)
    helpers.no_links(recent)
    require(str(recent) == latest.get('previousDirectory'), 'Latest rollback path mismatch')
    require((recent / '.next/BUILD_ID').read_text().strip() == latest.get('oldBuildId'), 'Latest rollback build identity mismatch')
    targets = []
    for identity in identities:
        require(identity in SELECTED and identity != LATEST, 'Only the explicitly selected older caches are eligible')
        source = releases / ('previous-' + identity)
        helpers.no_links(source)
        require(source.is_dir() and not app.resolve().is_relative_to(source.resolve()), 'The active application cannot be cleaned')
        receipt = receipts.get(identity, {})
        require(receipt.get('previousDirectory') == str(source), 'Old rollback receipt path mismatch')
        require((source / '.next/BUILD_ID').read_text().strip() == receipt.get('oldBuildId'), 'Old rollback build identity mismatch')
        helpers.ensure_inactive(source, identity, app=app)
        no_process_uses(source)
        cache = source / '.next/cache/webpack'
        targets.append({'release': identity, 'source': source, 'cache': cache, 'bytes': cache_size(cache), 'runtime': runtime_identity(source)})
    return current_build, runtime_identity(recent), targets


def prune_one(target):
    cache = target['cache']
    require(cache == target['source'] / '.next/cache/webpack', 'Cleanup path must be the webpack cache')
    require(runtime_identity(target['source']) == target['runtime'], 'Runtime files changed before cleanup')
    require(cache_size(cache) == target['bytes'], 'Cache changed before cleanup')
    if cache.exists():
        require(helpers.shutil.rmtree.avoids_symlink_attacks, 'A symlink-safe deletion implementation is required')
        helpers.shutil.rmtree(cache)
    require(runtime_identity(target['source']) == target['runtime'], 'Runtime files changed during cleanup')


def healthy():
    helpers.subprocess.run(['systemctl', 'is-active', '--quiet', 'study-plan.service'], check=True)
    with urllib.request.urlopen('http://127.0.0.1:3001/api/health', timeout=15) as response:
        value = json.load(response)
        require(response.status == 200 and value.get('status') == 'ok', 'Production health check failed')
        require(value.get('checks', {}).get('database') is True and value.get('checks', {}).get('storage') is True, 'Database and storage must remain healthy')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', required=True)
    parser.parse_args()
    require(os.geteuid() == 0, 'Run the fixed cache cleanup as root')
    lockdir = Path('/run/study-plan-release')
    helpers.no_links(lockdir)
    lockdir.mkdir(mode=0o700, exist_ok=True)
    require(lockdir.stat().st_uid == 0 and stat.S_IMODE(lockdir.stat().st_mode) == 0o700, 'Invalid release lock directory')
    with os.fdopen(os.open(lockdir / 'lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600), 'w') as lock:
        helpers.acquire_lock(lock)
        healthy()
        current, recent, targets = prepare()
        before = helpers.shutil.disk_usage(RELEASES).free
        print(json.dumps({'status': 'validated-webpack-cache-only', 'releases': len(targets), 'cacheBytes': sum(target['bytes'] for target in targets), 'rootFreeMiB': before // 1024**2}), flush=True)
        for target in targets:
            prune_one(target)
            print(json.dumps({'clearedWebpackCache': target['release'], 'cacheBytes': target['bytes']}), flush=True)
        require((APP / '.next/BUILD_ID').read_text().strip() == current, 'The active build must remain unchanged')
        require(runtime_identity(RELEASES / ('previous-' + LATEST)) == recent, 'The latest rollback must remain unchanged')
        healthy()
        after = helpers.shutil.disk_usage(RELEASES).free
        print(json.dumps({'status': 'webpack-cache-cleanup-complete', 'freedMiB': (after - before) // 1024**2, 'rootFreeMiB': after // 1024**2, 'productionHealthy': True}), flush=True)


if __name__ == '__main__':
    main()
