#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TOEIC Part 1 照片題庫 ─ 合併工具（給 photo.json 用）

用法：把這支程式放在 photo.json 同一個資料夾，雙擊執行。
  1. 自動找出主檔 photo.json，並列出同資料夾內「檔名是題目 id」的 .json（例如 d1-002-m.json）作為副檔；
     其他名稱的 .json（例如 data.json）不會列出，需要時請按「新增檔案…」手動加入。
  2. 選取要合併的副檔（可多選：Ctrl / Shift），按「合併」→ 確認 → 寫回 photo.json（寫入前自動備份到 backup 資料夾）。
副檔可以是：單一題目物件、題目陣列、或含 items 的物件；AI 貼出的 ```json 圍欄也能自動處理。
AI 回傳 {"id": ..., "skip": ...} 代表它寫不出該難度，會被擋下，不會合併。
"""
import json
import os
import re
import shutil
import sys
import traceback
from datetime import datetime

BASE = os.path.dirname(os.path.abspath(__file__))
MAIN_NAME = 'photo.json'
ID_RE = re.compile(r'^d([1-7])-(\d{3})-([emh])$')
TIER = {'e': 'easy', 'm': 'medium', 'h': 'hard'}
TIER_ZH = {'easy': '初級', 'medium': '中級', 'hard': '高級'}
TIER_RANGE = {'easy': (500, 550), 'medium': (600, 650), 'hard': (700, 800)}   # 與 photo.json 的 tiers.*.score 一致
PHOTO_TYPES = ('single', 'multi', 'none')
TRAPS = ('sound-alike', 'not-in-photo', 'wrong-action', 'wrong-place-or-number', 'over-inference')
OLD_FIELDS = ('focus', 'set', 'no', 'ans', 'statements', 'zh', 'why', 'traps', 'audio')
DEFAULT_SCENES = {'d1': ['office'], 'd2': ['restaurant'], 'd3': ['store'], 'd4': ['street', 'station'],
                  'd5': ['workplace'], 'd6': ['hotel', 'home'], 'd7': ['outdoor']}


# ───────────────────────── 資料處理（與介面無關） ─────────────────────────

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


def get_entries(data):
    if isinstance(data, list):
        return data, None
    if isinstance(data, dict):
        if isinstance(data.get('items'), list):
            return data['items'], None
        if 'id' in data:
            return [data], None
    return None, '不是題庫資料（需為單一題目物件、題目陣列，或含 items 的物件）'


def domains_of(data):
    """主題對照：以主檔 _spec.domains 為準，沒有就用預設。"""
    d = data.get('_spec', {}).get('domains') if isinstance(data, dict) else None
    if isinstance(d, dict) and d:
        return {k: list(v.get('scenes', [])) for k, v in d.items() if isinstance(v, dict)}
    return DEFAULT_SCENES


def eid(e):
    return e.get('id') if isinstance(e, dict) else None


def img_code(i):
    return re.sub(r'-[emh]$', '', str(i))


def norm(s):
    return re.sub(r'[^a-z0-9 ]', '', str(s).lower()).strip()


def n_words(s):
    return len(re.findall(r"[A-Za-z0-9']+", str(s)))


def cefr_of_score(s):
    return 'A2+' if s <= 550 else 'B1' if s == 600 else 'B1+' if s == 650 else 'B2' if s <= 750 else 'B2+'


def label_of(e):
    return str(eid(e) or '（無 id）')


def same_content(a, b):
    return a == b


def validate(e, ctx):
    """檢查單筆題目，回傳 (errors, warnings)。errors 會擋下合併，warnings 只提醒。
    ctx = {'others': 主檔內「其他 id」的題目, 'domains': {...}, 'base': 圖片根目錄}"""
    er, wa = [], []
    if not isinstance(e, dict):
        return ['內容不是物件'], wa
    if 'skip' in e:
        return ['AI 回報寫不出這個難度，不應合併：%s' % e.get('skip')], wa

    m = ID_RE.match(str(e.get('id', '')))
    if not m:
        return ['id 格式必須是 d{1-7}-{3 位數}-{e|m|h}，例如 d1-002-m'], wa
    dom, suffix = 'd' + m.group(1), m.group(3)
    others = ctx['others']

    # domain / scene
    if e.get('domain') != dom:
        er.append('domain 應為 %s（要等於 id 前段），目前是 %r' % (dom, e.get('domain')))
    scenes = ctx['domains'].get(dom, [])
    if e.get('scene') not in scenes:
        er.append('scene %r 不屬於 %s（可用：%s）' % (e.get('scene'), dom, '、'.join(scenes)))
    # photo_type 只是依圖片實際人數的記錄，不再綁定難度；有填的話必須是合法值
    if e.get('photo_type') not in (None, '') and e.get('photo_type') not in PHOTO_TYPES:
        er.append('photo_type 若有填，必須是 %s（依圖片實際人數）' % ' / '.join(PHOTO_TYPES))
    if not str(e.get('tag') or '').strip():
        er.append('缺少 tag')

    # level
    lv = e.get('level')
    if not isinstance(lv, dict):
        er.append('缺少 level')
    else:
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

    # image：一題一張圖，檔名 images/{id}.jpg
    img = e.get('image')
    if not isinstance(img, str) or not re.match(r'^images/.+\.jpg$', img):
        er.append('image 必須是 images/xxx.jpg 的路徑')
    else:
        if img != 'images/%s.jpg' % e['id']:
            wa.append('image 建議為 images/%s.jpg（目前是 %s）' % (e['id'], img))
        share = [eid(o) for o in others if o.get('image') == img]
        if share:
            wa.append('與 %s 共用同一張圖片；每題應各有獨立的圖' % '、'.join(share))
        if not os.path.isfile(os.path.join(ctx['base'], img)):
            wa.append('找不到圖片檔 %s（記得放進 images 資料夾）' % img)

    # pool
    pool = e.get('pool')
    texts = []
    if not isinstance(pool, list) or len(pool) != 12:
        er.append('pool 必須剛好 12 句（目前 %s）' % (len(pool) if isinstance(pool, list) else '沒有'))
    else:
        n_ok = 0
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
            elif p.get('trap') not in TRAPS:
                er.append('pool 第 %d 句 trap 不合法：%r' % (i, p.get('trap')))
            if not str(p.get('zh') or '').strip():
                wa.append('pool 第 %d 句缺少 zh' % i)
            if not str(p.get('why') or '').strip():
                wa.append('pool 第 %d 句缺少 why' % i)
            if not 6 <= n_words(p['t']) <= 14:
                wa.append('pool 第 %d 句有 %d 個字（建議 6–14）' % (i, n_words(p['t'])))
        if n_ok != 3:
            er.append('pool 必須 3 句 ok:true、9 句 ok:false（目前 ok:true 有 %d 句）' % n_ok)
        if len(set(texts)) != len(texts):
            er.append('pool 裡有重複的句子')
        # 與主檔其他題目的句子重複
        seen = {}
        for o in others:
            for p in (o.get('pool') or []):
                if isinstance(p, dict):
                    seen.setdefault(norm(p.get('t', '')), eid(o))
        dup = sorted({seen[t] for t in texts if t in seen})
        if dup:
            wa.append('有句子與既有題目重複：%s' % '、'.join(dup))

    # vocab
    vocab = e.get('vocab')
    blob = ' '.join(texts)
    if not isinstance(vocab, list) or not vocab:
        er.append('缺少 vocab')
    else:
        if not 2 <= len(vocab) <= 4:
            wa.append('vocab 有 %d 個（建議 2–4 個）' % len(vocab))
        used = {str(v.get('word', '')).lower() for o in others for v in (o.get('vocab') or []) if isinstance(v, dict)}
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
            if texts and not re.search(r'\b' + re.escape(stem), blob):
                wa.append('單字「%s」沒有出現在 pool 的句子中' % v['word'])
            if w in used:
                wa.append('單字「%s」與其他題目重複' % v['word'])

    # tag 重複（不同圖片）
    tag = str(e.get('tag') or '').strip()
    if tag and any(o.get('tag') == tag for o in others):
        wa.append('tag「%s」與其他題目相同' % tag)

    old = [k for k in OLD_FIELDS if k in e]
    if old:
        wa.append('含舊欄位（網頁不使用）：%s' % '、'.join(old))
    if 'issues' not in e:
        wa.append('沒有 issues 欄位（無瑕疵請填 []）')
    elif e['issues']:
        wa.append('圖片備註：%s' % '；'.join(map(str, e['issues'])))
    return er, wa


def analyze(path, items, domains):
    info = {'path': path, 'name': os.path.basename(path), 'fatal': None, 'entries': []}
    try:
        data, err = read_json(path)
    except Exception as ex:
        info['fatal'] = '無法讀取：%s' % ex
        return info
    if err:
        info['fatal'] = err
        return info
    entries, err = get_entries(data)
    if err:
        info['fatal'] = err
        return info
    if not entries:
        info['fatal'] = '檔案內沒有任何題目'
        return info
    for e in entries:
        ctx = {'others': [o for o in items if isinstance(o, dict) and eid(o) != eid(e)],
               'domains': domains, 'base': BASE}
        er, wa = validate(e, ctx)
        info['entries'].append((e, er, wa))
    return info


def backup_main(main_path):
    d = os.path.join(os.path.dirname(main_path), 'backup')
    os.makedirs(d, exist_ok=True)
    dst = os.path.join(d, 'photo_%s.json' % datetime.now().strftime('%Y%m%d_%H%M%S'))
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


def sort_key(e):
    m = ID_RE.match(str(eid(e)))
    return (int(m.group(1)), int(m.group(2)), 'emh'.index(m.group(3))) if m else (99, 0, 0)


def plan_merge(paths, items, domains):
    """回傳 dict：batch{id:(entry,path)} / add / replace / same / skipped / warned / file_ok"""
    existing = {eid(x): x for x in items if isinstance(x, dict)}
    batch, skipped, file_ok, warned = {}, [], {}, 0
    for p in paths:
        info = analyze(p, items, domains)
        file_ok[p] = True
        if info['fatal']:
            skipped.append((info['name'], info['fatal']))
            file_ok[p] = False
            continue
        for e, er, wa in info['entries']:
            if er:
                skipped.append((info['name'] + ' ' + label_of(e), '；'.join(er[:3]) + ('…' if len(er) > 3 else '')))
                file_ok[p] = False
                continue
            k = eid(e)
            if k in batch:
                skipped.append((info['name'] + ' ' + k, '與本次另一個檔案重複（%s）' % os.path.basename(batch[k][1])))
                file_ok[p] = False
                continue
            warned += 1 if wa else 0
            batch[k] = (e, p)
    same = sorted(k for k in batch if k in existing and same_content(existing[k], batch[k][0]))
    add = sorted((k for k in batch if k not in existing), key=lambda k: sort_key({'id': k}))
    replace = sorted(k for k in batch if k in existing and k not in same)
    for k in same:
        del batch[k]
    return {'batch': batch, 'add': add, 'replace': replace, 'same': same, 'skipped': skipped,
            'warned': warned, 'file_ok': file_ok}


# ───────────────────────── 介面 ─────────────────────────

def run_gui():
    import tkinter as tk
    from tkinter import ttk, filedialog, messagebox

    root = tk.Tk()
    root.title('TOEIC Part 1 ─ 照片題庫合併工具')
    root.geometry('900x680')
    root.minsize(760, 560)

    st = {'main': None, 'manual': [], 'rows': {}, 'infos': {}}
    move_var = tk.BooleanVar(value=True)
    main_var = tk.StringVar()
    ttk.Style().configure('Treeview', rowheight=28)

    top = ttk.Frame(root, padding=(12, 12, 12, 4))
    top.pack(fill='x')
    ttk.Label(top, text='主檔：', font=(None, 10, 'bold')).pack(side='left')
    ttk.Label(top, textvariable=main_var).pack(side='left', fill='x', expand=True)
    ttk.Button(top, text='更換主檔…', command=lambda: choose_main()).pack(side='right')

    mid = ttk.Frame(root, padding=(12, 8, 12, 4))
    mid.pack(fill='x')
    ttk.Label(mid, text='副檔（可多選：Ctrl / Shift）', font=(None, 10, 'bold')).pack(side='left')
    ttk.Button(mid, text='從清單移除', command=lambda: remove_selected()).pack(side='right')
    ttk.Button(mid, text='重新掃描', command=lambda: refresh()).pack(side='right', padx=6)
    ttk.Button(mid, text='新增檔案…', command=lambda: add_files()).pack(side='right')

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

    ttk.Label(root, text='詳細檢查結果（點選上方檔案查看）', padding=(12, 8, 12, 2)).pack(anchor='w')
    dbox = ttk.Frame(root, padding=(12, 0))
    dbox.pack(fill='both', expand=True)
    detail = tk.Text(dbox, height=9, wrap='word', state='disabled', relief='solid', borderwidth=1)
    dsb = ttk.Scrollbar(dbox, orient='vertical', command=detail.yview)
    detail.configure(yscrollcommand=dsb.set)
    detail.pack(side='left', fill='both', expand=True)
    dsb.pack(side='right', fill='y')

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
        p = filedialog.askopenfilename(parent=root, title='選擇主檔 photo.json', initialdir=BASE,
                                       filetypes=[('JSON', '*.json'), ('所有檔案', '*.*')])
        if p:
            set_main(os.path.abspath(p))
            refresh()

    def candidates():
        found = []
        try:
            names = sorted(os.listdir(BASE))
        except OSError:
            names = []
        for n in names:
            p = os.path.join(BASE, n)
            if n.lower().endswith('.json') and os.path.isfile(p) and not n.startswith('.') \
                    and ID_RE.match(os.path.splitext(n)[0]) and os.path.abspath(p) != st['main']:
                found.append(os.path.abspath(p))
        for p in st['manual']:
            if p not in found and os.path.abspath(p) != st['main'] and os.path.isfile(p):
                found.append(p)
        return found

    def refresh(select=None):
        data, items, err = load_main()
        items = items or []
        domains = domains_of(data)
        existing = {eid(x): x for x in items if isinstance(x, dict)}
        tree.delete(*tree.get_children())
        st['rows'], st['infos'] = {}, {}
        auto = []
        for i, p in enumerate(candidates()):
            info = analyze(p, items, domains)
            st['infos'][p] = info
            iid = str(i)
            st['rows'][iid] = p
            if info['fatal']:
                content, status = '', '✖ ' + info['fatal']
            else:
                ids = [label_of(e) for e, _, _ in info['entries']]
                content = ids[0] + ' ' + str(info['entries'][0][0].get('tag', '')) if len(ids) == 1 else '%d 筆：%s' % (len(ids), '、'.join(ids[:4]) + ('…' if len(ids) > 4 else ''))
                bad = sum(1 for _, er, _ in info['entries'] if er)
                warn = sum(1 for _, er, wa in info['entries'] if wa and not er)
                ok_e = [e for e, er, _ in info['entries'] if not er]
                same = sum(1 for e in ok_e if eid(e) in existing and same_content(existing[eid(e)], e))
                over = sum(1 for e in ok_e if eid(e) in existing) - same
                new = len(ok_e) - same - over
                if bad == len(info['entries']):
                    status = '✖ 資料有誤：' + info['entries'][0][1][0]
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
                not er and not (eid(e) in existing and same_content(existing[eid(e)], e))
                for e, er, _ in info['entries'])
            if good and (ID_RE.match(os.path.splitext(os.path.basename(p))[0]) or (select and p in select)):
                auto.append(iid)
        if auto:
            tree.selection_set(auto)
        on_select()
        if err and st['main']:
            set_detail('主檔讀取失敗：%s' % err)
        elif not st['rows']:
            set_detail('資料夾內沒有找到其他 .json 檔。\n請把 AI 回傳的 JSON 存成 d1-002-m.json 這類檔名放進來，或按「新增檔案…」手動選取。')

    def on_select(_=None):
        lines = []
        for iid in tree.selection():
            info = st['infos'].get(st['rows'].get(iid))
            if not info:
                continue
            lines.append('【%s】' % info['name'])
            if info['fatal']:
                lines.append('  ✖ ' + info['fatal'])
            for e, er, wa in info['entries']:
                lines.append('  %s  %s' % (label_of(e), e.get('tag', '') if isinstance(e, dict) else ''))
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
        if not st['main']:
            messagebox.showwarning('尚未選擇主檔', '請先按「更換主檔…」選擇 photo.json。', parent=root)
            return
        data, items, err = load_main()
        if err:
            messagebox.showerror('主檔無法使用', err, parent=root)
            return
        paths = [st['rows'][i] for i in tree.selection() if i in st['rows']]
        if not paths:
            messagebox.showinfo('沒有選取檔案', '請先在清單中選取要合併的副檔。', parent=root)
            return
        plan = plan_merge(paths, items, domains_of(data))
        total = len(plan['add']) + len(plan['replace'])
        fmt = lambda ks: '、'.join(ks)
        if not total:
            msg = '選取的檔案中沒有可以合併的題目。'
            if plan['same']:
                msg += '\n\n內容與主檔相同（略過）：' + fmt(plan['same'])
            if plan['skipped']:
                msg += '\n\n' + '\n'.join('• %s：%s' % s for s in plan['skipped'])
            messagebox.showwarning('無法合併', msg, parent=root)
            return

        lines = ['即將合併 %d 筆到 %s：' % (total, os.path.basename(st['main'])), '']
        if plan['add']:
            lines.append('新增：' + fmt(plan['add']))
        if plan['replace']:
            lines.append('內容不同、將更新（覆蓋舊的）：' + fmt(plan['replace']))
        if plan['same']:
            lines.append('內容與主檔相同（略過）：' + fmt(plan['same']))
        if plan['warned']:
            lines.append('（其中 %d 筆有提醒，可在詳細結果查看）' % plan['warned'])
        if plan['skipped']:
            lines += ['', '略過：'] + ['• %s：%s' % s for s in plan['skipped']]
        lines += ['', '寫入前會自動備份到 backup 資料夾。']

        keep = dict(plan['batch'])
        if plan['replace']:
            lines += ['', '主檔已有 %s，但內容不同。' % fmt(plan['replace']),
                      '「是」＝用副檔更新　「否」＝保留主檔舊的（只新增其他）　「取消」＝中止']
            ans = messagebox.askyesnocancel('確認合併', '\n'.join(lines), parent=root)
            if ans is None:
                return
            if ans is False:
                for k in plan['replace']:
                    keep.pop(k, None)
                    plan['file_ok'][plan['batch'][k][1]] = False
                if not keep:
                    messagebox.showinfo('沒有變更', '沒有要新增的題目，未做任何修改。', parent=root)
                    return
        elif not messagebox.askokcancel('確認合併', '\n'.join(lines), parent=root):
            return

        try:
            bak = backup_main(st['main'])
            new_by_id = {k: v[0] for k, v in keep.items()}
            out = [x for x in items if not (isinstance(x, dict) and eid(x) in new_by_id)]
            out += [new_by_id[k] for k in new_by_id]
            out.sort(key=sort_key)
            if isinstance(data, list):
                data = out
            else:
                data['items'] = out
            write_main(st['main'], data)
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
        msg += '\n\n記得把對應的圖片放進 images 資料夾，並重新整理網頁。'
        refresh()
        messagebox.showinfo('合併完成', msg, parent=root)

    default = os.path.join(BASE, MAIN_NAME)
    if os.path.isfile(default):
        set_main(default)
    else:
        set_main(None)
        root.update()
        if messagebox.askokcancel('找不到主檔', '在程式所在資料夾找不到 %s。\n要手動選擇主檔嗎？' % MAIN_NAME, parent=root):
            choose_main()
    refresh()
    root.mainloop()


def main():
    try:
        run_gui()
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
