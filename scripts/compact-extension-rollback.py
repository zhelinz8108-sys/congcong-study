"""Retain specifically reviewed old rollbacks as verified private archives.

Never change the live application, protected rollback, learning records,
uploads or independent media. Linked data is retained as links, not copied.
"""
import argparse
import base64
import fcntl
import gzip
import lzma
from decimal import Decimal
import tarfile
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import time

IDENTITY = 'previous-bd75c1df88402a39f7ff88a4e56507a541d5fc84-40200576699-1'
NEWER = ('previous-f475be68d01c429544df5293187e4c8c47be28c6-40205282115-1',
         'previous-22573b4752de26ff3dedfaa514ba419b0255bbb1-40207660100-1')
ASTRA_PROTECTED = ('previous-dfcf0e39b482a4cb9c771aead8f5a4f7f1d91255-41812512169-1',)
ASTRA_REQUIRED_FREE = 5 * 1024**3
SHORT_CHOICES_PROTECTED = 'previous-ac22b62892a02aca54c136a5c702580500fea2cd-41871923456-1'
SHORT_CHOICES_ARCHIVE = 'previous-dfcf0e39b482a4cb9c771aead8f5a4f7f1d91255-41812512169-1'
VOCAB_PROTECTED = 'previous-37adda11b81ee4c73c90d931656c0f5d22902103-43653324834-1'
VOCAB_ARCHIVE = 'previous-ac22b62892a02aca54c136a5c702580500fea2cd-41871923456-1'
VOCAB_REQUIRED_FREE = 5 * 1024**3 + 64 * 1024**2
ARCHIVE_ROOT = Path('/www/study-plan-retained-compressed/extension-20261104')
BASE_ARCHIVE_ROOT = Path('/www/study-plan-retained-compressed')
# Exact public commit identities from the read-only November 16 diagnosis.
# Process the six largest gzip files first; never select an arbitrary archive.
VOCAB_BASE_COMMITS = (
    '6b7d383b45b8d2bb72df4dca9b6325e8ec55acc3',
    'ddddbe938feffb520bf3673edae51ba75872791e',
    '4d65d765912e1f9baf4553c7df5bebe9b16274eb',
    'bdc35f288531062f5abb029cd263bbd9b51d65b0',
    'e00733cfa66583481e42f2acac0b4756c29e4383',
    'f262dc6438e48d3992f1abe2d0e291ff3108b222',
    '060b04a07bc3c1e9ef4dd2d51665d4b9623b039c',
    '583e90daf9220c1f7b2859ccd3cec808659cb240',
    '668e048befdfe29b9b7fd2d89cdb43f4145bfd3a',
    'd8e3459dcb31ce3fcdd56a7e934831d7d982fb20',
    'ebcd96e84e7cbd2fe1f5722b30b4ba398e21ce38',
    '4965b74cab6699ed5cd84a9f1d22c7636a35ddb4',
    '7540ccd7cee2d07796cce61318e79d1d1be9e923',
)
RELEASES = Path('/www/study-plan-releases')
BACKUPS = Path('/www/study-plan-data/backups')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def no_links(path):
    require(all(not p.is_symlink() for p in (path, *path.parents)), 'Unexpected symbolic-link parent; leave all copies untouched')


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def sync_directory(folder):
    fd = os.open(folder, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_private(target, text, mode=0o600):
    with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode), 'w') as output:
        output.write(text); output.flush(); os.fsync(output.fileno())


def remove_retained_duplicate(pending, manifest):
    if not pending.exists():
        return
    no_links(pending)
    for name, record in snapshot(pending).items():
        expected = manifest['files'].get(name)
        require(expected is not None, 'Unexpected interrupted file; retain both copies')
        # Removing children changes directory mtimes during an interrupted rmtree.
        fields = set(record) - ({'mtime'} if record['kind'] == 'directory' else set())
        require(all(record[key] == expected[key] for key in fields), 'Interrupted duplicate differs; retain both copies')
    shutil.rmtree(pending)
    sync_directory(pending.parent)


def entry_record(entry):
    info = entry.lstat()
    kind = 'file' if stat.S_ISREG(info.st_mode) else 'directory' if stat.S_ISDIR(info.st_mode) else 'link' if stat.S_ISLNK(info.st_mode) else None
    require(kind is not None, 'Special files cannot be compacted')
    attributes = {name: base64.b64encode(os.getxattr(entry, name, follow_symlinks=False)).decode('ascii') for name in sorted(os.listxattr(entry, follow_symlinks=False))}
    return dict(kind=kind, mode=stat.S_IMODE(info.st_mode), uid=info.st_uid, gid=info.st_gid,
        mtime=info.st_mtime_ns, size=info.st_size if kind == 'file' else 0, sha256=digest(entry) if kind == 'file' else None,
        link=os.readlink(entry) if kind == 'link' else None, xattrs=attributes)


def snapshot(root):
    return {entry.relative_to(root).as_posix(): entry_record(entry) for entry in [root, *sorted(root.rglob('*'))]}


def inactive(source):
    require(not Path('/www/study-plan').resolve().is_relative_to(source.resolve()), 'The live application is protected')
    for process in Path('/proc').iterdir():
        if not process.name.isdigit() or int(process.name) == os.getpid():
            continue
        try:
            cwd = (process / 'cwd').resolve(strict=True)
            require(not cwd.is_relative_to(source.resolve()), 'A process still uses this rollback')
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            continue


def archive_name(name):
    parsed = PurePosixPath(name)
    require(not parsed.is_absolute() and '..' not in parsed.parts, 'Unsafe archive member; retain all copies')
    return parsed.as_posix()


def archive_stream(archive):
    return (lzma.open if archive.name.startswith('archive.tar.xz') else gzip.open)(archive, 'rb')


def extract_archive(archive, directory, names=None):
    command = ['tar', '--extract', '--file', '-', '--directory', str(directory), '--same-owner', '--same-permissions', '--xattrs', '--xattrs-include=*', '--acls', '--selinux']
    if names is not None:
        command.extend(['--no-recursion', '--null', '--files-from', str(names)])
    child = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        with archive_stream(archive) as incoming:
            try:
                shutil.copyfileobj(incoming, child.stdin, 1024 * 1024)
            except BrokenPipeError:
                pass
    finally:
        try:
            child.stdin.close()
        except BrokenPipeError:
            pass
        code = child.wait()
    require(code == 0, 'GNU tar restoration failed; retain all copies')


def verify_archive(folder, manifest):
    """Fully decompress and hash every file, then verify restored metadata.

    GNU tar separately restores every xattr/ACL-bearing entry and hard-link
    group. Plain file bytes stream through SHA-256 without a disk-sized copy.
    """
    archive = folder / manifest.get('archiveFile', 'archive.tar.gz')
    require(archive.name in ('archive.tar.gz', 'archive.tar.xz', 'archive.tar.xz.pending'), 'Unexpected retained archive name')
    require(digest(archive) == manifest['archiveSha256'], 'Archive checksum mismatch; retain all copies')
    temporary = folder / '.verify'
    require(not os.path.lexists(temporary), 'An interrupted verification requires review; retain all copies')
    temporary.mkdir(mode=0o700)
    headers, selected = {}, set()
    tar_checksum = hashlib.sha256()
    tar_bytes = 0
    class CheckedStream:
        def __init__(self, incoming):
            self.incoming = incoming
        def read(self, size=-1):
            nonlocal tar_bytes
            chunk = self.incoming.read(size)
            tar_checksum.update(chunk); tar_bytes += len(chunk)
            return chunk
    try:
        with archive_stream(archive) as raw_stream:
            uncompressed = CheckedStream(raw_stream)
            with tarfile.open(fileobj=uncompressed, mode='r|') as contents:
                for member in contents:
                    name = archive_name(member.name)
                    require(name in manifest['files'] and name not in headers, 'Unexpected or repeated archive member')
                    expected = manifest['files'][name]
                    kind = 'file' if member.isfile() or member.islnk() else 'directory' if member.isdir() else 'link' if member.issym() else None
                    mtime = int(Decimal(member.pax_headers.get('mtime', str(member.mtime))) * 1_000_000_000)
                    require(kind == expected['kind'] and stat.S_IMODE(member.mode) == expected['mode'] and member.uid == expected['uid'] and member.gid == expected['gid'] and mtime == expected['mtime'], 'Archive metadata differs; original is retained')
                    headers[name] = {'name': member.name, 'kind': kind, 'regular': member.isfile(), 'target': archive_name(member.linkname) if member.islnk() else None}
                    if member.islnk():
                        selected.add(name)
                        continue
                    if member.isfile():
                        require(member.size == expected['size'], 'Archive size differs; original is retained')
                        require(shutil.disk_usage(folder).free >= 512 * 1024**2, 'Insufficient verification headroom; original is retained')
                    if member.issym():
                        require(member.linkname == expected['link'], 'Archive link differs; original is retained')
                    special = bool(expected['xattrs']) or any('xattr' in key or key.startswith('SCHILY.acl.') or key == 'RHT.security.selinux' for key in member.pax_headers)
                    if special:
                        selected.add(name)
                    sample = temporary / 'entry'
                    if member.isfile():
                        checksum = hashlib.sha256(); byte_count = 0
                        with contents.extractfile(member) as input_stream:
                            while chunk := input_stream.read(1024 * 1024):
                                checksum.update(chunk); byte_count += len(chunk)
                        require(byte_count == expected['size'] and checksum.hexdigest() == expected['sha256'], 'Decompressed file differs; original is retained')
                        # The exact bytes were verified above. Use a zero-byte
                        # probe for filesystem ownership, mode and timestamps.
                        sample.touch(exist_ok=False)
                    elif member.isdir():
                        sample.mkdir(mode=0o700)
                    else:
                        sample.symlink_to(member.linkname)
                    os.chown(sample, member.uid, member.gid, follow_symlinks=False)
                    if not member.issym():
                        sample.chmod(member.mode)
                    os.utime(sample, ns=(mtime, mtime), follow_symlinks=False)
                    restored = entry_record(sample)
                    fields = set(expected) - {'atime', 'hardlinkGroup'} - ({'xattrs'} if special else set())
                    if member.isfile():
                        fields -= {'size', 'sha256'}
                    require(all(restored[key] == expected[key] for key in fields), 'Unpacked entry differs; original is retained')
                    if 'atime' in expected:
                        os.utime(sample, ns=(expected['atime'], expected['mtime']), follow_symlinks=False)
                        require(sample.lstat().st_atime_ns == expected['atime'], 'Restored access time differs; original is retained')
                    if sample.is_dir() and not sample.is_symlink():
                        sample.rmdir()
                    else:
                        sample.unlink()
            # Drain gzip through its trailer, validating CRC and final length.
            while uncompressed.read(1024 * 1024):
                pass
        require(set(headers) == set(manifest['files']), 'Archive omitted original entries')
        if 'tarSha256' in manifest:
            require(tar_checksum.hexdigest() == manifest['tarSha256'] and tar_bytes == manifest['tarBytes'], 'Recompressed tar stream differs; retain both copies')
        parents = {name: name for name, expected in manifest['files'].items() if expected['kind'] == 'file'}
        def representative(name):
            while parents[name] != name:
                parents[name] = parents[parents[name]]
                name = parents[name]
            return name
        for name, header in headers.items():
            if header['target'] is not None:
                require(header['target'] in parents, 'Hard-link target is not a known file')
                parents[representative(name)] = representative(header['target'])
        groups = {}
        for name in parents:
            groups.setdefault(representative(name), set()).add(name)
        for name, expected in manifest['files'].items():
            if 'hardlinkGroup' in expected:
                require(set(expected['hardlinkGroup'] or [name]) == groups[representative(name)], 'Legacy hard-link group differs from the archive')
        # Add every hard-link target, including chained links, to the GNU tar
        # restoration so inode sharing and all extended metadata are exercised.
        for name in list(selected):
            current, seen = name, set()
            while headers[current]['target'] is not None:
                require(current not in seen, 'Hard-link cycle; retain original')
                seen.add(current)
                target = headers[current]['target']
                require(target in headers and manifest['files'][target]['kind'] == 'file', 'Missing hard-link target')
                require(manifest['files'][current] == manifest['files'][target], 'Hard-link records differ')
                selected.add(target); current = target
        if selected:
            size = sum(manifest['files'][name]['size'] for name in selected if headers[name]['regular'])
            require(shutil.disk_usage(folder).free >= size + 512 * 1024**2, 'Insufficient extended-metadata scratch; original is retained')
            names = temporary / 'selected.names'
            with names.open('xb') as output:
                for name in sorted(selected):
                    output.write(os.fsencode(headers[name]['name']) + b'\0')
            extracted = temporary / 'tree'; extracted.mkdir(mode=0o700)
            extract_archive(archive, extracted, names)
            allowed = {'.'} | selected
            for name in selected:
                allowed.update(parent.as_posix() for parent in PurePosixPath(name).parents)
            require(all(entry.relative_to(extracted).as_posix() in allowed for entry in extracted.rglob('*')), 'Unexpected recursive extraction; retain original')
            for name in selected:
                expected = manifest['files'][name]
                require(entry_record(extracted / name) == {key: value for key, value in expected.items() if key not in ('atime', 'hardlinkGroup')}, 'Restored extended metadata or hard link differs')
                target = headers[name]['target']
                if target is not None:
                    left, right = (extracted / name).lstat(), (extracted / target).lstat()
                    require((left.st_dev, left.st_ino) == (right.st_dev, right.st_ino), 'Restored hard-link identity differs')
            restore_access_times(extracted, {name: manifest['files'][name] for name in selected})
    finally:
        shutil.rmtree(temporary)
    return {'tarSha256': tar_checksum.hexdigest(), 'tarBytes': tar_bytes}


def compact(source, destination, helper_source):
    no_links(source.parent); no_links(destination.parent)
    require(source.is_dir() and not source.is_symlink(), 'Expected the reviewed unused rollback directory')
    before = snapshot(source)
    if os.path.lexists(destination):
        # This exact earlier failure produced only an incomplete generated
        # archive. The intact original was never renamed or released.
        require(destination.is_dir() and not destination.is_symlink() and stat.S_IMODE(destination.stat().st_mode) == 0o700 and destination.stat().st_uid == os.geteuid(), 'Unexpected previous attempt; retain all copies')
        names = {entry.name for entry in destination.iterdir()}
        if names == {'archive.tar.gz', 'manifest.json', 'restore.py', 'RESTORE_REQUIRED.txt'}:
            # A failed verification retained the full original and archive.
            # Resume only when the complete recorded source is still identical.
            for entry in destination.iterdir():
                info = entry.lstat()
                require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1, 'Unexpected pending archive entry; retain all copies')
            manifest = json.loads((destination / 'manifest.json').read_text())
            require(manifest['release'] == source.name and manifest['files'] == before, 'Pending archive source differs; retain all copies')
            verify_archive(destination, manifest)
            replace_private(destination / 'restore.py', helper_source, 0o700)
            return finalize_compaction(source, destination, before, manifest)
        require(names == {'archive.tar.gz'}, 'A complete or ambiguous archive must be retained')
        partial = destination / 'archive.tar.gz'; metadata = partial.lstat()
        require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == os.geteuid() and metadata.st_nlink == 1 and stat.S_IMODE(metadata.st_mode) == 0o600, 'Unexpected partial archive; retain all copies')
        partial.unlink(); destination.rmdir(); sync_directory(destination.parent)
    free = shutil.disk_usage(source).free
    require(free >= 768 * 1024**2, 'Insufficient archive verification headroom')
    destination.mkdir(mode=0o700)
    archive = destination / 'archive.tar.gz'
    with archive.open('xb') as out:
        os.chmod(archive, 0o600)
        process = subprocess.Popen(['tar', '--create', '--format=pax', '--numeric-owner', '--xattrs', '--acls', '--selinux', '-I', 'gzip -1', '--file', '-', '--directory', str(source), '.'], stdout=out, stderr=subprocess.DEVNULL)
        while process.poll() is None:
            if archive.stat().st_size > free - 512 * 1024**2:
                process.terminate(); process.wait()
                raise ValueError('Compression did not leave safe verification space; original is retained')
            time.sleep(1)
        require(process.returncode == 0, 'Compression failed; original is retained')
        out.flush(); os.fsync(out.fileno())
    manifest = {'version': 1, 'release': source.name, 'archiveSha256': digest(archive), 'files': before}
    manifest_path = destination / 'manifest.json'
    write_private(manifest_path, json.dumps(manifest))
    write_private(destination / 'restore.py', helper_source, 0o700)
    instructions = destination / 'RESTORE_REQUIRED.txt'
    write_private(instructions, 'Full rollback is preserved in archive.tar.gz. Verify: python3 restore.py --verify\nRestore to a NEW private directory: python3 restore.py --restore /absolute/new-directory\nThis does not activate the app or restore a database. Never use this archive pointer as an application directory.\n')
    sync_directory(destination); sync_directory(destination.parent)
    verify_archive(destination, manifest)
    return finalize_compaction(source, destination, before, manifest)


def finalize_compaction(source, destination, before, manifest):
    instructions = destination / 'RESTORE_REQUIRED.txt'
    require(snapshot(source) == before, 'Source changed during verification; retain both copies')
    pending = source.parent / ('.compacting-' + source.name)
    require(not os.path.lexists(pending), 'An interrupted compaction requires review; retain all copies')
    source.rename(pending)
    try:
        source.symlink_to(instructions)
    except BaseException:
        pending.rename(source)
        raise
    # Release only the duplicate whose complete restored contents just matched.
    require(snapshot(pending) == before, 'Pending duplicate changed; retain both copies')
    sync_directory(source.parent)
    remove_retained_duplicate(pending, manifest)
    receipt = {'version': 1, 'release': source.name, 'archiveSha256': manifest['archiveSha256'], 'restorationVerified': True, 'files': len(before)}
    write_private(destination / 'receipt.json', json.dumps(receipt)); sync_directory(destination)
    return receipt


def replace_private(target, text, mode=0o600):
    temporary = target.with_name(target.name + '.next')
    require(not os.path.lexists(temporary), 'An interrupted metadata update requires review')
    write_private(temporary, text, mode)
    os.replace(temporary, target)
    sync_directory(target.parent)


def recompress_retained(folder, manifest, helper_source):
    """A verified gzip backup stays intact until its xz replacement passes."""
    if manifest.get('archiveFile') == 'archive.tar.xz':
        return manifest
    original = folder / manifest.get('archiveFile', 'archive.tar.gz')
    original_info = private_regular(original)
    def original_signature(info):
        return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid, info.st_nlink,
                info.st_size, info.st_mtime_ns, info.st_ctime_ns)
    original_identity = original_signature(original_info)
    def require_original_unchanged():
        require(original_signature(private_regular(original)) == original_identity and
                digest(original) == manifest['archiveSha256'] and
                original_signature(private_regular(original)) == original_identity,
                'Original archive changed during recompression; retain both copies')
    require(original.name == 'archive.tar.gz' and digest(original) == manifest['archiveSha256'], 'Original archive differs')
    pending = folder / 'archive.tar.xz.pending'
    require(not os.path.lexists(pending) and not (folder / 'archive.tar.xz').exists(), 'An interrupted recompression requires review')
    reserve = 512 * 1024**2
    try:
        tar_checksum = hashlib.sha256(); tar_bytes = 0
        with gzip.open(original, 'rb') as incoming, pending.open('xb') as raw_output:
            pending.chmod(0o600)
            with lzma.LZMAFile(raw_output, 'w', format=lzma.FORMAT_XZ, preset=6) as outgoing:
                while chunk := incoming.read(1024 * 1024):
                    require(shutil.disk_usage(folder).free >= reserve + 16 * 1024**2, 'Recompression scratch exhausted; original archive is retained')
                    tar_checksum.update(chunk); tar_bytes += len(chunk)
                    outgoing.write(chunk)
            raw_output.flush(); os.fsync(raw_output.fileno())
        require(pending.stat().st_size < original.stat().st_size, 'Recompression did not reduce space; original is retained')
        candidate = {**manifest, 'archiveFile': pending.name, 'archiveSha256': digest(pending),
                     'tarSha256': tar_checksum.hexdigest(), 'tarBytes': tar_bytes}
        verify_archive(folder, candidate)
        final = folder / 'archive.tar.xz'
        pending.rename(final); sync_directory(folder)
        require_original_unchanged()
        candidate['archiveFile'] = final.name
        # New restore code understands both formats, so all interruption points
        # still leave at least the old or the new fully verified backup usable.
        replace_private(folder / 'restore.py', helper_source, 0o700)
        replace_private(folder / 'manifest.json', json.dumps(candidate))
        replace_private(folder / 'RESTORE_REQUIRED.txt', 'Full rollback is preserved in archive.tar.xz. Verify: python3 restore.py --verify\nRestore to a NEW private directory: python3 restore.py --restore /absolute/new-directory\nThis does not activate the app or restore a database. Never use this archive pointer as an application directory.\n')
        replace_private(folder / 'receipt.json', json.dumps({'version': 1, 'release': manifest['release'], 'archiveSha256': candidate['archiveSha256'], 'restorationVerified': True, 'files': len(manifest['files'])}))
        require(digest(final) == candidate['archiveSha256'], 'Replacement archive changed; retain both copies')
        require_original_unchanged()
        original.unlink(); sync_directory(folder)
        return candidate
    except BaseException:
        # Do not discard a completed archive or a metadata-switched backup.
        if original.is_file() and pending.exists():
            pending.unlink(); sync_directory(folder)
        raise


def reviewed_receipt(identity):
    receipt = json.loads((BACKUPS / ('before-main-' + identity.removeprefix('previous-')) / 'receipt.json').read_text())
    require(receipt['status'] == 'deployed' and receipt['previousDirectory'] == str(RELEASES / identity), 'Successful old-release receipt is required')
    return receipt


def preserve_reviewed(identity, source_code):
    source = RELEASES / identity
    receipt = reviewed_receipt(identity)
    destination = ARCHIVE_ROOT / identity
    if source.is_symlink():
        require(source.readlink() == destination / 'RESTORE_REQUIRED.txt', 'Unexpected archive pointer')
        archived_manifest = json.loads((destination / 'manifest.json').read_text())
        require(archived_manifest['release'] == identity, 'Archive release identity differs')
        verify_archive(destination, archived_manifest)
        remove_retained_duplicate(RELEASES / ('.compacting-' + identity), archived_manifest)
        recompress_retained(destination, archived_manifest, source_code)
        print(json.dumps({'alreadyPreserved': True, 'archiveFormat': 'xz', 'rootFreeMiB': shutil.disk_usage(RELEASES).free // 1024**2}), flush=True)
        return
    inactive(source)
    require((source / '.next/BUILD_ID').read_text().strip() == receipt['oldBuildId'], 'Old rollback build identity differs')
    ARCHIVE_ROOT.mkdir(mode=0o700, exist_ok=True); ARCHIVE_ROOT.chmod(0o700); sync_directory(ARCHIVE_ROOT.parent)
    result = compact(source, destination, source_code)
    recompress_retained(destination, json.loads((destination / 'manifest.json').read_text()), source_code)
    print(json.dumps({'preserved': result['restorationVerified'], 'files': result['files'], 'rootFreeMiB': shutil.disk_usage(RELEASES).free // 1024**2}), flush=True)


def preserve_astra_rollbacks(source_code):
    # This is storage preparation, not the new release's backup/health check.
    # Do not touch or require historical archives when there is already room.
    free = shutil.disk_usage(RELEASES).free
    print(json.dumps({'rootFreeMiB': free // 1024**2, 'archiveThresholdMiB': ASTRA_REQUIRED_FREE // 1024**2}), flush=True)
    if free >= ASTRA_REQUIRED_FREE:
        print(json.dumps({'archivingNeeded': False, 'historicalCopiesChanged': False}), flush=True)
        return
    # Exact identities from the failed Astra deployment's read-only diagnosis.
    # Keep the latest successful rollback immediately usable, with its receipt.
    for identity in ASTRA_PROTECTED:
        candidate = RELEASES / identity
        require(candidate.is_dir() and not candidate.is_symlink(), 'Latest rollback directory must remain intact')
        receipt = reviewed_receipt(identity)
        require((candidate / '.next/BUILD_ID').read_text().strip() == receipt['oldBuildId'], 'Protected rollback build identity differs')
    preserve_reviewed(IDENTITY, source_code)
    for identity in NEWER:
        if shutil.disk_usage(RELEASES).free >= ASTRA_REQUIRED_FREE:
            break
        preserve_reviewed(identity, source_code)


def preserve_short_choices_rollback(source_code):
    free = shutil.disk_usage(RELEASES).free
    print(json.dumps({'rootFreeMiB': free // 1024**2, 'archiveThresholdMiB': ASTRA_REQUIRED_FREE // 1024**2}), flush=True)
    if free >= ASTRA_REQUIRED_FREE:
        print(json.dumps({'archivingNeeded': False, 'historicalCopiesChanged': False}), flush=True)
        return
    # The November 14 diagnosis found this newer complete rollback. Keep it
    # immediately usable; only the exact older, inactive copy can be archived.
    candidate = RELEASES / SHORT_CHOICES_PROTECTED
    require(candidate.is_dir() and not candidate.is_symlink(), 'Latest rollback directory must remain intact')
    receipt = reviewed_receipt(SHORT_CHOICES_PROTECTED)
    require((candidate / '.next/BUILD_ID').read_text().strip() == receipt['oldBuildId'], 'Protected rollback build identity differs')
    preserve_reviewed(SHORT_CHOICES_ARCHIVE, source_code)


def manifest_shape(manifest):
    """Describe schema only; never print entry names, metadata values or bytes."""
    allowed = {'version', 'release', 'files', 'entries', 'archiveSha256', 'archiveFile', 'archive_sha256',
               'kind', 'type', 'mode', 'uid', 'gid', 'mtime', 'mtime_ns', 'size', 'sha256', 'hash',
               'link', 'xattrs', 'path', 'name', 'relative', 'restorationVerified', 'atimeNs', 'mtimeNs',
               'target', 'hardlinkGroup', 'archiveBytes', 'manifestSha256', 'sourceBasename',
               'sourceIdentity', 'sourceMetadata', 'status', 'tarSha256', 'tarBytes', 'atime'}
    def fields(value):
        if not isinstance(value, dict):
            return None
        return {key if key in allowed else '<other>': type(item).__name__
                for key, item in value.items()}
    container = next((manifest[key] for key in ('files', 'entries') if isinstance(manifest, dict) and key in manifest), None)
    first = next(iter(container.values()), None) if isinstance(container, dict) else container[0] if isinstance(container, list) and container else None
    return {'topLevelType': type(manifest).__name__, 'topLevelFields': fields(manifest),
            'recordContainerType': type(container).__name__, 'recordType': type(first).__name__,
            'recordFields': fields(first)}


def compatible_vocab_manifest(manifest):
    # Do not adapt an unknown older schema by guessing timestamp units, entry
    # kinds or omitted metadata. It must be understood before any archive write.
    if not isinstance(manifest, dict) or type(manifest.get('version')) is not int or manifest['version'] != 1:
        return False
    if not isinstance(manifest.get('release'), str) or not re.fullmatch(r'[0-9a-f]{64}', str(manifest.get('archiveSha256', ''))):
        return False
    if manifest.get('archiveFile', 'archive.tar.gz') not in ('archive.tar.gz', 'archive.tar.xz'):
        return False
    records = manifest.get('files')
    if not isinstance(records, dict) or not records:
        return False
    expected = {'kind', 'mode', 'uid', 'gid', 'mtime', 'size', 'sha256', 'link', 'xattrs'}
    for name, row in records.items():
        if not isinstance(name, str) or not isinstance(row, dict) or not expected.issubset(row) or set(row) - expected - {'atime', 'hardlinkGroup'}:
            return False
        if row['kind'] not in ('file', 'directory', 'link'):
            return False
        if any(type(row[key]) is not int or row[key] < 0 for key in ('mode', 'uid', 'gid', 'mtime', 'size')) or row['mode'] > 0o7777:
            return False
        if not isinstance(row['xattrs'], dict) or any(not isinstance(key, str) or not isinstance(value, str) for key, value in row['xattrs'].items()):
            return False
        if 'atime' in row and (type(row['atime']) is not int or row['atime'] < 0):
            return False
        if 'hardlinkGroup' in row and (row['kind'] != 'file' or not isinstance(row['hardlinkGroup'], list) or any(not isinstance(value, str) for value in row['hardlinkGroup'])):
            return False
        if row['kind'] == 'file':
            if not isinstance(row['sha256'], str) or not re.fullmatch(r'[0-9a-f]{64}', row['sha256']) or row['link'] is not None:
                return False
        elif row['sha256'] is not None or row['size'] != 0 or (not isinstance(row['link'], str) if row['kind'] == 'link' else row['link'] is not None):
            return False
        try:
            if archive_name(name) != name:
                return False
        except ValueError:
            return False
    if 'tarSha256' in manifest and (not isinstance(manifest['tarSha256'], str) or not re.fullmatch(r'[0-9a-f]{64}', manifest['tarSha256']) or type(manifest.get('tarBytes')) is not int or manifest['tarBytes'] <= 0):
        return False
    return True


def normalize_legacy_manifest(folder, manifest, receipt, manifest_bytes):
    """Only the entries-v1 schema observed in the read-only diagnosis is valid."""
    require(isinstance(manifest, dict) and set(manifest) == {'version', 'entries'} and
            type(manifest['version']) is int and manifest['version'] == 1 and
            isinstance(manifest['entries'], dict) and manifest['entries'], 'Unsupported legacy manifest schema')
    receipt_types = {'version': int, 'status': str, 'sourceBasename': str, 'sourceIdentity': list,
                     'sourceMetadata': dict, 'archiveBytes': int, 'archiveSha256': str, 'manifestSha256': str}
    require(isinstance(receipt, dict) and set(receipt_types).issubset(receipt) and
            set(receipt) - set(receipt_types) <= {'evictedWebpackBytes'} and
            all(type(receipt[key]) is kind for key, kind in receipt_types.items()) and receipt['version'] == 1 and
            ('evictedWebpackBytes' not in receipt or
             type(receipt['evictedWebpackBytes']) is int and receipt['evictedWebpackBytes'] >= 0),
            'Unsupported legacy receipt schema')
    require(re.fullmatch(r'[0-9a-f]{64}', receipt['manifestSha256']) and
            hashlib.sha256(manifest_bytes).hexdigest() == receipt['manifestSha256'], 'Legacy manifest checksum differs')
    archive = folder / 'archive.tar.gz'
    info = private_regular(archive)
    require(info.st_size == receipt['archiveBytes'] and re.fullmatch(r'[0-9a-f]{64}', receipt['archiveSha256']), 'Legacy archive size or checksum schema differs')
    rows = manifest['entries']
    common = {'kind', 'mode', 'uid', 'gid', 'atimeNs', 'mtimeNs', 'xattrs'}
    extra = {'directory': set(), 'file': {'size', 'sha256', 'hardlinkGroup'}, 'symlink': {'target'}}
    normalized = {}
    for name, row in rows.items():
        require(isinstance(name, str) and archive_name(name) == name and isinstance(row, dict), 'Unsupported legacy entry structure')
        kind = row.get('kind')
        require(isinstance(kind, str) and kind in extra and set(row) == common | extra[kind], 'Unsupported legacy entry fields')
        require(all(type(row[key]) is int and row[key] >= 0 for key in ('mode', 'uid', 'gid')) and row['mode'] <= 0o7777, 'Unsupported legacy entry ownership or mode')
        require(all(isinstance(row[key], str) and re.fullmatch(r'[0-9]{1,24}', row[key]) for key in ('atimeNs', 'mtimeNs')), 'Unsupported legacy timestamp schema')
        require(isinstance(row['xattrs'], dict) and all(isinstance(key, str) and isinstance(value, str) for key, value in row['xattrs'].items()), 'Unsupported legacy extended-attribute schema')
        for value in row['xattrs'].values():
            try:
                base64.b64decode(value, validate=True)
            except (ValueError, base64.binascii.Error):
                raise ValueError('Unsupported legacy extended-attribute encoding') from None
        if kind == 'file':
            require(type(row['size']) is int and row['size'] >= 0 and isinstance(row['sha256'], str) and re.fullmatch(r'[0-9a-f]{64}', row['sha256']), 'Unsupported legacy file checksum schema')
            group = row['hardlinkGroup']
            strings = isinstance(group, list) and all(isinstance(value, str) for value in group)
            known = strings and all(value in rows and isinstance(rows[value], dict) and rows[value].get('kind') == 'file' for value in group)
            if not strings or not known:
                print(json.dumps({'legacyHardlinkShape': {'containerType': type(group).__name__,
                      'elementTypes': sorted({type(value).__name__ for value in group}) if isinstance(group, list) else [],
                      'onlyKnownFilePaths': bool(known)}}), flush=True)
            require(strings and known and len(group) == len(set(group)) and (not group or name in group), 'Unsupported legacy hard-link group structure')
        elif kind == 'symlink':
            require(isinstance(row['target'], str), 'Unsupported legacy symbolic-link schema')
        converted = {'kind': 'link' if kind == 'symlink' else kind, 'mode': row['mode'], 'uid': row['uid'], 'gid': row['gid'],
                     'mtime': int(row['mtimeNs']), 'atime': int(row['atimeNs']), 'size': row['size'] if kind == 'file' else 0,
                     'sha256': row['sha256'] if kind == 'file' else None,
                     'link': row['target'] if kind == 'symlink' else None, 'xattrs': row['xattrs']}
        if kind == 'file':
            converted['hardlinkGroup'] = list(row['hardlinkGroup'])
        normalized[name] = converted
    for name, row in normalized.items():
        if row['kind'] != 'file':
            continue
        group = row['hardlinkGroup']
        for member in group:
            other = normalized[member]
            require(set(other['hardlinkGroup']) == set(group) and
                    {key: value for key, value in row.items() if key != 'hardlinkGroup'} ==
                    {key: value for key, value in other.items() if key != 'hardlinkGroup'},
                    'Legacy hard-link group metadata or symmetry differs')
    result = {'version': 1, 'release': folder.name, 'files': normalized, 'archiveFile': 'archive.tar.gz',
              'archiveSha256': receipt['archiveSha256'], 'legacySchema': 'entries-v1'}
    require(compatible_vocab_manifest(result), 'Legacy entry normalization failed')
    return result


def load_vocab_archive_manifest(folder, manifest_bytes=None):
    raw = (folder / 'manifest.json').read_bytes() if manifest_bytes is None else manifest_bytes
    manifest = json.loads(raw)
    if isinstance(manifest, dict) and 'entries' in manifest:
        receipt = json.loads((folder / 'receipt.json').read_text())
        return normalize_legacy_manifest(folder, manifest, receipt, raw)
    require(compatible_vocab_manifest(manifest), 'Unsupported retained manifest schema')
    return manifest


def restore_access_times(directory, records):
    for name in sorted(records, key=lambda value: len(PurePosixPath(value).parts), reverse=True):
        expected = records[name]
        if 'atime' in expected:
            target = directory / name
            os.utime(target, ns=(expected['atime'], expected['mtime']), follow_symlinks=False)
            info = target.lstat()
            require((info.st_atime_ns, info.st_mtime_ns) == (expected['atime'], expected['mtime']), 'Restored legacy timestamps differ')


def verify_full_restoration(directory, manifest):
    expected = {name: {key: value for key, value in row.items() if key not in ('atime', 'hardlinkGroup')}
                for name, row in manifest['files'].items()}
    require(snapshot(directory) == expected, 'Restored files differ; do not activate')
    for name, row in manifest['files'].items():
        for other in row.get('hardlinkGroup', []):
            left, right = (directory / name).lstat(), (directory / other).lstat()
            require((left.st_dev, left.st_ino) == (right.st_dev, right.st_ino), 'Restored legacy hard-link identity differs')
    restore_access_times(directory, manifest['files'])


def private_regular(path):
    metadata = path.lstat()
    require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == os.geteuid() and metadata.st_nlink == 1
            and stat.S_IMODE(metadata.st_mode) & 0o077 == 0, 'Private archive metadata type or ownership differs')
    return metadata


def preflight_vocab_base_archives():
    """Inspect every fixed candidate before changing even the newer rollback."""
    no_links(BASE_ARCHIVE_ROOT)
    require(BASE_ARCHIVE_ROOT.is_dir(), 'Reviewed archive base is unavailable')
    candidates = list(BASE_ARCHIVE_ROOT.iterdir())
    plans = []
    for commit in VOCAB_BASE_COMMITS:
        matches = [folder for folder in candidates if re.fullmatch(re.escape(commit) + r'-[A-Za-z0-9_-]{1,128}', folder.name)]
        require(len(matches) == 1, 'A reviewed legacy archive is missing or ambiguous; retain all copies')
        folder = matches[0]
        no_links(folder)
        info = folder.stat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o700, 'Private archive directory metadata differs')
        for name in ('manifest.json', 'receipt.json', 'restore.py', 'RESTORE_REQUIRED.txt'):
            private_regular(folder / name)
        try:
            manifest_bytes = (folder / 'manifest.json').read_bytes()
            manifest = json.loads(manifest_bytes)
            receipt = json.loads((folder / 'receipt.json').read_text())
        except (UnicodeError, json.JSONDecodeError):
            raise ValueError('Legacy archive metadata is unreadable; retain all copies') from None
        original_manifest = manifest
        try:
            manifest = load_vocab_archive_manifest(folder, manifest_bytes)
            compatible = compatible_vocab_manifest(manifest)
            legacy = isinstance(original_manifest, dict) and 'entries' in original_manifest
            receipt_compatible = legacy or (isinstance(receipt, dict) and receipt.get('restorationVerified') is True
                                  and receipt.get('release') == manifest.get('release')
                                  and receipt.get('archiveSha256') == manifest.get('archiveSha256')
                                  and type(receipt.get('files')) is int and receipt['files'] == len(manifest.get('files', {})))
        except ValueError as error:
            print(json.dumps({'legacyArchiveSchema': {'commit': commit, 'manifest': manifest_shape(original_manifest),
                             'receipt': manifest_shape(receipt), 'compatible': False, 'reason': str(error)}}), flush=True)
            raise ValueError('Legacy archive schema needs explicit compatibility review before any archive write; retain all copies') from None
        print(json.dumps({'legacyArchiveSchema': {'commit': commit, 'manifest': manifest_shape(manifest),
                                                'receipt': manifest_shape(receipt), 'compatible': compatible and receipt_compatible}}), flush=True)
        require(compatible and receipt_compatible, 'Legacy archive schema needs explicit compatibility review before any archive write; retain all copies')
        archive = folder / manifest.get('archiveFile', 'archive.tar.gz')
        private_regular(archive)
        require(digest(archive) == manifest['archiveSha256'], 'Preflighted legacy archive checksum differs; retain all copies')
        require(not os.path.lexists(folder / '.verify') and not os.path.lexists(folder / 'archive.tar.xz.pending'), 'An interrupted archive operation needs review; retain all copies')
        # All schemas are reviewed first, but keep only a small checksum plan.
        # Thirteen expanded legacy manifests would otherwise compete with the
        # running application for hundreds of MiB of memory.
        plans.append((folder, {'verifiedManifestSha256': hashlib.sha256(manifest_bytes).hexdigest()}))
    return plans


def retain_vocab_metadata(folder):
    # Preserve the exact older helper, manifest, receipt and instructions, even
    # after the format-aware helper and current metadata are installed atomically.
    for name in ('restore.py', 'manifest.json', 'receipt.json', 'RESTORE_REQUIRED.txt'):
        source = folder / name
        metadata = private_regular(source)
        target = folder / (name + '.before-vocab')
        if os.path.lexists(target):
            private_regular(target)
            require(entry_record(target) == entry_record(source), 'Original metadata retention differs; retain all copies')
            continue
        with source.open('rb') as incoming, os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') as outgoing:
            shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
            outgoing.flush(); os.fsync(outgoing.fileno())
        os.chmod(target, stat.S_IMODE(metadata.st_mode))
        os.chown(target, metadata.st_uid, metadata.st_gid)
        attributes = {name: os.getxattr(source, name, follow_symlinks=False)
                      for name in os.listxattr(source, follow_symlinks=False)}
        for name in set(os.listxattr(target, follow_symlinks=False)) - set(attributes):
            os.removexattr(target, name, follow_symlinks=False)
        for name, value in attributes.items():
            os.setxattr(target, name, value, follow_symlinks=False)
        os.chmod(target, stat.S_IMODE(metadata.st_mode))
        os.utime(target, ns=(metadata.st_atime_ns, metadata.st_mtime_ns))
        require(entry_record(target) == entry_record(source), 'Original metadata retention failed; retain all copies')
    sync_directory(folder)


def recompress_vocab_base(folder, manifest, source_code):
    if set(manifest) == {'verifiedManifestSha256'}:
        private_regular(folder / 'manifest.json')
        raw = (folder / 'manifest.json').read_bytes()
        require(hashlib.sha256(raw).hexdigest() == manifest['verifiedManifestSha256'], 'Preflighted legacy manifest changed; retain all copies')
        manifest = load_vocab_archive_manifest(folder, raw)
    verify_archive(folder, manifest)
    if manifest.get('archiveFile') == 'archive.tar.xz':
        return manifest
    retain_vocab_metadata(folder)
    return recompress_retained(folder, manifest, source_code)


def verify_vocab_plan():
    free = shutil.disk_usage(RELEASES).free
    print(json.dumps({'rootFreeMiB': free // 1024**2, 'archiveThresholdMiB': VOCAB_REQUIRED_FREE // 1024**2}), flush=True)
    if free >= VOCAB_REQUIRED_FREE:
        print(json.dumps({'archivingNeeded': False, 'historicalCopiesChanged': False}), flush=True)
        return None
    protected = RELEASES / VOCAB_PROTECTED
    require(protected.is_dir() and not protected.is_symlink(), 'Latest rollback directory must remain intact')
    protected_receipt = reviewed_receipt(VOCAB_PROTECTED)
    require((protected / '.next/BUILD_ID').read_text().strip() == protected_receipt['oldBuildId'], 'Protected rollback build identity differs')
    inactive(protected)
    older = RELEASES / VOCAB_ARCHIVE
    older_receipt = reviewed_receipt(VOCAB_ARCHIVE)
    if not older.is_symlink():
        require(older.is_dir() and (older / '.next/BUILD_ID').read_text().strip() == older_receipt['oldBuildId'], 'Reviewed older rollback identity differs')
        inactive(older)
    # All base schemas must be understood before ANY compaction or replacement.
    return preflight_vocab_base_archives()


def preserve_vocab_rollbacks(source_code):
    plans = verify_vocab_plan()
    if plans is None:
        return
    # Lower only this storage preparation's CPU priority; the live service and
    # all earlier entry points retain their existing scheduling and preset.
    os.nice(10)
    started = time.monotonic()
    print(json.dumps({'vocabularyArchiveProgress': {'phase': 'preserve-older-rollback',
                      'rootFreeMiB': shutil.disk_usage(RELEASES).free // 1024**2, 'elapsedSeconds': 0}}), flush=True)
    preserve_reviewed(VOCAB_ARCHIVE, source_code)
    for folder, manifest in plans:
        if shutil.disk_usage(RELEASES).free >= VOCAB_REQUIRED_FREE:
            break
        print(json.dumps({'vocabularyArchiveProgress': {'phase': 'verify-and-recompress',
                         'commit': folder.name[:40], 'rootFreeMiB': shutil.disk_usage(RELEASES).free // 1024**2,
                         'elapsedSeconds': int(time.monotonic() - started)}}), flush=True)
        result = recompress_vocab_base(folder, manifest, source_code)
        print(json.dumps({'vocabularyArchiveProgress': {'phase': 'archive-verified',
                         'commit': folder.name[:40], 'format': result.get('archiveFile', 'archive.tar.gz') if isinstance(result, dict) else 'verified',
                         'rootFreeMiB': shutil.disk_usage(RELEASES).free // 1024**2,
                         'elapsedSeconds': int(time.monotonic() - started)}}), flush=True)
    free = shutil.disk_usage(RELEASES).free
    print(json.dumps({'vocabularyReleaseRootFreeMiB': free // 1024**2, 'archiveThresholdMiB': VOCAB_REQUIRED_FREE // 1024**2}), flush=True)
    require(free >= VOCAB_REQUIRED_FREE, 'Verified archive savings still do not meet the unchanged release headroom; retain all backups')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--apply-astra', action='store_true')
    parser.add_argument('--apply-short-choices', action='store_true')
    parser.add_argument('--apply-vocab', action='store_true')
    parser.add_argument('--verify-vocab-plan', action='store_true')
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--restore')
    args = parser.parse_args()
    require(sum([args.apply, args.apply_astra, args.apply_short_choices, args.apply_vocab, args.verify_vocab_plan, args.verify, bool(args.restore)]) == 1, 'Select exactly one operation')
    require(os.geteuid() == 0, 'Preserving file ownership requires root')
    if args.verify or args.restore:
        folder = Path(__file__).resolve().parent
        manifest = load_vocab_archive_manifest(folder)
        verify_archive(folder, manifest)
        if args.restore:
            target = Path(args.restore)
            require(target.is_absolute() and not os.path.lexists(target), 'Restore only to an empty new absolute path')
            no_links(target.parent)
            require(target.parent.stat().st_uid == 0 and stat.S_IMODE(target.parent.stat().st_mode) == 0o700, 'Restore parent must be private root-owned mode 0700')
            require(shutil.disk_usage(target.parent).free >= sum(item['size'] for item in manifest['files'].values()) + 512 * 1024**2, 'Full restoration requires space for the original tree')
            target.mkdir(mode=0o700)
            extract_archive(folder / manifest.get('archiveFile', 'archive.tar.gz'), target)
            verify_full_restoration(target, manifest)
        print(json.dumps({'verified': True, 'restored': bool(args.restore), 'applicationActivated': False}))
        return
    no_links(RELEASES); no_links(ARCHIVE_ROOT)
    require(ARCHIVE_ROOT.parent.is_dir() and ARCHIVE_ROOT.parent.stat().st_uid == 0 and stat.S_IMODE(ARCHIVE_ROOT.parent.stat().st_mode) == 0o700, 'Existing private archive base must be root-owned mode 0700')
    no_links(Path('/run/study-plan-release'))
    with open('/run/study-plan-release/lock', 'r+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        source_code = globals().get('_SOURCE') or Path(__file__).read_text()
        if args.verify_vocab_plan:
            plans = verify_vocab_plan()
            print(json.dumps({'vocabularyArchivePlanVerified': True, 'archiveWrites': 0, 'candidates': len(plans) if plans else 0}), flush=True)
        elif args.apply_vocab:
            preserve_vocab_rollbacks(source_code)
        elif args.apply_short_choices:
            preserve_short_choices_rollback(source_code)
        elif args.apply_astra:
            preserve_astra_rollbacks(source_code)
        else:
            for name in NEWER:
                candidate = RELEASES / name
                require(candidate.is_dir() and not candidate.is_symlink(), 'Both newer rollback directories must remain intact')
            preserve_reviewed(IDENTITY, source_code)


if __name__ == '__main__':
    main()
