# -*- coding: utf-8 -*-
"""
daily_timestamps.py — 為 TOEIC Daily Coach 的 mp3 產生「句子時間戳記」並寫入 daily.json

使用方式：雙擊執行 → 選擇 mp3（可複選，檔名如 w1d1.mp3）→ 選擇 daily.json
          也可由 json_merge.py 的「執行對時」帶參數開啟：daily_timestamps.py --json daily.json a.mp3 b.mp3
          （有帶參數就不再跳出選檔視窗，直接處理）
原理：用 faster-whisper 聽出每個字的時間，再與 daily.json 裡該天的 passage 對齊，
      只在對應那一天新增／更新 "timing" 欄位，其他資料一律不動。
【逐字對時】timing 每一句多一個 "words"：[[字元起, 字元迄, 開始秒, 結束秒], ...]，語音練習的語調曲線靠它把每個字釘在曲線上。
  舊資料（沒有 words）重新執行一次就會自動補上。
第一次執行會自動安裝 faster-whisper 並下載語音模型（約 150MB，需連網）。

【語調曲線】除了 timing，也會順便把整個 mp3 的「音高（F0）＋音量」算出來，寫進同一天的 "prosody" 欄位，
  網頁「語音練習 → 一句一句」會畫成曲線給你看（高低起伏＝語調、底下的柱狀＝輕重）。
  只用 numpy 計算，不需要另外安裝東西；4 分鐘的音檔約幾秒。
  每個選到的 mp3 會自己判斷要做什麼：
    ・還沒有 timing                → 聽寫對時（慢）＋算曲線
    ・已有 timing、但沒有曲線／曲線是舊版 → 只補曲線，不重新聽寫（很快）← 補舊檔就是選舊的 mp3 再跑一次
    ・mp3 檔案跟上次算曲線時不一樣（重錄過）→ 視為音檔換了，重新對時＋重算曲線
    ・已經都有、也沒換過           → 略過
  想強制全部重新對時：命令列加 --retime（或把下方 RETIME_EXISTING 改成 True）。

【判斷標準】固定使用下方 CFG（不需要每次選）。想調整才改 CFG 的數字；語音練習的「寬／嚴」在網頁裡切換，跟這裡無關。
"""
import sys, os, re, json, subprocess, difflib, traceback

MODEL = "base.en"   # 想更準可改 "small.en"（較慢、模型較大）
RETIME_EXISTING = False   # True＝已經有 timing 的檔案也一律重新聽寫對時（跟舊版一樣）；False＝有 timing 就只補曲線

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
SPEAKER = re.compile(r"[A-Za-z][A-Za-z.\-]*:")   # （舊）單字標籤，保留相容
# 說話者標籤（行首；與網站 speak.js 的 SK_LAB 同規則）：Customer: / The man : / Woman 1: / Mr. Lee:
LABEL = re.compile(r"^[ \t]*[A-Z][A-Za-z0-9.'’\-]*(?:[ \t]+[A-Za-z0-9.'’\-]+){0,2}[ \t]*[:：](?=\s|$)", re.M)


def label_spans(text):
    return [(m.start(), m.end()) for m in LABEL.finditer(text)]


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


def word_times(ptoks, idx, match, wtoks, start, end):
    """這一句每個字的時間：[[字元起, 字元迄, 開始秒, 結束秒], ...]（字元位置＝passage 內的絕對位置）。
    有對到的字用 whisper 聽到的時間；沒對到的字，在前後有時間的字之間依字母數平均分配。"""
    n = len(idx)
    ts = [None] * n
    for k, i in enumerate(idx):
        if i in match:
            w = wtoks[match[i]]
            ts[k] = [w[0], w[1]]
    k = 0
    while k < n:
        if ts[k] is not None:
            k += 1
            continue
        j = k
        while j < n and ts[j] is None:
            j += 1
        t0 = ts[k - 1][1] if k > 0 else start
        t1 = ts[j][0] if j < n else end
        if t1 < t0:
            t1 = t0
        wts = [max(1, len(ptoks[idx[q]][2])) for q in range(k, j)]
        tot, cur = float(sum(wts)), t0
        for q, wt in zip(range(k, j), wts):
            d = (t1 - t0) * wt / tot
            ts[q] = [cur, cur + d]
            cur += d
        k = j
    out = []
    for k, i in enumerate(idx):          # 數字被展開成好幾個字時（64182），合併回同一個字
        a, b = ptoks[i][0], ptoks[i][1]
        if out and out[-1][0] == a and out[-1][1] == b:
            out[-1][3] = max(out[-1][3], ts[k][1])
        else:
            out.append([a, b, ts[k][0], ts[k][1]])
    prev = 0.0
    for w in out:                        # 時間要由小到大，且每個字至少 0.05 秒
        w[2] = max(w[2], prev)
        w[3] = max(w[3], w[2] + 0.05)
        prev = w[2]
        w[2], w[3] = round(w[2], 2), round(w[3], 2)
    return out


def align(passage, words, cfg):
    """words: [(start, end, text)]（whisper 逐字結果）→ (timing 清單, 報告, 統計)。cfg＝判斷標準（見上方 CFG）。"""
    ptoks = []
    for m in re.finditer(r"\S+", passage):
        n = norm(m.group())
        if not n:
            continue
        if n.isdigit():   # 64182 → six four one eight two（與 whisper 結果的 expand_words 對稱，數字才對得上）
            ptoks += [(m.start(), m.end(), DIG[int(c)]) for c in n]
        else:
            ptoks.append((m.start(), m.end(), n))
    # 說話者標籤（行首的 Customer: / The man : / Woman 1:）音檔不會唸，不列入比對（句子範圍 from/to 不變）
    _ls = label_spans(passage)
    ptoks = [t for t in ptoks if not any(a <= t[0] < b for a, b in _ls)]
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
        res.append([a, b, len(idx), label, {"start": start, "end": end, "from": a, "to": b,
                                             "words": word_times(ptoks, idx, match, wtoks, start, end)}, f"對中 {ratio:3.0%}"])

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


# ───────────────────────── 文稿比對：以音檔為準，找出文稿與錄音不一致的地方 ─────────────────────────
# 用途：文稿定稿、錄完音後，又把文稿的字句刪掉或改掉（例如把 "The man :" 刪了再錄），
#       這裡用 whisper 聽到的內容當「事實」，和 daily.json 的 passage 逐字比對，列出每一處差異，
#       由人一筆一筆決定要不要改文稿（diff_passage → 畫面勾選 → apply_hunks → 重新對時 align）。
ALIAS = {"mister": "mr", "missus": "mrs", "doctor": "dr", "okay": "ok", "ms": "ms", "miss": "ms"}
_NUMW = set(DIG) | set((
    "ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty "
    "seventy eighty ninety hundred thousand million and oh point dollar dollars percent am pm first second third "
    "fourth fifth sixth seventh eighth ninth tenth").split())


def _canon(w):
    return ALIAS.get(w, w)


def _is_numberish(ws):
    return bool(ws) and all(w.isdigit() or w in _NUMW for w in ws)


def _expand_passage(passage):
    """passage → [(a, b, 字)]；數字拆成英文數字（64182 → six four one eight two），每個字都對應原本那個詞的範圍。"""
    ls = []
    for m in re.finditer(r"\S+", passage):
        n = norm(m.group())
        if not n:
            continue
        if n.isdigit():
            ls += [(m.start(), m.end(), DIG[int(c)]) for c in n]
        else:
            ls.append((m.start(), m.end(), _canon(n)))
    return ls


def _expand_asr(words):
    """whisper 逐字 → [(start, end, 字, 原字)]；數字展開，原字只放在第一個。"""
    out = []
    for s, e, t in words:
        raw = (t or "").strip()
        n = norm(raw)
        if not n:
            continue
        if n.isdigit():
            step = (e - s) / len(n)
            out += [(s + k * step, s + (k + 1) * step, DIG[int(c)], raw if k == 0 else "") for k, c in enumerate(n)]
        else:
            out.append((s, e, _canon(n), raw))
    return out


def _strip_edge(w):
    return re.sub(r"^[^A-Za-z0-9]+|[^A-Za-z0-9]+$", "", w)


def diff_passage(passage, words, fuzzy=0.70):
    """回傳 (hunks, 略過的數字寫法差異數)。每個 hunk：
       {id, kind: delete|insert|replace|label, a, b, old, new, t0, t1, conf: sure|maybe, note}
       a/b＝這處差異在 passage 的字元範圍（insert 的 a==b＝插入位置）。"""
    pt, wt = _expand_passage(passage), _expand_asr(words)
    pw, ww = [t[2] for t in pt], [t[2] for t in wt]
    sm = difflib.SequenceMatcher(None, pw, ww, autojunk=False)
    lspans = label_spans(passage)
    raw_ops = []     # (i1, i2, j1, j2)
    skipped = 0
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        P, W = pw[i1:i2], ww[j1:j2]
        if tag == "replace":
            if "".join(P) == "".join(W):                      # check-in ↔ check in
                continue
            if _is_numberish(P) and _is_numberish(W):         # 25 ↔ twenty five：寫法不同，不是真的差異
                skipped += 1
                continue
            if len(P) == len(W):                              # 一對一：聽成相近的字不算差異，只留真的不同的連續段
                bad = [difflib.SequenceMatcher(None, a, b).ratio() < fuzzy for a, b in zip(P, W)]
                k = 0
                while k < len(P):
                    if not bad[k]:
                        k += 1
                        continue
                    m = k
                    while m < len(P) and bad[m]:
                        m += 1
                    raw_ops.append((i1 + k, i1 + m, j1 + k, j1 + m))
                    k = m
                continue
        if tag == "delete" and _is_numberish(P):
            skipped += 1
            continue
        raw_ops.append((i1, i2, j1, j2))

    hunks = []
    for n, (i1, i2, j1, j2) in enumerate(raw_ops, 1):
        # 音檔時間窗：前一個對到的字的結束 ～ 後一個對到的字的開始
        prev_end = wt[j1 - 1][1] if j1 > 0 else 0.0
        next_start = wt[j2][0] if j2 < len(wt) else (wt[-1][1] if wt else 0.0)
        h = {"id": n, "t0": round(prev_end, 2), "t1": round(max(next_start, prev_end), 2), "conf": "maybe", "note": ""}
        if i2 > i1:
            a, b = pt[i1][0], pt[i2 - 1][1]
            h["old"] = passage[a:b]
        else:
            # 純插入：放在前一個字之後（沒有前字就放在第一個字之前）
            a = b = pt[i1 - 1][1] if i1 > 0 else (pt[0][0] if pt else 0)
            h["old"] = ""
        h["a"], h["b"] = a, b
        raw_new = [t[3] for t in wt[j1:j2] if t[3]]
        h["new"] = " ".join(_strip_edge(w) for w in raw_new if _strip_edge(w))
        gap = h["t1"] - h["t0"]
        if i2 > i1 and j2 == j1:
            h["kind"] = "delete"
            in_label = any(la <= a and b <= lb + 2 for la, lb in lspans) or any(la <= a < lb for la, lb in lspans)
            if in_label:
                h["kind"] = "label"
            need = 0.15 + 0.12 * (i2 - i1)
            if passage[:a].rstrip(" \t").endswith("\n") or not passage[:a].strip():
                need += 0.8          # 行首的字（多半是說話者標籤）：前面本來就會有換人說話的停頓
            if gap <= need:
                h["conf"], h["note"] = "sure", "音檔這裡只有 %.1f 秒空檔，確實沒唸" % gap
            else:
                h["note"] = "音檔這裡有 %.1f 秒的聲音，可能是辨識漏聽，請聽一下再決定" % gap
        elif i2 == i1:
            h["kind"] = "insert"
            at_edge = j1 == 0 or j2 >= len(wt)
            h["conf"] = "maybe"
            h["note"] = "音檔開頭／結尾多出來的字，常是辨識亂加（如 Thank you）" if at_edge else "音檔有唸、文稿沒有"
        else:
            h["kind"] = "replace"
            h["note"] = "文稿與音檔用字不同（音檔 %.1f 秒）" % gap
        hunks.append(h)
    return hunks, skipped


def _cut_span(text, a, b):
    """刪掉 text[a:b]，順手清掉殘留的冒號、多餘空白，並把新的句首字母改大寫。回傳新字串。"""
    m = re.match(r"[ \t]*[:：\-–—]+(?=\s|$)", text[b:])
    if m:
        b += m.end()
    before, after = text[:a], text[b:]
    at_line = before == "" or before.rstrip(" \t").endswith("\n") or before.rstrip(" \t") == ""
    if at_line:
        before = before.rstrip(" \t")
        after = after.lstrip(" \t")
    elif before.endswith((" ", "\t")) and after.startswith((" ", "\t")):
        after = after.lstrip(" \t")
    elif not before.endswith((" ", "\t")) and after.startswith((" ", "\t")) and after.lstrip(" \t")[:1] in ".,!?;:":
        after = after.lstrip(" \t")
    if before.endswith((" ", "\t")) and after.startswith("\n"):
        before = before.rstrip(" \t")
    if before.endswith("\n") and after.startswith("\n"):     # 整行刪空了 → 不留空行
        after = after[1:]
    # 句首大寫
    pre = before.rstrip(" \t")
    if pre == "" or pre.endswith(("\n", ".", "!", "?", '"', "”", "“")):
        mm = re.match(r"^([\"“'(]*)([a-z])", after)
        if mm:
            after = after[:mm.start(2)] + after[mm.start(2)].upper() + after[mm.end(2):]
    return before + after


def apply_hunks(passage, hunks):
    """把勾選的 hunks 套用到 passage，回傳新文稿。由後往前套，字元位置才不會跑掉。"""
    text = passage
    for h in sorted(hunks, key=lambda x: (x["a"], x["b"]), reverse=True):
        a, b, kind = h["a"], h["b"], h["kind"]
        if kind in ("delete", "label"):
            text = _cut_span(text, a, b)
        elif kind == "insert":
            ins = h["new"]
            if not ins:
                continue
            nxt = text[a:a + 1]
            if a == 0 or (b == a and text[:a].strip() == ""):
                text = ins + " " + text[a:]
            else:
                text = text[:a] + " " + ins + text[a:]
        elif kind == "replace":
            old = text[a:b]
            lead = re.match(r"^[^A-Za-z0-9]*", old).group()
            trail = re.search(r"[^A-Za-z0-9]*$", old).group()
            body = h["new"]
            if body:
                if old[len(lead):len(lead) + 1].isupper() and body[:1].islower():
                    body = body[0].upper() + body[1:]
                text = text[:a] + lead + body + trail + text[b:]
            else:
                text = _cut_span(text, a, b)
    return text


def transcribe_cached(model_getter, mp3, cache_dir, prompt=None, log=print):
    """辨識結果存成快取（backup/asr_cache/<檔名>.json）：同一個 mp3 沒改過就不用再聽一次。
       model_getter＝呼叫後回傳 whisper 模型的函式（沒有快取時才會載入模型）。"""
    os.makedirs(cache_dir, exist_ok=True)
    st = os.stat(mp3)
    key = {"model": MODEL, "size": st.st_size, "mtime": int(st.st_mtime)}
    cp = os.path.join(cache_dir, os.path.splitext(os.path.basename(mp3))[0] + ".json")
    try:
        with open(cp, encoding="utf-8") as f:
            c = json.load(f)
        if c.get("key") == key and isinstance(c.get("words"), list):
            log("使用快取的辨識結果：%s" % os.path.basename(cp))
            return [tuple(w) for w in c["words"]]
    except Exception:
        pass
    words = transcribe(model_getter(), mp3, prompt)
    with open(cp, "w", encoding="utf-8") as f:
        json.dump({"key": key, "words": words}, f, ensure_ascii=False)
    return words


# ───────────────────────── 語調曲線：音高（F0）＋音量，整個 mp3 一條線 ─────────────────────────
# 寫進 daily.json 該天的 "prosody"：{"v":1,"hop":0.05,"src":<mp3 檔案大小>,"f0":[Hz…],"vol":[0–100…]}
#   f0 ：每 hop 秒一個點，單位 Hz（整數），0＝沒有音高（無聲、氣音、停頓）
#   vol：每 hop 秒一個點，0–100（以這個音檔最大聲的地方當 100，往下 50 dB 當 0）
#   src：mp3 的檔案大小；mp3 換掉（重錄）後大小不同 → 下次執行會知道曲線過期，自動重算
#   網頁依 timing 的 start/end 從這條線切出每一句，所以句子被合併、剪裁微調都不用重算。
PROSODY_VER = 1
P_SR, P_HOP, P_WIN = 16000, 800, 1024      # 取樣率；每 800 點（0.05 秒）一格；每格看 1024 點（64ms）
P_FMIN, P_FMAX = 65.0, 420.0               # 找音高的範圍（男聲約 85–180、女聲約 165–255）
P_VOICED = 0.38                            # 週期性要有多明顯才算「有音高」（0–1，越高越嚴格）
P_GATE_DB = 40.0                           # 比最大聲的地方小聲超過這麼多 dB 的格子，一律當無聲


def _p_decode(mp3):
    """mp3 → 16kHz 單聲道 float 陣列。先用 faster-whisper 內建的解碼；它失敗（av 版本不合）就改用 av，再不行用 ffmpeg 指令。"""
    import numpy as np
    ensure_faster_whisper()
    try:
        from faster_whisper.audio import decode_audio
        return decode_audio(mp3, sampling_rate=P_SR)
    except Exception:
        pass
    try:
        import av
        rs = av.AudioResampler(format="s16", layout="mono", rate=P_SR)
        chunks = []
        with av.open(mp3, mode="r") as c:
            for fr in c.decode(audio=0):
                for o in rs.resample(fr):
                    chunks.append(o.to_ndarray().reshape(-1))
            for o in rs.resample(None):
                chunks.append(o.to_ndarray().reshape(-1))
        return np.concatenate(chunks).astype(np.float32) / 32768.0
    except Exception:
        pass
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", mp3, "-f", "s16le", "-ac", "1", "-ar", str(P_SR), "-"],
                         check=True, stdout=subprocess.PIPE).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def analyze_prosody(mp3, log=print):
    """讀 mp3 → 回傳 prosody 字典。只用 numpy（faster-whisper 已經裝了），不需要 librosa。"""
    import numpy as np
    y = np.asarray(_p_decode(mp3), dtype=np.float64)
    n = max(1, int(np.ceil(len(y) / P_HOP)))
    pad = np.zeros(len(y) + P_WIN)
    pad[P_WIN // 2: P_WIN // 2 + len(y)] = y            # 第 k 格以 k*HOP 為中心
    win = np.hanning(P_WIN)
    # 視窗本身的自相關：用來修正「看越遠的 lag 重疊越少」造成的偏差
    nf = 2 * P_WIN
    rw = np.fft.irfft(np.abs(np.fft.rfft(win, nf)) ** 2)[:P_WIN]
    rw = rw / rw[0]
    lmin, lmax = int(P_SR / P_FMAX), int(P_SR / P_FMIN)
    rms = np.zeros(n)
    f0 = np.zeros(n)
    strength = np.zeros(n)
    frames = np.lib.stride_tricks.sliding_window_view(pad, P_WIN)[::P_HOP][:n]
    rms[:len(frames)] = np.sqrt(np.mean(frames ** 2, axis=1))
    db = 20 * np.log10(rms + 1e-9)
    top = np.percentile(db[rms > 1e-6], 98) if np.any(rms > 1e-6) else 0.0
    for k in range(len(frames)):
        if db[k] < top - P_GATE_DB:
            continue
        x = frames[k] - frames[k].mean()
        x = x * win
        r0 = float(np.dot(x, x))
        if r0 <= 1e-12:
            continue
        r = np.fft.irfft(np.abs(np.fft.rfft(x, nf)) ** 2)[:P_WIN]
        r = r / r0 / np.maximum(rw, 1e-3)
        seg = r[lmin - 1: lmax + 2]
        # 區域最大值當候選；取「夠高又最短的週期」避免抓成低八度
        pk = [i for i in range(1, len(seg) - 1) if seg[i] > seg[i - 1] and seg[i] >= seg[i + 1] and seg[i] > P_VOICED]
        if not pk:
            continue
        best = max(seg[i] for i in pk)
        i0 = next(i for i in pk if seg[i] >= 0.88 * best)
        a, b, c = seg[i0 - 1], seg[i0], seg[i0 + 1]
        den = a - 2 * b + c
        off = 0.5 * (a - c) / den if abs(den) > 1e-12 else 0.0
        lag = (lmin - 1) + i0 + off
        if lag > 0:
            f0[k] = P_SR / lag
            strength[k] = b
    f0 = _p_clean(f0)
    v = np.clip(100 + (db - top) * 100.0 / 50.0, 0, 100)
    v[rms < 1e-6] = 0
    return {"v": PROSODY_VER, "hop": P_HOP / P_SR,
            "src": os.path.getsize(mp3),
            "f0": [int(round(x)) for x in f0], "vol": [int(round(x)) for x in v]}


def _p_clean(f0):
    """去掉單獨亂跳的點、修正突然差八度的點、再做 5 點中位數平滑（只在有音高的連續段內做）。"""
    import numpy as np
    f = f0.copy()
    n = len(f)
    i = 0
    while i < n:                       # 一連串有音高的段落
        if f[i] <= 0:
            i += 1
            continue
        j = i
        while j < n and f[j] > 0:
            j += 1
        if j - i < 3:                  # 太短（不到 0.15 秒）多半是雜訊
            f[i:j] = 0
        else:
            seg = f[i:j].copy()
            med = float(np.median(seg))
            for t in range(len(seg)):  # 與整段中位數差八度 → 折回來
                while seg[t] > med * 1.65 and seg[t] / 2 >= P_FMIN:
                    seg[t] /= 2
                while seg[t] < med / 1.65 and seg[t] * 2 <= P_FMAX:
                    seg[t] *= 2
            sm = seg.copy()
            for t in range(len(seg)):
                lo, hi = max(0, t - 2), min(len(seg), t + 3)
                sm[t] = np.median(seg[lo:hi])
            f[i:j] = sm
        i = j
    return f


def dump_json(data):
    text = json.dumps(data, ensure_ascii=False, indent=2)
    # 讓每個 timing 物件維持單行，避免 JSON 檔變得很長
    text = re.sub(
        r'\{\s*"start": ([\d.]+),\s*"end": ([\d.]+),\s*"from": (\d+),\s*"to": (\d+)\s*\}',
        r'{"start": \1, "end": \2, "from": \3, "to": \4}', text)
    # 語調曲線的數字陣列（f0／vol）也壓成一行，不然一個數字一行檔案會暴增
    return re.sub(r'("(?:f0|vol)": )\[([^\]]*)\]',
                  lambda m: m.group(1) + "[" + re.sub(r"\s+", "", m.group(2)) + "]", text)


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


def fresh_prosody(entry, mp3):
    """這天已經有、而且是用目前這個 mp3 算的最新版曲線？"""
    pr = entry.get("prosody")
    return (isinstance(pr, dict) and pr.get("v") == PROSODY_VER and bool(pr.get("f0"))
            and pr.get("src") == os.path.getsize(mp3))


def main():
    import tkinter as tk
    from tkinter import filedialog, messagebox, simpledialog
    root = tk.Tk(); root.withdraw(); root.attributes("-topmost", True)
    here = os.path.dirname(os.path.abspath(__file__))

    # 命令列參數：--json 路徑 + 一或多個 mp3（由 json_merge.py 帶入）；--retime＝已有 timing 也重新對時；沒帶 mp3 就照舊跳選檔視窗
    argv, jpath, mp3s, retime = sys.argv[1:], None, [], RETIME_EXISTING
    k = 0
    while k < len(argv):
        if argv[k] == "--json" and k + 1 < len(argv):
            jpath = argv[k + 1]; k += 2
        elif argv[k] == "--retime":
            retime = True; k += 1
        else:
            mp3s.append(argv[k]); k += 1
    mp3s = [p for p in mp3s if os.path.isfile(p)]
    if jpath and not os.path.isfile(jpath):
        print(f"找不到 {jpath}，改成手動選擇。"); jpath = None
    if mp3s and jpath:
        print(f"由參數帶入：{len(mp3s)} 個音檔 → {jpath}")
    else:
        mp3s = filedialog.askopenfilenames(title="1/2 選擇 mp3 音檔（可複選；舊檔也選，會自動補語調曲線）", initialdir=here,
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

    print(f"共選了 {len(mp3s)} 個音檔｜模型：{MODEL}" + ("｜強制重新對時" if retime else ""))
    model = None   # 要聽寫時才載入（只補曲線的檔案不需要模型）
    n_time, n_curve, failed, partial, skipped = 0, 0, [], [], []

    for mp3 in sorted(mp3s):
        name = os.path.basename(mp3)
        print(f"\n===== {name} =====")

        m = re.search(r"w(\d+)d(\d+)(?:-(\d+))?", name, re.I)
        if m:
            week, day = int(m.group(1)), int(m.group(2))
            if day == 8 and m.group(3):          # D8 專案：w1d8-2 ＝ Week 1 Day 9（d8-N ＝ day 7+N，和 json_merge.py、網頁一致）
                day = 7 + int(m.group(3))
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

        # 這個檔案要做什麼？
        old = entry.get("prosody")
        changed = isinstance(old, dict) and old.get("src") not in (None, os.path.getsize(mp3))   # 曲線是用別的 mp3 算的 → 音檔換過
        no_words = bool(entry.get("timing")) and any(isinstance(t, dict) and not t.get("words") for t in entry["timing"]
                                                   if t.get("end", 0) - t.get("start", 0) > 0.0)   # 舊版對時沒有逐字時間
        need_time = retime or not entry.get("timing") or changed or no_words
        need_curve = need_time or not fresh_prosody(entry, mp3)
        if not need_curve:
            print("✓ 已經有 timing 和語調曲線，略過（要重新對時請加 --retime）。")
            skipped.append(name)
            continue
        if no_words and not retime and not changed:
            print("※ 這一天的 timing 還沒有逐字時間（舊版對時），重新聽寫一次補上。")
        if changed and not retime and entry.get("timing"):
            print("※ 這個 mp3 跟上次算曲線時不一樣（重錄過？），重新對時並重算曲線。")

        timing = None
        if need_time:
            try:
                if model is None:
                    model = load_model(MODEL)
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
        else:
            print("已有 timing，只補語調曲線（不需要聽寫）。")

        old_t = entry.get("timing") or []
        if timing is not None and old_t and len(timing) < len(old_t) and not retime:
            # 新結果比原本少很多句：多半是 mp3 和這一天的文稿不是同一篇。不覆蓋，原本的 timing 與曲線都保留
            print(f"✗ 這次只對到 {len(timing)} 句，原本有 {len(old_t)} 句；為了不蓋掉原本的資料，略過這個檔案。")
            print("  （檔名對應到 Week %d Day %d，請確認 mp3 檔名；真的要覆蓋請加 --retime）" % (week, day))
            failed.append(f"{name}（只對到 {len(timing)}/{len(old_t)} 句，已保留原本的 timing；檔名是否對應到正確的那一天？）")
            continue

        try:
            print("計算語調曲線（音高＋音量）…")
            pros = analyze_prosody(mp3)
            voiced = sum(1 for v in pros["f0"] if v > 0)
            print(f"  曲線 {len(pros['f0'])} 點（{len(pros['f0']) * pros['hop']:.1f} 秒），有音高的佔 {voiced / max(1, len(pros['f0'])):.0%}")
        except Exception as e:
            traceback.print_exc()
            print("⚠ 語調曲線計算失敗（timing 仍會照常寫入）。")
            failed.append(f"{name}（語調曲線失敗：{e}）")
            pros = None

        if timing is not None:
            entry["timing"] = timing
            n_time += 1
            print(f"✓ Week {week} Day {day}：{len(timing)} / {total} 個句子")
            if len(timing) < total:
                partial.append(f"{name}（{len(timing)}/{total}）")
        if pros is not None:
            entry["prosody"] = pros
            n_curve += 1
        elif timing is not None:
            entry.pop("prosody", None)   # 音檔換了但曲線算不出來：不要留舊的

    if n_time == 0 and n_curve == 0:
        if failed:
            msg = "所有檔案都處理失敗，未寫入任何資料。\n\n" + "\n".join(failed)
            print("\n" + msg)
            return messagebox.showerror("沒有可寫入的資料", msg)
        msg = "選的檔案都已經有 timing 和語調曲線，沒有需要更新的。\n（要重新對時：命令列加 --retime）"
        print("\n" + msg)
        return messagebox.showinfo("沒有變更", msg)

    tmp = jpath + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(dump_json(data) + "\n")
    os.replace(tmp, jpath)

    msg = f"完成！對時 {n_time} 個、語調曲線 {n_curve} 個（模型：{MODEL}）。"
    if skipped:
        msg += f"\n略過 {len(skipped)} 個（已經完成）。"
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
