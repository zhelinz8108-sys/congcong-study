"""Synthetic filesystem metadata only; never invokes tune2fs or a real device."""
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import tempfile

spec = importlib.util.spec_from_file_location('root_reserve', Path(__file__).with_name('prepare-release-root-reserve.py'))
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
header = {'Filesystem UUID': helper.ROOT_UUID, 'Block size': '4096', 'Block count': '10485760', 'Reserved block count': '524288'}
free = 4453 * 1024**2
plan = helper.adjustment(header, free)
assert plan['targetReservedBlocks'] == 314573
assert free + (plan['originalReservedBlocks'] - plan['targetReservedBlocks']) * 4096 >= helper.REQUIRED_FREE
assert plan['targetReservedBlocks'] * 4096 > 1024**3
updated = {**header, 'Reserved block count': str(plan['targetReservedBlocks'])}
assert helper.adjustment(updated, free) is None
for fields, available in [
    ({'Filesystem UUID': 'another-disk'}, free),
    ({'Block count': '26214400'}, free),
    ({'Block size': '1024'}, free),
    ({'Reserved block count': '262144'}, free),
    ({'Reserved block count': '800000'}, free),
    ({}, 3 * 1024**3),
]:
    try:
        helper.adjustment({**header, **fields}, available)
    except ValueError:
        pass
    else:
        raise AssertionError('Unsafe reservation adjustment accepted')

with tempfile.TemporaryDirectory() as directory:
    folder = Path(directory); folder.chmod(0o700)
    record = folder / 'original.json'
    def mutate(command, **kwargs):
        assert json.loads(record.read_text()) == plan
        assert record.stat().st_mode & 0o777 == 0o600
        assert command == ['tune2fs', '-r', '314573', '/dev/synthetic']
        return SimpleNamespace(returncode=0)
    with patch.object(helper, 'read_header', side_effect=[header, updated]), patch.object(helper.subprocess, 'run', side_effect=mutate) as run:
        helper.apply_adjustment('/dev/synthetic', plan, record, owner_uid=os.geteuid())
        run.assert_called_once()
    # A process can retry an interruption before the metadata write, using
    # exactly the recorded original setting without replacing that record.
    before = record.read_bytes()
    with patch.object(helper, 'read_header', side_effect=[header, updated]), patch.object(helper.subprocess, 'run', side_effect=mutate):
        helper.apply_adjustment('/dev/synthetic', plan, record, owner_uid=os.geteuid())
    assert record.read_bytes() == before
    with patch.object(helper, 'read_header', return_value=updated), patch.object(helper.subprocess, 'run') as run:
        try:
            helper.apply_adjustment('/dev/synthetic', plan, record, owner_uid=os.geteuid())
        except ValueError:
            run.assert_not_called()
        else:
            raise AssertionError('Concurrent administrator change was overwritten')
    record.write_text(json.dumps({**plan, 'originalReservedBlocks': 999}))
    with patch.object(helper.subprocess, 'run') as run:
        try:
            helper.apply_adjustment('/dev/synthetic', plan, record, owner_uid=os.geteuid())
        except ValueError:
            run.assert_not_called()
        else:
            raise AssertionError('Conflicting original configuration record was replaced')
print('Passed: fixed root filesystem, 3%/>1GiB reserve, unchanged release threshold, private original configuration before write, idempotency and concurrent-change guards; no real filesystem mutations.')
