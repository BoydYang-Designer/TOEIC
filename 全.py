# -*- coding: utf-8 -*-
"""daily_hub.py — TOEIC Daily 工作台（把所有維護腳本整合成一個有分類、有步驟說明的視窗）

用法：放在專案根目錄（與 daily.json、json_merge.py 同一個資料夾），直接雙擊執行。
  想隱藏黑色視窗：把檔名改成 daily_hub.pyw 即可（出錯時看不到訊息，建議先用 .py）。

左邊是分類，右邊是該分類的工作與說明：
  🏠 開始          總覽數字＋「我現在想做什麼」的流程向導（一步一步點）
  📋 文章狀態      每一篇的 mp3／timing／待檢查一覽表
  📥 套用文稿修改   網頁「下載 xxx_passage.json」→ 保留 mp3 與 timing 的智慧套用（刪字、改句、加句）
  🔀 合併 JSON     新文章、AI 修正補丁（_fix）、詳解補丁（_extra）、Part1～7 題目（用 json_merge 的檢查與合併邏輯）
  🎙 錄音與對時     自動語音、對時、更新索引
  🔧 維護與檢查     維護精靈、總檢查、單篇診斷
  🗑 刪除與 Trash   刪除文章、永久清除
  🤖 給 AI 的掃描   scan_index.py（產生給 AI 看的 Markdown）
  ❓ 說明          每支腳本做什麼、安全規則

安全：任何寫入 daily.json 之前都會先備份到 backup/ 資料夾，且每一步都會先給你看摘要、等你按確認。
"""
import os, sys, re, json, copy, glob, time, shutil, difflib, subprocess, threading, queue, importlib.util, traceback

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE)
MAIN = os.path.join(BASE, 'daily.json')
DL = os.path.join(os.path.expanduser('~'), 'Downloads')
IS_WIN = os.name == 'nt'

SCRIPTS = {
    'merge': ('json_merge.py', '合併工具（原版）'),
    'speech': ('auto-speech.py', '自動語音'),
    'timing': ('daily_timestamps.py', '對時'),
    'scan': ('Scan總表與音檔.py', '更新索引'),
    'fix': ('daily_維護.py', '維護精靈'),
    'trash': ('daily_trash.py', '刪除與 Trash'),
    'ai': ('scan_index.py', '給 AI 的專案掃描'),
}


# ═════════════════════════════ 核心（與介面無關） ═════════════════════════════
def find_script(key):
    name = SCRIPTS[key][0]
    for d in (BASE, os.path.join(BASE, 'audio'), os.path.dirname(BASE)):
        p = os.path.join(d, name)
        if os.path.isfile(p):
            return p
    return None


_JM = {}


def jm():
    """載入 json_merge.py 當模組（和 daily_trash.py、daily_維護.py 的做法相同）。失敗回傳 None。"""
    if 'm' not in _JM:
        p = find_script('merge')
        try:
            if not p:
                raise FileNotFoundError('找不到 json_merge.py')
            spec = importlib.util.spec_from_file_location('json_merge', p)
            m = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(m)
            _JM['m'] = m
            _JM['err'] = None
        except Exception as e:
            _JM['m'] = None
            _JM['err'] = '%s' % e
    return _JM['m']


def did(w, d):
    w, d = int(w), int(d)
    return 'w%dd8-%d' % (w, d - 7) if d >= 8 else 'w%dd%d' % (w, d)


def open_path(p):
    try:
        if IS_WIN:
            os.startfile(p)
        elif sys.platform == 'darwin':
            subprocess.Popen(['open', p])
        else:
            subprocess.Popen(['xdg-open', p])
    except Exception as e:
        print('無法開啟：%s' % e)


def backup_main(tag='daily'):
    d = os.path.join(BASE, 'backup')
    os.makedirs(d, exist_ok=True)
    dst = os.path.join(d, '%s_%s.json' % (tag, time.strftime('%Y%m%d_%H%M%S')))
    shutil.copy2(MAIN, dst)
    return dst


def pending_files():
    """專案資料夾與下載資料夾裡，看起來是「等著套用」的 daily 檔（w1d3.json、w1d8-3_passage.json、_fix、_extra）。"""
    rx = re.compile(r'^w\d+d\d+(?:-\d+)?(?:_(?:passage|fix|extra)[^/\\]*)?\.json$', re.I)
    seen, out = set(), []
    for d in (BASE, DL):
        for p in glob.glob(os.path.join(d, '*.json')):
            n = os.path.basename(p)
            a = os.path.abspath(p)
            if rx.match(n) and a not in seen and os.path.dirname(a) != os.path.join(BASE, 'merged'):
                seen.add(a)
                out.append(a)
    return sorted(out, key=os.path.getmtime, reverse=True)


def passage_patches():
    return [p for p in pending_files() if re.search(r'_passage', os.path.basename(p), re.I)]


def load_rows():
    """daily.json 每一篇的狀態（給總覽與文章狀態表用）。"""
    with open(MAIN, encoding='utf-8-sig') as f:
        d = json.load(f)
    items = d['items'] if isinstance(d, dict) else d
    rows = []
    for x in items:
        w, dy = int(x['week']), int(x['day'])
        i = did(w, dy)
        rel = x.get('audio') or ('audio/daily/%s.mp3' % i)
        mp = os.path.join(BASE, rel)
        ok = os.path.isfile(mp) and os.path.getsize(mp) > 1000
        p = str(x.get('passage') or '')
        tm = x.get('timing') or []
        mark = [0] * len(p)
        for s in tm:
            for k in range(max(0, s.get('from', 0)), min(s.get('to', 0), len(p))):
                mark[k] = 1
        tot = sum(1 for c in p if not c.isspace())
        cov = sum(1 for k, c in enumerate(p) if mark[k] and not c.isspace())
        ts = 'none' if not tm else ('full' if tot and cov / float(tot) >= 0.9 else 'part')
        rows.append(dict(id=i, w=w, d=dy, tag=str(x.get('tag') or ''), mp3=ok, timing=ts,
                         pending=bool(x.get('review_pending')), edited=str(x.get('edited') or ''),
                         prosody=bool(x.get('prosody')), n_vocab=len(x.get('vocab') or []),
                         n_q=len(x.get('questions') or [])))
    rows.sort(key=lambda r: (r['w'], r['d']))
    return rows


def extra_mp3_scan():
    """找 audio/daily/ 最外層「不屬於任何文章」的 mp3（不含 vocab/、words/ 兩個子資料夾）。
    kind：dup＝舊檔名／複製檔，且正確檔名的新檔已存在（可安全移走）；rename＝舊檔名，但新檔不存在（應改名，不要刪）；
          unknown＝完全對不上任何文章。"""
    with open(MAIN, encoding='utf-8-sig') as f:
        d = json.load(f)
    items = d['items'] if isinstance(d, dict) else d
    ids, want = {}, set()
    for x in items:
        if not (isinstance(x, dict) and 'week' in x and 'day' in x):
            continue
        i = did(x['week'], x['day'])
        rel = x.get('audio') or 'audio/daily/%s.mp3' % i
        ids[i] = os.path.normpath(os.path.join(BASE, rel))
        want.add(os.path.normcase(ids[i]))
    ddir = os.path.join(BASE, 'audio', 'daily')
    out = []
    if not os.path.isdir(ddir):
        return out
    for fn in sorted(os.listdir(ddir)):
        p = os.path.join(ddir, fn)
        if not (os.path.isfile(p) and fn.lower().endswith('.mp3')) or os.path.normcase(os.path.normpath(p)) in want:
            continue
        stem = os.path.splitext(fn)[0]
        base = re.sub(r'(\s*\(\d+\)|[-_ ]?copy|副本)$', '', stem.lower().replace(' ', ''), flags=re.I).strip('-_')
        cand = None
        m = re.match(r'^w(\d+)d(\d+)$', base)
        if m:
            cand = did(m.group(1), m.group(2))
        if cand not in ids:
            cand = None
        size = os.path.getsize(p)
        r = dict(name=fn, path=p, size=size, mtime=os.path.getmtime(p), kind='unknown', target=None,
                 note='不屬於任何文章（檔名打錯？）')
        if cand:
            tp = ids[cand]
            if os.path.isfile(tp):
                same = os.path.getsize(tp) == size
                r.update(kind='dup', note='舊檔名／複製檔；正確的 %s 已存在%s' % (os.path.basename(tp), '（大小相同）' if same else '（大小不同）'))
            else:
                r.update(kind='rename', target=tp, note='舊檔名，而且 %s 還不存在 → 建議改名，不要刪' % os.path.basename(tp))
        out.append(r)
    order = {'rename': 0, 'unknown': 1, 'dup': 2}
    out.sort(key=lambda r: (order[r['kind']], r['name'].lower()))
    return out


def extra_mp3_move(paths):
    """把檔案移到 backup/extra_mp3_時間/（可以再搬回來）；回傳 (成功數, 錯誤訊息list, 目的資料夾)。"""
    dst = os.path.join(BASE, 'backup', 'extra_mp3_' + time.strftime('%Y%m%d_%H%M%S'))
    ok, errs = 0, []
    for p in paths:
        try:
            os.makedirs(dst, exist_ok=True)
            shutil.move(p, os.path.join(dst, os.path.basename(p)))
            ok += 1
        except Exception as e:
            errs.append('%s：%s' % (os.path.basename(p), e))
    return ok, errs, dst


# ───────────── 文稿修改：智慧套用（保留 mp3 與 timing） ─────────────
def item_spans(raw):
    dec = json.JSONDecoder()
    i = raw.index('[', raw.index('"items"')) + 1
    spans = []
    while True:
        while raw[i] in ' \r\n\t,':
            i += 1
        if raw[i] == ']':
            break
        o, e = dec.raw_decode(raw, i)
        spans.append((i, e, o))
        i = e
    return spans


def toks(s):
    return [(m.group(), m.start(), m.end()) for m in re.finditer(r'\S+', s)]


def remap_timing(old, new, tm):
    """回傳 (保留的 timing, 被刪掉的句子, 被改過的句子)。沒改到的句子保留並平移字元位置。"""
    T0, T1 = toks(old), toks(new)
    sm = difflib.SequenceMatcher(None, [t[0] for t in T0], [t[0] for t in T1], autojunk=False)
    m = {}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1):
                m[i1 + k] = j1 + k
    keep, gone, changed = [], [], []
    for s in tm:
        idx = [i for i, t in enumerate(T0) if t[1] >= s['from'] and t[2] <= s['to']]
        txt = old[s['from']:s['to']]
        if not idx:
            continue
        ok = [i for i in idx if i in m]
        if not ok:
            gone.append(txt)
            continue
        if len(ok) == len(idx) and all(m[idx[k + 1]] == m[idx[k]] + 1 for k in range(len(idx) - 1)):
            delta = T1[m[idx[0]]][1] - T0[idx[0]][1]
            nf, nt = s['from'] + delta, s['to'] + delta
            if new[nf:nt] == txt:
                s['from'], s['to'] = nf, nt
                for w in s.get('words') or []:
                    w[0] += delta
                    w[1] += delta
                keep.append(s)
                continue
        changed.append(txt)
    return keep, gone, changed


def dump_item(o):
    """照 daily.json 原本的排版寫出一篇（其他篇不會被動到）。"""
    store = []

    def walk(v, inpro=False):
        if isinstance(v, dict):
            for k, u in v.items():
                if inpro and isinstance(u, list) and u and all(isinstance(n, (int, float)) for n in u):
                    store.append(json.dumps(u, separators=(',', ':')))
                    v[k] = '@@%d@@' % (len(store) - 1)
                else:
                    walk(u, inpro or k == 'prosody')
        elif isinstance(v, list):
            for j, u in enumerate(v):
                if isinstance(u, dict) and 'start' in u and 'words' not in u and set(u) <= {'start', 'end', 'from', 'to'}:
                    store.append(json.dumps(u, ensure_ascii=False))
                    v[j] = '@@%d@@' % (len(store) - 1)
                else:
                    walk(u, inpro)
    o = copy.deepcopy(o)
    walk(o)
    s = json.dumps(o, ensure_ascii=False, indent=2)
    for n, u in enumerate(store):
        s = s.replace('"@@%d@@"' % n, u)
    return s.replace('\n', '\r\n    ')


HEAD_END = re.compile(r'[.!?。！？…][」』”’）)"\']*$')


def passage_plan(patch):
    for k in ('week', 'day', 'passage'):
        if k not in patch:
            raise ValueError('這不是文稿修改檔（缺少 %s）' % k)
    with open(MAIN, 'rb') as f:
        raw = f.read().decode('utf-8-sig')
    hit = [s for s in item_spans(raw) if int(s[2]['week']) == int(patch['week']) and int(s[2]['day']) == int(patch['day'])]
    if len(hit) != 1:
        raise ValueError('daily.json 找不到 week=%s day=%s' % (patch['week'], patch['day']))
    a0, b0, x = hit[0]
    old = str(x.get('passage') or '').replace('\r\n', '\n').strip()
    new = str(patch['passage']).replace('\r\n', '\n').strip()
    pp = patch.get('presentation_phrases')
    tm = x.get('timing') or []
    keep, gone, changed = remap_timing(old, new, copy.deepcopy(tm)) if tm else ([], [], [])
    cov = [0] * len(new)
    for s in keep:
        for k in range(s['from'], min(s['to'], len(new))):
            cov[k] = 1
    todo = [m.group() for m in re.finditer(r'[^\n]+', new)
            if any(not cov[k] for k in range(m.start(), m.end()) if not new[k].isspace())]
    newlines = [n.strip() for n in new.split('\n')]
    heads = [l.strip() for l in old.split('\n') if l.strip() and l.strip() not in newlines
             and len(l.strip()) <= 30 and not HEAD_END.search(l.strip())]
    zl = str(x.get('zh') or '').split('\n')
    zcand = [(n, l.strip()) for n, l in enumerate(zl) if l.strip() and len(l.strip()) <= 30 and not HEAD_END.search(l.strip())] if heads else []
    return dict(raw=raw, a0=a0, b0=b0, x=x, old=old, new=new, tm=tm, keep=keep, gone=gone, changed=changed,
                todo=todo, pp=pp if isinstance(pp, list) and pp else None, heads=heads, zl=zl, zcand=zcand,
                same=(old == new and not (isinstance(pp, list) and pp)),
                id=did(x['week'], x['day']), tag=str(x.get('tag') or ''))


def passage_commit(plan, zdel):
    x = copy.deepcopy(plan['x'])
    x['passage'] = plan['new']
    if plan['tm']:
        x['timing'] = plan['keep']
    if plan['pp']:
        x['presentation_phrases'] = plan['pp']
    if zdel:
        out = [l for n, l in enumerate(plan['zl']) if n not in zdel]
        x['zh'] = re.sub(r'\n{3,}', '\n\n', '\n'.join(out)).strip('\n')
    if plan['old'] != plan['new']:
        x['edited'] = time.strftime('%Y-%m-%d')
        x['review_pending'] = True
    bk = backup_main('daily_before_passage')
    out = plan['raw'][:plan['a0']] + dump_item(x) + plan['raw'][plan['b0']:]
    json.loads(out)   # 寫入前再驗證一次是合法 JSON
    with open(MAIN, 'wb') as f:
        f.write(out.encode('utf-8'))
    return bk


# ═════════════════════════════ 介面 ═════════════════════════════
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, font as tkfont

C = dict(bg='#f3f5fa', side='#1e293b', side_hi='#334155', card='#ffffff', line='#e2e8f0', text='#1e293b',
         mute='#64748b', accent='#4f46e5', accent_hi='#4338ca', ok='#059669', warn='#d97706', bad='#dc2626',
         okbg='#ecfdf5', warnbg='#fffbeb', badbg='#fef2f2', info='#eef2ff')
F = {}


def init_fonts(root):
    fam = set(tkfont.families())
    base = next((f for f in ('Microsoft JhengHei UI', 'Microsoft JhengHei', 'PingFang TC', 'Noto Sans CJK TC',
                             'Noto Sans TC', 'WenQuanYi Zen Hei') if f in fam), tkfont.nametofont('TkDefaultFont').actual('family'))
    F['n'] = (base, 11)
    F['s'] = (base, 10)
    F['b'] = (base, 11, 'bold')
    F['h1'] = (base, 19, 'bold')
    F['h2'] = (base, 13, 'bold')
    F['big'] = (base, 24, 'bold')
    F['mono'] = ('Consolas' if 'Consolas' in fam else 'Courier New', 10)


def mkbtn(parent, text, cmd, kind='ghost', state='normal', pad=(14, 7)):
    sty = {'primary': (C['accent'], 'white', C['accent_hi']), 'ghost': ('#eef2ff', C['accent'], '#e0e7ff'),
           'plain': ('#f1f5f9', C['text'], '#e2e8f0'), 'danger': ('#fef2f2', C['bad'], '#fee2e2'),
           'good': (C['ok'], 'white', '#047857')}[kind]
    b = tk.Button(parent, text=text, command=cmd, bg=sty[0], fg=sty[1], activebackground=sty[2], activeforeground=sty[1],
                  relief='flat', bd=0, font=F['n'], padx=pad[0], pady=pad[1], cursor='hand2', state=state,
                  disabledforeground='#94a3b8')
    return b


class ScrollFrame(tk.Frame):
    def __init__(self, parent, bg):
        tk.Frame.__init__(self, parent, bg=bg)
        self.cv = tk.Canvas(self, bg=bg, highlightthickness=0)
        sb = ttk.Scrollbar(self, orient='vertical', command=self.cv.yview)
        self.inner = tk.Frame(self.cv, bg=bg)
        self.win = self.cv.create_window((0, 0), window=self.inner, anchor='nw')
        self.cv.configure(yscrollcommand=sb.set)
        self.cv.pack(side='left', fill='both', expand=True)
        sb.pack(side='right', fill='y')
        self.inner.bind('<Configure>', lambda e: self.cv.configure(scrollregion=self.cv.bbox('all')))
        self.cv.bind('<Configure>', lambda e: self.cv.itemconfigure(self.win, width=e.width))
        self.cv.bind('<Enter>', lambda e: self.cv.bind_all('<MouseWheel>', self._wheel))
        self.cv.bind('<Leave>', lambda e: self.cv.unbind_all('<MouseWheel>'))

    def _wheel(self, e):
        self.cv.yview_scroll(int(-e.delta / 120) if e.delta else 0, 'units')


def wlabel(parent, text, font=None, fg=None, bg=None, pad=40, **kw):
    """會自動跟著視窗寬度換行的 Label。"""
    l = tk.Label(parent, text=text, font=font or F['n'], fg=fg or C['text'], bg=bg or parent['bg'],
                 justify='left', anchor='w', **kw)
    l.bind('<Configure>', lambda e: l.configure(wraplength=max(200, e.width - 4)))
    return l


class Log(tk.Frame):
    def __init__(self, parent, height=12):
        tk.Frame.__init__(self, parent, bg=C['card'], highlightbackground=C['line'], highlightthickness=1)
        self.t = tk.Text(self, height=height, wrap='word', font=F['mono'], bg='#0f172a', fg='#e2e8f0', relief='flat',
                         padx=10, pady=8, insertbackground='white')
        sb = ttk.Scrollbar(self, orient='vertical', command=self.t.yview)
        self.t.configure(yscrollcommand=sb.set, state='disabled')
        self.t.pack(side='left', fill='both', expand=True)
        sb.pack(side='right', fill='y')
        for n, c in (('ok', '#34d399'), ('warn', '#fbbf24'), ('bad', '#f87171'), ('dim', '#94a3b8'), ('h', '#a5b4fc')):
            self.t.tag_configure(n, foreground=c)

    def clear(self):
        self.t.configure(state='normal')
        self.t.delete('1.0', 'end')
        self.t.configure(state='disabled')

    def add(self, s, tag=None):
        self.t.configure(state='normal')
        self.t.insert('end', s, tag or ())
        self.t.see('end')
        self.t.configure(state='disabled')


class Dialog(tk.Toplevel):
    """可捲動的確認視窗。buttons: [(文字, 回傳值, kind)]；回傳按下的值（關閉視窗＝None）。"""

    def __init__(self, parent, title, text, buttons, width=760, height=520):
        tk.Toplevel.__init__(self, parent)
        self.title(title)
        self.configure(bg=C['bg'])
        self.geometry('%dx%d' % (width, height))
        self.transient(parent)
        self.result = None
        t = tk.Text(self, wrap='word', font=F['n'], bg='white', relief='flat', padx=14, pady=12)
        sb = ttk.Scrollbar(self, orient='vertical', command=t.yview)
        t.configure(yscrollcommand=sb.set)
        bar = tk.Frame(self, bg=C['bg'])
        bar.pack(side='bottom', fill='x', padx=12, pady=10)
        sb.pack(side='right', fill='y')
        t.pack(side='left', fill='both', expand=True)
        t.insert('1.0', text)
        t.configure(state='disabled')
        for lab, val, kind in buttons:
            mkbtn(bar, lab, lambda v=val: self._done(v), kind).pack(side='right', padx=4)
        self.protocol('WM_DELETE_WINDOW', lambda: self._done(None))
        self.grab_set()
        self.focus_set()

    def _done(self, v):
        self.result = v
        self.destroy()


def ask_dialog(parent, title, text, buttons, **kw):
    d = Dialog(parent, title, text, buttons, **kw)
    parent.wait_window(d)
    return d.result


class Hub(tk.Tk):
    NAV = [('home', '🏠', '開始'), ('status', '📋', '文章狀態'), ('apply', '📥', '套用文稿修改'), ('merge', '🔀', '合併 JSON'),
           ('audio', '🎙', '錄音與對時'), ('maint', '🔧', '維護與檢查'), ('trash', '🗑', '刪除與 Trash'),
           ('ai', '🤖', '給 AI 的掃描'), ('help', '❓', '說明')]

    def __init__(self):
        tk.Tk.__init__(self)
        init_fonts(self)
        self.title('TOEIC Daily 工作台')
        self.geometry('1180x780')
        self.minsize(900, 600)
        self.configure(bg=C['bg'])
        st = ttk.Style(self)
        try:
            st.theme_use('clam')
        except Exception:
            pass
        st.configure('Treeview', rowheight=28, font=F['n'], background='white', fieldbackground='white', borderwidth=0)
        st.configure('Treeview.Heading', font=F['b'], background='#eef2ff', relief='flat')
        st.map('Treeview', background=[('selected', '#c7d2fe')], foreground=[('selected', C['text'])])

        side = tk.Frame(self, bg=C['side'], width=230)
        side.pack(side='left', fill='y')
        side.pack_propagate(False)
        tk.Label(side, text='TOEIC Daily', font=F['h2'], fg='white', bg=C['side']).pack(anchor='w', padx=18, pady=(20, 0))
        tk.Label(side, text='工作台', font=F['s'], fg='#94a3b8', bg=C['side']).pack(anchor='w', padx=18, pady=(0, 14))
        self.navbtn = {}
        for key, ic, name in self.NAV:
            b = tk.Label(side, text='  %s  %s' % (ic, name), font=F['n'], fg='#e2e8f0', bg=C['side'], anchor='w',
                         padx=10, pady=11, cursor='hand2')
            b.pack(fill='x', padx=8, pady=1)
            b.bind('<Button-1>', lambda e, k=key: self.show(k))
            b.bind('<Enter>', lambda e, w=b: w.configure(bg=C['side_hi']) if w is not self.navbtn.get(self.cur) else None)
            b.bind('<Leave>', lambda e, w=b: w.configure(bg=C['side']) if w is not self.navbtn.get(self.cur) else None)
            self.navbtn[key] = b
        tk.Label(side, text=BASE if len(BASE) < 34 else '…' + BASE[-32:], font=('TkDefaultFont', 8), fg='#64748b',
                 bg=C['side'], anchor='w', wraplength=210, justify='left').pack(side='bottom', anchor='w', padx=18, pady=12)

        self.content = tk.Frame(self, bg=C['bg'])
        self.content.pack(side='left', fill='both', expand=True)
        self.pages = {}
        self.cur = None
        self.pend_page = {}
        self.show('home')

    # ───── 導覽 ─────
    def show(self, key):
        if key not in self.pages:
            fr = tk.Frame(self.content, bg=C['bg'])
            fr.place(relx=0, rely=0, relwidth=1, relheight=1)
            self.pages[key] = fr
            getattr(self, 'build_' + key)(fr)
        for k, b in self.navbtn.items():
            b.configure(bg=C['accent'] if k == key else C['side'], fg='white' if k == key else '#e2e8f0')
        self.cur = key
        self.pages[key].tkraise()
        h = getattr(self, 'show_' + key, None)
        if h:
            h()

    def header(self, parent, title, sub):
        f = tk.Frame(parent, bg=C['bg'])
        f.pack(fill='x', padx=28, pady=(22, 10))
        tk.Label(f, text=title, font=F['h1'], bg=C['bg'], fg=C['text']).pack(anchor='w')
        wlabel(f, sub, font=F['n'], fg=C['mute'], bg=C['bg']).pack(fill='x', pady=(4, 0))
        return f

    def card(self, parent, pad=16):
        f = tk.Frame(parent, bg=C['card'], highlightbackground=C['line'], highlightthickness=1)
        inner = tk.Frame(f, bg=C['card'])
        inner.pack(fill='both', expand=True, padx=pad, pady=pad - 2)
        return f, inner

    def missing(self, key):
        return find_script(key) is None

    # ───── 啟動其他腳本 ─────
    def launch(self, key, args=(), console=False):
        p = find_script(key)
        if not p:
            messagebox.showerror('找不到檔案', '找不到 %s。\n請把它放在與 daily_hub.py 同一個資料夾。' % SCRIPTS[key][0])
            return
        try:
            if console and IS_WIN:
                wrap = ("import sys,os,runpy,traceback\nos.chdir(%r)\nsys.argv=%r\ntry:\n runpy.run_path(%r,run_name='__main__')\n"
                        "except SystemExit:\n pass\nexcept BaseException:\n traceback.print_exc()\n"
                        "try:\n input('\\n按 Enter 關閉視窗…')\nexcept EOFError:\n pass\n") % (BASE, [p] + list(args), p)
                subprocess.Popen([sys.executable, '-c', wrap], cwd=BASE, creationflags=subprocess.CREATE_NEW_CONSOLE)
            else:
                subprocess.Popen([sys.executable, p] + list(args), cwd=BASE)
        except Exception as e:
            messagebox.showerror('啟動失敗', str(e))

    def capture(self, key, args, log, done=None, stdin_text='\n'):
        """執行腳本並把輸出即時顯示在 log；適合「只輸出結果」的工作。"""
        p = find_script(key)
        if not p:
            log.add('找不到 %s\n' % SCRIPTS[key][0], 'bad')
            return
        log.clear()
        log.add('▶ python %s %s\n\n' % (os.path.basename(p), ' '.join(args)), 'h')
        q = queue.Queue()

        def scroll_to_log():        # 輸出區在長頁面的下方：自動捲過去
            w = log.master
            while w is not None and not isinstance(w, ScrollFrame):
                w = w.master
            if w is not None:
                w.update_idletasks()
                w.cv.yview_moveto(1.0)
        self.after(150, scroll_to_log)

        def work():
            try:
                env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1')
                pr = subprocess.Popen([sys.executable, '-u', p] + list(args), cwd=BASE, stdout=subprocess.PIPE,
                                      stderr=subprocess.STDOUT, stdin=subprocess.PIPE, env=env)
                try:
                    pr.stdin.write((stdin_text or '').encode('utf-8'))
                    pr.stdin.close()
                except Exception:
                    pass
                for line in iter(pr.stdout.readline, b''):
                    q.put(line.decode('utf-8', 'replace'))
                pr.wait()
                q.put(('END', pr.returncode))
            except Exception as e:
                q.put('執行失敗：%s\n' % e)
                q.put(('END', -1))

        def poll():
            try:
                while True:
                    m = q.get_nowait()
                    if isinstance(m, tuple):
                        log.add('\n■ 結束（代碼 %s）\n' % m[1], 'dim')
                        if done:
                            done()
                        return
                    tag = 'bad' if re.search(r'✗|錯誤|失敗|Traceback', m) else 'ok' if re.search(r'✔|完成|成功', m) else 'warn' if re.search(r'⚠|警告', m) else None
                    log.add(m, tag)
            except queue.Empty:
                pass
            self.after(80, poll)
        threading.Thread(target=work, daemon=True).start()
        self.after(80, poll)

    # ═════════ 🏠 開始 ═════════
    def build_home(self, fr):
        sf = ScrollFrame(fr, C['bg'])
        sf.pack(fill='both', expand=True)
        body = sf.inner
        self.header(body, '今天要做什麼？', '先看上面的數字，知道哪裡還缺；再從下面選一個情境，照著 1、2、3 一步一步點。')
        self.home_stats = tk.Frame(body, bg=C['bg'])
        self.home_stats.pack(fill='x', padx=28, pady=(4, 6))
        flows = [
            ('✏️  我改了文稿（刪字、改句子、加句子）',
             '例如把標題 Closing 刪掉。網頁維護頁改好、存草稿後，照下面做：',
             [('在網頁「草稿彙整」按「下載 w1d8-3_passage.json」（下載後檔案會在「下載」資料夾）', None),
              ('開「套用文稿修改」→ 選剛下載的檔 → 看摘要 → 按套用（mp3 與沒改到的句子的 timing 都會保留）', ('page', 'apply')),
              ('只有「改過／新增」句子才需要：重新錄那幾句，然後對時（摘要裡會告訴你要不要）', ('page', 'audio')),
              ('更新索引，讓網頁維護總覽的數字是新的', ('scan',)),
              ('重新整理網頁 → 草稿狀態會變「草稿已套用」→ 按「刪除草稿」', None)]),
            ('🆕  新增一篇文章（AI 產生的 w1d3.json）',
             '請 AI 依 daily.json 的 _spec 產生，存成 w{週}d{天}.json 放到專案資料夾後：',
             [('開「合併 JSON」→ 選題庫「每日文章」→ 勾選那個檔 → 合併', ('page', 'merge')),
              ('做 mp3：用「自動語音」產生，或自己錄好放進 audio/daily/', ('page', 'audio')),
              ('對時（mp3 → timing、語調曲線）', ('launch', 'timing')),
              ('更新索引', ('scan',))]),
            ('🩹  套用 AI 回傳的修正（_fix.json／_extra.json）',
             '網頁「複製調整提示詞」給 AI 後，AI 回傳的 JSON 存成 w1d8-3_fix.json（或詳解 _extra.json）：',
             [('把檔案放進專案資料夾（或下載資料夾）', None),
              ('開「合併 JSON」→ 勾選檔案 → 合併（會顯示題目的新舊對照）', ('page', 'merge')),
              ('重新整理網頁，「✎待檢查」標記就會消失', None)]),
            ('🔍  有文章缺 mp3、或 timing 不完整',
             '先在「文章狀態」看是哪幾篇，再用維護精靈一步一步補：',
             [('看哪幾篇有問題', ('page', 'status')),
              ('開「維護精靈」：它會先幫你找放錯位置的 mp3，真的沒有才引導你錄音，再接著對時', ('console', 'fix')),
              ('更新索引', ('scan',))]),
            ('🗑  刪除某篇文章，或清空 Trash',
             '刪掉的文章會先進 _trash（可還原），永久刪除才會真的消失：',
             [('開「刪除與 Trash」', ('page', 'trash'))]),
        ]
        for title, sub, steps in flows:
            wrap, c = self.card(body)
            wrap.pack(fill='x', padx=28, pady=7)
            tk.Label(c, text=title, font=F['h2'], bg=C['card'], fg=C['text'], anchor='w').pack(fill='x')
            wlabel(c, sub, font=F['s'], fg=C['mute'], bg=C['card']).pack(fill='x', pady=(2, 8))
            for n, (txt, act) in enumerate(steps, 1):
                r = tk.Frame(c, bg=C['card'])
                r.pack(fill='x', pady=3)
                tk.Label(r, text=str(n), font=F['b'], bg=C['accent'] if act else '#cbd5e1', fg='white', width=3,
                         pady=3).pack(side='left', padx=(0, 10), anchor='n')
                if act:
                    mkbtn(r, '開啟 ▶', lambda a=act: self.do(a), 'primary', pad=(10, 4)).pack(side='right', padx=(10, 0), anchor='n')
                wlabel(r, txt, font=F['n'], bg=C['card']).pack(side='left', fill='x', expand=True)
        tk.Frame(body, bg=C['bg'], height=24).pack()

    def do(self, act):
        k = act[0]
        if k == 'page':
            self.show(act[1])
        elif k == 'launch':
            self.launch(act[1])
        elif k == 'console':
            self.launch(act[1], console=True)
        elif k == 'scan':
            self.show('audio')
            self.run_scan()

    def show_home(self):
        for w in self.home_stats.winfo_children():
            w.destroy()
        try:
            rows = load_rows()
        except Exception as e:
            tk.Label(self.home_stats, text='⚠ 讀不到 daily.json：%s' % e, font=F['n'], fg=C['bad'], bg=C['bg']).pack(anchor='w')
            return
        nm = sum(1 for r in rows if not r['mp3'])
        nt = sum(1 for r in rows if r['timing'] != 'full')
        npd = sum(1 for r in rows if r['pending'])
        nf = len(pending_files())
        cards = [('文章', len(rows), C['text'], '篇', 'status'), ('缺 mp3', nm, C['bad'] if nm else C['ok'], '篇', 'status'),
                 ('timing 未完成', nt, C['warn'] if nt else C['ok'], '篇', 'status'),
                 ('待檢查', npd, C['warn'] if npd else C['ok'], '篇', 'status'),
                 ('等著套用的檔案', nf, C['accent'] if nf else C['mute'], '個', 'merge')]
        for i, (lab, n, col, unit, pg) in enumerate(cards):
            f = tk.Frame(self.home_stats, bg=C['card'], highlightbackground=C['line'], highlightthickness=1, cursor='hand2')
            f.grid(row=0, column=i, sticky='nsew', padx=(0 if i == 0 else 6, 0))
            self.home_stats.grid_columnconfigure(i, weight=1, uniform='s')
            tk.Label(f, text=lab, font=F['s'], fg=C['mute'], bg=C['card']).pack(pady=(10, 0))
            tk.Label(f, text=str(n), font=F['big'], fg=col, bg=C['card']).pack()
            tk.Label(f, text=unit, font=F['s'], fg=C['mute'], bg=C['card']).pack(pady=(0, 8))
            for w in [f] + list(f.winfo_children()):
                w.bind('<Button-1>', lambda e, p=pg: self.show(p))

    # ═════════ 📋 文章狀態 ═════════
    def build_status(self, fr):
        self.header(fr, '文章狀態', '每一篇的 mp3、timing、待檢查一覽。雙擊某一列可以複製它的 id（例如 w1d8-3）。')
        bar = tk.Frame(fr, bg=C['bg'])
        bar.pack(fill='x', padx=28, pady=(0, 8))
        self.only_bad = tk.BooleanVar(value=False)
        tk.Checkbutton(bar, text='只看有問題的', variable=self.only_bad, command=self.show_status, bg=C['bg'],
                       font=F['n'], activebackground=C['bg']).pack(side='left')
        mkbtn(bar, '重新整理', self.show_status, 'plain', pad=(10, 4)).pack(side='left', padx=10)
        self.st_sum = tk.Label(bar, text='', font=F['s'], fg=C['mute'], bg=C['bg'])
        self.st_sum.pack(side='right')
        cols = ('id', 'tag', 'mp3', 'timing', 'pending', 'edited')
        wrap = tk.Frame(fr, bg=C['bg'])
        wrap.pack(fill='both', expand=True, padx=28, pady=(0, 20))
        self.tv = ttk.Treeview(wrap, columns=cols, show='headings', selectmode='browse')
        for c, t, w in (('id', '編號', 90), ('tag', '標題', 420), ('mp3', 'mp3', 70), ('timing', 'timing', 90),
                        ('pending', '待檢查', 80), ('edited', '文稿修改日', 110)):
            self.tv.heading(c, text=t)
            self.tv.column(c, width=w, anchor='w' if c == 'tag' else 'center', stretch=(c == 'tag'))
        sb = ttk.Scrollbar(wrap, orient='vertical', command=self.tv.yview)
        self.tv.configure(yscrollcommand=sb.set)
        self.tv.pack(side='left', fill='both', expand=True)
        sb.pack(side='right', fill='y')
        self.tv.tag_configure('bad', background=C['badbg'])
        self.tv.tag_configure('warn', background=C['warnbg'])
        self.tv.bind('<Double-1>', self.copy_id)

    def copy_id(self, e=None):
        s = self.tv.selection()
        if s:
            v = self.tv.item(s[0], 'values')[0]
            self.clipboard_clear()
            self.clipboard_append(v)

    def show_status(self):
        self.tv.delete(*self.tv.get_children())
        try:
            rows = load_rows()
        except Exception as e:
            self.st_sum.configure(text='讀取失敗：%s' % e)
            return
        n_bad = 0
        for r in rows:
            tmt = {'full': '✔ 完成', 'part': '△ 部分', 'none': '✗ 未對時'}[r['timing']]
            bad = (not r['mp3']) or r['timing'] != 'full'
            warn = r['pending']
            n_bad += 1 if (bad or warn) else 0
            if self.only_bad.get() and not (bad or warn):
                continue
            self.tv.insert('', 'end', values=(r['id'].upper(), r['tag'], '✔' if r['mp3'] else '✗ 缺', tmt,
                                              '✎ 待檢查' if r['pending'] else '', r['edited']),
                           tags=('bad',) if not r['mp3'] else ('warn',) if (bad or warn) else ())
        self.st_sum.configure(text='共 %d 篇，其中 %d 篇需要處理（timing 狀態是依句子涵蓋範圍估算，正式結果以「更新索引」為準）' % (len(rows), n_bad))

    # ═════════ 📥 套用文稿修改 ═════════
    def build_apply(self, fr):
        sf = ScrollFrame(fr, C['bg'])
        sf.pack(fill='both', expand=True)
        b = sf.inner
        self.header(b, '套用文稿修改', '網頁「下載 w1d8-3_passage.json」之後，在這裡選那個檔。它會比對新舊文稿，'
                    '沒改到的句子保留 timing、mp3 完全不動；你確認摘要後才會寫入 daily.json。')
        c1w, c1 = self.card(b)
        c1w.pack(fill='x', padx=28, pady=6)
        tk.Label(c1, text='① 選擇文稿修改檔', font=F['h2'], bg=C['card']).pack(anchor='w')
        r = tk.Frame(c1, bg=C['card'])
        r.pack(fill='x', pady=8)
        self.ap_path = tk.StringVar()
        tk.Entry(r, textvariable=self.ap_path, font=F['n'], state='readonly', relief='solid', bd=1).pack(side='left', fill='x', expand=True, ipady=5)
        mkbtn(r, '選擇檔案…', self.ap_choose, 'primary').pack(side='left', padx=(8, 0))
        tk.Label(c1, text='在專案資料夾與「下載」資料夾找到的文稿修改檔（雙擊載入）：', font=F['s'], fg=C['mute'], bg=C['card']).pack(anchor='w')
        self.ap_list = tk.Listbox(c1, height=4, font=F['n'], relief='solid', bd=1, activestyle='none', selectbackground='#c7d2fe', selectforeground=C['text'])
        self.ap_list.pack(fill='x', pady=(4, 0))
        self.ap_list.bind('<Double-1>', lambda e: self.ap_pick_list())
        self.ap_found = []

        c2w, c2 = self.card(b)
        c2w.pack(fill='x', padx=28, pady=6)
        tk.Label(c2, text='② 變更摘要', font=F['h2'], bg=C['card']).pack(anchor='w')
        self.ap_sum = tk.Text(c2, height=10, wrap='word', font=F['n'], bg='#f8fafc', relief='flat', padx=12, pady=10, state='disabled')
        self.ap_sum.pack(fill='x', pady=8)
        for n, col in (('ok', C['ok']), ('warn', C['warn']), ('bad', C['bad']), ('dim', C['mute']), ('h', C['accent'])):
            self.ap_sum.tag_configure(n, foreground=col)
        self.ap_sum.tag_configure('b', font=F['b'])
        self.ap_zh = tk.Frame(c2, bg=C['card'])
        self.ap_zh.pack(fill='x')

        c3w, c3 = self.card(b)
        c3w.pack(fill='x', padx=28, pady=6)
        tk.Label(c3, text='③ 套用', font=F['h2'], bg=C['card']).pack(anchor='w')
        self.ap_move = tk.BooleanVar(value=True)
        tk.Checkbutton(c3, text='套用後把補丁檔移到 merged 資料夾（只在補丁檔放在專案資料夾時）', variable=self.ap_move, bg=C['card'],
                       font=F['s'], activebackground=C['card']).pack(anchor='w', pady=(6, 0))
        r = tk.Frame(c3, bg=C['card'])
        r.pack(fill='x', pady=8)
        self.ap_go = mkbtn(r, '套用到 daily.json', self.ap_apply, 'good', state='disabled')
        self.ap_go.pack(side='left')
        self.ap_msg = wlabel(c3, '', font=F['n'], bg=C['card'])
        self.ap_msg.pack(fill='x')
        self.ap_next = tk.Frame(c3, bg=C['card'])
        self.ap_next.pack(fill='x', pady=(6, 0))
        self.ap_plan = None
        self.ap_vars = []
        self.ap_file = None

    def show_apply(self):
        self.ap_found = passage_patches()
        self.ap_list.delete(0, 'end')
        for p in self.ap_found:
            self.ap_list.insert('end', '%s　　%s　　(%s)' % (os.path.basename(p), time.strftime('%m/%d %H:%M', time.localtime(os.path.getmtime(p))),
                                                      'Downloads' if os.path.dirname(p) == DL else '專案資料夾'))
        if self.ap_file is None and self.ap_found:
            self.ap_list.selection_set(0)
            self.ap_load(self.ap_found[0])      # 第一次進來：自動載入最新的補丁，直接看到摘要
        if not self.ap_found:
            self.ap_list.insert('end', '（沒有找到 *_passage.json，請按「選擇檔案…」）')

    def ap_pick_list(self):
        s = self.ap_list.curselection()
        if s and s[0] < len(self.ap_found):
            self.ap_load(self.ap_found[s[0]])

    def ap_choose(self):
        init = os.path.dirname(self.ap_found[0]) if self.ap_found else (DL if os.path.isdir(DL) else BASE)
        p = filedialog.askopenfilename(parent=self, title='選擇文稿修改檔（*_passage.json）', initialdir=init,
                                       filetypes=[('文稿修改檔', '*_passage*.json'), ('JSON', '*.json'), ('全部', '*.*')])
        if p:
            self.ap_load(p)

    def sumw(self, s, tag=None):
        self.ap_sum.configure(state='normal')
        self.ap_sum.insert('end', s, tag or ())
        self.ap_sum.configure(state='disabled')

    def ap_load(self, path):
        self.ap_file = path
        self.ap_path.set(path)
        self.ap_plan = None
        self.ap_go.configure(state='disabled')
        self.ap_msg.configure(text='')
        for w in self.ap_next.winfo_children() + self.ap_zh.winfo_children():
            w.destroy()
        self.ap_sum.configure(state='normal')
        self.ap_sum.delete('1.0', 'end')
        self.ap_sum.configure(state='disabled')
        try:
            with open(path, encoding='utf-8-sig') as f:
                patch = json.load(f)
            if not isinstance(patch, dict):
                raise ValueError('檔案內容不是單一的文稿修改（應該是 {week, day, passage}）')
            plan = passage_plan(patch)
        except Exception as e:
            self.sumw('✗ 無法分析：%s\n' % e, 'bad')
            return
        self.ap_plan = plan
        self.sumw('套用到：%s　%s\n' % (plan['id'].upper(), plan['tag']), 'b')
        if plan['same']:
            self.sumw('\n文稿與 daily.json 目前的內容相同，沒有需要更新的。\n', 'warn')
            return
        self.sumw('\n英文文稿：%d → %d 字元\n' % (len(plan['old']), len(plan['new'])))
        tm, keep = plan['tm'], plan['keep']
        if tm:
            self.sumw('timing：%d 句 → 保留 %d 句\n' % (len(tm), len(keep)))
            sh = lambda t: (t.replace('\n', ' ')[:70] + ('…' if len(t) > 70 else ''))
            for t in plan['gone']:
                self.sumw('   ✂ 刪除（新文稿已沒有）：%s\n' % sh(t), 'bad')
            for t in plan['changed']:
                self.sumw('   ✎ 改過 → 這句 timing 會丟掉：%s\n' % sh(t), 'warn')
            for t in plan['todo']:
                self.sumw('   ＋ 沒有 timing 的行：%s\n' % sh(t), 'warn')
        if plan['pp']:
            self.sumw('簡報句型：更新為 %d 句\n' % len(plan['pp']))
        if tm and (plan['changed'] or plan['todo']):
            self.sumw('\n⚠ 有「改過／新增」的句子：mp3 沒有念新的內容。套用後請重錄那幾句，再重新對時。\n', 'warn')
        elif tm:
            self.sumw('\n✔ 只刪除了內容：mp3 與其餘句子的 timing 都維持有效，不需要重錄。\n', 'ok')
        else:
            self.sumw('\n（這篇原本就沒有 timing，只更新文稿。）\n', 'dim')
        if plan['zcand']:
            tk.Label(self.ap_zh, text='你刪掉了標題行「%s」。中文翻譯裡像標題的行如下，要順便刪掉哪幾行？（勾選＝刪除）' % '、'.join(plan['heads']),
                     font=F['n'], bg=C['card'], fg=C['text'], wraplength=900, justify='left').pack(anchor='w', pady=(4, 2))
            self.ap_vars = []
            for n, l in plan['zcand']:
                v = tk.BooleanVar(value=False)
                tk.Checkbutton(self.ap_zh, text=l, variable=v, font=F['n'], bg=C['card'], activebackground=C['card']).pack(anchor='w')
                self.ap_vars.append((n, v))
        self.ap_go.configure(state='normal')

    def ap_apply(self):
        plan = self.ap_plan
        if not plan:
            return
        zdel = {n for n, v in self.ap_vars if v.get()}
        if not messagebox.askyesno('確認寫入', '要把「%s」的文稿修改寫入 daily.json 嗎？\n\n寫入前會先備份到 backup 資料夾。' % plan['id'].upper(), parent=self):
            return
        try:
            bk = passage_commit(plan, zdel)
        except Exception as e:
            messagebox.showerror('寫入失敗', 'daily.json 沒有被修改。\n\n%s' % e, parent=self)
            return
        moved = ''
        if self.ap_move.get() and self.ap_file and os.path.dirname(os.path.abspath(self.ap_file)) == BASE:
            try:
                d = os.path.join(BASE, 'merged')
                os.makedirs(d, exist_ok=True)
                shutil.move(self.ap_file, os.path.join(d, os.path.basename(self.ap_file)))
                moved = '　補丁檔已移到 merged。'
            except Exception:
                pass
        self.ap_go.configure(state='disabled')
        need = bool(plan['tm'] and (plan['changed'] or plan['todo']))
        self.ap_msg.configure(text='✔ 完成。備份：%s%s\n接下來：%s' % (os.path.relpath(bk, BASE), moved,
                              '重錄改過／新增的句子 → 對時 → 更新索引 → 重新整理網頁，再刪除草稿。' if need else
                              '更新索引（可略過）→ 重新整理網頁 → 草稿會變「已套用」→ 按「刪除草稿」。'), fg=C['ok'])
        for w in self.ap_next.winfo_children():
            w.destroy()
        if need:
            mkbtn(self.ap_next, '去錄音與對時', lambda: self.show('audio'), 'primary').pack(side='left', padx=(0, 6))
        mkbtn(self.ap_next, '更新索引', lambda: (self.show('audio'), self.run_scan()), 'ghost').pack(side='left', padx=(0, 6))
        mkbtn(self.ap_next, '回到開始', lambda: self.show('home'), 'plain').pack(side='left')
        self.ap_plan = None

    # ═════════ 🔀 合併 JSON ═════════
    def build_merge(self, fr):
        self.mg_state = {'P': None, 'main': None, 'manual': [], 'rows': {}}
        self.header(fr, '合併 JSON', '把「下載或 AI 產生的 json」併進主檔：新文章、修正補丁（_fix）、詳解補丁（_extra）、Part 1～7 新題目。'
                    '合併前會先檢查內容、給你看摘要；寫入前自動備份。')
        m = jm()
        if m is None:
            tk.Label(fr, text='✗ 無法載入 json_merge.py：%s\n請確認它與 daily_hub.py 在同一個資料夾。' % _JM.get('err'), font=F['n'], fg=C['bad'],
                     bg=C['bg'], justify='left').pack(padx=28, anchor='w')
            return
        self.mg_title = {k: m.PROFILES[k].title for k in m.ORDER}
        top = tk.Frame(fr, bg=C['bg'])
        top.pack(fill='x', padx=28)
        tk.Label(top, text='題庫：', font=F['b'], bg=C['bg']).pack(side='left')
        self.mg_prof = tk.StringVar(value='daily')
        self.mg_cb = ttk.Combobox(top, state='readonly', width=22, font=F['n'],
                                  values=['%s（%s）' % (self.mg_title[k], k) for k in m.ORDER])
        self.mg_cb.current(0)
        self.mg_cb.pack(side='left', padx=(0, 14))
        self.mg_cb.bind('<<ComboboxSelected>>', lambda e: self.mg_switch())
        self.mg_main = tk.Label(top, text='', font=F['s'], fg=C['mute'], bg=C['bg'])
        self.mg_main.pack(side='left')
        mkbtn(top, '更換主檔…', self.mg_choose_main, 'plain', pad=(8, 3)).pack(side='left', padx=8)
        mid = tk.Frame(fr, bg=C['bg'])
        mid.pack(fill='both', expand=True, padx=28, pady=(10, 0))
        tk.Label(mid, text='① 選擇要合併的檔案（可多選：Ctrl／Shift）', font=F['h2'], bg=C['bg']).pack(anchor='w')
        wrap = tk.Frame(mid, bg=C['bg'])
        wrap.pack(fill='both', expand=True, pady=6)
        self.mg_tv = ttk.Treeview(wrap, columns=('name', 'kind', 'where'), show='headings', selectmode='extended', height=7)
        for c, t, w in (('name', '檔名', 320), ('kind', '這是什麼', 200), ('where', '位置', 120)):
            self.mg_tv.heading(c, text=t)
            self.mg_tv.column(c, width=w, anchor='w')
        sb = ttk.Scrollbar(wrap, orient='vertical', command=self.mg_tv.yview)
        self.mg_tv.configure(yscrollcommand=sb.set)
        self.mg_tv.pack(side='left', fill='both', expand=True)
        sb.pack(side='right', fill='y')
        bar = tk.Frame(mid, bg=C['bg'])
        bar.pack(fill='x', pady=4)
        mkbtn(bar, '新增檔案…', self.mg_add, 'plain', pad=(10, 5)).pack(side='left')
        mkbtn(bar, '重新掃描', self.mg_refresh, 'plain', pad=(10, 5)).pack(side='left', padx=6)
        self.mg_move = tk.BooleanVar(value=True)
        tk.Checkbutton(bar, text='合併成功後，把副檔移到 merged 資料夾', variable=self.mg_move, bg=C['bg'], font=F['s'],
                       activebackground=C['bg']).pack(side='left', padx=10)
        mkbtn(bar, '進階：開啟原版 json_merge', lambda: self.launch('merge', [self.mg_key()]), 'plain', pad=(10, 5)).pack(side='right')
        tk.Label(mid, text='② 檢查與合併', font=F['h2'], bg=C['bg']).pack(anchor='w', pady=(8, 0))
        r = tk.Frame(mid, bg=C['bg'])
        r.pack(fill='x', pady=6)
        mkbtn(r, '檢查選取的檔案', self.mg_check, 'ghost').pack(side='left')
        mkbtn(r, '合併選取的檔案 ▶', self.mg_merge, 'primary').pack(side='left', padx=8)
        self.mg_next = tk.Frame(r, bg=C['bg'])
        self.mg_next.pack(side='left', padx=10)
        self.mg_log = Log(fr, height=11)
        self.mg_log.pack(fill='both', expand=True, padx=28, pady=(0, 20))
        self.mg_switch()

    def mg_key(self):
        m = jm()
        return m.ORDER[self.mg_cb.current()]

    def mg_switch(self):
        m = jm()
        k = self.mg_key()
        P = m.PROFILES[k]
        self.mg_state['P'] = P
        self.mg_state['manual'] = []
        mp = os.path.join(BASE, P.main_name)
        self.mg_state['main'] = mp if os.path.isfile(mp) else None
        self.mg_main.configure(text='主檔：%s%s' % (P.main_name, '' if self.mg_state['main'] else '（找不到！請按「更換主檔」）'),
                               fg=C['mute'] if self.mg_state['main'] else C['bad'])
        self.mg_refresh()

    def mg_choose_main(self):
        P = self.mg_state['P']
        p = filedialog.askopenfilename(parent=self, title='選擇主檔 %s' % P.main_name, initialdir=BASE, filetypes=[('JSON', '*.json')])
        if p:
            self.mg_state['main'] = p
            self.mg_main.configure(text='主檔：%s' % os.path.basename(p), fg=C['mute'])

    def mg_classify(self, P, path):
        m = jm()
        try:
            data, err = m.read_json(path)
            if err:
                return '✗ ' + str(err)[:30]
            entries, err = P.get_entries(data)
            if err or not entries:
                return '✗ ' + str(err or '沒有題目')[:30]
            e = entries[0]
            if P.name == 'daily':
                if P.is_text_patch(e):
                    return '文稿修改（建議用「套用文稿修改」）'
                if P.is_fix(e):
                    return '修正補丁（_fix）'
                if P.is_patch(e):
                    return '詳解補丁（_extra）'
                return '新文章%s' % ('' if len(entries) == 1 else '（%d 篇）' % len(entries))
            return '題目 × %d' % len(entries)
        except Exception as ex:
            return '✗ %s' % str(ex)[:30]

    def mg_refresh(self):
        m = jm()
        P = self.mg_state['P']
        self.mg_tv.delete(*self.mg_tv.get_children())
        self.mg_state['rows'] = {}
        main = self.mg_state['main'] or ''
        files = m.list_candidates(P, BASE, os.path.abspath(main) if main else '', self.mg_state['manual'])
        for p in pending_files() if P.name == 'daily' else []:
            if p not in files and os.path.dirname(p) == DL:
                files.append(p)
        if P.name != 'daily':
            for pth in glob.glob(os.path.join(DL, '*.json')):
                n = os.path.basename(pth)
                if P.is_auto(n) and os.path.abspath(pth) not in files:
                    files.append(os.path.abspath(pth))
        auto = []
        for p in files:
            n = os.path.basename(p)
            iid = self.mg_tv.insert('', 'end', values=(n, self.mg_classify(P, p), 'Downloads' if os.path.dirname(p) == DL else '專案資料夾' if os.path.dirname(p) == BASE else '手動加入'))
            self.mg_state['rows'][iid] = p
            if P.is_auto(n):
                auto.append(iid)
        if auto:
            self.mg_tv.selection_set(auto)
        for w in self.mg_next.winfo_children():
            w.destroy()
        if not files:
            self.mg_log.clear()
            self.mg_log.add('資料夾內沒有找到等待合併的 .json。\n請把 AI 產生或網頁下載的檔案放進專案資料夾，或按「新增檔案…」。\n', 'warn')

    def mg_add(self):
        ps = filedialog.askopenfilenames(parent=self, title='選擇要合併的 json', initialdir=DL if os.path.isdir(DL) else BASE, filetypes=[('JSON', '*.json')])
        for p in ps:
            p = os.path.abspath(p)
            if p not in self.mg_state['manual']:
                self.mg_state['manual'].append(p)
        self.mg_refresh()

    def mg_selected(self):
        return [self.mg_state['rows'][i] for i in self.mg_tv.selection() if i in self.mg_state['rows']]

    def mg_load_main(self):
        m = jm()
        p = self.mg_state['main']
        if not p or not os.path.isfile(p):
            return None, None, '找不到主檔，請按「更換主檔…」'
        data, err = m.read_json(p)
        if err:
            return None, None, err
        items, err = m.split_main(data)
        return data, items, err

    def mg_check(self):
        m = jm()
        P = self.mg_state['P']
        paths = self.mg_selected()
        self.mg_log.clear()
        if not paths:
            self.mg_log.add('請先在清單選取檔案。\n', 'warn')
            return
        data, items, err = self.mg_load_main()
        if err:
            self.mg_log.add('✗ %s\n' % err, 'bad')
            return
        ctx = P.make_ctx(items, data)
        for p in paths:
            info = m.analyze(P, p, ctx, items)
            self.mg_log.add('■ %s\n' % info['name'], 'h')
            if info['fatal']:
                self.mg_log.add('   ✗ %s\n' % info['fatal'], 'bad')
                continue
            for e, er, wa in info['entries']:
                lab = P.label_of(e)
                if er:
                    self.mg_log.add('   ✗ %s：不能合併\n' % lab, 'bad')
                    for t in er:
                        self.mg_log.add('       • %s\n' % t, 'bad')
                else:
                    self.mg_log.add('   ✔ %s：檢查通過\n' % lab, 'ok')
                for t in wa:
                    self.mg_log.add('       ⚠ %s\n' % t, 'warn')
        self.mg_log.add('\n（這只是檢查，沒有改動任何檔案。）\n', 'dim')

    def mg_merge(self):
        m = jm()
        P = self.mg_state['P']
        paths = self.mg_selected()
        self.mg_log.clear()
        for w in self.mg_next.winfo_children():
            w.destroy()
        if not paths:
            self.mg_log.add('請先在清單選取檔案。\n', 'warn')
            return
        data, items, err = self.mg_load_main()
        if err:
            messagebox.showerror('主檔無法使用', err, parent=self)
            return
        # 文稿修改檔 → 建議走「套用文稿修改」（保留 mp3 / timing）
        if P.name == 'daily':
            tp = []
            for p in paths:
                try:
                    d, er = m.read_json(p)
                    en, er2 = P.get_entries(d)
                    if not er and not er2 and en and P.is_text_patch(en[0]):
                        tp.append(p)
                except Exception:
                    pass
            if tp:
                ans = ask_dialog(self, '文稿修改檔', '選取的檔案裡有文稿修改檔（_passage.json）：\n\n' + '\n'.join('• ' + os.path.basename(p) for p in tp) +
                                 '\n\n【建議】用「套用文稿修改」：保留 mp3、沒改到的句子 timing 不會被清掉。\n'
                                 '【標準合併】會把整篇 timing 清空、舊 mp3 移到 _trash，之後必須重錄＋重新對時。',
                                 [('取消', None, 'plain'), ('仍用標準合併', 'std', 'plain'), ('改用套用文稿修改（建議）', 'smart', 'primary')], width=640, height=360)
                if ans in (None,):
                    return
                if ans == 'smart':
                    self.show('apply')
                    self.ap_load(tp[0])
                    return
        plan = m.plan_merge(P, paths, items, data)
        fmt = lambda ks: '、'.join(P.fmt_key(k) for k in ks)
        if plan['dups']:
            rejected = []
            for k in sorted(plan['dups'], key=P.key_sort):
                e = plan['batch'][k][0]
                msg = '新題 %s 的問句：\n    %s\n\n與已有題目雷同：\n%s\n\n「是」＝仍然合併　「否」＝拒絕這題　「取消」＝中止全部' % (
                    P.fmt_key(k), P.describe(e), '\n'.join('  • %s：%s' % (i, t) for i, t in plan['dups'][k][:4]))
                a = messagebox.askyesnocancel('問句重複 %s' % P.fmt_key(k), msg, parent=self)
                if a is None:
                    return
                if a is False:
                    rejected.append(k)
            m.drop_keys(plan, rejected, '問句與既有題目雷同，已拒絕')
        total = len(plan['add']) + len(plan['replace'])
        if not total:
            self.mg_log.add('沒有可以合併的題目。\n', 'warn')
            if plan['same']:
                self.mg_log.add('內容與主檔相同（略過）：%s\n' % fmt(plan['same']), 'dim')
            for s in plan['skipped']:
                self.mg_log.add('✗ %s：%s\n' % s, 'bad')
            return
        lines = ['即將合併 %d 筆到 %s：' % (total, os.path.basename(self.mg_state['main'])), '']
        if plan['add']:
            lines.append('【新增】' + fmt(plan['add']))
        if plan['replace']:
            lines.append('【更新（內容不同，會覆蓋舊的）】')
            for k in plan['replace']:
                lines.append('  • %s' % P.fmt_key(k))
                lines.append('      舊：%s' % P.describe(plan['existing'][k]))
                lines.append('      新：%s' % P.describe(plan['batch'][k][0]))
        if plan['same']:
            lines.append('【內容相同，略過】' + fmt(plan['same']))
        if plan['warned']:
            lines.append('（其中 %d 筆有提醒，可先按「檢查選取的檔案」查看）' % plan['warned'])
        if plan['skipped']:
            lines += ['', '【略過】'] + ['  • %s：%s' % s for s in plan['skipped']]
        lines += P.confirm_notes({k: v[0] for k, v in plan['batch'].items()}, plan['existing'], os.path.dirname(os.path.abspath(self.mg_state['main'])))
        lines += ['', '寫入前會自動備份到 backup 資料夾。']
        if plan['replace']:
            btns = [('取消', None, 'plain'), ('保留主檔舊的（只新增其他）', 'keep', 'plain'), ('用副檔更新並合併', 'go', 'primary')]
        else:
            btns = [('取消', None, 'plain'), ('確定合併', 'go', 'primary')]
        ans = ask_dialog(self, '確認合併', '\n'.join(lines), btns)
        if ans is None:
            return
        if ans == 'keep':
            m.drop_keys(plan, list(plan['replace']), '保留主檔舊的')
            if not plan['batch']:
                self.mg_log.add('沒有要新增的題目，未做任何修改。\n', 'warn')
                return
        keep = dict(plan['batch'])
        try:
            bak = m.apply_merge(P, self.mg_state['main'], data, items, keep)
        except Exception as ex:
            messagebox.showerror('寫入失敗', '主檔沒有被修改。\n\n%s' % ex, parent=self)
            return
        moved = []
        if self.mg_move.get():
            for p, ok in plan['file_ok'].items():
                if ok:
                    try:
                        m.move_to_merged(p)
                        moved.append(os.path.basename(p))
                        if p in self.mg_state['manual']:
                            self.mg_state['manual'].remove(p)
                    except Exception:
                        pass
        self.mg_log.clear()
        self.mg_log.add('✔ 完成！已合併 %d 筆（新增 %d、更新 %d）。\n' % (len(keep), len([k for k in keep if k in plan['add']]), len([k for k in keep if k in plan['replace']])), 'ok')
        self.mg_log.add('備份：%s\n' % os.path.relpath(bak, BASE), 'dim')
        if moved:
            self.mg_log.add('已移到 merged：%s\n' % '、'.join(moved), 'dim')
        self.mg_log.add('\n%s\n' % P.done_note, 'warn')
        for n in m.LAST_MERGE_INFO:
            self.mg_log.add('• %s\n' % n)
        for n in m.LAST_MERGE_NOTES:
            self.mg_log.add('• %s\n' % n)
        self.mg_refresh()
        mkbtn(self.mg_next, '下一步：錄音與對時', lambda: self.show('audio'), 'primary', pad=(10, 5)).pack(side='left')

    # ═════════ 🎙 錄音與對時 ═════════
    def tool_card(self, parent, title, desc, buttons, tag=None):
        w, c = self.card(parent)
        w.pack(fill='x', padx=28, pady=6)
        t = tk.Frame(c, bg=C['card'])
        t.pack(fill='x')
        tk.Label(t, text=title, font=F['h2'], bg=C['card'], anchor='w').pack(side='left')
        if tag:
            tk.Label(t, text=' %s ' % tag, font=F['s'], bg=C['info'], fg=C['accent']).pack(side='left', padx=8)
        wlabel(c, desc, font=F['s'], fg=C['mute'], bg=C['card']).pack(fill='x', pady=(3, 8))
        r = tk.Frame(c, bg=C['card'])
        r.pack(fill='x')
        for lab, cmd, kind in buttons:
            mkbtn(r, lab, cmd, kind, pad=(12, 6)).pack(side='left', padx=(0, 8))
        return c

    def build_audio(self, fr):
        sf = ScrollFrame(fr, C['bg'])
        sf.pack(fill='both', expand=True)
        b = sf.inner
        self.header(b, '錄音與對時', '一篇文章要在網頁上能「跟讀、看語調」，需要三樣東西：① mp3 → ② timing（每句的時間）→ ③ 索引。照順序做。')
        self.tool_card(b, '① 做 mp3：自動語音', '用 Azure 語音替「還沒有 mp3 的文章」產生音檔（視窗裡勾選要做的項目）。'
                       '需要先設定好 SPEECH_KEY／SPEECH_REGION 環境變數。', [('開啟自動語音（每日文章）', lambda: self.launch('speech', ['daily']), 'primary'),
                                                              ('開啟 audio/daily 資料夾', lambda: open_path(os.path.join(BASE, 'audio', 'daily')), 'plain')], '自動')
        self.tool_card(b, '① 做 mp3：自己錄', '自己錄好 mp3，檔名用文章編號（例如 w1d8-3.mp3），放進 audio/daily/ 資料夾。'
                       '不確定缺哪些、檔名怎麼取？開「維護精靈」，它會列出缺的檔名並引導你。', [('開啟 audio/daily 資料夾', lambda: open_path(os.path.join(BASE, 'audio', 'daily')), 'plain'),
                                                                  ('維護精靈（手動錄音引導）', lambda: self.launch('fix', console=True), 'ghost')], '手動')
        self.tool_card(b, '② 對時（timing ＋ 語調曲線）', '用 whisper 聽 mp3，算出每一句的開始／結束時間，寫進 daily.json。'
                       '開啟後依序選：mp3（可複選）→ daily.json。第一次會自動安裝 faster-whisper（需要連網）。',
                       [('開啟對時工具', lambda: self.launch('timing'), 'primary')], '重要')
        self.tool_card(b, '③ 更新索引（audio/index.json 等）', '掃描 audio 資料夾與 daily.json，產生網頁「維護總覽」讀的索引。每次改完 mp3 或 timing 都跑一次。',
                       [('更新索引', self.run_scan, 'primary')])
        self.au_log = Log(b, height=12)
        self.au_log.pack(fill='x', padx=28, pady=(6, 24))

    def run_scan(self):
        self.capture('scan', [], self.au_log, done=self._scan_done)

    def _scan_done(self):
        for p in self.pages.values():
            pass

    # ═════════ 🔧 維護與檢查 ═════════
    def build_maint(self, fr):
        sf = ScrollFrame(fr, C['bg'])
        sf.pack(fill='both', expand=True)
        b = sf.inner
        self.header(b, '維護與檢查', '不確定哪裡有問題時，從這裡開始。這些工具都只會先檢查、問過你才改動。')
        self.tool_card(b, '維護精靈（建議先用這個）', '掃描整個專案，找出缺 mp3、timing 沒做好、待檢查的文章，再一步一步引導你補齊：'
                       '先自動找放錯位置的 mp3 → 真的沒有才引導錄音 → 對時 → 更新索引。會開一個黑色視窗，照提示輸入即可。',
                       [('開啟維護精靈', lambda: self.launch('fix', console=True), 'primary')], '一步一步')
        self.tool_card(b, '維護總檢查', '列出每篇文章缺什麼（mp3／timing），並告訴你下一步做什麼。只讀取、不改任何檔案。',
                       [('執行總檢查', lambda: self.capture('ai', ['--maint'], self.mt_log), 'primary')])
        w, c = self.card(b)
        w.pack(fill='x', padx=28, pady=6)
        tk.Label(c, text='單篇診斷', font=F['h2'], bg=C['card']).pack(anchor='w')
        wlabel(c, '輸入文章編號，看它的 mp3 長度、timing 涵蓋範圍、漏掉哪些句子、原因與處理方式（結果也會存成 scan_output/diag_*.md）。',
               font=F['s'], fg=C['mute'], bg=C['card']).pack(fill='x', pady=(3, 8))
        r = tk.Frame(c, bg=C['card'])
        r.pack(fill='x')
        tk.Label(r, text='文章編號：', font=F['n'], bg=C['card']).pack(side='left')
        self.mt_id = tk.StringVar(value='w1d8-3')
        tk.Entry(r, textvariable=self.mt_id, font=F['n'], width=14, relief='solid', bd=1).pack(side='left', ipady=4, padx=6)
        mkbtn(r, '診斷', lambda: self.capture('ai', ['--diag', self.mt_id.get().strip()], self.mt_log), 'primary', pad=(14, 5)).pack(side='left')
        self.tool_card(b, '找多餘的 mp3', '找出 audio/daily 裡不屬於任何文章的 mp3（舊檔名、複製檔、打錯的檔名），讓你勾選後移走。'
                       '舊檔名但正確檔名不存在的，會建議改名而不是刪。移走的檔案放在 backup/，可以搬回來。',
                       [('找多餘的 mp3', self.open_extra_mp3, 'primary')])
        self.tool_card(b, '整理重複詳解', '同一個單字在好幾篇都有詳解時，統一成一份（會先備份）。', [('開啟（黑色視窗）', lambda: self.launch('merge', ['unify'], console=True), 'plain')])
        self.mt_log = Log(b, height=16)
        self.mt_log.pack(fill='x', padx=28, pady=(6, 24))

    # ───── 找多餘的 mp3 ─────
    def open_extra_mp3(self):
        try:
            rows = extra_mp3_scan()
        except Exception as e:
            messagebox.showerror('掃描失敗', str(e))
            return
        w = getattr(self, '_ex_win', None)
        if w is not None and w.winfo_exists():
            w.destroy()
        w = self._ex_win = tk.Toplevel(self)
        w.title('找多餘的 mp3（audio/daily）')
        w.geometry('1000x560')
        w.configure(bg=C['bg'])
        w.transient(self)
        info = tk.Label(w, text='', font=F['n'], bg=C['bg'], fg=C['text'], anchor='w', justify='left')
        info.pack(fill='x', padx=18, pady=(14, 4))
        wlabel(w, '點「勾」那一欄可勾選。「刪除」其實是移到 backup/extra_mp3_時間/，不會真的消失。'
                  '紅色＝舊檔名但正確檔名不存在（請改名，不要刪）。vocab/、words/ 資料夾不會被掃描。',
               font=F['s'], fg=C['mute'], bg=C['bg']).pack(fill='x', padx=18)
        wrap = tk.Frame(w, bg=C['bg'])
        wrap.pack(fill='both', expand=True, padx=18, pady=8)
        cols = ('chk', 'name', 'kind', 'size', 'mtime', 'note')
        tv = ttk.Treeview(wrap, columns=cols, show='headings', selectmode='browse')
        for c, t, wd in (('chk', '勾', 44), ('name', '檔名', 150), ('kind', '類型', 90), ('size', '大小', 80),
                         ('mtime', '修改時間', 130), ('note', '說明', 440)):
            tv.heading(c, text=t)
            tv.column(c, width=wd, anchor='w' if c in ('name', 'note') else 'center', stretch=(c == 'note'))
        sb = ttk.Scrollbar(wrap, orient='vertical', command=tv.yview)
        tv.configure(yscrollcommand=sb.set)
        tv.pack(side='left', fill='both', expand=True)
        sb.pack(side='right', fill='y')
        tv.tag_configure('rename', background=C['badbg'])
        tv.tag_configure('dup', background=C['warnbg'])
        KIND = {'dup': '重複', 'rename': '需改名', 'unknown': '不明'}
        st = dict(rows={}, on=set())

        def fill(rs):
            tv.delete(*tv.get_children())
            st['rows'] = {r['name']: r for r in rs}
            st['on'] = set()
            for r in rs:
                tv.insert('', 'end', iid=r['name'], tags=(r['kind'],),
                          values=('☐', r['name'], KIND[r['kind']], '%.0f KB' % (r['size'] / 1024.0),
                                  time.strftime('%Y-%m-%d %H:%M', time.localtime(r['mtime'])), r['note']))
            nd = sum(1 for r in rs if r['kind'] == 'dup')
            info.configure(text=('沒有多餘的 mp3 ✔' if not rs else '找到 %d 個多餘的 mp3：重複 %d、需改名 %d、不明 %d'
                                 % (len(rs), nd, sum(1 for r in rs if r['kind'] == 'rename'), sum(1 for r in rs if r['kind'] == 'unknown'))))

        def mark(n, on):
            if on:
                st['on'].add(n)
            else:
                st['on'].discard(n)
            tv.set(n, 'chk', '☑' if on else '☐')

        def click(e):
            if tv.identify_region(e.x, e.y) == 'cell' and tv.identify_column(e.x) == '#1':
                n = tv.identify_row(e.y)
                if n:
                    mark(n, n not in st['on'])

        tv.bind('<Button-1>', click)

        def pick(fn):
            for n, r in st['rows'].items():
                mark(n, fn(r))

        def rescan():
            try:
                fill(extra_mp3_scan())
            except Exception as e:
                messagebox.showerror('掃描失敗', str(e))

        def delete():
            sel = [st['rows'][n] for n in st['on']]
            if not sel:
                messagebox.showinfo('刪除', '還沒有勾選任何檔案。', parent=w)
                return
            warn = [r['name'] for r in sel if r['kind'] == 'rename']
            msg = '把這 %d 個檔案移到 backup/extra_mp3_時間/？\n\n%s' % (len(sel), '\n'.join(r['name'] for r in sel[:15]) + ('\n…' if len(sel) > 15 else ''))
            if warn:
                msg += '\n\n⚠ 其中 %d 個是「需改名」的舊檔（正確檔名不存在），移走後該篇仍然沒有 mp3：\n%s' % (len(warn), '、'.join(warn[:8]))
            if not messagebox.askyesno('確認', msg, parent=w):
                return
            ok, errs, dst = extra_mp3_move([r['path'] for r in sel])
            rescan()
            messagebox.showinfo('完成', '已移走 %d 個檔案。\n位置：%s%s\n\n接著請到「錄音與對時」按「更新索引」。' % (ok, dst, ('\n\n失敗：\n' + '\n'.join(errs)) if errs else ''), parent=w)

        def rename():
            sel = [st['rows'][n] for n in st['on'] if st['rows'][n]['kind'] == 'rename']
            if not sel:
                messagebox.showinfo('改名', '請勾選「需改名」的檔案。', parent=w)
                return
            if not messagebox.askyesno('確認', '改名：\n' + '\n'.join('%s → %s' % (r['name'], os.path.basename(r['target'])) for r in sel), parent=w):
                return
            errs = []
            for r in sel:
                try:
                    if os.path.exists(r['target']):
                        raise OSError('目的檔已存在')
                    os.rename(r['path'], r['target'])
                except Exception as e:
                    errs.append('%s：%s' % (r['name'], e))
            rescan()
            messagebox.showinfo('改名', '完成。' + (('\n\n失敗：\n' + '\n'.join(errs)) if errs else '\n接著請按「更新索引」。'), parent=w)

        bar = tk.Frame(w, bg=C['bg'])
        bar.pack(fill='x', padx=18, pady=(0, 14))
        mkbtn(bar, '勾選全部重複檔', lambda: pick(lambda r: r['kind'] == 'dup'), 'plain', pad=(10, 5)).pack(side='left')
        mkbtn(bar, '全選', lambda: pick(lambda r: True), 'plain', pad=(10, 5)).pack(side='left', padx=6)
        mkbtn(bar, '全不選', lambda: pick(lambda r: False), 'plain', pad=(10, 5)).pack(side='left')
        mkbtn(bar, '重新掃描', rescan, 'plain', pad=(10, 5)).pack(side='left', padx=6)
        mkbtn(bar, '開啟資料夾', lambda: open_path(os.path.join(BASE, 'audio', 'daily')), 'plain', pad=(10, 5)).pack(side='left')
        mkbtn(bar, '刪除勾選的（移到 backup）', delete, 'danger', pad=(12, 5)).pack(side='right')
        mkbtn(bar, '改名為正確檔名', rename, 'primary', pad=(12, 5)).pack(side='right', padx=8)
        fill(rows)

    # ═════════ 🗑 刪除與 Trash ═════════
    def build_trash(self, fr):
        b = ScrollFrame(fr, C['bg'])
        b.pack(fill='both', expand=True)
        self.header(b.inner, '刪除與 Trash', '刪除一篇文章會先把整筆資料（可選：連 mp3）搬進 _trash，之後可以還原；只有「永久刪除」才會真的消失。')
        self.tool_card(b.inner, '刪除文章／永久清除 Trash', '開啟後有兩個功能：\n'
                       '  1＝刪除指定文章（刪之前備份 daily.json；該日變成「此日內容尚未建置」，不重新編號）\n'
                       '  2＝永久刪除 Trash 內的文章（資料與音檔都會消失，無法復原）',
                       [('開啟（黑色視窗）', lambda: self.launch('trash', console=True), 'danger'),
                        ('開啟 _trash 資料夾', lambda: open_path(os.path.join(BASE, '_trash')) if os.path.isdir(os.path.join(BASE, '_trash')) else messagebox.showinfo('Trash', '目前沒有 _trash 資料夾（還沒刪過文章）。'), 'plain')])
        self.tool_card(b.inner, '還原被刪掉的文章', '還原是在網頁的「Trash」清單頁操作（網頁會讀 trash-index.json）。刪除或清空之後，這個索引會自動重建。', [('回到開始', lambda: self.show('home'), 'plain')])

    # ═════════ 🤖 給 AI 的掃描 ═════════
    def build_ai(self, fr):
        sf = ScrollFrame(fr, C['bg'])
        sf.pack(fill='both', expand=True)
        b = sf.inner
        self.header(b, '給 AI 的專案掃描', '要請 AI 幫你改程式或查問題時，先用這裡產生一份 Markdown，整份貼給 AI 或上傳。金鑰、密碼樣式的字串會自動遮掉，不會改動你的任何檔案。')
        self.tool_card(b, '掃描 daily 範圍', '產生 daily.html、daily.js、維護腳本等的「骨架」文件（小檔完整、大檔只列結構）。',
                       [('掃描 daily（骨架）', lambda: self.capture('ai', ['daily'], self.ai_log, done=self.ai_done), 'primary'),
                        ('掃描 daily（全部完整）', lambda: self.capture('ai', ['daily', '--full'], self.ai_log, done=self.ai_done), 'plain')])
        w, c = self.card(b)
        w.pack(fill='x', padx=28, pady=6)
        tk.Label(c, text='全專案搜尋文字', font=F['h2'], bg=C['card']).pack(anchor='w')
        wlabel(c, '用正規表示式搜尋整個專案，列出命中的行（例如 w\\d+d8）。', font=F['s'], fg=C['mute'], bg=C['card']).pack(fill='x', pady=(3, 8))
        r = tk.Frame(c, bg=C['card'])
        r.pack(fill='x')
        self.ai_q = tk.StringVar()
        tk.Entry(r, textvariable=self.ai_q, font=F['n'], relief='solid', bd=1).pack(side='left', fill='x', expand=True, ipady=4)
        mkbtn(r, '搜尋', lambda: self.ai_q.get().strip() and self.capture('ai', ['--grep', self.ai_q.get().strip()], self.ai_log, done=self.ai_done), 'primary', pad=(14, 5)).pack(side='left', padx=8)
        self.tool_card(b, '互動式選單（進階）', '開原版選單：自選範圍、詳細程度、寫任務說明。', [('開啟（黑色視窗）', lambda: self.launch('ai', console=True), 'plain'),
                                                                      ('開啟 scan_output 資料夾', self.ai_open_dir, 'plain')])
        self.ai_log = Log(b, height=14)
        self.ai_log.pack(fill='x', padx=28, pady=(6, 6))
        self.ai_bar = tk.Frame(b, bg=C['bg'])
        self.ai_bar.pack(fill='x', padx=28, pady=(0, 24))

    def ai_open_dir(self):
        d = os.path.join(BASE, 'scan_output')
        os.makedirs(d, exist_ok=True)
        open_path(d)

    def ai_done(self):
        for w in self.ai_bar.winfo_children():
            w.destroy()
        fs = sorted(glob.glob(os.path.join(BASE, 'scan_output', '*.md')), key=os.path.getmtime, reverse=True)
        if not fs:
            return
        p = fs[0]
        tk.Label(self.ai_bar, text='最新：%s' % os.path.basename(p), font=F['s'], fg=C['mute'], bg=C['bg']).pack(side='left')

        def cp():
            try:
                with open(p, encoding='utf-8') as f:
                    t = f.read()
                self.clipboard_clear()
                self.clipboard_append(t)
                messagebox.showinfo('已複製', '已把整份（%d 字元）複製到剪貼簿，可以直接貼給 AI。' % len(t), parent=self)
            except Exception as e:
                messagebox.showerror('複製失敗', str(e), parent=self)
        mkbtn(self.ai_bar, '複製整份內容', cp, 'primary', pad=(10, 4)).pack(side='left', padx=8)
        mkbtn(self.ai_bar, '開啟檔案', lambda: open_path(p), 'plain', pad=(10, 4)).pack(side='left')

    # ═════════ ❓ 說明 ═════════
    def build_help(self, fr):
        sf = ScrollFrame(fr, C['bg'])
        sf.pack(fill='both', expand=True)
        b = sf.inner
        self.header(b, '說明', '每支腳本負責什麼，以及檔案有沒有放對位置。')
        w, c = self.card(b)
        w.pack(fill='x', padx=28, pady=6)
        tk.Label(c, text='腳本檢查', font=F['h2'], bg=C['card']).pack(anchor='w', pady=(0, 6))
        desc = {'merge': '合併 json 的檢查與寫入邏輯（本工作台直接引用）', 'speech': '用 Azure 語音產生 mp3', 'timing': '用 whisper 對時，寫入 timing 與語調曲線',
                'scan': '更新 audio/index.json、vocab_index.json 等索引', 'fix': '維護精靈：缺 mp3／timing 一步步補齊', 'trash': '刪除文章與永久清除 Trash',
                'ai': '產生給 AI 看的專案掃描文件、維護總檢查、單篇診斷'}
        for k, (fn, nm) in SCRIPTS.items():
            ok = find_script(k) is not None
            r = tk.Frame(c, bg=C['card'])
            r.pack(fill='x', pady=2)
            tk.Label(r, text='✔' if ok else '✗', font=F['b'], fg=C['ok'] if ok else C['bad'], bg=C['card'], width=3).pack(side='left')
            tk.Label(r, text=fn, font=F['mono'], bg=C['card'], width=24, anchor='w').pack(side='left')
            tk.Label(r, text=desc[k], font=F['s'], fg=C['mute'], bg=C['card'], anchor='w').pack(side='left')
        w, c = self.card(b)
        w.pack(fill='x', padx=28, pady=6)
        tk.Label(c, text='安全規則', font=F['h2'], bg=C['card']).pack(anchor='w', pady=(0, 6))
        for t in ('寫入 daily.json 之前一定先備份到 backup/（套用文稿修改的備份檔名含 before_passage）。',
                  '每一步都會先顯示摘要、等你按確認，不會偷偷改動。',
                  '套用文稿修改只動那一篇；其他篇的內容逐字元不變。',
                  '刪除的文章先進 _trash/，可還原；「永久刪除」才無法復原。',
                  '改過文稿後，網頁會出現「✎待檢查」：請看翻譯、單字、題目還對不對。沒問題就在網頁按「檢查過都沒問題」。',
                  '備份檔可以放心刪，但建議留最近幾份。'):
            wlabel(c, '• ' + t, font=F['n'], bg=C['card']).pack(fill='x', pady=1)
        w, c = self.card(b)
        w.pack(fill='x', padx=28, pady=6)
        tk.Label(c, text='名詞對照', font=F['h2'], bg=C['card']).pack(anchor='w', pady=(0, 6))
        for t in ('w1d8-3 ＝ 第 1 週的專案文章第 3 篇，在 daily.json 裡是 week=1、day=10（day 8、9、10… 依序是專案第 1、2、3 篇）。',
                  'timing ＝ 每一句在 mp3 裡的開始與結束秒數；沒有它，網頁就不能一句一句跟讀。',
                  '補丁 ＝ 只含「要改的欄位」的小 json：_passage（文稿）、_fix（翻譯／單字／題目）、_extra（詳解）。',
                  '草稿 ＝ 你在網頁維護頁編輯後存下的文稿，只存在那個瀏覽器；套用到 daily.json 之後就可以刪除。'):
            wlabel(c, '• ' + t, font=F['n'], bg=C['card']).pack(fill='x', pady=1)
        tk.Frame(b, bg=C['bg'], height=20).pack()


def main():
    app = Hub()
    if not os.path.isfile(MAIN):
        app.after(300, lambda: messagebox.showwarning('找不到 daily.json', '在這個資料夾找不到 daily.json：\n%s\n\n請把 daily_hub.py 放到專案根目錄再開啟。' % BASE))
    app.mainloop()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        traceback.print_exc()
        try:
            input('\n發生錯誤（上面是詳細訊息）。按 Enter 關閉視窗…')
        except EOFError:
            pass
