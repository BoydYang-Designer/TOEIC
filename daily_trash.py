# -*- coding: utf-8 -*-
"""daily_trash.py — Daily 文章刪除與 Trash 清理（雙擊 daily_trash.bat 使用）

放在網站根目錄（與 daily.json、json_merge.py 同一個資料夾）。雙擊後只有兩個功能：

1＝刪除指定文章：把某一篇從 daily.json 拿掉，整筆資料先移到 _trash/（可選：音檔要不要一併刪除）。
    · 刪之前會先備份 daily.json（backup/）。
    · 這篇的額外詳解（extra_vocab）：別篇也用到的字自動轉移過去，沒人用到的跟著這篇進 Trash。
    · 位置固定：刪掉後該日變成「此日內容尚未建置」，不重新編號。
2＝永久刪除 Trash 文章：列出 _trash/ 裡的項目，勾選要永久刪除的（資料與音檔都會消失，無法復原）。

【trash-index.json】每次變動後重建，網頁的 Trash 清單頁讀它。
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



# ───────────────────────── 功能 1：刪除指定文章 ─────────────────────────
def pick_numbers(s, n):
    return {int(m) - 1 for m in re.findall(r'\d+', s) if 1 <= int(m) <= n}


def list_articles(items):
    print('\n目前的文章：')
    for x in sorted_items(items):
        print('  %-8s %s' % (sid(item_key(x)), x.get('tag') or ''))


def delete_flow(jm):
    data, items = load_main(jm)
    if items is None:
        return
    list_articles(items)
    k = parse_id(ask('\n要刪除哪一篇？（例如 w1d1、w1d8-6；Enter 取消）：'))
    if not k:
        print('已取消。')
        return
    x = find_item(items, k)
    if not x:
        print('daily.json 裡沒有 %s。' % lab(k))
        return

    files = collect_files(x, k)
    rows, dup = plan_extras(jm, items, x)
    print('\n═══ 刪除 %s「%s」 ═══' % (lab(k), x.get('tag') or ''))
    print('  文章資料：單字 %d 個、題目 %d 題、詳解 %d 個' % (len(x.get('vocab') or []), len(x.get('questions') or []), len(rows)))
    move_files = []
    if files:
        print('  音檔：')
        for rel in files:
            ap = safe_path(rel)
            print('    - %s（%s）' % (rel, human(os.path.getsize(ap)) if ap and os.path.isfile(ap) else '?'))
        print('  （Y＝音檔一併移到 Trash；N＝只刪文章，音檔原地不動）')
        if yes('音檔要一併刪除嗎？'):
            move_files = files
    else:
        print('  音檔：找不到。')
    note = ask('備註（可空白）：')

    print('\n═══ 最後確認 ═══')
    print('  從 daily.json 移除：%s「%s」（資料移到 Trash，之後可在功能 2 永久刪除）' % (lab(k), x.get('tag') or ''))
    print('  音檔：%s' % ('移到 Trash %d 個' % len(move_files) if move_files else '不動'))
    if not yes('確認執行？'):
        print('已取消，沒有改動任何檔案。')
        return

    # 詳解：別篇也用到的字自動轉移過去；沒人用到的跟著這篇進 Trash
    dest, moved, kept = {}, [], []
    for i, r in enumerate(rows):
        name = r['v'].get('text') or r['v'].get('word')
        if r['target']:
            dest[i] = r['target']
            moved.append({'text': name, 'to': sid(item_key(r['target']))})
        else:
            kept.append(name)

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
    if moved:
        print('  詳解轉移到別篇：%s' % '、'.join('%s→%s' % (m['text'], m['to'].upper()) for m in moved))
    if kept:
        print('  %d 個詳解跟著這篇進 Trash' % len(kept))
    for n in notes:
        print('  • ' + n)
    offer_scan(jm)


# ───────────────────────── 功能 2：永久刪除 Trash 文章 ─────────────────────────
def show_trash(jm):
    names = trash_folders()
    if not names:
        print('\nTrash 是空的，沒有可以永久刪除的東西。')
        return []
    rows = []
    for n in names:
        meta, item = read_entry(jm, n)
        rows.append((str(meta.get('deleted') if meta else ''), n, meta, item))
    rows.sort(reverse=True)
    print('\n═══ Trash（%d 筆，新的在前）═══' % len(rows))
    out = []
    for i, (_, n, meta, item) in enumerate(rows, 1):
        if not meta:
            print('  [%d] %s（meta／item 讀不到）' % (i, n))
        else:
            nf = len(meta.get('files') or []) if meta.get('files') is not None else (1 if meta.get('mp3') else 0)
            ver = meta.get('kind') == 'version'
            print('  [%d] %s%s「%s」 %s於 %s%s' % (i, '【版本備份】' if ver else '', lab((item.get('week'), item.get('day'))), item.get('tag') or '',
                                                   '備份' if ver else '刪除', str(meta.get('deleted') or '').replace('T', ' '),
                                                   ('　含音檔 %d 個' % nf) if nf else ''))
        out.append(n)
    return out


def purge_flow(jm):
    names = show_trash(jm)
    if not names:
        return
    s = ask('\n要永久刪除的編號（可多個，空白或逗號分隔；all＝全部；Enter 返回）：')
    if not s:
        return
    pick = set(range(len(names))) if s.lower() == 'all' else pick_numbers(s, len(names))
    if not pick:
        print('沒有選到任何項目。')
        return
    chosen = [names[i] for i in sorted(pick)]
    print('\n將永久刪除（資料與音檔都會消失，無法復原）：')
    for n in chosen:
        print('  ✗ _trash/%s' % n)
    if not yes('確定？'):
        print('已取消。')
        return
    for n in chosen:
        shutil.rmtree(os.path.join(TRASH, n), ignore_errors=True)
    rebuild_index(jm)
    print('✔ 已永久刪除 %d 筆。若有上傳 GitHub，記得把更新後的 trash-index.json 一起上傳。' % len(chosen))


def main():
    jm = load_jm()
    print('Daily 文章 Trash 工具（網站資料夾：%s）\n' % BASE)
    ensure_gitignore()
    rebuild_index(jm)
    while True:
        s = ask('\n1＝刪除指定文章（可選音檔要不要一併刪除）　2＝永久刪除 Trash 文章　Enter＝離開：')
        if s == '1':
            delete_flow(jm)
        elif s == '2':
            purge_flow(jm)
        elif not s:
            return
        else:
            print('請輸入 1、2，或直接按 Enter 離開。')


if __name__ == '__main__':
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        pass
    except Exception:
        import traceback
        traceback.print_exc()
        try:
            input('\n發生錯誤（上面是詳細訊息）。按 Enter 關閉視窗…')
        except Exception:
            pass
