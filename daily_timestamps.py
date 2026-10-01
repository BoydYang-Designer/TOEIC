# -*- coding: utf-8 -*-
"""
add_timestamps.py — 為 TOEIC Daily Coach 的 mp3 產生「句子時間戳記」並寫入 daily.json

使用方式：雙擊執行 → 選擇 mp3（可複選，檔名如 w1d1.mp3）→ 選擇 daily.json
原理：用 faster-whisper 聽出每個字的時間，再與 daily.json 裡該天的 passage 對齊，
      只在對應那一天新增／更新 "timing" 欄位，其他資料一律不動。
第一次執行會自動安裝 faster-whisper 並下載語音模型（約 150MB，需連網）。
"""
import sys, os, re, json, shutil, subprocess, difflib, datetime, traceback

MODEL = "base.en"   # 想更準可改 "small.en"（較慢、模型較大）
ABBR = {"mr", "ms", "mrs", "dr", "inc", "co", "ltd", "no", "vs", "st", "jr", "sr"}


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


def split_sentences(text):
    """回傳 [(from, to)]，為 passage 中每個句子的字元範圍。"""
    res, pos = [], 0

    def add(base, a, b, line):
        seg = line[a:b]
        lead = len(seg) - len(seg.lstrip())
        seg = seg.strip()
        if seg:
            res.append((base + a + lead, base + a + lead + len(seg)))

    for line in text.split("\n"):
        seg_start = 0
        for m in re.finditer(r'(?<=[.!?])\s+(?=[A-Z"\'(])', line):
            words = line[seg_start:m.start()].split()
            last = words[-1] if words else ""
            if last.rstrip(".").lower() in ABBR or re.fullmatch(r"(?:[A-Za-z]\.){2,}", last):
                continue  # A.M. / P.M. / Ms. 等縮寫不切句
            add(pos, seg_start, m.start(), line)
            seg_start = m.end()
        add(pos, seg_start, len(line), line)
        pos += len(line) + 1
    return res


def align(passage, words):
    """words: [(start, end, text)]（whisper 逐字結果）→ timing 清單。"""
    ptoks = [(m.start(), m.end(), norm(m.group())) for m in re.finditer(r"\S+", passage)]
    ptoks = [t for t in ptoks if t[2]]
    wtoks = [(s, e, norm(t)) for s, e, t in words if norm(t)]
    sm = difflib.SequenceMatcher(None, [t[2] for t in ptoks], [t[2] for t in wtoks], autojunk=False)
    match = {}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal" or (tag == "replace" and i2 - i1 == j2 - j1):
            for k in range(i2 - i1):
                match[i1 + k] = j1 + k
    timing, report = [], []
    for a, b in split_sentences(passage):
        idx = [i for i, t in enumerate(ptoks) if a <= t[0] < b]
        hit = [wtoks[match[i]] for i in idx if i in match]
        label = passage[a:b].replace("\n", " ")[:50]
        if not idx or len(hit) / len(idx) < 0.3:
            report.append(f"  ✗ 未對到（音檔可能沒唸這句）：{label}")
            continue
        start = round(min(h[0] for h in hit), 2)
        end = round(max(h[1] for h in hit), 2)
        timing.append({"start": start, "end": max(end, start + 0.1), "from": a, "to": b})
        report.append(f"  ✓ {start:6.2f}s – {end:6.2f}s  {label}")
    return timing, report


def dump_json(data):
    text = json.dumps(data, ensure_ascii=False, indent=2)
    # 讓每個 timing 物件維持單行，避免 JSON 檔變得很長
    return re.sub(
        r'\{\s*"start": ([\d.]+),\s*"end": ([\d.]+),\s*"from": (\d+),\s*"to": (\d+)\s*\}',
        r'{"start": \1, "end": \2, "from": \3, "to": \4}', text)


def ensure_faster_whisper():
    try:
        import faster_whisper  # noqa
    except ImportError:
        print("第一次使用：正在安裝 faster-whisper（需要網路，請稍候）…")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "faster-whisper"])


def load_model():
    """只載入一次模型，多個檔案共用。"""
    ensure_faster_whisper()
    from faster_whisper import WhisperModel
    print(f"載入模型 {MODEL}（第一次會下載）…")
    return WhisperModel(MODEL, device="cpu", compute_type="int8")


def transcribe(model, mp3):
    print(f"辨識中：{os.path.basename(mp3)}")
    segs, info = model.transcribe(mp3, language="en", word_timestamps=True,
                                  beam_size=5, condition_on_previous_text=False)
    words = []
    for seg in segs:
        print(f"  [{seg.start:6.1f}s] {seg.text.strip()[:60]}")
        words += [(w.start, w.end, w.word) for w in (seg.words or [])]
    return words


def main():
    import tkinter as tk
    from tkinter import filedialog, messagebox, simpledialog
    root = tk.Tk(); root.withdraw(); root.attributes("-topmost", True)
    here = os.path.dirname(os.path.abspath(__file__))

    mp3s = filedialog.askopenfilenames(title="1/2 選擇 mp3 音檔（可複選）", initialdir=here,
                                       filetypes=[("音檔", "*.mp3 *.wav *.m4a"), ("所有檔案", "*.*")])
    if not mp3s: return print("已取消。")
    jpath = filedialog.askopenfilename(title="2/2 選擇要寫入的 daily.json", initialdir=here,
                                       filetypes=[("JSON", "*.json"), ("所有檔案", "*.*")])
    if not jpath: return print("已取消。")

    with open(jpath, encoding="utf-8-sig") as f:
        data = json.load(f)
    # daily.json 可以是陣列，或含 _spec / items 的物件（目前格式）
    items = data if isinstance(data, list) else (data.get("items") if isinstance(data, dict) else None)
    if not isinstance(items, list):
        return messagebox.showerror("格式錯誤", "daily.json 需為陣列，或含 items 陣列的物件。")

    print(f"共選了 {len(mp3s)} 個音檔。")
    model = load_model()
    done, failed = 0, []

    for mp3 in sorted(mp3s):
        name = os.path.basename(mp3)
        print(f"\n===== {name} =====")

        m = re.search(r"w(\d+)d(\d+)", name, re.I)
        if m:
            week, day = int(m.group(1)), int(m.group(2))
        elif len(mp3s) == 1:
            # 只選一個檔案時，才跳出視窗讓你手動輸入
            week = simpledialog.askinteger("週次", "檔名不是 w1d1 格式，請輸入 Week（例如 5）：")
            day = simpledialog.askinteger("天數", "請輸入 Day（1-7）：")
            if week is None or day is None:
                print("✗ 未輸入週次／天數，略過。")
                failed.append(f"{name}（未輸入週次／天數）")
                continue
        else:
            print("✗ 檔名不是 w1d1 格式，略過。")
            failed.append(f"{name}（檔名不是 w1d1 格式）")
            continue

        entry = next((x for x in items if isinstance(x, dict)
                      and x.get("week") == week and x.get("day") == day), None)
        if entry is None:
            print(f"✗ daily.json 裡沒有 Week {week} Day {day}，略過。")
            failed.append(f"{name}（找不到 Week {week} Day {day}）")
            continue
        print(f"目標：Week {week} Day {day}｜{entry.get('tag', '')}")

        try:
            timing, report = align(entry["passage"], transcribe(model, mp3))
        except Exception as e:
            traceback.print_exc()
            print(f"✗ 處理時發生錯誤，略過。")
            failed.append(f"{name}（錯誤：{e}）")
            continue

        print("對齊結果：")
        print("\n".join(report))
        if not timing:
            print("✗ 沒有任何句子對得上，略過（請確認 mp3 內容與英文文稿一致）。")
            failed.append(f"{name}（沒有句子對得上）")
            continue

        entry["timing"] = timing
        done += 1
        print(f"✓ Week {week} Day {day}：{len(timing)} 個句子")

    if done == 0:
        msg = "所有檔案都處理失敗，未寫入任何資料。\n\n" + "\n".join(failed)
        print("\n" + msg)
        return messagebox.showerror("沒有可寫入的資料", msg)

    bak = f"{jpath}.bak-{datetime.datetime.now():%Y%m%d-%H%M%S}"
    shutil.copy2(jpath, bak)
    tmp = jpath + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(dump_json(data) + "\n")
    os.replace(tmp, jpath)

    msg = f"完成！成功 {done} 個檔案。\n備份：{os.path.basename(bak)}"
    if failed:
        msg += "\n\n失敗／略過：\n" + "\n".join(failed)
    print("\n" + msg)
    messagebox.showinfo("完成", msg)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
    input("\n按 Enter 關閉視窗…")
