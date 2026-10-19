# -*- coding: utf-8 -*-
"""daily_trash.py — Daily 文章「刪除（移到 Trash）」與 Trash 管理（雙擊 daily_trash.bat 使用）

放在網站根目錄（與 daily.json、json_merge.py 同一個資料夾）。

【刪除文章】把某一篇（例如 w1d1）從 daily.json 拿掉，整筆資料與 mp3 先移到 _trash/ 資料夾：
    _trash/w1d1-YYYYMMDD-HHMMSS/item.json   整筆資料（含 timing、extra_vocab，原封不動）
                                /w1d1.mp3   音檔（若有）
                                /meta.json  刪除時間、備註、詳解轉移紀錄
  · 刪之前一定先備份 daily.json（backup/）。
  · 這篇擁有的「核心單字以外的詳解（extra_vocab）」：若別篇也有用到那個字，預設轉移到最早用到的那一篇，
    再整理成全題庫只有一份（unify_extra）；沒有別篇用到的，跟著這篇進 Trash。可逐項取消轉移。
  · 位置固定：刪掉後該日變成「此日內容尚未建置」，不重新編號。
  · vocab／words 的音檔是依內容命名的，刪文章不去動它們。

【Trash 管理】還原（放回原本的 week／day，位置已有新文章就拒絕）、永久刪除單筆、清空全部（要輸入 DELETE）。

【版本備份】json_merge.py 合併「文稿補丁」（w1d1_passage.json）時，會先把改之前的整筆資料與舊 mp3 複製到 _trash/w1d1-edit-時間/
    （meta.kind＝'version'）。在 Trash 管理裡它標示「版本備份」；還原＝把舊文稿（passage、timing、edited、review_pending，
    若當時句型被換掉也包含句型）與舊 mp3 放回現有那一篇，不是整篇還原；還原前會先把「目前」的版本也備份一份，所以還原可以再還原。

【trash-index.json】每次變動後重建（網站根目錄）。只放描述資料，不含音檔，網頁的 Trash 清單頁讀它。
【_trash/】內有 mp3，不可被發佈；第一次執行會確認 .gitignore 有 _trash/。
"""
import copy
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE = os.path.dirname(os.path.abspath(__file__))
MAIN = os.path.join(BASE, 'daily.json')
TRASH = os.path.join(BASE, '_trash')
INDEX = os.path.join(BASE, 'trash-index.json')
DEFAULT_MP3 = 'audio/daily/%s.mp3'


# ───────────────────────── 載入 json_merge.py 的現成函式 ─────────────────────────
def load_jm():
    p = os.path.join(BASE, 'json_merge.py')
    if not os.path.isfile(p):
        sys.exit('找不到 json_merge.py，請把 daily_trash.py 放在它同一個資料夾。')
    spec = importlib.util.spec_from_file_location('json_merge', p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def ask(prompt, default=''):
    try:
        return input(prompt).strip()
    except EOFError:
        return default


def yes(prompt):
    return ask(prompt + ' (y/N)：').lower() in ('y', 'yes')


def parse_id(s):
    """w1d1／W1D1／1 1／1-1 → (1, 1)；D8 專案文章：w1d8-3 → (1, 10)（day 8 是專案第 1 篇、9 是第 2 篇…），也可以直接打 w1d10。看不懂回傳 None。"""
    m = re.match(r'^w?\s*(\d+)\s*[d,\-\s]\s*(\d+)(?:-(\d+))?$', str(s).strip().lower())
    if not m:
        return None
    w, d = int(m.group(1)), int(m.group(2))
    if m.group(3):
        if d != 8 or int(m.group(3)) < 1:
            return None
        d = 7 + int(m.group(3))
    return (w, d)


def lab(k):
    return 'W%dD8-%d' % (k[0], k[1] - 7) if k[1] >= 8 else 'W%dD%d' % k


def sid(k):
    return 'w%dd8-%d' % (k[0], k[1] - 7) if k[1] >= 8 else 'w%dd%d' % k


def now_stamp():
    return datetime.now().strftime('%Y%m%d-%H%M%S')


def safe_path(rel):
    """相對路徑 → 絕對路徑；跑出網站資料夾外就回傳 None。"""
    p = os.path.normpath(os.path.join(BASE, rel))
    return p if p.startswith(BASE + os.sep) else None


def human(n):
    return '%.1f MB' % (n / 1048576.0) if n >= 1048576 else '%.0f KB' % (n / 1024.0)


def write_json(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp, path)


# ───────────────────────── 主檔 ─────────────────────────
def load_main(jm):
    if not os.path.isfile(MAIN):
        print('找不到 %s' % MAIN)
        return None, None
    data, err = jm.read_json(MAIN)
    items, err2 = jm.split_main(data) if not err else (None, err)
    if err or err2:
        print('daily.json 無法使用：%s' % (err or err2))
        return None, None
    return data, items


def item_key(x):
    return (x.get('week'), x.get('day'))


def find_item(items, k):
    return next((x for x in items if item_key(x) == k), None)


def sorted_items(items):
    return sorted([x for x in items if isinstance(x.get('week'), int) and isinstance(x.get('day'), int)],
                  key=lambda x: (x['week'], x['day']))


# ───────────────────────── .gitignore ─────────────────────────
def ensure_gitignore():
    p = os.path.join(BASE, '.gitignore')
    try:
        text = open(p, encoding='utf-8').read() if os.path.isfile(p) else ''
        if any(l.strip().rstrip('/') == '_trash' or l.strip() == '/_trash/' for l in text.splitlines()):
            return
        with open(p, 'a', encoding='utf-8') as f:
            f.write(('' if not text or text.endswith('\n') else '\n') + '_trash/\n')
        print('（已在 .gitignore 加入 _trash/，避免 Trash 裡的 mp3 被上傳。若你不是用 GitHub 發佈，請自行確認 _trash 不會被上傳。）\n')
    except Exception as e:
        print('⚠ 無法更新 .gitignore（%s）。請自行確認 _trash/ 不會被發佈。\n' % e)


# ───────────────────────── 詳解轉移 ─────────────────────────
def appears(jm, key, a):
    """這個字（詳解的 text）有沒有出現在 a 的核心單字或文稿（容許 s／es／ed／d／ing 字尾）。"""
    if any(jm.Daily.xkey({'text': v.get('word')}) == key for v in (a.get('vocab') or []) if isinstance(v, dict)):
        return True
    pat = r'(?<![a-z0-9])' + re.escape(key).replace(r'\ ', r'\s+') + r'(?:s|es|ed|d|ing)?(?![a-z0-9])'
    return re.search(pat, str(a.get('passage') or '').lower()) is not None


def plan_extras(jm, items, x):
    """回傳 (rows, dup)；rows＝[{v, key, target(item 或 None)}]，只含「詳解放在這篇」的字；dup＝這篇有、但別篇才是擁有者的字數。"""
    me = item_key(x)
    owners = jm.extra_owners(items)
    others = [a for a in sorted_items(items) if a is not x]
    rows, dup = [], 0
    for v in x.get('extra_vocab') or []:
        k = jm.Daily.xkey(v) if isinstance(v, dict) else ''
        if not k:
            continue
        if owners.get(k) != me:
            dup += 1
            continue
        rows.append({'v': v, 'key': k, 'target': next((a for a in others if appears(jm, k, a)), None)})
    return rows, dup


# ───────────────────────── Trash 資料夾與索引 ─────────────────────────
def trash_folders():
    if not os.path.isdir(TRASH):
        return []
    out = []
    for name in sorted(os.listdir(TRASH)):
        f = os.path.join(TRASH, name)
        if os.path.isfile(os.path.join(f, 'meta.json')) and os.path.isfile(os.path.join(f, 'item.json')):
            out.append(name)
    return out


def read_entry(jm, name):
    f = os.path.join(TRASH, name)
    meta, e1 = jm.read_json(os.path.join(f, 'meta.json'))
    item, e2 = jm.read_json(os.path.join(f, 'item.json'))
    if e1 or e2 or not isinstance(meta, dict) or not isinstance(item, dict):
        return None, None
    return meta, item


def rebuild_index(jm):
    """重建 trash-index.json。實作放在 json_merge.py（文稿補丁的版本備份也用同一份），這裡只是呼叫。"""
    return jm.trash_rebuild_index(BASE)


def run_scan(jm):
    p = os.path.join(BASE, getattr(jm, 'SCAN_NAME', 'Scan總表與音檔.py'))
    if not os.path.isfile(p):
        print('找不到 %s，請之後自行執行。' % os.path.basename(p))
        return
    print('執行 %s …' % os.path.basename(p))
    # 不擷取輸出：讓 Scan 直接印在這個視窗（它在 Windows 用 cp950 輸出，自己擷取再以 UTF-8 解碼會變亂碼）。
    # 它結尾若有「按 Enter」的等待，按一下 Enter 即可回到這裡。
    sys.stdout.flush()
    subprocess.run([sys.executable, p], cwd=BASE)


def offer_scan(jm):
    if yes('\n要接著執行 Scan總表與音檔.py（更新 audio/index.json、vocab_index.json）嗎？'):
        run_scan(jm)
    else:
        print('記得之後執行 Scan總表與音檔.py，網頁才會更新音檔與單字清單。')


# ───────────────────────── 刪除 ─────────────────────────
def collect_files(x, k):
    """這篇相關的音檔：audio/ 底下「檔名以 w3d8 開頭」的檔案（後面不能直接接數字），加上題目 audio 欄位指定的檔。回傳相對路徑（/ 分隔）。"""
    pre, out = sid(k), []
    root = os.path.join(BASE, 'audio')
    rx = re.compile(r'^' + re.escape(pre) + r'(?!\d)', re.I)
    for d, _, fs in os.walk(root):
        for f in sorted(fs):
            if rx.match(f):
                out.append(os.path.relpath(os.path.join(d, f), BASE).replace('\\', '/'))
    a = x.get('audio')
    if a:
        p = safe_path(a)
        if p and os.path.isfile(p):
            rel = os.path.relpath(p, BASE).replace('\\', '/')
            if rel not in out:
                out.append(rel)
    return out


def pick_numbers(s, n):
    return {int(m) - 1 for m in re.findall(r'\d+', s) if 1 <= int(m) <= n}


def delete_flow(jm):
    data, items = load_main(jm)
    if items is None:
        return
    k = parse_id(ask('\n要刪除哪一篇？（例如 w1d1；直接 Enter 取消）：'))
    if not k:
        print('已取消。')
        return
    x = find_item(items, k)
    if not x:
        print('daily.json 裡沒有 %s。' % lab(k))
        return

    files = collect_files(x, k)
    rows, dup = plan_extras(jm, items, x)

    print('\n═══ 影響報告：刪除 %s「%s」 ═══' % (lab(k), x.get('tag') or ''))
    print('  資料：英文 %d 字、單字 %d 個、題目 %d 題、有 timing %s'
          % (len(re.findall(r"[A-Za-z0-9']+", str(x.get('passage') or ''))), len(x.get('vocab') or []),
             len(x.get('questions') or []), '是' if x.get('timing') else '否'))
    print('  詳解（extra_vocab）：這篇擁有 %d 個字%s' % (len(rows), '（另有 %d 個字別篇才是擁有者，不受影響）' % dup if dup else ''))
    for i, r in enumerate(rows, 1):
        t = r['target']
        print('    [%d] %-24s %s' % (i, r['v'].get('text') or r['v'].get('word'),
                                    '→ 預設轉移到 %s（別篇也用到）' % lab(item_key(t)) if t else '→ 沒有別篇用到，預設跟著這篇進 Trash'))

    # ── 詳解：先決定「別篇也用到」的要不要轉移，再決定其餘的要不要保留在 daily.json ──
    cancel = set()
    if any(r['target'] for r in rows):
        s = ask('\n要「取消轉移」的編號（取消後它會跟著這篇進 Trash；空白或逗號分隔；Enter＝全部照預設）：')
        cancel = {i for i in pick_numbers(s, len(rows)) if rows[i]['target']}
    rest = [i for i, r in enumerate(rows) if not r['target'] or i in cancel]
    keep, host = set(), None
    if rest:
        print('\n以下詳解沒有轉移，預設會跟著這篇進 Trash（還原時會一起回來）：')
        for i in rest:
            print('    [%d] %s' % (i + 1, rows[i]['v'].get('text') or rows[i]['v'].get('word')))
        s = ask('要「保留在 daily.json」的編號（可輸入 all；Enter＝都不保留）：')
        keep = set(rest) if s.lower() == 'all' else {i for i in pick_numbers(s, len(rows)) if i in rest}
        if keep:
            prev = [a for a in sorted_items(items) if a is not x and item_key(a) < k]
            nxt = [a for a in sorted_items(items) if a is not x and item_key(a) > k]
            dflt = (prev[-1] if prev else (nxt[0] if nxt else None))
            if not dflt:
                print('沒有其他文章可以放，保留不了，這些詳解會跟著進 Trash。')
                keep = set()
            else:
                s = ask('保留的詳解要掛在哪一篇？（Enter＝%s，或輸入其他篇如 w3d6）：' % lab(item_key(dflt)))
                hk = parse_id(s) if s else None
                host = find_item(items, hk) if hk and hk != k else None
                if s and not host:
                    print('找不到 %s，改用 %s。' % (s, lab(item_key(dflt))))
                host = host or dflt
                print('  （提醒：這些字沒出現在 %s 的文章裡，網頁在那篇不會畫底線，詳解頁與單字總表照常可用。）' % lab(item_key(host)))

    # ── 音檔：列出所有以 w3d8 開頭的檔，確認要移走哪些 ──
    skip = set()
    print('\n音檔：audio/ 底下檔名以「%s」開頭的檔案：' % sid(k))
    if files:
        for i, rel in enumerate(files, 1):
            ap = safe_path(rel)
            print('    [%d] %s（%s）' % (i, rel, human(os.path.getsize(ap)) if ap and os.path.isfile(ap) else '?'))
        s = ask('要「排除、不移走」的編號（Enter＝全部移到 Trash，之後可還原）：')
        skip = pick_numbers(s, len(files))
    else:
        print('    （找不到）')
    move_files = [rel for i, rel in enumerate(files) if i not in skip]

    note = ask('\n備註（可空白，例如刪除原因）：')

    print('\n═══ 最後確認 ═══')
    print('  將從 daily.json 移除：%s「%s」' % (lab(k), x.get('tag') or ''))
    print('  將移到 Trash 的音檔 %d 個%s' % (len(move_files), ''.join('\n    - ' + f for f in move_files)))
    if skip:
        print('  不動的音檔：' + '、'.join(files[i] for i in sorted(skip)))
    n_move = sum(1 for i, r in enumerate(rows) if r['target'] and i not in cancel)
    print('  詳解：轉移 %d 個、保留在 %s %d 個、跟著進 Trash %d 個'
          % (n_move, lab(item_key(host)) if host else '—', len(keep), len(rows) - n_move - len(keep)))
    if not yes('確認執行？'):
        print('已取消，沒有改動任何檔案。')
        return

    moved, kept = [], []
    dest = {}
    for i, r in enumerate(rows):
        t = r['target']
        if t and i not in cancel:
            dest[i] = t
        elif i in keep:
            dest[i] = host
        name = r['v'].get('text') or r['v'].get('word')
        (moved.append({'text': name, 'to': sid(item_key(dest[i]))}) if i in dest else kept.append(name))

    # 1) 備份主檔 → 2) 把完整資料與音檔「複製」進 Trash → 3) 寫主檔 → 4) 才移除原音檔（任何一步失敗都不會丟資料）
    bak = jm.backup_main(MAIN, 'daily')
    folder = '%s-%s' % (sid(k), now_stamp())
    fdir = os.path.join(TRASH, folder)
    os.makedirs(fdir, exist_ok=False)
    write_json(os.path.join(fdir, 'item.json'), x)
    for rel in move_files:
        dst = os.path.join(fdir, 'files', *rel.split('/'))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(safe_path(rel), dst)
    write_json(os.path.join(fdir, 'meta.json'), {
        'v': 2, 'id': sid(k), 'deleted': datetime.now().isoformat(timespec='seconds'), 'note': note,
        'files': move_files, 'mp3': move_files[0] if move_files else None, 'extra_moved': moved, 'extra_kept': kept,
        'backup': os.path.relpath(bak, BASE).replace('\\', '/')})

    for i, r in enumerate(rows):
        t = dest.get(i)
        if t:
            cur = t.setdefault('extra_vocab', [])
            if not any(jm.Daily.xkey(o) == r['key'] for o in cur if isinstance(o, dict)):
                cur.append(copy.deepcopy(r['v']))
    items.remove(x)
    notes = jm.unify_extra(items)
    jm.write_main(MAIN, data)
    for rel in move_files:
        try:
            os.remove(safe_path(rel))
        except OSError as e:
            print('⚠ 已複製到 Trash，但原檔無法刪除（%s），請手動刪除：%s' % (e, rel))
    rebuild_index(jm)

    print('\n✔ 已刪除 %s，資料夾：_trash/%s' % (lab(k), folder))
    print('  daily.json 備份：%s' % os.path.relpath(bak, BASE))
    print('  已移到 Trash 的音檔：%d 個' % len(move_files))
    if moved:
        print('  詳解留在 daily.json：%s' % '、'.join('%s→%s' % (m['text'], m['to'].upper()) for m in moved))
    if kept:
        print('  %d 個詳解跟著這篇進 Trash：%s' % (len(kept), '、'.join(map(str, kept))))
    for n in notes:
        print('  • ' + n)
    print('  提醒：這台瀏覽器裡 %s 的作答／錄音／入庫紀錄還在，重新整理網頁後，在該日的空位頁會看到「保留／清除」提示。' % lab(k))
    offer_scan(jm)


# ───────────────────────── Trash 管理 ─────────────────────────
def nfiles(meta):
    return len(meta.get('files') or []) if meta.get('files') is not None else (1 if meta.get('mp3') else 0)


def show_trash(jm):
    names = trash_folders()
    if not names:
        print('\nTrash 是空的。')
        return []
    print('\n═══ Trash（%d 筆，新的在前）═══' % len(names))
    rows = []
    for n in names:
        meta, item = read_entry(jm, n)
        rows.append((str(meta.get('deleted') if meta else ''), n, meta, item))
    rows.sort(reverse=True)
    out = []
    for i, (_, n, meta, item) in enumerate(rows, 1):
        if not meta:
            print('  [%d] %s（meta／item 讀不到）' % (i, n))
        else:
            ver = meta.get('kind') == 'version'
            print('  [%d] %s%s「%s」 %s於 %s%s%s' % (i, '【版本備份】' if ver else '', lab((item.get('week'), item.get('day'))), item.get('tag') or '',
                                                   '備份' if ver else '刪除', str(meta.get('deleted') or '').replace('T', ' '),
                                                   ('　含音檔 %d 個' % nfiles(meta)) if nfiles(meta) else '',
                                                   '　備註：' + meta['note'] if meta.get('note') else ''))
        out.append(n)
    return out


def restore(jm, name):
    meta, item = read_entry(jm, name)
    if not meta:
        print('這筆的 meta.json／item.json 讀不到，無法還原。')
        return
    if meta.get('kind') == 'version':
        return restore_version(jm, name, meta, item)
    data, items = load_main(jm)
    if items is None:
        return
    k = item_key(item)
    if find_item(items, k):
        print('✖ %s 現在已經有文章了（%s），無法還原。\n  請先把現有那篇刪除（移到 Trash），或維持現狀。' % (lab(k), find_item(items, k).get('tag') or ''))
        return
    # 音檔：新格式 meta['files']（相對路徑，存在 Trash 的 files/ 底下）；舊格式 meta['mp3']（直接放在資料夾內）
    plan_files = []
    if meta.get('files') is not None:
        for rel in meta.get('files') or []:
            plan_files.append((os.path.join(TRASH, name, 'files', *rel.split('/')), safe_path(rel), rel))
    elif meta.get('mp3'):
        plan_files.append((os.path.join(TRASH, name, os.path.basename(meta['mp3'])), safe_path(meta['mp3']), meta['mp3']))
    ok_files, overwrite = [], None
    for src, dst, rel in plan_files:
        if not dst or not os.path.isfile(src):
            print('⚠ Trash 裡找不到 %s，略過。' % rel)
        elif os.path.isfile(dst):
            if overwrite is None:
                overwrite = yes('%s 等音檔已存在，要用 Trash 裡的版本覆蓋嗎？' % rel)
            if overwrite:
                ok_files.append((src, dst))
        else:
            ok_files.append((src, dst))
    if not yes('確認還原 %s「%s」？' % (lab(k), item.get('tag') or '')):
        print('已取消。')
        return
    bak = jm.backup_main(MAIN, 'daily')
    items.append(item)
    items.sort(key=lambda a: (a.get('week') if isinstance(a.get('week'), int) else 0, a.get('day') if isinstance(a.get('day'), int) else 0))
    notes = jm.unify_extra(items)
    jm.write_main(MAIN, data)
    for src, dst in ok_files:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
    shutil.rmtree(os.path.join(TRASH, name))
    rebuild_index(jm)
    print('✔ 已還原 %s（daily.json 備份：%s）' % (lab(k), os.path.relpath(bak, BASE)))
    for n in notes:
        print('  • ' + n)
    offer_scan(jm)


def restore_version(jm, name, meta, item):
    """還原「文稿版本備份」：把舊文稿（與舊 timing、舊 mp3）放回現有那一篇。先備份目前的版本，所以可以再還原回來。"""
    data, items = load_main(jm)
    if items is None:
        return
    k = item_key(item)
    cur = find_item(items, k)
    if not cur:
        print('✖ %s 現在不在 daily.json（可能已被刪除），無法還原文稿版本。\n  若要找回整篇，請還原刪除時留下的 Trash 項目。' % lab(k))
        return
    fields = [f for f in (meta.get('fields') or ['passage', 'timing', 'edited', 'review_pending'])]
    words = lambda t: len(re.findall(r"[A-Za-z0-9']+", str(t or '')))
    print('\n還原 %s 的舊版文稿：' % lab(k))
    print('  目前：英文 %d 字，timing %d 段%s' % (words(cur.get('passage')), len(cur.get('timing') or []), '，待檢查（review_pending）' if cur.get('review_pending') else ''))
    print('  舊版：英文 %d 字，timing %d 段，備份於 %s' % (words(item.get('passage')), len(item.get('timing') or []), str(meta.get('deleted') or '').replace('T', ' ')))
    print('  會換回的欄位：%s' % '、'.join(fields))
    print('  注意：補丁之後若用「修正補丁」改過翻譯、單字、題目，那些不會被還原（它們不在這份備份裡）。')
    plan_files = [(os.path.join(TRASH, name, 'files', *rel.split('/')), safe_path(rel), rel) for rel in (meta.get('files') or [])]
    plan_files = [(a, b, c) for a, b, c in plan_files if b and os.path.isfile(a)]
    if plan_files:
        print('  音檔：%s（現有同名檔會被取代；取代前已先備份在新的版本備份裡）' % '、'.join(c for _, _, c in plan_files))
    if not yes('確認還原？'):
        print('已取消。')
        return
    bak = jm.backup_main(MAIN, 'daily')
    jm.version_backup(BASE, copy.deepcopy(cur), fields, '還原前的版本')   # 目前的版本（含目前的 mp3）也留一份
    for f in fields:
        if f in item:
            cur[f] = copy.deepcopy(item[f])
        else:
            cur.pop(f, None)
    jm.write_main(MAIN, data)
    for src, dst, _ in plan_files:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
    shutil.rmtree(os.path.join(TRASH, name))
    rebuild_index(jm)
    print('✔ 已還原 %s 的舊文稿（daily.json 備份：%s）' % (lab(k), os.path.relpath(bak, BASE)))
    print('  還原前的版本已另存在 Trash（版本備份）。')
    offer_scan(jm)


def purge(jm, name):
    meta, item = read_entry(jm, name)
    print('永久刪除 _trash/%s（資料與 mp3 都會消失，無法復原）。' % name)
    if yes('確定？'):
        shutil.rmtree(os.path.join(TRASH, name))
        rebuild_index(jm)
        print('✔ 已永久刪除。')
    else:
        print('已取消。')


def trash_menu(jm):
    while True:
        names = show_trash(jm)
        if not names:
            rebuild_index(jm)
            return
        s = ask('\n輸入 r 編號（或 r w3d8）＝還原　x 編號＝永久刪除　clear＝清空全部　Enter＝回主選單：').lower()
        if not s:
            return
        if s == 'clear':
            if ask('這會永久刪除 Trash 內全部 %d 筆。請輸入 DELETE 確認：' % len(names)) == 'DELETE':
                for n in names:
                    shutil.rmtree(os.path.join(TRASH, n), ignore_errors=True)
                rebuild_index(jm)
                print('✔ 已清空 Trash。')
            else:
                print('已取消。')
            continue
        m = re.match(r'^([rx])\s*(.*)$', s)
        pick = None
        if m:
            arg = m.group(2).strip()
            if not arg and len(names) == 1:
                pick = names[0]                                   # 只有一筆：單打 r／x 就好
            elif arg.isdigit() and 1 <= int(arg) <= len(names):
                pick = names[int(arg) - 1]                        # r 1
            elif parse_id(arg):                                   # r w3d8（有多版時取最新的一版；刪除的優先，版本備份請用編號）
                hit = [n for n in names if n.startswith(sid(parse_id(arg)) + '-')]
                pick = next((n for n in hit if '-edit-' not in n), hit[0] if hit else None)
        if not pick:
            ex = 'r' if len(names) == 1 else 'r 1'
            _m = re.match(r'^(w\d+d\d+(?:-\d+)?)-(?:\d{8}|edit)', names[0])
            print('看不懂。請輸入像「%s」、「x 1」或「r %s」（編號或文章 id 都可以）。' % (ex, _m.group(1) if _m else 'w1d1'))
            continue
        (restore if m.group(1) == 'r' else purge)(jm, pick)


def main():
    jm = load_jm()
    print('Daily 文章 Trash 工具（網站資料夾：%s）\n' % BASE)
    ensure_gitignore()
    rebuild_index(jm)
    while True:
        s = ask('\n1＝刪除文章（移到 Trash）　2＝Trash 管理（還原／永久刪除）　Enter＝離開：')
        if s == '1':
            delete_flow(jm)
        elif s == '2':
            trash_menu(jm)
        elif not s:
            return
        else:
            print('請輸入 1、2，或直接按 Enter 離開。')


if __name__ == '__main__':
    main()
