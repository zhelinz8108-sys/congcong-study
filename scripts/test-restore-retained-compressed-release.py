"""Offline synthetic tests for complete private archive verification/restoration."""
import base64
import copy
from decimal import Decimal
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
from unittest import mock


SCRIPT = Path(__file__).with_name('restore-retained-compressed-release.py')
CHECKS = 0


def require(value, label):
    if not value:
        raise AssertionError(label)


def load_tool():
    spec = importlib.util.spec_from_file_location('retained_restore_tool', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def read_noatime(filename):
    fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | getattr(os, 'O_NOATIME', 0))
    try:
        result = []
        while True:
            data = os.read(fd, 65536)
            if not data:
                return b''.join(result)
            result.append(data)
    finally:
        os.close(fd)


def xattrs(filename, link=False):
    options = {'follow_symlinks': False} if link else {}
    return {name: base64.b64encode(os.getxattr(filename, name, **options)).decode('ascii')
            for name in sorted(os.listxattr(filename, **options))}


def source_manifest(root):
    # Traverse first, then collect directory timestamps so the traversal's own
    # possible relatime updates do not make the authoritative snapshot stale.
    paths = [root, *sorted(root.rglob('*'))]
    records = {}
    groups = {}
    for filename in paths:
        name = '.' if filename == root else filename.relative_to(root).as_posix()
        before = filename.lstat()
        target = os.readlink(filename) if stat.S_ISLNK(before.st_mode) else None
        info = filename.lstat()
        value = {'kind': 'directory' if stat.S_ISDIR(info.st_mode) else 'symlink' if stat.S_ISLNK(info.st_mode) else 'file',
                 'mode': stat.S_IMODE(info.st_mode), 'uid': info.st_uid, 'gid': info.st_gid,
                 'mtimeNs': str(info.st_mtime_ns), 'atimeNs': str(info.st_atime_ns),
                 'xattrs': xattrs(filename, stat.S_ISLNK(info.st_mode))}
        if value['kind'] == 'file':
            raw = read_noatime(filename)
            value.update(size=len(raw), sha256=hashlib.sha256(raw).hexdigest(), hardlinkGroup=[])
            groups.setdefault((info.st_dev, info.st_ino), []).append(name)
        elif value['kind'] == 'symlink':
            value['target'] = target
        records[name] = value
    for members in groups.values():
        if len(members) > 1:
            for name in members:
                records[name]['hardlinkGroup'] = sorted(members)
    return {'version': 1, 'entries': records}


def write_private(filename, raw):
    fd = os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        position = 0
        while position < len(raw):
            position += os.write(fd, raw[position:])
    finally:
        os.close(fd)


def gnu_archive(root, filename):
    with filename.open('xb') as output:
        os.chmod(filename, 0o600)
        creator = subprocess.Popen(['tar', '--format=pax', '--numeric-owner', '--xattrs', '--xattrs-include=*',
                                    '--acls', '--sparse', '--atime-preserve=system',
                                    '--pax-option=delete=atime,delete=ctime', '-C', str(root), '-cpf', '-', '.'],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        zipper = subprocess.Popen(['gzip', '-9', '-n', '-c'], stdin=creator.stdout, stdout=output, stderr=subprocess.PIPE)
        creator.stdout.close()
        _, zip_error = zipper.communicate(timeout=30)
        tar_error = creator.stderr.read()
        creator.wait(timeout=30)
        require(creator.returncode == 0 and zipper.returncode == 0 and not tar_error and not zip_error,
                'GNU tar and gzip must create the valid synthetic archive')


def member_for(name, entry, primary):
    info = tarfile.TarInfo('./' if name == '.' else './' + name)
    info.mode = entry['mode']; info.uid = entry['uid']; info.gid = entry['gid']
    mtime = Decimal(entry['mtimeNs']) / Decimal(1000000000)
    info.mtime = int(mtime)
    info.pax_headers = {'mtime': str(mtime)}
    if entry['kind'] == 'directory':
        info.type = tarfile.DIRTYPE; info.size = 0
    elif entry['kind'] == 'symlink':
        info.type = tarfile.SYMTYPE; info.linkname = entry['target']; info.size = 0
    elif entry['hardlinkGroup'] and name != primary[tuple(entry['hardlinkGroup'])]:
        info.type = tarfile.LNKTYPE; info.linkname = './' + primary[tuple(entry['hardlinkGroup'])]; info.size = 0
    else:
        info.type = tarfile.REGTYPE; info.size = entry['size']
    return info


def manual_archive(root, manifest, filename, omit=None, change=None, extra=None):
    memory = io.BytesIO()
    entries = manifest['entries']
    primary = {tuple(entry['hardlinkGroup']): entry['hardlinkGroup'][0]
               for entry in entries.values() if entry['kind'] == 'file' and entry['hardlinkGroup']}
    def order(name):
        entry = entries[name]
        category = (0 if entry['kind'] == 'directory' else 3 if entry['kind'] == 'symlink'
                    else 2 if entry['hardlinkGroup'] and name != primary[tuple(entry['hardlinkGroup'])] else 1)
        return category, name.count('/'), name
    ordered = sorted(entries, key=order)
    with tarfile.open(fileobj=memory, mode='w', format=tarfile.PAX_FORMAT) as archive:
        for name in ordered:
            if name == omit:
                continue
            entry = entries[name]
            info = member_for(name, entry, primary)
            if change:
                info = change(name, info)
            body = read_noatime(root / name) if info.isfile() and name in entries and entry['kind'] == 'file' else None
            archive.addfile(info, io.BytesIO(body) if body is not None else None)
        if extra:
            for info, body in extra:
                archive.addfile(info, io.BytesIO(body) if body is not None else None)
    write_private(filename, gzip.compress(memory.getvalue(), compresslevel=9, mtime=0))
    return memory.getvalue()


def rejects(function, label):
    global CHECKS
    try:
        function()
    except Exception:
        CHECKS += 1
        return
    raise AssertionError('Expected rejection: ' + label)


def run():
    global CHECKS
    tool = load_tool()
    with tempfile.TemporaryDirectory(prefix='retained-restore-tests-') as temporary:
        work = Path(temporary); os.chmod(work, 0o700)
        root = work / 'source'; root.mkdir(mode=0o700)
        (root / 'sub directory').mkdir(mode=0o750)
        primary = root / 'sub directory' / 'a-primary.bin'
        primary.write_bytes((b'complete rollback contents\x00\xff\n' * 4096) + b'END')
        os.chmod(primary, 0o640)
        os.link(primary, root / 'z-hardlink.bin')
        escaped = ['space name.txt', 'line\nbreak.txt', 'back\\slash.txt', '中文资料.txt']
        for number, name in enumerate(escaped):
            (root / name).write_bytes(('synthetic-' + str(number)).encode('utf8'))
        outside = work / 'outside-marker'; outside.write_bytes(b'OUTSIDE MARKER MUST NOT CHANGE')
        before_outside = read_noatime(outside)
        (root / 'outside-link').symlink_to(outside)
        xattr_supported = False
        try:
            os.setxattr(primary, 'user.retained-restore-test', b'raw\x00binary\xffvalue')
            xattr_supported = True
        except OSError:
            pass
        fixed_mtime = 1700000000123456789
        fixed_atime = 1700000001123456789
        for filename in sorted(root.rglob('*'), key=lambda item: len(item.parts), reverse=True):
            os.utime(filename, ns=(fixed_atime, fixed_mtime), follow_symlinks=False)
        os.utime(root, ns=(fixed_atime, fixed_mtime))
        manifest = source_manifest(root)
        require(tool.validate_manifest(copy.deepcopy(manifest))['entries'] == manifest['entries'], 'Manifest protocol')
        archive = work / 'valid.tar.gz'; gnu_archive(root, archive)
        tool.verify_archive(archive, manifest); CHECKS += 1
        restored = work / 'restored'
        tool.restore_archive(archive, manifest, restored)
        tool.verify_tree(restored, manifest); CHECKS += 1
        require(read_noatime(restored / escaped[1]) == read_noatime(root / escaped[1]), 'Escaped names preserved')
        require(os.readlink(restored / 'outside-link') == str(outside), 'Outside symlink stored exactly')
        restored_primary = (restored / 'sub directory/a-primary.bin').stat()
        restored_link = (restored / 'z-hardlink.bin').stat()
        require((restored_primary.st_dev, restored_primary.st_ino) == (restored_link.st_dev, restored_link.st_ino)
                and restored_primary.st_nlink == 2, 'Hardlink inode group preserved')
        if xattr_supported:
            require(os.getxattr(restored / 'z-hardlink.bin', 'user.retained-restore-test') == b'raw\x00binary\xffvalue', 'Raw xattr preserved')
        require(read_noatime(outside) == before_outside, 'Outside marker unchanged after legitimate restore')
        CHECKS += 1

        raw = read_noatime(archive)
        unpacked = gzip.decompress(raw)
        with tarfile.open(fileobj=io.BytesIO(unpacked), mode='r:') as parsed:
            last_member_end = max(member.offset_data + ((member.size + 511) // 512) * 512 for member in parsed)
        malformed = {
            'crc': raw[:-8] + bytes([raw[-8] ^ 1]) + raw[-7:],
            'truncated-gzip': raw[:-5],
            'concatenated-gzip-members': raw + raw,
            'compressed-trailing-junk': raw + b'UNEXPECTED TRAILING CONTENT',
            'uncompressed-trailing-junk': gzip.compress(gzip.decompress(raw) + b'X' * 512, mtime=0),
            'second-tar-after-zero-trailer': gzip.compress(gzip.decompress(raw) + gzip.decompress(raw), mtime=0),
            'missing-tar-zero-trailer': gzip.compress(unpacked[:last_member_end], mtime=0),
            'single-tar-zero-block': gzip.compress(unpacked[:last_member_end] + bytes(512), mtime=0),
        }
        for label, invalid_bytes in malformed.items():
            invalid = work / (label + '.tar.gz'); write_private(invalid, invalid_bytes)
            rejects(lambda invalid=invalid: tool.verify_archive(invalid, manifest), label)
            destination = work / ('reject-' + label)
            rejects(lambda invalid=invalid, destination=destination: tool.restore_archive(invalid, manifest, destination), label + ' restore')
            require(read_noatime(outside) == before_outside, 'Corrupt archive cannot change outside marker')

        manual = work / 'manual-valid.tar.gz'
        manual_raw = manual_archive(root, manifest, manual)
        tool.verify_archive(manual, manifest); CHECKS += 1
        missing = work / 'missing.tar.gz'; manual_archive(root, manifest, missing, omit=escaped[0])
        rejects(lambda: tool.verify_archive(missing, manifest), 'Missing member')
        duplicate = work / 'duplicate.tar.gz'
        duplicate_info = member_for('.', manifest['entries']['.'], {})
        manual_archive(root, manifest, duplicate, extra=[(duplicate_info, None)])
        rejects(lambda: tool.verify_archive(duplicate, manifest), 'Duplicate member')
        traversal = work / 'traversal.tar.gz'
        traversal_info = tarfile.TarInfo('../outside-marker'); traversal_info.size = 7
        manual_archive(root, manifest, traversal, extra=[(traversal_info, b'changed')])
        rejects(lambda: tool.restore_archive(traversal, manifest, work / 'traversal-restore'), 'Traversal member')
        absolute = work / 'absolute.tar.gz'
        absolute_info = tarfile.TarInfo(str(outside)); absolute_info.size = 7
        manual_archive(root, manifest, absolute, extra=[(absolute_info, b'changed')])
        rejects(lambda: tool.restore_archive(absolute, manifest, work / 'absolute-restore'), 'Absolute member')

        hardlink_escape = work / 'hardlink-escape.tar.gz'
        def escape_link(name, info):
            if name == 'z-hardlink.bin':
                info.type = tarfile.LNKTYPE; info.linkname = '../outside-marker'; info.size = 0
            return info
        manual_archive(root, manifest, hardlink_escape, change=escape_link)
        rejects(lambda: tool.restore_archive(hardlink_escape, manifest, work / 'hardlink-escape-restore'), 'Hardlink target escape')
        symlink_prefix = copy.deepcopy(manifest)
        symlink_prefix['entries']['outside-link/escape-file'] = copy.deepcopy(manifest['entries'][escaped[0]])
        rejects(lambda: tool.validate_manifest(symlink_prefix), 'Manifest symlink prefix')
        rejects(lambda: tool.restore_archive(manual, symlink_prefix, work / 'symlink-prefix-restore'), 'Restore symlink prefix')

        wrong_hash = copy.deepcopy(manifest); wrong_hash['entries'][escaped[0]]['sha256'] = '0' * 64
        rejects(lambda: tool.verify_archive(manual, wrong_hash), 'File digest mismatch')
        wrong_mode = work / 'wrong-mode.tar.gz'
        def change_mode(name, info):
            if name == escaped[0]: info.mode ^= 0o004
            return info
        manual_archive(root, manifest, wrong_mode, change=change_mode)
        rejects(lambda: tool.verify_archive(wrong_mode, manifest), 'Mode mismatch')
        for owner_field in ('uid', 'gid'):
            wrong_owner = work / ('wrong-' + owner_field + '.tar.gz')
            def change_owner(name, info, owner_field=owner_field):
                if name == escaped[0]: setattr(info, owner_field, getattr(info, owner_field) + 1)
                return info
            manual_archive(root, manifest, wrong_owner, change=change_owner)
            rejects(lambda wrong_owner=wrong_owner: tool.verify_archive(wrong_owner, manifest), owner_field + ' mismatch')
        special = work / 'special-file.tar.gz'
        def change_special(name, info):
            if name == escaped[0]: info.type = tarfile.FIFOTYPE; info.size = 0
            return info
        manual_archive(root, manifest, special, change=change_special)
        rejects(lambda: tool.restore_archive(special, manifest, work / 'special-file-restore'), 'Special filesystem member')
        wrong_mtime = work / 'wrong-mtime.tar.gz'
        def change_mtime(name, info):
            if name == escaped[0]: info.pax_headers['mtime'] = str(Decimal(manifest['entries'][name]['mtimeNs']) / Decimal(1000000000) + Decimal('0.000000001'))
            return info
        manual_archive(root, manifest, wrong_mtime, change=change_mtime)
        rejects(lambda: tool.verify_archive(wrong_mtime, manifest), 'Nanosecond mtime mismatch')
        if xattr_supported:
            bad_xattr = work / 'wrong-xattr.tar.gz'
            def change_xattr(name, info):
                if name == 'sub directory/a-primary.bin': info.pax_headers['SCHILY.xattr.user.retained-restore-test'] = 'not-the-original-value'
                return info
            manual_archive(root, manifest, bad_xattr, change=change_xattr)
            rejects(lambda: tool.verify_archive(bad_xattr, manifest), 'PAX raw xattr mismatch')

        outside_parent = work / 'real-parent'; outside_parent.mkdir(mode=0o700)
        parent_link = work / 'parent-link'; parent_link.symlink_to(outside_parent, target_is_directory=True)
        rejects(lambda: tool.restore_archive(manual, manifest, parent_link / 'new-directory'), 'Symlink destination ancestor')
        require(not (outside_parent / 'new-directory').exists(), 'Symlink parent cannot create outside directory')
        existing = work / 'existing'; existing.mkdir(mode=0o700)
        (existing / 'marker').write_bytes(b'existing destination must remain')
        rejects(lambda: tool.restore_archive(manual, manifest, existing), 'Existing destination')
        require(read_noatime(existing / 'marker') == b'existing destination must remain', 'Existing destination retained')
        unsafe_parent = work / 'unsafe-parent'; unsafe_parent.mkdir(mode=0o777); os.chmod(unsafe_parent, 0o777)
        rejects(lambda: tool.restore_archive(manual, manifest, unsafe_parent / 'new-directory'), 'Non-private destination parent')
        require(not (unsafe_parent / 'new-directory').exists(), 'Unsafe parent untouched')
        require(read_noatime(outside) == before_outside, 'Every rejection retains outside marker')

        # Exercise GNU PAX sparse bookkeeping with real holes, rather than a
        # zero-filled regular tar member. Restoration may allocate the holes.
        sparse_root = work / 'sparse-source'; sparse_root.mkdir(mode=0o700)
        sparse_file = sparse_root / 'sparse-image.bin'
        logical_size = 2 * 1024 * 1024 + 8192
        with sparse_file.open('xb') as output:
            output.write(b'SPARSE HEAD\x00')
            output.seek(logical_size - len(b'SPARSE TAIL'))
            output.write(b'SPARSE TAIL')
            output.truncate(logical_size)
        os.chmod(sparse_file, 0o640)
        os.utime(sparse_file, ns=(fixed_atime, 1700000000987654321))
        require(sparse_file.stat().st_blocks * 512 < logical_size, 'Synthetic source must contain real sparse holes')
        sparse_manifest = source_manifest(sparse_root)
        sparse_archive = work / 'sparse-valid.tar.gz'; gnu_archive(sparse_root, sparse_archive)
        with tarfile.open(sparse_archive, mode='r:gz') as parsed:
            sparse_member = next(member for member in parsed if member.name.removeprefix('./') == 'sparse-image.bin')
            require(sparse_member.issparse(), 'GNU tar must emit an actual sparse member')
        tool.verify_archive(sparse_archive, sparse_manifest); CHECKS += 1
        sparse_restored = work / 'sparse-restored'
        tool.restore_archive(sparse_archive, sparse_manifest, sparse_restored)
        tool.verify_tree(sparse_restored, sparse_manifest)
        restored_bytes = read_noatime(sparse_restored / 'sparse-image.bin')
        require(len(restored_bytes) == logical_size and hashlib.sha256(restored_bytes).hexdigest()
                == sparse_manifest['entries']['sparse-image.bin']['sha256'], 'Sparse logical size and SHA preserved')
        CHECKS += 1

        # Exercise the production fd-based writer instead of only the fixture's
        # independent manifest builder. Intercept every os.open during capture
        # so even an attempted open through the outside symlink is detected.
        outside_identity = (outside.stat().st_dev, outside.stat().st_ino)
        outside_before_capture = outside.stat()
        original_open = tool.os.open
        outside_opened = []
        def watched_open(*args, **kwargs):
            descriptor = original_open(*args, **kwargs)
            observed = os.fstat(descriptor)
            if (observed.st_dev, observed.st_ino) == outside_identity:
                outside_opened.append(True)
                os.close(descriptor)
                raise AssertionError('Source manifest writer opened an external symlink target')
            return descriptor
        source_fd = original_open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | getattr(os, 'O_NOATIME', 0))
        try:
            with mock.patch.object(tool.os, 'open', side_effect=watched_open):
                fd_manifest, fd_snapshot, allocated_bytes = tool.source_manifest_fd(source_fd)
        finally:
            os.close(source_fd)
        require(not outside_opened, 'Fd manifest capture never opens the outside target inode')
        require(outside.stat().st_atime_ns == outside_before_capture.st_atime_ns
                and read_noatime(outside) == before_outside, 'Fd capture preserves external target content and atime')
        require(fd_snapshot is not None and type(allocated_bytes) is int and allocated_bytes > 0,
                'Fd writer returns a stability snapshot and allocated-byte count')
        tool.validate_manifest(fd_manifest); CHECKS += 1
        fd_archive = work / 'fd-manifest-valid.tar.gz'; gnu_archive(root, fd_archive)
        tool.verify_archive(fd_archive, fd_manifest)
        fd_restored = work / 'fd-manifest-restored'
        tool.restore_archive(fd_archive, fd_manifest, fd_restored)
        tool.verify_tree(fd_restored, fd_manifest)
        require(read_noatime(fd_restored / escaped[0]) == read_noatime(root / escaped[0]), 'Fd writer full roundtrip preserves logical content')
        CHECKS += 1
        external_hardlink = work / 'outside-tree-hardlink'
        os.link(primary, external_hardlink)
        source_fd = original_open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | getattr(os, 'O_NOATIME', 0))
        try:
            rejects(lambda: tool.source_manifest_fd(source_fd), 'Source inode has a tree-external hardlink')
        finally:
            os.close(source_fd)
            external_hardlink.unlink()

        # Private CLI failures must remain generic; no paths, payload or keys.
        manifest_file = work / 'manifest.json'; write_private(manifest_file, json.dumps(manifest).encode('utf8'))
        command = subprocess.run([sys.executable, '-B', str(SCRIPT), '--verify', str(work / 'crc.tar.gz'), '--manifest', str(manifest_file)],
                                 capture_output=True, text=True, timeout=30)
        require(command.returncode != 0, 'CLI rejects corruption')
        require(str(work) not in command.stdout + command.stderr and 'OUTSIDE MARKER' not in command.stdout + command.stderr,
                'CLI failure output remains private')
        CHECKS += 1
        private_argument = str(work / 'private-unrecognized-argument')
        unknown = subprocess.run([sys.executable, '-B', str(SCRIPT), '--verify', str(archive), '--manifest', str(manifest_file),
                                  '--unrecognized-private-option', private_argument], capture_output=True, text=True, timeout=30)
        require(unknown.returncode != 0, 'CLI rejects unknown argument')
        require(private_argument not in unknown.stdout + unknown.stderr and str(work) not in unknown.stdout + unknown.stderr,
                'Unknown CLI argument must not expose its private path')
        CHECKS += 1
    print('PASS: synthetic PAX/gzip restoration; escaped names, nanosecond metadata, hardlinks and xattrs; complete entry/hash/header checks; corruption, trailing members, traversal, symlink prefixes and hardlink escapes rejected; outside markers preserved (' + str(CHECKS) + ' checks).')


if __name__ == '__main__':
    run()
