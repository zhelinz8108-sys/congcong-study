#!/usr/bin/env python3
"""Read only one of two fixed, hash-pinned private material files to stdout.
Use via `ssh ... sudo -n python3 - FIXED_NAME < read-cloud-native.py`.
No server paths, command bodies or credentials are accepted from workflow inputs.
"""
import hashlib
import os
from pathlib import Path
import stat
import sys

ROOT = Path('/www/study-plan-data/private-cloud-handoff/2026-10-17/materials-3b2d7ca9-66e3-4677-9234-232292bd76ed')
ALLOWED = {
    'native-authoring-min.tar.gz': (405441, '88e005c10482f2178dbc998ae47328b1ea0c6fd08f822208af23d7756924ebaf'),
    'native-authoring-min.selection.json': (35998, '0c8ece619c49ca68ca31da5271eab62a8c9c4cff36ed5318e0ddedb5163c0fcd'),
}

def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ALLOWED:
        raise ValueError('Only the fixed native pack and selection are readable')
    if os.name != 'posix' or os.geteuid() != 0:
        raise ValueError('Root read access is required; do not weaken permissions')
    for directory in [ROOT, *ROOT.parents]:
        value = os.lstat(directory)
        if not stat.S_ISDIR(value.st_mode):
            raise ValueError('Symlink or non-directory component rejected')
    if os.stat(ROOT).st_uid != 0 or stat.S_IMODE(os.stat(ROOT).st_mode) != 0o700:
        raise ValueError('Private root must be root-owned mode 700')
    size, expected = ALLOWED[sys.argv[1]]
    filename = ROOT / sys.argv[1]
    fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_uid != 0 or before.st_nlink != 1 or stat.S_IMODE(before.st_mode) != 0o600 or before.st_size != size:
            raise ValueError('Private input type/owner/mode/link/size mismatch')
        chunks, count, digest = [], 0, hashlib.sha256()
        while True:
            chunk = os.read(fd, min(65536, size + 1 - count))
            if not chunk:
                break
            chunks.append(chunk); count += len(chunk); digest.update(chunk)
            if count > size:
                raise ValueError('Input grew during read')
        after = os.fstat(fd)
        fields = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns', 'st_uid', 'st_nlink', 'st_mode')
        if any(getattr(before, field) != getattr(after, field) for field in fields) or count != size or digest.hexdigest() != expected:
            raise ValueError('Input changed or full SHA256 verification failed')
    finally:
        os.close(fd)
    # Write nothing until the whole input has passed verification.
    sys.stdout.buffer.write(b''.join(chunks))
    sys.stdout.buffer.flush()

if __name__ == '__main__':
    main()
