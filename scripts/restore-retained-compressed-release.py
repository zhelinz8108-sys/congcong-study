"""Verify and restore a private retained tar.gz into a new private directory.

No activation, source removal, or production configuration changes occur here.
The private sidecar is authoritative for exact timestamps and raw xattrs.
"""
import argparse
import base64
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
import os
from pathlib import PurePosixPath
import re
import stat
import sys
import tarfile
import zlib

MAX_ENTRIES = 200000
MAX_LOGICAL_BYTES = 128 * 1024 ** 3
CHUNK = 1024 * 1024
NOATIME = getattr(os, 'O_NOATIME', 0)


def require(condition):
    if not condition:
        raise ValueError('Retained archive operation blocked')


def _identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_size, info.st_mtime_ns, info.st_ctime_ns, info.st_nlink)


def _path(value, archive=False):
    require(isinstance(value, str) and value and '\0' not in value and len(value.encode('utf8', 'surrogateescape')) <= 4096)
    if archive:
        while value.startswith('./'):
            value = value[2:]
        if value.endswith('/'):
            value = value[:-1]
        if not value:
            value = '.'
    require(not value.startswith('/'))
    if value == '.':
        return value
    parts = value.split('/')
    require(len(parts) <= 256 and all(part not in ('', '.', '..') and len(part.encode('utf8', 'surrogateescape')) <= 255 for part in parts))
    require(str(PurePosixPath(value)) == value)
    return value


def _nanoseconds(value):
    require(isinstance(value, str) and re.fullmatch(r'-?(?:0|[1-9][0-9]*)', value))
    result = int(value)
    require(abs(result) < 2 ** 63)
    return result


def _attribute_bytes(values):
    require(isinstance(values, dict) and len(values) <= 256)
    decoded = {}
    for name, raw in values.items():
        require(isinstance(name, str) and name and '\0' not in name and len(name.encode('utf8')) <= 255)
        require(isinstance(raw, str) and len(raw) <= 90000)
        value = base64.b64decode(raw, validate=True)
        require(len(value) <= 65536 and base64.b64encode(value).decode('ascii') == raw)
        decoded[name] = value
    return decoded


def validate_manifest(value):
    require(isinstance(value, dict) and type(value.get('version')) is int and value.get('version') == 1 and isinstance(value.get('entries'), dict))
    entries = value['entries']
    require(0 < len(entries) <= MAX_ENTRIES and '.' in entries)
    common = {'kind', 'mode', 'uid', 'gid', 'mtimeNs', 'atimeNs', 'xattrs'}
    logical = 0
    for name, entry in entries.items():
        require(_path(name) == name and isinstance(entry, dict))
        kind = entry.get('kind')
        require(kind in ('directory', 'file', 'symlink'))
        expected = common | ({'size', 'sha256', 'hardlinkGroup'} if kind == 'file' else {'target'} if kind == 'symlink' else set())
        require(set(entry) == expected)
        require(type(entry['mode']) is int and 0 <= entry['mode'] <= 0o7777)
        for field in ('uid', 'gid'):
            require(type(entry[field]) is int and 0 <= entry[field] < 2 ** 32 - 1)
        _nanoseconds(entry['mtimeNs']); _nanoseconds(entry['atimeNs']); _attribute_bytes(entry['xattrs'])
        if kind == 'file':
            require(type(entry['size']) is int and 0 <= entry['size'] <= MAX_LOGICAL_BYTES)
            logical += entry['size']
            require(logical <= MAX_LOGICAL_BYTES and isinstance(entry['sha256'], str) and re.fullmatch(r'[0-9a-f]{64}', entry['sha256']))
            group = entry['hardlinkGroup']
            require(isinstance(group, list) and (not group or len(group) >= 2))
            require(all(isinstance(member, str) and _path(member) == member for member in group))
            require(group == sorted(set(group)) and (not group or name in group))
        elif kind == 'symlink':
            require(isinstance(entry['target'], str) and entry['target'] and '\0' not in entry['target'])
            require(entry['mode'] == 0o777)
    require(entries['.']['kind'] == 'directory')
    for name, entry in entries.items():
        if name != '.':
            parent = str(PurePosixPath(name).parent)
            require(parent in entries and entries[parent]['kind'] == 'directory')
        if entry['kind'] == 'file' and entry['hardlinkGroup']:
            for member in entry['hardlinkGroup']:
                other = entries.get(member)
                require(other == entry)
    return {'version': 1, 'entries': entries}


def _absolute_parts(value):
    value = os.fspath(value)
    require(isinstance(value, str) and value.startswith('/') and '\0' not in value)
    parts = value.split('/')[1:]
    require(parts and all(part not in ('', '.', '..') for part in parts))
    return parts


def _open_directory(value):
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in _absolute_parts(os.path.abspath(value)):
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd); fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def _open_parent(value):
    absolute = os.path.abspath(value)
    parent, name = os.path.split(absolute)
    require(name not in ('', '.', '..') and '/' not in name and '\0' not in name)
    if parent == '/':
        return os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW), name
    return _open_directory(parent), name


def _private_input(value, maximum):
    parent, name = _open_parent(value)
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | NOATIME, dir_fd=parent)
    finally:
        os.close(parent)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == os.geteuid()
                and stat.S_IMODE(info.st_mode) & 0o077 == 0 and 0 < info.st_size <= maximum)
        return fd
    except BaseException:
        os.close(fd)
        raise


def load_manifest(value):
    fd = _private_input(value, 256 * 1024 ** 2)
    try:
        before = _identity(os.fstat(fd))
        with os.fdopen(os.dup(fd), 'rb') as stream:
            raw = stream.read(256 * 1024 ** 2 + 1)
        require(len(raw) <= 256 * 1024 ** 2 and _identity(os.fstat(fd)) == before)
        def unique_object(pairs):
            result = {}
            for name, item in pairs:
                require(name not in result)
                result[name] = item
            return result
        return validate_manifest(json.loads(raw, object_pairs_hook=unique_object))
    finally:
        os.close(fd)


class _SingleGzipReader(io.RawIOBase):
    """Bounded single-member gzip reader; validates CRC and rejects trailers."""
    def __init__(self, fd, maximum):
        self.fd = fd
        self.decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
        self.pending = b''
        self.buffer = bytearray()
        self.finished = False
        self.maximum = maximum
        self.output_bytes = 0
        self.compressed_hash = hashlib.sha256()

    def readable(self):
        return True

    def read(self, size=-1):
        require(type(size) is int and size >= 0)
        if size == 0:
            return b''
        size = min(size, CHUNK)
        while len(self.buffer) < size and not self.finished:
            if not self.pending:
                self.pending = os.read(self.fd, 65536)
                require(self.pending)
                self.compressed_hash.update(self.pending)
            produced = self.decoder.decompress(self.pending, min(CHUNK, size - len(self.buffer)))
            self.pending = self.decoder.unconsumed_tail
            self.buffer.extend(produced)
            self.output_bytes += len(produced)
            require(self.output_bytes <= self.maximum)
            if self.decoder.eof:
                require(not self.decoder.unused_data and not self.pending and not os.read(self.fd, 1))
                self.finished = True
        value = bytes(self.buffer[:size])
        del self.buffer[:size]
        return value


def _tar_time_ns(member):
    try:
        value = Decimal(member.pax_headers.get('mtime', str(member.mtime))) * 1000000000
        require(value.is_finite() and value == value.to_integral_value())
        return int(value)
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError('Retained archive operation blocked') from None


def _check_header(member, entry):
    require(member.mode == entry['mode'] and member.uid == entry['uid'] and member.gid == entry['gid'])
    require(_tar_time_ns(member) == _nanoseconds(entry['mtimeNs']))
    for name, value in member.pax_headers.items():
        if name.startswith('SCHILY.xattr.'):
            raw_name = name[len('SCHILY.xattr.'):]
            expected = _attribute_bytes(entry['xattrs'])
            require(raw_name in expected and value.encode('utf8', 'surrogateescape') == expected[raw_name])


def _scan_archive(archive, manifest, consume=None):
    manifest = validate_manifest(manifest)
    entries = manifest['entries']
    maximum = sum(entry.get('size', 0) for entry in entries.values()) + len(entries) * 65536 + 20 * CHUNK
    fd = _private_input(archive, MAX_LOGICAL_BYTES)
    try:
        before = _identity(os.fstat(fd))
        gzip = _SingleGzipReader(fd, maximum)
        seen, payload_for, hardlinks = set(), {}, {}
        payload_bytes = 0
        last_end = 0
        with tarfile.open(mode='r|', fileobj=gzip, encoding='utf8', errors='surrogateescape', ignore_zeros=False) as tar:
            for member in tar:
                name = _path(member.name, True)
                require(name not in seen and name in entries)
                entry = entries[name]
                _check_header(member, entry)
                if entry['kind'] == 'directory':
                    require(member.isdir() and member.size == 0)
                elif entry['kind'] == 'symlink':
                    require(member.issym() and member.size == 0 and member.linkname == entry['target'])
                elif member.islnk():
                    require(member.size == 0)
                    target = _path(member.linkname, True)
                    require(entry['hardlinkGroup'] and target in entry['hardlinkGroup'] and target in seen
                            and entries[target]['kind'] == 'file' and target in payload_for)
                    payload_for[name] = payload_for[target]
                    hardlinks[name] = target
                else:
                    require(member.isfile() and member.size == entry['size'])
                    payload_for[name] = name
                    digest = hashlib.sha256()
                    stream = tar.extractfile(member)
                    require(stream is not None)
                    written = 0
                    target = consume(name, entry) if consume else None
                    try:
                        while True:
                            chunk = stream.read(CHUNK)
                            if not chunk:
                                break
                            written += len(chunk)
                            require(written <= entry['size'])
                            digest.update(chunk)
                            if target is not None:
                                view = memoryview(chunk)
                                while view:
                                    count = os.write(target, view)
                                    require(count > 0)
                                    view = view[count:]
                        require(written == entry['size'] and digest.hexdigest() == entry['sha256'])
                        if target is not None:
                            os.fsync(target)
                    finally:
                        stream.close()
                        if target is not None:
                            os.close(target)
                    payload_bytes += written
                seen.add(name)
                # TarFile's next physical offset also accounts for GNU/PAX
                # sparse maps; logical file size can be larger than its tar
                # payload. Restoring still verifies every logical byte.
                last_end = tar.offset
            # TarFile stops at its first zero header. Check the mandatory second
            # zero block and all physical padding through gzip CRC/ISIZE/EOF.
            require(tar.fileobj.tell() == last_end + 512)
            padding = 0
            while True:
                chunk = tar.fileobj.read(CHUNK)
                if not chunk:
                    break
                require(not any(chunk))
                padding += len(chunk)
            require(padding >= 512 and tar.fileobj.tell() % 512 == 0 and gzip.finished)
        require(seen == set(entries) and _identity(os.fstat(fd)) == before)
        for name, entry in entries.items():
            if entry['kind'] == 'file' and entry['hardlinkGroup']:
                require(len({payload_for[member] for member in entry['hardlinkGroup']}) == 1)
        return {'status': 'verified', 'entries': len(seen), 'payloadBytes': payload_bytes,
                'archiveSha256': gzip.compressed_hash.hexdigest(), '_payloadFor': payload_for}
    finally:
        os.close(fd)


def verify_archive(archive, manifest):
    result = _scan_archive(archive, manifest)
    result.pop('_payloadFor')
    return result


def _relative_parent(root, name):
    parts = _path(name).split('/')
    require(name != '.')
    fd = os.dup(root)
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | NOATIME, dir_fd=fd)
            os.close(fd); fd = child
        return fd, parts[-1]
    except BaseException:
        os.close(fd)
        raise


def _xattrs(target, symlink=False):
    options = {'follow_symlinks': False} if symlink else {}
    return {name: os.getxattr(target, name, **options) for name in os.listxattr(target, **options)}


def source_manifest_fd(fd):
    """Capture a complete private snapshot from a pinned real directory.

    Callers additionally reject all submounts before this read-only traversal.
    Atime is preserved for regular files/directories; symlinks are never
    dereferenced and their own atime is captured after readlink.
    """
    root = os.open('.', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | NOATIME, dir_fd=fd)
    entries, snapshot, inodes, groups, children = {}, {}, {}, {}, {}
    device = os.fstat(root).st_dev

    def values(info, kind, attributes):
        return {'kind': kind, 'mode': stat.S_IMODE(info.st_mode), 'uid': info.st_uid, 'gid': info.st_gid,
                'mtimeNs': str(info.st_mtime_ns), 'atimeNs': str(info.st_atime_ns),
                'xattrs': {name: base64.b64encode(raw).decode('ascii') for name, raw in sorted(attributes.items())}}

    def remember(name, info, entry):
        require(len(entries) < MAX_ENTRIES)
        _path(name)
        entries[name] = entry
        snapshot[name] = _identity(info)
        inodes[(info.st_dev, info.st_ino)] = info.st_blocks * 512
        if name != '.':
            parent = str(PurePosixPath(name).parent)
            children.setdefault(parent, set()).add(str(PurePosixPath(name).name))

    def walk(directory, name):
        initial = os.fstat(directory)
        require(stat.S_ISDIR(initial.st_mode) and initial.st_dev == device)
        for leaf in sorted(os.listdir(directory)):
            relative = leaf if name == '.' else name + '/' + leaf
            _path(relative)
            before = os.stat(leaf, dir_fd=directory, follow_symlinks=False)
            require(before.st_dev == device)
            if stat.S_ISDIR(before.st_mode):
                child = os.open(leaf, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | NOATIME, dir_fd=directory)
                try:
                    require(_identity(os.fstat(child)) == _identity(before))
                    walk(child, relative)
                finally:
                    os.close(child)
            elif stat.S_ISREG(before.st_mode):
                target = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | NOATIME, dir_fd=directory)
                try:
                    require(_identity(os.fstat(target)) == _identity(before))
                    attributes = _xattrs(target)
                    digest = hashlib.sha256()
                    length = 0
                    while True:
                        chunk = os.read(target, CHUNK)
                        if not chunk:
                            break
                        length += len(chunk)
                        require(length <= before.st_size)
                        digest.update(chunk)
                    after = os.fstat(target)
                    require(length == before.st_size and _identity(after) == _identity(before))
                    entry = values(after, 'file', attributes)
                    entry.update(size=after.st_size, sha256=digest.hexdigest(), hardlinkGroup=[])
                    remember(relative, after, entry)
                    groups.setdefault((after.st_dev, after.st_ino), []).append(relative)
                finally:
                    os.close(target)
            elif stat.S_ISLNK(before.st_mode):
                target = os.readlink(leaf, dir_fd=directory)
                attributes = _xattrs('/proc/self/fd/' + str(directory) + '/' + leaf, True)
                after = os.stat(leaf, dir_fd=directory, follow_symlinks=False)
                require(_identity(after) == _identity(before))
                entry = values(after, 'symlink', attributes)
                entry['target'] = target
                remember(relative, after, entry)
            else:
                raise ValueError('Retained archive operation blocked')
        attributes = _xattrs(directory)
        final = os.fstat(directory)
        require(_identity(final) == _identity(initial))
        remember(name, final, values(final, 'directory', attributes))

    def stable_walk(directory, name):
        require(_identity(os.fstat(directory)) == snapshot[name])
        actual = os.listdir(directory)
        require(set(actual) == children.get(name, set()))
        for leaf in actual:
            relative = leaf if name == '.' else name + '/' + leaf
            current = os.stat(leaf, dir_fd=directory, follow_symlinks=False)
            require(_identity(current) == snapshot[relative] and current.st_dev == device)
            if stat.S_ISDIR(current.st_mode):
                child = os.open(leaf, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | NOATIME, dir_fd=directory)
                try:
                    require(_identity(os.fstat(child)) == snapshot[relative])
                    stable_walk(child, relative)
                finally:
                    os.close(child)
        require(_identity(os.fstat(directory)) == snapshot[name])

    try:
        walk(root, '.')
        for members in groups.values():
            members.sort()
            for name in members:
                require(snapshot[name][-1] == len(members))
                entries[name]['hardlinkGroup'] = members[:] if len(members) > 1 else []
        manifest = validate_manifest({'version': 1, 'entries': entries})
        stable_walk(root, '.')
        return manifest, snapshot, sum(inodes.values())
    finally:
        os.close(root)


def _replace_xattrs(target, values, symlink=False):
    options = {'follow_symlinks': False} if symlink else {}
    for name in os.listxattr(target, **options):
        if name not in values:
            os.removexattr(target, name, **options)
    for name, raw in values.items():
        os.setxattr(target, name, raw, **options)


def _set_attributes(root, name, entry):
    atime, mtime = _nanoseconds(entry['atimeNs']), _nanoseconds(entry['mtimeNs'])
    values = _attribute_bytes(entry['xattrs'])
    if name == '.':
        target = os.dup(root)
        try:
            os.fchown(target, entry['uid'], entry['gid']); os.fchmod(target, entry['mode'])
            _replace_xattrs(target, values); os.utime(target, ns=(atime, mtime)); os.fsync(target)
        finally:
            os.close(target)
        return
    parent, leaf = _relative_parent(root, name)
    try:
        if entry['kind'] == 'symlink':
            os.chown(leaf, entry['uid'], entry['gid'], dir_fd=parent, follow_symlinks=False)
            _replace_xattrs('/proc/self/fd/' + str(parent) + '/' + leaf, values, True)
            os.utime(leaf, ns=(atime, mtime), dir_fd=parent, follow_symlinks=False)
        else:
            target = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | NOATIME
                             | (os.O_DIRECTORY if entry['kind'] == 'directory' else 0), dir_fd=parent)
            try:
                os.fchown(target, entry['uid'], entry['gid']); os.fchmod(target, entry['mode'])
                _replace_xattrs(target, values); os.utime(target, ns=(atime, mtime)); os.fsync(target)
            finally:
                os.close(target)
    finally:
        os.close(parent)


def _verify_tree(destination, manifest, _expected_identity=None, *, check_atime):
    manifest = validate_manifest(manifest)
    entries = manifest['entries']
    initial = _open_directory(destination)
    try:
        if _expected_identity is not None:
            require((os.fstat(initial).st_dev, os.fstat(initial).st_ino) == _expected_identity)
        root = os.open('.', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | NOATIME, dir_fd=initial)
    finally:
        os.close(initial)
    seen, links = set(), {}
    device = os.fstat(root).st_dev

    def matches_metadata(info, entry):
        require((stat.S_IMODE(info.st_mode), info.st_uid, info.st_gid, info.st_mtime_ns)
                == (entry['mode'], entry['uid'], entry['gid'], _nanoseconds(entry['mtimeNs'])))
        if check_atime:
            require(info.st_atime_ns == _nanoseconds(entry['atimeNs']))

    def verify(directory, name='.'):
        require(name in entries)
        entry = entries[name]
        info = os.fstat(directory)
        require(entry['kind'] == 'directory' and info.st_dev == device)
        matches_metadata(info, entry)
        require(_xattrs(directory) == _attribute_bytes(entry['xattrs']))
        seen.add(name)
        for leaf in os.listdir(directory):
            relative = leaf if name == '.' else name + '/' + leaf
            require(relative in entries)
            expected = entries[relative]
            before = os.stat(leaf, dir_fd=directory, follow_symlinks=False)
            require(before.st_dev == device)
            matches_metadata(before, expected)
            if expected['kind'] == 'directory':
                require(stat.S_ISDIR(before.st_mode))
                child = os.open(leaf, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | NOATIME, dir_fd=directory)
                try:
                    require(_identity(os.fstat(child)) == _identity(before))
                    verify(child, relative)
                finally:
                    os.close(child)
            elif expected['kind'] == 'symlink':
                require(stat.S_ISLNK(before.st_mode) and os.readlink(leaf, dir_fd=directory) == expected['target'])
                require(_xattrs('/proc/self/fd/' + str(directory) + '/' + leaf, True) == _attribute_bytes(expected['xattrs']))
                seen.add(relative)
            else:
                require(stat.S_ISREG(before.st_mode) and before.st_size == expected['size'])
                target = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | NOATIME, dir_fd=directory)
                try:
                    require(_identity(os.fstat(target)) == _identity(before))
                    require(_xattrs(target) == _attribute_bytes(expected['xattrs']))
                    h = hashlib.sha256()
                    while True:
                        chunk = os.read(target, CHUNK)
                        if not chunk:
                            break
                        h.update(chunk)
                    require(h.hexdigest() == expected['sha256'] and _identity(os.fstat(target)) == _identity(before))
                finally:
                    os.close(target)
                links.setdefault((before.st_dev, before.st_ino), []).append(relative)
                require(before.st_nlink == (len(expected['hardlinkGroup']) if expected['hardlinkGroup'] else 1))
                seen.add(relative)
    try:
        verify(root)
        require(seen == set(entries))
        for group in links.values():
            expected = entries[group[0]]['hardlinkGroup']
            require(sorted(group) == expected if expected else len(group) == 1)
        return {'status': 'verified', 'entries': len(seen)}
    finally:
        os.close(root)


def verify_tree(destination, manifest, _expected_identity=None):
    """Strict verification of a restored tree, including every saved atime."""
    return _verify_tree(destination, manifest, _expected_identity, check_atime=True)


def verify_source_tree(destination, manifest, _expected_identity=None):
    """Verify an existing source, tolerating only read-induced atime drift.

    Contents, kinds, ownership, modes, mtime, raw xattrs and hardlink groups
    remain strict. Callers separately compare their pinned inode/ctime snapshot.
    The authoritative manifest and archive/restored-tree verification are never
    rewritten or relaxed by this read-only source check.
    """
    return _verify_tree(destination, manifest, _expected_identity, check_atime=False)


def restore_archive(archive, manifest, destination):
    manifest = validate_manifest(manifest)
    before = verify_archive(archive, manifest)
    entries = manifest['entries']
    parent, leaf = _open_parent(destination)
    root = None
    try:
        owner = os.fstat(parent)
        require(owner.st_uid == os.geteuid() and stat.S_IMODE(owner.st_mode) == 0o700)
        try:
            os.stat(leaf, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise ValueError('Retained archive operation blocked')
        os.mkdir(leaf, mode=0o700, dir_fd=parent)
        root = os.open(leaf, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | NOATIME, dir_fd=parent)
        for name, entry in sorted(entries.items(), key=lambda item: (item[0].count('/'), item[0])):
            if name != '.' and entry['kind'] == 'directory':
                target_parent, target_leaf = _relative_parent(root, name)
                try:
                    os.mkdir(target_leaf, mode=0o700, dir_fd=target_parent)
                finally:
                    os.close(target_parent)

        def create_file(name, _entry):
            target_parent, target_leaf = _relative_parent(root, name)
            try:
                return os.open(target_leaf, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=target_parent)
            finally:
                os.close(target_parent)

        restored = _scan_archive(archive, manifest, create_file)
        require(restored['archiveSha256'] == before['archiveSha256'])
        for name, primary in restored['_payloadFor'].items():
            if name == primary:
                continue
            source_parent, source_leaf = _relative_parent(root, primary)
            target_parent, target_leaf = _relative_parent(root, name)
            try:
                os.link(source_leaf, target_leaf, src_dir_fd=source_parent, dst_dir_fd=target_parent, follow_symlinks=False)
            finally:
                os.close(source_parent); os.close(target_parent)
        for name, entry in entries.items():
            if entry['kind'] == 'symlink':
                target_parent, target_leaf = _relative_parent(root, name)
                try:
                    os.symlink(entry['target'], target_leaf, dir_fd=target_parent)
                finally:
                    os.close(target_parent)
        applied = set()
        for name, entry in entries.items():
            if entry['kind'] != 'directory':
                group = tuple(entry.get('hardlinkGroup') or [name])
                if group not in applied:
                    _set_attributes(root, name, entry)
                    applied.add(group)
        for name, entry in sorted(entries.items(), key=lambda item: (-item[0].count('/'), item[0]), reverse=False):
            if name != '.' and entry['kind'] == 'directory':
                _set_attributes(root, name, entry)
        _set_attributes(root, '.', entries['.'])
        os.fsync(parent)
        verify_tree(destination, manifest, (os.fstat(root).st_dev, os.fstat(root).st_ino))
        # readlink may update a symlink's own atime; reset only its timestamps
        # after the exact-target verification, never touching its target.
        for name, entry in entries.items():
            if entry['kind'] == 'symlink':
                target_parent, target_leaf = _relative_parent(root, name)
                try:
                    os.utime(target_leaf, ns=(_nanoseconds(entry['atimeNs']), _nanoseconds(entry['mtimeNs'])), dir_fd=target_parent, follow_symlinks=False)
                finally:
                    os.close(target_parent)
        return {'status': 'restored', 'entries': len(entries), 'payloadBytes': restored['payloadBytes']}
    finally:
        if root is not None:
            os.close(root)
        os.close(parent)


class _SilentParser(argparse.ArgumentParser):
    def error(self, _message):
        raise ValueError('Retained archive operation blocked')

    def exit(self, _status=0, _message=None):
        raise ValueError('Retained archive operation blocked')


def main():
    parser = _SilentParser(add_help=False)
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument('--verify'); actions.add_argument('--restore')
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--destination')
    arguments = parser.parse_args()
    require(bool(arguments.destination) == bool(arguments.restore))
    manifest = load_manifest(arguments.manifest)
    if arguments.restore:
        report = restore_archive(arguments.restore, manifest, arguments.destination)
    else:
        report = verify_archive(arguments.verify, manifest)
    print(json.dumps({key: value for key, value in report.items() if key in ('status', 'entries', 'payloadBytes')}, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        print('Retained archive operation blocked.', flush=True)
        sys.exit(1)
