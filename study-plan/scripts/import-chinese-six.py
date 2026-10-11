"""Import the supplied six-upper Chinese PDFs with page-level provenance."""
import argparse
import json
import re
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium

APP = Path(__file__).resolve().parents[1]
SOURCE = APP.parent / '六上' / '语文'
DEST = APP / 'content' / 'chinese-six'
FILES = {
    'lessons': '六年级上册语文每课重点知识课课贴.pdf',
    'sentences': '六年级上册语文重点常考句子13大专项练习 - 附答案.pdf',
    'reading': '六上语文阅读理解考点与答题模板.pdf',
    'writing': '26秋新版六年级上册优秀同步习作范文80篇.pdf',
}
NUMERALS = ['一','二','三','四','五','六','七','八','九','十','十一','十二','十三']
SENTENCE_NAMES = ['修改病句','缩写句子','扩写句子','句式转换','关联词合并句子','修辞手法判断与仿写','说明方法判断','标点符号运用','句子理解与体会','按要求写句子','句子排序','长话短说','补写与续写句子']
WRITING_THEMES = ['变形记','多彩的活动','观察日记','笔尖流出的故事','围绕中心意思写','学写倡议书','插上科学的翅膀飞','传承好家风']
WRITING_TITLES = [
    ['变成一朵小雨云','我是一只老槐树','一只自由的小麻雀','路灯的日夜坚守','我是一粒小小的种子','溪水的旅行','勤劳的小蜜蜂','云朵的奇妙漫游','小露珠的清晨奇遇','书桌上的一盏台灯'],
    ['难忘的拔河比赛','趣味运动会，欢乐满校园','温暖人心的义卖活动','精彩的校园朗诵比赛','其乐融融的班级包饺子活动','热血沸腾的接力赛','意义非凡的植树活动','充满书香的读书分享会','趣味十足的手工制作大赛','欢乐满满的班级团建活动'],
    ['绿豆发芽观察日记','蚕宝宝观察日记','蜗牛观察日记','蚂蚁搬家观察日记','月亮变化观察日记','含羞草观察日记','向日葵向日观察日记','小金鱼观察日记','天气变化观察日记','泡茶观察日记'],
    ['丁香树下的和解','雨夜暖心灯','冬日乡间书香','小巷里的坚守','操场上的蜕变','楼道里的微光','雨中的约定','街角的旧书摊','运动会上的微光','风雪中的守护'],
    ['暖','甜','拼','悔','诚','乐','韧','勤','舍','盼'],
    ['节约粮食倡议书','保护环境倡议书','节约用水倡议书','爱护校园倡议书','垃圾分类倡议书','文明出行倡议书','绿色上网倡议书','关爱老人倡议书','读书倡议书','爱护动物倡议书'],
    ['时光穿梭机','未来的学校','太空旅行记','我的机器人朋友','海底城市','记忆移植','环保超人','外星来客','人体芯片','虚拟世界'],
    ['奶奶的针线箴言','爸爸的“谎言”','那碗热腾腾的姜汤','家风如春雨','雨夜的等待','爷爷的座右铭','餐桌上的规矩','老藤椅的故事','书柜里的旧相册','三代人的春联'],
]


def normalized(text):
    text=re.sub(r'[\s①②③④⑤⑥⑦⑧⑨⑩？?]', '', text).replace('（','(').replace('）',')')
    return re.sub(r'[_＿]+','_',text).replace('(节选)','')


def clean(text):
    return '\n'.join(line.strip() for line in text.splitlines()
                     if line.strip() and not re.match(r'第\s*\d+\s*页\s*共\s*\d+\s*页',line.strip())
                     and not re.match(r'^(新版六上语文阅读|新六上语文每课|26\s*秋六年级上册语文重点常考)',line.strip())
                     and not re.fullmatch(r'第\s*页共\s*页|\d+\s+\d+',line.strip()))


def numbered(text):
    matches = list(re.finditer(r'(?m)^\s*(\d+)\s*[.．、]\s*', text))
    return [(int(m.group(1)),text[m.end():matches[i+1].start() if i+1<len(matches) else len(text)].strip()) for i,m in enumerate(matches)]


def answer_numbered(text):
    return numbered(re.sub(r'\s+(\d{1,2})[.．]\s+',r'\n\1. ',text))


def trim_blanks(text):
    return '\n'.join(x for x in text.splitlines() if not re.fullmatch(r'[＿_\s。]+',x) and x.strip() not in ['答：','仿写：'])


def question(identifier, prompt, answer, topic, explanation='', pages=None):
    prompt=trim_blanks(prompt)
    options=[]
    matches=list(re.finditer(r'(?:^|\n|\s)([ABCD])[.．、]\s*(.*?)(?=(?:\s[ABCD][.．、])|\n[ABCD][.．、]|\Z)',prompt,re.S))
    for m in matches:
        options.append({'value':m.group(1),'text':m.group(2).strip()})
    choice = bool(re.fullmatch('[ABCD]',answer.strip())) and len(options)==4
    if choice: prompt=prompt[:matches[0].start()].strip()
    return {'id':identifier,'prompt':prompt,'kind':'choice' if choice else 'short', 'options':options if choice else [],
            'answer':answer.strip(),'topic':topic,'explanation':explanation.strip(), 'pages':pages or [],
            'points':[x.strip() for x in re.split(r'[；;]|(?<=[。！？])',explanation) if len(x.strip())>3][:6],
            'reviewStatus':'source-reference'}


def import_lessons(pdf):
    items=[]
    for page_no,p in enumerate(pdf.pages,1):
        headings=[]
        for line in p.extract_text_lines():
            text=line['text']
            m=re.match(r'^第\s*(\d+)\s*(?:课\s*|(?=我的伯父鲁迅先生))(.+)$',text)
            garden=re.match(r'^语文园地\s*([一二三四五六七八])$',text)
            if m or garden:
                headings.append((line['top'],line['bottom'],m,garden))
        for i,(top,bottom,m,garden) in enumerate(headings):
            end=headings[i+1][0]-15 if i+1<len(headings) else p.height-10
            headers=[line['top'] for line in p.extract_text_lines() if '每课重点知识课课贴' in line['text'] and bottom<line['top']<end]
            if headers: end=min(headers)-1
            left=p.within_bbox((0,bottom+1,p.width/2,end)).extract_text() or ''
            right=p.within_bbox((p.width/2,bottom+1,p.width,end)).extract_text() or ''
            body=clean(left+'\n'+right)
            if m and m.group(1)=='1':
                body=body.replace('裳shang(衣裳)(云裳)','裳 shang(衣裳)；cháng(云裳)')
            title=m.group(2).strip() if m else '语文园地'+garden.group(1)
            identifier=f'lesson-{int(m.group(1)):02}' if m else f'garden-{NUMERALS.index(garden.group(1))+1}'
            sections=[]
            for block in re.split(r'(?m)(?=^[一二三四五六七八九十]+[、．])',body):
                lines=block.splitlines()
                if lines: sections.append({'title':lines[0] if re.match(r'^[一二三四五六七八九十]+[、．]',lines[0]) else '知识梳理','text':'\n'.join(lines[1:]) if re.match(r'^[一二三四五六七八九十]+[、．]',lines[0]) else block})
            questions=[]
            theme=next((s['text'] for s in sections if '课文主题' in s['title']),None)
            if theme:
                questions.append(question(identifier+'-q1',f'用自己的话概括《{title}》的主要内容，并说明作者表达的思想感情。',theme,'概括与情感','先说文章写了什么，再说作者赞美、批评或感悟了什么。用原文中的人物、事件或景物支撑判断。',[page_no]))
            words=next((s['text'] for s in sections if '词语盘点' in s['title']),None)
            if words:
                match=re.search(r'词语解释[：:]?(.*)',words,re.S)
                if match:
                    answers=re.findall(r'([^\s❁：:，。,]+)[：:]([^❁]+)',match.group(1))
                    if answers:
                        word,meaning=answers[0]
                        meaning=re.sub(r'\s+','',meaning)
                        questions.append(question(identifier+'-q2',f'结合《{title}》的内容，解释“{word}”的意思，并用它写一个完整的句子。',meaning+'\n造句答案不唯一，须符合词义和语境。','词义与运用','先结合上下文判断词义，再造句。检查句子是否完整，以及这个词在句子中是否用得恰当。',[page_no]))
            if not questions:
                questions.append(question(identifier+'-q1',f'从“{title}”中选一个知识点，用自己的话解释，并写出一个例子。',body,'积累与理解','核对所选知识点的解释，例子应与解释对应。诗句理解要结合具体词语和画面。',[page_no]))
            items.append({'id':identifier,'module':'lessons','title':title,'group':'课文同步' if m else '语文园地','source':'lessons','pages':[page_no],'sections':sections,'questions':questions})
    return items


def sentence_groups(text):
    items={}; current=None; sub='综合练习'
    for line in text.splitlines():
        heading=re.match(r'^(?:专项)?(十三|十二|十一|十|[一二三四五六七八九])[、．]\s*(.*)',line)
        if heading and any(name in heading.group(2) for name in SENTENCE_NAMES):
            current=NUMERALS.index(heading.group(1))+1; sub='综合练习'; items.setdefault(current,{})
            continue
        if current is None: continue
        section=re.match(r'^([（(][一二三四五六七八九十]+[）)])\s*(.*)',line)
        if section:
            sub=section.group(1).replace('(','（').replace(')','）'); items[current].setdefault(sub,[]).append(section.group(2)); continue
        items[current].setdefault(sub,[]).append(line)
    return {n:{s:'\n'.join(lines) for s,lines in groups.items()} for n,groups in items.items()}


def import_sentences(pdf):
    page_texts=[clean(p.extract_text() or '') for p in pdf.pages]
    exercises=sentence_groups('\n'.join(page_texts[1:29]))
    answers=sentence_groups('\n'.join(page_texts[29:]))
    items=[]
    for n,groups in exercises.items():
        questions=[]
        for sub,text in groups.items():
            reference=answers.get(n,{}).get(sub,'')
            if n==9 and sub=='（一）': reference=answers.get(n,{}).get('综合练习','')
            if n==11 and sub!='综合练习':
                if sub=='（四）':
                    text='（资料改编订正：原题缺少提出方案的衔接，以下补足方案说明。）\n（ ）随后，曹冲先让大象上船，刻下水位记号，再把大象赶上岸，往船上装其他东西，直到船沉到记号处。\n（ ）曹操想知道大象的重量，问遍群臣，谁也想不出办法。\n（ ）曹冲提出用船称象的办法，说明要先赶象上船、刻下水位，再换成其他东西称重。\n（ ）称出船上这些东西的重量，就知道大象有多重了。\n（ ）曹操听了很高兴，立刻让人照曹冲说的办法去做。'
                    reference='正确顺序为：②→③→⑤→①→④。括号内依次填：4、1、2、5、3。先交代难题，再提出方案，接着曹操同意实施，然后写具体操作，最后得出大象重量。“听了”承接曹冲提出的方案，“随后”承接实施决定。原资料题干衔接欠完整，网页已补足并订正，原页不变。'
                questions.append(question(f'sentence-{n:02}-{normalized(sub)}', '在每个句子前的括号里填上它的位次，按原来展示的句子顺序写出数字。\n'+text, reference, SENTENCE_NAMES[n-1], pages=[]))
                continue
            answer_map=dict(answer_numbered(reference))
            for index,prompt in numbered(text):
                answer=answer_map.get(index,'')
                if not answer:
                    WARNINGS.append(f'sentence-{n} {sub} {index}: missing reference'); continue
                questions.append(question(f'sentence-{n:02}-{normalized(sub)}-{index}',prompt,answer,SENTENCE_NAMES[n-1]))
        pages=[]
        for index,text in enumerate(page_texts[:29],1):
            if re.search(rf'^(?:专项)?{NUMERALS[n-1]}、',text,re.M): pages.append(index)
        start=pages[0] if pages else 1
        next_starts=[i+1 for i,t in enumerate(page_texts[:29]) if re.search(r'^(?:专项)?(?:十三|十二|十一|十|[一二三四五六七八九])、',t,re.M) and i+1>start]
        end=min(next_starts)-1 if next_starts else 29
        intro=groups.get('综合练习','').split('练习：')[0].strip()
        items.append({'id':f'sentence-{n:02}','module':'sentences','title':SENTENCE_NAMES[n-1],'group':'句子专项','source':'sentences','pages':list(range(start,end+1)),'sections':[{'title':'资料中的方法提示','text':intro}] if intro else [],'questions':questions})
    return items


def import_reading(pdf):
    pages=[clean(p.extract_text() or '') for p in pdf.pages]
    contents=[]; group='阅读理解'; unit=1
    for text in pages[1:3]:
        for line in text.splitlines():
            if line.startswith('第') and '单元' in line:
                group=re.sub(r'\s*\.{2,}.*','',line).strip(); unit+=0
            m=re.match(r'^(.+?)\s*\.{2,}\s*(\d+)\s*$',line)
            if m and not m.group(1).startswith(('第','参考','新版')):
                contents.append((m.group(1).strip(),int(m.group(2)),group))
    answer_sections={}; current=None; answer_lines=[]
    for line in '\n'.join(pages[102:]).splitlines():
        m=re.match(r'^[一二三四五六七八九十]+[、．]\s*(.+)$',line)
        if m:
            if current: answer_sections[current]='\n'.join(answer_lines)
            current=normalized(m.group(1)); answer_lines=[]
        elif current: answer_lines.append(line)
    if current: answer_sections[current]='\n'.join(answer_lines)
    items=[]
    for index,(title,start,group) in enumerate(contents):
        next_start=contents[index+1][1] if index+1<len(contents) else 103
        collected=[]; page_refs=[]; found=False
        for page_no in range(start,next_start+1 if next_start<103 else 103):
            for line in pages[page_no-1].splitlines():
                if normalized(line)==normalized(title): found=True; continue
                if found and ((index+1<len(contents) and normalized(line)==normalized(contents[index+1][0])) or re.match(r'^第[一二三四五六七八]单元',line)):
                    found=False; break
                if found:
                    collected.append(line)
                    if page_no not in page_refs: page_refs.append(page_no)
        joined='\n'.join(collected)
        qstart=re.search(r'(?m)^\s*1\s*[.．、]',joined)
        body=joined[:qstart.start()].strip() if qstart else joined
        qtext=joined[qstart.start():] if qstart else ''
        answer_map=dict(numbered(answer_sections.get(normalized(title),'')))
        questions=[]
        for ordinal,(printed,prompt) in enumerate(numbered(qtext),1):
            n=ordinal if title.endswith('的鲁迅') else printed
            reference=answer_map.get(n,'')
            if not reference:
                WARNINGS.append(f'{title} q{n}: missing reference'); continue
            am=re.search(r'参考答案[：:]\s*(.*)',reference,re.S)
            em=re.search(r'详细答题思路[：:]\s*(.*?)(?=参考答案[：:]|\Z)',reference,re.S)
            tm=re.match(r'考点[：:]\s*([^\n]+)',reference)
            answer=am.group(1).strip() if am else reference
            questions.append(question(f'reading-{index+1:02}-q{n}',prompt,answer,tm.group(1) if tm else '阅读理解',em.group(1) if em else '',page_refs))
        items.append({'id':f'reading-{index+1:02}','module':'reading','title':title,'group':group,'source':'reading','pages':page_refs,'sections':[{'title':'阅读原文','text':body}],'questions':questions})
    # Each skill keeps its examples; practice passages are listed separately.
    skills=[]; method_items=[]
    for page_no,text in enumerate(pages[3:102],4):
        for m in re.finditer(r'(?m)^考点\s*(\d+)[：:]\s*([^\n]+)',text):
            skills.append({'number':int(m.group(1)),'title':m.group(2),'page':page_no})
    for skill in skills:
        start=skill['page']; collected=[]; refs=[]; found=False; done=False
        for page_no in range(start, min(start+4,103)):
            for line in pages[page_no-1].splitlines():
                if re.match(rf'^考点\s*{skill["number"]}[：:]',line): found=True; continue
                if found and (re.match(r'^考点\s*\d+[：:]|^阅读训练',line) or any(normalized(line)==normalized(t) for t,_,_ in contents)):
                    done=True; break
                if found:
                    collected.append(line)
                    if page_no not in refs: refs.append(page_no)
            if done: break
        method_items.append({'id':f'skill-{skill["number"]:02}','module':'reading','title':skill['title'],'group':'阅读考点与方法','source':'reading','pages':refs or [start],'sections':[{'title':'考点与答题方法','text':'\n'.join(collected).strip()}],'questions':[]})
    return items,skills,method_items


def import_writing():
    items=[]
    for unit,titles in enumerate(WRITING_TITLES,1):
        for index,title in enumerate(titles,1):
            number=(unit-1)*10+index
            items.append({'id':f'writing-{number:02}','module':'writing','title':title,'group':WRITING_THEMES[unit-1],'unit':unit,'source':'writing','pages':[number+2],'sections':[], 'questions':[]})
    return items


WARNINGS=[]


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--skip-images',action='store_true'); args=parser.parse_args()
    DEST.mkdir(parents=True,exist_ok=True)
    items=[]; report={'sources':[],'warnings':WARNINGS,'writingText':'original-page-images','versionNote':'Writing and reading source unit names differ; grouped independently.'}
    skills=[]; methods=[]
    for key,filename in FILES.items():
        path=SOURCE/filename
        with pdfplumber.open(path) as pdf:
            report['sources'].append({'id':key,'filename':filename,'pageCount':len(pdf.pages)})
            if key=='lessons': items.extend(import_lessons(pdf))
            elif key=='sentences': items.extend(import_sentences(pdf))
            elif key=='reading':
                extracted,skills,methods=import_reading(pdf); items.extend(extracted)
            else: items.extend(import_writing())
        if not args.skip_images:
            images=DEST/'pages'/key; images.mkdir(parents=True,exist_ok=True)
            doc=pdfium.PdfDocument(str(path))
            for i in range(len(doc)):
                dest=images/f'{i+1}.webp'
                if not dest.exists():
                    page=doc[i]; bitmap=page.render(scale=2.2); image=bitmap.to_pil()
                    image.save(dest,format='WEBP',quality=86); bitmap.close(); page.close()
            doc.close()
    report['items']={module:sum(i['module']==module for i in items) for module in FILES}
    report['questionCount']=sum(len(i['questions']) for i in items)
    public=[{k:v for k,v in item.items() if k not in ['sections','questions']} | {'questionCount':len(item['questions']) if item['module']!='writing' else 1} for item in items]
    index=APP/'src'/'data'/'chinese-six-index.json'; index.parent.mkdir(parents=True,exist_ok=True)
    index.write_text(json.dumps({'items':public,'skills':skills},ensure_ascii=False,indent=2),encoding='utf-8')
    (DEST/'bank.private.json').write_text(json.dumps({'items':items,'skills':skills,'methods':methods,'sources':report['sources']},ensure_ascii=False,indent=2),encoding='utf-8')
    (DEST/'import-report.private.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__': main()
