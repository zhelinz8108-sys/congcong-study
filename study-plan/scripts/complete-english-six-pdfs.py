"""Fill missing PDF OCR pages and retain visual references for scanned pages."""
import io
import json
import logging
import subprocess
import tempfile
from pathlib import Path
import runpy

from PIL import Image
from pypdf import PdfReader

logging.getLogger('pypdf').setLevel(logging.ERROR)

m = runpy.run_path(str(Path(__file__).with_name('import-english-six.py')))
OUT, ROOT, AUDIT = m['OUT'], m['ROOT'], m['AUDIT']
POPPLER = Path(r'C:\Users\73258\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin')
index = json.loads((OUT / 'index.json').read_text(encoding='utf-8'))
assets = m['Assets']()
jobs = []
images = OUT / 'ocr-work'
images.mkdir(exist_ok=True)

def page_reference(source, ident, number):
    prefix = images / f'{ident}-{number:03d}-reference'
    cached = images / f'{ident}-{number:03d}.png'
    temporary = cached if cached.exists() else prefix.with_suffix('.png')
    if not cached.exists():
        subprocess.run([str(POPPLER / 'pdftoppm.exe'), '-f', str(number), '-l', str(number), '-singlefile',
                        '-scale-to', '2100', '-png', str(source), str(prefix)], check=True, capture_output=True)
    try:
        with Image.open(temporary) as image:
            buffer = io.BytesIO()
            image.convert('RGB').save(buffer, format='WEBP', quality=86)
            return assets.data(buffer.getvalue(), '.webp')
    finally:
        if temporary != cached:
            temporary.resolve().relative_to(OUT.resolve())
            temporary.unlink(missing_ok=True)

def has_scan_background(page):
    # Some scans already contain an invisible OCR layer, so text length alone
    # cannot identify them. Inspect bitmap dimensions without decoding them.
    resources = page.get('/Resources')
    if not resources:
        return False
    objects = resources.get_object().get('/XObject')
    if not objects:
        return False
    bitmaps = [obj.get_object() for obj in objects.get_object().values()
               if obj.get_object().get('/Subtype') == '/Image']
    return len(bitmaps) == 1 and bitmaps[0].get('/Width', 0) >= 1000 and bitmaps[0].get('/Height', 0) >= 1000

for resource in index['resources']:
    if resource['extension'] != '.pdf':
        continue
    ident = resource['id']
    source = ROOT / resource['paths'][0]
    private = json.loads((OUT / 'resources' / (ident + '.json')).read_text(encoding='utf-8'))
    for number in resource.get('missingPages', []):
        output = AUDIT / 'ocr' / f'{ident}-{number:03d}.txt'
        if output.exists():
            continue
        prefix = images / f'{ident}-{number:03d}'
        subprocess.run([str(POPPLER / 'pdftoppm.exe'), '-f', str(number), '-l', str(number), '-singlefile',
                        '-scale-to', '2100', '-png', str(source), str(prefix)], check=True, capture_output=True)
        jobs.append({'id': ident, 'page': number, 'image': str(prefix) + '.png', 'output': str(output)})
    print('RENDERED', ident, len(resource.get('missingPages', [])), flush=True)

job_file = images / 'jobs.json'
m['save'](job_file, jobs)
print('OCR_JOBS', len(jobs), flush=True)
if jobs:
    subprocess.run([r'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass',
                    '-File', str(AUDIT / 'ocr_pages.ps1'), '-Jobs', str(job_file)], check=True)

for resource in index['resources']:
    if resource['extension'] != '.pdf':
        continue
    ident = resource['id']
    source = ROOT / resource['paths'][0]
    private = json.loads((OUT / 'resources' / (ident + '.json')).read_text(encoding='utf-8'))
    for number in resource.get('missingPages', []):
        output = AUDIT / 'ocr' / f'{ident}-{number:03d}.txt'
        if output.exists():
            extracted = private['pages'][number - 1]
            visuals = [b for b in extracted['blocks'] if b.get('kind') != 'text']
            extracted['blocks'] = m['plain_blocks'](output.read_text(encoding='utf-8-sig')) + visuals
    reader = PdfReader(source)
    for number, page in enumerate(reader.pages, 1):
        extracted = private['pages'][number - 1]
        blocks = extracted['blocks']
        has_image = any(b.get('kind') == 'image' for b in blocks)
        if has_image or (extracted.get('visualsComplete') and blocks and not extracted.get('ocr')):
            extracted['visualsComplete'] = True
            continue
        if extracted.get('ocr') or has_scan_background(page):
            aid = page_reference(source, ident, number)
            blocks.append({'kind': 'image', 'asset': aid, 'reference': True})
            extracted['visualsComplete'] = True
            continue
        failed = False
        for key in page.images.keys():
            try:
                img = page.images[key]
                image = img.image
                if image.width < 200 or image.height < 100:
                    continue
                image = image.convert('RGB')
                image.thumbnail((2100, 2100))
                buffer = io.BytesIO()
                image.save(buffer, format='WEBP', quality=86)
                aid = assets.data(buffer.getvalue(), '.webp')
                if not any(b.get('asset') == aid for b in blocks):
                    blocks.append({'kind': 'image', 'asset': aid, 'reference': extracted.get('ocr', False)})
            except Exception as exc:
                failed = True
                print('IMAGE_FALLBACK', ident, number, type(exc).__name__, flush=True)
                break
        if failed or not blocks:
            aid = page_reference(source, ident, number)
            blocks.append({'kind': 'image', 'asset': aid, 'reference': True})
        extracted['visualsComplete'] = True
    empty = [n+1 for n, p in enumerate(private['pages']) if not p['blocks']]
    resource['missingPages'] = empty
    resource['status'] = 'needs-ocr' if empty else 'ready'
    private['meta'] = resource
    m['save'](OUT / 'resources' / (ident + '.json'), private)
    m['save'](OUT / 'assets.private.json', assets.items)
    print('PDF_COMPLETE', ident, 'empty', len(empty), flush=True)

index['summary']['statuses'] = dict(m['collections'].Counter(r['status'] for r in index['resources']))
index['summary']['assetBytes'] = sum(a['size'] for a in assets.items.values())
m['save'](OUT / 'assets.private.json', assets.items)
m['save'](OUT / 'index.json', index)
for image in images.glob('*.png'):
    image.resolve().relative_to(OUT.resolve())
    image.unlink()
print('COMPLETE', index['summary'], flush=True)
