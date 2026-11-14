"""Exercise mount guards with fake devices and subprocesses only."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import stat
import tempfile

spec = importlib.util.spec_from_file_location('mount_fixture', Path(__file__).with_name('ensure-release-data-mount.py'))
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); data = root / 'data'; data.mkdir()
    fstab = root / 'fstab'; fstab.write_text(f'UUID=fixture {data} ext4 defaults 0 2\n')
    real_stat = Path.stat
    mounted = False
    calls = []

    def fake_stat(path, *args, **kwargs):
        if str(path) == '/dev/fixture':
            return SimpleNamespace(st_mode=stat.S_IFBLK)
        if mounted and path == data:
            return SimpleNamespace(st_mode=stat.S_IFDIR, st_dev=real_stat(root).st_dev + 1)
        return real_stat(path, *args, **kwargs)

    def run(command, **kwargs):
        global mounted
        calls.append(command)
        if command == ['findfs', 'UUID=fixture']:
            return SimpleNamespace(returncode=0, stdout='/dev/fixture\n')
        if command[0] == 'findmnt':
            return SimpleNamespace(returncode=1, stdout='')
        assert command == ['mount', '--', str(data)]
        mounted = True; (data / 'backups').mkdir()
        return SimpleNamespace(returncode=0)

    with patch.object(Path, 'is_mount', lambda p: p == data and mounted), patch.object(Path, 'stat', fake_stat), patch.object(helper.subprocess, 'run', run):
        assert helper.ensure_data_mount(data, fstab)['changed']
        assert not helper.ensure_data_mount(data, fstab)['changed']
        assert sum(c[0] == 'mount' for c in calls) == 1
    mounted = False; (data / 'backups').rmdir()
    for scenario in ['shadow-files', 'no-config', 'duplicate-config', 'wrong-filesystem', 'symlink']:
        fstab.write_text(f'UUID=fixture {data} ext4 defaults 0 2\n')
        candidate = data
        if scenario == 'shadow-files': (data / 'keep').write_text('preserve')
        if scenario == 'no-config': fstab.write_text('')
        if scenario == 'duplicate-config': fstab.write_text(fstab.read_text() * 2)
        if scenario == 'wrong-filesystem': fstab.write_text(fstab.read_text().replace('ext4', 'tmpfs'))
        if scenario == 'symlink': candidate = root / 'link'; candidate.symlink_to(data)
        with patch.object(helper.subprocess, 'run') as command:
            try: helper.ensure_data_mount(candidate, fstab)
            except ValueError: command.assert_not_called()
            else: raise AssertionError(scenario)
        if (data / 'keep').exists():
            assert (data / 'keep').read_text() == 'preserve'; (data / 'keep').unlink()
    fstab.write_text(f'/dev/fixture {data} ext4 defaults 0 2\n')
    with patch.object(Path, 'stat', fake_stat), patch.object(helper.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='/another/mount')) as command:
        try: helper.ensure_data_mount(data, fstab)
        except ValueError: assert command.call_count == 1 and command.call_args.args[0][0] == 'findmnt'
        else: raise AssertionError('Already-mounted volume was remounted')
print('Passed: existing configured mount, idempotency, shadow files, configuration, symlink and already-mounted guards; no real mounts.')
