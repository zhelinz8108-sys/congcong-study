"""One-time restoration of the verified build immediately before math audio."""
import filecmp
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

FROM = 'bdc35f288531062f5abb029cd263bbd9b51d65b0'
TO = '4d65d765912e1f9baf4553c7df5bebe9b16274eb'
RELEASE = FROM + '-40081528312-1'
APP = Path('/www/study-plan')
RELEASES = Path('/www/study-plan-releases')
TARGET = RELEASES / ('previous-' + RELEASE)
DATA = Path('/www/study-plan-data')
CONTROL = Path('/run/study-plan-release-code') / (RELEASE + '.sh')
CONTROL_SHA = 'bf9f9310750ff9d3135c16a614c4eae926e185428300aeb922c4a60c6c1734a9'
BOOK_SHA = 'a1df882d34cf9cad3758607e4b91bc7b6fd087e8f2d8596695f054cc5186d15f'


class RestoreError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise RestoreError(message)


def regular_directory(path):
    require(path.is_dir() and not path.is_symlink() and path.resolve() == path,
            'Expected an existing real directory')


def metadata(path):
    value = json.loads((path / 'release-metadata.json').read_text())
    require(set(value) == {'commit', 'buildId'}, 'Invalid release metadata')
    require(re.fullmatch(r'[0-9a-f]{40}', value['commit']) is not None, 'Invalid commit')
    require(value['buildId'] == (path / '.next/BUILD_ID').read_text().strip(), 'Build identity mismatch')
    return value


def same_resource(left, right):
    if not os.path.lexists(left) or not os.path.lexists(right):
        return not os.path.lexists(left) and not os.path.lexists(right)
    if left.is_symlink() or right.is_symlink():
        return left.is_symlink() and right.is_symlink() and left.resolve() == right.resolve()
    if left.is_file() and right.is_file():
        return os.path.samefile(left, right) or filecmp.cmp(left, right, shallow=False)
    if left.is_dir() and right.is_dir():
        names = {p.name for p in left.iterdir()}
        return names == {p.name for p in right.iterdir()} and all(same_resource(left / n, right / n) for n in names)
    return False


def runtime_unchanged():
    filecmp.clear_cache()
    paths = {'.data', 'content/chinese-six/pages', 'content/grade6-bank/answers.private.json',
             'content/grade6-bank/import-audit.private.json', 'content/grade6-bank/private',
             'content/english-six', 'content/toefl-listening', 'public/listening', 'public/uploads'}
    for root in (APP, TARGET):
        paths.update(str(p.relative_to(root)) for p in root.glob('.env*'))
        paths.update(str(p.relative_to(root)) for p in root.glob('content/chinese-six/*.private.json'))
    require(all(same_resource(APP / p, TARGET / p) for p in paths),
            'Runtime data or configuration changed; retain both builds for review')


def swap_with_recovery(app, target, held, stop, start, verify_target, verify_original):
    try:
        stop()
        app.rename(held)
        target.rename(app)
        start()
        verify_target()
    except BaseException:
        if held.exists():
            stop()
            if app.exists():
                require(not os.path.lexists(target), 'Recovery destination already exists')
                app.rename(target)
            held.rename(app)
        start()
        verify_original()
        raise


def self_test():
    for fail in ('none', 'start', 'verify', 'second-rename'):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            app, target, held = [root / n for n in ('app', 'target', 'held')]
            app.mkdir(); target.mkdir()
            (app / 'identity').write_text('current')
            (target / 'identity').write_text('old')
            calls = []
            def start():
                calls.append('start')
                if fail == 'start' and len(calls) == 1:
                    raise RestoreError('synthetic start failure')
            def verify_target():
                assert (app / 'identity').read_text() == 'old'
                if fail == 'verify':
                    raise RestoreError('synthetic health failure')
            def verify_original():
                assert (app / 'identity').read_text() == 'current'
            if fail == 'second-rename':
                # A target disappearing between checks and rename must recover app.
                target.rename(root / 'retained-target')
            try:
                swap_with_recovery(app, target, held, lambda: None, start, verify_target, verify_original)
                assert fail == 'none'
                assert (held / 'identity').read_text() == 'current'
            except (RestoreError, FileNotFoundError):
                assert fail != 'none'
                verify_original()
            assert sorted(p.read_text() for p in root.rglob('identity')) == ['current', 'old']
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        a, b = root / 'a', root / 'b'
        a.write_text('safe'); b.write_text('safe')
        assert same_resource(a, b)
        b.write_text('DIFF'); filecmp.clear_cache()
        assert not same_resource(a, b)
        (root / 'link-a').symlink_to(a)
        (root / 'link-b').symlink_to(a)
        assert same_resource(root / 'link-a', root / 'link-b')
    print('Restore tests passed: success, failed start, failed health, interrupted rename, resource drift.')


def main(run):
    require(os.geteuid() == 0 and re.fullmatch(r'[1-9][0-9]{0,19}-[1-9][0-9]{0,5}', run), 'Invalid restore invocation')
    os.umask(0o077)
    for path in (APP, RELEASES, DATA, Path('/run/study-plan-release')):
        regular_directory(path)
    lock_path = Path('/run/study-plan-release/lock')
    require(not lock_path.is_symlink(), 'Invalid lock')
    with lock_path.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        require(CONTROL.is_file() and not CONTROL.is_symlink(), 'Reviewed release controller unavailable')
        require(hashlib.sha256(CONTROL.read_bytes()).hexdigest() == CONTROL_SHA, 'Release controller changed')
        require(subprocess.check_output(['systemctl', 'show', 'study-plan.service', '-p', 'User', '--value'], text=True).strip() == 'ubuntu', 'Unexpected service user')
        require(subprocess.check_output(['systemctl', 'show', 'study-plan.service', '-p', 'WorkingDirectory', '--value'], text=True).strip() == str(APP), 'Unexpected service directory')
        current = metadata(APP)
        require(current['commit'] in (FROM, TO), 'Production changed; stop instead of overwriting newer work')
        backup = DATA / 'backups' / ('math-restore-' + run)
        require(not os.path.lexists(backup), 'Restore run already exists')
        backup.mkdir(mode=0o700)
        worker_calls = 0
        def worker(mode, work, arg, user='ubuntu'):
            nonlocal worker_calls
            worker_calls += 1
            with (backup / (mode + '-' + str(arg).rsplit('/', 1)[-1] + '.log')).open('ab') as out:
                result = subprocess.run(['systemd-run', '--quiet', '--wait', '--collect', '--pipe',
                    '--unit=study-plan-math-restore-' + run + '-' + mode + '-' + str(worker_calls),
                    '--uid=' + user, '--gid=' + user, '--working-directory=' + str(work),
                    '--property=EnvironmentFile=-/etc/study-plan.env', '--property=RuntimeMaxSec=600',
                    '--property=MemoryHigh=1280M', '--property=MemoryMax=1280M', '--property=MemorySwapMax=2048M',
                    '/bin/bash', str(CONTROL), '--worker', mode, str(work), str(arg)], stdout=out, stderr=out)
            require(result.returncode == 0, mode + ' check failed; private diagnostics retained on server')
        def verify(port, expected):
            for _ in range(45):
                try:
                    with urllib.request.urlopen('http://127.0.0.1:' + str(port) + '/api/health', timeout=3) as response:
                        health = json.load(response)
                    if health['status'] == 'ok' and health['checks']['database'] and health['checks']['storage']:
                        break
                except Exception:
                    pass
                time.sleep(2)
            else:
                raise RestoreError('Database/storage health failed')
            worker('verify', APP if port == 3001 else TARGET, port)
            with urllib.request.urlopen('http://127.0.0.1:' + str(port) + '/api/version', timeout=10) as response:
                require(json.load(response) == expected, 'Served release identity differs')
        if current['commit'] == TO:
            verify(3001, current)
            print('Previous version is already active and verified: ' + TO)
            return
        regular_directory(TARGET)
        require(os.stat(APP).st_dev == os.stat(TARGET).st_dev == os.stat(RELEASES).st_dev, 'Atomic rename requires one filesystem')
        old = metadata(TARGET)
        receipt = json.loads((DATA / 'backups' / ('before-main-' + RELEASE) / 'receipt.json').read_text())
        require(receipt['status'] == 'deployed' and receipt['commit'] == FROM and receipt['oldBuildId'] == old['buildId'] and receipt['newBuildId'] == current['buildId'], 'Preserved build does not match successful release receipt')
        require(old['commit'] == TO, 'Unexpected preserved commit')
        require(hashlib.sha256((TARGET / 'src/components/national-day-math-book.tsx').read_bytes()).hexdigest() == BOOK_SHA, 'Preserved mathematics source changed')
        require(shutil.disk_usage(APP).free >= 512 * 1024**2 and shutil.disk_usage(DATA).free >= 10 * 1024**3, 'Insufficient backup/health-check headroom')
        held = RELEASES / ('before-math-restore-' + run)
        require(not os.path.lexists(held), 'Preservation directory already exists')
        for cwd in Path('/proc').glob('[0-9]*/cwd'):
            try:
                require(not Path(os.readlink(cwd)).is_relative_to(TARGET), 'A worker still uses the preserved release')
            except FileNotFoundError:
                pass
        print('Checking preserved runtime resources and configuration.', flush=True)
        runtime_unchanged()
        unit = 'study-plan-math-restore-' + run + '-preflight.service'
        require(subprocess.check_output(['systemctl', 'show', unit, '-p', 'LoadState', '--value'], text=True).strip() == 'not-found', 'Preflight unit exists')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 3002))
        preflight = False
        try:
            subprocess.run(['systemd-run', '--quiet', '--collect', '--unit=' + unit,
                '--uid=ubuntu', '--gid=ubuntu', '--working-directory=' + str(TARGET),
                '--property=EnvironmentFile=-/etc/study-plan.env', '--property=RuntimeMaxSec=600',
                '--property=MemoryHigh=512M', '--property=MemoryMax=768M', '--property=MemorySwapMax=512M',
                '/bin/bash', str(CONTROL), '--worker', 'serve', str(TARGET), '3002'], check=True)
            preflight = True
            verify(3002, old)
            print('Preserved build passed read-only preflight. Taking a fresh database backup.', flush=True)
            worker('backup', APP, backup / 'database.dump', 'root')
            require((backup / 'database.dump').stat().st_size > 0, 'Empty database backup')
            with (backup / 'database-contents.txt').open('wb') as out:
                subprocess.run(['pg_restore', '--list', str(backup / 'database.dump')], stdout=out, stderr=subprocess.DEVNULL, check=True)
            runtime_unchanged()
            require(metadata(APP) == current and metadata(TARGET) == old, 'A build changed during preflight')
        finally:
            if preflight:
                subprocess.run(['systemctl', 'stop', unit], check=True)
        print('Restoring verified previous application; preserving the current build.', flush=True)
        stop = lambda: subprocess.run(['systemctl', 'stop', 'study-plan.service'], check=True)
        start = lambda: subprocess.run(['systemctl', 'start', 'study-plan.service'], check=True)
        swap_with_recovery(APP, TARGET, held, stop, start, lambda: verify(3001, old), lambda: verify(3001, current))
        (backup / 'receipt.json').write_text(json.dumps(dict(status='restored', commit=TO, buildId=old['buildId'], heldCurrent=str(held), databaseRestorePerformed=False), indent=2) + '\n')
        print('Previous version restored and health verified: ' + TO, flush=True)


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    else:
        for sig in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
            signal.signal(sig, lambda *_: (_ for _ in ()).throw(RestoreError('Restore interrupted')))
        try:
            require(len(sys.argv) == 2, 'Expected one restore run identity')
            main(sys.argv[1])
        except Exception as error:
            print('::error::' + (str(error) if isinstance(error, RestoreError) else 'Restore stopped; existing copies and private diagnostics retained (' + type(error).__name__ + ')'), flush=True)
            sys.exit(1)
