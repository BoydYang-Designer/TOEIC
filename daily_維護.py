# -*- coding: utf-8 -*-
"""daily_fix.py — 每日文章「維護修復精靈」（雙擊執行；放在網站根目錄，與 daily.json、json_merge.py 同一個資料夾）

它做的事：掃描你的專案，找出「維護」缺的東西，再一步一步幫你補齊。
  ① mp3 缺漏：先自動在專案、audio/、下載／桌面資料夾找有沒有錄好卻放錯位置、大小寫打錯、副檔名不對的檔案，找到就搬到正確位置；
              真的沒有，才進入「手動錄音」引導（複製文稿 → 告訴你檔名與資料夾 → 你錄好存進去 → 它檢查）。
  ② timing：有 mp3 但沒對時／對時異常／只涵蓋部分句子 → 用 daily_timestamps.py 的 whisper 對時並寫回 daily.json；
            對不齊時可放寬標準重試，或「依音檔比對文稿」（逐處讓你決定要不要改文稿；改之前會做版本備份）。
  ③ 待檢查：文稿改過、翻譯／單字／題目還沒檢查 → 告訴你怎麼做（需要 AI），或你確認沒問題就清掉標記。
  ④ 最後可接著執行 Scan總表與音檔.py，更新網頁維護總覽讀的 audio/index.json。

安全：任何寫入 daily.json 之前都會先備份到 backup/；每一步都會問你，不會偷偷改動。
需要：json_merge.py、daily_timestamps.py（對時要連網安裝 faster-whisper 一次）；Scan總表與音檔.py（更新索引用）。
"""
import copy
import difflib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import traceback
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE = os.path.dirname(os.path.abspath(__file__))
MAIN = os.path.join(BASE, 'daily.json')
AUD = os.path.join(BASE, 'audio')
DDIR = os.path.join(AUD, 'daily')
MIN_MP3 = 1000                      # 小於這個大小的 mp3 視為壞檔（與 json_merge.py 的 mp3_ok 相同）
OTHER_EXT = ('.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma')
# 放寬對時標準（依序試）：對不齊時用；比 daily_timestamps.py 的 CFG 鬆，結果請自己看過
RELAX = [dict(min_ratio=0.45, fuzzy=0.60, edges=None, max_rate=None, fill_gaps=True),
         dict(min_ratio=0.30, fuzzy=0.50, edges=None, max_rate=None, fill_gaps=True)]


class Quit(Exception):
    pass


# ───────────────────────── 載入你現有的腳本 ─────────────────────────
def find_script(name):
    for d in (BASE, AUD, os.path.dirname(BASE)):
        p = os.path.join(d, name)
        if os.path.isfile(p):
            return p
    return None


def load_mod(modname, filename):
    p = find_script(filename)
    if not p:
        return None
    spec = importlib.util.spec_from_file_location(modname, p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


JM = load_mod('json_merge', 'json_merge.py')
if JM is None:
    sys.exit('找不到 json_merge.py，請把 daily_fix.py 放在它同一個資料夾。')
DTS = load_mod('daily_timestamps', 'daily_timestamps.py')   # 沒有的話：不能對時，其他功能照常


# ───────────────────────── 小工具 ─────────────────────────
def ask(prompt, default=''):
    return input(prompt).strip()      # 輸入被關閉（EOFError）就一路往上結束，不會卡在迴圈裡


def yes(prompt, default=False):
    s = ask(prompt + (' (Y/n)：' if default else ' (y/N)：')).lower()
    return default if not s else s in ('y', 'yes', '是', '好')


def title(t):
    print('\n' + '═' * 3 + ' ' + t + ' ' + '═' * 3)


def human(n):
    return '%.1f MB' % (n / 1048576.0) if n >= 1048576 else '%.0f KB' % (n / 1024.0)


def parse_id(s):
    """w1d1／1 1／1-1 → (1, 1)；w1d8-3 → (1, 10)（D8 專案第 N 篇＝day 7+N）；看不懂回傳 None。"""
    m = re.match(r'^w?\s*(\d+)\s*[d,\-\s]\s*(\d+)(?:-(\d+))?$', str(s).strip().lower())
    if not m:
        return None
    w, d = int(m.group(1)), int(m.group(2))
    if m.group(3):
        if d != 8 or int(m.group(3)) < 1:
            return None
        d = 7 + int(m.group(3))
    return (w, d)


def open_folder(path):
    try:
        if sys.platform.startswith('win'):
            os.startfile(path)            # noqa
        elif sys.platform == 'darwin':
            subprocess.Popen(['open', path])
        else:
            subprocess.Popen(['xdg-open', path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except Exception:
        return False


_TK = []


def clip(text):
    """複製到剪貼簿（用 tkinter，Python 內建）；失敗回傳 False。"""
    try:
        if not _TK:
            import tkinter as tk
            r = tk.Tk()
            r.withdraw()
            _TK.append(r)
        r = _TK[0]
        r.clipboard_clear()
        r.clipboard_append(text)
        r.update()
        return True
    except Exception:
        return False


def spk_paren(t):
    """與網頁「複製全文」相同：兩人以上對話時，行首的「人名:」改成「(人名:)」，避免被當成要唸出來的字。"""
    t = str(t or '')
    rx = re.compile(r"^([A-Z][A-Za-z.'\- ]{0,20}):(?=\s|$)", re.M)
    names = set(m.group(1) for m in rx.finditer(t))
    return rx.sub(r'(\1:)', t) if len(names) >= 2 else t


def safe_move(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.normcase(src) == os.path.normcase(dst) and src != dst:      # 只差大小寫（Windows）：分兩步改名
        tmp = src + '.rename_tmp'
        os.rename(src, tmp)
        os.rename(tmp, dst)
    else:
        shutil.move(src, dst)


# ───────────────────────── daily.json 存取 ─────────────────────────
class Store(object):
    def __init__(self):
        self.data = self.items = None
        self.backed = False
        self.changed = False

    def load(self):
        if not os.path.isfile(MAIN):
            sys.exit('找不到 %s' % MAIN)
        data, err = JM.read_json(MAIN)
        items, err2 = JM.split_main(data) if not err else (None, err)
        if err or err2:
            sys.exit('daily.json 無法使用：%s' % (err or err2))
        self.data, self.items = data, items

    def save(self):
        if not self.backed:
            bak = JM.backup_main(MAIN, 'daily')
            self.backed = True
            print('  （已備份 daily.json → %s）' % os.path.relpath(bak, BASE))
        text = (DTS.dump_json(self.data) if DTS else json.dumps(self.data, ensure_ascii=False, indent=2)) + '\n'
        tmp = MAIN + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            f.write(text)
        os.replace(tmp, MAIN)
        self.changed = True

    def arts(self):
        return sorted([x for x in self.items if isinstance(x, dict) and isinstance(x.get('week'), int)
                       and isinstance(x.get('day'), int)], key=lambda x: (x['week'], x['day']))

    def find(self, k):
        return next((x for x in self.arts() if (x['week'], x['day']) == k), None)


def aid(x):
    return JM.did(x['week'], x['day'])


def label(x):
    return 'W%d · %s' % (x['week'], JM.dlab(x['day']))


def mp3_path(x):
    return os.path.normpath(os.path.join(BASE, x.get('audio') or 'audio/daily/%s.mp3' % aid(x)))


def mp3_state(x):
    p = mp3_path(x)
    if not os.path.isfile(p):
        return 'none'
    return 'ok' if os.path.getsize(p) >= MIN_MP3 else 'tiny'


def timing_state(x):
    """與 Scan總表與音檔.py 的 timing_state 相同規則。"""
    if DTS is None:
        return '?', '找不到 daily_timestamps.py'
    sents = DTS.split_sentences(x.get('passage') or '')
    tm = x.get('timing')
    if not isinstance(tm, list) or not tm:
        return 'none', '尚未對時'
    got = []
    for e in tm:
        if not isinstance(e, dict) or not all(k in e for k in ('start', 'end', 'from', 'to')):
            return 'bad', 'timing 格式不完整'
        got.append((e['from'], e['to']))
    sset = set(sents)
    if any(g not in sset for g in got):
        return 'bad', 'timing 的句子範圍與現在的文稿對不上（文稿改過？）'
    if any(not (e['start'] < e['end']) for e in tm) or any(tm[i]['start'] < tm[i - 1]['start'] for i in range(1, len(tm))):
        return 'bad', 'timing 時間順序異常'
    gset = set(got)
    miss = [i + 1 for i, s in enumerate(sents) if s not in gset]
    if miss:
        return 'partial', '只涵蓋 %d/%d 句' % (len(sents) - len(miss), len(sents))
    return 'ok', ''


def issues(x):
    out = []
    if mp3_state(x) != 'ok':
        out.append('mp3')
    if timing_state(x)[0] not in ('ok', '?'):
        out.append('timing')
    if x.get('review_pending'):
        out.append('review')
    return out


# ───────────────────────── 健檢報告 ─────────────────────────
MP3_MARK = {'ok': '✔', 'none': '✖缺', 'tiny': '✖壞檔'}
TM_MARK = {'ok': '✔', 'partial': '△部分', 'bad': '✖異常', 'none': '✖未做', '?': '?'}


def pending_patches():
    out = []
    try:
        for f in sorted(os.listdir(BASE)):
            if re.match(r'^w\d+d\d+(?:-\d+)?_(?:extra|fix|passage)\.json$', f, re.I):
                out.append(f)
    except OSError:
        pass
    return out


def orphans(S):
    """audio/daily 裡不屬於任何文章、也不像任何缺檔文章的檔案。"""
    want = {os.path.normcase(mp3_path(x)) for x in S.arts()}
    out = []
    if os.path.isdir(DDIR):
        for f in sorted(os.listdir(DDIR)):
            p = os.path.join(DDIR, f)
            if os.path.isfile(p) and f.lower().endswith('.mp3') and os.path.normcase(p) not in want:
                if not any(stem_match(os.path.splitext(f)[0], aid(x)) for x in S.arts()):
                    out.append(f)
    return out


def case_issues(S):
    """audio/daily 裡檔名只差大小寫的檔（Windows 看不出來，但 GitHub Pages 區分大小寫，網頁會找不到）。"""
    out = []
    have = sorted(os.listdir(DDIR)) if os.path.isdir(DDIR) else []
    for x in S.arts():
        p = mp3_path(x)
        if os.path.dirname(p) != os.path.normpath(DDIR):
            continue
        exp = os.path.basename(p)
        for f in have:
            if f != exp and f.lower() == exp.lower():
                out.append((os.path.join(DDIR, f), os.path.join(DDIR, exp)))
    return out


def fix_case(S, auto=False):
    for src, dst in case_issues(S):
        print('  檔名大小寫不符：%s → %s' % (os.path.basename(src), os.path.basename(dst)))
        if auto or yes('    改成正確的檔名？', True):
            try:
                safe_move(src, dst)
                print('    ✔ 已改名。')
            except OSError as e:
                print('    ✖ 改名失敗：%s' % e)


def report(S):
    A = S.arts()
    title('健檢報告：共 %d 篇' % len(A))
    bad = [x for x in A if issues(x)]
    for x in A:
        iss = issues(x)
        if not iss:
            continue
        ts, why = timing_state(x)
        extra = '（%s）' % why if why and ts in ('partial', 'bad') else ''
        print('  %-8s mp3 %-5s timing %s%s%s　%s' % (aid(x), MP3_MARK[mp3_state(x)], TM_MARK[ts], extra,
                                                    '　✎待檢查' if x.get('review_pending') else '', (x.get('tag') or '')[:28]))
    n_mp3 = sum(1 for x in A if mp3_state(x) != 'ok')
    n_tm = sum(1 for x in A if timing_state(x)[0] not in ('ok', '?'))
    n_rv = sum(1 for x in A if x.get('review_pending'))
    print('\n  完全沒問題：%d 篇　｜　缺 mp3：%d　timing 未完成：%d　待檢查：%d' % (len(A) - len(bad), n_mp3, n_tm, n_rv))
    if DTS is None:
        print('  ⚠ 找不到 daily_timestamps.py，無法判斷／處理 timing。')
    pp = pending_patches()
    if pp:
        print('  📦 資料夾裡還有沒合併的補丁：%s（請用 json_merge.py 合併）' % '、'.join(pp))
    for src, dst in case_issues(S):
        print('  ⚠ 檔名大小寫不符：%s（應為 %s；GitHub Pages 區分大小寫，網頁會找不到）' % (os.path.basename(src), os.path.basename(dst)))
    orp = orphans(S)
    if orp:
        print('  ⚠ audio/daily 裡有不屬於任何文章的檔案（檔名打錯？）：%s' % '、'.join(orp))
    return bad


# ───────────────────────── 找檔、搬檔 ─────────────────────────
def stem_match(stem, id_):
    s = stem.lower().replace(' ', '').replace('_', '-')
    s = re.sub(r'(\(\d+\)|-copy|copy|副本)$', '', s).strip('-')
    return s == id_


def search_dirs():
    home = os.path.expanduser('~')
    ds = [DDIR, AUD, BASE, os.path.join(home, 'Downloads'), os.path.join(home, 'Desktop'), os.path.join(home, '下載'), os.path.join(home, '桌面')]
    out = []
    for d in ds:
        if os.path.isdir(d) and os.path.normcase(d) not in [os.path.normcase(o) for o in out]:
            out.append(d)
    return out


def find_candidates(x):
    """找「應該是這篇的錄音」：檔名（容許大小寫、底線、(1)、copy）對得上 id、且不是正確位置上那個好檔。"""
    id_, target = aid(x), mp3_path(x)
    res = []
    for d in search_dirs():
        try:
            names = sorted(os.listdir(d))
        except OSError:
            continue
        for f in names:
            p = os.path.join(d, f)
            stem, ext = os.path.splitext(f)
            if not os.path.isfile(p) or not stem_match(stem, id_):
                continue
            if ext.lower() != '.mp3' and ext.lower() not in OTHER_EXT:
                continue
            if p == target:
                continue
            if os.path.getsize(p) < MIN_MP3:
                continue
            res.append(p)
    return res


def adopt(x, src):
    """把找到的檔案放到正確位置；非 mp3 會嘗試用 ffmpeg 轉換。成功回傳 True。"""
    dst = mp3_path(x)
    ext = os.path.splitext(src)[1].lower()
    try:
        if ext == '.mp3':
            if os.path.isfile(dst) and os.path.normcase(dst) != os.path.normcase(src):
                os.replace(dst, dst + '.bad')           # 原本那個是壞檔（太小），留個 .bad 不直接刪
            safe_move(src, dst)
            return mp3_state(x) == 'ok'
        ff = shutil.which('ffmpeg')
        if not ff:
            print('  這是 %s 檔，網頁需要 mp3，但這台電腦找不到 ffmpeg 可以轉換。請用錄音軟體另存成 mp3 再放進去。' % ext)
            return False
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        r = subprocess.run([ff, '-y', '-i', src, '-codec:a', 'libmp3lame', '-q:a', '2', dst], capture_output=True)
        if r.returncode != 0:
            print('  ffmpeg 轉換失敗。')
            return False
        print('  已轉成 mp3（原檔沒有刪除）。')
        return mp3_state(x) == 'ok'
    except OSError as e:
        print('  搬檔失敗：%s' % e)
        return False


def try_find(x, auto=False):
    """有找到就（問過之後）放到正確位置。回傳 True＝mp3 現在好了。"""
    for src in find_candidates(x):
        rel = os.path.relpath(src, BASE) if src.startswith(BASE) else src
        print('  找到可能是這篇的錄音：%s（%s）' % (rel, human(os.path.getsize(src))))
        print('    → 要放到：%s' % os.path.relpath(mp3_path(x), BASE))
        if auto or yes('    搬過去？', True):
            if adopt(x, src):
                print('  ✔ 已就位。')
                return True
    return False


# ───────────────────────── 手動錄音引導 ─────────────────────────
def manual_record(x, S, T):
    """一步一步引導手動錄音。回傳 'ok' / 'skip'；結束整個精靈丟 Quit。"""
    id_, target = aid(x), mp3_path(x)
    folder, fn = os.path.dirname(target), os.path.basename(target)
    os.makedirs(folder, exist_ok=True)
    text = spk_paren(x.get('passage') or '')
    n_w = len(re.findall(r"[A-Za-z0-9']+", text))
    title('手動錄音　%s「%s」' % (label(x), x.get('tag') or ''))
    secs = int(n_w / 2.5)
    print('  這篇 %d 個英文字，念起來大約 %d 分 %02d 秒（%s）。' % (n_w, secs // 60, secs % 60, x.get('type') or ''))
    if text != (x.get('passage') or ''):
        print('  對話的「人名:」已改成「(人名:)」，那只是標示誰在說話，請不要唸出來。')
    copied = clip(text)
    opened = open_folder(folder)
    print('\n  步驟 1　文稿：%s' % ('已複製到剪貼簿，到錄音軟體直接貼上。' if copied else '（無法自動複製，文稿如下，請自行選取）'))
    if not copied:
        print('-' * 50 + '\n' + text + '\n' + '-' * 50)
    print('  步驟 2　錄音，存成 mp3，檔名一定要是：%s' % fn)
    print('  步驟 3　放進這個資料夾：%s%s' % (folder, '（已幫你打開）' if opened else ''))
    while True:
        s = ask('\n  錄好並存進去後按 Enter 檢查（c＝再複製文稿　o＝再開資料夾　s＝先跳過這篇　q＝結束）：').lower()
        if s == 'q':
            raise Quit()
        if s == 's':
            return 'skip'
        if s == 'c':
            print('  ' + ('✔ 已複製文稿。' if clip(text) else '複製失敗。'))
            continue
        if s == 'o':
            open_folder(folder)
            continue
        st = mp3_state(x)
        if st == 'ok':
            print('  ✔ 找到 %s（%s）' % (fn, human(os.path.getsize(target))))
            return 'ok'
        if try_find(x):
            return 'ok'
        if st == 'tiny':
            print('  ✖ %s 只有 %d bytes，太小，可能是空檔或錄壞了，請重新錄。' % (fn, os.path.getsize(target)))
        else:
            print('  ✖ 還沒看到 %s。請確認：檔名完全一樣（%s）、副檔名是 .mp3、放在上面那個資料夾。' % (fn, id_ + '.mp3'))


def step_mp3(x, S, T, auto=False):
    """回傳 'ok' / 'skip'（還缺）；auto 模式不錄音。"""
    st = mp3_state(x)
    print('  ① mp3：%s' % ('缺（audio 資料夾裡沒有 %s）' % os.path.basename(mp3_path(x)) if st == 'none' else '檔案太小（壞檔）'))
    if try_find(x, auto):
        return 'ok'
    if auto:
        print('  　找不到現成的錄音，需要手動錄（改用精靈處理）。')
        return 'skip'
    sp = find_script('auto-speech.py')
    while True:
        opts = '1＝手動錄音（我一步一步帶你）'
        if sp:
            opts += '　2＝自動語音（執行 auto-speech.py）'
        s = ask('  怎麼補？%s　s＝先跳過　q＝結束：' % opts).lower()
        if s == 'q':
            raise Quit()
        if s == 's':
            return 'skip'
        if s == '2' and sp:
            print('  開啟 auto-speech.py（做完關閉它的視窗，回到這裡）…')
            subprocess.run([sys.executable, sp, 'daily'], cwd=BASE)
            if mp3_state(x) == 'ok':
                print('  ✔ mp3 已經有了。')
                return 'ok'
            print('  還是沒看到 mp3。')
            continue
        if s in ('1', ''):
            r = manual_record(x, S, T)
            if r == 'ok':
                return 'ok'
            return 'skip'


# ───────────────────────── 對時 ─────────────────────────
class Timer(object):
    def __init__(self):
        self.model = None
        self.dead = False

    def get_model(self):
        if self.model is None:
            self.model = DTS.load_model(DTS.MODEL)
        return self.model

    def words(self, mp3):
        return DTS.transcribe_cached(self.get_model, mp3, os.path.join(BASE, 'backup', 'asr_cache'))


def show_report(report_lines, limit=40):
    for ln in report_lines[:limit]:
        print(ln)
    if len(report_lines) > limit:
        print('  …另有 %d 行' % (len(report_lines) - limit))


def step_timing(x, S, T, auto=False):
    """回傳 'ok'（完整）/ 'part'（有寫入但有漏句）/ 'skip'。"""
    st, why = timing_state(x)
    print('  ② timing：%s' % {'none': '還沒對時', 'bad': '異常（%s）' % why, 'partial': '只涵蓋部分句子（%s）' % why}.get(st, st))
    if DTS is None:
        print('  　找不到 daily_timestamps.py，無法對時。')
        return 'skip'
    if T.dead:
        return 'skip'
    mp3 = mp3_path(x)
    try:
        words = T.words(mp3)
    except Exception as e:
        T.dead = True
        traceback.print_exc()
        print('  ✖ 語音辨識失敗（%s）。多半是還沒安裝 faster-whisper／沒連網。這次先跳過所有對時。' % e)
        return 'skip'
    cfg, tries, fresh = dict(DTS.CFG), 0, True
    while True:
        if fresh:
            timing, rep, total = DTS.align(x.get('passage') or '', words, cfg)
            print('  對齊結果（%d / %d 句）：' % (len(timing), total))
            show_report(rep)
            fresh = False
        full = total and len(timing) == total
        if full or (auto and timing):
            x['timing'] = timing
            S.save()
            print('  ✔ 已寫入 daily.json：%d / %d 句%s' % (len(timing), total, '' if full else '（有漏句，維護總覽仍會顯示「部分」）'))
            return 'ok' if full else 'part'
        if auto:
            print('  ✖ 一句都沒對上，跳過（mp3 與文稿可能不一樣，改用精靈處理）。')
            return 'skip'
        miss = total - len(timing)
        if total and miss * 2 >= total:
            print('  💡 一半以上的句子對不到，通常是「mp3 和文稿不是同一份」（文稿改過、或 mp3 是舊的）。建議先按 d 比對文稿。')
        opts = ['d＝依音檔比對文稿（文稿與錄音不一致時用）']
        if timing:
            opts.insert(0, 'y＝採用目前結果（%d/%d 句）' % (len(timing), total))
        if tries < len(RELAX):
            opts.append('l＝放寬標準再試一次')
        opts += ['r＝這篇重新錄音（舊檔先備份）', 's＝跳過', 'q＝結束']
        s = ask('  怎麼辦？  ' + '　'.join(opts) + '（Enter＝跳過）：').lower()
        if s == 'q':
            raise Quit()
        if s in ('s', ''):
            return 'skip'
        if s == 'y' and timing:
            x['timing'] = timing
            S.save()
            print('  ✔ 已寫入（%d/%d 句）。' % (len(timing), total))
            return 'part'
        if s == 'l' and tries < len(RELAX):
            cfg = dict(RELAX[tries])
            tries += 1
            fresh = True
            print('  放寬標準（第 %d 級）重新對齊…' % tries)
            continue
        if s == 'r':
            if redo_recording(x, S, T):
                return step_timing(x, S, T, auto)
            continue
        if s == 'd':
            r = diff_step(x, S, T, words)
            if r:
                return r
            continue
        print('  請輸入選項裡的字母。')


def redo_recording(x, S, T):
    mp3 = mp3_path(x)
    if os.path.isfile(mp3):
        d = os.path.join(BASE, 'backup', 'old_mp3')
        os.makedirs(d, exist_ok=True)
        dst = os.path.join(d, '%s_%s.mp3' % (aid(x), datetime.now().strftime('%Y%m%d_%H%M%S')))
        shutil.move(mp3, dst)
        print('  舊 mp3 已備份到 %s' % os.path.relpath(dst, BASE))
    r = manual_record(x, S, T)
    return r == 'ok'


# ───────────────────────── 依音檔比對文稿 ─────────────────────────
def hunk_text(h):
    k = h['kind']
    if k in ('delete', 'label'):
        return '文稿有「%s」，音檔沒唸 → 建議刪掉' % h['old']
    if k == 'insert':
        return '音檔有唸「%s」，文稿沒有 → 建議加進去' % h['new']
    return '文稿是「%s」，音檔唸成「%s」 → 建議改成音檔的' % (h['old'], h['new'])


def diff_step(x, S, T, words):
    """以音檔為準，找出文稿與錄音不一致的地方，逐處讓你決定。成功改完並重新對時回傳 'ok'/'part'；沒改回傳 None。"""
    old = x.get('passage') or ''
    hunks, skipped = DTS.diff_passage(old, words)
    if not hunks:
        print('  文稿和音檔沒有明顯差異（只是對時標準的問題），可以改試「放寬標準」。')
        return None
    title('文稿與音檔的差異（以音檔為準）')
    for h in hunks:
        print('  [%d] %s　%s' % (h['id'], '★很確定' if h['conf'] == 'sure' else '？請確認', hunk_text(h)))
        print('      音檔 %.1f–%.1f 秒｜%s' % (h['t0'], h['t1'], h['note']))
    s = ask('\n  要採用哪幾處？（編號用空白或逗號分隔；sure＝全部「很確定」的；all＝全部；Enter＝都不改）：').lower()
    if not s:
        return None
    if s == 'sure':
        pick = [h for h in hunks if h['conf'] == 'sure']
    elif s == 'all':
        pick = list(hunks)
    else:
        ids = {int(n) for n in re.findall(r'\d+', s)}
        pick = [h for h in hunks if h['id'] in ids]
    if not pick:
        print('  沒有選到任何一處。')
        return None
    new = DTS.apply_hunks(old, pick)
    new = '\n'.join(l.rstrip() for l in new.split('\n')).strip()      # 清掉刪字後殘留的行尾空白
    if new == old:
        print('  套用後文稿沒有變化。')
        return None
    errs, warns = JM.split_problems(new)
    for w in warns:
        print('  ⚠ ' + w)
    if errs:
        for e in errs:
            print('  ✖ ' + e)
        print('  已取消，沒有改動。')
        return None
    print('\n  文稿修改預覽（- 原本　+ 之後）：')
    for ln in difflib.unified_diff(old.split('\n'), new.split('\n'), lineterm='', n=0):
        if ln[:3] in ('---', '+++') or ln.startswith('@@'):
            continue
        print('    ' + ln[:160])
    lost = [v.get('word') for v in (x.get('vocab') or []) if isinstance(v, dict) and v.get('word') and
            not re.search(r'\b' + re.escape(v['word'] if ' ' in v['word'] else re.sub(r'e$', '', v['word'])), new, re.I)]
    if lost:
        print('  ⚠ 這些核心單字不在新文稿裡了：%s（之後請用網頁「調整提示詞」換字）' % '、'.join(lost))
    print('  文稿改了以後：翻譯／單字／題目可能要跟著調整，所以會加上「待檢查」標記。')
    if not yes('  確定要改文稿並重新對時？（改之前會先做版本備份到 _trash，可還原）'):
        print('  已取消。')
        return None
    try:
        JM.version_backup(BASE, copy.deepcopy(x), ['passage', 'timing', 'edited', 'review_pending'], 'daily_fix 依音檔修改文稿', audio=False)
        JM.trash_rebuild_index(BASE)
    except Exception as e:
        print('  ✖ 版本備份失敗（%s），為了安全，沒有改動。' % e)
        return None
    x['passage'] = new
    x['edited'] = datetime.now().strftime('%Y-%m-%d')
    x['review_pending'] = True
    timing, rep, total = DTS.align(new, words, DTS.CFG)
    x['timing'] = timing
    S.save()
    print('  ✔ 文稿已更新；重新對齊：%d / %d 句' % (len(timing), total))
    show_report(rep)
    return 'ok' if total and len(timing) == total else 'part'


# ───────────────────────── 待檢查 ─────────────────────────
def step_review(x, S, auto=False):
    id_ = aid(x)
    print('  ③ 待檢查：文稿%s改過，中文翻譯／核心單字／題目可能跟新文稿不一致。' % ('（%s）' % x['edited'] if x.get('edited') else ''))
    pend = [f for f in pending_patches() if f.lower().startswith(id_ + '_')]
    if pend:
        print('  　資料夾裡有尚未合併的補丁：%s → 請先用 json_merge.py 合併（合併 _fix 補丁會自動清除待檢查）。' % '、'.join(pend))
        return 'skip'
    if auto:
        print('  　這一步需要 AI 檢查，自動模式不處理。')
        return 'skip'
    print('  　做法：開網頁 → 維護 → 這篇 → ✏️ 文稿 → 按「複製調整提示詞」貼給 AI；')
    print('  　AI 回傳的 JSON 存成 %s_fix.json，用 json_merge.py 合併。' % id_)
    if yes('  　或者你自己看過了、沒問題 → 現在清除「待檢查」標記？'):
        x.pop('review_pending', None)
        S.save()
        print('  ✔ 已清除。')
        return 'ok'
    return 'skip'


# ───────────────────────── 精靈 ─────────────────────────
def run_scan():
    p = find_script(getattr(JM, 'SCAN_NAME', 'Scan總表與音檔.py'))
    if not p:
        print('找不到 Scan總表與音檔.py，請之後自行執行。')
        return
    print('\n執行 %s …\n' % os.path.basename(p))
    sys.stdout.flush()
    subprocess.run([sys.executable, p], cwd=BASE, stdin=subprocess.DEVNULL)


def process(x, S, T, auto=False):
    """處理一篇。回傳 True＝這篇現在全部完成。"""
    title('%s「%s」' % (label(x), x.get('tag') or ''))
    r = 'ok'
    if mp3_state(x) != 'ok':
        r = step_mp3(x, S, T, auto)
    if r == 'ok' and mp3_state(x) == 'ok' and timing_state(x)[0] not in ('ok', '?'):
        step_timing(x, S, T, auto)
    elif mp3_state(x) != 'ok':
        print('  （mp3 還沒好，這篇的 timing 要等 mp3 有了才能做。）')
    if x.get('review_pending'):
        step_review(x, S, auto)
    done = not issues(x)
    print('  → ' + ('✔ 這篇全部完成' if done else '還有待處理：' + '、'.join({'mp3': '缺 mp3', 'timing': 'timing', 'review': '待檢查'}[i] for i in issues(x))))
    return done


def wizard(S, T, auto=False, only=None):
    if only is None:
        fix_case(S, auto)
    todo = [x for x in S.arts() if issues(x) and (only is None or x is only)]
    if not todo:
        print('\n✔ 沒有需要處理的項目。')
        return
    print('\n共 %d 篇需要處理%s。' % (len(todo), '（自動模式：不需要你動手的才會做）' if auto else '，一篇一篇來，隨時可以按 q 結束'))
    try:
        for i, x in enumerate(todo, 1):
            print('\n【%d / %d】' % (i, len(todo)), end='')
            process(x, S, T, auto)
    except Quit:
        print('\n已結束精靈（做完的部分都已存檔）。')
    left = [x for x in S.arts() if issues(x)]
    print('\n本輪結束：還有 %d 篇需要處理。' % len(left) if left else '\n🎉 所有文章的維護項目都完成了。')
    if yes('\n要執行 Scan總表與音檔.py 更新網頁的 audio/index.json 嗎？（不更新，網頁維護總覽不會變綠）', True):
            run_scan()


def main():
    S = Store()
    S.load()
    T = Timer()
    print('每日文章維護修復精靈（資料夾：%s）' % BASE)
    while True:
        report(S)
        print('\n  1　精靈：一篇一篇帶我修（缺什麼補什麼，要錄音時一步一步教）')
        print('  2　自動修：只做不用我動手的（找現成錄音、對時），其餘最後列清單')
        print('  3　只處理指定的一篇')
        print('  4　重新掃描')
        print('  5　更新網頁索引（執行 Scan總表與音檔.py）')
        s = ask('\n請選（Enter＝離開）：')
        if not s:
            if S.changed and yes('剛剛有改動 daily.json，要先更新網頁索引嗎？', True):
                run_scan()
            return
        if s == '1':
            wizard(S, T)
        elif s == '2':
            wizard(S, T, auto=True)
        elif s == '3':
            k = parse_id(ask('要處理哪一篇？（例如 w1d3、w2d8-1）：'))
            x = S.find(k) if k else None
            if not x:
                print('找不到這一篇。')
                continue
            if not issues(x):
                print('%s 沒有需要處理的項目 ✔' % aid(x))
                continue
            wizard(S, T, only=x)
        elif s == '5':
            run_scan()
        elif s == '4':
            S.load()
        else:
            print('請輸入 1～5，或直接按 Enter 離開。')


if __name__ == '__main__':
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        pass
    except Exception:
        traceback.print_exc()
        try:
            input('\n發生錯誤（上面是詳細訊息）。按 Enter 關閉視窗…')
        except Exception:
            pass
