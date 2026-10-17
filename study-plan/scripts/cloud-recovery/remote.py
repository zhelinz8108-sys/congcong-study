"""Fixed recovery operations, invoked in memory by a trusted Actions workflow."""
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import shutil
import stat
import subprocess
import sys
import time
ROOT = Path('/www/study-plan-data/cloud-recovery')
APP = Path('/www/study-plan')
BOOT = Path('/www/study-plan-data/private-cloud-handoff/2026-10-17/bootstrap-credentials')
LEGACY = Path('/www/study-plan-data/private-cloud-handoff/2026-10-17/materials-3b2d7ca9-66e3-4677-9234-232292bd76ed/legacy/congcong-study-local-20260530.zip')
LEGACY_PIN = '2db9545b43d96479ebad0c459711a1473da8216b08da8aae4b35fff5e17e3abc'
RESERVE = 10 * 1024 ** 3
MAX_DUMP = 512 * 1024 ** 2
FILES = [('server-app-env', APP / '.env.local', 65536), ('server-systemd-env', Path('/etc/study-plan.env'), 65536), ('bootstrap-workspace-env', BOOT / 'workspace.env.local', 65536), ('bootstrap-deployment-key', BOOT / 'deployment_ssh_key', 16384), ('bootstrap-deployment-key-public', BOOT / 'deployment_ssh_key.pub', 4096)]
ENVELOPES = {'credentials.ccre': 2 * 1024 ** 2, 'database.ccre': MAX_DUMP + 8192, 'legacy.ccre': 158552226 + 8192}

def fail(code):
    raise ValueError(code)

def no_links(p):
    for item in [p, *p.parents]:
        if item.is_symlink():
            fail('SYMLINK_REJECTED')

def check(p, d=False, source=False):
    no_links(p)
    s = os.lstat(p)
    if not (stat.S_ISDIR(s.st_mode) if d else stat.S_ISREG(s.st_mode)) or (not d and s.st_nlink != 1):
        fail('TYPE_OR_LINK_REJECTED')
    if not source and (s.st_uid != 0 or stat.S_IMODE(s.st_mode) != (448 if d else 384)):
        fail('PRIVATE_MODE_REJECTED')
    if source and (s.st_uid not in (0, 1000) or s.st_mode & 23):
        fail('SOURCE_PERMISSIONS_REJECTED')
    return s

def mkdir(p):
    no_links(p)
    try:
        os.mkdir(p, 448)
    except FileExistsError:
        pass
    check(p, True)

def read(p, cap, source=False):
    before = check(p, source=source)
    if before.st_size < 1 or before.st_size > cap:
        fail('SOURCE_SIZE_REJECTED')
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as f:
        opened = os.fstat(f.fileno())
        if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            fail('SOURCE_CHANGED')
        raw = f.read(cap + 1)
        after = os.fstat(f.fileno())
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) or len(raw) != before.st_size:
        fail('SOURCE_CHANGED')
    return raw

def sha_file(p):
    check(p)
    h = hashlib.sha256()
    with os.fdopen(os.open(p, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def put(p, raw):
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 384)
    with os.fdopen(fd, 'wb') as f:
        f.write(raw)
        f.flush()
        os.fsync(f.fileno())
    check(p)

def sync(p):
    fd = os.open(p, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def owner(target, run, nonce):
    check(ROOT, True)
    check(target, True)
    record = json.loads(read(target / '.OWNER.json', 4096))
    if record != {'schema': 'cloud-recovery-owner/v1', 'run': run, 'nonce': nonce}:
        fail('RUN_OWNER_MISMATCH')

def source_snapshot(run):
    entries = []
    check(BOOT, True)
    for name, p, cap in FILES:
        raw = read(p, cap, source=name.startswith('server-'))
        entries.append({'name': name, 'source': str(p), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'dataBase64': base64.b64encode(raw).decode()})
    return {'schema': 'cloud-recovery-source-snapshot/v1', 'run': run, 'files': entries}

def receipt_check(target, receipt, run, nonce):
    if set(receipt) != {'schema', 'run', 'nonce', 'createdAtUtc', 'remoteRoot', 'envelopes', 'plaintextCredentialsPublished', 'productionDatabaseRestored', 'legacyEncrypted', 'legacyArtifactUploaded'} or receipt['schema'] != 'cloud-recovery-safe-receipt/v1' or receipt['run'] != run or (receipt['nonce'] != nonce) or (receipt['remoteRoot'] != str(target)) or (receipt['plaintextCredentialsPublished'] is not False) or (receipt['productionDatabaseRestored'] is not False) or (receipt['legacyEncrypted'] is not True) or (receipt['legacyArtifactUploaded'] is not False):
        fail('SAFE_RECEIPT_REJECTED')
    if not isinstance(receipt['createdAtUtc'], str) or not re.fullmatch('\\d{4}-\\d{2}-\\d{2}T[0-9:.]+Z', receipt['createdAtUtc']):
        fail('RECEIPT_DATE_REJECTED')
    entries = receipt['envelopes']
    if not isinstance(entries, list) or len(entries) != 3:
        fail('ENVELOPE_COUNT_REJECTED')
    for name, item in zip(ENVELOPES, entries):
        if set(item) != {'file', 'bytes', 'sha256', 'kind'} or item['file'] != name or item['kind'] != name.split('.')[0] or (not isinstance(item['bytes'], int)) or isinstance(item['bytes'], bool) or (not 0 < item['bytes'] <= ENVELOPES[name]) or (not re.fullmatch('[a-f0-9]{64}', item['sha256'])):
            fail('ENVELOPE_RECORD_REJECTED')
        s = check(target / name)
        if s.st_size != item['bytes'] or sha_file(target / name) != item['sha256']:
            fail('PERSISTED_CIPHER_HASH_MISMATCH')
    return receipt

def main():
    if os.geteuid() != 0:
        fail('ROOT_REQUIRED')
    os.umask(63)
    mode, run, nonce, *args = sys.argv[1:]
    if not re.fullmatch('[1-9][0-9]{0,19}-[1-9][0-9]{0,5}', run) or not re.fullmatch('[a-f0-9]{32}', nonce):
        fail('RUN_REJECTED')
    if mode not in ('prepare', 'snapshot', 'database', 'legacy', 'legacy-seal', 'legacy-cipher', 'store', 'cleanup', 'finalize', 'inspect'):
        fail('MODE_REJECTED')
    target = ROOT / run
    plain = target / '.plaintext'
    dump = plain / 'database.dump'
    snapshot = plain / 'source-snapshot.json'
    if mode == 'prepare':
        release_lock = Path('/run/study-plan-release/lock')
        no_links(release_lock)
        lock_info = os.lstat(release_lock)
        if not stat.S_ISREG(lock_info.st_mode) or lock_info.st_uid != 0:
            fail('RELEASE_LOCK_REJECTED')
        lock_fd = os.open(release_lock, os.O_RDONLY | os.O_NOFOLLOW)
        fcntl.flock(lock_fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
        frozen_snapshot = source_snapshot(run)
        if check(LEGACY).st_size != 158552226 or sha_file(LEGACY) != LEGACY_PIN:
            fail('LEGACY_SOURCE_PIN_MISMATCH')
        mkdir(ROOT)
        if target.exists() or target.is_symlink():
            fail('NEW_RUN_ALREADY_EXISTS')
        if shutil.disk_usage(ROOT).free < RESERVE + 2 * MAX_DUMP + 1024 ** 2:
            fail('RESERVE_INSUFFICIENT')
        mkdir(target)
        put(target / '.OWNER.json', json.dumps({'schema': 'cloud-recovery-owner/v1', 'run': run, 'nonce': nonce}).encode())
        mkdir(plain)
        put(snapshot, json.dumps(frozen_snapshot).encode())
        service = subprocess.run(['systemctl', 'show', 'study-plan', '-p', 'MainPID', '--value'], capture_output=True, text=True, timeout=10)
        if service.returncode or not service.stdout.strip().isdigit() or int(service.stdout.strip()) <= 1:
            fail('SERVICE_PID_UNAVAILABLE')
        pid = int(service.stdout.strip())
        if Path(os.readlink('/proc/' + str(pid) + '/cwd')).resolve() != APP:
            fail('SERVICE_DIRECTORY_MISMATCH')
        allowed = {'DATABASE_URL', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE', 'PGSSLROOTCERT', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE'}
        environment = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'HOME': '/root', 'NODE_ENV': 'production', 'PGCONNECT_TIMEOUT': '15'}
        raw_environment = Path('/proc/' + str(pid) + '/environ').read_bytes()
        for item in raw_environment.split(b'\x00'):
            if b'=' in item:
                key, value = item.split(b'=', 1)
                key = key.decode('ascii', 'ignore')
                if key in allowed:
                    environment[key] = value.decode('utf-8')

        def limits():
            os.umask(63)
            resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_DUMP, MAX_DUMP))
        backed = subprocess.run(['node', 'scripts/backup-postgres.mjs', '--output', str(dump)], cwd=APP, env=environment, capture_output=True, timeout=900, preexec_fn=limits)
        if backed.returncode != 0:
            fail('APPLICATION_DATABASE_BACKUP_FAILED')
        info = check(dump)
        if not 0 < info.st_size <= MAX_DUMP:
            fail('DUMP_SIZE_REJECTED')
        with os.fdopen(os.open(dump, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as f:
            if f.read(5) != b'PGDMP':
                fail('CUSTOM_DUMP_REQUIRED')
        sync(plain)
        sync(target)
        sync(ROOT)
        os.close(lock_fd)
        print(json.dumps({'status': 'prepared', 'run': run, 'customDump': True}))
        return
    owner(target, run, nonce)
    if mode == 'snapshot':
        check(plain, True)
        sys.stdout.buffer.write(read(snapshot, 1024 * 1024))
    elif mode == 'database':
        check(plain, True)
        check(dump)
        with os.fdopen(os.open(dump, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as source:
            shutil.copyfileobj(source, sys.stdout.buffer, 1024 * 1024)
    elif mode == 'legacy':
        if check(LEGACY).st_size != 158552226 or sha_file(LEGACY) != LEGACY_PIN:
            fail('LEGACY_SOURCE_PIN_MISMATCH')
        with os.fdopen(os.open(LEGACY, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as source:
            shutil.copyfileobj(source, sys.stdout.buffer, 1024 * 1024)
    elif mode == 'legacy-seal':
        if len(args) != 1 or len(args[0]) > 174764:
            fail('LEGACY_SEAL_SOURCE_REJECTED')
        node_source = base64.b64decode(args[0], validate=True)
        if not 0 < len(node_source) <= 128 * 1024:
            fail('LEGACY_SEAL_SOURCE_REJECTED')
        descriptor = sys.stdin.buffer.read(8193)
        if not 0 < len(descriptor) <= 8192:
            fail('LEGACY_SEAL_DESCRIPTOR_REJECTED')
        request = json.loads(descriptor)
        if set(request) != {'schema', 'run', 'ownerNonce', 'headerBase64', 'keyBase64'} or request['schema'] != 'cloud-recovery-legacy-seal-request/v1' or request['run'] != run or (request['ownerNonce'] != nonce):
            fail('LEGACY_SEAL_OWNER_REJECTED')
        sealed = subprocess.run(['node', '--input-type=module', '-e', node_source.decode('utf-8'), 'server'], input=descriptor, capture_output=True, timeout=300, cwd=target, env={'PATH': os.environ.get('PATH', '/usr/bin:/bin')})
        if sealed.returncode != 0 or len(sealed.stdout) > 8192:
            fail('LEGACY_SEAL_FAILED')
        result = json.loads(sealed.stdout)
        if set(result) != {'status', 'kind', 'run', 'file', 'bytes', 'sha256'} or result['status'] != 'sealed' or result['kind'] != 'legacy' or (result['run'] != run) or (result['file'] != 'legacy.ccre') or (not isinstance(result['bytes'], int)) or isinstance(result['bytes'], bool) or (not 158552226 < result['bytes'] <= ENVELOPES['legacy.ccre']) or (not re.fullmatch('[a-f0-9]{64}', result['sha256'])):
            fail('LEGACY_SEAL_RESULT_REJECTED')
        if result['bytes'] != 158552226 + 12 + len(base64.b64decode(request['headerBase64'], validate=True)) + 16:
            fail('LEGACY_SEAL_EXACT_SIZE_MISMATCH')
        if check(target / 'legacy.ccre').st_size != result['bytes'] or sha_file(target / 'legacy.ccre') != result['sha256']:
            fail('LEGACY_SEAL_PERSISTENCE_MISMATCH')
        print(json.dumps(result))
    elif mode == 'legacy-cipher':
        check(target / 'legacy.ccre')
        with os.fdopen(os.open(target / 'legacy.ccre', os.O_RDONLY | os.O_NOFOLLOW), 'rb') as source:
            shutil.copyfileobj(source, sys.stdout.buffer, 1024 * 1024)
    elif mode == 'store':
        name, size, pin = args
        if name not in ENVELOPES or not size.isdigit() or (not 0 < int(size) <= ENVELOPES[name]) or (not re.fullmatch('[a-f0-9]{64}', pin)):
            fail('CIPHER_UPLOAD_REJECTED')
        if shutil.disk_usage(target).free < int(size) + RESERVE:
            fail('RESERVE_INSUFFICIENT')
        remaining = int(size)
        h = hashlib.sha256()
        fd = os.open(target / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 384)
        with os.fdopen(fd, 'wb') as outgoing:
            while remaining:
                block = sys.stdin.buffer.read(min(1024 * 1024, remaining))
                if not block:
                    fail('TRUNCATED_CIPHER_UPLOAD')
                remaining -= len(block)
                h.update(block)
                outgoing.write(block)
            outgoing.flush()
            os.fsync(outgoing.fileno())
        if sys.stdin.buffer.read(1) or h.hexdigest() != pin or sha_file(target / name) != pin:
            fail('CIPHER_TRANSFER_HASH_MISMATCH')
        sync(target)
        print(json.dumps({'status': 'stored', 'file': name}))
    elif mode == 'cleanup':
        if plain.exists() or plain.is_symlink():
            check(plain, True)
            if any((p.name not in ('database.dump', 'source-snapshot.json') for p in plain.iterdir())):
                fail('UNEXPECTED_TEMPORARY_ITEM')
            for filename in (dump, snapshot):
                if filename.exists() or filename.is_symlink():
                    check(filename)
                    os.unlink(filename)
            os.rmdir(plain)
            sync(target)
        print(json.dumps({'status': 'plaintext-cleared', 'run': run}))
    elif mode == 'finalize':
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536:
            fail('RECEIPT_TOO_LARGE')
        if plain.exists() or plain.is_symlink():
            fail('PLAINTEXT_NOT_CLEARED')
        receipt = receipt_check(target, json.loads(raw), run, nonce)
        put(target / 'SAFE-RECEIPT.json', json.dumps(receipt, indent=2).encode())
        sync(target)
        print(json.dumps({'status': 'persisted', 'run': run, 'envelopes': 3, 'legacyEncrypted': True}))
    elif mode == 'inspect':
        receipt = receipt_check(target, json.loads(read(target / 'SAFE-RECEIPT.json', 65536)), run, nonce)
        if plain.exists() or plain.is_symlink():
            fail('PLAINTEXT_STILL_PRESENT')
        print(json.dumps({'status': 'verified-persistent-cipher-copies', 'run': run, 'envelopes': receipt['envelopes'], 'productionDatabaseRestored': False}))
if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'status': 'failed', 'stage': 'fixed-remote-recovery'}), file=sys.stderr)
        sys.exit(1)
