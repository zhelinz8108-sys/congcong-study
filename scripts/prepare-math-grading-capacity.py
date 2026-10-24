"""Evict only reproducible downloads, then retain one fixed inactive release."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import urllib.request

APP = Path('/www/study-plan')
RELEASES = Path('/www/study-plan-releases')
DATA = Path('/www/study-plan-data')
CACHE = DATA / 'npm-cache/ubuntu/_cacache'
ORIGIN = Path('/home/ubuntu/.npm/_cacache')
SOURCE_ID = 'previous-7540ccd7cee2d07796cce61318e79d1d1be9e923-39011402024-1'
CORE_ID = SOURCE_ID.removeprefix('previous-')
SOURCE = RELEASES / SOURCE_ID
ARCHIVES = DATA / 'retained-release-archives'
DESTINATION = ARCHIVES / SOURCE_ID
PENDING = RELEASES / ('.archiving-' + SOURCE_ID)
RECEIPT = ARCHIVES / (SOURCE_ID + '.json')
HELD = RELEASES / 'before-math-restore-40083040672-1'
ACTIVE_META = {'commit': '4d65d765912e1f9baf4553c7df5bebe9b16274eb', 'buildId': 'Yj7rcLNGEw2ejYX1YscEO'}
HELD_META = {'commit': 'bdc35f288531062f5abb029cd263bbd9b51d65b0', 'buildId': 'DKRqust1YId2JJhNlB18x'}
SOURCE_META = {'commit': '062fb81fcbc09f1af719e297991e0e2760045e6d', 'buildId': 'iF6QnB8y3wq-QB0P33wnu'}
HELPER_SHA = 'fc939c638cfb08cdf1ad1930f684bd94b3e5bd899ea027023e1e16b0058d92f0'
GIB = 1024 ** 3
MARGIN = 64 * 1024 ** 2


def require(condition, message):
    if not condition:
        raise ValueError(message)


def metadata(path):
    def small(relative):
        item = path / relative
        info = item.lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_size <= 16384, 'Invalid build metadata file')
        descriptor = os.open(item, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, encoding='utf-8') as source:
            return source.read(16385)
    value = json.loads(small('release-metadata.json'))
    require(isinstance(value, dict) and set(value) == {'commit', 'buildId'}, 'Invalid build metadata')
    require(re.fullmatch(r'[0-9a-f]{40}', value['commit']) and re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value['buildId']), 'Invalid build identity')
    require(value['buildId'] == small('.next/BUILD_ID').strip(), 'Build metadata mismatch')
    return value


def log_counts(value):
    if type(value) in (int, float):
        return ' '.join(str(value))
    if isinstance(value, dict):
        return {key: log_counts(item) for key, item in value.items()}
    if isinstance(value, list):
        return [log_counts(item) for item in value]
    return value


def helper():
    source = globals().get('RETENTION_SOURCE')
    if source is None:
        source = Path(__file__).with_name('archive-failed-release-stages.py').read_bytes()
    require(hashlib.sha256(source).hexdigest() == HELPER_SHA, 'Reviewed retention helper changed')
    namespace = {'__name__': 'reviewed_retention_helper'}
    exec(compile(source, '<reviewed-retention-helper>', 'exec'), namespace)
    return SimpleNamespace(**namespace)


def real_directory(path):
    require(path.is_dir() and not path.is_symlink() and path.resolve() == path, 'Expected a known real directory')


def mounted_paths():
    result = set()
    for line in Path('/proc/self/mountinfo').read_text().splitlines():
        value = re.sub(r'\\([0-7]{3})', lambda match: chr(int(match[1], 8)), line.split()[4])
        result.add(Path(value))
    return result


def reject_mounts(path, base):
    for mount in mounted_paths():
        descendant = mount == path or mount.is_relative_to(path)
        aliased_parent = mount != base and mount.is_relative_to(base) and path.is_relative_to(mount)
        require(not descendant and not aliased_parent, 'Unexpected mounted subtree at a protected path')


def directory_identity(info):
    return info.st_dev, info.st_ino, info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)


def entry_identity(info):
    return info.st_dev, info.st_ino, stat.S_IFMT(info.st_mode)


def cache_identity(origin, canonical, expected_uid, data_root=None):
    real_directory(canonical)
    reject_mounts(canonical, data_root or canonical.parent)
    require(origin.is_symlink() and origin.readlink() == canonical and origin.resolve() == canonical, 'Download cache pointer changed')
    info = canonical.stat()
    require(info.st_uid == expected_uid, 'Unexpected download cache owner')
    require(info.st_dev == (data_root or canonical.parent).stat().st_dev, 'Download cache is not on its expected filesystem')
    return (*directory_identity(info), origin.lstat().st_ino)


def inspect_directory_fd(descriptor, allow_links=False):
    """Snapshot identities through a pinned directory fd without opening payloads."""
    device = os.fstat(descriptor).st_dev
    allocated = 0
    seen = set()
    entries = {}
    def scan(directory, relative):
        nonlocal allocated
        info = os.fstat(directory)
        identity = info.st_dev, info.st_ino
        require(info.st_dev == device, 'Unexpected filesystem boundary')
        entries[relative] = entry_identity(info)
        if identity not in seen:
            allocated += info.st_blocks * 512
            seen.add(identity)
        for name in os.listdir(directory):
            child_info = os.stat(name, dir_fd=directory, follow_symlinks=False)
            permitted = stat.S_ISDIR(child_info.st_mode) or stat.S_ISREG(child_info.st_mode) or (allow_links and stat.S_ISLNK(child_info.st_mode))
            require(child_info.st_dev == device and permitted, 'Unexpected link, special file or filesystem boundary')
            key = relative + (name,)
            entries[key] = entry_identity(child_info)
            if stat.S_ISDIR(child_info.st_mode):
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
                try:
                    require(entry_identity(os.fstat(child)) == entry_identity(child_info), 'Directory changed before inspection')
                    scan(child, key)
                finally:
                    os.close(child)
            elif (child_info.st_dev, child_info.st_ino) not in seen:
                allocated += child_info.st_blocks * 512
                seen.add((child_info.st_dev, child_info.st_ino))
    scan(descriptor, ())
    return allocated, entries


def cache_manifest(path, data_root=None):
    real_directory(path)
    reject_mounts(path, data_root or path.parent)
    expected = directory_identity(path.lstat())
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        require(directory_identity(os.fstat(descriptor)) == expected, 'Cache directory changed before inspection')
        result, _ = inspect_directory_fd(descriptor)
        reject_mounts(path, data_root or path.parent)
        require(directory_identity(path.lstat()) == expected, 'Cache directory changed during inspection')
        return result
    finally:
        os.close(descriptor)


def clear_directory_contents(path, expected=None, allow_links=False, data_root=None, before_delete=None):
    """Pin and validate every directory before deletion, including replacement races."""
    real_directory(path)
    reject_mounts(path, data_root or path.parent)
    expected = expected or directory_identity(path.lstat())
    require(expected[0] == (data_root or path.parent).stat().st_dev, 'Unexpected cleanup filesystem')
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    def clear(directory, relative, entries):
        for name in os.listdir(directory):
            info = os.stat(name, dir_fd=directory, follow_symlinks=False)
            key = relative + (name,)
            require(entry_identity(info) == entries.get(key) and info.st_dev == expected[0], 'Entry changed after validated snapshot')
            if stat.S_ISDIR(info.st_mode):
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
                try:
                    require(entry_identity(os.fstat(child)) == entries[key], 'Directory changed before deletion')
                    clear(child, key, entries)
                finally:
                    os.close(child)
                os.rmdir(name, dir_fd=directory)
            else:
                require(stat.S_ISREG(info.st_mode) or (allow_links and stat.S_ISLNK(info.st_mode)), 'Entry changed type; stop without following it')
                os.unlink(name, dir_fd=directory)
    try:
        require(directory_identity(os.fstat(descriptor)) == expected, 'Directory identity changed before deletion')
        _, entries = inspect_directory_fd(descriptor, allow_links)
        reject_mounts(path, data_root or path.parent)
        require(directory_identity(path.lstat()) == expected, 'Directory replaced after inspection')
        if before_delete is not None:
            before_delete()
            reject_mounts(path, data_root or path.parent)
            require(directory_identity(path.lstat()) == expected, 'Directory changed during cache-use verification')
        clear(descriptor, (), entries)
        os.fsync(descriptor)
        require(directory_identity(path.lstat()) == expected, 'Directory pointer changed during cleanup')
    finally:
        os.close(descriptor)


def clear_cache_contents(path, expected=None, data_root=None, before_delete=None):
    clear_directory_contents(path, expected, False, data_root, before_delete)


def guard_retention_deletion(retention, allowed_roots, removable):
    """Keep pinned helper's full comparisons; harden its duplicate/temp removal."""
    original_tree = retention.tree
    def checked_tree(path):
        path = Path(path)
        require(path in allowed_roots, 'Unexpected retention traversal')
        base = allowed_roots[path]
        real_directory(path)
        reject_mounts(path, base)
        require(path.stat().st_dev == base.stat().st_dev, 'Unexpected retention filesystem')
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            inspect_directory_fd(descriptor, True)
        finally:
            os.close(descriptor)
        result = original_tree(path)
        reject_mounts(path, base)
        return result
    def checked_rmtree(path):
        path = Path(path)
        require(path in removable, 'Unexpected duplicate removal path')
        clear_directory_contents(path, allow_links=True, data_root=allowed_roots[path])
        os.rmdir(path)
    proxy = SimpleNamespace(**vars(retention.shutil))
    proxy.rmtree = checked_rmtree
    original_tree.__globals__['shutil'] = proxy
    original_tree.__globals__['tree'] = checked_tree
    retention.shutil = proxy
    retention.tree = checked_tree


def reject_workers(workers, process_names):
    require(not workers.strip(), 'An active release worker exists')
    require(not any(package_or_build_command(name) for name in process_names), 'An active package manager or build worker exists')


def package_or_build_command(name):
    return re.match(r'^(?:npm|npx|pnpm|yarn|corepack|node-gyp|webpack|next-build|next build)(?:\b|[- ])', name, re.I) is not None


def cache_target(target, cache_roots=(CACHE, ORIGIN)):
    # procfs reports canonical targets, including an optional deleted suffix.
    value = target.removesuffix(' (deleted)')
    path = Path(value)
    return path.is_absolute() and any(path == root or path.is_relative_to(root) for root in cache_roots)


def process_cache_busy(process, cache_roots=(CACHE, ORIGIN)):
    """Inspect link targets only; never read file payloads, argv or environment."""
    try:
        if cache_target(os.readlink(process / 'cwd'), cache_roots):
            return True
    except FileNotFoundError:
        pass
    try:
        with os.scandir(process / 'fd') as descriptors:
            for descriptor in descriptors:
                try:
                    if cache_target(os.readlink(descriptor.path), cache_roots):
                        return True
                except FileNotFoundError:
                    pass
    except FileNotFoundError:
        pass
    return False


def install_or_build_tokens(tokens):
    """Return only an activity boolean; never retain or log raw argument tokens."""
    for index, token in enumerate(tokens):
        name = token.replace('\\', '/').rsplit('/', 1)[-1]
        if name in ('npm-cli.js', 'npx-cli.js', 'npm', 'npx', 'pnpm', 'pnpm.cjs', 'yarn', 'yarn.js', 'corepack', 'node-gyp', 'node-gyp.js'):
            return True
        if name in ('webpack', 'webpack.js', 'webpack-cli', 'webpack-cli.js', 'tsc', 'tsc.js', 'rollup', 'rollup.js'):
            return True
        if name == 'next' or '/next/dist/bin/next' in token.replace('\\', '/'):
            if any(action in ('build', 'export', 'dev') for action in tokens[index + 1:]):
                return True
        if name in ('vite', 'vite.js') and 'build' in tokens[index + 1:]:
            return True
    # Node interpreter eval/print flags apply only before its script. A Next
    # runtime's later `start -p PORT` is a port option, not Node's print flag.
    index = 1
    while index < len(tokens):
        flag = tokens[index]
        if flag in ('--eval', '--print') or flag.startswith(('-e', '-p', '--eval=', '--print=')):
            return True
        if flag in ('-r', '--require', '--import', '--loader', '--experimental-loader'):
            index += 2
        elif flag.startswith('-'):
            index += 1
        else:
            break
    return False


def process_cli_activity(process, command):
    if command in ('npm start', 'npm run start'):
        return False  # Only the complete cache-use/identity proof may exempt it.
    if package_or_build_command(command):
        return True
    if command not in ('node', 'nodejs', 'MainThread', 'next', 'vite', 'tsc'):
        return False
    # This bounded in-memory read is used only for CLI classification. It is
    # never included in any output, exception, receipt or persistent snapshot.
    with (process / 'cmdline').open('rb') as source:
        raw = source.read(8193)
    if len(raw) > 8192:
        return True
    return install_or_build_tokens(raw.decode('utf-8', errors='replace').rstrip('\0').split('\0'))


def process_basics(process):
    values = (process / 'stat').read_text().rsplit(')', 1)[1].split()
    uid = int(next(line for line in (process / 'status').read_text().splitlines() if line.startswith('Uid:')).split()[1])
    command = (process / 'comm').read_text().strip()
    return dict(pid=int(process.name), ppid=int(values[1]), startTicks=int(values[19]),
                uid=uid, command=command, cliActivity=process_cli_activity(process, command))


def process_snapshot(proc_root=Path('/proc'), cache_roots=(CACHE, ORIGIN), exclude_pid=None):
    """Keep the snapshot in memory. PID/start identity is checked around fd reads."""
    result = {}
    for process in proc_root.glob('[0-9]*'):
        if not process.is_dir() or (exclude_pid is not None and process.name == str(exclude_pid)):
            continue
        try:
            before = process_basics(process)
            busy = process_cache_busy(process, cache_roots)
            after = process_basics(process)
            result[before['pid']] = {**after, 'stable': before == after, 'cacheBusy': busy}
        except FileNotFoundError:
            # An exited process no longer has any open cache descriptors.
            pass
    return result


def descendants(pid, processes):
    selected, frontier = set(), {pid}
    for _ in range(len(processes) + 1):
        children = {entry['pid'] for entry in processes.values() if entry['ppid'] in frontier}
        require(pid not in children and not children.intersection(selected), 'Process ancestry changed')
        if not children:
            return [processes[child] for child in selected]
        selected.update(children)
        frontier = children
    raise ValueError('Process ancestry could not be verified')


def readonly_wrapper_rule(record, processes, uptime, expected_uid, ticks):
    """Exempt only an aged, stable, cache-idle start wrapper and its idle children."""
    if record['command'] not in ('npm start', 'npm run start') or record['uid'] != expected_uid:
        return False
    if not record['stable'] or record['cacheBusy'] or uptime - record['startTicks'] / ticks < 300:
        return False
    return all(entry['stable'] and not entry['cacheBusy'] and not entry.get('cliActivity', False) and not package_or_build_command(entry['command'])
               for entry in descendants(record['pid'], processes))


def verify_processes_idle(workers, processes, uptime, expected_uid, ticks):
    require(not workers.strip(), 'An active release worker exists')
    require(all(record['stable'] for record in processes.values()), 'Process start identity changed during cache-use verification')
    require(not any(record['cacheBusy'] for record in processes.values()), 'Download cache is in use')
    require(not any(record.get('cliActivity', False) for record in processes.values()), 'An active install or build command exists')
    blocked = [record['command'] for record in processes.values()
               if package_or_build_command(record['command']) and not readonly_wrapper_rule(record, processes, uptime, expected_uid, ticks)]
    reject_workers('', blocked)


def idle(exclude_own_cache_pin=False):
    result = subprocess.run(['systemctl', 'list-units', '--no-legend', '--plain',
        '--state=active,activating,deactivating', 'study-plan-release-*', 'study-plan-preflight-*', 'study-plan-math-restore-*'],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True, text=True)
    processes = process_snapshot(exclude_pid=os.getpid() if exclude_own_cache_pin else None)
    uptime = float(Path('/proc/uptime').read_text().split()[0])
    verify_processes_idle(result.stdout, processes, uptime, pwd.getpwnam('ubuntu').pw_uid, os.sysconf('SC_CLK_TCK'))
    for path in Path('/proc').glob('[0-9]*/cwd'):
        try:
            cwd = Path(os.readlink(path))
            require(not any(cwd == target or cwd.is_relative_to(target) for target in (SOURCE, PENDING, DESTINATION)), 'A process still uses the selected archive candidate')
        except FileNotFoundError:
            pass


def protect_source(source, current, held, expected_name):
    require(source.name == expected_name and source.parent == current.parent / 'study-plan-releases', 'Source is not the fixed approved release')
    require(source.resolve() != current.resolve() and source.resolve() != held.resolve(), 'Cannot archive current or held rollback application')


def code_footprint(root, retention):
    values = {}
    pending = [root]
    while pending:
        path = pending.pop()
        info = path.lstat()
        relative = path.relative_to(root).as_posix()
        if relative != '.' and retention.code_bytes({relative: [0, 0, 0, 1, None, None]}) == 0:
            continue
        if stat.S_ISLNK(info.st_mode):
            continue
        if stat.S_ISREG(info.st_mode):
            values[relative] = [0, 0, 0, info.st_size, None, None]
        elif stat.S_ISDIR(info.st_mode):
            with os.scandir(path) as entries:
                pending.extend(Path(entry.path) for entry in entries)
    return retention.code_bytes(values)


def healthy(expected):
    with urllib.request.urlopen('http://127.0.0.1:3001/api/version', timeout=10) as response:
        require(json.load(response) == expected, 'Served build identity changed')
    with urllib.request.urlopen('http://127.0.0.1:3001/api/health', timeout=10) as response:
        health = json.load(response)
    require(health['status'] == 'ok' and health['checks']['database'] is True and health['checks']['storage'] is True, 'Existing application is not healthy')


def prepare():
    require(os.geteuid() == 0, 'Capacity preparation requires root')
    os.umask(0o077)
    retention = helper()
    for path in (APP, RELEASES, DATA, HELD, ARCHIVES):
        real_directory(path)
    require(RELEASES.stat().st_dev != DATA.stat().st_dev, 'Data disk must be separate')
    require(ARCHIVES.stat().st_uid == 0 and stat.S_IMODE(ARCHIVES.stat().st_mode) == 0o700, 'Invalid private retained archive directory')
    lock_directory = Path('/run/study-plan-release')
    retention.no_links(lock_directory)
    real_directory(lock_directory)
    require(lock_directory.stat().st_uid == 0 and stat.S_IMODE(lock_directory.stat().st_mode) == 0o700, 'Invalid release lock directory owner or mode')
    lock_path = lock_directory / 'lock'
    lock_info = lock_path.lstat()
    require(stat.S_ISREG(lock_info.st_mode) and lock_info.st_uid == 0 and lock_info.st_nlink == 1 and stat.S_IMODE(lock_info.st_mode) == 0o600, 'Invalid release lock file')
    descriptor = os.open(lock_path, os.O_RDWR | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'r+b') as lock:
        require(entry_identity(os.fstat(lock.fileno())) == entry_identity(lock_info), 'Release lock changed before acquisition')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        require(metadata(APP) == ACTIVE_META and metadata(HELD) == HELD_META, 'Current or latest held application changed')
        healthy(ACTIVE_META)
        protect_source(SOURCE, APP, HELD, SOURCE_ID)
        idle()
        candidate = DESTINATION if SOURCE.is_symlink() else SOURCE if SOURCE.exists() else PENDING
        real_directory(candidate)
        require(metadata(candidate) == SOURCE_META, 'Selected historical build changed')
        require(not SOURCE.is_symlink() or SOURCE.readlink() == DESTINATION, 'Unexpected historical archive pointer')
        retention.ensure_inactive(candidate, CORE_ID)
        temporary = ARCHIVES / (SOURCE_ID + '.partial')
        guard_retention_deletion(retention,
            {SOURCE: RELEASES, PENDING: RELEASES, DESTINATION: DATA, temporary: DATA}, {PENDING, temporary})
        # Compute the SAME 4 GiB + code + 64 MiB rule, using stat-only code sizes.
        largest = code_footprint(APP, retention)
        for identity in retention.FAILED_RELEASES:
            archived = DATA / 'failed-release-archives' / identity
            real_directory(archived)
            largest = max(largest, code_footprint(archived, retention))
        root_needed = 4 * GIB + largest + MARGIN
        before_root, before_data = shutil.disk_usage(RELEASES).free, shutil.disk_usage(DATA).free
        if not SOURCE.is_symlink():
            before_manifest = retention.tree(candidate)
            candidate_fd = os.open(candidate, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                allocated_bytes, _ = inspect_directory_fd(candidate_fd, True)
            finally:
                os.close(candidate_fd)
            copy_bytes = 0 if DESTINATION.exists() else max(allocated_bytes, sum(item[3] for item in before_manifest.values()))
            retention.no_links(ORIGIN.parent)
            cache_before = cache_identity(ORIGIN, CACHE, pwd.getpwnam('ubuntu').pw_uid, DATA)
            cache_bytes = cache_manifest(CACHE, DATA)
            require(before_data + cache_bytes >= 10 * GIB + copy_bytes + MARGIN, 'Cache reclaim cannot preserve archive-copy reserve')
            print('Evicting only reproducible npm download-cache entries; preserving the cache directory and pointer.', flush=True)
            idle()
            # The sole excluded process owns this transaction's validated cache
            # directory fd. Every other process is checked immediately before
            # the first unlink; no runtime/process metadata is emitted.
            clear_cache_contents(CACHE, cache_before[:5], DATA, lambda: idle(exclude_own_cache_pin=True))
            require(cache_identity(ORIGIN, CACHE, pwd.getpwnam('ubuntu').pw_uid, DATA) == cache_before, 'Cache directory or pointer metadata changed')
            require(not list(CACHE.iterdir()), 'Download cache is not empty')
            require(shutil.disk_usage(DATA).free >= 10 * GIB + copy_bytes + MARGIN, 'Archive copy would violate the data reserve')
            require(metadata(APP) == ACTIVE_META and metadata(HELD) == HELD_META, 'Protected applications changed during cache cleanup')
        else:
            require(shutil.disk_usage(DATA).free >= 10 * GIB, 'Data reserve is below 10 GiB')
        idle()
        print('Retaining the one approved historical build with full content/ownership/permission/link verification.', flush=True)
        with retention.report_progress():
            outcome = retention.move_verified(SOURCE, DESTINATION, PENDING, RECEIPT, SOURCE_ID)
        require(SOURCE.is_symlink() and SOURCE.readlink() == DESTINATION, 'Historical release pointer was not retained')
        require(metadata(DESTINATION) == SOURCE_META, 'Archived build identity changed')
        after_root, after_data = shutil.disk_usage(RELEASES).free, shutil.disk_usage(DATA).free
        require(after_root >= root_needed, 'Original root upload/build safety threshold is still unsatisfied')
        require(after_data >= 10 * GIB, 'Original data safety reserve is still unsatisfied')
        require(metadata(APP) == ACTIVE_META and metadata(HELD) == HELD_META, 'Protected applications changed')
        healthy(ACTIVE_META)
        result = dict(schema='math-grading-capacity-prepared/v1', status='verified', outcome=outcome,
            rootBeforeBytes=before_root, rootAfterBytes=after_root, rootRequiredBytes=root_needed,
            dataBeforeBytes=before_data, dataAfterBytes=after_data, dataRequiredBytes=10 * GIB,
            active=ACTIVE_META, held=HELD_META, retained=SOURCE_META,
            retainedOriginalPath=str(SOURCE), retainedDestination=str(DESTINATION),
            databaseRestorePerformed=False, activeApplicationModified=False,
            counterEncoding='space-separated decimal digits')
        print(json.dumps(log_counts(result), separators=(',', ':')), flush=True)


def self_test():
    import importlib.util
    from unittest.mock import patch
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        cache = root / 'cache'; cache.mkdir(mode=0o750)
        origin = root / 'origin'; origin.symlink_to(cache)
        (cache / 'content-v2').mkdir(); (cache / 'content-v2/blob').write_text('reproducible downloads')
        before = cache_identity(origin, cache, os.getuid())
        clear_cache_contents(cache)
        assert not list(cache.iterdir()) and cache_identity(origin, cache, os.getuid()) == before
        outside = root / 'private-placeholder'; outside.write_text('must remain')
        (cache / 'escape').symlink_to(outside)
        try:
            clear_cache_contents(cache)
            raise AssertionError('Nested cache symlink accepted')
        except ValueError:
            assert outside.read_text() == 'must remain'
        (cache / 'escape').unlink()
        origin.unlink(); origin.symlink_to(root)
        try:
            cache_identity(origin, cache, os.getuid())
            raise AssertionError('Wrong cache pointer accepted')
        except ValueError:
            pass
        for workers, names in [('active-worker', []), ('', ['npm ci']), ('', ['npm start']), ('', ['npx']), ('', ['yarn'])]:
            try:
                reject_workers(workers, names)
                raise AssertionError('Active worker accepted')
            except ValueError:
                pass
        reject_workers('', ['next-server', 'sshd'])
        wrapper = dict(pid=41, ppid=1, startTicks=100, uid=1000, command='npm start', stable=True, cacheBusy=False)
        records = {41: wrapper, 42: {**wrapper, 'pid': 42, 'ppid': 41, 'command': 'sh'},
                   43: {**wrapper, 'pid': 43, 'ppid': 42, 'command': 'next-server'}}
        assert readonly_wrapper_rule(wrapper, records, 3600, 1000, 100)
        verify_processes_idle('', records, 3600, 1000, 100)
        for changed in ({'command': 'npm ci'}, {'command': 'npm run build'}, {'uid': 0},
                        {'startTicks': 359900}, {'stable': False}, {'cacheBusy': True}):
            altered = {**wrapper, **changed}
            assert not readonly_wrapper_rule(altered, {**records, 41: altered}, 3600, 1000, 100)
        for command in ('npm ci', 'npm install', 'npm run build', 'npx', 'pnpm', 'yarn', 'corepack', 'node-gyp', 'webpack'):
            changed = {**records[43], 'command': command}
            assert not readonly_wrapper_rule(wrapper, {**records, 43: changed}, 3600, 1000, 100)
        assert install_or_build_tokens(['node', '/fixture/next/dist/bin/next', 'build'])
        assert install_or_build_tokens(['node', '/fixture/npm/bin/npm-cli.js', 'ci'])
        assert install_or_build_tokens(['node', '/fixture/npm/bin/npx-cli.js', 'next', 'build'])
        assert not install_or_build_tokens(['node', '/fixture/next/dist/bin/next', 'start'])
        assert not install_or_build_tokens(['node', '/fixture/next/dist/bin/next', 'start', '-p', '3003'])
        assert install_or_build_tokens(['node', '--eval', 'synthetic-inline-code'])
        assert install_or_build_tokens(['node', '-pe', 'synthetic-inline-code'])
        assert not install_or_build_tokens(['node', '/fixture/server.js'])
        hidden_build = {**records[43], 'command': 'node', 'cliActivity': True}
        assert not readonly_wrapper_rule(wrapper, {**records, 43: hidden_build}, 3600, 1000, 100)
        try:
            verify_processes_idle('', {**records, 43: hidden_build}, 3600, 1000, 100)
            raise AssertionError('Node-wrapped Next build accepted')
        except ValueError:
            pass
        busy_child = {**records[43], 'cacheBusy': True}
        assert not readonly_wrapper_rule(wrapper, {**records, 43: busy_child}, 3600, 1000, 100)
        for changed in ({43: busy_child}, {41: {**wrapper, 'stable': False}}):
            try:
                verify_processes_idle('', {**records, **changed}, 3600, 1000, 100)
                raise AssertionError('Cache user or identity race accepted')
            except ValueError:
                pass
        # Process cwd outside any deployment namespace is safe only when neither
        # it nor any fd references the exact cache; no package-script heuristic.
        fake_proc = root / 'proc'; process = fake_proc / '41'; process.mkdir(parents=True)
        (process / 'fd').mkdir()
        outside_cwd = root / 'outside-deployment'; outside_cwd.mkdir()
        (process / 'cwd').symlink_to(outside_cwd)
        (process / 'comm').write_text('npm start\n')
        (process / 'status').write_text('Uid:\t1000\t1000\t1000\t1000\n')
        fields = ['S', '1'] + ['0'] * 17 + ['100']
        (process / 'stat').write_text('41 (npm start) ' + ' '.join(fields))
        cache_file = cache / 'blob'; cache_file.write_text('cache data not read')
        (process / 'fd/3').symlink_to(cache_file)
        assert process_cache_busy(process, (cache,))
        (process / 'fd/3').unlink()
        (process / 'cwd').unlink(); (process / 'cwd').symlink_to(cache)
        assert process_cache_busy(process, (cache,))
        (process / 'cwd').unlink(); (process / 'cwd').symlink_to(outside_cwd)
        assert not process_cache_busy(process, (cache,))
        isolated = process_snapshot(fake_proc, (cache,))
        verify_processes_idle('', isolated, 3600, 1000, 100)
        assert readonly_wrapper_rule(isolated[41], isolated, 3600, 1000, 100)
        baseline = {key: wrapper[key] for key in ('pid', 'ppid', 'startTicks', 'uid', 'command')}
        identities = iter([baseline, {**baseline, 'startTicks': 101}])
        with patch.dict(globals(), {'process_basics': lambda _: next(identities)}):
            raced = process_snapshot(fake_proc, (cache,))
            assert raced[41]['stable'] is False
            try:
                verify_processes_idle('', raced, 3600, 1000, 100)
                raise AssertionError('PID/start identity race accepted')
            except ValueError:
                pass
        try:
            clear_cache_contents(cache, before_delete=lambda: (_ for _ in ()).throw(ValueError('synthetic busy cache')))
            raise AssertionError('Busy cache callback accepted')
        except ValueError:
            assert cache_file.read_text() == 'cache data not read'
        app = root / 'study-plan'; app.mkdir()
        releases = root / 'study-plan-releases'; releases.mkdir()
        held = releases / 'held'; held.mkdir()
        source = releases / 'approved'; source.mkdir()
        protect_source(source, app, held, 'approved')
        for wrong in (app, held):
            try:
                protect_source(wrong, app, held, 'approved')
                raise AssertionError('Protected application accepted')
            except ValueError:
                pass
        retention = helper()
        (source / '.next').mkdir(); (source / '.next/BUILD_ID').write_text('synthetic')
        (source / '.env.local').write_text('synthetic private value'); (source / '.env.local').chmod(0o600)
        target_parent = root / 'archives'; target_parent.mkdir(mode=0o700)
        target = target_parent / 'approved'; pending = releases / '.pending'; receipt = target_parent / 'receipt.json'
        guard_retention_deletion(retention, {source: releases, target: root, pending: releases, target.with_suffix('.partial'): root}, {pending, target.with_suffix('.partial')})
        original = retention.tree(source)
        copy = retention.shutil.copytree
        def corrupt(*args, **kwargs):
            result = copy(*args, **kwargs)
            if Path(args[1]) == target.with_suffix('.partial'):
                (Path(args[1]) / '.next/BUILD_ID').write_text('corrupt')
            return result
        with patch.object(retention.shutil, 'copytree', side_effect=corrupt):
            try:
                retention.move_verified(source, target, pending, receipt, 'approved')
                raise AssertionError('Corrupt retained copy accepted')
            except ValueError:
                assert retention.tree(source) == original and not source.is_symlink()
        assert retention.move_verified(source, target, pending, receipt, 'approved') == 'archived-and-verified'
        assert source.is_symlink() and source.readlink() == target and retention.tree(target) == original
        assert stat.S_IMODE(receipt.stat().st_mode) == 0o600
        assert retention.move_verified(source, target, pending, receipt, 'approved') == 'already-archived'
        # A different real directory substituted after validation must not be deleted.
        (cache / 'download').write_text('cache payload')
        unrelated = root / 'unrelated'; unrelated.mkdir()
        (unrelated / 'marker').write_text('must remain')
        snapshot = inspect_directory_fd
        def replace_after_snapshot(*args, **kwargs):
            result = snapshot(*args, **kwargs)
            cache.rename(root / 'original-cache')
            unrelated.rename(cache)
            return result
        with patch.dict(globals(), {'inspect_directory_fd': replace_after_snapshot}):
            try:
                clear_cache_contents(cache)
                raise AssertionError('Root replacement accepted')
            except ValueError:
                assert (cache / 'marker').read_text() == 'must remain'
                assert (root / 'original-cache/download').read_text() == 'cache payload'
        with patch.dict(globals(), {'mounted_paths': lambda: {cache}}):
            try:
                clear_cache_contents(cache)
                raise AssertionError('Mounted cache root accepted')
            except ValueError:
                assert (cache / 'marker').read_text() == 'must remain'
        with patch.dict(globals(), {'mounted_paths': lambda: {target / 'mounted-child'}}):
            try:
                retention.tree(target)
                raise AssertionError('Mounted retention child accepted')
            except ValueError:
                assert (target / '.next/BUILD_ID').read_text() == 'synthetic'
    print('Capacity preparation tests passed: cache inode/mode/pointer preservation, root-replacement race rejection, mount/link rejection, busy-cache fd/cwd rejection, PID/start identity race rejection, installer descendant rejection, cache-idle start wrapper outside deployment paths, protected applications, corruption retention, verified archive and retry.')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    elif sys.argv[1:]:
        print('::error::Unexpected capacity preparation arguments')
        sys.exit(1)
    else:
        try:
            prepare()
        except Exception as error:
            print('::error::' + (str(error) if isinstance(error, ValueError) else 'Capacity preparation stopped (' + type(error).__name__ + '); protected copies retained'), flush=True)
            sys.exit(1)
