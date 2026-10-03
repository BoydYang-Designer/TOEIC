# -*- coding: utf-8 -*-
"""audio_scan.py — 掃描 audio 資料夾，產生 audio/index.json（本檔放在 audio 資料夾內，雙擊執行）

專案結構：
  index.html / part2.html / daily.html / *.json   ← 網站根目錄（ROOT）
  audio/audio_scan.py                             ← 本檔
  audio/index.json                                ← 本檔產生
  audio/p1/、audio/p2/、audio/p3/、audio/p4/、audio/p5/、audio/p6/、audio/daily/   ← mp3

預期檔案（由題庫 json 推算）：
  Part 1  audio/p1/{id}-s01.mp3 … -s12.mp3          （part1.json，每題 pool 幾句就幾個檔）
  Part 2  audio/p2/{id}-q.mp3 與 {id}-s01.mp3 …      （part2.json）
  Part 3  audio/p3/{id}-s01.mp3 …                   （part3.json，每句對話一檔，依 dialogue 句數）
  Part 4  audio/p4/{id}.mp3                          （part4.json，整段獨白一個檔，不分句）
  Part 5  audio/p5/{id}.mp3                         （part5.json，一題一檔，朗讀答案填入的完整句；say 欄位若有則朗讀 say）
  Part 6  audio/p6/{id}.mp3                         （part6.json，一篇一檔，朗讀答案填入的整篇；say 欄位若有則朗讀 say）
  Daily   audio/daily/w1d1.mp3（或題目的 audio 欄位）  （daily.json，整篇一個檔）
  字母    audio/A.mp3 … E.mp3（Part 1／2 共用，大寫檔名；Part 1 需 A–D、Part 2 需 A–C 到齊，才會在每個選項前先念字母）
整題到齊才列入 complete；網頁只對 complete 的題目用 mp3。
另外檢查：孤兒檔（不屬於任何題目，多半是打錯檔名）、檔名大小寫不符（GitHub Pages 區分大小寫）、0 KB 空檔、
舊位置的 daily 檔（audio/w1d1.mp3 → 請搬到 audio/daily/）。
"""
import json, os, re, time

AUD = os.path.dirname(os.path.abspath(__file__))   # audio 資料夾（本檔所在）
ROOT = os.path.dirname(AUD)                        # 網站根目錄（題庫 json 所在）
warn = []


def items(fn):
    p = os.path.join(ROOT, fn)
    if not os.path.exists(p):
        print('找不到 %s，略過' % fn)
        return []
    j = json.load(open(p, encoding='utf-8'))
    return j if isinstance(j, list) else j.get('items', [])


def listdir(d):
    return sorted(f for f in os.listdir(d) if os.path.isfile(os.path.join(d, f))) if os.path.isdir(d) else []


def check(d, expected, label):
    """expected: {id: [檔名.mp3,...]} → (complete, partial, orphans)"""
    have = listdir(d)
    low = {f.lower(): f for f in have}
    allexp = set()
    complete, partial = [], {}
    for id_, names in expected.items():
        miss = []
        for n in names:
            allexp.add(n)
            if n in have:
                if os.path.getsize(os.path.join(d, n)) == 0:
                    warn.append('%s/%s 是 0 KB 空檔' % (label, n))
                    miss.append(n)
            else:
                miss.append(n)
                if n.lower() in low:
                    warn.append('%s：檔名大小寫不符，現有「%s」，應為「%s」' % (label, low[n.lower()], n))
        if not miss:
            complete.append(id_)
        elif len(miss) < len(names):
            partial[id_] = [m[:-4] for m in miss]
    orphans = [f for f in have if f not in allexp and f.lower().endswith('.mp3')]
    return complete, partial, orphans


out = {'v': int(time.time())}

# 選項字母 audio/A.mp3 … E.mp3（Part 1／Part 2 共用，大寫檔名）
have_root = listdir(AUD)
low_root = {f.lower(): f for f in have_root}
letters = []
for c in 'ABCDE':
    n = c + '.mp3'
    if n in have_root:
        if os.path.getsize(os.path.join(AUD, n)) == 0:
            warn.append('audio/%s 是 0 KB 空檔' % n)
        else:
            letters.append(c)
    elif n.lower() in low_root:
        warn.append('audio：字母檔名大小寫不符，現有「%s」，應為「%s」' % (low_root[n.lower()], n))
out['letters'] = letters
print('letters：已有 %s（Part 1 需 A–D，Part 2 需 A–C）' % (''.join(letters) or '無'))
for part, fn, with_q in (('p1', 'part1.json', False), ('p2', 'part2.json', True)):
    exp = {}
    for it in items(fn):
        if not isinstance(it, dict) or not it.get('id') or not isinstance(it.get('pool'), list):
            continue
        i = it['id']
        exp[i] = ([i + '-q.mp3'] if with_q else []) + ['%s-s%02d.mp3' % (i, k + 1) for k in range(len(it['pool']))]
    c, p, o = check(os.path.join(AUD, part), exp, 'audio/' + part)
    out[part] = {'complete': c, 'partial': p, 'orphans': o}
    print('%s：題目 %d，音檔完整 %d，部分 %d，孤兒檔 %d' % (part, len(exp), len(c), len(p), len(o)))

# Part 3：audio/p3/{id}-s01.mp3 …（每句對話一檔；網頁目前只用對話音檔，題目與選項仍不念）
exp = {}
for it in items('part3.json'):
    if isinstance(it, dict) and it.get('id') and isinstance(it.get('dialogue'), list):
        exp[it['id']] = ['%s-s%02d.mp3' % (it['id'], k + 1) for k in range(len(it['dialogue']))]
c, p, o = check(os.path.join(AUD, 'p3'), exp, 'audio/p3')
out['p3'] = {'complete': c, 'partial': p, 'orphans': o}
print('p3：題組 %d，音檔完整 %d，部分 %d，孤兒檔 %d' % (len(exp), len(c), len(p), len(o)))

# Part 4：audio/p4/{id}.mp3（整段獨白一個檔；單一說話者，不分句）
exp = {}
for it in items('part4.json'):
    if isinstance(it, dict) and it.get('id') and isinstance(it.get('script'), list):
        exp[it['id']] = ['%s.mp3' % it['id']]
c, p, o = check(os.path.join(AUD, 'p4'), exp, 'audio/p4')
legacy = [f for f in o if re.match(r'^d\d-\d{3}-[emh]-s\d+\.mp3$', f)]
if legacy:
    warn.append('audio/p4 有 %d 個舊的逐句檔（如 %s）。Part 4 已改為整段獨白一個檔 {id}.mp3，舊檔可刪除或另存' % (len(legacy), legacy[0]))
    o = [f for f in o if f not in legacy]
out['p4'] = {'complete': c, 'partial': p, 'orphans': o}
print('p4：題組 %d，音檔完整 %d，孤兒檔 %d' % (len(exp), len(c), len(o)))

# Part 5：audio/p5/{id}.mp3（一題一檔，朗讀答案填入的完整句；partial 固定為空，保留是為了與其他 Part 相同的讀取方式）
exp = {}
for it in items('part5.json'):
    if isinstance(it, dict) and it.get('id') and isinstance(it.get('sentence'), dict):
        exp[it['id']] = [it['id'] + '.mp3']
c, p, o = check(os.path.join(AUD, 'p5'), exp, 'audio/p5')
out['p5'] = {'complete': c, 'partial': {}, 'orphans': o}
print('p5：題目 %d，音檔完整 %d，缺 %d，孤兒檔 %d' % (len(exp), len(c), len(exp) - len(c), len(o)))

# Part 6：audio/p6/{id}.mp3（一篇一檔，朗讀答案填入的整篇；say 欄位若有則朗讀 say）
exp = {}
for it in items('part6.json'):
    if isinstance(it, dict) and it.get('id') and isinstance(it.get('body'), list):
        exp[it['id']] = [it['id'] + '.mp3']
c, p, o = check(os.path.join(AUD, 'p6'), exp, 'audio/p6')
out['p6'] = {'complete': c, 'partial': {}, 'orphans': o}
print('p6：文章 %d，音檔完整 %d，缺 %d，孤兒檔 %d' % (len(exp), len(c), len(exp) - len(c), len(o)))

# Daily：audio/daily/{id}.mp3；題目若有 audio 欄位（相對網站根目錄的路徑）則以該路徑為準
DDIR = os.path.join(AUD, 'daily')
dexp, dcustom = {}, {}
for it in items('daily.json'):
    if isinstance(it, dict) and 'week' in it and 'day' in it:
        i = 'w%sd%s' % (it['week'], it['day'])
        a = it.get('audio')
        if a and os.path.normpath(os.path.join(ROOT, a)) != os.path.normpath(os.path.join(DDIR, i + '.mp3')):
            dcustom[i] = a                      # 自訂路徑，只檢查檔案存在
        else:
            dexp[i] = [i + '.mp3']
dc, dp, do = check(DDIR, dexp, 'audio/daily')
for i, a in dcustom.items():
    f = os.path.join(ROOT, a)
    if os.path.isfile(f) and os.path.getsize(f) > 0:
        dc.append(i)
    else:
        warn.append('daily %s 的 audio 欄位指向 %s，但檔案不存在或是 0 KB' % (i, a))
# 舊位置（audio/w1d1.mp3）提醒搬家
for f in listdir(AUD):
    base = f[:-4] if f.lower().endswith('.mp3') else None
    if base and base in dexp:
        warn.append('audio/%s 還在舊位置，請搬到 audio/daily/' % f)
out['daily'] = {'complete': dc, 'partial': dp, 'orphans': do}
print('daily：題目 %d，音檔完整 %d，孤兒檔 %d' % (len(dexp) + len(dcustom), len(dc), len(do)))

os.makedirs(AUD, exist_ok=True)
with open(os.path.join(AUD, 'index.json'), 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print('\n已寫入 audio/index.json')
for part in ('p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'daily'):
    for o in out[part]['orphans']:
        warn.append('audio/%s/%s 不屬於任何題目（檔名打錯？）' % (part, o))
for w in warn:
    print('⚠', w)
try:
    input('\n按 Enter 結束')
except EOFError:
    pass
