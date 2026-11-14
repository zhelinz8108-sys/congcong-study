"""Recover a bounded part of the known root filesystem's reserved capacity.

Keep at least 3% (over 1 GiB) reserved for root. No files are removed and the
original reservation is recorded privately before the reversible adjustment.
"""
import fcntl
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess

RELEASES = Path('/www/study-plan-releases')
ROOT_UUID = '9842d3d6-a839-4127-bda7-f19137effe71'
RECORD = Path('/www/study-plan-retained-compressed/root-reserve-20261114.json')
REQUIRED_FREE = 5 * 1024**3


def require(condition, message):
    if not condition:
        raise ValueError(message)


def no_links(path):
    require(all(not item.is_symlink() for item in (path, *path.parents)), 'Unexpected symbolic-link path')


def read_header(device):
    result = subprocess.run(['tune2fs', '-l', device], check=True, capture_output=True, text=True, env={**os.environ, 'LC_ALL': 'C'})
    fields = dict(line.split(':', 1) for line in result.stdout.splitlines() if ':' in line)
    return {key.strip(): value.strip() for key, value in fields.items()}


def adjustment(header, available):
    require(header.get('Filesystem UUID') == ROOT_UUID, 'Only the previously diagnosed root filesystem is eligible')
    block_size = int(header['Block size'])
    blocks = int(header['Block count'])
    reserved = int(header['Reserved block count'])
    require(block_size == 4096 and 39 * 1024**3 <= blocks * block_size <= 41 * 1024**3, 'Expected the existing 40 GiB root filesystem')
    target = (blocks * 3 + 99) // 100
    require(target * block_size >= 1024**3, 'Keep at least 1 GiB reserved for root')
    if reserved == target:
        return None
    require(abs(reserved - blocks // 20) <= 1, 'Only the original 5 percent reservation may be adjusted')
    require(available + (reserved - target) * block_size >= REQUIRED_FREE + 64 * 1024**2, 'This bounded adjustment would not provide sufficient release space')
    return {'version': 1, 'filesystemUuid': ROOT_UUID, 'blockSize': block_size, 'blockCount': blocks,
            'originalReservedBlocks': reserved, 'targetReservedBlocks': target}


def apply_adjustment(device, plan, record=RECORD, owner_uid=0):
    no_links(record)
    require(record.parent.is_dir() and record.parent.stat().st_uid == owner_uid and stat.S_IMODE(record.parent.stat().st_mode) == 0o700, 'Existing private root-owned record directory is required')
    if record.exists():
        info = record.stat()
        require(stat.S_ISREG(info.st_mode) and info.st_uid == owner_uid and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600, 'Invalid original reservation record')
        require(json.loads(record.read_text()) == plan, 'Existing reservation record differs; leave configuration unchanged')
    else:
        with os.fdopen(os.open(record, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'w') as output:
            json.dump(plan, output); output.flush(); os.fsync(output.fileno())
        descriptor = os.open(record.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    # Re-read immediately before changing metadata; never overwrite a change
    # made by an administrator between diagnosis and recording the old value.
    current = read_header(device)
    require(current.get('Filesystem UUID') == plan['filesystemUuid'] and
            int(current['Block count']) == plan['blockCount'] and
            int(current['Block size']) == plan['blockSize'] and
            int(current['Reserved block count']) == plan['originalReservedBlocks'], 'Filesystem reservation changed; leave it untouched')
    subprocess.run(['tune2fs', '-r', str(plan['targetReservedBlocks']), device], check=True, capture_output=True, text=True)
    updated = read_header(device)
    require(updated.get('Filesystem UUID') == plan['filesystemUuid'] and int(updated['Reserved block count']) == plan['targetReservedBlocks'], 'Reservation verification failed; original setting remains recorded')


def main():
    require(os.geteuid() == 0, 'Root is required for filesystem metadata')
    no_links(RELEASES); no_links(Path('/run/study-plan-release'))
    with open('/run/study-plan-release/lock', 'r+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        available = shutil.disk_usage(RELEASES).free
        if available >= REQUIRED_FREE:
            print(json.dumps({'rootReservationChanged': False, 'rootFreeMiB': available // 1024**2}))
            return
        result = subprocess.run(['findmnt', '--json', '--target', str(RELEASES), '--output', 'SOURCE,FSTYPE,TARGET,OPTIONS'], check=True, capture_output=True, text=True)
        mounts = json.loads(result.stdout)['filesystems']
        require(len(mounts) == 1, 'Expected a single root filesystem')
        mount = mounts[0]
        require(mount['target'] == '/' and mount['fstype'] == 'ext4' and 'rw' in mount['options'].split(','), 'Only the existing writable ext4 root mount is eligible')
        device = mount['source']
        require(device.startswith('/dev/'), 'Expected a local block device')
        device_info = os.stat(device)
        require(stat.S_ISBLK(device_info.st_mode) and device_info.st_rdev == RELEASES.stat().st_dev == Path('/').stat().st_dev, 'Root block device does not match the release filesystem')
        header = read_header(device)
        print(json.dumps({'rootReservation': {key: header.get(key) for key in ('Filesystem UUID', 'Block size', 'Block count', 'Reserved block count')}, 'rootFreeMiB': available // 1024**2}), flush=True)
        plan = adjustment(header, available)
        if plan is None:
            print(json.dumps({'rootReservationChanged': False, 'boundedAdjustmentAlreadyApplied': True, 'rootFreeMiB': available // 1024**2}))
            return
        print(json.dumps({'rootFreeMiB': available // 1024**2, 'reservedBeforeMiB': plan['originalReservedBlocks'] * plan['blockSize'] // 1024**2,
                          'reservedAfterMiB': plan['targetReservedBlocks'] * plan['blockSize'] // 1024**2}), flush=True)
        apply_adjustment(device, plan)
        available = shutil.disk_usage(RELEASES).free
        require(available >= REQUIRED_FREE, 'Adjusted root capacity still does not meet the unchanged release threshold')
        print(json.dumps({'rootReservationChanged': True, 'rootFreeMiB': available // 1024**2, 'originalConfigurationRecorded': True}))


if __name__ == '__main__':
    main()
