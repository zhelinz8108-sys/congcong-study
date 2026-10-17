"""Local synthetic files only; no SSH or real project files are changed."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
helper_path = HERE / 'seed-release-upload.py'
if not helper_path.exists():
    helper_path = HERE / 'scripts/seed-release-upload.py'
spec = importlib.util.spec_from_file_location('seed_release', helper_path)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
root = Path(tempfile.mkdtemp(prefix='fixture-', dir=HERE))
results = []
links = []


def write(base, name, text):
    target = base / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')


def git(*args):
    subprocess.run(['git', '-c', 'safe.directory=' + str(repo), '-c', 'core.autocrlf=false',
                    '-c', 'user.name=Synthetic fixture', '-c', 'user.email=fixture@example.invalid', *args],
                   cwd=repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def expect_reject(name, fn):
    try:
        fn()
    except (ValueError, FileExistsError):
        results.append(name)
    else:
        raise AssertionError(name + ': unexpectedly accepted')


def empty(name):
    dest = root / name
    dest.mkdir()
    return dest


def make_link(target, link):
    if os.name == 'nt':
        subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(target)],
                       check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    else:
        link.symlink_to(target, target_is_directory=True)
    links.append(link)


def remove_readonly(function, filename, error):
    os.chmod(filename, stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)
    function(filename)


try:
    repo = empty('repo')
    checkout = repo / 'study-plan'
    checkout.mkdir()
    expected = {'keep.txt': 'same', 'changed.txt': 'new version', 'brand-new.txt': 'new file',
                '资料/题目 one.txt': '同一份题目'}
    excluded = ['.env.local', 'nested/.env.fixture', '.data/db', 'node_modules/pkg/a', '.next/cache/a',
                '.next-old/a', 'debug.log', 'public/listening/a.mp3', 'public/uploads/a.txt',
                'content/english-six/a.json', 'content/toefl-listening/a.json']
    for name, text in expected.items():
        write(checkout, name, text)
    for name in excluded:
        write(checkout, name, 'synthetic excluded bytes')
    git('init', '-q')
    git('add', '-f', '--', 'study-plan')
    git('commit', '-qm', 'Synthetic fixture')
    write(checkout, 'untracked.txt', 'not in Git')
    raw = helper.make_manifest(repo)
    names = helper.decode_manifest(raw)
    assert set(names) == set(expected)
    results.append('HEAD-regular-whitelist-excludes-runtime-and-untracked')
    old = empty('active')
    for name, text in expected.items():
        if name != 'brand-new.txt':
            write(old, name, 'old version' if name == 'changed.txt' else text)
    for name in [*excluded, 'deleted-from-new-commit.txt', 'private/answer.json', 'untracked.txt']:
        write(old, name, 'synthetic server-only bytes')
    stage = empty('stage')
    report = helper.seed(old, stage, raw)
    assert report['copiedFiles'] == 3 and report['missingFilesForRunner'] == 1
    assert {p.relative_to(stage).as_posix() for p in stage.rglob('*') if p.is_file()} == set(expected) - {'brand-new.txt'}
    results.append('missing-left-for-runner-and-server-private-deleted-paths-absent')
    (stage / 'keep.txt').write_text('changed in stage', encoding='utf-8')
    assert (old / 'keep.txt').read_text(encoding='utf-8') == 'same'
    (stage / 'keep.txt').write_text('same', encoding='utf-8')
    results.append('copies-use-independent-inodes-not-hardlinks')
    # Model the existing rsync --checksum decision with SHA256, not mtimes.
    delta = [name for name in names if not (stage / name).exists() or
             hashlib.sha256((stage / name).read_bytes()).digest() != hashlib.sha256((checkout / name).read_bytes()).digest()]
    assert set(delta) == {'changed.txt', 'brand-new.txt'}
    for name in delta:
        (stage / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(checkout / name, stage / name)
    assert {p.relative_to(stage).as_posix() for p in stage.rglob('*') if p.is_file()} == set(expected)
    assert all((stage / name).read_bytes() == (checkout / name).read_bytes() for name in names)
    results.append('checksum-model-updates-only-changed-new-files-with-exact-final-content')
    expect_reject('nonempty-stage-rejected', lambda: helper.seed(old, stage, raw))
    for index, invalid in enumerate([b'../outside\0', b'/absolute\0', b'a//b\0', b'a/./b\0', b'a\\b\0',
                                      b'C:/bad\0', b'a\0a\0', b'a', b'.env.local\0', b'public/listening/a\0']):
        expect_reject('invalid-manifest-' + str(index), lambda invalid=invalid: helper.seed(old, empty('bad-' + str(index)), invalid))
    source_directory = empty('source-directory')
    (source_directory / 'directory.txt').mkdir()
    expect_reject('directory-source-rejected', lambda: helper.seed(source_directory, empty('directory-stage'), b'directory.txt\0'))
    real = empty('real')
    write(real, 'secret.txt', 'synthetic private target')
    linked_source = empty('linked-source')
    make_link(real, linked_source / 'linked')
    link_stage = empty('link-stage')
    expect_reject('symlink-or-junction-parent-rejected-before-copy', lambda: helper.seed(linked_source, link_stage, b'linked/secret.txt\0'))
    assert not list(link_stage.iterdir())
    make_link(real, root / 'linked-stage')
    expect_reject('symlink-or-junction-stage-rejected', lambda: helper.seed(old, root / 'linked-stage', raw))
    assert (real / 'secret.txt').read_text(encoding='utf-8') == 'synthetic private target'
    assert (old / 'changed.txt').read_text(encoding='utf-8') == 'old version'
    print(json.dumps({'status': 'passed', 'tests': len(results), 'checks': results, 'copiedFiles': report['copiedFiles'],
                      'missingFiles': report['missingFilesForRunner'], 'checksumModelTransfers': len(delta),
                      'realRsyncExecuted': False, 'networkConnections': 0, 'productionWrites': 0}, ensure_ascii=False))
finally:
    for link in links:
        if link.exists() or helper.linked(link):
            link.rmdir() if os.name == 'nt' else link.unlink()
    assert root.parent == HERE and not helper.linked(root)
    shutil.rmtree(root, onerror=remove_readonly)
