#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
part3-auto-speech.py  ——  Part 3 簡短對話：勾選要補錄的題組，產生缺少的 mp3

用法：把這支檔案放在「有 part3.json 的資料夾」（或 audio 資料夾裡），直接雙擊執行。
  1. 讀 part3.json，檢查 audio/p3/ 底下每組對話「每一句」的 mp3 是否存在
  2. 視窗列出有缺的題組，勾選這次要做的（可一次勾前 N 題、依前綴勾 d1 / d2-001、依難度勾 -e / -m / -h）
  3. 按「開始產生」，用 Edge 神經網路語音（edge-tts）錄製並存到正確位置
  4. 做完清單會自動更新，下次再勾下一批；全部做完可執行 audio/audio_scan.py 更新 index.json

聲音：依 speakers 的 gender（F／M）挑女聲／男聲；整組聲音依題目 id 固定。
      三人對話若有兩位同性別，會自動分配不同的聲音，聽得出是兩個人。
檔名：audio/p3/{id}-s01.mp3 …（編號＝dialogue 順序，從 01 起），與 audio_scan.py、part3.js 一致。
參數：--cli 強制使用文字模式（沒有 tkinter 時會自動使用）；--dry 只列清單不產生。
"""
import asyncio
import importlib
import json
import queue
import re
import subprocess
import sys
import threading
import zlib
from pathlib import Path

# ============================== 設定區（只要改這裡）==============================
SUBDIR = "p3"                 # 句子音檔資料夾：audio/p3/
ITEMS_FILE = "part3.json"
# 檔名格式（必須和 audio_scan.py、part3.js 一致！）
S_NAME = "{id}-s{n:02d}.mp3"  # n = 1 起，依 dialogue 順序
RATE = "+0%"                  # 語速，例如 "-10%" 更慢、"+0%" 正常
TIMEOUT = 30                  # 單一檔案最久等幾秒，超過就當失敗並重試
CONCURRENCY = 4               # 同時產生幾個檔案
SECS_PER_FILE = 1.5           # 只用來估算時間
# 順序必須「女、男、女、男…」交替（偶數位＝女聲、奇數位＝男聲）
VOICES = [
    "en-US-AriaNeural",
    "en-US-GuyNeural",
    "en-GB-SoniaNeural",
    "en-GB-RyanNeural",
    "en-AU-NatashaNeural",
    "en-AU-WilliamNeural",
]
# ================================================================================

HERE = Path(__file__).resolve().parent


# ------------------------------- 資料與計畫 -------------------------------
def find_root():
    for d in (HERE, HERE.parent, Path.cwd()):
        if (d / ITEMS_FILE).exists():
            return d
    return None


def ok_file(p: Path) -> bool:
    return p.exists() and p.stat().st_size > 1000


def pick_voices(it):
    """回傳 {說話者 id: 聲音}。依性別分女聲／男聲，同性別的多位說話者用不同聲音；依題目 id 固定。"""
    h = zlib.crc32(it["id"].encode("utf-8"))
    fem, mal = VOICES[0::2], VOICES[1::2]
    used = {"F": 0, "M": 0}
    out = {}
    for s in it.get("speakers") or []:
        g = "M" if s.get("gender") == "M" else "F"
        pool = mal if g == "M" else fem
        out[s["id"]] = pool[(h + (h >> 8 if g == "M" else 0) + used[g]) % len(pool)]
        used[g] += 1
    return out


def short(v):
    return v.split("-")[-1].replace("Neural", "")


def match_key(key, p):
    """前綴比對（d1 / d2-001）；以 - 開頭則比對結尾（-e / -m / -h 依難度）。"""
    key, p = key.lower(), p.lower()
    return key.endswith(p) if p.startswith("-") else key.startswith(p)


def build_plan(root: Path):
    """回傳 groups：list of dict(key, total, voice, jobs[])，只包含有缺檔的題組。"""
    data = json.loads((root / ITEMS_FILE).read_text(encoding="utf-8-sig"))
    items = data["items"] if isinstance(data, dict) else data
    audio = root / "audio"
    groups = []
    for it in items:
        if not isinstance(it, dict) or it.get("skip") or not it.get("id") or not it.get("dialogue"):
            continue
        iid = it["id"]
        vmap = pick_voices(it)
        fallback = VOICES[0]
        jobs = []
        for i, line in enumerate(it["dialogue"], 1):
            name = S_NAME.format(id=iid, n=i)
            path = audio / SUBDIR / name
            if not ok_file(path):
                jobs.append(dict(item=iid, name=name, text=line["t"], voice=vmap.get(line.get("sp"), fallback),
                                 path=path, sp=line.get("sp", "?")))
        if jobs:
            vtxt = " / ".join(f"{sp} {short(v)}" for sp, v in vmap.items())
            groups.append(dict(key=iid, total=len(it["dialogue"]), voice=vtxt, jobs=jobs))
    return groups


def est_minutes(n_files):
    return max(1, round(n_files * SECS_PER_FILE / CONCURRENCY / 60))


def have_edge_tts():
    try:
        importlib.invalidate_caches()
        importlib.import_module("edge_tts")
        return True
    except ImportError:
        return False


# ------------------------------- 語音產生 -------------------------------
async def synth(job, sem, st, log, edge_tts):
    async with sem:
        if st["stop"].is_set():
            st["skipped"] += 1
            return
        job["path"].parent.mkdir(parents=True, exist_ok=True)
        tmp = job["path"].with_suffix(".tmp")
        err = None
        for _ in range(3):
            try:
                await asyncio.wait_for(edge_tts.Communicate(job["text"], job["voice"], rate=RATE).save(str(tmp)), TIMEOUT)
                if tmp.exists() and tmp.stat().st_size > 1000:
                    tmp.replace(job["path"])
                    st["ok"] += 1
                    log(f"✓ {job['name']}  {job['sp']}: {job['text']}")
                    return
            except Exception as e:  # 網路不穩就重試
                err = f"{type(e).__name__} {e}".strip()
            await asyncio.sleep(1.5)
        st["bad"] += 1
        log(f"✗ 失敗 {job['name']}  ({err})")
        try:
            tmp.unlink()
        except OSError:
            pass


def generate(jobs, log, progress, stop):
    """同步執行（給文字模式或背景執行緒呼叫）。回傳 (成功, 失敗, 略過)"""
    if not have_edge_tts():
        log("正在安裝 edge-tts …")
        r = subprocess.run([sys.executable, "-m", "pip", "install", "edge-tts"], capture_output=True, text=True)
        if r.returncode != 0 or not have_edge_tts():
            log("✗ 安裝 edge-tts 失敗，請手動執行：pip install edge-tts")
            return 0, len(jobs), 0
    import edge_tts
    st = dict(ok=0, bad=0, skipped=0, stop=stop)
    total = len(jobs)

    def lg(m):
        log(m)
        progress(st["ok"] + st["bad"], total)

    async def go():
        sem = asyncio.Semaphore(CONCURRENCY)
        await asyncio.gather(*(synth(j, sem, st, lg, edge_tts) for j in jobs))

    asyncio.run(go())
    return st["ok"], st["bad"], st["skipped"]


def run_scan(root: Path, log):
    scan = root / "audio" / "audio_scan.py"
    if not scan.exists():
        log("（找不到 audio/audio_scan.py，請自行更新 index.json）")
        return
    r = subprocess.run([sys.executable, str(scan)], cwd=str(scan.parent), capture_output=True, text=True, input="\n")
    log((r.stdout or "") + (r.stderr or "") or "audio_scan.py 已執行。")


# ------------------------------- 視窗模式 -------------------------------
def run_gui(root: Path):
    import tkinter as tk
    from tkinter import ttk, messagebox

    win = tk.Tk()
    win.title("Part 3 補錄音檔")
    win.geometry("1000x720")
    S = dict(groups=[], checked=set(), running=False, stop=threading.Event())
    q = queue.Queue()

    ttk.Label(win, text=f"專案：{root}　　句子存放：{root / 'audio' / SUBDIR}",
              foreground="#555").pack(anchor="w", padx=10, pady=(8, 2))

    bar = ttk.Frame(win)
    bar.pack(fill="x", padx=10, pady=4)
    n_var, pre_var = tk.StringVar(value="10"), tk.StringVar()

    tree_f = ttk.Frame(win)
    tree_f.pack(fill="both", expand=True, padx=10)
    cols = ("chk", "id", "miss", "voice", "sample")
    tree = ttk.Treeview(tree_f, columns=cols, show="headings", selectmode="browse", height=12)
    for c, t, w in zip(cols, ("勾", "題組", "缺/總", "聲音", "第一個缺檔的文字"), (40, 110, 70, 220, 460)):
        tree.heading(c, text=t)
        tree.column(c, width=w, anchor="center" if c in ("chk", "miss") else "w", stretch=(c == "sample"))
    sb = ttk.Scrollbar(tree_f, orient="vertical", command=tree.yview)
    tree.configure(yscrollcommand=sb.set)
    tree.pack(side="left", fill="both", expand=True)
    sb.pack(side="right", fill="y")

    summary = ttk.Label(win, font=("", 11, "bold"))
    summary.pack(anchor="w", padx=10, pady=(6, 0))
    detail = tk.Text(win, height=7, wrap="none", background="#f7f7f7")
    detail.pack(fill="x", padx=10, pady=4)

    act = ttk.Frame(win)
    act.pack(fill="x", padx=10)
    prog = ttk.Progressbar(win, mode="determinate")
    prog.pack(fill="x", padx=10, pady=4)
    logbox = tk.Text(win, height=8, wrap="none", background="#101418", foreground="#d6e2ee")
    logbox.pack(fill="both", padx=10, pady=(0, 10))

    def log(m):
        logbox.insert("end", m + "\n")
        logbox.see("end")

    def update_summary():
        g = [S["groups"][int(i)] for i in S["checked"]]
        n = sum(len(x["jobs"]) for x in g)
        total = sum(len(x["jobs"]) for x in S["groups"])
        summary.config(text=f"已勾選 {len(g)} 組，共 {n} 個檔，預估約 {est_minutes(n) if n else 0} 分鐘　（全部缺 {total} 個檔）")
        start_btn.config(state="normal" if (n and not S["running"]) else "disabled")

    def repaint():
        tree.delete(*tree.get_children())
        for i, g in enumerate(S["groups"]):
            tree.insert("", "end", iid=str(i), values=(
                "☑" if str(i) in S["checked"] else "☐", g["key"], f"{len(g['jobs'])}/{g['total']}", g["voice"], g["jobs"][0]["text"]))
        update_summary()

    def reload_plan():
        S["groups"] = build_plan(root)
        S["checked"] = set()
        repaint()
        detail.delete("1.0", "end")

    def set_checked(ids):
        S["checked"] = set(map(str, ids))
        repaint()

    def toggle(iid):
        S["checked"].symmetric_difference_update({iid})
        tree.set(iid, "chk", "☑" if iid in S["checked"] else "☐")
        update_summary()

    def on_click(e):
        if tree.identify_region(e.x, e.y) == "cell" and tree.identify_column(e.x) == "#1":
            iid = tree.identify_row(e.y)
            if iid:
                toggle(iid)
                return "break"

    def on_select(_e=None):
        sel = tree.selection()
        if not sel:
            return
        g = S["groups"][int(sel[0])]
        detail.delete("1.0", "end")
        detail.insert("end", f"{g['key']}　聲音 {g['voice']}　存到 {root / 'audio' / SUBDIR}\n")
        for j in g["jobs"]:
            detail.insert("end", f"  {j['name']:<22} {j['sp']}: {j['text']}\n")

    def space(_e):
        sel = tree.selection()
        if sel:
            toggle(sel[0])

    tree.bind("<Button-1>", on_click)
    tree.bind("<<TreeviewSelect>>", on_select)
    tree.bind("<space>", space)

    def first_n():
        try:
            n = max(0, int(n_var.get()))
        except ValueError:
            return
        set_checked(range(min(n, len(S["groups"]))))

    def by_prefix():
        p = pre_var.get().strip().lower()
        if p:
            set_checked(i for i, g in enumerate(S["groups"]) if match_key(g["key"], p))

    ttk.Button(bar, text="全選", command=lambda: set_checked(range(len(S["groups"])))).pack(side="left")
    ttk.Button(bar, text="全不選", command=lambda: set_checked([])).pack(side="left", padx=4)
    ttk.Button(bar, text="反選", command=lambda: set_checked(i for i in range(len(S["groups"])) if str(i) not in S["checked"])).pack(side="left")
    ttk.Separator(bar, orient="vertical").pack(side="left", fill="y", padx=10)
    ttk.Label(bar, text="只勾前").pack(side="left")
    ttk.Entry(bar, textvariable=n_var, width=4).pack(side="left", padx=2)
    ttk.Label(bar, text="組").pack(side="left")
    ttk.Button(bar, text="勾選", command=first_n).pack(side="left", padx=4)
    ttk.Separator(bar, orient="vertical").pack(side="left", fill="y", padx=10)
    ttk.Label(bar, text="依前綴勾選（d1 / d2-001 / -e 初級 / -m 中級 / -h 高級）").pack(side="left")
    ttk.Entry(bar, textvariable=pre_var, width=10).pack(side="left", padx=4)
    ttk.Button(bar, text="勾選", command=by_prefix).pack(side="left")

    def start():
        jobs = [j for i in sorted(S["checked"], key=int) for j in S["groups"][int(i)]["jobs"]]
        if not jobs:
            return
        S["running"] = True
        S["stop"].clear()
        start_btn.config(state="disabled")
        stop_btn.config(state="normal")
        prog.config(maximum=len(jobs), value=0)
        log(f"—— 開始產生 {len(jobs)} 個檔案（需要網路）——")

        def work():
            try:
                res = generate(jobs, lambda m: q.put(("log", m)), lambda d, t: q.put(("prog", d)), S["stop"])
            except Exception as e:
                q.put(("log", f"✗ 發生錯誤：{e}"))
                res = (0, len(jobs), 0)
            q.put(("done", res))

        threading.Thread(target=work, daemon=True).start()

    def finish(res):
        ok, bad, skipped = res
        S["running"] = False
        stop_btn.config(state="disabled")
        log(f"—— 完成：成功 {ok}，失敗 {bad}" + (f"，已取消 {skipped}" if skipped else "") + " ——")
        reload_plan()
        if ok and (root / "audio" / "audio_scan.py").exists():
            if messagebox.askyesno("更新 index.json", "要順便執行 audio/audio_scan.py 更新 index.json 嗎？\n（網頁之後按 Ctrl+F5 重新整理）"):
                run_scan(root, log)

    def poll():
        try:
            while True:
                k, v = q.get_nowait()
                if k == "log":
                    log(v)
                elif k == "prog":
                    prog.config(value=v)
                elif k == "done":
                    finish(v)
        except queue.Empty:
            pass
        win.after(100, poll)

    start_btn = ttk.Button(act, text="▶ 開始產生勾選的", command=start, state="disabled")
    start_btn.pack(side="left")
    stop_btn = ttk.Button(act, text="■ 停止（做完手上的就停）", command=lambda: (S["stop"].set(), log("要求停止…")), state="disabled")
    stop_btn.pack(side="left", padx=6)
    ttk.Button(act, text="重新掃描", command=lambda: None if S["running"] else reload_plan()).pack(side="left")
    ttk.Button(act, text="執行 audio_scan.py", command=lambda: run_scan(root, log)).pack(side="right")

    reload_plan()
    if not S["groups"]:
        log("✔ 所有音檔都齊了，沒有需要產生的檔案。")
    poll()
    win.mainloop()


# ------------------------------- 文字模式 -------------------------------
def parse_selection(ans, groups):
    ans = ans.strip().lower()
    if ans in ("all", "y", "全部"):
        return list(range(len(groups)))
    m = re.fullmatch(r"(?:前|first)\s*(\d+)", ans)
    if m:
        return list(range(min(int(m.group(1)), len(groups))))
    chosen = []
    for tok in re.split(r"[,\s，]+", ans):
        if not tok:
            continue
        m = re.fullmatch(r"(\d+)-(\d+)", tok)
        if m:
            chosen += [i for i in range(int(m.group(1)) - 1, int(m.group(2))) if 0 <= i < len(groups)]
        elif tok.isdigit():
            if 0 <= int(tok) - 1 < len(groups):
                chosen.append(int(tok) - 1)
        else:
            chosen += [i for i, g in enumerate(groups) if match_key(g["key"], tok)]
    return sorted(set(chosen))


def run_cli(root: Path, dry: bool):
    groups = build_plan(root)
    if not groups:
        print("✔ 所有音檔都齊了，沒有需要產生的檔案。")
        return
    total = sum(len(g["jobs"]) for g in groups)
    print("=" * 78)
    print(f"專案資料夾 : {root}\n句子存放   : {root / 'audio' / SUBDIR}\n語速 {RATE}　缺 {total} 個檔")
    print("=" * 78)
    for n, g in enumerate(groups, 1):
        print(f"{n:>3}. {g['key']:<12} 缺 {len(g['jobs']):>2}/{g['total']:<2} {g['voice']:<28} {g['jobs'][0]['text']}")
    if dry:
        print("\n（--dry 模式：只列清單）")
        return
    print("\n請選擇這次要做哪些（可混用，用逗號分隔）：")
    print("  全部：all　　前 N 組：前10　　編號：1,3,5-8　　前綴：d1 或 d2-001　難度：-e / -m / -h　　直接 Enter：取消")
    sel = parse_selection(input("> "), groups)
    if not sel:
        print("沒有選任何題組，已取消。")
        return
    jobs = [j for i in sel for j in groups[i]["jobs"]]
    print(f"\n將產生 {len(sel)} 組、{len(jobs)} 個檔（約 {est_minutes(len(jobs))} 分鐘）。")
    for i in sel:
        for j in groups[i]["jobs"]:
            print(f"   {j['path']}   {j['sp']}: {j['text']}")
    if input("確定開始？(Y/n) ").strip().lower() in ("n", "no"):
        return
    ok, bad, _ = generate(jobs, print, lambda d, t: None, threading.Event())
    print(f"\n完成：成功 {ok}，失敗 {bad}。")
    if ok and (root / "audio" / "audio_scan.py").exists():
        if input("要順便執行 audio/audio_scan.py 更新 index.json 嗎？(Y/n) ").strip().lower() not in ("n", "no"):
            run_scan(root, print)
    print("網頁請按 Ctrl+F5 重新整理。再次執行本程式可以做下一批。")


def main():
    root = find_root()
    if not root:
        print("找不到 part3.json。請把本檔案放在 part3.json 所在的資料夾（或 audio 資料夾內）。")
        input("\n按 Enter 結束…")
        return
    want_cli = "--cli" in sys.argv or "--dry" in sys.argv
    if not want_cli:
        try:
            import tkinter  # noqa: F401
        except ImportError:
            print("這台電腦的 Python 沒有 tkinter，改用文字模式。")
            want_cli = True
    if want_cli:
        run_cli(root, "--dry" in sys.argv)
        if "--dry" not in sys.argv:
            try:
                input("\n按 Enter 結束…")
            except EOFError:
                pass
    else:
        run_gui(root)


if __name__ == "__main__":
    main()
