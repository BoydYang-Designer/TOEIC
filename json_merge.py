#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TOEIC Coach ─ 題庫合併工具（daily / photo / part2 共用）

用法：把這支程式放在 daily.json、photo.json、part2.json 所在的資料夾，雙擊執行。
  1. 最上方選擇題庫：每日文章（daily.json）／Part 1 照片（photo.json）／Part 2 應答（part2.json）。
     啟動時會自動選「資料夾內等待合併的副檔最多」的那一個；也可用  python json_merge.py part2  直接指定。
  2. 自動列出該題庫的副檔：
       daily  → w1d3.json 這類（其他 .json 也會列出，但不會自動勾選）
       photo  → d1-002-m.json 這類（檔名是題目 id）
       part2  → p2_d1-001-h_x5.json 這類（網頁「新增題目」產生的檔名）
     找不到的可用「新增檔案…」手動加入。
  3. 選取要合併的副檔（可多選：Ctrl / Shift）→「合併」→ 確認 → 寫回主檔（寫入前自動備份到 backup 資料夾）。
副檔可以是：單筆題目、題目陣列、或含 items 的物件；AI 貼出的 ```json 圍欄也能自動處理。
選錯題庫時（例如把 part2 的檔案放在 daily 模式），會直接提示「這是哪個題庫的題目」。
"""
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
    done_note = '記得把對應的 mp3 放進 audio 資料夾（例如 audio/w1d3.mp3），並完成 timing 對時。'

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
        """不比對 timing（主檔的 timing 通常已對時、副檔是空的）。"""
        strip = lambda e: {k: v for k, v in e.items() if k != 'timing'}
        return isinstance(a, dict) and isinstance(b, dict) and strip(a) == strip(b)

    def finalize(self, e, old):
        e.setdefault('timing', [])
        if old and not e['timing'] and old.get('passage') == e.get('passage'):
            e['timing'] = old.get('timing', [])   # 文稿沒變 → 保留舊的對時資料

    def sort_items(self, items):
        if all(isinstance(x, dict) and isinstance(x.get('week'), int) and isinstance(x.get('day'), int) for x in items):
            items.sort(key=lambda x: (x['week'], x['day']))

    def make_ctx(self, items, data):
        return {}

    def extra_detail(self, e):
        if isinstance(e, dict) and isinstance(e.get('questions'), list):
            return ['     題數 %d、單字 %d、type %s' % (len(e['questions']), len(e.get('vocab') or []), e.get('type'))]
        return []

    def validate(self, e, ctx):
        er, wa = [], []
        if not isinstance(e, dict):
            return ['內容不是物件'], wa
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
    main_name = 'photo.json'
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


PROFILES = {'daily': Daily(), 'photo': Photo(), 'part2': Part2()}
ORDER = ('daily', 'photo', 'part2')
MAIN_NAMES = {p.main_name.lower() for p in PROFILES.values()}
TITLE_OF = {k: v.title for k, v in PROFILES.items()}


def kind_of(e):
    """依欄位判斷這筆題目屬於哪個題庫；看不出來回傳 None。"""
    if not isinstance(e, dict):
        return None
    if 'week' in e or 'passage' in e:
        return 'daily'
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
    root.geometry('900x720')
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
            print('用法：python json_merge.py [daily|photo|part2]', file=sys.stderr)
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
