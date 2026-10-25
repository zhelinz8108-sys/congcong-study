"""Read-only current storage/build/cache/retention counters. No content export."""
import contextlib
import fcntl
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import sys


def load(filename, name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value


if 'BASE' not in globals():
    BASE = load('probe-english-six-deployment.py', 'reader_capacity_base')
if 'CACHE' not in globals():
    CACHE = load('probe-retained-compile-cache.py', 'reader_capacity_cache')

EXPECTED = '6b7d383b45b8d2bb72df4dca9b6325e8ec55acc3'
PRESERVED = {EXPECTED, 'ddddbe938feffb520bf3673edae51ba75872791e', 'e00733cfa66583481e42f2acac0b4756c29e4383',
             'f262dc6438e48d3992f1abe2d0e291ff3108b222',
             '4d65d765912e1f9baf4553c7df5bebe9b16274eb',
             'bdc35f288531062f5abb029cd263bbd9b51d65b0'}


def decode(value, key=None):
    if isinstance(value, dict): return {name: decode(item, name) for name, item in value.items()}
    if isinstance(value, list): return [decode(item) for item in value]
    if isinstance(value, str) and key in ('commit', 'buildId'): return value.replace(' ', '')
    if isinstance(value, str) and __import__('re').fullmatch(r'[0-9](?: [0-9])*', value): return int(value.replace(' ', ''))
    return value


def main():
    BASE.require(os.geteuid() == 0)
    handles = []
    try:
        releases = BASE.open_dir(BASE.RELEASES); handles.append(releases)
        lockdir = BASE.open_dir('/run/study-plan-release'); handles.append(lockdir)
        BASE.require(os.fstat(lockdir).st_uid == 0 and stat.S_IMODE(os.fstat(lockdir).st_mode) == 0o700)
        lock = os.open('lock', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=lockdir); handles.append(lock)
        info = os.fstat(lock)
        BASE.require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600)
        fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
        BASE.EXPECTED = EXPECTED
        output = io.StringIO()
        with contextlib.redirect_stdout(output): BASE.probe()
        line = output.getvalue().strip()
        BASE.require(line.startswith('ENGLISH_DEPLOYMENT_CAPACITY '))
        report = decode(json.loads(line.removeprefix('ENGLISH_DEPLOYMENT_CAPACITY ')))
        active = report['active']
        BASE.require(active['commit'] == EXPECTED and active['buildMatchesMetadata'])
        rows = {(item['metadata']['commit'], item['metadata']['buildId']): item for item in report['retained']}
        cache_rows, targets = [], []
        for name in sorted(os.listdir(releases)):
            entry = os.stat(name, dir_fd=releases, follow_symlinks=False)
            if not stat.S_ISDIR(entry.st_mode): continue
            source = BASE.child_dir(releases, name)
            try:
                meta = BASE.metadata(source)
                if not meta: continue
                key = meta['commit'], meta['buildId']
                BASE.require(key in rows)
                rows[key]['onRootFilesystem'] = os.fstat(source).st_dev == os.fstat(releases).st_dev
                rows[key]['preservedBySession'] = meta['commit'] in PRESERVED
                if meta['commit'] in PRESERVED or not rows[key]['onRootFilesystem']: continue
                CACHE.no_submounts(source)
                next_fd = BASE.child_dir(source, '.next')
                try:
                    try: parent = BASE.child_dir(next_fd, 'cache')
                    except FileNotFoundError: continue
                    try:
                        for label in ('webpack', 'swc'):
                            try: selected = BASE.child_dir(parent, label)
                            except FileNotFoundError: continue
                            try:
                                cache_rows.append(CACHE.describe(selected, 'inactive-' + label, os.fstat(releases).st_dev, meta))
                                targets.append(os.readlink('/proc/self/fd/' + str(source)))
                            finally: os.close(selected)
                    finally: os.close(parent)
                finally: os.close(next_fd)
            finally: os.close(source)
        usage = CACHE.references(targets)
        for item, used in zip(cache_rows, usage['references']): item['noRuntimeReferences'] = not used
        archives = []
        root = BASE.open_dir('/www/study-plan-retained-compressed'); handles.append(root)
        BASE.require(os.fstat(root).st_uid == 0 and stat.S_IMODE(os.fstat(root).st_mode) == 0o700)
        CACHE.no_submounts(root)
        for name in sorted(os.listdir(root)):
            if name == 'compile-quarantine': continue
            folder = BASE.child_dir(root, name)
            try:
                BASE.require(os.fstat(folder).st_uid == 0 and stat.S_IMODE(os.fstat(folder).st_mode) == 0o700)
                receipt = json.loads(BASE.small(folder, 'receipt.json'))
                meta = receipt['sourceMetadata']
                BASE.require(isinstance(meta, dict) and set(meta) == {'commit', 'buildId'}
                             and isinstance(meta['commit'], str) and __import__('re').fullmatch(r'[0-9a-f]{40}', meta['commit'])
                             and isinstance(meta['buildId'], str) and __import__('re').fullmatch(r'[A-Za-z0-9_-]{1,128}', meta['buildId']))
                BASE.require(receipt['status'] == 'verified-compressed-retention-complete' and type(receipt['archiveBytes']) is int and receipt['archiveBytes'] > 0)
                archive_info = os.stat('archive.tar.gz', dir_fd=folder, follow_symlinks=False)
                BASE.require(stat.S_ISREG(archive_info.st_mode) and archive_info.st_uid == 0 and archive_info.st_nlink == 1
                             and stat.S_IMODE(archive_info.st_mode) == 0o600 and archive_info.st_size == receipt['archiveBytes'])
                archives.append({'metadata': meta, 'receiptStatus': receipt['status'], 'archiveBytes': archive_info.st_size,
                                 'onRootFilesystem': archive_info.st_dev == os.fstat(releases).st_dev,
                                 'hasPrivatePending': 'original.pending' in os.listdir(folder)})
            finally: os.close(folder)
        report.update(schema='english-knowledge-audio-read-only-v1', inactiveCaches=cache_rows,
                      processScanStable=usage['stableScan'], retainedCompressed=archives)
        print('ENGLISH_KNOWLEDGE_AUDIO_CAPACITY ' + json.dumps(BASE.safe_log(report), separators=(',', ':')), flush=True)
    finally:
        for fd in reversed(handles): os.close(fd)


if __name__ == '__main__':
    try:
        BASE.require(not sys.argv[1:]); main()
    except Exception:
        print('Read-only audio capacity probe blocked; no production files changed.', flush=True)
        sys.exit(1)
