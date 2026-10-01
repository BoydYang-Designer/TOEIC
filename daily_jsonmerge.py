#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TOEIC Daily Coach ─ 題庫合併工具

用法：把這支程式放在 daily.json 同一個資料夾，雙擊執行。
  1. 自動找出主檔 daily.json，並列出同資料夾內其他 .json（例如 w1d3.json）作為副檔。
  2. 在清單中選取要合併的副檔（可多選：Ctrl / Shift），找不到的可用「新增檔案…」手動加入。
  3. 按「合併」→ 確認 → 寫回 daily.json（寫入前自動備份到 backup 資料夾）。
副檔可以是：單筆題目、題目陣列、或含 items 的物件；AI 貼出的 ```json 圍欄也能自動處理。
"""
import json
import os
import re
import shutil
import sys
import traceback
from datetime import datetime

BASE = os.path.dirname(os.path.abspath(__file__))
MAIN_NAME = 'daily.json'
NAME_RE = re.compile(r'^w(\d+)d(\d+)', re.I)


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
    """把主檔資料拆成 (items 清單, 錯誤訊息)。"""
    if isinstance(data, list):
        return data, None
    if isinstance(data, dict) and isinstance(data.get('items'), list):
        return data['items'], None
    return None, '主檔格式不正確（需為陣列，或含 items 陣列的物件）'


def get_entries(data):
    """把副檔資料整理成題目清單，回傳 (entries, 錯誤訊息)。"""
    if isinstance(data, list):
        return data, None
    if isinstance(data, dict):
        for k in ('items', 'week_entries', 'entries'):
            if isinstance(data.get(k), list):
                return data[k], None
        if 'week' in data and 'day' in data:
            return [data], None
    return None, '不是題庫資料（需為單筆題目、題目陣列，或含 items 的物件）'


def key_of(e):
    return (e.get('week'), e.get('day'))


def same_content(a, b):
    """兩筆題目內容是否相同（不比對 timing，因為主檔的 timing 通常已對時、副檔則是空的）。"""
    strip = lambda e: {k: v for k, v in e.items() if k != 'timing'}
    return isinstance(a, dict) and isinstance(b, dict) and strip(a) == strip(b)


def label_of(e):
    if isinstance(e, dict) and isinstance(e.get('week'), int) and isinstance(e.get('day'), int):
        return 'W%d D%d' % (e['week'], e['day'])
    return '（無 week/day）'


def validate(e, filename=None, single=False):
    """檢查單筆題目，回傳 (errors, warnings)。errors 會擋下合併，warnings 只提醒。"""
    er, wa = [], []
    if not isinstance(e, dict):
        return ['內容不是物件'], wa

    # 基本欄位
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

    # 檔名與內容是否一致（例如 w1d3.json 裡卻是 day 2）
    if filename and single:
        m = NAME_RE.match(filename)
        if m and (int(m.group(1)), int(m.group(2))) != key_of(e):
            wa.append('檔名是 w%sd%s，但內容是 week %s／day %s' % (m.group(1), m.group(2), e.get('week'), e.get('day')))

    # level
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

    # vocab
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

    # questions
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

    # D7 簡報句型
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

    # timing
    if 'timing' not in e:
        wa.append('沒有 timing，合併時會補上空陣列（需另外對時）')
    elif not isinstance(e['timing'], list):
        er.append('timing 必須是陣列')
    elif not e['timing']:
        wa.append('timing 是空的（尚未對時，網頁只會顯示純文字文稿）')
    return er, wa


def analyze(path):
    """分析一個副檔。回傳 dict：path / name / fatal / entries[(entry, errors, warnings)]。"""
    info = {'path': path, 'name': os.path.basename(path), 'fatal': None, 'entries': []}
    try:
        data, err = read_json(path)
    except Exception as ex:  # 讀檔失敗（權限、編碼…）
        info['fatal'] = '無法讀取：%s' % ex
        return info
    if err:
        info['fatal'] = err
        return info
    entries, err = get_entries(data)
    if err:
        info['fatal'] = err
        return info
    single = len(entries) == 1
    for e in entries:
        er, wa = validate(e, info['name'], single)
        info['entries'].append((e, er, wa))
    if not entries:
        info['fatal'] = '檔案內沒有任何題目'
    return info


def backup_main(main_path):
    d = os.path.join(os.path.dirname(main_path), 'backup')
    os.makedirs(d, exist_ok=True)
    dst = os.path.join(d, 'daily_%s.json' % datetime.now().strftime('%Y%m%d_%H%M%S'))
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


def sort_items(items):
    if all(isinstance(x, dict) and isinstance(x.get('week'), int) and isinstance(x.get('day'), int) for x in items):
        items.sort(key=lambda x: (x['week'], x['day']))


def plan_merge(paths, main_items):
    """規劃合併內容，回傳 dict：add / replace / skipped / files。"""
    existing = {key_of(x): x for x in main_items if isinstance(x, dict)}
    batch = {}          # key -> (entry, path)
    skipped = []        # (檔名, 說明)
    warned = 0
    file_ok = {}        # path -> 該檔所有題目是否都會被處理
    for p in paths:
        info = analyze(p)
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
            k = key_of(e)
            if k in batch:
                skipped.append((info['name'] + ' ' + label_of(e), '與本次另一個檔案重複（%s）' % os.path.basename(batch[k][1])))
                file_ok[p] = False
                continue
            if wa:
                warned += 1
            batch[k] = (e, p)
    add = sorted(k for k in batch if k not in existing)
    same = sorted(k for k in batch if k in existing and same_content(existing[k], batch[k][0]))
    replace = sorted(k for k in batch if k in existing and k not in same)
    for k in same:                       # 內容與主檔相同 → 不處理
        del batch[k]
    return {'batch': batch, 'add': add, 'replace': replace, 'same': same, 'skipped': skipped,
            'warned': warned, 'file_ok': file_ok}


# ───────────────────────── 介面 ─────────────────────────

def run_gui():
    import tkinter as tk
    from tkinter import ttk, filedialog, messagebox

    root = tk.Tk()
    root.title('TOEIC Daily Coach ─ 題庫合併工具')
    root.geometry('900x680')
    root.minsize(760, 560)

    st = {'main': None, 'manual': [], 'rows': {}, 'infos': {}}
    move_var = tk.BooleanVar(value=True)
    main_var = tk.StringVar()

    ttk.Style().configure('Treeview', rowheight=28)

    # 主檔列
    top = ttk.Frame(root, padding=(12, 12, 12, 4))
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
    cols = ('file', 'content', 'status')
    tree = ttk.Treeview(box, columns=cols, show='headings', selectmode='extended', height=8)
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
    merge_btn = ttk.Button(bot, text='合併選取的檔案', command=lambda: do_merge())
    merge_btn.pack(side='right')

    def set_detail(text):
        detail.configure(state='normal')
        detail.delete('1.0', 'end')
        detail.insert('1.0', text)
        detail.configure(state='disabled')

    # 主檔
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
        p = filedialog.askopenfilename(parent=root, title='選擇主檔 daily.json', initialdir=BASE,
                                       filetypes=[('JSON', '*.json'), ('所有檔案', '*.*')])
        if p:
            set_main(os.path.abspath(p))
            refresh()

    # 副檔清單
    def candidates():
        found = []
        try:
            names = sorted(os.listdir(BASE))
        except OSError:
            names = []
        for n in names:
            p = os.path.join(BASE, n)
            if n.lower().endswith('.json') and os.path.isfile(p) and \
                    not n.startswith('.') and os.path.abspath(p) != st['main']:
                found.append(os.path.abspath(p))
        for p in st['manual']:
            if p not in found and os.path.abspath(p) != st['main'] and os.path.isfile(p):
                found.append(p)
        return found

    def refresh(select=None):
        _, items, err = load_main()
        existing = {key_of(x): x for x in (items or []) if isinstance(x, dict)}
        tree.delete(*tree.get_children())
        st['rows'], st['infos'] = {}, {}
        auto_select = []
        for i, p in enumerate(candidates()):
            info = analyze(p)
            st['infos'][p] = info
            iid = str(i)
            st['rows'][iid] = p
            if info['fatal']:
                content, status = '', '✖ ' + info['fatal']
            else:
                labs = [label_of(e) for e, _, _ in info['entries']]
                tags = [str(e.get('tag', '')) for e, _, _ in info['entries'] if isinstance(e, dict)]
                content = (labs[0] + ' ' + tags[0]) if len(labs) == 1 else '%d 筆：%s' % (len(labs), '、'.join(labs[:4]) + ('…' if len(labs) > 4 else ''))
                bad = sum(1 for _, er, _ in info['entries'] if er)
                warn = sum(1 for _, er, wa in info['entries'] if wa and not er)
                ok_e = [e for e, er, _ in info['entries'] if not er]
                same = sum(1 for e in ok_e if key_of(e) in existing and same_content(existing[key_of(e)], e))
                over = sum(1 for e in ok_e if key_of(e) in existing) - same
                new = len(ok_e) - same - over
                if bad == len(info['entries']):
                    status = '✖ 資料有誤（%d 項）' % len(info['entries'][0][1])
                elif ok_e and same == len(ok_e) and not bad:
                    status = '＝ 內容與主檔相同，不需合併'
                else:
                    parts = ['✔ 可合併' if not bad else '✔ 部分可合併（%d 筆有誤）' % bad]
                    if new:
                        parts.append('新增 %d 筆' % new)
                    if over:
                        parts.append('內容不同，將更新既有 %d 筆' % over)
                    if same:
                        parts.append('%d 筆與主檔相同會略過' % same)
                    if warn:
                        parts.append('⚠ 有提醒')
                    status = '，'.join(parts)
            tree.insert('', 'end', iid=iid, values=(os.path.basename(p), content, status))
            good = not info['fatal'] and any(
                not er and not (key_of(e) in existing and same_content(existing[key_of(e)], e))
                for e, er, _ in info['entries'])
            if good and (NAME_RE.match(os.path.basename(p)) or (select and p in select)):
                auto_select.append(iid)
        if auto_select:
            tree.selection_set(auto_select)
        on_select()
        if err and st['main']:
            set_detail('主檔讀取失敗：%s' % err)
        elif not st['rows']:
            set_detail('資料夾內沒有找到其他 .json 檔。\n請按「新增檔案…」手動選取，例如 w1d3.json。')

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
                if isinstance(e, dict) and isinstance(e.get('questions'), list):
                    lines.append('     題數 %d、單字 %d、type %s' % (len(e['questions']), len(e.get('vocab') or []), e.get('type')))
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

    # 合併
    def do_merge():
        if not st['main']:
            messagebox.showwarning('尚未選擇主檔', '請先按「更換主檔…」選擇 daily.json。', parent=root)
            return
        data, items, err = load_main()
        if err:
            messagebox.showerror('主檔無法使用', err, parent=root)
            return
        paths = [st['rows'][i] for i in tree.selection() if i in st['rows']]
        if not paths:
            messagebox.showinfo('沒有選取檔案', '請先在清單中選取要合併的副檔。', parent=root)
            return

        plan = plan_merge(paths, items)
        total = len(plan['add']) + len(plan['replace'])
        fmt = lambda ks: '、'.join('W%dD%d' % k for k in ks)
        if not total:
            if plan['same'] and not plan['skipped']:
                messagebox.showinfo('不需更新', '選取的題目（%s）內容都與主檔相同，沒有做任何修改。' % fmt(plan['same']), parent=root)
                return
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
            lines += ['', '主檔已有 %s，但內容和副檔不同。' % fmt(plan['replace']),
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
            new_by_key = {k: v[0] for k, v in keep.items()}
            old_by_key = {key_of(x): x for x in items if isinstance(x, dict)}
            out = [x for x in items if not (isinstance(x, dict) and key_of(x) in new_by_key)]
            for k in sorted(new_by_key):
                e = new_by_key[k]
                e.setdefault('timing', [])
                old = old_by_key.get(k)
                if old and not e['timing'] and old.get('passage') == e.get('passage'):
                    e['timing'] = old.get('timing', [])   # 文稿沒變 → 保留舊的對時資料
                out.append(e)
            sort_items(out)
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
        msg = '完成！已合併 %d 筆（新增 %d、更新 %d）。\n備份：%s' % (len(keep), len([k for k in keep if k in plan['add']]), len([k for k in keep if k in plan['replace']]), os.path.relpath(bak, BASE))
        if moved:
            msg += '\n已移到 merged：' + '、'.join(moved)
        msg += '\n\n記得把對應的 mp3 放進 audio 資料夾（例如 audio/w1d3.mp3），並完成 timing 對時。'
        refresh()
        messagebox.showinfo('合併完成', msg, parent=root)

    # 啟動：尋找主檔
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
