"""Retain one specifically reviewed old rollback as a verified private archive.

Never change the live application, either newer rollback, learning records,
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
import shutil
import stat
import subprocess
import sys
import time

IDENTITY = 'previous-bd75c1df88402a39f7ff88a4e56507a541d5fc84-40200576699-1'
NEWER = ('previous-f475be68d01c429544df5293187e4c8c47be28c6-40205282115-1',
         'previous-22573b4752de26ff3dedfaa514ba419b0255bbb1-40207660100-1')
ARCHIVE_ROOT = Path('/www/study-plan-retained-compressed/extension-20261104')
RELEASES = Path('/www/study-plan-releases')


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
    """Actually unpack and verify every entry, reclaiming each scratch file.

    GNU tar separately restores every xattr/ACL-bearing entry and hard-link
    group. Verification therefore needs the largest file, not a second tree.
    """
    archive = folder / manifest.get('archiveFile', 'archive.tar.gz')
    require(archive.name in ('archive.tar.gz', 'archive.tar.xz', 'archive.tar.xz.pending'), 'Unexpected retained archive name')
    require(digest(archive) == manifest['archiveSha256'], 'Archive checksum mismatch; retain all copies')
    temporary = folder / '.verify'
    require(not os.path.lexists(temporary), 'An interrupted verification requires review; retain all copies')
    temporary.mkdir(mode=0o700)
    headers, selected = {}, set()
    try:
        with archive_stream(archive) as uncompressed:
            with tarfile.open(fileobj=uncompressed, mode='r|') as contents:
                for member in contents:
                    name = archive_name(member.name)
                    require(name in manifest['files'] and name not in headers, 'Unexpected or repeated archive member')
                    expected = manifest['files'][name]
                    kind = 'file' if member.isfile() or member.islnk() else 'directory' if member.isdir() else 'link' if member.issym() else None
                    mtime = int(Decimal(member.pax_headers.get('mtime', str(member.mtime))) * 1_000_000_000)
                    require(kind == expected['kind'] and stat.S_IMODE(member.mode) == expected['mode'] and member.uid == expected['uid'] and member.gid == expected['gid'] and mtime == expected['mtime'], 'Archive metadata differs; original is retained')
                    headers[name] = {'name': member.name, 'regular': member.isfile(), 'target': archive_name(member.linkname) if member.islnk() else None}
                    if member.islnk():
                        selected.add(name)
                        continue
                    if member.isfile():
                        require(member.size == expected['size'], 'Archive size differs; original is retained')
                        require(shutil.disk_usage(folder).free >= member.size + 512 * 1024**2, 'Insufficient scratch for largest file; original is retained')
                    if member.issym():
                        require(member.linkname == expected['link'], 'Archive link differs; original is retained')
                    special = bool(expected['xattrs']) or any('xattr' in key or key.startswith('SCHILY.acl.') or key == 'RHT.security.selinux' for key in member.pax_headers)
                    if special:
                        selected.add(name)
                    sample = temporary / 'entry'
                    if member.isfile():
                        with contents.extractfile(member) as input_stream, sample.open('xb') as output:
                            shutil.copyfileobj(input_stream, output, 1024 * 1024)
                    elif member.isdir():
                        sample.mkdir(mode=0o700)
                    else:
                        sample.symlink_to(member.linkname)
                    os.chown(sample, member.uid, member.gid, follow_symlinks=False)
                    if not member.issym():
                        sample.chmod(member.mode)
                    os.utime(sample, ns=(mtime, mtime), follow_symlinks=False)
                    restored = entry_record(sample)
                    fields = set(expected) - ({'xattrs'} if special else set())
                    require(all(restored[key] == expected[key] for key in fields), 'Unpacked entry differs; original is retained')
                    if sample.is_dir() and not sample.is_symlink():
                        sample.rmdir()
                    else:
                        sample.unlink()
            # Drain gzip through its trailer, validating CRC and final length.
            while uncompressed.read(1024 * 1024):
                pass
        require(set(headers) == set(manifest['files']), 'Archive omitted original entries')
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
                require(entry_record(extracted / name) == manifest['files'][name], 'Restored extended metadata or hard link differs')
    finally:
        shutil.rmtree(temporary)


def compact(source, destination, helper_source):
    no_links(source.parent); no_links(destination.parent)
    require(source.is_dir() and not source.is_symlink(), 'Expected the reviewed unused rollback directory')
    before = snapshot(source)
    if os.path.lexists(destination):
        # This exact earlier failure produced only an incomplete generated
        # archive. The intact original was never renamed or released.
        require(destination.is_dir() and not destination.is_symlink() and stat.S_IMODE(destination.stat().st_mode) == 0o700 and destination.stat().st_uid == os.geteuid(), 'Unexpected previous attempt; retain all copies')
        require({entry.name for entry in destination.iterdir()} == {'archive.tar.gz'}, 'A complete or ambiguous archive must be retained')
        partial = destination / 'archive.tar.gz'; metadata = partial.lstat()
        require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == os.geteuid() and metadata.st_nlink == 1 and stat.S_IMODE(metadata.st_mode) == 0o600, 'Unexpected partial archive; retain all copies')
        partial.unlink(); destination.rmdir(); sync_directory(destination.parent)
    largest = max(item['size'] for item in before.values())
    free = shutil.disk_usage(source).free
    require(free >= largest + 768 * 1024**2, 'Insufficient scratch space to verify largest file')
    destination.mkdir(mode=0o700)
    archive = destination / 'archive.tar.gz'
    with archive.open('xb') as out:
        os.chmod(archive, 0o600)
        process = subprocess.Popen(['tar', '--create', '--format=pax', '--numeric-owner', '--xattrs', '--acls', '--selinux', '-I', 'gzip -1', '--file', '-', '--directory', str(source), '.'], stdout=out, stderr=subprocess.DEVNULL)
        while process.poll() is None:
            if archive.stat().st_size > free - largest - 512 * 1024**2:
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
    require(original.name == 'archive.tar.gz' and digest(original) == manifest['archiveSha256'], 'Original archive differs')
    pending = folder / 'archive.tar.xz.pending'
    require(not os.path.lexists(pending) and not (folder / 'archive.tar.xz').exists(), 'An interrupted recompression requires review')
    reserve = max(row['size'] for row in manifest['files'].values()) + 512 * 1024**2
    try:
        with gzip.open(original, 'rb') as incoming, pending.open('xb') as raw_output:
            pending.chmod(0o600)
            with lzma.LZMAFile(raw_output, 'w', format=lzma.FORMAT_XZ, preset=6) as outgoing:
                while chunk := incoming.read(1024 * 1024):
                    require(shutil.disk_usage(folder).free >= reserve + 16 * 1024**2, 'Recompression scratch exhausted; original archive is retained')
                    outgoing.write(chunk)
            raw_output.flush(); os.fsync(raw_output.fileno())
        require(pending.stat().st_size < original.stat().st_size, 'Recompression did not reduce space; original is retained')
        candidate = {**manifest, 'archiveFile': pending.name, 'archiveSha256': digest(pending)}
        verify_archive(folder, candidate)
        final = folder / 'archive.tar.xz'
        pending.rename(final); sync_directory(folder)
        candidate['archiveFile'] = final.name
        # New restore code understands both formats, so all interruption points
        # still leave at least the old or the new fully verified backup usable.
        replace_private(folder / 'restore.py', helper_source, 0o700)
        replace_private(folder / 'manifest.json', json.dumps(candidate))
        replace_private(folder / 'RESTORE_REQUIRED.txt', 'Full rollback is preserved in archive.tar.xz. Verify: python3 restore.py --verify\nRestore to a NEW private directory: python3 restore.py --restore /absolute/new-directory\nThis does not activate the app or restore a database. Never use this archive pointer as an application directory.\n')
        replace_private(folder / 'receipt.json', json.dumps({'version': 1, 'release': manifest['release'], 'archiveSha256': candidate['archiveSha256'], 'restorationVerified': True, 'files': len(manifest['files'])}))
        require(digest(final) == candidate['archiveSha256'], 'Replacement archive changed; retain both copies')
        original.unlink(); sync_directory(folder)
        return candidate
    except BaseException:
        # Do not discard a completed archive or a metadata-switched backup.
        if original.is_file() and pending.exists():
            pending.unlink(); sync_directory(folder)
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--restore')
    args = parser.parse_args()
    require(sum([args.apply, args.verify, bool(args.restore)]) == 1, 'Select exactly one operation')
    require(os.geteuid() == 0, 'Preserving file ownership requires root')
    if args.verify or args.restore:
        folder = Path(__file__).resolve().parent
        manifest = json.loads((folder / 'manifest.json').read_text())
        verify_archive(folder, manifest)
        if args.restore:
            target = Path(args.restore)
            require(target.is_absolute() and not os.path.lexists(target), 'Restore only to an empty new absolute path')
            no_links(target.parent)
            require(target.parent.stat().st_uid == 0 and stat.S_IMODE(target.parent.stat().st_mode) == 0o700, 'Restore parent must be private root-owned mode 0700')
            require(shutil.disk_usage(target.parent).free >= sum(item['size'] for item in manifest['files'].values()) + 512 * 1024**2, 'Full restoration requires space for the original tree')
            target.mkdir(mode=0o700)
            extract_archive(folder / manifest.get('archiveFile', 'archive.tar.gz'), target)
            require(snapshot(target) == manifest['files'], 'Restored files differ; do not activate')
        print(json.dumps({'verified': True, 'restored': bool(args.restore), 'applicationActivated': False}))
        return
    no_links(RELEASES); no_links(ARCHIVE_ROOT)
    require(ARCHIVE_ROOT.parent.is_dir() and ARCHIVE_ROOT.parent.stat().st_uid == 0 and stat.S_IMODE(ARCHIVE_ROOT.parent.stat().st_mode) == 0o700, 'Existing private archive base must be root-owned mode 0700')
    source = RELEASES / IDENTITY
    for name in NEWER:
        candidate = RELEASES / name
        require(candidate.is_dir() and not candidate.is_symlink(), 'Both newer rollback directories must remain intact')
    old_receipt = Path('/www/study-plan-data/backups/before-main-' + IDENTITY.removeprefix('previous-') + '/receipt.json')
    receipt = json.loads(old_receipt.read_text())
    require(receipt['status'] == 'deployed' and receipt['previousDirectory'] == str(source), 'Successful old-release receipt is required')
    destination = ARCHIVE_ROOT / IDENTITY
    no_links(Path('/run/study-plan-release'))
    with open('/run/study-plan-release/lock', 'r+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if source.is_symlink():
            require(source.readlink() == destination / 'RESTORE_REQUIRED.txt', 'Unexpected archive pointer')
            archived_manifest = json.loads((destination / 'manifest.json').read_text())
            verify_archive(destination, archived_manifest)
            remove_retained_duplicate(RELEASES / ('.compacting-' + IDENTITY), archived_manifest)
            source_code = globals().get('_SOURCE') or Path(__file__).read_text()
            recompress_retained(destination, archived_manifest, source_code)
            print(json.dumps({'alreadyPreserved': True, 'archiveFormat': 'xz', 'rootFreeMiB': shutil.disk_usage(RELEASES).free // 1024**2})); return
        inactive(source)
        require((source / '.next/BUILD_ID').read_text().strip() == receipt['oldBuildId'], 'Old rollback build identity differs')
        ARCHIVE_ROOT.mkdir(mode=0o700, exist_ok=True); ARCHIVE_ROOT.chmod(0o700); sync_directory(ARCHIVE_ROOT.parent)
        source_code = globals().get('_SOURCE') or Path(__file__).read_text()
        result = compact(source, destination, source_code)
        recompress_retained(destination, json.loads((destination / 'manifest.json').read_text()), source_code)
        print(json.dumps({'preserved': result['restorationVerified'], 'files': result['files'], 'rootFreeMiB': shutil.disk_usage(RELEASES).free // 1024**2}))


if __name__ == '__main__':
    main()
