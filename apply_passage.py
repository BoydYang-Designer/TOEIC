# -*- coding: utf-8 -*-
"""apply_passage.py — 把網頁「下載 w1d8-3_passage.json」下載的文稿修改，直接套用進 daily.json。

用法（放在專案根目錄，與 daily.json 同層）：
    python apply_passage.py                 → 選單：列出找到的 *_passage.json（專案資料夾、下載資料夾），選一個
    python apply_passage.py 檔案路徑         → 直接指定檔案（也可把檔案拖進視窗）
    （選單裡輸入 F 會跳出檔案選擇視窗）

做的事：
  1. 讀補丁 {week, day, passage, presentation_phrases?}，找到 daily.json 裡對應那一篇。
  2. 比對新舊文稿（逐字）。沒改到的句子 → timing 保留、字元位置自動平移；
     被刪掉的句子 → timing 直接丟掉；被改過或新增的句子 → 該句 timing 丟掉，並列出來告訴你要重錄／重對時。
  3. mp3 完全不動；daily.json 只有這一篇改變（其他篇逐字元不變）；改之前自動備份。
  4. 標記 edited＝今天、review_pending＝true（網頁會提醒你檢查翻譯／單字／題目）。
  5. 如果刪掉了標題行（如 Closing），可以順便選要不要刪對應的中文標題行。
"""
import json, sys, os, re, glob, shutil, time, copy, difflib
sys.stdout.reconfigure(encoding='utf-8')
F = 'daily.json'


def find_patches():
    dirs = [os.getcwd(), os.path.dirname(os.path.abspath(__file__)), os.path.join(os.path.expanduser('~'), 'Downloads')]
    seen, out = set(), []
    for d in dirs:
        for p in glob.glob(os.path.join(d, '*_passage*.json')):
            a = os.path.abspath(p)
            if a not in seen: seen.add(a); out.append(a)
    return sorted(out, key=os.path.getmtime, reverse=True)


def pick_file():
    if len(sys.argv) > 1: return sys.argv[1].strip('"')
    ps = find_patches()[:15]
    print('要套用哪一個文稿修改檔？\n')
    for i, p in enumerate(ps, 1):
        print('  %d. %s　(%s)' % (i, os.path.basename(p), time.strftime('%m/%d %H:%M', time.localtime(os.path.getmtime(p)))))
    print('  F. 開啟檔案選擇視窗\n  Q. 離開')
    while True:
        c = input('\n請輸入編號：').strip().strip('"')
        if c.lower() == 'q': sys.exit(0)
        if c.lower() == 'f':
            try:
                import tkinter as tk
                from tkinter import filedialog
                r = tk.Tk(); r.withdraw(); r.attributes('-topmost', True)
                p = filedialog.askopenfilename(title='選擇 *_passage.json', filetypes=[('JSON', '*.json')])
                r.destroy()
                if p: return p
            except Exception as e:
                print('（無法開啟視窗：%s）' % e)
            continue
        if c.isdigit() and 1 <= int(c) <= len(ps): return ps[int(c) - 1]
        if os.path.isfile(c): return c
        print('輸入不正確')


def toks(s): return [(m.group(), m.start(), m.end()) for m in re.finditer(r'\S+', s)]


def remap_timing(old, new, tm):
    """回傳 (保留的 timing, 被刪掉的句子文字, 被改過的句子文字)"""
    T0, T1 = toks(old), toks(new)
    sm = difflib.SequenceMatcher(None, [t[0] for t in T0], [t[0] for t in T1], autojunk=False)
    m = {}                                   # 舊 token 序號 → 新 token 序號（只含沒變的）
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1): m[i1 + k] = j1 + k
    keep, gone, changed = [], [], []
    for s in tm:
        idx = [i for i, t in enumerate(T0) if t[1] >= s['from'] and t[2] <= s['to']]
        txt = old[s['from']:s['to']]
        if not idx: continue
        ok = [i for i in idx if i in m]
        if not ok: gone.append(txt); continue
        if len(ok) == len(idx) and all(m[idx[k + 1]] == m[idx[k]] + 1 for k in range(len(idx) - 1)):
            delta = T1[m[idx[0]]][1] - T0[idx[0]][1]
            nf, nt = s['from'] + delta, s['to'] + delta
            if new[nf:nt] == txt:
                s['from'], s['to'] = nf, nt
                for w in s.get('words') or []: w[0] += delta; w[1] += delta
                keep.append(s); continue
        changed.append(txt)
    return keep, gone, changed


def dump_item(o):                            # 照 daily.json 原本的排版寫出一篇
    store = []
    def walk(v, inpro=False):
        if isinstance(v, dict):
            for k, u in v.items():
                if inpro and isinstance(u, list) and u and all(isinstance(n, (int, float)) for n in u):
                    store.append(json.dumps(u, separators=(',', ':'))); v[k] = '@@%d@@' % (len(store) - 1)
                else: walk(u, inpro or k == 'prosody')
        elif isinstance(v, list):
            for j, u in enumerate(v):
                if isinstance(u, dict) and 'start' in u and 'words' not in u and set(u) <= {'start', 'end', 'from', 'to'}:
                    store.append(json.dumps(u, ensure_ascii=False)); v[j] = '@@%d@@' % (len(store) - 1)
                else: walk(u, inpro)
    o = copy.deepcopy(o); walk(o)
    s = json.dumps(o, ensure_ascii=False, indent=2)
    for n, u in enumerate(store): s = s.replace('"@@%d@@"' % n, u)
    return s.replace('\n', '\r\n    ')


def short(s, n=60):
    s = s.replace('\n', ' ');
    return s if len(s) <= n else s[:n] + '…'


def main():
    pf = pick_file()
    with open(pf, encoding='utf-8-sig') as f: patch = json.load(f)
    for k in ('week', 'day', 'passage'):
        if k not in patch: sys.exit('這不是文稿修改檔（缺少 %s）' % k)
    with open(F, 'rb') as f: raw = f.read().decode('utf-8-sig')
    dec = json.JSONDecoder()
    i = raw.index('[', raw.index('"items"')) + 1
    spans = []
    while True:
        while raw[i] in ' \r\n\t,': i += 1
        if raw[i] == ']': break
        o, e = dec.raw_decode(raw, i); spans.append((i, e, o)); i = e
    hit = [s for s in spans if int(s[2]['week']) == int(patch['week']) and int(s[2]['day']) == int(patch['day'])]
    if len(hit) != 1: sys.exit('daily.json 找不到 week=%s day=%s' % (patch['week'], patch['day']))
    a0, b0, x = hit[0]

    old = x['passage'].replace('\r\n', '\n').strip(); new = patch['passage'].replace('\r\n', '\n').strip()
    pp_new = patch.get('presentation_phrases')
    print('\n套用到：week=%s day=%s　%s' % (x['week'], x['day'], x.get('tag', '')))
    if old == new and not pp_new: sys.exit('文稿與原文相同，沒有需要更新的。')

    tm = x.get('timing') or []
    keep, gone, changed = remap_timing(old, new, copy.deepcopy(tm)) if tm else ([], [], [])
    # 新文稿裡沒有 timing 蓋到的文字（新增／改過的句子）
    cov = [0] * len(new)
    for s in keep:
        for k in range(s['from'], min(s['to'], len(new))): cov[k] = 1
    todo, cur = [], ''
    for para in new.split('\n'):
        pass
    for m in re.finditer(r'[^\n]+', new):
        if any(not cov[k] for k in range(m.start(), m.end()) if not new[k].isspace()):
            todo.append(m.group())

    print('\n──── 變更摘要 ────')
    print('英文：%d → %d 字元' % (len(old), len(new)))
    if tm:
        print('timing：%d 句 → 保留 %d 句' % (len(tm), len(keep)))
        for t in gone: print('  ✂ 刪除（原文已沒有）：' + short(t))
        for t in changed: print('  ✎ 改過 → timing 丟掉，需重錄／重對時：' + short(t))
        for t in todo: print('  ＋ 沒有 timing 的行：' + short(t))
    if pp_new: print('簡報句型：更新為 %d 句' % len(pp_new))
    if tm and (changed or any(t for t in todo)):
        print('\n⚠ 有「改過／新增」的句子：mp3 沒有念新的內容，之後需要重錄並用 daily_timestamps.py 對時。')
    else:
        print('\n✔ 只刪除了內容：mp3 與其餘句子的 timing 都維持有效，不需要重錄。')

    # 刪掉標題行 → 問要不要刪中文標題
    removed_heads = [l.strip() for l in old.split('\n') if l.strip() and l.strip() not in [n.strip() for n in new.split('\n')]
                     and len(l.strip()) <= 30 and not re.search(r'[.!?。！？…][」』”’）)"\']*$', l.strip())]
    zh = x.get('zh', '')
    zl = zh.split('\n')
    if removed_heads:
        cand = [(n, l) for n, l in enumerate(zl) if l.strip() and len(l.strip()) <= 30 and not re.search(r'[。！？!?…][」』”’）)"\']*$', l.strip())]
        if cand:
            print('\n你刪掉了標題行：%s' % '、'.join(removed_heads))
            print('中文翻譯裡有這些像標題的行，要順便刪嗎？')
            for n, (ln, l) in enumerate(cand, 1): print('  %d. %s' % (n, l.strip()))
            c = input('輸入要刪的編號（多個用逗號，Enter＝都不刪）：').strip()
            dele = {cand[int(t) - 1][0] for t in re.split(r'[,\s，、]+', c) if t.isdigit() and 1 <= int(t) <= len(cand)}
            if dele:
                out = [l for n, l in enumerate(zl) if n not in dele]
                x['zh'] = re.sub(r'\n{3,}', '\n\n', '\n'.join(out)).strip('\n')
                print('已刪除 %d 行中文標題' % len(dele))

    if input('\n確定寫入 daily.json？（y/N）：').strip().lower() != 'y': sys.exit('已取消，沒有改任何檔案。')

    x['passage'] = new
    if tm: x['timing'] = keep
    if pp_new: x['presentation_phrases'] = pp_new
    x['edited'] = time.strftime('%Y-%m-%d'); x['review_pending'] = True
    bk = 'daily.backup_%s.json' % time.strftime('%Y%m%d_%H%M%S')
    shutil.copy(F, bk)
    out = raw[:a0] + dump_item(x) + raw[b0:]
    json.loads(out)                          # 寫入前再驗證一次是合法 JSON
    with open(F, 'wb') as f: f.write(out.encode('utf-8'))
    print('\n✔ 完成。備份：%s\n下一步：重新上傳 daily.json → 重新整理網頁 → 草稿會變「已套用」→ 按「刪除草稿」。' % bk)


if __name__ == '__main__':
    main()
