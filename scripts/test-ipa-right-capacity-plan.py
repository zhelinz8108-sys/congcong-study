"""Only new roster/budget and completed-stage reentry checks; no old suites."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile

spec = importlib.util.spec_from_file_location('ipa_right_capacity_plan', Path(__file__).with_name('prepare-ipa-right-capacity.py'))
P = importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
CHECKS = 0


def check(value):
    global CHECKS
    assert value; CHECKS += 1


def blocked(callback):
    try: callback()
    except Exception:
        check(True); return
    raise AssertionError('Unsafe stage accepted')


phases = P.budget(3616276480, P.ROSTER, 5052556926)
check(phases == [(2202722048,4422647552),(3009093120,5228879360)])
check(all(copy >= P.TEMPORARY_FLOOR for copy, _free in phases))
check(P.budget(phases[0][1], P.ROSTER[1:], 5052556926) == phases[1:])
check(P.budget(phases[1][0], P.ROSTER[1:], 5052556926, P.ROSTER[1][0:2])[-1][1] == phases[-1][1])
blocked(lambda: P.budget(3616276480-176322435, P.ROSTER, 5052556926))
blocked(lambda: P.budget(3616276480-600000000, P.ROSTER, 5052556926))
check(not ({item[0:2] for item in P.ROSTER} & P.PROTECTED))
check(len(P.PROTECTED) == 3 and len(P.ROSTER) == 2)

with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary); releases = root / 'releases'; releases.mkdir()
    archive_root = root / 'private'; archive_root.mkdir(mode=0o700)
    item = P.ROSTER[0]; destination = archive_root / P.leaf_name(item); destination.mkdir(mode=0o700)
    source = releases / 'synthetic-old-copy'; source.mkdir(); (source / 'body').write_bytes(b'local synthetic retained bytes\0' * 1024)
    source_fd = P.BASE.open_dir(str(source)); releases_fd = P.BASE.open_dir(str(releases)); parent_fd = P.BASE.open_dir(str(archive_root)); destination_fd = P.BASE.open_dir(str(destination))
    original_root = P.CORE.ROOT_ARCHIVES; original_releases = P.BASE.RELEASES
    try:
        P.CORE.ROOT_ARCHIVES = str(archive_root); P.BASE.RELEASES = str(releases)
        manifest, _snapshot, _allocated = P.RESTORE.source_manifest_fd(source_fd)
        raw = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
        P.CORE.private_write(destination_fd, 'manifest.json', raw)
        target = os.open('archive.tar.gz', os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=destination_fd)
        try: count = P.CORE.write_gzip(source_fd,target,1024*1024,0)
        finally: os.close(target)
        verified = P.RESTORE.verify_archive(str(destination / 'archive.tar.gz'),manifest)
        receipt = {'version':1,'status':'verified-compressed-retention-complete',
                   'sourceMetadata':{'commit':item[0],'buildId':item[1]},'sourceBasename':source.name,
                   'archiveBytes':count,'archiveSha256':verified['archiveSha256'],
                   'manifestSha256':hashlib.sha256(raw).hexdigest()}
        P.CORE.replace_receipt(destination_fd,receipt)
        (source / 'body').unlink(); source.rmdir(); source.symlink_to(destination)
        check(P.completed_stage(parent_fd,releases_fd,item)==count)
        check(P.completed_stage(parent_fd,releases_fd,item)==count)
        check(source.is_symlink() and source.readlink()==destination)
        receipt['status']='archive-incomplete-original-intact'; P.CORE.replace_receipt(destination_fd,receipt)
        blocked(lambda:P.completed_stage(parent_fd,releases_fd,item))
        check(source.is_symlink() and source.readlink()==destination)
        receipt['status']='verified-compressed-retention-complete'; P.CORE.replace_receipt(destination_fd,receipt)
        source.unlink(); source.symlink_to(root/'unrelated')
        blocked(lambda:P.completed_stage(parent_fd,releases_fd,item))
        source.unlink(); source.symlink_to(destination)
        (destination/'original.pending').mkdir()
        blocked(lambda:P.completed_stage(parent_fd,releases_fd,item))
        (destination/'original.pending').rmdir()
        path=destination/'archive.tar.gz'; data=bytearray(path.read_bytes()); data[len(data)//2]^=1; path.write_bytes(data)
        blocked(lambda:P.completed_stage(parent_fd,releases_fd,item))
        check(source.is_symlink() and source.readlink()==destination)
    finally:
        P.CORE.ROOT_ARCHIVES=original_root; P.BASE.RELEASES=original_releases
        for fd in (source_fd,releases_fd,parent_fd,destination_fd): os.close(fd)

print('PASS: exact two/three-preserved roster; capped peak/final budgets; skip completed stages; incomplete/corrupt/wrong-pointer/pending stages stop without overwriting ('+str(CHECKS)+' checks).')
