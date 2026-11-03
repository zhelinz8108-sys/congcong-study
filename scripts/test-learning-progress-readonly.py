"""Synthetic bounded-pipe/envelope checks; no production, data, or network."""
import base64
import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import time
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('progress_transport', Path(__file__).with_name('run-learning-progress-readonly.py'))
T = importlib.util.module_from_spec(spec); spec.loader.exec_module(T)
checks = 0


def check(value):
    global checks
    assert value; checks += 1


def blocked(callback):
    try:
        callback()
    except Exception as error:
        check('PRIVATE_DIAGNOSTIC' not in str(error)); return
    raise AssertionError('Unsafe transport case accepted')


def child(script, body=b'local synthetic stdin', timeout=3):
    created = []
    original = T.subprocess.Popen
    def track(*args, **kwargs):
        value = original(*args, **kwargs); created.append(value); return value
    try:
        with patch.object(T.subprocess, 'Popen', side_effect=track):
            return T.run_bounded([sys.executable, '-B', '-c', script], body, os.environ.copy(), str(Path.cwd()), timeout)
    finally:
        check(all(value.poll() is not None for value in created))


normal = child("import sys; data=sys.stdin.buffer.read(); sys.stderr.write('PRIVATE_DIAGNOSTIC'); sys.stdout.write(str(len(data)))", b'x' * (512 * 1024))
check(normal == b'524288')
blocked(lambda: child("import sys; sys.stdin.buffer.read(); sys.stdout.buffer.write(b'x' * (300 * 1024)); sys.stdout.flush()"))
blocked(lambda: child("import sys; sys.stdin.buffer.read(); sys.stderr.buffer.write(b'PRIVATE_DIAGNOSTIC' * 2048); sys.stderr.flush()"))
started = time.monotonic()
blocked(lambda: child("import sys,time; sys.stdin.buffer.read(); time.sleep(20)", timeout=0.1))
check(time.monotonic() - started < 3)
blocked(lambda: child("import sys; sys.stdin.buffer.read(); sys.stderr.write('PRIVATE_DIAGNOSTIC'); sys.exit(7)"))

chunks = lambda value: [value[index:index + 240] for index in range(0, len(value), 240)]
envelope = {'status': 'encrypted-readonly-learning-progress', 'version': 1,
    'algorithm': 'RSA-OAEP-SHA256+A256GCM', 'iv': base64.b64encode(b'i' * 12).decode(),
    'tag': base64.b64encode(b't' * 16).decode(),
    'wrappedKey': chunks(base64.b64encode(b'w' * 256).decode()),
    'ciphertext': chunks(base64.b64encode(b'local invented ciphertext').decode())}
T.validate_envelope(envelope); check(True)
blocked(lambda: T.validate_envelope({'math': {'answered': 22}}))
for key, bad in [('status', 'verified-readonly-learning-progress'), ('version', True),
        ('algorithm', 'plaintext'), ('iv', base64.b64encode(b'short').decode()),
        ('tag', '***MASKED***'), ('wrappedKey', []), ('ciphertext', ['not base64'])]:
    value = copy.deepcopy(envelope); value[key] = bad
    blocked(lambda value=value: T.validate_envelope(value))
value = copy.deepcopy(envelope); value['math'] = {'answered': 22}
blocked(lambda: T.validate_envelope(value))
raw = json.dumps(envelope, separators=(',', ':')).encode()
encoded = raw.hex().translate(str.maketrans('0123456789abcdef', 'ABCDEFGHIJKLMNOP'))
check(all('A' <= char <= 'P' for char in encoded))
check(bytes.fromhex(encoded.translate(str.maketrans('ABCDEFGHIJKLMNOP', '0123456789abcdef'))) == raw)
print('PASS: bounded stdout/stderr, timeout/exit cleanup, strict ciphertext-only envelope and mask-safe roundtrip (' + str(checks) + ' checks).')
