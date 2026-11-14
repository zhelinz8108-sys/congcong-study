"""Read only known deployment metadata; never print credentials or learner data."""
import json
import re
import shutil
import subprocess
from pathlib import Path

root = Path('/www/study-plan-releases')
data = Path('/www/study-plan-data')
paths = [root, data, data / 'backups', data / 'failed-release-archives',
         Path('/www/study-plan-retained-compressed'), Path('/var/log')]
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
        if not re.fullmatch(r'(?:previous-)?[a-f0-9]{40}-[0-9]+-[0-9]+', p.name):
            continue
        item = {'release': p.name, 'symlink': p.is_symlink(), 'active': p.resolve() == active}
        if p.is_dir() and not p.is_symlink():
            size = subprocess.run(['du', '-sx', '-B1', str(p)], capture_output=True, text=True)
            if size.returncode == 0:
                item['sizeMiB'] = int(size.stdout.split()[0]) // 1024**2
        releases.append(item)
    print(json.dumps({'releases': releases}), flush=True)
