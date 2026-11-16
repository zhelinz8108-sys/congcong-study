"""Read only known deployment metadata; never print credentials or learner data."""
import json
import os
import re
import shutil
import stat
import subprocess
from pathlib import Path

root = Path('/www/study-plan-releases')
data = Path('/www/study-plan-data')
compressed = Path('/www/study-plan-retained-compressed')
release_name = re.compile(r'(?:previous-)?[a-f0-9]{40}-[0-9]+-[0-9]+')


def path_metadata(target):
    """Metadata only; never open a file or print a symbolic link's contents."""
    try:
        info = target.lstat()
    except FileNotFoundError:
        return {'exists': False}
    except OSError as error:
        return {'readable': False, 'errorType': type(error).__name__}
    kind = ('symlink' if stat.S_ISLNK(info.st_mode) else 'directory' if stat.S_ISDIR(info.st_mode)
            else 'file' if stat.S_ISREG(info.st_mode) else 'other')
    return {'exists': True, 'kind': kind, 'uid': info.st_uid, 'gid': info.st_gid,
            'mode': oct(stat.S_IMODE(info.st_mode)), 'links': info.st_nlink,
            'sizeBytes': info.st_size, 'allocatedBytes': info.st_blocks * 512}


def directory_size(target):
    """du does not follow nested symbolic links; its filename output stays private."""
    if path_metadata(target).get('kind') != 'directory':
        return {}
    measured = subprocess.run(['du', '-sx', '-B1', str(target)], capture_output=True, text=True)
    if measured.returncode != 0:
        return {'sizeMeasured': False}
    try:
        return {'sizeMiB': int(measured.stdout.split()[0]) // 1024**2}
    except (ValueError, IndexError):
        return {'sizeMeasured': False}


def cache_measurements():
    # These are the only cache roots eligible for diagnostics. Unknown link
    # targets are not printed, traversed, or measured.
    known = (Path('/root/.npm/_cacache'), Path('/home/ubuntu/.npm/_cacache'),
             data / 'npm-cache/ubuntu/_cacache')
    items = []
    for target in known:
        item = {'path': str(target), **path_metadata(target)}
        if item.get('kind') == 'symlink':
            resolved = target.resolve()
            if resolved in known and not resolved.is_symlink():
                item.update(knownTarget=str(resolved), **directory_size(resolved))
            else:
                item['unrecognizedLinkTarget'] = True
        else:
            item.update(directory_size(target))
        items.append(item)
    return items


def compressed_measurements():
    items = []
    # Older archives use <commit>-<BUILD_ID> at the base; the later fixed
    # extension collection uses full standard release identities. Never log
    # arbitrary private directory names or enumerate archive contents.
    for base in (compressed, compressed / 'extension-20261104'):
        if path_metadata(base).get('kind') != 'directory':
            continue
        for folder in sorted(base.iterdir()):
            identity = None
            if release_name.fullmatch(folder.name):
                identity = folder.name
            elif base == compressed:
                match = re.fullmatch(r'([a-f0-9]{40})-[A-Za-z0-9_-]{1,128}', folder.name)
                if match:
                    identity = match.group(1)
            if identity is None or path_metadata(folder).get('kind') != 'directory':
                continue
            artifacts = []
            for name in ('archive.tar.gz', 'archive.tar.xz', 'manifest.json', 'receipt.json'):
                metadata = path_metadata(folder / name)
                if metadata.get('exists'):
                    artifacts.append({'artifact': name, **metadata})
            items.append({'collection': 'base' if base == compressed else 'extension-20261104',
                          'identity': identity, 'artifacts': artifacts})
    return items


def data_block_measurement():
    # Read the already diagnosed data device's header; no tune2fs mutation.
    device = Path('/dev/vdb')
    try:
        info = device.stat()
        if not stat.S_ISBLK(info.st_mode) or info.st_rdev != data.stat().st_dev:
            return {'knownDeviceMatched': False}
        result = subprocess.run(['tune2fs', '-l', str(device)], capture_output=True, text=True,
                                env={**os.environ, 'LC_ALL': 'C'})
        if result.returncode != 0:
            return {'headerReadable': False}
        fields = dict(line.split(':', 1) for line in result.stdout.splitlines() if ':' in line)
        fields = {key.strip(): value.strip() for key, value in fields.items()}
        if fields.get('Filesystem UUID') != 'afce062a-8570-4341-9fe0-3abac42d210a':
            return {'knownDeviceMatched': False}
        return {'blockCount': int(fields['Block count']),
                'reservedBlockCount': int(fields['Reserved block count']),
                'blockSize': int(fields['Block size'])}
    except (OSError, ValueError, KeyError):
        return {'headerReadable': False}


paths = [root, data, data / 'backups', data / 'failed-release-archives',
         compressed, Path('/var/log')]
summary = []
for target in paths:
    item = {'path': str(target), 'exists': target.exists(), 'symlink': target.is_symlink()}
    if target.exists():
        item.update(device=target.stat().st_dev, freeMiB=shutil.disk_usage(target).free // 1024**2)
    summary.append(item)
print(json.dumps({'storage': summary}), flush=True)
result = subprocess.run(['findmnt', '--json', '--output', 'TARGET,FSTYPE,SIZE,AVAIL', '--target', str(data)], capture_output=True, text=True)
if result.returncode == 0:
    print(json.dumps({'dataMount': json.loads(result.stdout)}), flush=True)
fstab = Path('/etc/fstab')
configured = []
for line in fstab.read_text().splitlines():
    fields = line.split()
    if len(fields) >= 3 and not line.lstrip().startswith('#') and fields[1] == str(data):
        configured.append({'target': fields[1], 'filesystem': fields[2]})
print(json.dumps({'configuredDataMount': configured}), flush=True)
devices = subprocess.run(['lsblk', '--json', '--output', 'NAME,TYPE,FSTYPE,UUID,SIZE,MOUNTPOINTS'], capture_output=True, text=True)
if devices.returncode == 0:
    print(json.dumps({'blockDevices': json.loads(devices.stdout)}), flush=True)
backups = data / 'backups'
if backups.is_dir():
    receipts = [{'release': p.name, 'receiptExists': (p / 'receipt.json').is_file()}
                for p in backups.iterdir() if re.fullmatch(r'before-main-[a-f0-9]{40}-[0-9]+-[0-9]+', p.name)]
    print(json.dumps({'backupDirectories': sorted(receipts, key=lambda r: r['release'])}), flush=True)
if root.is_dir():
    active = Path('/www/study-plan').resolve()
    releases = []
    for p in root.iterdir():
        if not release_name.fullmatch(p.name):
            continue
        item = {'release': p.name, 'symlink': p.is_symlink(), 'active': p.resolve() == active}
        if p.is_dir() and not p.is_symlink():
            size = subprocess.run(['du', '-sx', '-B1', str(p)], capture_output=True, text=True)
            if size.returncode == 0:
                item['sizeMiB'] = int(size.stdout.split()[0]) // 1024**2
        releases.append(item)
    print(json.dumps({'releases': releases}), flush=True)

print(json.dumps({'npmDownloadCaches': cache_measurements()}), flush=True)
print(json.dumps({'retainedCompressedArtifacts': compressed_measurements()}), flush=True)
build_caches = []
active_cache = Path('/www/study-plan/.next/cache')
build_caches.append({'release': 'active', **path_metadata(active_cache), **directory_size(active_cache)})
if root.is_dir():
    for release in sorted(root.iterdir()):
        if release_name.fullmatch(release.name) and path_metadata(release).get('kind') == 'directory':
            cache = release / '.next/cache'
            build_caches.append({'release': release.name, **path_metadata(cache), **directory_size(cache)})
print(json.dumps({'nextBuildCaches': build_caches}), flush=True)
print(json.dumps({'aptBinaryIndexes': [{'file': name, **path_metadata(Path('/var/cache/apt') / name)}
                                      for name in ('pkgcache.bin', 'srcpkgcache.bin')]}), flush=True)
print(json.dumps({'temporaryDirectory': directory_size(Path('/tmp'))}), flush=True)
print(json.dumps({'dataFilesystemBlocks': data_block_measurement()}), flush=True)
