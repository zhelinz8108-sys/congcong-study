"""Move one explicitly selected inactive rollback copy with full verification."""
import importlib.util
import json
import os
from pathlib import Path
import stat
import urllib.request

if 'helpers' not in globals():
    spec = importlib.util.spec_from_file_location('archive_helpers', Path(__file__).with_name('archive-failed-release-stages.py'))
    helpers = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helpers)

IDENTITY = 'bc29df1082b44e9b4ae1eacd813dd542761a3fbb-38966819559-1'
RELEASES = Path('/www/study-plan-releases')
DATA = Path('/www/study-plan-data')
APP = Path('/www/study-plan')


def require(condition, message):
    helpers.require(condition, message)


def validate_release(releases, data, app):
    for parent in (releases, data, app, data / 'backups'):
        helpers.no_links(parent)
        require(parent.is_dir(), 'Expected an existing real directory')
    source = releases / ('previous-' + IDENTITY)
    destination = data / 'retained-release-archives' / source.name
    if source.is_symlink():
        require(source.readlink() == destination and destination.is_dir(), 'Unexpected rollback link')
    else:
        require(source.is_dir(), 'The selected rollback copy must exist')
    require(not app.resolve().is_relative_to(source.resolve()), 'The current application must remain in place')
    receipts = []
    for path in (data / 'backups').glob('before-main-*/receipt.json'):
        helpers.no_links(path)
        value = json.loads(path.read_text())
        if value.get('status') == 'deployed':
            require(isinstance(value.get('timestamp'), str), 'A successful release needs a timestamp')
            receipts.append(value)
    require(receipts, 'Successful release receipts are required')
    selected = [value for value in receipts if value.get('release') == IDENTITY]
    require(len(selected) == 1, 'The selected rollback copy needs one successful release receipt')
    selected = selected[0]
    require(selected.get('previousDirectory') == str(source), 'Receipt rollback path mismatch')
    build = (source / '.next/BUILD_ID').read_text().strip()
    require(build and build == selected.get('oldBuildId'), 'Rollback build identity mismatch')
    latest = max(receipts, key=lambda value: value['timestamp'])
    require(latest['release'] != IDENTITY, 'Keep the latest rollback copy on the system disk')
    latest_source = releases / ('previous-' + latest['release'])
    helpers.no_links(latest_source)
    require(latest.get('previousDirectory') == str(latest_source), 'Latest receipt path mismatch')
    require((latest_source / '.next/BUILD_ID').read_text().strip() == latest.get('oldBuildId'), 'Latest rollback build identity mismatch')
    current_build = (app / '.next/BUILD_ID').read_text().strip()
    require(current_build == latest.get('newBuildId') and current_build != build, 'Current build must match the latest successful deployment')
    return source, destination, current_build


def ensure_no_process_uses(source):
    root = source.resolve()
    for process in Path('/proc').iterdir():
        if not process.name.isdigit():
            continue
        for name in ('cwd', 'exe'):
            try:
                target = (process / name).readlink()
            except (FileNotFoundError, ProcessLookupError):
                continue
            require(not target.is_relative_to(root), 'A running process still uses this rollback copy')


def healthy():
    helpers.subprocess.run(['systemctl', 'is-active', '--quiet', 'study-plan.service'], check=True)
    with urllib.request.urlopen('http://127.0.0.1:3001/api/health', timeout=15) as response:
        value = json.load(response)
        require(response.status == 200 and value.get('status') == 'ok', 'Production health check failed')
        require(value.get('checks', {}).get('database') is True and value.get('checks', {}).get('storage') is True, 'Database and storage must remain healthy')


def archive(releases=RELEASES, data=DATA, app=APP):
    source, destination, current_build = validate_release(releases, data, app)
    require(releases.stat().st_dev != data.stat().st_dev, 'The archive must use the existing separate data disk')
    healthy()
    helpers.ensure_inactive(source, IDENTITY, app=app)
    ensure_no_process_uses(source)
    helpers.PROGRESS['phase'] = 'checking-retained-rollback'
    manifest = helpers.tree(destination if source.is_symlink() else source)
    needed = 0 if destination.exists() else sum(item[3] for item in manifest.values())
    require(helpers.shutil.disk_usage(data).free >= 10 * 1024**3 + needed, 'Retain at least 10 GiB free on the data disk')
    parent = destination.parent
    helpers.no_links(parent)
    parent.mkdir(mode=0o700, exist_ok=True)
    info = parent.stat()
    require(info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o700, 'The rollback archive must remain root-private')
    outcome = helpers.move_verified(source, destination, releases / ('.archiving-' + source.name), parent / (source.name + '.json'), source.name)
    require(source.is_symlink() and source.readlink() == destination, 'Original rollback path must remain available')
    require(helpers.tree(destination) == manifest, 'Archived rollback copy verification failed')
    require((app / '.next/BUILD_ID').read_text().strip() == current_build, 'The production build must remain unchanged')
    healthy()
    print(json.dumps({'status': outcome, 'preservedRelease': source.name, 'files': len(manifest), 'rootFreeMiB': helpers.shutil.disk_usage(releases).free // 1024**2, 'dataFreeMiB': helpers.shutil.disk_usage(data).free // 1024**2, 'productionHealthy': True}), flush=True)


def main():
    require(os.geteuid() == 0, 'Run the verified relocation as root')
    lockdir = Path('/run/study-plan-release')
    helpers.no_links(lockdir)
    lockdir.mkdir(mode=0o700, exist_ok=True)
    require(lockdir.stat().st_uid == 0 and stat.S_IMODE(lockdir.stat().st_mode) == 0o700, 'Invalid release lock directory')
    with os.fdopen(os.open(lockdir / 'lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600), 'w') as lock:
        helpers.acquire_lock(lock)
        with helpers.report_progress():
            archive()


if __name__ == '__main__':
    main()
