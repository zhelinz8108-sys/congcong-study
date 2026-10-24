"""Preserve the one verified October 17 rollback copy on the existing data disk."""
import argparse
from datetime import datetime
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess

spec = importlib.util.spec_from_file_location('archive_helper', Path(__file__).with_name('archive-failed-release-stages.py'))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

RELEASE = '062fb81fcbc09f1af719e297991e0e2760045e6d-38992301286-1'
IDENTITY = 'previous-' + RELEASE
APP = Path('/www/study-plan')
RELEASES = Path('/www/study-plan-releases')
DATA = Path('/www/study-plan-data')
PROC = Path('/proc')
GIB = 1024**3


def read_receipt(path):
    helper.no_links(path)
    return json.loads(path.read_text())


def within(path, root):
    return path == root or root in path.parents


def reject_references(roots):
    # Examine only path references; never print process arguments or file contents.
    roots = {root.absolute() for root in roots} | {root.resolve() for root in roots}

    def blocked(target):
        if target.endswith(' (deleted)'):
            target = target[:-10]
        return target.startswith('/') and any(within(Path(os.path.normpath(target)), root) for root in roots)

    for process in PROC.iterdir():
        if not process.name.isdigit():
            continue
        for name in ('cwd', 'exe'):
            try:
                helper.require(not blocked(os.readlink(process / name)), 'A process still references the selected old release; all copies retained')
            except (FileNotFoundError, ProcessLookupError):
                pass
        try:
            descriptors = list((process / 'fd').iterdir())
        except (FileNotFoundError, ProcessLookupError):
            continue
        for descriptor in descriptors:
            try:
                helper.require(not blocked(os.readlink(descriptor)), 'An open file still references the selected old release; all copies retained')
            except (FileNotFoundError, ProcessLookupError):
                pass
        for name in ('maps', 'cmdline'):
            try:
                content = (process / name).read_bytes()
                helper.require(not any(os.fsencode(root) in content for root in roots), 'A process still loads or names the selected old release; all copies retained')
            except (FileNotFoundError, ProcessLookupError):
                pass
    for entry in APP.rglob('*'):
        if entry.is_symlink():
            target = entry.resolve()
            helper.require(not any(within(target, root) or within(root, target) for root in roots), 'The current application links to the selected old release; all copies retained')


def guard(source, pending, destination):
    helper.require(subprocess.run(['systemctl', 'is-active', '--quiet', 'study-plan.service']).returncode == 0, 'The current service must be active')
    workdir = subprocess.check_output(['systemctl', 'show', 'study-plan.service', '--property=WorkingDirectory', '--value'], text=True).strip()
    helper.require(Path(workdir) == APP, 'Unexpected current application directory')
    helper.no_links(APP)
    receipts = []
    for path in (DATA / 'backups').glob('before-main-*/receipt.json'):
        value = read_receipt(path)
        if value.get('status') == 'deployed':
            receipts.append(value)
    helper.require(bool(receipts), 'No successful deployment receipt found')
    latest = max(receipts, key=lambda value: datetime.fromisoformat(value['timestamp']))
    helper.require((APP / '.next/BUILD_ID').read_text().strip() == latest['newBuildId'], 'The current build does not match the latest successful receipt')
    helper.require(Path(latest['previousDirectory']) != source and Path(latest['previousDirectory']).resolve() not in (source.resolve(), pending.resolve(), destination.resolve()), 'The most recent rollback copy must remain on the system disk')
    old = read_receipt(DATA / 'backups' / ('before-main-' + RELEASE) / 'receipt.json')
    helper.require(old.get('status') == 'deployed' and old.get('release') == RELEASE and old.get('commit') == RELEASE[:40] and old.get('previousDirectory') == str(source), 'The selected old release has no matching successful receipt')
    physical = source if source.exists() and not source.is_symlink() else destination if destination.exists() else pending
    helper.no_links(physical)
    helper.require((physical / '.next/BUILD_ID').read_text().strip() == old['oldBuildId'], 'The old build does not match its rollback receipt')
    for path in (source, pending, destination):
        helper.require(not within(APP.resolve(), path.resolve()), 'The current application cannot be moved')
    helper.ensure_inactive(physical, RELEASE, app=APP)
    reject_references((source, pending, destination))


def run():
    helper.require(os.geteuid() == 0, 'Run with sudo')
    for path in (RELEASES, DATA):
        helper.no_links(path)
        helper.require(path.is_dir(), 'Existing release and data directories required')
    helper.require(RELEASES.stat().st_dev != DATA.stat().st_dev, 'The existing data disk must be a separate filesystem')
    lockdir = Path('/run/study-plan-release')
    helper.no_links(lockdir)
    lockdir.mkdir(mode=0o700, exist_ok=True)
    helper.require(lockdir.stat().st_uid == 0 and stat.S_IMODE(lockdir.stat().st_mode) == 0o700, 'Invalid release lock directory')
    with os.fdopen(os.open(lockdir / 'lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600), 'w') as lock:
        helper.acquire_lock(lock)
        source = RELEASES / IDENTITY
        pending = RELEASES / ('.archiving-' + IDENTITY)
        archives = DATA / 'retained-release-archives'
        destination = archives / IDENTITY
        receipt = archives / (IDENTITY + '.json')
        for path in (archives, destination, pending, receipt, receipt.with_suffix('.json.pending'), archives / (IDENTITY + '.partial')):
            helper.no_links(path)
        if source.is_symlink():
            helper.require(source.readlink() == destination, 'Unexpected old release link')
        guard(source, pending, destination)
        physical = source if source.exists() and not source.is_symlink() else destination if destination.exists() else pending
        manifest = helper.tree(physical)
        block = os.statvfs(DATA).f_frsize
        # copytree does not preserve hard links; count each file plus directory overhead.
        copy_bytes = sum(((item[3] + block - 1) // block) * block if item[4] else block for item in manifest.values())
        needed = 0 if destination.exists() else copy_bytes
        helper.require(shutil.disk_usage(DATA).free >= 10 * GIB + needed + 64 * 1024**2, 'Insufficient data-disk space to preserve 10 GiB plus copy overhead; no source files changed')
        archives.mkdir(mode=0o700, exist_ok=True)
        helper.require(archives.stat().st_uid == 0 and stat.S_IMODE(archives.stat().st_mode) == 0o700, 'Archive directory must be root-owned with mode 0700')

        def recheck():
            guard(source, pending, destination)
            helper.require(shutil.disk_usage(DATA).free >= 10 * GIB + 64 * 1024**2, 'The data-disk reserve changed during copying; all copies retained')

        result = helper.move_verified(source, destination, pending, receipt, IDENTITY,
                                      before_release=recheck)
        helper.require(shutil.disk_usage(DATA).free >= 10 * GIB, 'Data-disk reserve check failed; the full archive is retained')
        print(json.dumps({'status': result, 'rootFreeMiB': shutil.disk_usage(RELEASES).free // 1024**2,
                          'dataFreeMiB': shutil.disk_usage(DATA).free // 1024**2}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', required=True, action='store_true')
    parser.parse_args()
    with helper.report_progress():
        run()
