# -*- coding: utf-8 -*-
"""audio_scan.py — 掃描 audio 資料夾，產生 audio/index.json（本檔放在 audio 資料夾內，雙擊執行）

專案結構：
  index.html / part2.html / daily.html / *.json   ← 網站根目錄（ROOT）
  audio/audio_scan.py                             ← 本檔
  audio/index.json                                ← 本檔產生
  audio/p1/、audio/p2/、audio/daily/              ← mp3

預期檔案（由題庫 json 推算）：
  Part 1  audio/p1/{id}-s01.mp3 … -s12.mp3          （photo.json，每題 pool 幾句就幾個檔）
  Part 2  audio/p2/{id}-q.mp3 與 {id}-s01.mp3 …      （part2.json）
  Daily   audio/daily/w1d1.mp3（或題目的 audio 欄位）  （daily.json，整篇一個檔）
整題到齊才列入 complete；網頁只對 complete 的題目用 mp3。
另外檢查：孤兒檔（不屬於任何題目，多半是打錯檔名）、檔名大小寫不符（GitHub Pages 區分大小寫）、0 KB 空檔、
舊位置的 daily 檔（audio/w1d1.mp3 → 請搬到 audio/daily/）。
"""
import json, os, time

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
for part, fn, with_q in (('p1', 'photo.json', False), ('p2', 'part2.json', True)):
    exp = {}
    for it in items(fn):
        if not isinstance(it, dict) or not it.get('id') or not isinstance(it.get('pool'), list):
            continue
        i = it['id']
        exp[i] = ([i + '-q.mp3'] if with_q else []) + ['%s-s%02d.mp3' % (i, k + 1) for k in range(len(it['pool']))]
    c, p, o = check(os.path.join(AUD, part), exp, 'audio/' + part)
    out[part] = {'complete': c, 'partial': p, 'orphans': o}
    print('%s：題目 %d，音檔完整 %d，部分 %d，孤兒檔 %d' % (part, len(exp), len(c), len(p), len(o)))

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
for part in ('p1', 'p2', 'daily'):
    for o in out[part]['orphans']:
        warn.append('audio/%s/%s 不屬於任何題目（檔名打錯？）' % (part, o))
for w in warn:
    print('⚠', w)
try:
    input('\n按 Enter 結束')
except EOFError:
    pass
