#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
migrate_vocab_names.py — 把 audio/daily/vocab/ 的舊檔名 {文章id}-… 改成「不含文章 id」的新檔名

新檔名規則（與新版 auto-speech.py／notes.js 一致）：
  例句等（_c1 _e1 _fx1 _mx1 _cf1 _sx1 _s1 _p1 _en _pr1 …） {文章id}-{單字slug}{後綴}.mp3 → {單字slug}{後綴}.mp3
  整句（入庫的句子，無後綴）                               {文章id}-{句子slug}.mp3        → {句子slug}.mp3
  所在句 _ctx                                              {文章id}-{單字slug}_ctx.mp3    → {所在句slug}.mp3
      ※ 所在句與整句是同一句時共用一檔；兩個字在同一句時也只留一檔。

用法（放在 auto-speech.py 同一層，也就是 daily.json 所在的網站根目錄）：
  python migrate_vocab_names.py            預覽（--dry，預設）：只列出會做什麼，寫 vocab-rename-map.preview.csv，不動任何檔案
  python migrate_vocab_names.py --apply    實際改名，寫 vocab-rename-map-時間.csv，同步改 voices-log.json，重建 vocab/index.json
  python migrate_vocab_names.py --undo vocab-rename-map-時間.csv   依對照表整批還原
  --root 資料夾    網站根目錄（預設＝本檔所在資料夾）

撞名與多餘的檔不會刪除，而是搬到 audio/daily/vocab/_stale/（可用 --undo 還原；確認沒問題後整個資料夾自己刪）：
  ‧ 同一個字在兩篇各有一套檔（詳解合併前的舊資料）→ 留「目前詳解所在那篇」的，另一套進 _stale
  ‧ 新檔名已經存在（重跑、或新版已經錄過）→ 舊檔進 _stale
  ‧ _ctx 找不到對應詳解／所在句算不出來 → 原地不動並列在報告（網頁仍讀得到舊檔名）
"""
import argparse
import csv
import importlib.util
import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
OLD_RX = re.compile(r"^(w(\d+)d(\d+))-(.+)\.mp3$")
STALE = "_stale"


def load_auto_speech(root: Path):
    f = root / "auto-speech.py"
    if not f.is_file():
        sys.exit(f"找不到 {f}（請把本檔放在 auto-speech.py 同一層，或用 --root 指定）")
    spec = importlib.util.spec_from_file_location("auto_speech", f)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)   # 有 if __name__ == "__main__" 保護，不會啟動視窗
    return mod


def plan(root: Path, A):
    vdir = root / A.VOCAB_SUB
    if not vdir.is_dir():
        sys.exit(f"找不到 {vdir}")
    items = A.load_daily_items(root)
    entries = A.collect_entries(root, items)

    # 每個字「目前詳解放在哪一篇」（最早有 extra_vocab 的那篇，和 json_merge.py 的 extra_owners 同規則）
    owner = {}
    for x in sorted(items, key=lambda a: (a["week"], a["day"])):
        for v in x.get("extra_vocab") or []:
            if isinstance(v, dict):
                t = str(v.get("text") or v.get("word") or "").strip()
                if t:
                    owner.setdefault(A.slug(t), f"w{x['week']}d{x['day']}")
    for e in entries:   # 只出現在標註、還沒有 extra_vocab 的字：用標註所在那篇
        owner.setdefault(A.slug(e["text"]), e["qid"])

    # (qid, 單字slug) → 所在句 slug
    ctx_of = {}
    for e in entries:
        if e["type"] != "sentence" and e.get("ctx"):
            ctx_of[(e["qid"], A.slug(e["text"]))] = A.slug(e["ctx"])

    def order(q):
        m = re.match(r"w(\d+)d(\d+)$", q)
        return (int(m.group(1)), int(m.group(2))) if m else (999, 999)

    ops, skipped, groups = [], [], {}   # groups：新檔名 → [(舊檔名, qid, 用來挑勝負的 key)]
    for f in sorted(vdir.glob("*.mp3")):
        m = OLD_RX.match(f.name)
        if not m:
            continue   # 已經是新檔名（或不認得）：不動
        q, body = m.group(1), m.group(4)
        if "_" in body:
            word, suf = body.rsplit("_", 1)
            suf = "_" + suf
        else:
            word, suf = body, ""
        if suf == "_ctx":
            sl = ctx_of.get((q, word))
            if not sl:
                ow = owner.get(word)
                if ow and ow != q and (ow, word) in ctx_of:   # 這個字的詳解已在別篇：這是舊重複，所在句以那篇為準
                    ops.append((f.name, f"{STALE}/{f.name}", "同一個字在別篇的舊重複，留目前詳解所在那篇 → 進 _stale"))
                else:
                    skipped.append((f.name, "找不到對應的詳解／所在句算不出來（原地不動，網頁仍讀舊檔名）"))
                continue
            new, rank_word = sl + ".mp3", word
        else:
            new, rank_word = word + suf + ".mp3", word   # 整句（無後綴）時 word 就是句子 slug
        groups.setdefault(new, []).append((f.name, q, rank_word))

    for new, olds in groups.items():
        target_exists = (vdir / new).exists()
        # 勝者：該字目前詳解所在那篇；沒有就挑最早的一篇
        olds.sort(key=lambda o: (0 if owner.get(o[2]) == o[1] else 1, order(o[1]), o[0]))
        for i, (old, q, w) in enumerate(olds):
            if i == 0 and not target_exists:
                ops.append((old, new, "改名"))
            elif target_exists:
                ops.append((old, f"{STALE}/{old}", "新檔名已存在 → 舊檔進 _stale"))
            else:
                same_word = len({o[2] for o in olds}) == 1
                why = "同一個字在別篇的舊重複，留目前詳解所在那篇" if same_word else "同一句已有另一個字的檔，只留一份（所在句相同）"
                ops.append((old, f"{STALE}/{old}", why + " → 進 _stale"))
    return ops, skipped


def write_csv(path: Path, ops):
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["old", "new", "note"])
        w.writerows(ops)


def update_log(root: Path, A, moves):
    """voices-log.json 的鍵（路徑）跟著改；進 _stale 的不再記。moves＝[(舊相對路徑, 新相對路徑 or None)]"""
    lp = root / A.LOG_NAME
    if not lp.is_file():
        return
    j = json.loads(lp.read_text(encoding="utf-8-sig"))
    files = j.get("files") or {}
    for old, new in moves:
        rec = files.pop(old, None)
        if rec is not None and new:
            files[new] = rec
    j["files"] = dict(sorted(files.items()))
    tmp = lp.with_suffix(".tmp")
    tmp.write_text(json.dumps(j, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(lp)


def apply_ops(root: Path, A, ops, reverse=False):
    vdir = root / A.VOCAB_SUB
    base = A.VOCAB_SUB.as_posix()
    (vdir / STALE).mkdir(exist_ok=True)
    moves, n = [], 0
    for old, new, _ in ops:
        a, b = (new, old) if reverse else (old, new)
        src, dst = vdir / a, vdir / b
        if not src.exists():
            print(f"  略過（來源不存在）：{a}")
            continue
        if dst.exists():
            print(f"  略過（目的已存在）：{b}")
            continue
        shutil.move(str(src), str(dst))
        n += 1
        moves.append((f"{base}/{a}", None if b.startswith(STALE + "/") else f"{base}/{b}"))
    update_log(root, A, moves)
    return n


def main():
    ap = argparse.ArgumentParser(description="vocab mp3 檔名遷移（去掉文章 id）")
    ap.add_argument("--root", default=str(HERE))
    ap.add_argument("--apply", action="store_true", help="實際執行（預設只預覽）")
    ap.add_argument("--undo", metavar="CSV", help="依對照表還原")
    a = ap.parse_args()
    root = Path(a.root).resolve()
    A = load_auto_speech(root)

    if a.undo:
        rows = list(csv.reader(Path(a.undo).open(encoding="utf-8-sig", newline="")))[1:]
        ops = [(r[0], r[1], r[2] if len(r) > 2 else "") for r in rows if len(r) >= 2]
        n = apply_ops(root, A, ops, reverse=True)
        A.write_manifest(root)
        print(f"已還原 {n} 個檔，並重建 vocab/index.json")
        return

    ops, skipped = plan(root, A)
    if not ops:
        print("vocab/ 裡沒有舊檔名（{文章id}-…），不需要遷移，也沒有寫任何檔案。")
        for name, why in skipped:
            print(f"  [不動]   {name}  — {why}")
        return
    ren = [o for o in ops if o[2] == "改名"]
    stale = [o for o in ops if o[2] != "改名"]
    print(f"改名 {len(ren)} 個；進 _stale {len(stale)} 個；原地不動 {len(skipped)} 個")
    for old, new, note in stale:
        print(f"  [_stale] {old}  — {note}")
    for name, why in skipped:
        print(f"  [不動]   {name}  — {why}")
    for old, new, _ in ren[:8]:
        print(f"  {old}  →  {new}")
    if len(ren) > 8:
        print(f"  …（其餘見對照表）")

    if not a.apply:
        p = root / "vocab-rename-map.preview.csv"
        write_csv(p, ops)
        print(f"\n這是預覽，沒有動任何檔案。對照表：{p.name}\n確認沒問題再加 --apply 執行。")
        return

    mp = root / f"vocab-rename-map-{datetime.now():%Y%m%d-%H%M%S}.csv"
    write_csv(mp, ops)   # 先寫對照表再動檔案，中途失敗也能還原
    n = apply_ops(root, A, ops)
    A.write_manifest(root)
    print(f"\n完成：搬動 {n} 個檔。對照表：{mp.name}（要還原請用 --undo {mp.name}）")


if __name__ == "__main__":
    main()
