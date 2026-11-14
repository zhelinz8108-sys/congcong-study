"""Mount only the existing fstab data volume; never format or replace files."""
import json
import os
from pathlib import Path
import stat
import subprocess

DATA = Path('/www/study-plan-data')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def ensure_data_mount(data=DATA, fstab=Path('/etc/fstab')):
    require(all(not p.is_symlink() for p in (data, *data.parents)), 'Symlinked data mount path is not allowed')
    require(data.is_dir(), 'The configured data mount directory must already exist')
    if data.is_mount():
        require(data.stat().st_dev != data.parent.stat().st_dev, 'Data volume must be separate from the system volume')
        return {'dataMounted': True, 'changed': False}
    entries = [fields for line in fstab.read_text().splitlines()
               if not line.lstrip().startswith('#') and len(fields := line.split()) >= 4 and fields[1] == str(data)]
    require(len(entries) == 1 and entries[0][2] == 'ext4', 'Exactly one existing ext4 fstab entry is required')
    require(not any(data.iterdir()), 'Unmounted data path contains files; preserve them and stop')
    source = entries[0][0]
    require(source.startswith('UUID=') or source.startswith('/dev/'), 'Only the existing block-device source is allowed')
    device = subprocess.run(['findfs', source], check=True, capture_output=True, text=True).stdout.strip() if source.startswith('UUID=') else source
    require(device.startswith('/dev/') and stat.S_ISBLK(Path(device).stat().st_mode), 'Configured source is not an available block device')
    current = subprocess.run(['findmnt', '-rn', '-S', device, '-o', 'TARGET'], capture_output=True, text=True)
    require(current.returncode == 1 and not current.stdout.strip(), 'Configured data volume is already mounted elsewhere or cannot be checked')
    # mount reads source/options from the existing fstab. No format, repair,
    # unmount, fstab edit or removal of any application/backup data occurs.
    subprocess.run(['mount', '--', str(data)], check=True)
    require(data.is_mount() and data.stat().st_dev != data.parent.stat().st_dev, 'The expected separate data volume did not mount')
    require((data / 'backups').is_dir(), 'Mounted data volume has no existing backup directory')
    return {'dataMounted': True, 'changed': True, 'existingBackupsAvailable': True}


if __name__ == '__main__':
    require(os.geteuid() == 0, 'Mounting the existing data volume requires root')
    print(json.dumps(ensure_data_mount()), flush=True)
