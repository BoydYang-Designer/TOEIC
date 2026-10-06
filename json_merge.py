#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TOEIC Coach ─ 題庫合併工具（daily / photo / part2 / part3 / part4 / part5 / part6 / part7 共用）

用法：把這支程式放在 daily.json、part1.json、part2.json、part3.json、part4.json、part5.json、part6.json、part7.json 所在的資料夾，雙擊執行。
  1. 最上方選擇題庫：每日文章（daily.json）／Part 1 照片（part1.json）／Part 2 應答（part2.json）／Part 3 對話（part3.json）／Part 4 獨白（part4.json）／Part 5 填空（part5.json）／Part 6 段落填空（part6.json）／Part 7 閱讀理解（part7.json）。
     啟動時會自動選「資料夾內等待合併的副檔最多」的那一個；也可用  python json_merge.py part2  直接指定。
  2. 自動列出該題庫的副檔：
       daily  → w1d3.json 這類（其他 .json 也會列出，但不會自動勾選）
                也支援「補丁」副檔 w1d3_extra.json：只含 week、day、extra_vocab（網頁「入庫彙整」產生的提示詞，AI 回傳的詳解），
                會把 extra_vocab 併進主檔該篇文章（同一個 text 取代舊的、其餘新增），不動文章的其他欄位。
       photo  → d1-002-m.json 這類（檔名是題目 id）
       part2  → p2_d1-001-h_x5.json 這類（網頁「新增題目」產生的檔名）
       part3  → p3_d1-002-m_x2.json 這類（網頁「新增題目」產生的檔名）
       part4  → p4_d1-002-m_x2.json 這類（網頁「新增題目」產生的檔名）
       part5  → p5_d1-002-m_x3.json 這類（網頁「新增題目」產生的檔名）
       part6  → p6_d1-002-m_x2.json 這類（網頁「新增題目」產生的檔名）
       part7  → p7_d1-002-m_x2.json 這類（網頁「新增題目」產生的檔名）
     找不到的可用「新增檔案…」手動加入。
  3. 選取要合併的副檔（可多選：Ctrl / Shift）→「合併」→ 確認 → 寫回主檔（寫入前自動備份到 backup 資料夾）。
副檔可以是：單筆題目、題目陣列、或含 items 的物件；AI 貼出的 ```json 圍欄也能自動處理。
選錯題庫時（例如把 part2 的檔案放在 daily 模式），會直接提示「這是哪個題庫的題目」。
"""
import copy
import difflib
import json
import os
import re
import shutil
import sys
import traceback
from datetime import datetime

BASE = os.path.dirname(os.path.abspath(__file__))
ID_RE = re.compile(r'^d([1-7])-(\d{3})-([emh])$')
TIER = {'e': 'easy', 'm': 'medium', 'h': 'hard'}
TIER_ZH = {'easy': '初級', 'medium': '中級', 'hard': '高級'}
TIER_RANGE = {'easy': (500, 550), 'medium': (600, 650), 'hard': (700, 800)}
DEFAULT_SCENES = {'d1': ['office'], 'd2': ['restaurant'], 'd3': ['store'], 'd4': ['street', 'station'],
                  'd5': ['workplace'], 'd6': ['hotel', 'home'], 'd7': ['outdoor']}


# ───────────────────────── 共用工具 ─────────────────────────

def read_json(path):
    """讀取 JSON，回傳 (資料, 錯誤訊息)。容許 UTF-8 BOM 與 ```json 圍欄。"""
    with open(path, 'r', encoding='utf-8-sig') as f:
        text = f.read()
    try:
        return json.loads(text), None
    except json.JSONDecodeError as first:
        err = first
    t = text.strip()
    if t.startswith('```'):
        t = re.sub(r'^```[a-zA-Z]*\s*\n', '', t)
        t = re.sub(r'\n?```\s*$', '', t)
        try:
            return json.loads(t), None
        except json.JSONDecodeError as second:
            err = second
    return None, 'JSON 語法錯誤（第 %d 行、第 %d 欄）：%s' % (err.lineno, err.colno, err.msg)


def split_main(data):
    if isinstance(data, list):
        return data, None
    if isinstance(data, dict) and isinstance(data.get('items'), list):
        return data['items'], None
    return None, '主檔格式不正確（需為陣列，或含 items 陣列的物件）'


def domains_of(data):
    """主題對照：以主檔 _spec.domains 為準，沒有就用預設。"""
    d = data.get('_spec', {}).get('domains') if isinstance(data, dict) else None
    if isinstance(d, dict) and d:
        return {k: list(v.get('scenes', [])) for k, v in d.items() if isinstance(v, dict)}
    return DEFAULT_SCENES


def norm(s):
    return re.sub(r'[^a-z0-9 ]', '', str(s).lower()).strip()


def n_words(s):
    return len(re.findall(r"[A-Za-z0-9']+", str(s)))


def cefr_of_score(s):
    return 'A2+' if s <= 550 else 'B1' if s == 600 else 'B1+' if s == 650 else 'B2' if s <= 750 else 'B2+'


def similar(a, b, th=0.85):
    """兩句（已 norm）是否相同或雷同。"""
    if not a or not b:
        return False
    if a == b:
        return True
    sm = difflib.SequenceMatcher(None, a, b)
    return sm.real_quick_ratio() >= th and sm.quick_ratio() >= th and sm.ratio() >= th


def sort_key_id(e):
    m = ID_RE.match(str(e.get('id') if isinstance(e, dict) else ''))
    return (int(m.group(1)), int(m.group(2)), 'emh'.index(m.group(3))) if m else (99, 0, 0)


def build_index(items):
    """把主檔題目建成索引，檢查 tag／vocab／句子／圖片／問句重複時用。"""
    idx = {'tag': {}, 'vocab': {}, 'pool': {}, 'image': {}, 'q': []}
    for o in items:
        if not isinstance(o, dict):
            continue
        i = o.get('id')
        t = str(o.get('tag') or '').strip()
        if t:
            idx['tag'].setdefault(t, set()).add(i)
        if o.get('image'):
            idx['image'].setdefault(o['image'], set()).add(i)
        for v in o.get('vocab') or []:
            if isinstance(v, dict) and v.get('word'):
                idx['vocab'].setdefault(norm(v['word']), set()).add(i)
        for p in o.get('pool') or []:
            if isinstance(p, dict) and p.get('t'):
                idx['pool'].setdefault(norm(p['t']), set()).add(i)
        q = o.get('q')
        if isinstance(q, dict) and isinstance(q.get('t'), str):
            idx['q'].append((i, q['t'], norm(q['t'])))
    return idx


def others_of(table, key, self_id):
    return sorted(str(x) for x in table.get(key, ()) if x != self_id)


def check_level(e, suffix, er, wa):
    """photo / part2 共用的 level 檢查。"""
    lv = e.get('level')
    if not isinstance(lv, dict):
        er.append('缺少 level')
        return
    sc = lv.get('score')
    if not isinstance(sc, int) or isinstance(sc, bool):
        er.append('level.score 必須是整數')
    elif sc % 50:
        wa.append('level.score 建議為 50 的倍數')
    if lv.get('tier') != TIER[suffix]:
        er.append('level.tier 必須等於 id 尾碼（%s → %s），目前是 %r' % (suffix, TIER[suffix], lv.get('tier')))
    elif isinstance(sc, int) and not isinstance(sc, bool):
        lo, hi = TIER_RANGE[lv['tier']]
        if not lo <= sc <= hi:
            er.append('level.score %d 不在%s的範圍 %d–%d（初級 500–550、中級 600–650、高級 700–800）' % (
                sc, TIER_ZH[lv['tier']], lo, hi))
        elif lv.get('cefr') and lv['cefr'] != cefr_of_score(sc):
            wa.append('level.cefr 建議為 %s（score %d），目前是 %s' % (cefr_of_score(sc), sc, lv['cefr']))
    for k in ('cefr', 'why'):
        if not lv.get(k):
            wa.append('level.%s 是空的' % k)


def check_vocab(e, blob, ctx, er, wa, lo=2, hi=4):
    """photo / part2 共用的 vocab 檢查。blob = 單字應出現的文字（已 norm）。"""
    vocab = e.get('vocab')
    if not isinstance(vocab, list) or not vocab:
        er.append('缺少 vocab')
        return
    if not lo <= len(vocab) <= hi:
        wa.append('vocab 有 %d 個（建議 %d–%d 個）' % (len(vocab), lo, hi))
    seen = set()
    for i, v in enumerate(vocab, 1):
        if not isinstance(v, dict):
            er.append('vocab 第 %d 項不是物件' % i)
            continue
        miss = [k for k in ('word', 'ipa', 'pos', 'col', 'zh') if not str(v.get(k) or '').strip()]
        if miss:
            er.append('vocab 第 %d 項缺少：%s' % (i, ', '.join(miss)))
            continue
        w = norm(v['word'])
        stem = w if ' ' in w else re.sub(r'e$', '', w)
        if blob and not re.search(r'\b' + re.escape(stem), blob):
            wa.append('單字「%s」沒有出現在題目的句子中' % v['word'])
        if w in seen:
            wa.append('單字「%s」在本題重複' % v['word'])
        seen.add(w)
        dup = others_of(ctx['idx']['vocab'], w, e.get('id'))
        if dup:
            wa.append('單字「%s」與其他題目重複：%s' % (v['word'], '、'.join(dup[:5])))


def check_pool_common(e, ctx, er, wa, trap_ok, wmin, wmax, pattern_ok=None):
    """photo / part2 共用的 pool 檢查。回傳 pool 句子（已 norm）。"""
    pool = e.get('pool')
    texts = []
    if not isinstance(pool, list) or len(pool) != 12:
        er.append('pool 必須剛好 12 句（目前 %s）' % (len(pool) if isinstance(pool, list) else '沒有'))
        return texts
    n_ok, kinds, patterns = 0, set(), []
    for i, p in enumerate(pool, 1):
        if not isinstance(p, dict) or not str(p.get('t') or '').strip() or not isinstance(p.get('ok'), bool):
            er.append('pool 第 %d 句格式不對（需要 t 與 ok:true/false）' % i)
            continue
        texts.append(norm(p['t']))
        if p['ok']:
            n_ok += 1
            if p.get('trap') != 'correct':
                er.append("pool 第 %d 句 ok:true，trap 應為 'correct'" % i)
            if not str(p.get('why', '')).startswith('正解：'):
                wa.append("pool 第 %d 句（正解）的 why 建議以「正解：」開頭" % i)
            if pattern_ok is not None:
                if p.get('pattern') not in pattern_ok:
                    wa.append('pool 第 %d 句（正解）pattern %r 不在合法值（%s）' % (i, p.get('pattern'), '、'.join(pattern_ok)))
                patterns.append(p.get('pattern'))
        elif p.get('trap') not in trap_ok:
            er.append('pool 第 %d 句 trap 不合法：%r' % (i, p.get('trap')))
        else:
            kinds.add(p['trap'])
        if not str(p.get('zh') or '').strip():
            wa.append('pool 第 %d 句缺少 zh' % i)
        if not str(p.get('why') or '').strip():
            wa.append('pool 第 %d 句缺少 why' % i)
        if not wmin <= n_words(p['t']) <= wmax:
            wa.append('pool 第 %d 句有 %d 個字（建議 %d–%d）' % (i, n_words(p['t']), wmin, wmax))
    if n_ok != 3:
        er.append('pool 必須 3 句 ok:true、9 句 ok:false（目前 ok:true 有 %d 句）' % n_ok)
    if len(set(texts)) != len(texts):
        er.append('pool 裡有重複的句子')
    if pattern_ok is not None:
        e['_patterns'] = patterns   # 暫存給呼叫端，之後會移除
    if n_ok == 3 and len(kinds) < 4 and pattern_ok is not None:
        wa.append('錯誤句只涵蓋 %d 種 trap（建議 4 種以上）' % len(kinds))
    dup = sorted({o for t in texts for o in others_of(ctx['idx']['pool'], t, e.get('id'))})
    if dup:
        wa.append('有句子與既有題目重複：%s' % '、'.join(dup))
    return texts


# ───────────────────────── 題庫設定（三種題庫的差異都在這裡） ─────────────────────────

class Profile(object):
    name = ''            # daily / photo / part2
    title = ''           # 介面顯示名稱
    main_name = ''       # 主檔檔名
    backup_prefix = ''
    has_dups = False     # 是否要做「問句雷同」人工確認（part2）
    empty_hint = ''
    done_note = ''

    # 題目身分
    def key(self, e):
        raise NotImplementedError

    def label_of(self, e):
        return str(self.key(e))

    def fmt_key(self, k):
        return str(k)

    def key_sort(self, k):
        return k

    def describe(self, e):
        return str(e.get('tag', '')) if isinstance(e, dict) else ''

    # 檔案
    def get_entries(self, data):
        raise NotImplementedError

    def is_candidate(self, fname):
        return True

    def is_auto(self, fname):
        return False

    # 檢查
    def make_ctx(self, items, data):
        return {}

    def validate(self, e, ctx):
        return [], []

    def extra_detail(self, e):
        return []

    def find_dups(self, e, refs):
        return []

    # 合併
    def same_content(self, a, b):
        return a == b

    def finalize(self, e, old):
        pass

    def sort_items(self, items):
        pass


class IdProfile(Profile):
    """photo、part2：以 id 為鍵。"""

    def key(self, e):
        return e.get('id') if isinstance(e, dict) else None

    def label_of(self, e):
        return str(self.key(e) or '（無 id）')

    def key_sort(self, k):
        return sort_key_id({'id': k})

    def get_entries(self, data):
        if isinstance(data, list):
            return data, None
        if isinstance(data, dict):
            if isinstance(data.get('items'), list):
                return data['items'], None
            if 'id' in data:
                return [data], None
        return None, '不是題庫資料（需為單一題目物件、題目陣列，或含 items 的物件）'

    def sort_items(self, items):
        items.sort(key=sort_key_id)


# ───── daily ─────

class Daily(Profile):
    name = 'daily'
    title = '每日文章'
    main_name = 'daily.json'
    backup_prefix = 'daily'
    name_re = re.compile(r'^w(\d+)d(\d+)', re.I)
    empty_hint = '資料夾內沒有找到其他 .json 檔。\n請按「新增檔案…」手動選取，例如 w1d3.json。'
    done_note = '記得把對應的 mp3 放進 audio 資料夾（例如 audio/w1d3.mp3），並完成 timing 對時。（若合併的是 _extra 補丁，重新整理網頁即可看到詳解。）'
    XTYPES = ('word', 'phrase', 'sentence')

    @staticmethod
    def is_patch(e):
        """補丁：只有 week／day／extra_vocab，沒有文章本體。"""
        return isinstance(e, dict) and 'extra_vocab' in e and not any(k in e for k in ('passage', 'questions', 'vocab', 'zh', 'tag'))

    @staticmethod
    def xkey(v):
        return re.sub(r'\s+', ' ', str(v.get('text') if isinstance(v, dict) else v or '').strip().lower())

    def key(self, e):
        return (e.get('week'), e.get('day')) if isinstance(e, dict) else (None, None)

    def label_of(self, e):
        if isinstance(e, dict) and isinstance(e.get('week'), int) and isinstance(e.get('day'), int):
            return 'W%d D%d' % (e['week'], e['day'])
        return '（無 week/day）'

    def fmt_key(self, k):
        return 'W%dD%d' % k if all(isinstance(x, int) for x in k) else str(k)

    def key_sort(self, k):
        return tuple(x if isinstance(x, int) else 0 for x in k)

    def get_entries(self, data):
        if isinstance(data, list):
            return data, None
        if isinstance(data, dict):
            for k in ('items', 'week_entries', 'entries'):
                if isinstance(data.get(k), list):
                    return data[k], None
            if 'week' in data and 'day' in data:
                return [data], None
        return None, '不是題庫資料（需為單筆題目、題目陣列，或含 items 的物件）'

    def is_candidate(self, fname):
        stem = os.path.splitext(fname)[0]
        return not ID_RE.match(stem) and not fname.lower().startswith('p2_')

    def is_auto(self, fname):
        return bool(self.name_re.match(fname))

    def same_content(self, a, b):
        """不比對 timing（主檔的 timing 通常已對時、副檔是空的）。補丁：每一筆都已經在主檔且內容相同才算「相同」。"""
        if self.is_patch(b):
            old = {self.xkey(v): v for v in (a.get('extra_vocab') or []) if isinstance(v, dict)}
            return isinstance(a, dict) and all(self.xkey(v) in old and old[self.xkey(v)] == v for v in b['extra_vocab'])
        strip = lambda e: {k: v for k, v in e.items() if k != 'timing'}
        return isinstance(a, dict) and isinstance(b, dict) and strip(a) == strip(b)

    def finalize(self, e, old):
        if self.is_patch(e):   # 補丁：把 extra_vocab 併進舊文章（同 text 取代、其餘新增），e 整個換成合併後的文章
            merged = copy.deepcopy(old)
            cur = list(merged.get('extra_vocab') or [])
            for nv in e['extra_vocab']:
                k = self.xkey(nv)
                i = next((j for j, o in enumerate(cur) if self.xkey(o) == k), None)
                if i is None:
                    cur.append(nv)
                else:
                    cur[i] = nv
            merged['extra_vocab'] = cur
            e.clear()
            e.update(merged)
            return
        if old and 'extra_vocab' not in e and old.get('extra_vocab'):
            e['extra_vocab'] = old['extra_vocab']   # 整篇重新合併時，保留已寫回的詳解
        e.setdefault('timing', [])
        if old and not e['timing'] and old.get('passage') == e.get('passage'):
            e['timing'] = old.get('timing', [])   # 文稿沒變 → 保留舊的對時資料

    def sort_items(self, items):
        if all(isinstance(x, dict) and isinstance(x.get('week'), int) and isinstance(x.get('day'), int) for x in items):
            items.sort(key=lambda x: (x['week'], x['day']))

    def make_ctx(self, items, data):
        return {'passages': {self.key(x): str(x.get('passage') or '') for x in items if isinstance(x, dict)}}

    def extra_detail(self, e):
        if self.is_patch(e):
            xs = e.get('extra_vocab')
            return ['     補丁：extra_vocab %d 筆' % (len(xs) if isinstance(xs, list) else 0)]
        if isinstance(e, dict) and isinstance(e.get('questions'), list):
            return ['     題數 %d、單字 %d、type %s' % (len(e['questions']), len(e.get('vocab') or []), e.get('type'))]
        return []

    def validate_patch(self, e, ctx):
        er, wa = [], []
        for k in ('week', 'day'):
            if not isinstance(e.get(k), int) or isinstance(e.get(k), bool):
                er.append('%s 必須是整數' % k)
        passages = ctx.get('passages') or {}
        key = self.key(e)
        if not er and key not in passages:
            er.append('主檔沒有 W%dD%d，補丁無處可合（請先合併該篇文章）' % key)
        xs = e.get('extra_vocab')
        if not isinstance(xs, list) or not xs:
            er.append('extra_vocab 必須是非空陣列')
            return er, wa
        passage = passages.get(key, '').lower()
        seen = set()
        for i, v in enumerate(xs, 1):
            if not isinstance(v, dict):
                er.append('extra_vocab 第 %d 項不是物件' % i)
                continue
            t = str(v.get('text') or '').strip()
            if not t:
                er.append('extra_vocab 第 %d 項缺少 text' % i)
                continue
            if v.get('type') not in self.XTYPES:
                er.append("「%s」type 必須是 word／phrase／sentence" % t)
                continue
            k = self.xkey(v)
            if k in seen:
                er.append('「%s」在這個檔案裡重複' % t)
            seen.add(k)
            if not str(v.get('zh') or '').strip():
                er.append('「%s」缺少 zh' % t)
            if passage and t.lower() not in passage:
                wa.append('「%s」沒有出現在文章裡（網頁無法畫底線；請確認 text 是照抄）' % t)
            ex = v.get('examples')
            if ex is not None and (not isinstance(ex, list) or not all(isinstance(o, dict) and str(o.get('en') or '').strip() for o in ex)):
                er.append('「%s」examples 每一項需含 en（zh 建議也寫）' % t)
            elif v['type'] in ('word', 'phrase') and (not ex or len(ex) < 2):
                wa.append('「%s」例句少於 2 句' % t)
            if v['type'] == 'word' and not (v.get('ipa') and v.get('pos')):
                wa.append('「%s」缺少 ipa 或 pos' % t)
            if v['type'] == 'sentence' and not (v.get('structure') or v.get('grammar')):
                wa.append('「%s」沒有 structure／grammar' % t)
            for lk in ('forms', 'family', 'confusable', 'similar', 'grammar', 'key_words'):
                if lk in v and not isinstance(v[lk], list):
                    er.append('「%s」%s 必須是陣列' % (t, lk))
        return er, wa

    def validate(self, e, ctx):
        er, wa = [], []
        if not isinstance(e, dict):
            return ['內容不是物件'], wa
        if self.is_patch(e):
            return self.validate_patch(e, ctx)
        filename, single = ctx.get('name'), ctx.get('single')

        for k in ('week', 'day'):
            if not isinstance(e.get(k), int) or isinstance(e.get(k), bool):
                er.append('%s 必須是整數' % k)
        if isinstance(e.get('day'), int) and not 1 <= e['day'] <= 7:
            er.append('day 必須介於 1–7')
        if not str(e.get('tag') or '').strip():
            er.append('缺少 tag')
        if e.get('type') not in ('Reading', 'Listening'):
            er.append("type 必須是 'Reading' 或 'Listening'")
        for k in ('passage', 'zh'):
            if not str(e.get(k) or '').strip():
                er.append('缺少 %s' % k)

        if filename and single:
            m = self.name_re.match(filename)
            if m and (int(m.group(1)), int(m.group(2))) != self.key(e):
                wa.append('檔名是 w%sd%s，但內容是 week %s／day %s' % (m.group(1), m.group(2), e.get('week'), e.get('day')))

        lv = e.get('level')
        if not isinstance(lv, dict):
            wa.append('缺少 level')
        else:
            if not isinstance(lv.get('score'), int):
                wa.append('level.score 應為整數')
            elif lv['score'] % 5:
                wa.append('level.score 建議為 5 的倍數')
            if not re.match(r'^\d+-\d+$', str(lv.get('range', ''))):
                wa.append("level.range 格式應為 '600-700'")
            for k in ('cefr', 'why'):
                if not lv.get(k):
                    wa.append('level.%s 是空的' % k)

        vocab = e.get('vocab')
        passage = str(e.get('passage') or '')
        if not isinstance(vocab, list) or not vocab:
            er.append('缺少 vocab')
        else:
            if not 3 <= len(vocab) <= 6:
                wa.append('vocab 有 %d 個（建議 3–6 個）' % len(vocab))
            for i, v in enumerate(vocab, 1):
                if not isinstance(v, dict):
                    er.append('vocab 第 %d 項不是物件' % i)
                    continue
                miss = [k for k in ('word', 'ipa', 'pos', 'col', 'zh') if not str(v.get(k) or '').strip()]
                if miss:
                    er.append('vocab 第 %d 項缺少：%s' % (i, ', '.join(miss)))
                    continue
                w = v['word'].strip()
                stem = w if re.search(r'\s', w) else re.sub(r'e$', '', w, flags=re.I)
                if not re.search(r'\b' + re.escape(stem), passage, re.I):
                    wa.append('單字「%s」沒有出現在 passage，網頁無法標示' % w)

        qs = e.get('questions')
        if not isinstance(qs, list) or not qs:
            er.append('缺少 questions')
        else:
            if not 4 <= len(qs) <= 10:
                wa.append('共 %d 題（建議 4–10 題）' % len(qs))
            seen_part5 = False
            for i, q in enumerate(qs, 1):
                if not isinstance(q, dict):
                    er.append('第 %d 題不是物件' % i)
                    continue
                if q.get('kind') not in ('context', 'part5'):
                    er.append("第 %d 題 kind 必須是 'context' 或 'part5'" % i)
                if not str(q.get('q') or '').strip():
                    er.append('第 %d 題缺少題目 q' % i)
                opts, why, ans = q.get('opts'), q.get('why'), q.get('ans')
                if not isinstance(opts, list) or len(opts) != 4:
                    er.append('第 %d 題 opts 必須剛好 4 個' % i)
                if not isinstance(ans, int) or isinstance(ans, bool) or not 0 <= ans <= 3:
                    er.append('第 %d 題 ans 必須是 0–3 的整數' % i)
                if not isinstance(why, list) or len(why) != 4:
                    er.append('第 %d 題 why 必須剛好 4 句' % i)
                if q.get('kind') == 'part5':
                    seen_part5 = True
                    if not re.search(r'_{3,}', str(q.get('q', ''))):
                        wa.append("第 %d 題（part5）題目沒有 '______' 空格" % i)
                elif q.get('kind') == 'context' and seen_part5:
                    wa.append('第 %d 題 context 排在 part5 之後（建議先 context 後 part5）' % i)
            answers = [q.get('ans') for q in qs if isinstance(q, dict) and isinstance(q.get('ans'), int)]
            if len(answers) >= 4 and len(set(answers)) == 1:
                wa.append('所有題目的正解位置都相同')

        pp = e.get('presentation_phrases')
        if e.get('day') == 7 and not pp:
            wa.append('D7 建議附 presentation_phrases')
        if pp is not None:
            if not isinstance(pp, list):
                er.append('presentation_phrases 必須是陣列')
            else:
                for i, p in enumerate(pp, 1):
                    if not isinstance(p, dict) or not all(str(p.get(k) or '').strip() for k in ('phrase', 'meaning', 'usage')):
                        er.append('presentation_phrases 第 %d 項需含 phrase / meaning / usage' % i)

        if 'timing' not in e:
            wa.append('沒有 timing，合併時會補上空陣列（需另外對時）')
        elif not isinstance(e['timing'], list):
            er.append('timing 必須是陣列')
        elif not e['timing']:
            wa.append('timing 是空的（尚未對時，網頁只會顯示純文字文稿）')
        return er, wa


# ───── photo ─────

class Photo(IdProfile):
    name = 'photo'
    title = 'Part 1 照片'
    main_name = 'part1.json'
    backup_prefix = 'photo'
    PHOTO_TYPES = ('single', 'multi', 'none')
    TRAPS = ('sound-alike', 'not-in-photo', 'wrong-action', 'wrong-place-or-number', 'over-inference')
    OLD_FIELDS = ('focus', 'set', 'no', 'ans', 'statements', 'zh', 'why', 'traps', 'audio')
    empty_hint = '資料夾內沒有找到副檔。\n請把 AI 回傳的 JSON 存成 d1-002-m.json 這類檔名放進來，或按「新增檔案…」手動選取。'
    done_note = '記得把對應的圖片放進 images 資料夾，並重新整理網頁。'

    def is_candidate(self, fname):
        return bool(ID_RE.match(os.path.splitext(fname)[0]))

    def is_auto(self, fname):
        return self.is_candidate(fname)

    def make_ctx(self, items, data):
        return {'domains': domains_of(data), 'base': BASE, 'idx': build_index(items)}

    def validate(self, e, ctx):
        er, wa = [], []
        if not isinstance(e, dict):
            return ['內容不是物件'], wa
        if 'skip' in e:
            return ['AI 回報寫不出這個難度，不應合併：%s' % e.get('skip')], wa
        m = ID_RE.match(str(e.get('id', '')))
        if not m:
            return ['id 格式必須是 d{1-7}-{3 位數}-{e|m|h}，例如 d1-002-m'], wa
        dom, suffix, me = 'd' + m.group(1), m.group(3), e['id']
        idx = ctx['idx']

        if e.get('domain') != dom:
            er.append('domain 應為 %s（要等於 id 前段），目前是 %r' % (dom, e.get('domain')))
        scenes = ctx['domains'].get(dom, [])
        if e.get('scene') not in scenes:
            er.append('scene %r 不屬於 %s（可用：%s）' % (e.get('scene'), dom, '、'.join(scenes)))
        if e.get('photo_type') not in (None, '') and e.get('photo_type') not in self.PHOTO_TYPES:
            er.append('photo_type 若有填，必須是 %s（依圖片實際人數）' % ' / '.join(self.PHOTO_TYPES))
        if not str(e.get('tag') or '').strip():
            er.append('缺少 tag')
        check_level(e, suffix, er, wa)

        img = e.get('image')
        if not isinstance(img, str) or not re.match(r'^images/.+\.jpg$', img):
            er.append('image 必須是 images/xxx.jpg 的路徑')
        else:
            if img != 'images/%s.jpg' % me:
                wa.append('image 建議為 images/%s.jpg（目前是 %s）' % (me, img))
            share = others_of(idx['image'], img, me)
            if share:
                wa.append('與 %s 共用同一張圖片；每題應各有獨立的圖' % '、'.join(share))
            if not os.path.isfile(os.path.join(ctx['base'], img)):
                wa.append('找不到圖片檔 %s（記得放進 images 資料夾）' % img)

        texts = check_pool_common(e, ctx, er, wa, self.TRAPS, 6, 14)
        check_vocab(e, ' '.join(texts), ctx, er, wa)

        tag = str(e.get('tag') or '').strip()
        if tag and others_of(idx['tag'], tag, me):
            wa.append('tag「%s」與其他題目相同' % tag)
        old = [k for k in self.OLD_FIELDS if k in e]
        if old:
            wa.append('含舊欄位（網頁不使用）：%s' % '、'.join(old))
        if 'issues' not in e:
            wa.append('沒有 issues 欄位（無瑕疵請填 []）')
        elif e['issues']:
            wa.append('圖片備註：%s' % '；'.join(map(str, e['issues'])))
        return er, wa


# ───── part2 ─────

class Part2(IdProfile):
    name = 'part2'
    title = 'Part 2 應答'
    main_name = 'part2.json'
    backup_prefix = 'part2'
    has_dups = True
    QTYPES = ('q1', 'q2', 'q3', 'q4', 'q5', 'q6')
    WH = ('who', 'what', 'which', 'when', 'where', 'why', 'how')
    TRAPS = ('sound-alike', 'word-repeat', 'wrong-wh', 'association', 'wrong-tense-person')
    PATTERNS = {'q1': ('direct', 'indirect', 'unsure'), 'q2': ('direct', 'indirect', 'unsure'),
                'q3': ('pick-one', 'both-either-neither', 'third-option', 'no-preference'),
                'q4': ('confirm', 'correct', 'indirect'),
                'q5': ('respond', 'offer-help', 'question-back', 'emotion'),
                'q6': ('accept', 'decline', 'ask-detail')}
    empty_hint = ('資料夾內沒有找到副檔。\n請把網頁「新增題目」產生的檔案（例如 p2_d1-001-h_x5.json）放進來，'
                  '或按「新增檔案…」手動選取。')
    done_note = '合併後重新整理網頁，題數就會更新。若有整題 mp3，請放進 audio 資料夾；沒有音檔時網頁會用機器發音。'

    def is_candidate(self, fname):
        return fname.lower().startswith('p2_')

    def is_auto(self, fname):
        return self.is_candidate(fname)

    def describe(self, e):
        q = e.get('q') if isinstance(e, dict) else None
        return q.get('t', '') if isinstance(q, dict) else ''

    def make_ctx(self, items, data):
        spec = data.get('_spec') if isinstance(data, dict) and isinstance(data.get('_spec'), dict) else {}
        qt = spec.get('qtypes') if isinstance(spec.get('qtypes'), dict) else {}
        pats = {q: tuple(v.get('patterns') or self.PATTERNS.get(q, ())) for q, v in qt.items() if isinstance(v, dict)}
        for q, v in self.PATTERNS.items():
            pats.setdefault(q, v)
        traps = [k for k in (spec.get('traps') or {}) if k != 'correct'] or list(self.TRAPS)
        return {'domains': domains_of(data), 'idx': build_index(items), 'patterns': pats, 'traps': traps}

    def find_dups(self, e, refs):
        q = e.get('q') if isinstance(e, dict) else None
        if not isinstance(q, dict) or not isinstance(q.get('t'), str):
            return []
        me, n = self.key(e), norm(q['t'])
        return [(i, t) for i, t in refs if i != me and similar(n, norm(t))]

    def extra_detail(self, e):
        if isinstance(e, dict) and isinstance(e.get('q'), dict):
            extra = (' · ' + str(e['wh'])) if e.get('wh') else ''
            return ['     %s%s｜Q：%s' % (e.get('qtype', ''), extra, e['q'].get('t', ''))]
        return []

    def validate(self, e, ctx):
        er, wa = [], []
        if not isinstance(e, dict):
            return ['內容不是物件'], wa
        if 'skip' in e:
            return ['AI 回報寫不出這個難度，不應合併：%s' % e.get('skip')], wa
        m = ID_RE.match(str(e.get('id', '')))
        if not m:
            return ['id 格式必須是 d{1-7}-{3 位數}-{e|m|h}，例如 d1-002-h'], wa
        dom, suffix, me = 'd' + m.group(1), m.group(3), e['id']
        idx = ctx['idx']

        if e.get('domain') != dom:
            er.append('domain 應為 %s（要等於 id 前段），目前是 %r' % (dom, e.get('domain')))
        scenes = ctx['domains'].get(dom, [])
        if e.get('scene') not in scenes:
            er.append('scene %r 不屬於 %s（可用：%s）' % (e.get('scene'), dom, '、'.join(scenes)))
        if not str(e.get('tag') or '').strip():
            er.append('缺少 tag')
        check_level(e, suffix, er, wa)

        qt = e.get('qtype')
        if qt not in self.QTYPES:
            er.append('qtype 必須是 q1–q6，目前是 %r' % qt)
        wh = e.get('wh')
        if qt == 'q1':
            if wh not in self.WH:
                er.append('q1 必須填 wh（%s），目前是 %r' % ('／'.join(self.WH), wh))
        elif wh not in (None, ''):
            wa.append('wh 只有 q1 需要填')

        q = e.get('q')
        qtext = ''
        if not isinstance(q, dict) or not isinstance(q.get('t'), str) or not q['t'].strip():
            er.append('缺少問句 q.t')
        else:
            qtext = q['t'].strip()
            if not str(q.get('zh') or '').strip():
                wa.append('q 缺少 zh')
            n = n_words(qtext)
            if not 5 <= n <= 16:
                wa.append('問句有 %d 個字（建議 5–16）' % n)
            if qt == 'q1' and wh in self.WH and not re.search(r'\b%s\b' % wh, qtext, re.I):
                wa.append('wh 填 %s，但問句裡沒有這個疑問詞' % wh)
            if qt == 'q1' and not re.search(r'\b(who|what|which|when|where|why|how)\b', qtext, re.I):
                wa.append('Q1 問句應含疑問詞')
            if qt == 'q2' and not re.match(r'^(do|does|did|is|are|am|was|were|have|has|had|can|could|will|would|should|shall)\b', qtext, re.I):
                wa.append('Q2 問句應以助動詞或 be 動詞開頭')
            if qt == 'q3' and not re.search(r'\bor\b', qtext, re.I):
                wa.append('Q3 問句應含 or')
            if qt == 'q4' and not re.search(r",\s*\w+(n't)?\s+(I|you|he|she|it|we|they|there)\s*\??$", qtext, re.I):
                wa.append('Q4 句尾應為附加問句')
            for oid, _, on in idx['q']:
                if oid != me and similar(norm(qtext), on):
                    wa.append('問句與 %s 雷同' % oid)
                    break

        pat_ok = ctx['patterns'].get(qt) if qt in self.QTYPES else None
        texts = check_pool_common(e, ctx, er, wa, ctx['traps'], 2, 15, pattern_ok=pat_ok or ())
        pats = e.pop('_patterns', [])
        if suffix != 'e' and len(pats) == 3 and len(set(pats)) < 2:
            wa.append('3 句正解 pattern 都一樣（中高級建議用不同 pattern）')

        check_vocab(e, ' '.join([norm(qtext)] + texts), ctx, er, wa)

        tag = str(e.get('tag') or '').strip()
        if tag and others_of(idx['tag'], tag, me):
            wa.append('tag「%s」與其他題目相同' % tag)
        if 'issues' not in e:
            wa.append('沒有 issues 欄位（沒有備註請填 []）')
        elif e['issues']:
            wa.append('備註：%s' % '；'.join(map(str, e['issues'])))
        return er, wa


# ───── part3 ─────

class Part3(IdProfile):
    """Part 3 簡短對話：一組＝一段對話（dialogue）＋3 題四選一（questions）。"""
    name = 'part3'
    title = 'Part 3 對話'
    main_name = 'part3.json'
    backup_prefix = 'part3'
    has_dups = True
    QTYPES = ('main', 'detail', 'infer', 'intent', 'next', 'graphic')
    TRAPS = ('mention-not-ask', 'wrong-speaker', 'number-mix', 'sound-alike', 'over-infer', 'opposite', 'partial')
    PATTERNS = ('direct', 'paraphrase', 'summary')
    empty_hint = ('資料夾內沒有找到副檔。\n請把網頁「新增題目」產生的檔案（例如 p3_d1-002-m_x2.json）放進來，'
                  '或按「新增檔案…」手動選取。')
    done_note = ('合併後重新整理網頁，題數就會更新。音檔請放進 audio/p3/（{id}-s01.mp3…，一句對話一檔），'
                 '再執行 audio_scan.py；沒有音檔時網頁會用機器發音。')

    def is_candidate(self, fname):
        return fname.lower().startswith('p3_')

    def is_auto(self, fname):
        return self.is_candidate(fname)

    def describe(self, e):
        d = e.get('dialogue') if isinstance(e, dict) else None
        return d[0].get('t', '') if isinstance(d, list) and d and isinstance(d[0], dict) else ''

    def make_ctx(self, items, data):
        spec = data.get('_spec') if isinstance(data, dict) and isinstance(data.get('_spec'), dict) else {}
        traps = [k for k in (spec.get('traps') or {}) if k != 'correct'] or list(self.TRAPS)
        return {'domains': domains_of(data), 'idx': build_index(items), 'traps': traps}

    def find_dups(self, e, refs):
        t = self.describe(e)
        if not t:
            return []
        me, n = self.key(e), norm(t)
        return [(i, x) for i, x in refs if i != me and similar(n, norm(x))]

    def extra_detail(self, e):
        if isinstance(e, dict) and isinstance(e.get('dialogue'), list):
            qs = [str(q.get('qtype', '?')) for q in e.get('questions') or [] if isinstance(q, dict)]
            return ['     %s｜%d 句｜%s' % (e.get('form', ''), len(e['dialogue']), '／'.join(qs))]
        return []

    def validate(self, e, ctx):
        er, wa = [], []
        if not isinstance(e, dict):
            return ['內容不是物件'], wa
        if 'skip' in e:
            return ['AI 回報寫不出這個難度，不應合併：%s' % e.get('skip')], wa
        m = ID_RE.match(str(e.get('id', '')))
        if not m:
            return ['id 格式必須是 d{1-7}-{3 位數}-{e|m|h}，例如 d1-002-h'], wa
        dom, suffix, me = 'd' + m.group(1), m.group(3), e['id']
        idx = ctx['idx']
        if e.get('domain') != dom:
            er.append('domain 應為 %s（要等於 id 前段），目前是 %r' % (dom, e.get('domain')))
        scenes = ctx['domains'].get(dom, [])
        if e.get('scene') not in scenes:
            er.append('scene %r 不屬於 %s（可用：%s）' % (e.get('scene'), dom, '、'.join(scenes)))
        if not str(e.get('tag') or '').strip():
            er.append('缺少 tag')
        check_level(e, suffix, er, wa)

        # 形式與說話者
        form = e.get('form')
        if form not in ('2p', '3p'):
            er.append("form 必須是 '2p' 或 '3p'，目前是 %r" % form)
        sp = e.get('speakers')
        sids = []
        if not isinstance(sp, list) or not sp:
            er.append('缺少 speakers')
        else:
            for s in sp:
                if not isinstance(s, dict) or not s.get('id') or s.get('gender') not in ('F', 'M'):
                    er.append("speakers 每項需要 id 與 gender（'F' 或 'M'）")
                    break
                sids.append(s['id'])
            if len(set(sids)) != len(sids):
                er.append('speakers 的 id 重複')
            want = 2 if form == '2p' else 3 if form == '3p' else None
            if want and len(sp) != want:
                er.append('form 是 %s，speakers 應有 %d 位（目前 %d）' % (form, want, len(sp)))
            genders = [s.get('gender') for s in sp if isinstance(s, dict)]
            if form == '3p' and genders and len(set(genders)) == 1:
                wa.append('三人對話的說話者全是同一性別，不易分辨')
            if form == '2p' and len(genders) == 2 and len(set(genders)) == 1:
                wa.append('兩人對話建議一男一女')

        # 對話
        dl = e.get('dialogue')
        blob = []
        if not isinstance(dl, list) or not dl:
            er.append('缺少 dialogue')
            dl = []
        else:
            if not 5 <= len(dl) <= 16:
                wa.append('對話有 %d 句（建議 5–16）' % len(dl))
            elif suffix == 'e' and not 6 <= len(dl) <= 8:
                wa.append('初級對話建議 6–8 句（目前 %d 句）' % len(dl))
            spoke = set()
            for i, l in enumerate(dl):
                if not isinstance(l, dict) or not str(l.get('t') or '').strip():
                    er.append('dialogue 第 %d 句格式不對（需要 sp、t）' % i)
                    continue
                if sids and l.get('sp') not in sids:
                    er.append('dialogue 第 %d 句的 sp %r 不在 speakers 內' % (i, l.get('sp')))
                spoke.add(l.get('sp'))
                if not str(l.get('zh') or '').strip():
                    wa.append('dialogue 第 %d 句缺少 zh' % i)
                n = n_words(l['t'])
                if not 3 <= n <= 30:
                    wa.append('dialogue 第 %d 句有 %d 個字（建議 3–30）' % (i, n))
                blob.append(norm(l['t']))
            if sids and not set(sids) <= spoke:
                wa.append('有說話者沒有發言：%s' % '、'.join(sorted(set(sids) - spoke)))
        dtext = ' '.join(blob)

        # 圖表
        g = e.get('graphic')
        if g is not None:
            cols = g.get('columns') if isinstance(g, dict) else None
            rows = g.get('rows') if isinstance(g, dict) else None
            if not isinstance(g, dict) or not g.get('title') or not isinstance(cols, list) or not cols \
                    or not isinstance(rows, list) or not rows:
                er.append('graphic 需要 title、columns（陣列）、rows（二維陣列）')
            elif any(not isinstance(r, list) or len(r) != len(cols) for r in rows):
                er.append('graphic.rows 每列的欄數必須等於 columns（%d 欄）' % len(cols))

        # 題目
        qs = e.get('questions')
        has_gq, last_ev = False, -1
        if not isinstance(qs, list) or len(qs) != 3:
            er.append('questions 必須剛好 3 題（目前 %s）' % (len(qs) if isinstance(qs, list) else '沒有'))
            qs = qs if isinstance(qs, list) else []
        for qi, q in enumerate(qs, 1):
            tag = '第 %d 題' % qi
            if not isinstance(q, dict):
                er.append('%s 不是物件' % tag)
                continue
            qt = q.get('qtype')
            if qt not in self.QTYPES:
                er.append('%s qtype 必須是 %s，目前是 %r' % (tag, '／'.join(self.QTYPES), qt))
            qq = q.get('q')
            qtext = ''
            if not isinstance(qq, dict) or not str(qq.get('t') or '').strip():
                er.append('%s 缺少 q.t' % tag)
            else:
                qtext = qq['t'].strip()
                if not str(qq.get('zh') or '').strip():
                    wa.append('%s 缺少 q.zh' % tag)
            blob.append(norm(qtext))
            if qt == 'graphic':
                has_gq = True
                if g is None:
                    er.append('%s 是圖表題，但沒有 graphic' % tag)
                if qtext and not qtext.lower().startswith('look at the graphic'):
                    wa.append('%s 圖表題題目應以 Look at the graphic 開頭' % tag)
            if qt == 'intent':
                mq = re.search(r'["“](.+?)["”]', qtext)
                if not mq:
                    wa.append('%s 意圖題應在題目中引用對話裡的一句話（用引號）' % tag)
                elif norm(mq.group(1)) not in dtext:
                    wa.append('%s 引用的句子不在對話中：%s' % (tag, mq.group(1)))
            ch = q.get('choices')
            if not isinstance(ch, list) or len(ch) != 4:
                er.append('%s choices 必須剛好 4 個（目前 %s）' % (tag, len(ch) if isinstance(ch, list) else '沒有'))
            else:
                texts, n_ok = [], 0
                for ci, c in enumerate(ch, 1):
                    if not isinstance(c, dict) or not str(c.get('t') or '').strip() or not isinstance(c.get('ok'), bool):
                        er.append('%s 選項 %d 格式不對（需要 t 與 ok:true/false）' % (tag, ci))
                        continue
                    texts.append(norm(c['t']))
                    blob.append(norm(c['t']))
                    if not str(c.get('zh') or '').strip():
                        wa.append('%s 選項 %d 缺少 zh' % (tag, ci))
                    if not str(c.get('why') or '').strip():
                        wa.append('%s 選項 %d 缺少 why' % (tag, ci))
                    if c['ok']:
                        n_ok += 1
                        if c.get('pattern') not in self.PATTERNS:
                            wa.append('%s 正解 pattern %r 不在合法值（%s）' % (tag, c.get('pattern'), '、'.join(self.PATTERNS)))
                        if not str(c.get('why', '')).startswith('正解：'):
                            wa.append('%s 正解的 why 建議以「正解：」開頭' % tag)
                    elif c.get('trap') not in ctx['traps']:
                        er.append('%s 選項 %d trap 不合法：%r' % (tag, ci, c.get('trap')))
                if n_ok != 1:
                    er.append('%s 必須剛好 1 個正解（目前 %d）' % (tag, n_ok))
                if len(set(texts)) != len(texts):
                    er.append('%s 有重複的選項' % tag)
            ev = q.get('evidence')
            if not isinstance(ev, list) or not ev:
                wa.append('%s 缺少 evidence（證據句索引）' % tag)
            elif any(not isinstance(i, int) or isinstance(i, bool) or not 0 <= i < max(len(dl), 1) for i in ev):
                er.append('%s evidence 必須是 0–%d 的整數索引：%r' % (tag, len(dl) - 1, ev))
            else:
                if min(ev) < last_ev:
                    wa.append('%s 的證據句比前一題更前面（答案順序通常與題號一致）' % tag)
                last_ev = max(last_ev, min(ev))
        if g is not None and qs and not has_gq:
            wa.append('有 graphic 但沒有任何圖表題')

        check_vocab(e, ' '.join([dtext] + blob), ctx, er, wa)
        tg = str(e.get('tag') or '').strip()
        if tg and others_of(idx['tag'], tg, me):
            wa.append('tag「%s」與其他題目相同' % tg)
        if e.get('issues'):
            wa.append('備註：%s' % '；'.join(map(str, e['issues'])))
        return er, wa


# ───── part4 ─────

class Part4(Part3):
    """Part 4 簡短獨白：一組＝一段獨白（script，單一說話者）＋3 題四選一（questions）。"""
    name = 'part4'
    title = 'Part 4 獨白'
    main_name = 'part4.json'
    backup_prefix = 'part4'
    QTYPES = ('main', 'detail', 'infer', 'intent', 'next', 'graphic', 'who')
    MTYPES = ('voicemail', 'announcement', 'news', 'ad', 'radio', 'tour', 'meeting', 'speech')
    LEN = {'e': (6, 8), 'm': (8, 10), 'h': (10, 14)}
    empty_hint = ('資料夾內沒有找到副檔。\n請把網頁「新增題目」產生的檔案（例如 p4_d1-002-m_x2.json）放進來，'
                  '或按「新增檔案…」手動選取。')
    done_note = ('合併後重新整理網頁，題數就會更新。音檔請放進 audio/p4/（{id}.mp3，整段獨白錄一個檔），'
                 '再執行 audio_scan.py；沒有音檔時網頁會用機器發音。')

    def is_candidate(self, fname):
        return fname.lower().startswith('p4_')

    def describe(self, e):
        d = e.get('script') if isinstance(e, dict) else None
        return d[0].get('t', '') if isinstance(d, list) and d and isinstance(d[0], dict) else ''

    def extra_detail(self, e):
        if isinstance(e, dict) and isinstance(e.get('script'), list):
            qs = [str(q.get('qtype', '?')) for q in e.get('questions') or [] if isinstance(q, dict)]
            return ['     %s｜%d 句｜%s' % (e.get('mtype', ''), len(e['script']), '／'.join(qs))]
        return []

    def validate(self, e, ctx):
        if not isinstance(e, dict):
            return ['內容不是物件'], []
        if 'skip' in e:
            return ['AI 回報寫不出這個難度，不應合併：%s' % e.get('skip')], []
        pre, extra_er, extra_wa = [], [], []
        if e.get('form') != 'talk':
            extra_er.append("form 必須是 'talk'，目前是 %r" % e.get('form'))
        if e.get('mtype') not in self.MTYPES:
            extra_er.append('mtype 必須是 %s，目前是 %r' % ('／'.join(self.MTYPES), e.get('mtype')))
        sp = e.get('speakers')
        g = 'F'
        if not isinstance(sp, list) or len(sp) != 1 or not isinstance(sp[0], dict) or sp[0].get('gender') not in ('F', 'M'):
            extra_er.append("speakers 必須剛好 1 位，且需要 gender（'F' 或 'M'）")
        else:
            g = sp[0]['gender']
        sc = e.get('script')
        if 'dialogue' in e:
            extra_er.append('Part 4 使用 script，不是 dialogue')
        if not isinstance(sc, list) or not sc:
            extra_er.append('缺少 script')
            sc = []
        # 轉成 Part 3 的格式重用共同檢查（同一位說話者 S，加一位假想說話者湊足兩人）
        e2 = dict(e)
        e2['form'] = '2p'
        e2['speakers'] = [{'id': 'S', 'gender': g}, {'id': '_x', 'gender': 'M' if g == 'F' else 'F'}]
        e2['dialogue'] = [dict(l, sp='S') if isinstance(l, dict) else l for l in sc]
        er, wa = Part3.validate(self, e2, ctx)
        skip = ('沒有發言', '兩人對話', '對話有', '初級對話', "form 必須是 '2p'")
        er = [x for x in er if not x.startswith("form 必須是 '2p'")]
        wa = [x for x in wa if not any(k in x for k in skip)]
        er = [x.replace('dialogue', 'script') for x in er]
        wa = [x.replace('dialogue', 'script') for x in wa]
        m = ID_RE.match(str(e.get('id', '')))
        if m and sc:
            lo, hi = self.LEN[m.group(3)]
            if not lo <= len(sc) <= hi:
                wa.append('%s獨白建議 %d–%d 句（目前 %d 句）' % (TIER_ZH[TIER[m.group(3)]], lo, hi, len(sc)))
        if m and m.group(3) == 'h':
            qts = [q.get('qtype') for q in e.get('questions') or [] if isinstance(q, dict)]
            if 'graphic' not in qts and 'intent' not in qts:
                wa.append('高級題建議至少含 1 題圖表題或意圖題')
        return extra_er + er, extra_wa + wa


# ───── part5 ─────

class Part5(IdProfile):
    """Part 5 句子填空：一題＝一個句子（恰好一個 _____）＋1 個正解＋11 個干擾項（網頁每次抽 3 個，共顯示 4 個）。"""
    name = 'part5'
    title = 'Part 5 填空'
    main_name = 'part5.json'
    backup_prefix = 'part5'
    BLANK = '_____'
    POINTS = {'wordform': 'grammar', 'tense': 'grammar', 'voice': 'grammar', 'agree': 'grammar', 'verbform': 'grammar',
              'conj': 'grammar', 'prep': 'grammar', 'pronoun': 'grammar', 'relative': 'grammar', 'compare': 'grammar',
              'quant': 'grammar', 'vmeaning': 'vocab', 'vcolloc': 'vocab', 'vconfuse': 'vocab'}
    TRAPS = ('pos', 'tense', 'voice', 'agree', 'form', 'case', 'structure', 'logic', 'confusable', 'collocation', 'meaning')
    LEN = {'e': (8, 14), 'm': (12, 20), 'h': (15, 28)}
    empty_hint = ('資料夾內沒有找到副檔。\n請把網頁「新增題目」產生的檔案（例如 p5_d1-002-m_x3.json）放進來，'
                  '或按「新增檔案…」手動選取。')
    done_note = ('合併後重新整理網頁，題數就會更新。音檔請放進 audio/p5/（{id}.mp3，一題一檔，朗讀答案填入的完整句），'
                 '再執行 audio_scan.py；沒有音檔時網頁會用機器發音。')

    def is_candidate(self, fname):
        return fname.lower().startswith('p5_')

    def is_auto(self, fname):
        return self.is_candidate(fname)

    def describe(self, e):
        s = e.get('sentence') if isinstance(e, dict) else None
        return s.get('t', '') if isinstance(s, dict) else ''

    def make_ctx(self, items, data):
        idx = build_index(items)
        idx['sent'] = {}
        for o in items:
            t = self.describe(o) if isinstance(o, dict) else ''
            if t:
                idx['sent'].setdefault(norm(t), set()).add(o.get('id'))
        return {'domains': domains_of(data), 'idx': idx}

    def extra_detail(self, e):
        if isinstance(e, dict) and isinstance(e.get('sentence'), dict):
            return ['     %s／%s｜%s' % (e.get('kind', ''), e.get('point', ''), e['sentence'].get('t', ''))]
        return []

    def validate(self, e, ctx):
        er, wa = [], []
        if not isinstance(e, dict):
            return ['內容不是物件'], wa
        if 'skip' in e:
            return ['AI 回報寫不出這個題目，不應合併：%s' % e.get('skip')], wa
        m = ID_RE.match(str(e.get('id', '')))
        if not m:
            return ['id 格式必須是 d{1-7}-{3 位數}-{e|m|h}，例如 d1-002-m'], wa
        dom, suffix, me = 'd' + m.group(1), m.group(3), e['id']
        idx = ctx['idx']

        if e.get('domain') != dom:
            er.append('domain 應為 %s（要等於 id 前段），目前是 %r' % (dom, e.get('domain')))
        scenes = ctx['domains'].get(dom, [])
        if e.get('scene') not in scenes:
            er.append('scene %r 不屬於 %s（可用：%s）' % (e.get('scene'), dom, '、'.join(scenes)))
        if e.get('biz') not in (None, '') and e.get('biz') not in ('hr', 'marketing', 'finance', 'manufacturing', 'it', 'general'):
            wa.append('biz 建議為 hr／marketing／finance／manufacturing／it／general，目前是 %r' % e.get('biz'))

        kind, point = e.get('kind'), e.get('point')
        if kind not in ('grammar', 'vocab'):
            er.append("kind 必須是 'grammar' 或 'vocab'，目前是 %r" % kind)
        if point not in self.POINTS:
            er.append('point 必須是 %s，目前是 %r' % ('／'.join(self.POINTS), point))
        elif kind in ('grammar', 'vocab') and self.POINTS[point] != kind:
            er.append('point %s 屬於 %s，但 kind 填了 %s' % (point, self.POINTS[point], kind))
        if not str(e.get('tag') or '').strip():
            er.append('缺少 tag')
        check_level(e, suffix, er, wa)
        if e.get('voice') not in ('F', 'M'):
            wa.append("voice 應為 'F' 或 'M'（音檔與機器發音的性別），目前是 %r" % e.get('voice'))

        # 句子
        s = e.get('sentence')
        st = ''
        if not isinstance(s, dict) or not isinstance(s.get('t'), str) or not s['t'].strip():
            er.append('缺少 sentence.t')
        else:
            st = s['t']
            n_blank = st.count(self.BLANK)
            if n_blank != 1:
                er.append('sentence.t 必須恰好有一個 %s（五個底線），目前有 %d 個' % (self.BLANK, n_blank))
            elif re.search(r'_{6,}', st):
                er.append('sentence.t 的空格必須剛好是五個底線 %s' % self.BLANK)
            if not str(s.get('zh') or '').strip():
                wa.append('sentence 缺少 zh')

        # 正解
        a = e.get('answer')
        at = ''
        if not isinstance(a, dict) or not str(a.get('t') or '').strip():
            er.append('answer.t 不可為空')
        else:
            at = a['t'].strip()
            for k in ('zh', 'pos'):
                if not str(a.get(k) or '').strip():
                    wa.append('answer 缺少 %s' % k)
            if not str(a.get('why', '')).startswith('正解：'):
                wa.append('answer.why 建議以「正解：」開頭')

        # 句長（以答案填回後的字數計）
        if st and at and st.count(self.BLANK) == 1:
            full = st.replace(self.BLANK, at)
            lo, hi = self.LEN[suffix]
            n = n_words(full)
            if not lo <= n <= hi:
                wa.append('句長 %d 字，不在%s的範圍 %d–%d 字' % (n, TIER_ZH[TIER[suffix]], lo, hi))

        # 干擾項
        ds = e.get('distractors')
        texts = [at.lower()] if at else []
        if not isinstance(ds, list) or len(ds) != 11:
            er.append('distractors 必須剛好 11 個（目前 %s）' % (len(ds) if isinstance(ds, list) else '沒有'))
            ds = ds if isinstance(ds, list) else []
        n_near = n_root = 0
        for i, d in enumerate(ds, 1):
            if not isinstance(d, dict):
                er.append('干擾項第 %d 個不是物件' % i)
                continue
            miss = [k for k in ('t', 'zh', 'pos', 'trap', 'why') if not str(d.get(k) or '').strip()]
            if miss:
                er.append('干擾項第 %d 個（%s）缺少：%s' % (i, d.get('t', ''), ', '.join(miss)))
            if d.get('trap') and d.get('trap') not in self.TRAPS:
                er.append('干擾項第 %d 個 trap 不合法：%r（可用：%s）' % (i, d.get('trap'), '／'.join(self.TRAPS)))
            if d.get('t'):
                texts.append(str(d['t']).strip().lower())
            n_near += 1 if d.get('near') is True else 0
            n_root += 1 if d.get('fam') == 'root' else 0
            if d.get('near') is not None and not isinstance(d.get('near'), bool):
                er.append('干擾項第 %d 個 near 必須是 true/false' % i)
            if d.get('fam') not in ('root', 'other'):
                wa.append('干擾項第 %d 個（%s）fam 應為 root 或 other' % (i, d.get('t', '')))
            if kind == 'vocab' and at and a and d.get('pos') and a.get('pos') and d['pos'] != a['pos']:
                wa.append('單字題干擾項「%s」詞性 %s 與正解 %s 不同' % (d.get('t'), d['pos'], a['pos']))
        if len(set(texts)) != len(texts):
            er.append('12 個選項（正解＋干擾項）裡有文字重複（忽略大小寫）')
        if ds and n_near < 3:
            wa.append('near:true 只有 %d 個（建議至少 3 個）' % n_near)
        if point == 'wordform' and ds and n_root < 4:
            wa.append('wordform 題的 root（同字根）干擾項只有 %d 個（建議至少 4 個）' % n_root)

        # clue
        cl = e.get('clue')
        if not isinstance(cl, dict) or not str(cl.get('text') or '').strip() or not isinstance(cl.get('steps'), list):
            wa.append('缺少 clue（需要 text 與 steps）')
        elif len(cl['steps']) != 4 or any(not str(x or '').strip() for x in cl['steps']):
            wa.append('clue.steps 應為 4 句（四步驟解題法）')

        # vocab（網頁用 vocab 做單字發音；缺少時只提醒）
        if not isinstance(e.get('vocab'), list) or not e['vocab']:
            wa.append('缺少 vocab')
        else:
            blob = norm(' '.join([st.replace(self.BLANK, ' ' + at + ' '), at]))
            check_vocab(e, blob, ctx, er, wa, lo=2, hi=3)

        tg = str(e.get('tag') or '').strip()
        if tg and others_of(idx['tag'], tg, me):
            wa.append('tag「%s」與其他題目相同：%s' % (tg, '、'.join(others_of(idx['tag'], tg, me))))
        if st:
            n = norm(st)
            hit = sorted({o for k, v in idx['sent'].items() if similar(n, k) for o in v if o != me})
            if hit:
                wa.append('句子與其他題目相同或雷同：%s' % '、'.join(hit))
        if e.get('issues'):
            wa.append('備註：%s' % '；'.join(map(str, e['issues'])))
        return er, wa


# ───── part6 ─────

class Part6(IdProfile):
    """Part 6 段落填空：一題＝一篇文章（4 個空格 [[1]]–[[4]]）；非插入題 1 正解＋7 干擾項，插入題 1 正解句＋3 干擾句。"""
    name = 'part6'
    title = 'Part 6 段落填空'
    main_name = 'part6.json'
    backup_prefix = 'part6'
    POINTS = {'wordform': 'grammar', 'tense': 'grammar', 'voice': 'grammar', 'agree': 'grammar', 'verbform': 'grammar',
              'conj': 'grammar', 'prep': 'grammar', 'pronoun': 'grammar', 'relative': 'grammar', 'quant': 'grammar',
              'vmeaning': 'vocab', 'vcolloc': 'vocab', 'vconfuse': 'vocab',
              'transition': 'transition', 'insert': 'insert'}
    TRAPS = ('pos', 'tense', 'voice', 'agree', 'form', 'case', 'structure', 'logic', 'confusable', 'collocation',
             'meaning', 'topic', 'reference', 'sequence', 'contradiction', 'redundant', 'tone')
    INSERT_TRAPS = ('topic', 'reference', 'sequence', 'contradiction', 'logic', 'redundant', 'tone')
    DOCS = ('email', 'letter', 'memo', 'notice', 'article', 'ad', 'instructions')
    WORDS = {'e': (80, 110), 'm': (100, 140), 'h': (130, 180)}
    MARK = re.compile(r'\[\[(\d)\]\]')
    empty_hint = ('資料夾內沒有找到副檔。\n請把網頁「新增題目」產生的檔案（例如 p6_d1-002-m_x2.json）放進來，'
                  '或按「新增檔案…」手動選取。')
    done_note = ('合併後重新整理網頁，題數就會更新。音檔請放進 audio/p6/（{id}.mp3，一篇一檔，朗讀答案填入的整篇），'
                 '再執行 audio_scan.py；沒有音檔時網頁會用機器發音。')

    def is_candidate(self, fname):
        return fname.lower().startswith('p6_')

    def is_auto(self, fname):
        return self.is_candidate(fname)

    @staticmethod
    def answers(e):
        out = {}
        for q in e.get('questions') or []:
            if isinstance(q, dict) and isinstance(q.get('answer'), dict):
                out[q.get('n')] = str(q['answer'].get('t') or '').strip()
        return out

    def filled(self, e):
        """body 把 [[n]] 換成正解；回傳段落清單。"""
        ans = self.answers(e)
        return [self.MARK.sub(lambda m: ans.get(int(m.group(1)), m.group(0)), p) for p in e.get('body') or [] if isinstance(p, str)]

    @staticmethod
    def first_sentence(paras):
        t = ' '.join(paras).strip()
        m = re.search(r'[.?!](\s|$)', t)
        return t[:m.end()].strip() if m else t

    @staticmethod
    def subject(e):
        for ln in e.get('head') or []:
            if isinstance(ln, str) and re.match(r'\s*subject\s*:', ln, re.I):
                return ln.split(':', 1)[1].strip()
        h = e.get('head')
        return str(h[0]).strip() if isinstance(h, list) and h and isinstance(h[0], str) else ''

    def describe(self, e):
        if not isinstance(e, dict):
            return ''
        return '%s｜%s' % (e.get('doc', ''), e.get('tag', ''))

    def make_ctx(self, items, data):
        idx = build_index(items)
        idx['first'], idx['subj'] = {}, {}
        for o in items:
            if not isinstance(o, dict) or not isinstance(o.get('body'), list):
                continue
            f = norm(self.first_sentence(self.filled(o)))
            if f:
                idx['first'].setdefault(f, set()).add(o.get('id'))
            s = norm(self.subject(o))
            if s:
                idx['subj'].setdefault(s, set()).add(o.get('id'))
        docs = data.get('_spec', {}).get('docs') if isinstance(data, dict) else None
        return {'domains': domains_of(data), 'idx': idx, 'docs': list(docs) if isinstance(docs, dict) and docs else list(self.DOCS)}

    def extra_detail(self, e):
        if isinstance(e, dict) and isinstance(e.get('questions'), list):
            ks = ['%s/%s' % (q.get('kind', ''), q.get('point', '')) for q in e['questions'] if isinstance(q, dict)]
            return ['     %s｜%s' % (e.get('doc', ''), '、'.join(ks))]
        return []

    def validate(self, e, ctx):
        er, wa = [], []
        if not isinstance(e, dict):
            return ['內容不是物件'], wa
        if 'skip' in e:
            return ['AI 回報寫不出這個題目，不應合併：%s' % e.get('skip')], wa
        m = ID_RE.match(str(e.get('id', '')))
        if not m:
            return ['id 格式必須是 d{1-7}-{3 位數}-{e|m|h}，例如 d1-002-m'], wa
        dom, suffix, me = 'd' + m.group(1), m.group(3), e['id']
        idx = ctx['idx']

        # 基本欄位
        if e.get('domain') != dom:
            er.append('domain 應為 %s（要等於 id 前段），目前是 %r' % (dom, e.get('domain')))
        scenes = ctx['domains'].get(dom, [])
        if e.get('scene') not in scenes:
            er.append('scene %r 不屬於 %s（可用：%s）' % (e.get('scene'), dom, '、'.join(scenes)))
        if e.get('biz') not in (None, '') and e.get('biz') not in ('hr', 'marketing', 'finance', 'manufacturing', 'it', 'general'):
            wa.append('biz 建議為 hr／marketing／finance／manufacturing／it／general，目前是 %r' % e.get('biz'))
        if e.get('doc') not in ctx['docs']:
            er.append('doc 必須是 %s，目前是 %r' % ('／'.join(ctx['docs']), e.get('doc')))
        if not str(e.get('tag') or '').strip():
            er.append('缺少 tag')
        check_level(e, suffix, er, wa)
        if e.get('voice') not in ('F', 'M'):
            er.append("voice 必須是 'F' 或 'M'，目前是 %r" % e.get('voice'))

        # 標頭、本文、翻譯
        head, body, zh = e.get('head'), e.get('body'), e.get('zh')
        if not isinstance(head, list) or any(not isinstance(x, str) for x in head):
            er.append('head 必須是字串陣列（可為空陣列）')
            head = []
        elif len(head) > 5:
            wa.append('head 有 %d 行（建議 0–5 行）' % len(head))
        if not isinstance(body, list) or any(not isinstance(x, str) or not x.strip() for x in body):
            er.append('body 必須是字串陣列（段落）')
            return er, wa
        if not 2 <= len(body) <= 4:
            er.append('body 必須 2–4 段（目前 %d 段）' % len(body))
        if not isinstance(zh, list) or len(zh) != len(body):
            er.append('zh 必須是與 body 同長的陣列（body %d 段，zh %s）' % (len(body), len(zh) if isinstance(zh, list) else '沒有'))

        # 空格標記
        marks = [int(x) for p in body for x in self.MARK.findall(p)]
        if marks != [1, 2, 3, 4]:
            er.append('[[1]]–[[4]] 必須在 body 內各出現一次且依閱讀順序（目前順序：%s）' % (marks or '沒有'))

        # 題目
        qs = e.get('questions')
        if not isinstance(qs, list) or len(qs) != 4 or any(not isinstance(q, dict) for q in qs):
            er.append('questions 必須剛好 4 題（目前 %s）' % (len(qs) if isinstance(qs, list) else '沒有'))
            return er, wa
        if [q.get('n') for q in qs] != [1, 2, 3, 4]:
            er.append('questions 的 n 必須依序是 1、2、3、4，目前是 %s' % [q.get('n') for q in qs])
        n_ins = sum(1 for q in qs if q.get('kind') == 'insert')
        if n_ins != 1:
            er.append('每篇必須剛好 1 題 insert（目前 %d 題）' % n_ins)
        kinds, pts, scopes = [], [], []
        for q in qs:
            n = q.get('n')
            kind, point = q.get('kind'), q.get('point')
            kinds.append(kind)
            pts.append(point)
            scopes.append(q.get('scope'))
            lab = '第 %s 題' % n
            if kind not in ('grammar', 'vocab', 'transition', 'insert'):
                er.append("%s kind 必須是 grammar／vocab／transition／insert，目前是 %r" % (lab, kind))
            if point not in self.POINTS:
                er.append('%s point 必須是 %s，目前是 %r' % (lab, '／'.join(self.POINTS), point))
            elif kind in ('grammar', 'vocab', 'transition', 'insert') and self.POINTS[point] != kind:
                er.append('%s point %s 屬於 %s，但 kind 填了 %s' % (lab, point, self.POINTS[point], kind))
            if q.get('scope') not in ('local', 'near', 'far'):
                wa.append("%s scope 應為 local／near／far，目前是 %r" % (lab, q.get('scope')))
            if not str(q.get('tag') or '').strip():
                wa.append('%s 缺少 tag' % lab)

            a = q.get('answer')
            at = ''
            if not isinstance(a, dict) or not str(a.get('t') or '').strip():
                er.append('%s answer.t 不可為空' % lab)
            else:
                at = a['t'].strip()
                if not str(a.get('why', '')).startswith('正解：'):
                    er.append('%s answer.why 必須以「正解：」開頭' % lab)
                if not str(a.get('zh') or '').strip():
                    wa.append('%s answer 缺少 zh' % lab)
                if kind != 'insert' and not str(a.get('pos') or '').strip():
                    wa.append('%s answer 缺少 pos' % lab)

            is_ins = kind == 'insert'
            want = 3 if is_ins else 7
            ds = q.get('distractors')
            if not isinstance(ds, list) or len(ds) != want:
                er.append('%s distractors 必須剛好 %d 個（目前 %s）' % (lab, want, len(ds) if isinstance(ds, list) else '沒有'))
                ds = ds if isinstance(ds, list) else []
            texts = [at.lower()] if at else []
            n_near = n_root = 0
            poss = set([a.get('pos')] if isinstance(a, dict) and a.get('pos') else [])
            traps = set()
            for i, d in enumerate(ds, 1):
                if not isinstance(d, dict):
                    er.append('%s 干擾項第 %d 個不是物件' % (lab, i))
                    continue
                need = ('t', 'zh', 'trap', 'why') if is_ins else ('t', 'zh', 'pos', 'trap', 'why')
                miss = [k for k in need if not str(d.get(k) or '').strip()]
                if miss:
                    er.append('%s 干擾項第 %d 個（%s）缺少：%s' % (lab, i, d.get('t', ''), ', '.join(miss)))
                if d.get('trap') and d.get('trap') not in self.TRAPS:
                    er.append('%s 干擾項第 %d 個 trap 不合法：%r' % (lab, i, d.get('trap')))
                elif is_ins and d.get('trap') and d['trap'] not in self.INSERT_TRAPS:
                    wa.append('%s 插入題干擾句第 %d 個 trap %r 不在插入題常用原因（%s）' % (lab, i, d['trap'], '／'.join(self.INSERT_TRAPS)))
                traps.add(d.get('trap'))
                if d.get('t'):
                    texts.append(str(d['t']).strip().lower())
                if not is_ins:
                    if not isinstance(d.get('near'), bool):
                        er.append('%s 干擾項第 %d 個 near 必須是 true/false' % (lab, i))
                    if d.get('fam') not in ('root', 'other'):
                        er.append("%s 干擾項第 %d 個 fam 必須是 'root' 或 'other'" % (lab, i))
                    n_near += 1 if d.get('near') is True else 0
                    n_root += 1 if d.get('fam') == 'root' else 0
                    poss.add(d.get('pos'))
            if len(set(texts)) != len(texts):
                er.append('%s 的選項（正解＋干擾項）裡有文字重複（忽略大小寫）' % lab)
            if not is_ins and ds:
                if n_near < 2:
                    er.append('%s near:true 至少要有 2 個（目前 %d 個）' % (lab, n_near))
                if point == 'wordform' and n_root < 3:
                    er.append("%s wordform 題 fam:'root' 至少要有 3 個（目前 %d 個）" % (lab, n_root))
                if kind == 'vocab' and len(poss - {None, ''}) > 1:
                    er.append('%s 單字題的正解與干擾項詞性必須一致（目前有 %s）' % (lab, '／'.join(sorted(poss - {None, ''}))))
            if is_ins and len(ds) == 3 and len(traps) < 2:
                wa.append('%s 插入題 3 個干擾句只用了 1 種 trap（建議至少 2 種）' % lab)

            cl = q.get('clue')
            if not isinstance(cl, dict) or not str(cl.get('text') or '').strip() or not isinstance(cl.get('steps'), list):
                er.append('%s 缺少 clue（需要 text 與 steps）' % lab)
            else:
                if len(cl['steps']) != 4 or any(not str(x or '').strip() for x in cl['steps']):
                    er.append('%s clue.steps 必須剛好 4 句' % lab)
                ct = cl['text']
                src = list(head) + list(body) + self.filled(e)
                if not any(ct in ln for ln in src):
                    er.append('%s clue.text 必須是 head 或 body 的原文片段：%r' % (lab, ct))

        # 填回答案後的檢查
        full = self.filled(e)
        if any('[[' in p for p in full):
            er.append('把正解填回後，全文仍殘留 [[ 標記')
        for q in qs:
            if q.get('kind') != 'insert':
                continue
            tok = '[[%s]]' % q.get('n')
            for pi, p in enumerate(body):
                i = p.find(tok)
                if i < 0:
                    continue
                pre = p[:i]
                if pre.strip() and not re.search(r'[.?!]["”’)]?\s+$', pre):
                    er.append('insert 空格 %s 必須在句首（前面要是句號／問號／驚嘆號，或段首）' % tok)
                if pi == 0 and not pre.strip():
                    er.append('insert 空格 %s 不可是全文第一句' % tok)

        # vocab
        vocab = e.get('vocab')
        if not isinstance(vocab, list) or not 3 <= len(vocab) <= 5:
            er.append('vocab 必須 3–5 個（目前 %s）' % (len(vocab) if isinstance(vocab, list) else '沒有'))
        if isinstance(vocab, list) and vocab:
            blob = norm(' '.join(head + full))
            check_vocab(e, blob, ctx, er, wa, lo=3, hi=5)

        # 警告
        lo, hi = self.WORDS[suffix]
        nw = n_words(' '.join(full))
        if not lo <= nw <= hi:
            wa.append('本文 %d 字，不在%s的範圍 %d–%d 字' % (nw, TIER_ZH[TIER[suffix]], lo, hi))
        if all(s == 'local' for s in scopes):
            wa.append('scope 全是 local（文章不合格，會變成 Part 5）')
        elif not any(s in ('near', 'far') for s in scopes):
            wa.append('沒有任何 near／far 題')
        if sum(1 for s in scopes if s in ('near', 'far')) < 2:
            wa.append('至少要有 2 題 scope 為 near 或 far')
        if not any(k in ('vocab', 'transition') for k in kinds):
            wa.append('沒有 vocab 或 transition 題')
        if not any(k == 'grammar' for k in kinds):
            wa.append('沒有文法題')
        for p in sorted({p for p in pts if p and pts.count(p) >= 3}):
            wa.append('同一個 point（%s）出現 %d 次' % (p, pts.count(p)))
        if e.get('say') and '[[' in str(e['say']):
            wa.append('say 含有 [[ 標記')
        tg = str(e.get('tag') or '').strip()
        if tg and others_of(idx['tag'], tg, me):
            wa.append('tag「%s」與其他題目相同：%s' % (tg, '、'.join(others_of(idx['tag'], tg, me))))
        s = norm(self.subject(e))
        if s:
            hit = sorted({o for k, v in idx['subj'].items() if similar(s, k) for o in v if o != me})
            if hit:
                wa.append('標頭主旨與其他題目相同或雷同：%s' % '、'.join(hit))
        f = norm(self.first_sentence(full))
        if f:
            hit = sorted({o for k, v in idx['first'].items() if similar(f, k) for o in v if o != me})
            if hit:
                wa.append('首句與其他題目相同或雷同：%s' % '、'.join(hit))
        if e.get('issues'):
            wa.append('備註：%s' % '；'.join(map(str, e['issues'])))
        return er, wa


# ───── part7 ─────

class Part7(IdProfile):
    """Part 7 閱讀理解：一題＝一個題組（1–3 份文件＋2–5 題）；每題 4 選項（1 正解＋3 干擾項）。"""
    name = 'part7'
    title = 'Part 7 閱讀'
    main_name = 'part7.json'
    backup_prefix = 'part7'
    FORMATS = {'single': (1, (2, 4)), 'double': (2, (5, 5)), 'triple': (3, (5, 5))}
    KINDS = ('email', 'letter', 'memo', 'notice', 'article', 'ad', 'review', 'webpage', 'form', 'invoice',
             'schedule', 'table', 'chat')
    QTYPES = ('purpose', 'detail', 'notTrue', 'inference', 'vocab', 'intent', 'insert')
    TRAPS = ('unmentioned', 'distort', 'opposite', 'partial', 'overreach', 'wrongdoc', 'commonmeaning',
             'nearmeaning', 'position')
    WORDS = {'single': {'e': (80, 150), 'm': (150, 250), 'h': (220, 350)},
             'double': {'e': (200, 300), 'm': (280, 420), 'h': (380, 520)},
             'triple': {'e': (300, 420), 'm': (400, 580), 'h': (550, 750)}}
    ONCE_PER_SET = ('vocab', 'notTrue', 'insert')
    WEEKDAYS = ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
    MONTHS = ('january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
              'november', 'december')
    empty_hint = ('資料夾內沒有找到副檔。\n請把網頁「新增題目」產生的檔案（例如 p7_d1-002-m_x2.json）放進來，'
                  '或按「新增檔案…」手動選取。')
    done_note = ('合併後重新整理網頁，題數就會更新。音檔請放進 audio/p7/（{id}-d{k}.mp3，一份文件一檔，k＝文件序號從 1 起；'
                 'form／invoice／schedule／table 與 read:false 的文件不需要），再執行 audio_scan.py；沒有音檔時網頁會用機器發音。')

    def is_candidate(self, fname):
        return fname.lower().startswith('p7_')

    def is_auto(self, fname):
        return self.is_candidate(fname)

    # ── 文字來源 ──
    @staticmethod
    def doc_texts(d):
        """文件裡所有可被 evidence 引用的文字欄位（各自獨立，不相接）。"""
        out = []
        if not isinstance(d, dict):
            return out
        for k in ('head', 'body'):
            if isinstance(d.get(k), list):
                out += [t for t in d[k] if isinstance(t, str)]
        if isinstance(d.get('messages'), list):
            out += [m['t'] for m in d['messages'] if isinstance(m, dict) and isinstance(m.get('t'), str)]
        tb = d.get('table')
        if isinstance(tb, dict):
            out += [c for c in (tb.get('header') or []) if isinstance(c, str)]
            for r in tb.get('rows') or []:
                if isinstance(r, list):
                    out += [c for c in r if isinstance(c, str)]
        if isinstance(d.get('say'), str):
            out.append(d['say'])
        return out

    @staticmethod
    def doc_body_texts(d):
        """正文（不含 head）：body、messages、表格儲存格。"""
        out = []
        if isinstance(d.get('body'), list):
            out += [t for t in d['body'] if isinstance(t, str)]
        if isinstance(d.get('messages'), list):
            out += [m['t'] for m in d['messages'] if isinstance(m, dict) and isinstance(m.get('t'), str)]
        tb = d.get('table')
        if isinstance(tb, dict):
            out += [c for c in (tb.get('header') or []) if isinstance(c, str)]
            for r in tb.get('rows') or []:
                if isinstance(r, list):
                    out += [c for c in r if isinstance(c, str)]
        return out

    def count_words(self, e):
        n = 0
        for d in e.get('docs') or []:
            if isinstance(d, dict):
                n += sum(n_words(t) for t in self.doc_texts({k: v for k, v in d.items() if k != 'say'}))
        return n

    @staticmethod
    def fix_quote(s):
        return str(s).replace('\u2019', "'").replace('\u2018', "'").replace('\u201c', '"').replace('\u201d', '"')

    def first_sentence(self, e):
        docs = e.get('docs') or []
        if not docs or not isinstance(docs[0], dict):
            return ''
        d = docs[0]
        t = ' '.join(self.doc_body_texts(d))
        t = re.sub(r'\s*\[[1-4]\]\s*', ' ', t)
        for s in re.split(r'(?<=[.?!])\s+', t):
            if n_words(s) >= 5:
                return s.strip()
        return t[:80].strip()

    def head_of(self, e):
        docs = e.get('docs') or []
        if docs and isinstance(docs[0], dict) and isinstance(docs[0].get('head'), list):
            return ' / '.join(str(x) for x in docs[0]['head'])
        return ''

    def describe(self, e):
        return str(e.get('tag', '')) if isinstance(e, dict) else ''

    def make_ctx(self, items, data):
        idx = build_index(items)
        idx['first'] = {}
        idx['head'] = {}
        for o in items:
            if not isinstance(o, dict):
                continue
            f = norm(self.first_sentence(o))
            if f:
                idx['first'].setdefault(f, set()).add(o.get('id'))
            h = norm(self.head_of(o))
            if h:
                idx['head'].setdefault(h, set()).add(o.get('id'))
        spec = data.get('_spec') if isinstance(data, dict) and isinstance(data.get('_spec'), dict) else {}
        kinds = tuple(spec['kinds']) if isinstance(spec.get('kinds'), dict) and spec['kinds'] else self.KINDS
        qtypes = tuple(spec['qtypes']) if isinstance(spec.get('qtypes'), dict) and spec['qtypes'] else self.QTYPES
        traps = tuple(spec['traps']) if isinstance(spec.get('traps'), dict) and spec['traps'] else self.TRAPS
        return {'domains': domains_of(data), 'idx': idx, 'kinds': kinds, 'qtypes': qtypes, 'traps': traps}

    def extra_detail(self, e):
        if not isinstance(e, dict):
            return []
        docs = [d.get('kind', '?') for d in e.get('docs') or [] if isinstance(d, dict)]
        qs = [q.get('type', '?') for q in e.get('questions') or [] if isinstance(q, dict)]
        return ['     %s｜文件：%s｜題型：%s' % (e.get('format', ''), '＋'.join(docs), '、'.join(qs))]

    # ── 日期與星期 ──
    def check_dates(self, e, wa):
        text = ' '.join(t for d in e.get('docs') or [] for t in self.doc_texts(d))
        for q in e.get('questions') or []:
            if isinstance(q, dict):
                text += ' ' + str(q.get('stem') or '')
                for o in q.get('options') or []:
                    if isinstance(o, dict):
                        text += ' ' + str(o.get('t') or '')
        mon = '(' + '|'.join(m.capitalize() for m in self.MONTHS) + ')'
        wd = '(' + '|'.join(w.capitalize() for w in self.WEEKDAYS) + ')'
        pairs = []
        for m in re.finditer(wd + r',?\s+' + mon + r'\.?\s+(\d{1,2})\b', text):
            pairs.append((m.group(1), m.group(2), int(m.group(3))))
        for m in re.finditer(mon + r'\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*[,(]\s*' + wd + r'\b', text):
            pairs.append((m.group(3), m.group(1), int(m.group(2))))
        if not pairs:
            return
        years = None
        for w, mo, dd in pairs:
            ok = set()
            for y in range(2020, 2036):
                try:
                    if datetime(y, self.MONTHS.index(mo.lower()) + 1, dd).weekday() == self.WEEKDAYS.index(w.lower()):
                        ok.add(y)
                except ValueError:
                    pass
            if not ok:
                wa.append('星期與日期對不上：%s, %s %d（2020–2035 年都沒有這一天）' % (w, mo, dd))
                return
            years = ok if years is None else years & ok
            if not years:
                wa.append('文中的星期與日期無法落在同一年（請用程式驗算）：%s' % '；'.join(
                    '%s, %s %d' % p for p in pairs[:4]))
                return

    # ── 主驗證 ──
    def validate(self, e, ctx):
        er, wa = [], []
        if not isinstance(e, dict):
            return ['內容不是物件'], wa
        if 'skip' in e:
            return ['AI 回報寫不出這個題目，不應合併：%s' % e.get('skip')], wa
        m = ID_RE.match(str(e.get('id', '')))
        if not m:
            return ['id 格式必須是 d{1-7}-{3 位數}-{e|m|h}，例如 d1-002-m'], wa
        dom, suffix, me = 'd' + m.group(1), m.group(3), e['id']
        idx = ctx['idx']

        if e.get('domain') != dom:
            er.append('domain 應為 %s（要等於 id 前段），目前是 %r' % (dom, e.get('domain')))
        scenes = ctx['domains'].get(dom, [])
        if e.get('scene') not in scenes:
            er.append('scene %r 不屬於 %s（可用：%s）' % (e.get('scene'), dom, '、'.join(scenes)))
        if e.get('biz') not in (None, '') and e.get('biz') not in ('hr', 'marketing', 'finance', 'manufacturing', 'it', 'general'):
            wa.append('biz 建議為 hr／marketing／finance／manufacturing／it／general，目前是 %r' % e.get('biz'))
        if not str(e.get('tag') or '').strip():
            er.append('缺少 tag')
        check_level(e, suffix, er, wa)

        fmt = e.get('format')
        if fmt not in self.FORMATS:
            er.append("format 必須是 single／double／triple，目前是 %r" % fmt)
            return er, wa
        n_docs, (qlo, qhi) = self.FORMATS[fmt]

        # ── 文件 ──
        docs = e.get('docs')
        if not isinstance(docs, list) or len(docs) != n_docs:
            er.append('%s 的 docs 必須剛好 %d 份（目前 %s）' % (fmt, n_docs, len(docs) if isinstance(docs, list) else '沒有'))
            docs = docs if isinstance(docs, list) else []
        for i, d in enumerate(docs):
            p = '文件 %d' % (i + 1)
            if not isinstance(d, dict):
                er.append('%s 不是物件' % p)
                continue
            if d.get('kind') not in ctx['kinds']:
                er.append('%s kind %r 不在 _spec.kinds（%s）' % (p, d.get('kind'), '／'.join(ctx['kinds'])))
            if d.get('voice') not in ('F', 'M'):
                er.append("%s voice 必須是 'F' 或 'M'，目前是 %r" % (p, d.get('voice')))
            if not str(d.get('label') or '').strip():
                wa.append('%s 缺少 label（中文名稱）' % p)
            if d.get('read') is not None and not isinstance(d.get('read'), bool):
                er.append('%s read 必須是 true/false' % p)
            if isinstance(d.get('head'), list) and len(d['head']) > 5:
                wa.append('%s head 有 %d 行（建議 0–5 行）' % (p, len(d['head'])))
            if d.get('kind') == 'chat':
                ms, sp = d.get('messages'), d.get('speakers')
                if not isinstance(ms, list) or not ms:
                    er.append('%s（chat）必須有 messages' % p)
                    ms = []
                if not isinstance(sp, dict) or not sp:
                    er.append('%s（chat）必須有 speakers（姓名 → F/M）' % p)
                    sp = {}
                for k, g in sp.items():
                    if g not in ('F', 'M'):
                        er.append("%s speakers[%s] 必須是 'F' 或 'M'" % (p, k))
                for j, ms_ in enumerate(ms):
                    if not isinstance(ms_, dict) or not str(ms_.get('t') or '').strip() or not str(ms_.get('who') or '').strip():
                        er.append('%s messages[%d] 需要 who、time、t、zh' % (p, j))
                        continue
                    if ms_['who'] not in sp:
                        er.append('%s messages[%d] 的 who「%s」不在 speakers 內' % (p, j, ms_['who']))
                    for k in ('time', 'zh'):
                        if not str(ms_.get(k) or '').strip():
                            wa.append('%s messages[%d] 缺少 %s' % (p, j, k))
            else:
                b = d.get('body')
                if not isinstance(b, list) or not b or any(not isinstance(t, str) or not t.strip() for t in b):
                    er.append('%s 必須有 body（非空字串陣列）' % p)
                else:
                    z = d.get('zh')
                    if not isinstance(z, list) or len(z) != len(b):
                        er.append('%s 的 zh 必須與 body 同長（body %d 段，zh %s）' % (
                            p, len(b), len(z) if isinstance(z, list) else '沒有'))
            tb = d.get('table')
            if tb is not None:
                if not isinstance(tb, dict) or not isinstance(tb.get('header'), list) or not isinstance(tb.get('rows'), list):
                    er.append('%s table 必須是 {header:[…], rows:[[…]]}' % p)
                else:
                    w = len(tb['header'])
                    if any(not isinstance(r, list) or len(r) != w for r in tb['rows']):
                        er.append('%s table 的每一列長度必須等於 header（%d 欄）' % (p, w))

        # ── 題目 ──
        qs = e.get('questions')
        if not isinstance(qs, list) or not qlo <= len(qs) <= qhi:
            er.append('%s 的 questions 必須是 %s 題（目前 %s）' % (
                fmt, str(qlo) if qlo == qhi else '%d–%d' % (qlo, qhi), len(qs) if isinstance(qs, list) else '沒有'))
            qs = qs if isinstance(qs, list) else []
        for i, q in enumerate(qs, 1):
            if isinstance(q, dict) and q.get('n') != i:
                er.append('第 %d 題的 n 應為 %d（題號必須連號），目前是 %r' % (i, i, q.get('n')))
        type_n, n_int, n_longest, n_len_chk, n_detail = {}, 0, 0, 0, 0
        docs_ok = [d for d in docs if isinstance(d, dict)]
        all_text = [' '.join(self.doc_texts(d)) for d in docs]
        for i, q in enumerate(qs, 1):
            p = '第 %d 題' % i
            if not isinstance(q, dict):
                er.append('%s 不是物件' % p)
                continue
            qt = q.get('type')
            if qt not in ctx['qtypes']:
                er.append('%s type %r 不在 _spec.qtypes（%s）' % (p, qt, '／'.join(ctx['qtypes'])))
            type_n[qt] = type_n.get(qt, 0) + 1
            n_detail += 1 if qt == 'detail' else 0
            if not str(q.get('stem') or '').strip():
                er.append('%s 缺少 stem' % p)
            if not str(q.get('stem_zh') or '').strip():
                wa.append('%s 缺少 stem_zh' % p)
            src = q.get('src')
            src_ok = isinstance(src, list) and src and all(isinstance(s, int) and not isinstance(s, bool) and 0 <= s < len(docs) for s in src)
            if not src_ok:
                er.append('%s src 必須是合法的文件索引陣列（0–%d）' % (p, max(len(docs) - 1, 0)))
                src = []
            integ = len(src) >= 2
            n_int += 1 if integ else 0
            if integ and fmt == 'single':
                er.append('%s 單篇組不可能有整合題（src 長度 ≥ 2）' % p)

            # 選項
            ops = q.get('options')
            oks = []
            if not isinstance(ops, list) or len(ops) != 4:
                er.append('%s options 必須剛好 4 個（目前 %s）' % (p, len(ops) if isinstance(ops, list) else '沒有'))
                ops = []
            else:
                texts = []
                for j, o in enumerate(ops, 1):
                    if not isinstance(o, dict) or not str(o.get('t') or '').strip() or not isinstance(o.get('ok'), bool):
                        er.append('%s 選項 %d 格式不對（需要 t 與 ok:true/false）' % (p, j))
                        continue
                    texts.append(o['t'].strip().lower())
                    if not str(o.get('zh') or '').strip():
                        wa.append('%s 選項 %d 缺少 zh' % (p, j))
                    if not str(o.get('why') or '').strip():
                        er.append('%s 選項 %d 缺少 why' % (p, j))
                    if o['ok']:
                        oks.append(o)
                        if not str(o.get('why', '')).startswith('正解：'):
                            er.append('%s 正解的 why 必須以「正解：」開頭' % p)
                    elif o.get('trap') not in ctx['traps']:
                        er.append('%s 選項 %d（%s）trap 不合法：%r（可用：%s）' % (p, j, o['t'], o.get('trap'), '／'.join(ctx['traps'])))
                if len(oks) != 1:
                    er.append('%s 必須剛好 1 個 ok:true（目前 %d 個）' % (p, len(oks)))
                if len(set(texts)) != len(texts):
                    er.append('%s 選項文字有重複' % p)
                lens = [len(str(o.get('t') or '')) for o in ops if isinstance(o, dict)]
                if qt not in ('insert',) and lens and min(lens) > 0 and max(lens) > 2 * min(lens) and max(lens) > 12:
                    wa.append('%s 選項長度差超過 2 倍（%d–%d 字元）' % (p, min(lens), max(lens)))
                if qt not in ('insert', 'vocab') and len(oks) == 1 and lens:
                    n_len_chk += 1
                    if len(str(oks[0].get('t') or '')) == max(lens) and lens.count(max(lens)) == 1:
                        n_longest += 1
                if qt == 'insert':
                    if [str(o.get('t')) for o in ops if isinstance(o, dict)] != ['[1]', '[2]', '[3]', '[4]']:
                        er.append('%s（insert）options 的 t 必須依序是 [1]、[2]、[3]、[4]' % p)
                if qt == 'vocab' and not any(isinstance(o, dict) and o.get('trap') == 'commonmeaning' for o in ops):
                    er.append('%s（vocab）至少要有 1 個 trap:commonmeaning 的干擾項' % p)
                # 正解疑似照抄原文
                if qt not in ('insert',) and len(oks) == 1:
                    w = norm(oks[0]['t']).split()
                    if len(w) >= 6:
                        grams = {' '.join(w[a:a + 6]) for a in range(len(w) - 5)}
                        for dt in all_text:
                            nd = norm(dt)
                            if any(g in nd for g in grams):
                                wa.append('%s 正解與原文有連續 6 個以上相同單字（疑似照抄，請改成同義轉述）' % p)
                                break

            # evidence
            ev = q.get('evidence')
            if not isinstance(ev, list) or not ev:
                er.append('%s evidence 至少 1 筆' % p)
                ev = []
            ev_docs = set()
            for j, x in enumerate(ev, 1):
                if not isinstance(x, dict) or not isinstance(x.get('doc'), int) or isinstance(x.get('doc'), bool) \
                        or not isinstance(x.get('quote'), str) or not x['quote'].strip():
                    er.append('%s evidence 第 %d 筆需要 doc（整數）與 quote' % (p, j))
                    continue
                if not 0 <= x['doc'] < len(docs) or not isinstance(docs[x['doc']], dict):
                    er.append('%s evidence 第 %d 筆的 doc 索引 %d 不存在' % (p, j, x['doc']))
                    continue
                if src and x['doc'] not in src:
                    er.append('%s evidence 第 %d 筆的 doc %d 不在 src %s 內' % (p, j, x['doc'], src))
                ev_docs.add(x['doc'])
                if not any(x['quote'] in t for t in self.doc_texts(docs[x['doc']])):
                    er.append('%s evidence 第 %d 筆的 quote 沒有逐字出現在文件 %d：%r' % (p, j, x['doc'] + 1, x['quote'][:40]))
            if integ and (len(ev) < 2 or len(ev_docs) < 2):
                er.append('%s 是整合題，evidence 需要 ≥ 2 筆且來自不同文件（目前 %d 筆、%d 份文件）' % (p, len(ev), len(ev_docs)))
            if integ and ops and not any(isinstance(o, dict) and o.get('trap') in ('partial', 'wrongdoc') for o in ops):
                wa.append('%s 整合題建議至少 1 個干擾項標 partial 或 wrongdoc（只看單一文件會選的答案）' % p)
            if qt == 'notTrue' and len(ev) < 3:
                wa.append('%s（notTrue）建議列出 3 個有被提到的選項的證據（目前 %d 筆）' % (p, len(ev)))

            # clue
            cl = q.get('clue')
            if not isinstance(cl, dict) or not isinstance(cl.get('steps'), list):
                er.append('%s 缺少 clue（需要 text 與 steps）' % p)
            else:
                if len(cl['steps']) != 4 or any(not str(s or '').strip() for s in cl['steps']):
                    er.append('%s clue.steps 必須剛好 4 句' % p)
                ct = str(cl.get('text') or '').strip()
                if not ct or not any(ct in t for t in all_text):
                    er.append('%s clue.text 必須是任一文件的原文片段：%r' % (p, ct[:40]))

            # 各題型
            tg = q.get('target')
            if qt == 'vocab':
                if not isinstance(tg, dict) or not isinstance(tg.get('doc'), int) or not str(tg.get('word') or '').strip():
                    er.append('%s（vocab）需要 target:{doc, word}' % p)
                elif not 0 <= tg['doc'] < len(docs) or not isinstance(docs[tg['doc']], dict):
                    er.append('%s（vocab）target.doc 索引不存在' % p)
                else:
                    body = ' '.join(self.doc_body_texts(docs[tg['doc']]))
                    cnt = len(re.findall(r'(?<![A-Za-z])' + re.escape(tg['word']) + r'(?![A-Za-z])', body, re.I))
                    if cnt != 1:
                        er.append('%s（vocab）目標字「%s」在文件 %d 正文中必須恰好出現 1 次（目前 %d 次）' % (p, tg['word'], tg['doc'] + 1, cnt))
                    if src and tg['doc'] not in src:
                        er.append('%s（vocab）target.doc 不在 src 內' % p)
            elif qt == 'intent':
                if not isinstance(tg, dict) or not isinstance(tg.get('doc'), int) or not isinstance(tg.get('msg'), int):
                    er.append('%s（intent）需要 target:{doc, msg}' % p)
                elif not 0 <= tg['doc'] < len(docs) or not isinstance(docs[tg['doc']], dict):
                    er.append('%s（intent）target.doc 索引不存在' % p)
                elif docs[tg['doc']].get('kind') != 'chat':
                    er.append('%s（intent）只能用在 kind 為 chat 的文件' % p)
                else:
                    msgs = docs[tg['doc']].get('messages') or []
                    if not 0 <= tg['msg'] < len(msgs) or not isinstance(msgs[tg['msg']], dict):
                        er.append('%s（intent）target.msg 索引 %d 不存在' % (p, tg['msg']))
                    else:
                        mm = msgs[tg['msg']]
                        stem = self.fix_quote(q.get('stem') or '')
                        quoted = re.findall(r'"(.+?)"', stem)
                        mt = self.fix_quote(mm.get('t') or '')
                        if not quoted:
                            er.append('%s（intent）題幹必須包含引號內的原句' % p)
                        elif not any(x.strip(' .,!?') in mt for x in quoted):
                            er.append('%s（intent）題幹的引號句與 target.msg 的訊息不一致：%r' % (p, quoted[0][:40]))
                        if str(mm.get('time') or '').strip() and str(mm['time']).strip() not in str(q.get('stem') or ''):
                            er.append('%s（intent）題幹必須包含該則訊息的時間 %s' % (p, mm['time']))
            elif qt == 'insert':
                if not isinstance(tg, dict) or not isinstance(tg.get('doc'), int) or not str(tg.get('sentence') or '').strip():
                    er.append('%s（insert）需要 target:{doc, sentence}' % p)
                elif not 0 <= tg['doc'] < len(docs) or not isinstance(docs[tg['doc']], dict):
                    er.append('%s（insert）target.doc 索引不存在' % p)
                else:
                    dd = docs[tg['doc']]
                    if dd.get('kind') == 'chat':
                        er.append('%s（insert）文件必須是散文（不可為 chat）' % p)
                    body = ' '.join(t for t in (dd.get('body') or []) if isinstance(t, str))
                    for mk in '1234':
                        c = body.count('[%s]' % mk)
                        if c != 1:
                            er.append('%s（insert）文件 %d 的 body 中 [%s] 必須恰好出現 1 次（目前 %d 次）' % (p, tg['doc'] + 1, mk, c))
                    nsent = len([s for s in re.split(r'(?<=[.?!])\s+', re.sub(r'\[[1-4]\]', '', body)) if n_words(s) >= 3])
                    if nsent < 4:
                        wa.append('%s（insert）文件只有 %d 句（建議 ≥ 4 句散文）' % (p, nsent))
                    if not str(tg.get('sentence_zh') or '').strip():
                        wa.append('%s（insert）缺少 target.sentence_zh' % p)
                    if src and tg['doc'] not in src:
                        er.append('%s（insert）target.doc 不在 src 內' % p)

        # ── 組內規則 ──
        for t in self.ONCE_PER_SET:
            if type_n.get(t, 0) > 1:
                er.append('每組 %s 題最多 1 題（目前 %d 題）' % (t, type_n[t]))
        if fmt in ('double', 'triple'):
            if n_int < 2:
                er.append('%s 至少要有 2 題整合題（src 長度 ≥ 2），目前 %d 題' % ('雙篇' if fmt == 'double' else '三篇', n_int))
            if qs and n_int == len(qs):
                wa.append('全部題目都是整合題（建議也放 1–2 題單文件題）')
            if fmt == 'triple' and not any(isinstance(q, dict) and isinstance(q.get('src'), list) and len(q['src']) >= 2
                                           and len(set(x.get('doc') for x in q.get('evidence') or [] if isinstance(x, dict))) >= 2
                                           for q in qs):
                wa.append('三篇建議至少 1 題用到 2 份以上文件的資訊並比對')
        if fmt == 'single' and qs and not n_detail:
            wa.append('單篇組沒有 detail（細節題）')
        if n_len_chk >= 3 and n_longest / float(n_len_chk) >= 0.6:
            wa.append('正解是最長選項的題目有 %d / %d 題（容易被猜中，請調整選項長度）' % (n_longest, n_len_chk))

        # ── vocab（單字表） ──
        blob = norm(' '.join(' '.join(self.doc_texts(d)) for d in docs_ok))
        check_vocab(e, blob, ctx, er, wa, lo=3, hi=6)

        # ── 字數 ──
        nw = self.count_words(e)
        lo, hi = self.WORDS[fmt][suffix]
        if not lo <= nw <= hi:
            wa.append('字數 %d，不在%s%s的範圍 %d–%d 字' % (nw, TIER_ZH[TIER[suffix]], {'single': '單篇', 'double': '雙篇', 'triple': '三篇'}[fmt], lo, hi))

        # ── 日期與重複 ──
        self.check_dates(e, wa)
        tg_ = str(e.get('tag') or '').strip()
        if tg_ and others_of(idx['tag'], tg_, me):
            wa.append('tag「%s」與其他題目相同：%s' % (tg_, '、'.join(others_of(idx['tag'], tg_, me))))
        h = norm(self.head_of(e))
        if h:
            hit = sorted({o for k, v in idx['head'].items() if similar(h, k) for o in v if o != me})
            if hit:
                wa.append('文件標頭與其他題目相同或雷同：%s' % '、'.join(hit))
        f = norm(self.first_sentence(e))
        if f:
            hit = sorted({o for k, v in idx['first'].items() if similar(f, k) for o in v if o != me})
            if hit:
                wa.append('首句與其他題目相同或雷同：%s' % '、'.join(hit))
        if e.get('issues'):
            wa.append('備註：%s' % '；'.join(map(str, e['issues'])))
        return er, wa


PROFILES = {'daily': Daily(), 'photo': Photo(), 'part2': Part2(), 'part3': Part3(), 'part4': Part4(), 'part5': Part5(), 'part6': Part6(), 'part7': Part7()}
ORDER = ('daily', 'photo', 'part2', 'part3', 'part4', 'part5', 'part6', 'part7')
MAIN_NAMES = {p.main_name.lower() for p in PROFILES.values()}
TITLE_OF = {k: v.title for k, v in PROFILES.items()}


def kind_of(e):
    """依欄位判斷這筆題目屬於哪個題庫；看不出來回傳 None。"""
    if not isinstance(e, dict):
        return None
    if 'week' in e or 'passage' in e:
        return 'daily'
    if 'sentence' in e and 'distractors' in e:
        return 'part5'
    if isinstance(e.get('docs'), list) and 'questions' in e and 'format' in e:
        return 'part7'
    if 'body' in e and 'head' in e and 'questions' in e:
        return 'part6'
    if 'script' in e or e.get('form') == 'talk':
        return 'part4'
    if 'dialogue' in e or 'questions' in e:
        return 'part3'
    if 'qtype' in e:
        return 'part2'
    if 'image' in e or 'photo_type' in e:
        return 'photo'
    return None


# ───────────────────────── 分析與合併（與介面無關） ─────────────────────────

def analyze(P, path, ctx_base, items):
    """分析一個副檔。回傳 dict：path / name / fatal / entries[(entry, errors, warnings)]。"""
    info = {'path': path, 'name': os.path.basename(path), 'fatal': None, 'entries': []}
    try:
        data, err = read_json(path)
    except Exception as ex:
        info['fatal'] = '無法讀取：%s' % ex
        return info
    if err:
        info['fatal'] = err
        return info
    entries, err = P.get_entries(data)
    if err:
        info['fatal'] = err
        return info
    if not entries:
        info['fatal'] = '檔案內沒有任何題目'
        return info
    single = len(entries) == 1
    for e in entries:
        k = kind_of(e)
        if k and k != P.name:
            er, wa = ['這是「%s」的題目，請在上方切換成「%s」再合併' % (TITLE_OF[k], TITLE_OF[k])], []
        else:
            ctx = dict(ctx_base, name=info['name'], single=single)
            er, wa = P.validate(e, ctx)
        info['entries'].append((e, er, wa))
    return info


def plan_merge(P, paths, items, data):
    """規劃合併內容，回傳 dict：batch / add / replace / same / skipped / warned / file_ok / dups。"""
    ctx_base = P.make_ctx(items, data)
    existing = {P.key(x): x for x in items if isinstance(x, dict)}
    batch, skipped, file_ok, warned = {}, [], {}, 0
    for p in paths:
        info = analyze(P, p, ctx_base, items)
        file_ok[p] = True
        if info['fatal']:
            skipped.append((info['name'], info['fatal']))
            file_ok[p] = False
            continue
        for e, er, wa in info['entries']:
            if er:
                skipped.append((info['name'] + ' ' + P.label_of(e), '；'.join(er[:3]) + ('…' if len(er) > 3 else '')))
                file_ok[p] = False
                continue
            k = P.key(e)
            if k in batch:
                skipped.append((info['name'] + ' ' + P.label_of(e), '與本次另一個檔案重複（%s）' % os.path.basename(batch[k][1])))
                file_ok[p] = False
                continue
            warned += 1 if wa else 0
            batch[k] = (e, p)
    same = sorted((k for k in batch if k in existing and P.same_content(existing[k], batch[k][0])), key=P.key_sort)
    add = sorted((k for k in batch if k not in existing), key=P.key_sort)
    replace = sorted((k for k in batch if k in existing and k not in same), key=P.key_sort)
    for k in same:
        del batch[k]

    dups = {}
    if P.has_dups:   # 問句與既有題目（或本批較前面的題目）雷同 → 交給使用者決定
        refs = [(P.key(x), P.describe(x)) for x in items if isinstance(x, dict) and P.key(x) not in batch]
        for k in sorted(batch, key=P.key_sort):
            hit = P.find_dups(batch[k][0], refs)
            if hit:
                dups[k] = hit
            refs.append((k, P.describe(batch[k][0])))
    return {'batch': batch, 'add': add, 'replace': replace, 'same': same, 'skipped': skipped,
            'warned': warned, 'file_ok': file_ok, 'dups': dups, 'existing': existing}


def drop_keys(plan, keys, reason):
    """把某些題目從計畫中拿掉（該副檔不會被移到 merged）。"""
    for k in keys:
        if k not in plan['batch']:
            continue
        e, p = plan['batch'].pop(k)
        plan['file_ok'][p] = False
        plan['skipped'].append((os.path.basename(p) + ' ' + str(k), reason))
    plan['add'] = [k for k in plan['add'] if k in plan['batch']]
    plan['replace'] = [k for k in plan['replace'] if k in plan['batch']]


def backup_main(main_path, prefix):
    d = os.path.join(os.path.dirname(main_path), 'backup')
    os.makedirs(d, exist_ok=True)
    dst = os.path.join(d, '%s_%s.json' % (prefix, datetime.now().strftime('%Y%m%d_%H%M%S')))
    shutil.copy2(main_path, dst)
    return dst


def write_main(main_path, data):
    tmp = main_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp, main_path)


def move_to_merged(path):
    d = os.path.join(os.path.dirname(path), 'merged')
    os.makedirs(d, exist_ok=True)
    dst = os.path.join(d, os.path.basename(path))
    if os.path.exists(dst):
        stem, ext = os.path.splitext(dst)
        dst = '%s_%s%s' % (stem, datetime.now().strftime('%H%M%S'), ext)
    shutil.move(path, dst)
    return dst


def apply_merge(P, main_path, data, items, keep):
    """備份 → 合併 → 排序 → 寫回主檔。回傳備份檔路徑。"""
    bak = backup_main(main_path, P.backup_prefix)
    new_by_key = {k: v[0] for k, v in keep.items()}
    old_by_key = {P.key(x): x for x in items if isinstance(x, dict)}
    out = [x for x in items if not (isinstance(x, dict) and P.key(x) in new_by_key)]
    for k in sorted(new_by_key, key=P.key_sort):
        e = new_by_key[k]
        P.finalize(e, old_by_key.get(k))
        out.append(e)
    P.sort_items(out)
    if isinstance(data, list):
        data = out
    else:
        data['items'] = out
    write_main(main_path, data)
    return bak


def list_candidates(P, folder, main_path, manual):
    found = []
    try:
        names = sorted(os.listdir(folder))
    except OSError:
        names = []
    for n in names:
        p = os.path.join(folder, n)
        if n.lower().endswith('.json') and os.path.isfile(p) and not n.startswith('.') \
                and n.lower() not in MAIN_NAMES and os.path.abspath(p) != main_path and P.is_candidate(n):
            found.append(os.path.abspath(p))
    for p in manual:
        if p not in found and os.path.abspath(p) != main_path and os.path.isfile(p):
            found.append(p)
    return found


def auto_profile():
    """沒指定時：選「等待合併的副檔最多」的題庫；一樣多就依 daily、photo、part2 順序。"""
    best, best_n = 'daily', -1
    try:
        names = os.listdir(BASE)
    except OSError:
        names = []
    for k in ORDER:
        P = PROFILES[k]
        n = sum(1 for f in names if f.lower().endswith('.json') and f.lower() not in MAIN_NAMES
                and P.is_candidate(f) and P.is_auto(f))
        if n > best_n:
            best, best_n = k, n
    return best


# ───────────────────────── 介面 ─────────────────────────

def run_gui(start):
    import tkinter as tk
    from tkinter import ttk, filedialog, messagebox

    root = tk.Tk()
    root.geometry('1120x720')
    root.minsize(760, 600)

    st = {'prof': PROFILES[start], 'main': None, 'manual': [], 'rows': {}, 'infos': {}}
    move_var = tk.BooleanVar(value=True)
    main_var = tk.StringVar()
    prof_var = tk.StringVar(value=start)
    ttk.Style().configure('Treeview', rowheight=28)

    def P():
        return st['prof']

    # 題庫選擇列
    sel = ttk.Frame(root, padding=(12, 12, 12, 0))
    sel.pack(fill='x')
    ttk.Label(sel, text='題庫：', font=(None, 10, 'bold')).pack(side='left')
    for k in ORDER:
        ttk.Radiobutton(sel, text='%s（%s）' % (PROFILES[k].title, PROFILES[k].main_name), value=k,
                        variable=prof_var, command=lambda: switch()).pack(side='left', padx=(8, 0))

    # 主檔列
    top = ttk.Frame(root, padding=(12, 8, 12, 4))
    top.pack(fill='x')
    ttk.Label(top, text='主檔：', font=(None, 10, 'bold')).pack(side='left')
    ttk.Label(top, textvariable=main_var).pack(side='left', fill='x', expand=True)
    ttk.Button(top, text='更換主檔…', command=lambda: choose_main()).pack(side='right')

    # 副檔列
    mid = ttk.Frame(root, padding=(12, 8, 12, 4))
    mid.pack(fill='x')
    ttk.Label(mid, text='副檔（可多選：Ctrl / Shift）', font=(None, 10, 'bold')).pack(side='left')
    ttk.Button(mid, text='從清單移除', command=lambda: remove_selected()).pack(side='right')
    ttk.Button(mid, text='重新掃描', command=lambda: refresh()).pack(side='right', padx=6)
    ttk.Button(mid, text='新增檔案…', command=lambda: add_files()).pack(side='right')

    # 清單
    box = ttk.Frame(root, padding=(12, 0))
    box.pack(fill='both', expand=True)
    tree = ttk.Treeview(box, columns=('file', 'content', 'status'), show='headings', selectmode='extended', height=8)
    for c, t, w in (('file', '檔名', 170), ('content', '內容', 260), ('status', '狀態', 380)):
        tree.heading(c, text=t)
        tree.column(c, width=w, anchor='w')
    sb = ttk.Scrollbar(box, orient='vertical', command=tree.yview)
    tree.configure(yscrollcommand=sb.set)
    tree.pack(side='left', fill='both', expand=True)
    sb.pack(side='right', fill='y')

    # 詳細訊息
    ttk.Label(root, text='詳細檢查結果（點選上方檔案查看）', padding=(12, 8, 12, 2)).pack(anchor='w')
    dbox = ttk.Frame(root, padding=(12, 0))
    dbox.pack(fill='both', expand=True)
    detail = tk.Text(dbox, height=9, wrap='word', state='disabled', relief='solid', borderwidth=1)
    dsb = ttk.Scrollbar(dbox, orient='vertical', command=detail.yview)
    detail.configure(yscrollcommand=dsb.set)
    detail.pack(side='left', fill='both', expand=True)
    dsb.pack(side='right', fill='y')

    # 底部
    bot = ttk.Frame(root, padding=12)
    bot.pack(fill='x')
    ttk.Checkbutton(bot, text='合併成功後，把副檔移到 merged 資料夾', variable=move_var).pack(side='left')
    ttk.Button(bot, text='合併選取的檔案', command=lambda: do_merge()).pack(side='right')

    def set_detail(text):
        detail.configure(state='normal')
        detail.delete('1.0', 'end')
        detail.insert('1.0', text)
        detail.configure(state='disabled')

    def load_main():
        p = st['main']
        if not p or not os.path.isfile(p):
            return None, None, '找不到主檔'
        data, err = read_json(p)
        if err:
            return None, None, err
        items, err = split_main(data)
        if err:
            return None, None, err
        return data, items, None

    def set_main(p):
        st['main'] = p
        main_var.set(p if p else '（尚未選擇）')

    def choose_main():
        p = filedialog.askopenfilename(parent=root, title='選擇主檔 %s' % P().main_name, initialdir=BASE,
                                       filetypes=[('JSON', '*.json'), ('所有檔案', '*.*')])
        if p:
            set_main(os.path.abspath(p))
            refresh()

    def switch():
        st['prof'] = PROFILES[prof_var.get()]
        st['manual'] = []
        open_default_main()
        refresh()

    def open_default_main():
        root.title('TOEIC Coach ─ 題庫合併工具（%s）' % P().title)
        default = os.path.join(BASE, P().main_name)
        if os.path.isfile(default):
            set_main(default)
        else:
            set_main(None)
            root.update()
            if messagebox.askokcancel('找不到主檔', '在程式所在資料夾找不到 %s。\n要手動選擇主檔嗎？' % P().main_name, parent=root):
                p = filedialog.askopenfilename(parent=root, title='選擇主檔 %s' % P().main_name, initialdir=BASE,
                                               filetypes=[('JSON', '*.json'), ('所有檔案', '*.*')])
                if p:
                    set_main(os.path.abspath(p))

    def refresh(select=None):
        p_ = P()
        data, items, err = load_main()
        items = items or []
        ctx_base = p_.make_ctx(items, data) if data is not None else {}
        existing = {p_.key(x): x for x in items if isinstance(x, dict)}
        tree.delete(*tree.get_children())
        st['rows'], st['infos'] = {}, {}
        auto = []
        for i, p in enumerate(list_candidates(p_, BASE, st['main'], st['manual'])):
            info = analyze(p_, p, ctx_base, items)
            st['infos'][p] = info
            iid = str(i)
            st['rows'][iid] = p
            if info['fatal']:
                content, status = '', '✖ ' + info['fatal']
            else:
                ents = info['entries']
                labs = [p_.label_of(e) for e, _, _ in ents]
                content = (labs[0] + ' ' + p_.describe(ents[0][0])) if len(labs) == 1 else \
                    '%d 筆：%s' % (len(labs), '、'.join(labs[:4]) + ('…' if len(labs) > 4 else ''))
                bad = sum(1 for _, er, _ in ents if er)
                warn = sum(1 for _, er, wa in ents if wa and not er)
                ok_e = [e for e, er, _ in ents if not er]
                same = sum(1 for e in ok_e if p_.key(e) in existing and p_.same_content(existing[p_.key(e)], e))
                over = sum(1 for e in ok_e if p_.key(e) in existing) - same
                new = len(ok_e) - same - over
                if bad == len(ents):
                    status = '✖ 資料有誤：' + ents[0][1][0]
                elif ok_e and same == len(ok_e) and not bad:
                    status = '＝ 內容與主檔相同，不需合併'
                else:
                    parts = ['✔ 可合併' if not bad else '✔ 部分可合併（%d 筆有誤）' % bad]
                    if new:
                        parts.append('新增 %d 筆' % new)
                    if over:
                        parts.append('將更新既有 %d 筆' % over)
                    if same:
                        parts.append('%d 筆相同略過' % same)
                    if warn:
                        parts.append('⚠ 有提醒')
                    status = '，'.join(parts)
            tree.insert('', 'end', iid=iid, values=(os.path.basename(p), content, status))
            good = not info['fatal'] and any(
                not er and not (p_.key(e) in existing and p_.same_content(existing[p_.key(e)], e))
                for e, er, _ in info['entries'])
            if good and (p_.is_auto(os.path.basename(p)) or (select and p in select)):
                auto.append(iid)
        if auto:
            tree.selection_set(auto)
        on_select()
        if err and st['main']:
            set_detail('主檔讀取失敗：%s' % err)
        elif not st['rows']:
            set_detail(p_.empty_hint)

    def on_select(_=None):
        p_ = P()
        lines = []
        for iid in tree.selection():
            info = st['infos'].get(st['rows'].get(iid))
            if not info:
                continue
            lines.append('【%s】' % info['name'])
            if info['fatal']:
                lines.append('  ✖ ' + info['fatal'])
            for e, er, wa in info['entries']:
                lines.append('  %s  %s' % (p_.label_of(e), str(e.get('tag', '')) if isinstance(e, dict) else ''))
                lines += p_.extra_detail(e)
                lines += ['     ✖ ' + m for m in er] + ['     ⚠ ' + m for m in wa]
                if not er and not wa:
                    lines.append('     ✔ 檢查通過')
            lines.append('')
        if lines:
            set_detail('\n'.join(lines))

    tree.bind('<<TreeviewSelect>>', on_select)

    def add_files():
        ps = filedialog.askopenfilenames(parent=root, title='選擇要合併的副檔（可多選）', initialdir=BASE,
                                         filetypes=[('JSON', '*.json'), ('所有檔案', '*.*')])
        if not ps:
            return
        ps = [os.path.abspath(p) for p in ps]
        for p in ps:
            if p not in st['manual']:
                st['manual'].append(p)
        refresh(select=set(ps))

    def remove_selected():
        for iid in tree.selection():
            p = st['rows'].get(iid)
            if p in st['manual']:
                st['manual'].remove(p)
        refresh()

    def do_merge():
        p_ = P()
        if not st['main']:
            messagebox.showwarning('尚未選擇主檔', '請先按「更換主檔…」選擇 %s。' % p_.main_name, parent=root)
            return
        data, items, err = load_main()
        if err:
            messagebox.showerror('主檔無法使用', err, parent=root)
            return
        paths = [st['rows'][i] for i in tree.selection() if i in st['rows']]
        if not paths:
            messagebox.showinfo('沒有選取檔案', '請先在清單中選取要合併的副檔。', parent=root)
            return

        plan = plan_merge(p_, paths, items, data)
        fmt = lambda ks: '、'.join(p_.fmt_key(k) for k in ks)

        # ① 問句雷同 → 逐題讓使用者決定（part2）
        if plan['dups']:
            rejected = []
            for k in sorted(plan['dups'], key=p_.key_sort):
                e = plan['batch'][k][0]
                msg = '新題 %s 的問句：\n    %s\n\n與已有題目雷同：\n%s\n\n「是」＝仍然合併　「否」＝拒絕這題　「取消」＝中止全部' % (
                    p_.fmt_key(k), p_.describe(e), '\n'.join('  • %s：%s' % (i, t) for i, t in plan['dups'][k][:4]))
                ans = messagebox.askyesnocancel('問句重複 %s' % p_.fmt_key(k), msg, parent=root)
                if ans is None:
                    return
                if ans is False:
                    rejected.append(k)
            drop_keys(plan, rejected, '問句與既有題目雷同，已拒絕')

        total = len(plan['add']) + len(plan['replace'])
        if not total:
            msg = '選取的檔案中沒有可以合併的題目。'
            if plan['same']:
                msg += '\n\n內容與主檔相同（略過）：' + fmt(plan['same'])
            if plan['skipped']:
                msg += '\n\n' + '\n'.join('• %s：%s' % s for s in plan['skipped'])
            if plan['same'] and not plan['skipped']:
                messagebox.showinfo('不需更新', msg, parent=root)
            else:
                messagebox.showwarning('無法合併', msg, parent=root)
            return

        lines = ['即將合併 %d 筆到 %s：' % (total, os.path.basename(st['main'])), '']
        if plan['add']:
            lines.append('新增：' + fmt(plan['add']))
        if plan['replace']:
            lines.append('內容不同、將更新（覆蓋舊的）：')
            for k in plan['replace']:
                lines.append('  • %s  舊：%s' % (p_.fmt_key(k), p_.describe(plan['existing'][k])))
                lines.append('      新：%s' % p_.describe(plan['batch'][k][0]))
        if plan['same']:
            lines.append('內容與主檔相同（略過）：' + fmt(plan['same']))
        if plan['warned']:
            lines.append('（其中 %d 筆有提醒，可在詳細結果查看）' % plan['warned'])
        if plan['skipped']:
            lines += ['', '略過：'] + ['• %s：%s' % s for s in plan['skipped']]
        lines += ['', '寫入前會自動備份到 backup 資料夾。']

        if plan['replace']:
            lines += ['', '主檔已有 %s，但內容和副檔不同。' % fmt(plan['replace']),
                      '「是」＝用副檔更新　「否」＝保留主檔舊的（只新增其他）　「取消」＝中止']
            ans = messagebox.askyesnocancel('確認合併', '\n'.join(lines), parent=root)
            if ans is None:
                return
            if ans is False:
                drop_keys(plan, list(plan['replace']), '保留主檔舊的')
                if not plan['batch']:
                    messagebox.showinfo('沒有變更', '沒有要新增的題目，未做任何修改。', parent=root)
                    return
        elif not messagebox.askokcancel('確認合併', '\n'.join(lines), parent=root):
            return

        keep = dict(plan['batch'])
        try:
            bak = apply_merge(p_, st['main'], data, items, keep)
        except Exception as ex:
            messagebox.showerror('寫入失敗', '主檔沒有被修改。\n\n%s' % ex, parent=root)
            return

        moved = []
        if move_var.get():
            for p, ok in plan['file_ok'].items():
                if ok:
                    try:
                        move_to_merged(p)
                        moved.append(os.path.basename(p))
                        if p in st['manual']:
                            st['manual'].remove(p)
                    except Exception:
                        pass
        msg = '完成！已合併 %d 筆（新增 %d、更新 %d）。\n備份：%s' % (
            len(keep), len([k for k in keep if k in plan['add']]), len([k for k in keep if k in plan['replace']]),
            os.path.relpath(bak, BASE))
        if moved:
            msg += '\n已移到 merged：' + '、'.join(moved)
        msg += '\n\n' + p_.done_note
        refresh()
        messagebox.showinfo('合併完成', msg, parent=root)

    open_default_main()
    refresh()
    root.mainloop()


def main():
    start = auto_profile()
    if len(sys.argv) > 1:
        a = sys.argv[1].lower().replace('.json', '').replace('_merge', '').replace('_jsonmerge', '')
        if a in PROFILES:
            start = a
        else:
            print('用法：python json_merge.py [daily|photo|part2|part3|part4|part5|part6|part7]', file=sys.stderr)
    try:
        run_gui(start)
    except Exception:
        tb = traceback.format_exc()
        try:
            import tkinter as tk
            from tkinter import messagebox
            r = tk.Tk()
            r.withdraw()
            messagebox.showerror('發生錯誤', tb)
        except Exception:
            print(tb, file=sys.stderr)
            input('按 Enter 結束…')


if __name__ == '__main__':
    main()
