# -*- coding: utf-8 -*-
"""audio_scan.py — 掃描 audio 資料夾，產生 audio/index.json（本檔放在 audio 資料夾內，雙擊執行）

專案結構：
  index.html / part2.html / daily.html / *.json   ← 網站根目錄（ROOT）
  audio/audio_scan.py                             ← 本檔
  audio/index.json                                ← 本檔產生
  audio/p1/、audio/p2/、audio/p3/、audio/p4/、audio/p5/、audio/p6/、audio/p7/、audio/daily/   ← mp3

預期檔案（由題庫 json 推算）：
  Part 1  audio/p1/{id}-s01.mp3 … -s12.mp3          （part1.json，每題 pool 幾句就幾個檔）
  Part 2  audio/p2/{id}-q.mp3 與 {id}-s01.mp3 …      （part2.json）
  Part 3  audio/p3/{id}-s01.mp3 …                   （part3.json，每句對話一檔，依 dialogue 句數）
  Part 4  audio/p4/{id}.mp3                          （part4.json，整段獨白一個檔，不分句）
  Part 5  audio/p5/{id}.mp3                         （part5.json，一題一檔，朗讀答案填入的完整句；say 欄位若有則朗讀 say）
  Part 6  audio/p6/{id}.mp3                         （part6.json，一篇一檔，朗讀答案填入的整篇；say 欄位若有則朗讀 say）
  Part 7  audio/p7/{id}-d{k}.mp3                    （part7.json，每份需朗讀的文件一檔，k 從 1 起＝docs 順序；form/invoice/schedule/table 或 read:false 的文件不需要）
  Daily   audio/daily/w1d1.mp3（或題目的 audio 欄位）  （daily.json，整篇一個檔）
  字母    audio/A.mp3 … E.mp3（Part 1／2 共用，大寫檔名；Part 1 需 A–D、Part 2 需 A–C 到齊，才會在每個選項前先念字母）
整題到齊才列入 complete；網頁只對 complete 的題目用 mp3。
Timing 狀態：依 daily.json 每篇的 passage 與 timing 欄位，判斷 完成／部分／異常／未做，寫進 audio/index.json 的 timing 區塊
  （首頁維護總覽直接讀，不必再下載整份 daily.json），並列出哪幾句沒對到。
TSL 單字總表：比對 daily.json 的單字（vocab、extra_vocab 的單字與詞形），把「總表中已收錄的字」寫成小檔
  vocab_index.json（網站根目錄）。vocab.html 只讀這個小檔，不必每次下載整份 daily.json。需要根目錄有 tsl.js。
另外檢查：孤兒檔（不屬於任何題目，多半是打錯檔名）、檔名大小寫不符（GitHub Pages 區分大小寫）、0 KB 空檔、
舊位置的 daily 檔（audio/w1d1.mp3 → 請搬到 audio/daily/）。
"""
import json, os, re, time, unicodedata

AUD = os.path.dirname(os.path.abspath(__file__))   # audio 資料夾（本檔所在）
ROOT = os.path.dirname(AUD)                        # 網站根目錄（題庫 json 所在）
warn = []


def items(fn):
    p = os.path.join(ROOT, fn)
    if not os.path.exists(p):
        print('找不到 %s，略過' % fn)
        return []
    with open(p, encoding='utf-8-sig') as fh:
        j = json.load(fh)
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
TOT = {}   # 各 Part 的題目總數，給首頁「維護總覽」用

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
    TOT[part] = len(exp)
    print('%s：題目 %d，音檔完整 %d，部分 %d，孤兒檔 %d' % (part, len(exp), len(c), len(p), len(o)))

# Part 3：audio/p3/{id}-s01.mp3 …（每句對話一檔；網頁目前只用對話音檔，題目與選項仍不念）
exp = {}
for it in items('part3.json'):
    if isinstance(it, dict) and it.get('id') and isinstance(it.get('dialogue'), list):
        exp[it['id']] = ['%s-s%02d.mp3' % (it['id'], k + 1) for k in range(len(it['dialogue']))]
c, p, o = check(os.path.join(AUD, 'p3'), exp, 'audio/p3')
out['p3'] = {'complete': c, 'partial': p, 'orphans': o}
TOT['p3'] = len(exp)
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
TOT['p4'] = len(exp)
print('p4：題組 %d，音檔完整 %d，孤兒檔 %d' % (len(exp), len(c), len(o)))

# Part 5：audio/p5/{id}.mp3（一題一檔，朗讀答案填入的完整句；partial 固定為空，保留是為了與其他 Part 相同的讀取方式）
exp = {}
for it in items('part5.json'):
    if isinstance(it, dict) and it.get('id') and isinstance(it.get('sentence'), dict):
        exp[it['id']] = [it['id'] + '.mp3']
c, p, o = check(os.path.join(AUD, 'p5'), exp, 'audio/p5')
out['p5'] = {'complete': c, 'partial': {}, 'orphans': o}
TOT['p5'] = len(exp)
print('p5：題目 %d，音檔完整 %d，缺 %d，孤兒檔 %d' % (len(exp), len(c), len(exp) - len(c), len(o)))

# Part 6：audio/p6/{id}.mp3（一篇一檔，朗讀答案填入的整篇；say 欄位若有則朗讀 say）
exp = {}
for it in items('part6.json'):
    if isinstance(it, dict) and it.get('id') and isinstance(it.get('body'), list):
        exp[it['id']] = [it['id'] + '.mp3']
c, p, o = check(os.path.join(AUD, 'p6'), exp, 'audio/p6')
out['p6'] = {'complete': c, 'partial': {}, 'orphans': o}
TOT['p6'] = len(exp)
print('p6：文章 %d，音檔完整 %d，缺 %d，孤兒檔 %d' % (len(exp), len(c), len(exp) - len(c), len(o)))

# Part 7：audio/p7/{id}-d{k}.mp3（每份需朗讀的文件一檔；k 從 1 起＝docs 順序）
#   與 part7.js 的規則一致：kind 為 form／invoice／schedule／table，或 read 為 false 的文件不朗讀，不需要音檔。
#   p7.complete 列的是「文件鍵 {id}-d{k}」（不是題組 id），part7.js 也是這樣讀；total 以文件數計。
NOAUD7 = ('form', 'invoice', 'schedule', 'table')
exp = {}
for it in items('part7.json'):
    if isinstance(it, dict) and it.get('id') and isinstance(it.get('docs'), list):
        for k, d in enumerate(it['docs']):
            if isinstance(d, dict) and d.get('read') is not False and d.get('kind') not in NOAUD7:
                key = '%s-d%d' % (it['id'], k + 1)
                exp[key] = [key + '.mp3']
c, p, o = check(os.path.join(AUD, 'p7'), exp, 'audio/p7')
out['p7'] = {'complete': c, 'partial': {}, 'orphans': o, 'unit': '份文件'}
TOT['p7'] = len(exp)
print('p7：需朗讀的文件 %d，音檔完整 %d，缺 %d，孤兒檔 %d' % (len(exp), len(c), len(exp) - len(c), len(o)))

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
TOT['daily'] = len(dexp) + len(dcustom)
print('daily：題目 %d，音檔完整 %d，孤兒檔 %d' % (len(dexp) + len(dcustom), len(dc), len(do)))

for part in ('p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'daily'):
    for o in out[part]['orphans']:
        warn.append('audio/%s/%s 不屬於任何題目（檔名打錯？）' % (part, o))
    out[part]['total'] = TOT.get(part, 0)
# ===== Timing 狀態（寫進 audio/index.json 的 "timing"）=====
#   切句規則與 daily_timestamps.py 的 split_sentences 相同（兩邊要一起改）。
#   完成 ok＝每一句都有 timing；部分 partial＝有 timing 但有句子沒對到；
#   異常 bad＝timing 的句子範圍對不上現在的文稿（文稿改過？）或時間順序不對；未做 none＝沒有 timing。
_ABBR = {"mr", "ms", "mrs", "dr", "inc", "co", "ltd", "no", "vs", "st", "jr", "sr"}


def split_sentences(text):
    res, pos = [], 0

    def add(base, a, b, line):
        seg = line[a:b]
        lead = len(seg) - len(seg.lstrip())
        seg = seg.strip()
        if seg:
            res.append((base + a + lead, base + a + lead + len(seg)))
    for line in text.split("\n"):
        seg_start = 0
        for m in re.finditer(r'(?<=[.!?])\s+(?=[A-Z"\'(])', line):
            words = line[seg_start:m.start()].split()
            last = words[-1] if words else ""
            if last.rstrip(".").lower() in _ABBR or re.fullmatch(r"(?:[A-Za-z]\.){2,}", last):
                continue
            add(pos, seg_start, m.start(), line)
            seg_start = m.end()
        add(pos, seg_start, len(line), line)
        pos += len(line) + 1
    return res


def timing_state(it):
    passage = it.get('passage') or ''
    tm = it.get('timing')
    sents = split_sentences(passage)
    if not isinstance(tm, list) or not tm:
        return 'none', '尚未對時'
    sset = set(sents)
    got = []
    for e in tm:
        if not isinstance(e, dict) or not all(k in e for k in ('start', 'end', 'from', 'to')):
            return 'bad', 'timing 格式不完整'
        got.append((e['from'], e['to']))
    if any(g not in sset for g in got):
        return 'bad', 'timing 的句子範圍與現在的文稿對不上（文稿改過？請重新對時）'
    if any(not (e['start'] < e['end']) for e in tm) or any(tm[i]['start'] < tm[i - 1]['start'] for i in range(1, len(tm))):
        return 'bad', 'timing 時間順序異常'
    gset = set(got)
    miss = [i + 1 for i, s in enumerate(sents) if s not in gset]
    if miss:
        return 'partial', '只涵蓋 %d/%d 句，缺第 %s 句' % (len(sents) - len(miss), len(sents), '、'.join(map(str, miss)))
    return 'ok', ''


_t = {'total': 0, 'ok': 0, 'partial': 0, 'bad': 0, 'none': 0, 'todo': []}
for it in items('daily.json'):
    if not isinstance(it, dict) or 'week' not in it or 'day' not in it:
        continue
    s, why = timing_state(it)
    _t['total'] += 1
    _t[s] += 1
    if s != 'ok':
        _t['todo'].append({'id': 'w%sd%s' % (it['week'], it['day']), 'tag': it.get('tag', ''), 's': s, 'why': why})
out['timing'] = _t
print('timing：共 %d 篇，完成 %d，部分 %d，異常 %d，未做 %d' % (_t['total'], _t['ok'], _t['partial'], _t['bad'], _t['none']))
for x in _t['todo']:
    print('  %s %s：%s' % (x['id'], {'partial': '部分', 'bad': '異常', 'none': '未做'}[x['s']], x['why']))

out['warn'] = warn   # 首頁「維護總覽」會顯示這些警告

os.makedirs(AUD, exist_ok=True)
with open(os.path.join(AUD, 'index.json'), 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print('\n已寫入 audio/index.json')
for w in warn:
    print('⚠', w)
# ===== TSL 單字總表索引：vocab_index.json（網站根目錄）=====
#   做法與 index.json 相同：先在本機掃描好，網頁只讀結果。
#   比對對象：daily.json 每篇的 vocab[].word、extra_vocab 的單字（type=word）及其 forms[].w；
#   拼字比對（小寫、去重音符號），不推測詞形變化。
def norm(s):
    s = unicodedata.normalize('NFD', str(s or '').lower())
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').strip()

tsl_path = os.path.join(ROOT, 'tsl.js')
tsl = None
if os.path.exists(tsl_path):
    m = re.search(r'TSL_WORDS\s*=\s*\("(.*?)"\)\.split', open(tsl_path, encoding='utf-8').read(), re.S)
    if m:
        tsl = [norm(w) for w in m.group(1).split(',') if w.strip()]
if not tsl:
    print('\n找不到 tsl.js 或格式不符，略過 vocab_index.json（請把 tsl.js 放在網站根目錄）')
else:
    tset = set(tsl)
    learned = {}

    def add(word, w, d):
        k = norm(word)
        if k in tset and k not in learned:
            learned[k] = [w, d]
    for it in items('daily.json'):
        if not isinstance(it, dict) or 'week' not in it or 'day' not in it:
            continue
        w, d = it['week'], it['day']
        for v in it.get('vocab') or []:
            if isinstance(v, dict):
                add(v.get('word'), w, d)
        for e in it.get('extra_vocab') or []:
            if isinstance(e, dict) and e.get('type', 'word') == 'word':
                add(e.get('text'), w, d)
                for f in e.get('forms') or []:
                    if isinstance(f, dict):
                        add(f.get('w'), w, d)
    vi = {'v': int(time.time()), 'total': len(tsl), 'have': len(learned), 'tsl': dict(sorted(learned.items()))}
    with open(os.path.join(ROOT, 'vocab_index.json'), 'w', encoding='utf-8') as f:
        json.dump(vi, f, ensure_ascii=False, separators=(',', ':'))
    print('\nTSL 單字總表：已收錄 %d / %d 字，還缺 %d 字 → 已寫入 vocab_index.json' % (len(learned), len(tsl), len(tsl) - len(learned)))

try:
    input('\n按 Enter 結束')
except EOFError:
    pass
