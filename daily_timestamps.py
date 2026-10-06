# -*- coding: utf-8 -*-
"""
daily_timestamps.py — 為 TOEIC Daily Coach 的 mp3 產生「句子時間戳記」並寫入 daily.json

使用方式：雙擊執行 → 選擇 mp3（可複選，檔名如 w1d1.mp3）→ 選擇 daily.json
原理：用 faster-whisper 聽出每個字的時間，再與 daily.json 裡該天的 passage 對齊，
      只在對應那一天新增／更新 "timing" 欄位，其他資料一律不動。
第一次執行會自動安裝 faster-whisper 並下載語音模型（約 150MB，需連網）。

【判斷標準】固定使用下方 CFG（不需要每次選）。想調整才改 CFG 的數字；語音練習的「寬／嚴」在網頁裡切換，跟這裡無關。
"""
import sys, os, re, json, subprocess, difflib, traceback

MODEL = "base.en"   # 想更準可改 "small.en"（較慢、模型較大）

# 一句話要同時滿足這些條件才算「對到」並寫入 timing；沒過的句子會在報告顯示 ✗，維護總覽會顯示「部分」
#   min_ratio：這句的字有多少比例在辨識結果裡找得到（舊版是 0.3，太鬆）
#   fuzzy    ：辨識聽成不同字時，相似度達多少才算（None＝不算，0＝一律算）
#   edges    ："any"＝句首或句尾至少一個字要對到（否則 start／end 會偏）；"both"＝兩個都要；None＝不檢查
#   max_rate ：每秒最多幾個字，超過代表時間被壓縮（正常約 2.5–4）；None＝不檢查（超過 3 個字的句子才檢查，太短的句子不準）
#   fill_gaps：True＝對不到的句子，若前後句都對到了且中間空檔合理，就依字數「推估」時間補上（報告顯示 ≈）；False＝不補
CFG = dict(min_ratio=0.60, fuzzy=0.70, edges="any", max_rate=8.0, fill_gaps=True)
ABBR = {"mr", "ms", "mrs", "dr", "inc", "co", "ltd", "no", "vs", "st", "jr", "sr"}


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


DIG = "zero one two three four five six seven eight nine".split()
SPEAKER = re.compile(r"[A-Za-z][A-Za-z.\-]*:")   # Customer: / Agent: / Man: … 說話者標籤


def expand_words(words):
    """whisper 把數字寫成 64182 / 6-4-1-8-2 時，展開成 six four one eight two（時間平均分配）。"""
    out = []
    for s, e, t in words:
        n = norm(t)
        if not n:
            continue
        if n.isdigit():
            step = (e - s) / len(n)
            out += [(s + k * step, s + (k + 1) * step, DIG[int(c)]) for k, c in enumerate(n)]
        else:
            out.append((s, e, n))
    return out


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


def align(passage, words, cfg):
    """words: [(start, end, text)]（whisper 逐字結果）→ (timing 清單, 報告, 統計)。cfg＝判斷標準（見上方 CFG）。"""
    ptoks = [(m.start(), m.end(), norm(m.group())) for m in re.finditer(r"\S+", passage)]
    ptoks = [t for t in ptoks if t[2]]
    # 說話者標籤（行首的 Customer: / Agent:）音檔不會唸，不列入比對（句子範圍 from/to 不變）
    ptoks = [t for t in ptoks
             if not (SPEAKER.fullmatch(passage[t[0]:t[1]]) and (t[0] == 0 or passage[t[0] - 1] == "\n"))]
    wtoks = expand_words(words)
    pw, ww = [t[2] for t in ptoks], [t[2] for t in wtoks]
    sm = difflib.SequenceMatcher(None, pw, ww, autojunk=False)
    match = {}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                match[i1 + k] = j1 + k
        elif tag == "replace" and i2 - i1 == j2 - j1 and cfg["fuzzy"] is not None:
            for k in range(i2 - i1):  # 聽成不一樣的字：依相似度決定算不算
                if difflib.SequenceMatcher(None, pw[i1 + k], ww[j1 + k]).ratio() >= cfg["fuzzy"]:
                    match[i1 + k] = j1 + k
    timing, report, sents = [], [], split_sentences(passage)
    res = []   # 每句：[a, b, 字數, label, timing 或 None, 失敗原因]
    for a, b in sents:
        idx = [i for i, t in enumerate(ptoks) if a <= t[0] < b]
        hit = [wtoks[match[i]] for i in idx if i in match]
        label = passage[a:b].replace("\n", " ")[:50]
        if not idx or not hit:
            res.append([a, b, max(len(idx), 1), label, None, "未對到（音檔可能沒唸這句）"])
            continue
        ratio = len(hit) / len(idx)
        start = round(min(h[0] for h in hit), 2)
        end = round(max(h[1] for h in hit), 2)
        end = max(end, start + 0.1)
        why = None
        if ratio < cfg["min_ratio"]:
            why = f"只對到 {ratio:.0%}（需 {cfg['min_ratio']:.0%}）"
        elif cfg["edges"] == "both" and not (idx[0] in match and idx[-1] in match):
            why = "句首或句尾的字沒對到"
        elif cfg["edges"] == "any" and idx[0] not in match and idx[-1] not in match:
            why = "句首與句尾都沒對到"
        elif cfg["max_rate"] and len(idx) > 3 and len(idx) / (end - start) > cfg["max_rate"]:
            why = f"語速 {len(idx) / (end - start):.1f} 字/秒太快，時間可能被壓縮"
        if why:
            res.append([a, b, len(idx), label, None, why])
            continue
        res.append([a, b, len(idx), label, {"start": start, "end": end, "from": a, "to": b}, f"對中 {ratio:3.0%}"])

    # 補洞：連續幾句對不到、但前後句都對到時，依字數把中間的空檔分配給它們（推估值）
    if cfg.get("fill_gaps"):
        i = 0
        while i < len(res):
            if res[i][4] is not None:
                i += 1
                continue
            j = i
            while j < len(res) and res[j][4] is None:
                j += 1
            if 0 < i and j < len(res):
                t0, t1 = res[i - 1][4]["end"], res[j][4]["start"]
                n = sum(r[2] for r in res[i:j])
                gap = t1 - t0
                if gap > 0 and 1.0 <= n / gap <= 6.0:   # 空檔長度要像「真的有人唸了這幾句」
                    cur = t0
                    for r in res[i:j]:
                        d = gap * r[2] / n
                        r[4] = {"start": round(cur, 2), "end": round(max(cur + d, cur + 0.1), 2), "from": r[0], "to": r[1]}
                        r[5] = "≈推估（前後句夾住）"
                        cur += d
            i = j

    for a, b, n, label, t, note in res:
        if t is None:
            report.append(f"  ✗ {note}：{label}")
        else:
            timing.append(t)
            mark = "≈" if note.startswith("≈") else "✓"
            report.append(f"  {mark} {t['start']:6.2f}s – {t['end']:6.2f}s  {note}  {label}")
    return timing, report, len(sents)


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


def load_model(name):
    """只載入一次模型，多個檔案共用。"""
    ensure_faster_whisper()
    from faster_whisper import WhisperModel
    print(f"載入模型 {name}（第一次會下載）…")
    return WhisperModel(name, device="cpu", compute_type="int8")


def transcribe(model, mp3, prompt=None):
    print(f"辨識中：{os.path.basename(mp3)}")
    segs, info = model.transcribe(mp3, language="en", word_timestamps=True,
                                  beam_size=5, condition_on_previous_text=False,
                                  initial_prompt=prompt or None)
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

    print(f"共選了 {len(mp3s)} 個音檔｜模型：{MODEL}")
    model = load_model(MODEL)
    done, failed, partial = 0, [], []

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
            timing, report, total = align(entry["passage"], transcribe(model, mp3), CFG)
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
        print(f"✓ Week {week} Day {day}：{len(timing)} / {total} 個句子")
        if len(timing) < total:
            partial.append(f"{name}（{len(timing)}/{total}）")

    if done == 0:
        msg = "所有檔案都處理失敗，未寫入任何資料。\n\n" + "\n".join(failed)
        print("\n" + msg)
        return messagebox.showerror("沒有可寫入的資料", msg)

    tmp = jpath + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(dump_json(data) + "\n")
    os.replace(tmp, jpath)

    msg = f"完成！成功 {done} 個檔案（模型：{MODEL}）。"
    if partial:
        msg += "\n\n有漏句（維護總覽會顯示「部分」），可改用較大的模型（MODEL 改 small.en）或放寬 CFG 再跑一次：\n" + "\n".join(partial)
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
