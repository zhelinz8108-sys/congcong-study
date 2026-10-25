"""Minimum read-only capacity/build proof for removing the audio dock."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import urllib.request

if 'BASE' not in globals():
    spec = importlib.util.spec_from_file_location('dock_capacity_base', Path(__file__).with_name('probe-english-six-deployment.py'))
    BASE = importlib.util.module_from_spec(spec); spec.loader.exec_module(BASE)

EXPECTED = ('bd600f0d040dd8c4228b2e603d59967ae79f594b', 'vCaNCuZePJOvSAivnnFkG')
ROLLBACK = ('6b7d383b45b8d2bb72df4dca9b6325e8ec55acc3', 'TeGnpP_edFHWhUmsmVykN')
OLDER = {
    ('ddddbe938feffb520bf3673edae51ba75872791e', '2-GGz-N9kRguKiip52Bnw'),
    ('e00733cfa66583481e42f2acac0b4756c29e4383', 'Sas9SLDIjyshuasmBy6Tn'),
    ('f262dc6438e48d3992f1abe2d0e291ff3108b222', '1Wdbidu-xRXG3qD_eISz9'),
    ('4d65d765912e1f9baf4553c7df5bebe9b16274eb', 'Yj7rcLNGEw2ejYX1YscEO'),
    ('bdc35f288531062f5abb029cd263bbd9b51d65b0', 'DKRqust1YId2JJhNlB18x'),
}
CANDIDATES = {'4d65d765912e1f9baf4553c7df5bebe9b16274eb', 'bdc35f288531062f5abb029cd263bbd9b51d65b0'}


def pair(meta):
    BASE.require(meta and meta['buildMatchesMetadata'])
    return meta['commit'], meta['buildId']


def allocation(fd):
    """Stat-only inode accounting; no linked content is opened or followed."""
    device = os.fstat(fd).st_dev
    records = {}
    files = symlinks = regular = allocated = 0
    def walk(directory):
        nonlocal files, symlinks, regular, allocated
        for name in os.listdir(directory):
            info = os.stat(name, dir_fd=directory, follow_symlinks=False)
            BASE.require(info.st_dev == device)
            identity = info.st_dev, info.st_ino
            value = records.get(identity)
            stable = (info.st_mode, info.st_uid, info.st_gid, info.st_size, info.st_mtime_ns, info.st_ctime_ns, info.st_nlink, info.st_blocks)
            if value is None:
                records[identity] = [stable, 1]
                allocated += info.st_blocks * 512
                if stat.S_ISREG(info.st_mode): regular += info.st_size; files += 1
                elif stat.S_ISLNK(info.st_mode): symlinks += 1
                else: BASE.require(stat.S_ISDIR(info.st_mode))
            else:
                BASE.require(value[0] == stable and not stat.S_ISDIR(info.st_mode))
                value[1] += 1
            if stat.S_ISDIR(info.st_mode):
                child = BASE.child_dir(directory, name)
                try:
                    BASE.require((os.fstat(child).st_dev, os.fstat(child).st_ino) == identity)
                    walk(child)
                finally: os.close(child)
    walk(fd)
    outside = [entry for entry in records.values() if not stat.S_ISDIR(entry[0][0]) and entry[0][6] != entry[1]]
    BASE.require(all(entry[0][6] >= entry[1] for entry in outside))
    outside_bytes = sum(entry[0][7] * 512 for entry in outside)
    return {'allocatedBytes': allocated, 'regularBytes': regular, 'files': files, 'symlinks': symlinks,
        'outsideHardlinkedInodes': len(outside), 'outsideHardlinkedAllocatedBytes': outside_bytes,
        'independentlyReleasableAllocatedBytes': allocated - outside_bytes, 'statOnlyHardlinkScan': True}


def main():
    BASE.require(os.geteuid() == 0 and not sys.argv[1:])
    handles = []
    try:
        app = BASE.open_dir(BASE.APP); handles.append(app)
        releases = BASE.open_dir(BASE.RELEASES); handles.append(releases)
        data = BASE.open_dir(BASE.DATA); handles.append(data)
        BASE.require(os.fstat(app).st_dev == os.fstat(releases).st_dev != os.fstat(data).st_dev)
        lockdir = BASE.open_dir('/run/study-plan-release'); handles.append(lockdir)
        BASE.require(os.fstat(lockdir).st_uid == 0 and stat.S_IMODE(os.fstat(lockdir).st_mode) == 0o700)
        lock = os.open('lock', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=lockdir); handles.append(lock)
        info = os.fstat(lock)
        BASE.require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600)
        fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
        active = BASE.metadata(app); BASE.require(pair(active) == EXPECTED)
        retained = []
        for name in sorted(os.listdir(releases)):
            if not re.fullmatch(r'[A-Za-z0-9._-]{1,180}', name): continue
            if not stat.S_ISDIR(os.stat(name, dir_fd=releases, follow_symlinks=False).st_mode): continue
            fd = BASE.child_dir(releases, name)
            try:
                meta = BASE.metadata(fd)
                if not meta: continue
                identity = pair(meta)
                BASE.require(identity == ROLLBACK or identity in OLDER)
                row = {'metadata': meta, 'role': 'direct-rollback' if identity == ROLLBACK else 'older-inactive',
                    'onRootFilesystem': os.fstat(fd).st_dev == os.fstat(releases).st_dev}
                if identity[0] in CANDIDATES: row['size'] = allocation(fd)
                retained.append(row)
            finally: os.close(fd)
        BASE.require({pair(row['metadata']) for row in retained} == OLDER | {ROLLBACK})
        largest = 0
        for name in BASE.FAILED:
            fd = BASE.open_dir(BASE.DATA + '/failed-release-archives/' + name)
            try: largest = max(largest, BASE.sizes(fd, True)['regularBytes'])
            finally: os.close(fd)
        archives = []
        archive_root = BASE.open_dir('/www/study-plan-retained-compressed'); handles.append(archive_root)
        BASE.require(os.fstat(archive_root).st_uid == 0 and stat.S_IMODE(os.fstat(archive_root).st_mode) == 0o700)
        for name in sorted(os.listdir(archive_root)):
            if name == 'compile-quarantine': continue
            folder = BASE.child_dir(archive_root, name)
            try:
                BASE.require(os.fstat(folder).st_uid == 0 and stat.S_IMODE(os.fstat(folder).st_mode) == 0o700)
                receipt = json.loads(BASE.small(folder, 'receipt.json')); meta = receipt['sourceMetadata']
                BASE.require(set(meta) == {'commit', 'buildId'} and re.fullmatch(r'[0-9a-f]{40}', meta['commit']) and re.fullmatch(r'[A-Za-z0-9_-]{1,128}', meta['buildId']))
                BASE.require(receipt['status'] == 'verified-compressed-retention-complete')
                archive = os.stat('archive.tar.gz', dir_fd=folder, follow_symlinks=False)
                BASE.require(stat.S_ISREG(archive.st_mode) and archive.st_uid == 0 and archive.st_nlink == 1
                    and stat.S_IMODE(archive.st_mode) == 0o600 and archive.st_size == receipt['archiveBytes']
                    and 'original.pending' not in os.listdir(folder))
                archives.append({'metadata': meta, 'receiptComplete': True, 'archiveBytes': archive.st_size})
            finally: os.close(folder)
        BASE.require(len(archives) == 7)
        with urllib.request.urlopen('http://127.0.0.1:3001/api/version', timeout=10) as response: version = json.load(response)
        with urllib.request.urlopen('http://127.0.0.1:3001/api/health', timeout=10) as response: health = json.load(response)
        BASE.require(version == {'commit': EXPECTED[0], 'buildId': EXPECTED[1]}
            and health.get('status') == 'ok' and health.get('checks') == {'database': True, 'storage': True})
        BASE.require(BASE.metadata(app) == active)
        root_free, data_free = shutil.disk_usage(BASE.RELEASES).free, shutil.disk_usage(BASE.DATA).free
        required = 4 * 1024 ** 3 + largest + 64 * 1024 ** 2
        report = {'schema': 'audio-dock-read-only-v1', 'readOnly': True, 'active': active, 'retained': retained,
            'retainedCompressed': archives, 'rootFreeBytes': root_free, 'dataFreeBytes': data_free,
            'largestPriorCodeBytes': largest, 'requiredRootBytes': required, 'requiredDataBytes': 10 * 1024 ** 3,
            'rootThresholdPasses': root_free >= required, 'dataThresholdPasses': data_free >= 10 * 1024 ** 3,
            'activeAndHealthVerified': True}
        print('AUDIO_DOCK_CAPACITY ' + json.dumps(BASE.safe_log(report), separators=(',', ':')), flush=True)
    finally:
        for fd in reversed(handles): os.close(fd)


if __name__ == '__main__':
    try: main()
    except Exception:
        print('Read-only dock capacity probe blocked; no production files changed.', flush=True)
        sys.exit(1)
