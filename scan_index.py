# -*- coding: utf-8 -*-
"""scan_index.py — 專案掃描器：挑要改的範圍，產生一份給 AI 看的 Markdown 文件（只讀，不會改動你的任何檔案）。

用法（放在專案根目錄，與 index.html 同層）：
  python scan_index.py                    互動選單：選範圍 → 選詳細程度 → 寫任務說明 → 產生 scan_output/*.md
  python scan_index.py daily              直接掃 daily（可多個：daily part7 index）
  python scan_index.py daily --full       這些範圍的程式碼全部完整輸出
  python scan_index.py --file daily.js:1200-1300     只要某檔的某幾行（可重複 --file，不加行數＝整個檔）
  python scan_index.py --grep "w\\d+d8"    全專案文字檔搜尋（正規表示式），列出命中的行
  python scan_index.py --rel              只看「腳本 ↔ 資料檔」關聯表（所有根目錄的 .py）
  python scan_index.py --list             列出所有範圍名稱

輸出：scan_output/scan_<範圍>_<時間>.md → 整份貼給 AI，或直接上傳。
安全：金鑰／token／密碼樣式的字串會自動換成 ***REDACTED***；SKIP 清單內的檔案完全不讀。
      請把 scan_output/ 加進 .gitignore，避免被推上 GitHub。

【給 AI：怎麼更新這支腳本】
  只需要編輯下面「MODULES」區塊（範圍定義）與 SKIP／REDACT。新增範圍＝在 MODULES 加一項：
    '名稱': {'title': '說明', 'files': ['檔名或 *.glob', ...], 'dirs': ['只列檔名的資料夾', ...]}
  不要改其他邏輯，除非使用者要求。改完請整份回傳 scan_index.py。
"""
import os, re, sys, glob, json, time, fnmatch, ast

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# >>> MODULES（AI 可改這一段）>>>
MODULES = {
    'index': {'title': '首頁 index.html、維護總覽、專案地圖',
              'files': ['index.html', 'map.html', 'map.js', 'style.css', 'cloud-sync.js', 'site_files.json', 'index.json', 'trash-index.json'],
              'dirs': []},
    'daily': {'title': 'Daily practice（daily.html、js、daily.json）＋維護腳本（合併／對時／Trash／Scan／語音）',
              'files': ['daily.html', 'daily.js', 'daily.json', 'cloud-sync.js', 'audio.js', 'timing.js', 'speak.js', 'notes.js',
                        'newwords.js', 'tsl.js', 'pron.js', 'style.css', 'json_merge.py', 'daily_timestamps.py', 'daily_trash.py',
                        'daily_trash.bat', 'Scan總表與音檔.py', 'auto-speech.py', 'audio/index.json', 'vocab.html', 'vocab_index.json'],
              'dirs': ['audio/daily', '_trash']},
    'tools': {'title': '所有 .py／.bat 工具腳本', 'files': ['*.py', '*.bat'], 'dirs': []},
    'docs': {'title': '說明文件', 'files': ['*.md'], 'dirs': []},
}
for _n in range(1, 8):   # part1 … part7：同樣的檔案結構
    MODULES['part%d' % _n] = {'title': 'Part %d（part%d.html／.js／.json＋音檔清單）' % (_n, _n),
                              'files': ['part%d.html' % _n, 'part%d.js' % _n, 'part%d.json' % _n, 'style.css', 'PART_UI_GUIDE.md'],
                              'dirs': ['audio/p%d' % _n]}
# <<< MODULES <<<

SKIP = ['azure-usage.json', 'voices-log.json', '.env', '*.pdf', '*.mp3', '*.jpg', '*.png', '*.zip']   # 完全不讀（含敏感或太大／二進位）
SKIP_DIRS = {'.git', '.vscode', 'node_modules', '__pycache__', 'scan_output', 'backup', 'merged', 'images', '_trash'}
REDACT = [  # (樣式, 取代成)
    (re.compile(r'''(?i)((?:api[_-]?key|secret|token|password|passwd|subscription[_-]?key|private[_-]?key|authorization)["']?\s*[:=]\s*["'])[^"'\n]{8,}(["'])'''), r'\1***REDACTED***\2'),
    (re.compile(r'AIza[0-9A-Za-z_\-]{30,}'), '***REDACTED***'),
    (re.compile(r'\b[0-9a-f]{32,}\b'), '***REDACTED***'),
]
FULL_KB = 40        # 「骨架」模式：小於這個大小的檔案仍完整輸出；更大的只列骨架
MAX_LINE = 600      # 單行太長（如單字總表）只留前面
ROOT = os.path.dirname(os.path.abspath(__file__))
if '--root' in sys.argv:
    ROOT = os.path.abspath(sys.argv[sys.argv.index('--root') + 1])


def rel(p):
    return os.path.relpath(p, ROOT).replace('\\', '/')


def skipped(p):
    r = rel(p)
    return any(fnmatch.fnmatch(os.path.basename(r), s) or fnmatch.fnmatch(r, s) for s in SKIP)


def read(p):
    try:
        with open(p, encoding='utf-8-sig', errors='replace') as f:
            t = f.read()
    except Exception as e:
        return '(讀取失敗：%s)' % e
    for rx, sub in REDACT:
        t = rx.sub(sub, t)
    return t


def cap(line):
    return line if len(line) <= MAX_LINE else line[:MAX_LINE] + ' …（此行共 %d 字，已截斷）' % len(line)


def fence(lang, body):
    return '```%s\n%s\n```' % (lang, body.rstrip('\n'))


LANG = {'.js': 'js', '.py': 'python', '.html': 'html', '.css': 'css', '.json': 'json', '.md': 'markdown', '.bat': 'bat'}
OUTLINE_RX = {
    '.js': re.compile(r'^\s{0,2}(?:async\s+)?function\s+\w+|^(?:const|let|var)\s+\w+\s*=|^/\*\s*=+'),
    '.py': re.compile(r'^(?:def|class)\s+\w+|^[A-Z_][A-Z0-9_]*\s*=|^\s{4}def\s+\w+|^#\s*[─=]{3,}'),
    '.html': re.compile(r'<script|<link|<title|<main|<aside|<section id|id="[^"]+"'),
}


def py_outline(text):
    """Python 骨架：模組說明前幾行、頂層常數、class／def（含行號與說明第一行）。"""
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return None
    first = lambda n: ((ast.get_docstring(n) or '').strip().split('\n') or [''])[0][:90]
    out = ['（骨架：檔案共 %d 行；列出模組說明、常數、class／def 與其說明第一行）' % (text.count('\n') + 1)]
    md = (ast.get_docstring(tree) or '').strip().split('\n')[:6]
    if md and md[0]:
        out += ['模組說明：'] + ['  ' + cap(x) for x in md]
    for n in tree.body:
        if isinstance(n, ast.Assign) and all(isinstance(t, ast.Name) for t in n.targets):
            out.append('%5d  %s = …' % (n.lineno, ', '.join(t.id for t in n.targets)))
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            out.append('%5d  def %s(%s)  %s' % (n.lineno, n.name, ', '.join(a.arg for a in n.args.args)[:60], first(n)))
        elif isinstance(n, ast.ClassDef):
            out.append('%5d  class %s  %s' % (n.lineno, n.name, first(n)))
            for m in n.body:
                if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    out.append('%5d    def %s(%s)  %s' % (m.lineno, m.name, ', '.join(a.arg for a in m.args.args)[:50], first(m)))
    return '\n'.join(out)


FILE_RX = re.compile(r'''["']([\w\u4e00-\u9fff./\-]*\.(?:json|js|html|css|mp3|py|bat|md|txt))["']''')
DIR_RX = re.compile(r'''["'](_trash|backup|merged|audio(?:/[\w\-]+)?|images)/?["']''')


def py_relations(paths):
    """腳本 ↔ 檔案關聯：每支 py 的程式碼字串裡出現的檔名／資料夾，以及它 import 或載入了哪支 py（靜態掃描，供參考）。"""
    rows = []
    for p in paths:
        text = read(p)
        refs = sorted({m for m in FILE_RX.findall(text) if not m.startswith('.') and len(m) < 60})
        dirs = sorted(set(DIR_RX.findall(text)))
        mods = set(re.findall(r'^\s*(?:import|from)\s+([A-Za-z_]\w*)', text, re.M)) | set(re.findall(r'''["']([\w\u4e00-\u9fff\-]+\.py)["']''', text))
        local = sorted(m for m in mods if os.path.isfile(os.path.join(ROOT, m if m.endswith('.py') else m + '.py')))
        mark = lambda f: f if os.path.exists(os.path.join(ROOT, f)) or any(c in f for c in '%{*') else f + '（不存在）'
        rows.append('%s\n  檔案：%s\n  資料夾：%s\n  用到的腳本：%s' % (rel(p), '、'.join(mark(f) for f in refs) or '—', '、'.join(dirs) or '—', '、'.join(local) or '—'))
    return '\n\n'.join(rows)


def outline(text, ext):
    if ext == '.py':
        o = py_outline(text)
        if o:
            return o
    lines = text.split('\n')
    rx = OUTLINE_RX.get(ext)
    out = ['（骨架：檔案共 %d 行；只列開頭與定義行，要看內容請用 --file 檔名:起-迄）' % len(lines), '']
    out += ['%5d  %s' % (i + 1, cap(l)) for i, l in enumerate(lines[:12])]
    if rx:
        out.append('  ……')
        out += ['%5d  %s' % (i + 1, cap(l[:160])) for i, l in enumerate(lines) if i >= 12 and rx.search(l)]
    return '\n'.join(out)


def json_summary(p, text):
    """大型資料 json：只列結構與每篇一行摘要，不輸出全文。"""
    try:
        d = json.loads(text)
    except Exception as e:
        return '（不是合法 json：%s）' % e
    out = []

    def shape(v, depth=0):
        if isinstance(v, dict):
            return '{%s}' % ', '.join('%s: %s' % (k, shape(x, depth + 1) if depth < 1 else type(x).__name__) for k, x in list(v.items())[:25])
        if isinstance(v, list):
            return 'list[%d]' % len(v)
        return type(v).__name__

    def one(x):
        keys = [k for k in ('id', 'week', 'day', 'tag', 'type', 'subtopic', 'project', 'title') if k in x]
        s = ' '.join('%s=%s' % (k, str(x[k])[:36]) for k in keys)
        lv = x.get('level')
        if isinstance(lv, dict) and 'score' in lv:
            s += ' score=%s' % lv['score']
        return s or ', '.join(list(x)[:8])
    items = d if isinstance(d, list) else d.get('items') if isinstance(d, dict) and isinstance(d.get('items'), list) else None
    out.append('結構：' + shape(d))
    if isinstance(d, dict) and '_spec' in d:
        out.append('_spec 頂層鍵：' + '、'.join(d['_spec'].keys()) if isinstance(d['_spec'], dict) else '_spec 存在')
    if items is not None:
        out.append('items：%d 筆' % len(items))
        if items and isinstance(items[0], dict):
            out.append('第一筆的欄位：' + '、'.join(items[0].keys()))
            out += ['  - ' + one(x) for x in items[:300] if isinstance(x, dict)]
    return '\n'.join(out)


def render_file(p, mode, lines=None):
    r, ext = rel(p), os.path.splitext(p)[1].lower()
    if skipped(p):
        return '### `%s`\n（在 SKIP 清單內，未讀取）\n' % r
    if not os.path.isfile(p):
        return '### `%s`\n（找不到）\n' % r
    size = os.path.getsize(p)
    text = read(p)
    head = '### `%s`（%.1f KB）' % (r, size / 1024)
    if lines:
        a, b = lines
        ls = text.split('\n')
        body = '\n'.join('%5d  %s' % (i + 1, cap(l)) for i, l in enumerate(ls) if a <= i + 1 <= b)
        return '%s　第 %d–%d 行\n%s\n' % (head, a, b, fence('', body))
    if ext == '.json' and mode != 'jsonfull' and size > 30 * 1024:
        return '%s　資料檔，只列結構與摘要（要全文請加 --json-full，或 --file）\n%s\n' % (head, fence('', json_summary(p, text)))
    if mode == 'full' or mode == 'jsonfull' or size <= FULL_KB * 1024:
        body = '\n'.join(cap(l) for l in text.split('\n'))
        return '%s\n%s\n' % (head, fence(LANG.get(ext, ''), body))
    return '%s\n%s\n' % (head, fence('', outline(text, ext)))


def expand(patterns):
    out = []
    for pat in patterns:
        hits = sorted(glob.glob(os.path.join(ROOT, pat))) if any(c in pat for c in '*?[') else [os.path.join(ROOT, pat)]
        for h in hits:
            if h not in out:
                out.append(h)
    return out


def dir_listing(d):
    p = os.path.join(ROOT, d)
    if not os.path.isdir(p):
        return '### 資料夾 `%s/`\n（不存在）\n' % d
    names = sorted(os.listdir(p))
    files = [n for n in names if os.path.isfile(os.path.join(p, n))]
    subs = [n for n in names if os.path.isdir(os.path.join(p, n))]
    body = []
    if len(files) > 150:
        body.append('檔案 %d 個（太多，只列前 40 個）：' % len(files))
        body += files[:40]
    else:
        body.append('檔案 %d 個：' % len(files))
        body += files
    for s in subs:
        n = sum(len(fs) for _, _, fs in os.walk(os.path.join(p, s)))
        body.append('[資料夾] %s/（內含 %d 個檔案）' % (s, n))
    return '### 資料夾 `%s/`（只列檔名）\n%s\n' % (d, fence('', '\n'.join(body)))


def tree():
    out = []
    for n in sorted(os.listdir(ROOT)):
        p = os.path.join(ROOT, n)
        if os.path.isdir(p):
            if n in SKIP_DIRS or n.startswith('.'):
                out.append('%s/  （%d 個檔案，不展開）' % (n, sum(len(fs) for _, _, fs in os.walk(p))))
            else:
                out.append('%s/  （%d 個檔案）' % (n, sum(len(fs) for _, _, fs in os.walk(p))))
        else:
            out.append('%s  (%.1f KB)' % (n, os.path.getsize(p) / 1024))
    return '\n'.join(out)


def grep(pattern):
    rx = re.compile(pattern, re.I)
    out, n = [], 0
    for d, ds, fs in os.walk(ROOT):
        ds[:] = [x for x in ds if x not in SKIP_DIRS and not x.startswith('.')]
        for f in sorted(fs):
            p = os.path.join(d, f)
            if os.path.splitext(f)[1].lower() not in LANG or skipped(p) or os.path.getsize(p) > 3_000_000:
                continue
            hits = [(i + 1, l) for i, l in enumerate(read(p).split('\n')) if rx.search(l)]
            if hits:
                out.append('### `%s`（%d 行命中）' % (rel(p), len(hits)))
                out.append(fence('', '\n'.join('%5d  %s' % (i, cap(l[:240])) for i, l in hits[:80])))
                n += len(hits)
    return '## 搜尋：`%s`　共 %d 行命中\n\n%s\n' % (pattern, n, '\n'.join(out) or '（沒有命中）')


def parse_file_arg(s):
    m = re.match(r'^(.*?):(\d+)-(\d+)$', s)
    return (m.group(1), (int(m.group(2)), int(m.group(3)))) if m else (s, None)


def menu():
    names = list(MODULES)
    print('專案：%s\n\n要掃哪些範圍？' % ROOT)
    for i, n in enumerate(names, 1):
        print('  %2d. %-8s %s' % (i, n, MODULES[n]['title']))
    s = input('\n輸入編號或名稱（可多個，用空白分開；a＝全部）：').strip()
    chosen = names if s.lower() == 'a' else [names[int(t) - 1] if t.isdigit() and 1 <= int(t) <= len(names) else t for t in s.split()]
    chosen = [c for c in chosen if c in MODULES]
    m = input('程式碼要多完整？  1＝骨架（小檔完整、大檔只列結構，較短）  2＝全部完整（預設 1）：').strip()
    extra = input('要另外指定檔案或行數嗎？（例如 daily.js:1200-1300，可多個用空白分開；Enter 略過）：').split()
    task = input('這次想請 AI 做什麼？（一行即可，會寫在文件最前面；Enter 略過）：').strip()
    return chosen, ('full' if m == '2' else 'outline'), extra, task


def main():
    a = sys.argv[1:]
    if '--list' in a:
        for n, m in MODULES.items():
            print('%-8s %s' % (n, m['title']))
        return
    task, extra, mode, mods, gp = '', [], 'outline', [], None
    i = 0
    while i < len(a):
        t = a[i]
        if t == '--full':
            mode = 'full'
        elif t == '--json-full':
            mode = 'jsonfull'
        elif t == '--file' and i + 1 < len(a):
            extra.append(a[i + 1]); i += 1
        elif t == '--grep' and i + 1 < len(a):
            gp = a[i + 1]; i += 1
        elif t == '--task' and i + 1 < len(a):
            task = a[i + 1]; i += 1
        elif t == '--root':
            i += 1
        elif t == '--rel':
            pass
        elif t in MODULES:
            mods.append(t)
        elif not t.startswith('--'):
            print('不認得的範圍：%s（--list 看有哪些）' % t); return
        i += 1
    if not (mods or extra or gp or '--rel' in a):
        mods, mode, extra, task = menu()
    parts = ['# 專案掃描：%s' % (' '.join(mods + (['--file'] if extra else []) + (['--grep'] if gp else [])) or '—'),
             '產生時間：%s　專案：%s' % (time.strftime('%Y-%m-%d %H:%M:%S'), os.path.basename(ROOT))]
    if task:
        parts += ['', '## 這次的任務', task]
    parts += ['', '## 專案檔案總覽（根目錄）', fence('', tree())]
    seen = set()
    for n in mods:
        m = MODULES[n]
        parts += ['', '## 範圍：%s　%s' % (n, m['title'])]
        for p in expand(m['files']):
            if p in seen:
                continue
            seen.add(p)
            parts.append(render_file(p, mode))
        for d in m['dirs']:
            parts.append(dir_listing(d))
    pys = [p for p in sorted(seen) if p.lower().endswith('.py')]
    if '--rel' in a:
        pys = sorted(glob.glob(os.path.join(ROOT, '*.py')))
    if pys:
        parts += ['', '## 腳本 ↔ 檔案關聯（py 靜態掃描：程式碼裡寫到的檔名、資料夾、用到的其他腳本）', fence('', py_relations(pys))]
    if extra:
        parts += ['', '## 指定的檔案／行數']
        for s in extra:
            f, ln = parse_file_arg(s)
            parts.append(render_file(os.path.join(ROOT, f), 'full', ln))
    if gp:
        parts += ['', grep(gp)]
    parts += ['', '---', '（本文件由 scan_index.py 產生；API 金鑰類字串已遮蔽。AI 若需要別的檔案或行數，請給使用者一行指令，例如：',
              '`python scan_index.py --file daily.js:1200-1300`、`python scan_index.py part7 --full`、`python scan_index.py --grep "關鍵字"`；',
              '要新增掃描範圍就改 scan_index.py 的 MODULES 區塊並整份回傳。）']
    out = '\n'.join(parts) + '\n'
    od = os.path.join(ROOT, 'scan_output')
    os.makedirs(od, exist_ok=True)
    name = 'scan_%s_%s.md' % ('-'.join(mods) or ('grep' if gp else 'files'), time.strftime('%Y%m%d_%H%M%S'))
    with open(os.path.join(od, name), 'w', encoding='utf-8') as f:
        f.write(out)
    print('\n完成：scan_output/%s（%.0f KB）' % (name, len(out.encode('utf-8')) / 1024))
    if len(out) > 600_000:
        print('⚠ 文件很大，貼給 AI 可能放不下；可改用「骨架」或只掃單一範圍／--file 指定行數。')
    print('請把整份內容貼給 AI（或上傳）。記得把 scan_output/ 加進 .gitignore。')


if __name__ == '__main__':
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        pass
    except Exception:   # 出錯時印出完整錯誤，不要讓視窗一閃而過
        import traceback
        traceback.print_exc()
    finally:            # 雙擊執行時，結束前停住視窗，才看得到結果或錯誤
        try:
            input('\n按 Enter 關閉視窗…')
        except Exception:
            pass
