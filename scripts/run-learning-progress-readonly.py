"""Read-only SSH stdin transport; business aggregation is reviewed separately."""
import base64
import fcntl
import json
import math
import os
import selectors
import stat
import subprocess
import sys
import time

APP = '/www/study-plan'
MAX_SCRIPT_BYTES = 1024 * 1024
MAX_REPORT_BYTES = 256 * 1024
MAX_STDERR_BYTES = 16 * 1024


def require(value):
    if not value:
        raise ValueError('Read-only progress transport blocked')


def open_dir(path):
    require(path.startswith('/'))
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in path.split('/')[1:]:
            require(part not in ('', '.', '..'))
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd); fd = child
        return fd
    except BaseException:
        os.close(fd); raise


def identity(info):
    return info.st_dev, info.st_ino, info.st_uid, info.st_gid, info.st_mode


def aggregate_shape(value, depth=0):
    """Bound the reviewed encrypted JSON envelope; never publish plaintext."""
    require(depth <= 12)
    if isinstance(value, dict):
        require(len(value) <= 512)
        for key, item in value.items():
            require(isinstance(key, str) and 0 < len(key) <= 80)
            aggregate_shape(item, depth + 1)
    elif isinstance(value, list):
        require(len(value) <= 4096)
        for item in value:
            aggregate_shape(item, depth + 1)
    elif isinstance(value, str):
        require(len(value) <= 256 and '\0' not in value)
    elif type(value) is float:
        require(math.isfinite(value))
    else:
        require(value is None or type(value) in (int, bool))


def validate_envelope(value):
    """Only the exact ciphertext envelope may be emitted to public CI logs."""
    require(isinstance(value, dict) and set(value) == {
        'status', 'version', 'algorithm', 'iv', 'tag', 'wrappedKey', 'ciphertext'})
    require(value['status'] == 'encrypted-readonly-learning-progress'
        and type(value['version']) is int and value['version'] == 1
        and value['algorithm'] == 'RSA-OAEP-SHA256+A256GCM')
    aggregate_shape(value)
    def decoded(encoded):
        require(isinstance(encoded, str))
        raw = base64.b64decode(encoded, validate=True)
        require(base64.b64encode(raw).decode('ascii') == encoded)
        return raw
    require(len(decoded(value['iv'])) == 12 and len(decoded(value['tag'])) == 16)
    def chunks(label):
        parts = value[label]
        require(isinstance(parts, list) and 0 < len(parts) <= 4096
            and all(isinstance(item, str) and 0 < len(item) <= 240 for item in parts)
            and all(len(item) == 240 for item in parts[:-1]))
        return decoded(''.join(parts))
    require(256 <= len(chunks('wrappedKey')) <= 1024)
    require(0 < len(chunks('ciphertext')) <= MAX_REPORT_BYTES)


def run_bounded(command, script, environment, cwd, timeout=180):
    """Read both channels under hard byte/time caps; discard private stderr."""
    child = subprocess.Popen(command, cwd=cwd, stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=environment)
    selector = selectors.DefaultSelector()
    output = bytearray()
    counts = {'stdout': 0, 'stderr': 0}
    position = 0
    deadline = time.monotonic() + timeout
    try:
        for stream, label, mode in ((child.stdin, 'stdin', selectors.EVENT_WRITE),
                (child.stdout, 'stdout', selectors.EVENT_READ),
                (child.stderr, 'stderr', selectors.EVENT_READ)):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, mode, label)
        while selector.get_map():
            remaining = deadline - time.monotonic()
            require(remaining > 0)
            for key, _events in selector.select(min(remaining, 1)):
                if key.data == 'stdin':
                    try:
                        position += os.write(key.fd, script[position:position + 65536])
                    except BlockingIOError:
                        continue
                    if position == len(script):
                        selector.unregister(key.fileobj); key.fileobj.close()
                    continue
                try:
                    chunk = os.read(key.fd, 65536)
                except BlockingIOError:
                    continue
                if not chunk:
                    selector.unregister(key.fileobj); key.fileobj.close()
                    continue
                counts[key.data] += len(chunk)
                require(counts[key.data] <= (MAX_REPORT_BYTES if key.data == 'stdout' else MAX_STDERR_BYTES))
                if key.data == 'stdout':
                    output.extend(chunk)
        require(child.wait(timeout=max(0.001, deadline - time.monotonic())) == 0)
        return bytes(output)
    finally:
        selector.close()
        if child.poll() is None:
            child.kill()
        child.wait(timeout=5)
        for stream in (child.stdin, child.stdout, child.stderr):
            stream.close()


def main():
    require(os.geteuid() == 0 and not sys.argv[1:])
    script = sys.stdin.buffer.read(MAX_SCRIPT_BYTES + 1)
    require(0 < len(script) <= MAX_SCRIPT_BYTES and b'\0' not in script)
    script.decode('utf8')
    handles = []
    try:
        lockdir = open_dir('/run/study-plan-release'); handles.append(lockdir)
        info = os.fstat(lockdir)
        require(info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o700)
        # Open the existing lock for reading only: never create or rewrite it.
        lock = os.open('lock', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=lockdir); handles.append(lock)
        info = os.fstat(lock)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600)
        fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
        app = open_dir(APP); handles.append(app)
        expected = identity(os.fstat(app))
        require(stat.S_IMODE(os.fstat(app).st_mode) & 0o022 == 0)
        environment = os.environ.copy()
        environment.update(NODE_ENV='production', ALLOW_LOCAL_DATA_FALLBACK='false',
            NODE_OPTIONS='--max-old-space-size=768',
            PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=1000')
        # Only the successful encrypted envelope can reach public workflow logs.
        stdout = run_bounded(['/usr/bin/node', '--input-type=module', '-'], script, environment, APP)
        require(0 < len(stdout) <= MAX_REPORT_BYTES)
        require(identity(os.stat(APP, follow_symlinks=False)) == expected and identity(os.fstat(app)) == expected)
        report = json.loads(stdout)
        validate_envelope(report)
        raw = json.dumps(report, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf8')
        require(len(raw) <= MAX_REPORT_BYTES)
        # A-P encodes each hex nibble without digits, avoiding GitHub's port mask.
        encoded = raw.hex().translate(str.maketrans('0123456789abcdef', 'ABCDEFGHIJKLMNOP'))
        print('LEARNING_PROGRESS_AP_BEGIN', flush=True)
        for offset in range(0, len(encoded), 16384):
            print('LEARNING_PROGRESS_AP ' + encoded[offset:offset + 16384], flush=True)
        print('LEARNING_PROGRESS_AP_END', flush=True)
    finally:
        for fd in reversed(handles):
            os.close(fd)


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        print('Read-only progress query stopped safely; no private diagnostics exported.', flush=True)
        sys.exit(1)
