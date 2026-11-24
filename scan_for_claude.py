#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scan_for_claude.py — 掃描專案資料夾，把「新增易混淆字」相關的程式碼與資料格式整理成一個文字檔，上傳給 Claude 用。

用法：把這支檔案放在專案根目錄（有 daily.json、notes.js 的那個資料夾），執行：
    python scan_for_claude.py
會產生 claude_scan.txt（同一個資料夾），把它上傳給 Claude 即可。
只讀取檔案，不會修改、刪除任何東西。內容只有程式碼片段與欄位結構，沒有金鑰；
但 .py 裡若有 API key 或 Azure 金鑰，會自動遮蔽成 ***。
"""
import json
import os
import re
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'claude_scan.txt')
SKIP_DIRS = {'audio', '_trash', 'node_modules', '.git', '__pycache__', 'venv', '.venv'}
TEXT_EXT = ('.js', '.html', '.py', '.bat', '.md')
MAX_TEXT_BYTES = 3 * 1024 * 1024     # 超過 3MB 的程式檔不掃
WIN_BEFORE, WIN_AFTER = 6, 45        # 特定關鍵字：往上 6 行、往下 45 行
MAX_WINDOWS_PER_FILE = 14            # 每個檔案最多列幾個片段
MAX_TOTAL_CHARS = 260_000            # 整份輸出上限

# 特定關鍵字：命中就貼出前後程式碼
SPECIFIC = [
    '新增易混淆字', '要加入的易混淆字', '請 AI 找易混淆字', 'AI 找易混淆', '易混淆深入', '深入詳解', '深入辨析',
    'confusable_add', 'confusable_req', 'cfTitle', 'cfEmpty', 'dnCfWrap', 'dnCfSelfRow', 'dnCfAdd', 'dnCfReq',
    'cfAdd', 'cfReq', 'cfAsk', 'cfWant', 'cfKinds', '_group',
]
# 函式／變數定義：名字以 cf、dnCf、nwCf、dnConf 開頭
DEF_RE = re.compile(r'(?:async\s+)?(?:function|const|let|var)\s+((?:cf|dnCf|nwCf|dnConf|dnGroup|dnGrp)\w*)')
SECRET_RE = re.compile(r'(?i)(key|secret|token|subscription)\s*[=:]\s*[\'"]([A-Za-z0-9_\-]{16,})[\'"]')
GENERIC = '易混淆'
KEY_RE = re.compile(r'(?i)conf|cf|group|req|want|kind|nw_')

buf, size = [], 0


def w(s=''):
    global size
    if size > MAX_TOTAL_CHARS:
        return
    buf.append(s)
    size += len(s) + 1


def read_text(p):
    with open(p, 'rb') as f:
        b = f.read()
    for enc in ('utf-8-sig', 'utf-8', 'cp950'):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            continue
    return b.decode('utf-8', 'replace')


def walk():
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for fn in sorted(files):
            yield os.path.join(d, fn)


def rel(p):
    return os.path.relpath(p, ROOT).replace('\\', '/')


def section(t):
    w('')
    w('=' * 78)
    w(t)
    w('=' * 78)


def scan_files():
    section('1. 資料夾內的檔案（不含 audio／_trash）')
    rows = []
    for p in walk():
        try:
            st = os.stat(p)
        except OSError:
            continue
        rows.append((rel(p), st.st_size, datetime.fromtimestamp(st.st_mtime).strftime('%Y-%m-%d %H:%M')))
    for r, s, m in rows:
        w('%-44s %10d bytes  %s' % (r, s, m))
    return [os.path.join(ROOT, r[0]) for r in rows if r[0].lower().endswith(TEXT_EXT) and r[1] <= MAX_TEXT_BYTES]


def windows_for(lines):
    hits = []
    for i, l in enumerate(lines):
        if any(k in l for k in SPECIFIC) or DEF_RE.search(l):
            hits.append(i)
    wins = []
    for i in hits:
        a, b = max(0, i - WIN_BEFORE), min(len(lines), i + WIN_AFTER)
        if wins and a <= wins[-1][1]:
            wins[-1][1] = max(wins[-1][1], b)
        else:
            wins.append([a, b])
    return wins


def scan_code(paths):
    section('2. 特定關鍵字／cf* 函式的程式碼片段')
    w('（關鍵字：%s ＋ cf*/dnCf*/nwCf* 開頭的函式或變數定義）' % '、'.join(SPECIFIC))
    index = []
    for p in paths:
        text = read_text(p)
        lines = text.split('\n')
        wins = windows_for(lines)
        for i, l in enumerate(lines, 1):
            if GENERIC in l:
                index.append((rel(p), i, l.strip()))
        if not wins:
            continue
        w('')
        w('##### %s（共 %d 行；命中 %d 個片段%s）' % (rel(p), len(lines), len(wins),
                                              '，只列前 %d 個' % MAX_WINDOWS_PER_FILE if len(wins) > MAX_WINDOWS_PER_FILE else ''))
        for a, b in wins[:MAX_WINDOWS_PER_FILE]:
            w('--- %s 第 %d–%d 行 ---' % (rel(p), a + 1, b))
            for k in range(a, b):
                s = lines[k].rstrip('\r')
                s = SECRET_RE.sub(lambda m: m.group(0).replace(m.group(2), '***'), s)
                w('%5d| %s' % (k + 1, s[:600]))
    section('3. 含「易混淆」的行索引（只列行號與前 140 字，用來確認有沒有漏掉的檔案）')
    for r, i, l in index[:400]:
        w('%s:%d: %s' % (r, i, l[:140]))
    if len(index) > 400:
        w('…（共 %d 行，只列前 400）' % len(index))


def scan_storage(paths):
    section('4. localStorage／sessionStorage 用到的 key（看易混淆請求存在哪裡）')
    seen = set()
    for p in paths:
        if not p.lower().endswith(('.js', '.html')):
            continue
        for i, l in enumerate(read_text(p).split('\n'), 1):
            if re.search(r'(local|session)Storage', l) and re.search(r'(?i)conf|cf|nw|group|req|易混', l):
                k = (rel(p), l.strip()[:200])
                if k not in seen:
                    seen.add(k)
                    w('%s:%d: %s' % (k[0], i, k[1]))


def scan_daily_json():
    section('5. daily.json 裡與「易混淆／請求／群組」有關的欄位結構')
    p = os.path.join(ROOT, 'daily.json')
    if not os.path.isfile(p):
        w('找不到 daily.json（請把這支程式放在 daily.json 同一個資料夾）')
        return
    try:
        data = json.loads(read_text(p))
    except Exception as ex:
        w('daily.json 讀取失敗：%s' % ex)
        return
    w('頂層 key：%s' % list(data.keys()) if isinstance(data, dict) else '頂層是 %s' % type(data).__name__)
    stats = {}

    def walk_obj(o, path):
        if isinstance(o, dict):
            for k, v in o.items():
                pth = path + '.' + str(k)
                if KEY_RE.search(str(k)):
                    s = stats.setdefault(pth, [0, None])
                    s[0] += 1
                    if s[1] is None and v not in (None, '', [], {}):
                        s[1] = v
                walk_obj(v, pth)
        elif isinstance(o, list):
            for v in o:
                walk_obj(v, path + '[]')
    walk_obj(data, '$')
    for pth, (n, sample) in sorted(stats.items()):
        txt = json.dumps(sample, ensure_ascii=False)[:420] if sample is not None else '（都是空的）'
        w('%-60s 出現 %d 次\n      範例：%s' % (pth, n, txt))
    # 有 confusable 的詳解，拿一筆完整的當範例
    sample_entry = None
    items = data.get('items') if isinstance(data, dict) else None
    for it in items or []:
        for v in (it.get('extra_vocab') or []):
            if isinstance(v, dict) and v.get('confusable') and v.get('nw_done') is not None:
                sample_entry = (it.get('week'), it.get('day'), v)
                break
        if sample_entry:
            break
    if not sample_entry:
        for it in items or []:
            for v in (it.get('extra_vocab') or []):
                if isinstance(v, dict) and v.get('confusable'):
                    sample_entry = (it.get('week'), it.get('day'), v)
                    break
            if sample_entry:
                break
    if sample_entry:
        wk, dy, v = sample_entry
        w('')
        w('--- 一筆有 confusable 的 extra_vocab 範例（W%s D%s，只留 confusable／nw_done／text／type）---' % (wk, dy))
        w(json.dumps({k: v[k] for k in ('text', 'type', 'confusable', 'nw_done') if k in v}, ensure_ascii=False, indent=1)[:3500])


def scan_audio():
    section('6. 例句音檔現況（audio/daily/vocab 與 words）')
    for sub in ('vocab', 'words'):
        d = os.path.join(ROOT, 'audio', 'daily', sub)
        if not os.path.isdir(d):
            w('audio/daily/%s：資料夾不存在' % sub)
            continue
        fs = sorted(f for f in os.listdir(d) if f.lower().endswith('.mp3'))
        w('audio/daily/%s：%d 個 mp3' % (sub, len(fs)))
        cf = [f for f in fs if re.search(r'_cf\d+\.mp3$', f)]
        if sub == 'vocab':
            w('   其中 _cf（易混淆例句）%d 個，前 15 個：%s' % (len(cf), ', '.join(cf[:15])))
            ov = [f for f in fs if f.startswith('overlook')]
            w('   overlook 開頭的檔：%s' % ', '.join(ov[:30]))


def main():
    w('claude_scan.txt  產生時間 %s  資料夾 %s' % (datetime.now().strftime('%Y-%m-%d %H:%M'), ROOT))
    paths = scan_files()
    scan_code(paths)
    scan_storage(paths)
    scan_daily_json()
    scan_audio()
    if size > MAX_TOTAL_CHARS:
        w('\n…（輸出已達上限，後面的內容被截斷）')
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(buf))
    print('已輸出：%s（%d KB）' % (OUT, os.path.getsize(OUT) // 1024))
    print('請把 claude_scan.txt 上傳給 Claude。')


if __name__ == '__main__':
    try:
        main()
    except Exception as ex:
        print('掃描失敗：', ex)
    if sys.stdin and sys.stdin.isatty():
        input('按 Enter 結束…')
