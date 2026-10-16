"""Reconcile generated corpus metadata, remove empty embedded media and preserve underlines."""
import collections
import json
import re
import runpy
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

m = runpy.run_path(str(Path(__file__).with_name('import-english-six.py')))
OUT, ROOT, AUDIT, W = m['OUT'], m['ROOT'], m['AUDIT'], m['W']
index = json.loads((OUT / 'index.json').read_text(encoding='utf-8'))
assets = m['Assets']()
records = {r['id']: r for r in json.loads((AUDIT / 'inventory.json').read_text(encoding='utf-8'))['documents']}

def stage(resource):
    title = resource['title']
    rel = resource['paths'][0]
    if re.search(r'答案|解析|教师版|教师用', title):
        return 'reference'
    if resource['extension'] in {'.mp3', '.wav', '.wma', '.mp4', '.wmv', '.swf'}:
        return 'listen'
    if re.search(r'教案|教学设计|课件|备课', rel) or resource['extension'] == '.pptx':
        return 'teacher'
    if re.search(r'试卷|测评卷|测试卷|检测卷|拔尖测评|期中|期末', title):
        return 'test'
    if re.search(r'精讲|知识|学历案|讲义|手写笔记|译林笔记', title) or '新6A手写笔记' in rel:
        return 'explain'
    if re.search(r'课文|单词音频|电子课本|教科书|朗读|听读|背记|晨读', title) or re.search(r'课文音频|单词音频', rel):
        return 'listen'
    if re.search(r'拔尖|实验班|提优|读写攻略', rel):
        return 'advanced'
    return m['stage_for'](title, resource['extension'])

for resource in index['resources']:
    resource['stage'] = stage(resource)
    file = OUT / 'resources' / (resource['id'] + '.json')
    private = json.loads(file.read_text(encoding='utf-8'))
    removed = 0
    for page in private['pages']:
        good = [b for b in page['blocks'] if 'asset' not in b or b['asset'] in assets.items]
        removed += len(page['blocks']) - len(good)
        page['blocks'] = good
    if resource['extension'] == '.docx' and private['pages']:
        blocks = [b for page in private['pages'] for b in page['blocks']]
        pages, current, title = [], [], '正文'
        for block in blocks:
            text = block.get('text', '').strip()
            heading = (len(text) < 160 and re.search(r'(?:^Unit\s*[1-8]|^U[1-8]|^26秋新译林版六上.*练习Unit\s*[1-8]|^第[一二三四五六七八]单元)', text, re.I))
            if current and (heading or len(current) >= 60):
                pages.append({'title': title, 'blocks': current})
                current = []
            if heading:
                title = text
            current.append(block)
        if current:
            pages.append({'title': title, 'blocks': current})
        private['pages'] = pages
    starts = {}
    for number, page in enumerate(private['pages'], 1):
        # Contents pages list several units; they are not unit starting pages.
        text = '\n'.join(b.get('text', '') for b in page['blocks'] if b.get('kind') == 'text')
        found = m['unit_numbers'](page['title'] + '\n' + text)
        if len(found) == 1 and not re.search(r'Contents|目\s*录', text, re.I):
            starts.setdefault(str(found[0]), number)
    if private['pages'] and len(resource['units']) == 1:
        starts.setdefault(str(resource['units'][0]), 1)
    resource['unitStarts'] = starts
    resource['pageCount'] = len(private['pages'])
    if removed:
        resource['emptyEmbeddedMediaSkipped'] = removed
    private['meta'] = resource
    m['save'](file, private)

def slice_runs(runs, start, end):
    result, position = [], 0
    for run in runs:
        text = run['text']
        left, right = max(0, start-position), min(len(text), end-position)
        if left < right:
            result.append({**run, 'text': text[left:right]})
        position += len(text)
    return result

underline_count = 0
from english_six_quality_review import quality_review
apply_quality_review = quality_review(OUT)
for unit, ident in enumerate(m['PAPERS'], 1):
    paper = m['paper_questions'](ident, unit)
    source = ROOT / records[ident]['path']
    with zipfile.ZipFile(source) as z:
        body = ET.fromstring(z.read('word/document.xml'))
        paragraphs = []
        for p in body.iter(W+'p'):
            runs = []
            for r in p.iter(W+'r'):
                text = ''.join((node.text or '') if node.tag == W+'t' else '\n' if node.tag == W+'br' else ' ' if node.tag == W+'tab' else '' for node in r)
                if text:
                    under = r.find('./'+W+'rPr/'+W+'u')
                    runs.append({'text': text, 'underline': under is not None and under.get(W+'val') != 'none'})
            if runs:
                paragraphs.append((''.join(r['text'] for r in runs), runs))
    for q in paper['questions']:
        prompt = q['prompt']
        matched = next(((text, runs) for text, runs in paragraphs if prompt and prompt in text), None)
        if matched:
            text, runs = matched
            start = text.index(prompt)
            marked = slice_runs(runs, start, start+len(prompt))
            if any(r['underline'] for r in marked):
                q['promptRuns'] = marked
                underline_count += 1
        for option in q['options']:
            literal = option['id'] + '. ' + option['text']
            matched = next(((text, runs) for text, runs in paragraphs if literal in text), None)
            if matched:
                text, runs = matched
                start = text.index(literal) + 3
                marked = slice_runs(runs, start, start + len(option['text']))
                if any(r['underline'] for r in marked):
                    option['runs'] = marked
                    underline_count += 1
    paper['questions'] = [apply_quality_review(question) for question in paper['questions']]
    m['save'](OUT / 'practice' / f'{unit}.json', paper)

index['summary']['statuses'] = dict(collections.Counter(r['status'] for r in index['resources']))
index['summary']['assetBytes'] = sum(a['size'] for a in assets.items.values())
m['save'](OUT / 'index.json', index)
m['save'](OUT / 'assets.private.json', assets.items)
audit_file = OUT / 'audit.private.json'
if audit_file.exists():
    audit = json.loads(audit_file.read_text(encoding='utf-8'))
    audit['summary'] = index['summary']
    m['save'](audit_file, audit)
print('FINAL', index['summary'], 'underlined question/option fields', underline_count)
