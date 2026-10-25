"""Read-only complete snapshot hashes and compressed-stream byte counts."""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile

if 'BASE' not in globals():
    spec = importlib.util.spec_from_file_location('storage_probe', Path(__file__).with_name('probe-english-six-deployment.py'))
    BASE = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(BASE)

PROTECTED = {
 'e00733cfa66583481e42f2acac0b4756c29e4383',
 'f262dc6438e48d3992f1abe2d0e291ff3108b222',
 '4d65d765912e1f9baf4553c7df5bebe9b16274eb',
 'bdc35f288531062f5abb029cd263bbd9b51d65b0',
}
CANDIDATES = (
 ('7540ccd7cee2d07796cce61318e79d1d1be9e923', 'EPpoBco83u1HYQZh8zD5H'),
 ('4965b74cab6699ed5cd84a9f1d22c7636a35ddb4', 'nUd-rWJKgW2dNJ7t3GKkl'),
)


def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid, info.st_size, info.st_mtime_ns, info.st_ctime_ns, info.st_nlink)


def attributes(target, symlink=False):
    options = {'follow_symlinks': False} if symlink else {}
    return tuple((name, hashlib.sha256(os.getxattr(target, name, **options)).hexdigest())
                 for name in sorted(os.listxattr(target, **options)))


def manifest(fd, hash_files=True):
    root_info = os.fstat(fd)
    records = {'.': ('directory', (stat.S_IMODE(root_info.st_mode), root_info.st_uid, root_info.st_gid, root_info.st_mtime_ns, attributes(fd)), None, identity(root_info))}
    device = os.fstat(fd).st_dev
    def walk(directory, prefix=''):
        for name in sorted(os.listdir(directory)):
            relative = prefix + name
            before = os.stat(name, dir_fd=directory, follow_symlinks=False)
            BASE.require(before.st_dev == device)
            common = (stat.S_IMODE(before.st_mode), before.st_uid, before.st_gid, before.st_mtime_ns)
            if stat.S_ISDIR(before.st_mode):
                child = BASE.child_dir(directory, name)
                try:
                    BASE.require(identity(os.fstat(child)) == identity(before))
                    records[relative] = ('directory', common + (attributes(child),), None, identity(before))
                    walk(child, relative + '/')
                finally:
                    os.close(child)
            elif stat.S_ISLNK(before.st_mode):
                target = os.readlink(name, dir_fd=directory)
                after = os.stat(name, dir_fd=directory, follow_symlinks=False)
                BASE.require(identity(before) == identity(after))
                link_attributes = attributes('/proc/self/fd/' + str(directory) + '/' + name, True)
                BASE.require(identity(before) == identity(os.stat(name, dir_fd=directory, follow_symlinks=False)))
                records[relative] = ('symlink', common + (link_attributes,), target, identity(before))
            elif stat.S_ISREG(before.st_mode):
                digest = None
                file_attributes = None
                if hash_files:
                    file_fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_NOATIME, dir_fd=directory)
                    try:
                        BASE.require(identity(os.fstat(file_fd)) == identity(before))
                        file_attributes = attributes(file_fd)
                        h = hashlib.sha256()
                        while True:
                            data = os.read(file_fd, 1024 * 1024)
                            if not data:
                                break
                            h.update(data)
                        digest = h.hexdigest()
                        BASE.require(identity(os.fstat(file_fd)) == identity(before))
                    finally:
                        os.close(file_fd)
                else:
                    file_attributes = attributes('/proc/self/fd/' + str(directory) + '/' + name, True)
                records[relative] = ('file', common + (file_attributes, before.st_size), digest, identity(before))
            else:
                raise ValueError('Unsupported retained entry')
    walk(fd)
    links = {}
    for name, record in records.items():
        if record[0] == 'file':
            links.setdefault(record[3][0:2], []).append(name)
    for name, record in list(records.items()):
        group = tuple(links[record[3][0:2]]) if record[0] == 'file' else ()
        if record[0] == 'file':
            BASE.require(record[3][-1] == len(group))
        records[name] = record + (group if len(group) > 1 else (),)
    return records


def unchanged(fd, before):
    after = manifest(fd, False)
    BASE.require(set(before) == set(after))
    BASE.require(all(before[name][0:2] == after[name][0:2] and before[name][3:] == after[name][3:]
                     and (before[name][0] != 'symlink' or before[name][2] == after[name][2]) for name in before))


def count_compressed(fd, compressor):
    # GNU tar reads with O_NOATIME. All output remains in pipes and is counted;
    # no archive, source copy, cache or temporary file is written on production.
    tar = subprocess.Popen(['tar', '--format=pax', '--numeric-owner', '--xattrs', '--xattrs-include=*', '--acls', '--sparse',
                            '--atime-preserve=system', '--pax-option=delete=atime,delete=ctime',
                            '-C', '/proc/self/fd/' + str(fd), '-cpf', '-', '.'],
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, pass_fds=(fd,))
    zipper = subprocess.Popen(compressor, stdin=tar.stdout, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    tar.stdout.close()
    total = 0
    try:
        while True:
            chunk = zipper.stdout.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
        BASE.require(zipper.wait() == 0 and tar.wait() == 0)
    finally:
        zipper.stdout.close()
        for process in (zipper, tar):
            if process.poll() is None:
                process.terminate()
                process.wait()
    return total


def reusable(source, archives):
    same_path = set()
    by_content = set()
    total = complete = 0
    for item in archives:
        if {name: record[0:3] + record[4:] for name, record in source.items()} == {name: record[0:3] + record[4:] for name, record in item.items()}:
            complete += 1
        for name, record in item.items():
            if record[0] == 'file':
                signature = record[0:3] + record[4:]
                same_path.add((name, signature))
                by_content.add(signature)
    source_files = [(name, record) for name, record in source.items() if record[0] == 'file']
    total = sum(record[1][-1] for _, record in source_files)
    exact = sum(record[1][-1] for name, record in source_files if (name, record[0:3] + record[4:]) in same_path)
    content = sum(record[1][-1] for _, record in source_files if record[0:3] + record[4:] in by_content)
    return {'sourceRegularBytes': total, 'samePathContentMetadataBytes': exact,
            'sameContentMetadataBytes': content, 'unmatchedContentMetadataBytes': total - content,
            'completeMatchingArchiveCount': complete}


def used_by_process(fd):
    source = os.readlink('/proc/self/fd/' + str(fd))
    pinned = os.fstat(fd)
    BASE.require(stat.S_ISDIR(pinned.st_mode) and fcntl.fcntl(fd, fcntl.F_GETFL) & os.O_ACCMODE == os.O_RDONLY)
    before = set(path.name for path in Path('/proc').glob('[0-9]*') if path.name.isdigit())
    for pid in before:
        try:
            process = Path('/proc') / pid
            first = (process / 'stat').read_text()
            started = first[first.rfind(')') + 2:].split()[19]
            paths = []
            for name in ('cwd', 'exe'):
                try:
                    paths.append(os.readlink(process / name).removesuffix(' (deleted)'))
                except FileNotFoundError:
                    pass
            for descriptor in (process / 'fd').iterdir():
                if int(pid) == os.getpid() and descriptor.name == str(fd):
                    BASE.require(identity(os.fstat(fd)) == identity(pinned))
                    continue  # Only this exact validated read-only directory pin.
                try:
                    paths.append(os.readlink(descriptor).removesuffix(' (deleted)'))
                except FileNotFoundError:
                    pass
            if any(current == source or current.startswith(source + '/') for current in paths):
                return True
            last = (process / 'stat').read_text()
            BASE.require(last[last.rfind(')') + 2:].split()[19] == started)
        except (FileNotFoundError, PermissionError, ProcessLookupError, OSError, IndexError):
            raise ValueError('Runtime-reference scan changed')
    BASE.require(before == set(path.name for path in Path('/proc').glob('[0-9]*') if path.name.isdigit()))
    return False


def reject_submounts(fd):
    root = os.readlink('/proc/self/fd/' + str(fd))
    with open('/proc/self/mountinfo', encoding='utf8') as source:
        for line in source:
            fields = line.split()
            point = fields[4]
            for escaped, actual in (('\\040', ' '), ('\\011', '\t'), ('\\012', '\n'), ('\\134', '\\')):
                point = point.replace(escaped, actual)
            BASE.require(point != root and not point.startswith(root + '/'))


def main():
    BASE.require(os.geteuid() == 0)
    handles = []
    try:
        app = BASE.open_dir(BASE.APP); handles.append(app)
        releases = BASE.open_dir(BASE.RELEASES); handles.append(releases)
        data = BASE.open_dir(BASE.DATA); handles.append(data)
        lockdir = BASE.open_dir('/run/study-plan-release'); handles.append(lockdir)
        lock = os.open('lock', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=lockdir); handles.append(lock)
        lockinfo = os.fstat(lock)
        BASE.require(stat.S_ISREG(lockinfo.st_mode) and lockinfo.st_uid == 0 and stat.S_IMODE(lockinfo.st_mode) == 0o600 and lockinfo.st_nlink == 1)
        fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
        active = BASE.metadata(app)
        BASE.require(active and active['buildMatchesMetadata'] and active['commit'] in PROTECTED)
        root_device = os.fstat(releases).st_dev
        BASE.require(root_device == os.fstat(app).st_dev != os.fstat(data).st_dev)
        retained = []
        selected = {}
        for name in sorted(os.listdir(releases)):
            if not __import__('re').fullmatch(r'[A-Za-z0-9._-]{1,180}', name):
                continue
            info = os.stat(name, dir_fd=releases, follow_symlinks=False)
            if not stat.S_ISDIR(info.st_mode):
                continue
            fd = BASE.child_dir(releases, name)
            meta = BASE.metadata(fd)
            if not meta:
                os.close(fd); continue
            on_root = os.fstat(fd).st_dev == root_device
            retained.append({'metadata': meta, 'onRootFilesystem': on_root, 'protected': meta['commit'] in PROTECTED})
            pair = (meta['commit'], meta['buildId'])
            if pair in CANDIDATES:
                BASE.require(on_root and meta['commit'] not in PROTECTED and meta['buildMatchesMetadata'] and pair not in selected and not used_by_process(fd))
                selected[pair] = fd; handles.append(fd)
            else:
                os.close(fd)
        BASE.require(set(selected) == set(CANDIDATES))
        print('Read-only retained-copy compression sizing started.', flush=True)
        sources = {}
        results = []
        for pair in CANDIDATES:
            fd = selected[pair]
            reject_submounts(fd)
            source = manifest(fd); sources[pair] = source
            gzip_bytes = count_compressed(fd, ['gzip', '-9', '-n', '-c'])
            unchanged(fd, source)
            measured = {'metadata': BASE.metadata(fd), 'onRootFilesystem': True, 'noRuntimeReferences': True,
                        'size': BASE.sizes(fd), 'gzip9Bytes': gzip_bytes}
            results.append(measured)
            print('RETAINED_COMPRESSION_CANDIDATE ' + json.dumps(BASE.safe_log(measured), separators=(',', ':')), flush=True)
        archive_manifests = []
        for category in ('failed-release-archives', 'retained-release-archives'):
            parent = BASE.child_dir(data, category)
            try:
                names = sorted(os.listdir(parent)); BASE.require(len(names) <= 100)
                for name in names:
                    info = os.stat(name, dir_fd=parent, follow_symlinks=False)
                    if not stat.S_ISDIR(info.st_mode):
                        continue
                    fd = BASE.child_dir(parent, name)
                    try:
                        BASE.require(os.fstat(fd).st_dev == os.fstat(data).st_dev)
                        reject_submounts(fd)
                        archive_manifests.append(manifest(fd))
                    finally:
                        os.close(fd)
            finally:
                os.close(parent)
        for pair, result in zip(CANDIDATES, results):
            unchanged(selected[pair], sources[pair])
            result['reusableArchiveBytes'] = reusable(sources[pair], archive_manifests)
        BASE.require(BASE.metadata(app) == active)
        report = {'schema': 'retained-release-compression-read-only-v1', 'readOnly': True,
                  'rootFreeBytes': shutil.disk_usage(BASE.RELEASES).free, 'dataFreeBytes': shutil.disk_usage(BASE.DATA).free,
                  'active': active, 'retained': retained, 'candidates': results, 'dataArchivesCompared': len(archive_manifests),
                  'zstdAvailable': bool(shutil.which('zstd'))}
        print('RETAINED_COMPRESSION_REPORT ' + json.dumps(BASE.safe_log(report), separators=(',', ':')), flush=True)
    finally:
        for descriptor in reversed(handles):
            os.close(descriptor)


def self_test():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        (root / 'sub').mkdir(); (root / 'sub/file').write_bytes(b'synthetic teaching build ' * 4096)
        os.link(root / 'sub/file', root / 'sub/linked')
        (root / 'external-link').symlink_to('/never-read-external')
        fd = BASE.open_dir(directory)
        try:
            before = manifest(fd)
            BASE.require(before['sub/file'][4] == ('sub/file', 'sub/linked'))
            BASE.require(before['external-link'][0] == 'symlink')
            BASE.require(count_compressed(fd, ['gzip', '-9', '-n', '-c']) > 0)
            unchanged(fd, before)
            clone = {name: (record[0], record[1], record[2], (), record[4]) for name, record in before.items()}
            match = reusable(before, [clone])
            BASE.require(match['unmatchedContentMetadataBytes'] == 0)
            BASE.require(match['completeMatchingArchiveCount'] == 1)
            outside = root.parent / (root.name + '-outside-link')
            os.link(root / 'sub/file', outside)
            try:
                try:
                    manifest(fd)
                    raise AssertionError('External hard link not rejected')
                except ValueError:
                    pass
            finally:
                outside.unlink()
            (root / 'sub/file').write_bytes(b'changed')
            try:
                unchanged(fd, before)
                raise AssertionError('Mutation not detected')
            except ValueError:
                pass
        finally:
            os.close(fd)
    print('Read-only stream sizing and reuse synthetic checks passed.')


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--self-test']:
            self_test()
        elif sys.argv[1:]:
            raise ValueError('Unsupported invocation')
        else:
            main()
    except Exception:
        print('Read-only retained-copy sizing blocked; no production files changed.', flush=True)
        sys.exit(1)
