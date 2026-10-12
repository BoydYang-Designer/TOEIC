#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
migrate_word_audio.py —— 把舊的「逐篇單字發音檔」整理成共用單字發音庫

背景：舊做法每個字在每一篇、每一欄各存一個 mp3（例如 w1d1-book.mp3、w2d3-book_f1.mp3），
      同一個字重複錄很多次。新做法：單字類統一放 audio/daily/words/{單字}.mp3，同一個字只存一份。
      （例句、所在句仍留在 audio/daily/vocab/ 逐篇存放，不受影響。）

用法：放在「有 daily.json 的資料夾」，執行：
  python migrate_word_audio.py --dry      只列出會做什麼（不動任何檔案）
  python migrate_word_audio.py            複製舊檔到 words/（舊檔保留），並重建兩份 index.json
  python migrate_word_audio.py --clean    複製完成後，刪除「確定已有共用檔」的舊單字檔（先備份再用！）
  python migrate_word_audio.py --root 路徑  指定專案資料夾（預設為本檔所在資料夾）

規則（與 auto-speech.py、網頁 notes.js 一致）：
  共用檔名＝slug(單字)＋.mp3；同一個字出現在多處時，取第一個找到的舊檔。
  會遷移的舊檔後綴：（無）單字本身、_lm 原形、_f 屈折變化、_m 相關字、_d 同字族、_cp 搭配片語、_pw／_sw 多詞性／多義的單字
  不動：_ctx 所在句、_e／_c／_mx／_p／_s 各種例句、句子類項目、文章整篇 mp3。
"""
import argparse
import json
import re
import shutil
import sys
import time
from pathlib import Path

VOCAB = Path("audio") / "daily" / "vocab"
WORDS = Path("audio") / "daily" / "words"


def norm(s):
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def fnv6(s):
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"[:6]


def slug(text):  # 必須與 auto-speech.py 的 slug、網頁 notes.js 的 dnSlug 完全一致
    k = norm(text)
    s = re.sub(r"[^a-z0-9]+", "-", k).strip("-")
    if s and len(s) <= 40:
        return s
    return s[:40].rstrip("-") + ("-" if s else "") + fnv6(k)


def ok_file(p: Path) -> bool:
    try:
        return p.is_file() and p.stat().st_size > 1000
    except OSError:
        return False


def s_(v):
    return v.strip() if isinstance(v, str) and v.strip() else None


def collect(root: Path):
    """回傳 list of (舊檔名, 單字文字)：依 daily.json 的 extra_vocab 與 daily-marks*.json 推算舊檔名。"""
    data = json.loads((root / "daily.json").read_text(encoding="utf-8-sig"))
    items = data["items"] if isinstance(data, dict) else data
    out = []
    arts = {}
    for x in items:
        if isinstance(x, dict) and "week" in x and "day" in x:
            arts[f"w{x['week']}d{x['day']}"] = x
    seen_base = set()
    for qid, x in arts.items():
        for v in x.get("extra_vocab") or []:
            if not isinstance(v, dict):
                continue
            t = s_(v.get("text") or v.get("word"))
            if not t:
                continue
            typ = v.get("type") or ("phrase" if re.search(r"\s", t) else "word")
            base = f"{qid}-{slug(t)}"
            seen_base.add((qid, norm(t)))
            if typ != "sentence":
                out.append((f"{base}.mp3", t))
            lem = s_(v.get("lemma"))
            if lem and norm(lem) != norm(t):
                out.append((f"{base}_lm.mp3", lem))
            for k, c in enumerate(v.get("collocations") or [], 1):
                ph = s_(c) if isinstance(c, str) else s_((c or {}).get("phrase") or (c or {}).get("p"))
                if ph:
                    out.append((f"{base}_cp{k}.mp3", ph))
            for key, suf in (("forms", "f"), ("family", "m"), ("derived", "d")):
                for k, o in enumerate(v.get(key) or [], 1):
                    w = s_(o.get("w")) if isinstance(o, dict) else None
                    if w:
                        out.append((f"{base}_{suf}{k}.mp3", w))
            for key, suf in (("pos_uses", "pw"), ("senses", "sw")):
                for k, o in enumerate(v.get(key) or [], 1):
                    if isinstance(o, dict):
                        w = s_(o.get("w")) or lem or t
                        out.append((f"{base}_{suf}{k}.mp3", w))
    for f in sorted(root.glob("daily-marks*.json")):  # 只入庫、還沒詳解的單字／片語：舊檔只有「單字本身」
        try:
            j = json.loads(f.read_text(encoding="utf-8-sig"))
        except Exception:
            continue
        for m in (j if isinstance(j, list) else (j.get("marks") or [])):
            if not isinstance(m, dict) or m.get("qid") not in arts:
                continue
            t = s_(m.get("text"))
            if t and (m.get("type") or "word") != "sentence" and (m["qid"], norm(t)) not in seen_base:
                out.append((f"{m['qid']}-{slug(t)}.mp3", t))
    return out


def write_manifests(root: Path):
    for sub in (VOCAB, WORDS):
        d = root / sub
        d.mkdir(parents=True, exist_ok=True)
        files = sorted(f.name for f in d.glob("*.mp3") if ok_file(f))
        (d / "index.json").write_text(json.dumps(dict(v=int(time.time()), files=files), ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"已更新 {d / 'index.json'}（{len(files)} 個檔）")


def main():
    ap = argparse.ArgumentParser(description="把舊的逐篇單字發音檔整理成共用單字發音庫")
    ap.add_argument("--dry", action="store_true", help="只列出會做什麼，不動檔案")
    ap.add_argument("--clean", action="store_true", help="複製完成後，刪除已有共用檔的舊單字檔")
    ap.add_argument("--root", help="專案資料夾（預設為本檔所在資料夾）")
    a = ap.parse_args()
    root = Path(a.root).resolve() if a.root else Path(__file__).resolve().parent
    if not (root / "daily.json").exists():
        sys.exit(f"找不到 {root / 'daily.json'}，請把本檔放在有 daily.json 的資料夾，或用 --root 指定")
    vdir, wdir = root / VOCAB, root / WORDS
    pairs = collect(root)
    copied, dup, nofile, have = 0, 0, 0, 0
    claimed = {}     # 共用檔名 → 這次來源的舊檔
    olds_to_clean = []
    for old, text in pairs:
        src = vdir / old
        dst = wdir / f"{slug(text)}.mp3"
        if not ok_file(src):
            nofile += 1
            continue
        olds_to_clean.append((src, dst))
        if ok_file(dst) or dst in claimed:
            if ok_file(dst):
                have += 1
            else:
                dup += 1
            continue
        claimed[dst] = src
        print(("[試跑] " if a.dry else "") + f"複製 {src.name}  →  words/{dst.name}")
        if not a.dry:
            wdir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
        copied += 1
    removed = 0
    if a.clean and not a.dry:
        for src, dst in olds_to_clean:
            if ok_file(dst) and src.exists():
                src.unlink()
                removed += 1
    elif a.clean and a.dry:
        removed = sum(1 for s, d in olds_to_clean if d in claimed or ok_file(d))
    print("\n=== 結果 ===")
    print(f"舊單字檔對應到的項目：{len(pairs)}")
    print(f"  {'將複製' if a.dry else '已複製'}到 words/ ：{copied}")
    print(f"  共用檔本來就有         ：{have}")
    print(f"  同字重複（只留一份）   ：{dup}")
    print(f"  沒有舊檔（之後由 auto-speech.py 補錄）：{nofile}")
    if a.clean:
        print(f"  {'將刪除' if a.dry else '已刪除'}舊單字檔 ：{removed}")
    if not a.dry:
        write_manifests(root)
        print("完成。請重新整理網頁測試單字 🔊；確認沒問題後，再用 --clean 清掉舊檔。" if not a.clean else "完成。")


if __name__ == "__main__":
    main()
