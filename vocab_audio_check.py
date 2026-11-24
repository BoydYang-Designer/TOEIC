# -*- coding: utf-8 -*-
"""
vocab_audio_check.py —— 詳解音檔「對稿＋孤兒」檢查工具（單字／片語／句子詳解通用）

用法：放在專案根目錄（有 daily.json 與 audio/ 的那層），雙擊執行。
  1. 輸入要檢查的詳解（一行一個，或用逗號分隔；例：realistic）。輸入 * ＝全部詳解（很久，不建議）。
  2. 按「掃描」：依 auto-speech.py 的同一套命名規則，列出這個詳解每個 🔊 該用哪個 mp3，
     再用 faster-whisper 把 mp3 聽寫成文字，和詳解上的英文比對。
  3. 結果分類（勾選後按「套用」才會動檔案；所有動作都有復原檔，可按「復原上一次」）：
       🔀 錯置　　mp3 念的是同詳解另一格的句子 → 改檔名（互換、循環都能處理）
       🧩 孤兒補位 沒人用的 mp3（或孤兒池裡的）剛好是某個缺檔格的句子 → 補進去
       👻 孤兒　　　沒有任何格子會用到的 mp3 → 搬到 orphan_pool/，文字登記在「孤兒總表.txt／.csv」，並可產生「給 AI 的提示詞」
       ⚠ 不符　　　念的內容和詳解文字對不上、也找不到該放的格子（可能是詳解文字改過）→ 可搬到孤兒池，讓 auto-speech 重錄
       ❌ 缺檔　　　沒有 mp3（也沒有可補的孤兒）→ 用 auto-speech.py 補錄
  3b. 「📂 孤兒池」按鈕：開啟孤兒池總表視窗，列出池裡每個 mp3 的檔名與念的文字；可改檔名、改文字、試聽、
      重新辨識、同步資料夾（你在檔案總管改名或丟新檔進去也能對上）。每次異動自動更新 orphan_pool/孤兒總表.txt／.csv。
  4. 孤兒要「善用」：按「孤兒 → AI 維護」→ 產生 orphan_pool/ai_prompt_xxx.txt（已複製到剪貼簿）與逐字稿 json，
     把提示詞貼給 AI → 得到 w?d?_extra.json → 用 json_merge.py 合併 → 回來再掃描一次，
     新句子的缺檔格會自動被孤兒池裡同文字的 mp3 補上（🧩 孤兒補位）。
  5. 套用完會自動重建 vocab/、words/ 的 index.json，並同步 voices-log.json 的檔名紀錄。網頁按 Ctrl+F5。

第一次執行會自動 pip install faster-whisper（和 daily_timestamps.py 同一套）。
參數：python vocab_audio_check.py realistic      直接帶字進去並開始掃描
"""
import os, sys, re, json, time, shutil, difflib, subprocess, threading, queue
from pathlib import Path
from datetime import datetime

MODEL = "base.en"          # 想更準改 "small.en"（較慢）；視窗上也能切
OK_SIM = 0.85              # 逐字稿與詳解文字相似度 ≥ 這個值 ＝ 念對了
OK_SIM_SHORT = 0.72        # 只有 1～2 個字的單字／片語，辨識比較不穩，門檻放寬
STALE_SIM = 0.50           # 介於 STALE_SIM～OK_SIM 且找不到去處 ＝ 疑似「詳解文字改過、mp3 是舊的」
POOL_DIR = "orphan_pool"
CACHE_NAME = "audio_check_cache.json"
WHY_TXT = {"orphan": "沒有格子用到", "eject": "內容不符（詳解文字改過？）", "manual": "手動放入"}

def natkey(n):
    return [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)", n)]
SUFFIXES = r"(?:e|c|cf|cp|cw|f|fx|m|mx|d|p|pw|s|sw|sm|sx|kw|pr|en|en2|lm)"

# ----------------------------- 與 auto-speech.py / notes.js 完全一致的檔名規則 -----------------------------
def norm(s):
    return re.sub(r"\s+", " ", str(s or "").strip().lower())

def fnv6(s):
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"[:6]

def slug(text):
    k = norm(text)
    s = re.sub(r"[^a-z0-9]+", "-", k).strip("-")
    if s and len(s) <= 40:
        return s
    return s[:40].rstrip("-") + ("-" if s else "") + fnv6(k)

def speak_text(t):
    return re.sub(r"\.{2,}|…", " ", str(t)).strip()

ABBR = re.compile(r"\b(Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|Co|Corp|St|No|vs|etc)\.$")
SENT_END = re.compile(r"[.!?]+[\"')\]]*\s+(?=[\"'(\[]?[A-Z0-9])")

def split_sent(p):
    out = []
    for m in re.finditer(r"[^\n]+", p):
        line, base = m.group(0), m.start()
        def push(s, e):
            while s < e and line[s].isspace(): s += 1
            while e > s and line[e - 1].isspace(): e -= 1
            if e > s: out.append((base + s, base + e))
        st = 0
        for k in SENT_END.finditer(line):
            if ABBR.search(line[st:k.start() + 1]): continue
            push(st, k.end()); st = k.end()
        push(st, len(line))
    return out

def sentence_of(passage, text):
    i = passage.lower().find(str(text).lower())
    if i < 0: return None
    for a, b in split_sent(passage):
        if a <= i < b: return passage[a:b].strip()
    return None

def art_id(x):
    w, d = int(x["week"]), int(x["day"])
    return f"w{w}d8-{d - 7}" if d >= 8 else f"w{w}d{d}"

def ok_file(p):
    return p.exists() and p.stat().st_size > 1000

# ----------------------------- 比對 -----------------------------
def toks(s):
    return re.findall(r"[a-z0-9]+", str(s).lower().replace("’", "").replace("'", ""))

def sim(a, b):
    A, B = " ".join(toks(a)), " ".join(toks(b))
    if not A or not B: return 0.0
    return difflib.SequenceMatcher(None, A, B).ratio()

def thr(text):
    return OK_SIM_SHORT if len(toks(text)) <= 2 else OK_SIM

# ----------------------------- 詳解 → 每個 🔊 該用的檔（與 auto-speech.plan_daily 同規則） -----------------------------
def build_slots(e, ctx_sentence):
    """回傳 list of dict(dir, name, text, label)。dir：'vocab'＝例句庫、'words'＝共用單字庫。"""
    out = []
    def add(d, name, text, label):
        text = str(text or "").strip()
        if text: out.append(dict(dir=d, name=name, text=text, label=label))
    def dget(o, *ks):
        for k in ks:
            v = o.get(k) if isinstance(o, dict) else None
            if isinstance(v, str) and v.strip(): return v
        return None
    def exen(o):
        ex = o.get("example") if isinstance(o, dict) else None
        v = ex.get("en") if isinstance(ex, dict) else None
        return v if isinstance(v, str) and v.strip() else None
    text, typ = e["text"], e.get("type") or "word"
    base = slug(text)
    if typ == "sentence": add("vocab", base + ".mp3", speak_text(text), "整句")
    else:                 add("words", base + ".mp3", speak_text(text), "單字本身")
    lem = str(e.get("lemma") or "").strip()
    if lem and norm(lem) != norm(text): add("words", slug(lem) + ".mp3", speak_text(lem), "原形")
    if typ != "sentence" and ctx_sentence: add("vocab", slug(ctx_sentence) + ".mp3", ctx_sentence, "所在句")
    for k, ex in enumerate(e.get("examples") or [], 1):
        en = ex if isinstance(ex, str) else (ex or {}).get("en")
        add("vocab", f"{base}_e{k}.mp3", en, f"例句 #{k}")
    for k, c in enumerate(e.get("collocations") or [], 1):
        ph = c if isinstance(c, str) else dget(c, "phrase", "p")
        add("words", slug(ph or "") + ".mp3", speak_text(ph or ""), f"搭配片語 #{k}") if ph else None
        add("vocab", f"{base}_c{k}.mp3", exen(c), f"搭配例句 #{k}")
    for k, f in enumerate(e.get("forms") or [], 1):
        w = dget(f, "w")
        if w: add("words", slug(w) + ".mp3", speak_text(w), f"屈折變化字 #{k}")
        add("vocab", f"{base}_fx{k}.mp3", exen(f), f"屈折變化例句 #{k}")
    for k, g in enumerate(e.get("family") or [], 1):
        w = dget(g, "w")
        if w: add("words", slug(w) + ".mp3", speak_text(w), f"相關字 #{k}")
        add("vocab", f"{base}_mx{k}.mp3", exen(g), f"相關字例句 #{k}")
    for k, d in enumerate(e.get("derived") or [], 1):
        w = dget(d, "w")
        if w: add("words", slug(w) + ".mp3", speak_text(w), f"衍生字 #{k}")
    for k, c in enumerate(e.get("confusable") or [], 1):
        w = dget(c, "word", "phrase")
        if w: add("words", slug(w) + ".mp3", speak_text(w), f"易混淆字 #{k}")
        add("vocab", f"{base}_cf{k}.mp3", exen(c), f"易混淆例句 #{k}")
    if e.get("en"):  add("vocab", f"{base}_en.mp3", e["en"], "英文解說")
    if e.get("en2"): add("vocab", f"{base}_en2.mp3", e["en2"], "英文解說 #2")
    for k, o in enumerate(e.get("paraphrase") or [], 1):
        en = o.get("en") if isinstance(o, dict) else (o if isinstance(o, str) else None)
        add("vocab", f"{base}_pr{k}.mp3", en, f"同義改寫 #{k}")
    for k, o in enumerate(e.get("key_words") or [], 1):
        w = dget(o, "w")
        if w: add("words", slug(w) + ".mp3", speak_text(w), f"值得注意的字 #{k}")
    for k, c in enumerate(e.get("similar") or [], 1):
        w = dget(c, "phrase", "word")
        if w: add("words", slug(w) + ".mp3", speak_text(w), f"近義片語 #{k}")
        add("vocab", f"{base}_sx{k}.mp3", exen(c), f"近義片語例句 #{k}")
    for key, wl, el in (("pos_uses", "詞性單字", "詞性例句"), ("senses", "多義單字", "多義例句")):
        sfx = "p" if key == "pos_uses" else "s"
        for k, o in enumerate(e.get(key) or [], 1):
            if not isinstance(o, dict): continue
            ww = o.get("w") or lem or text
            add("words", slug(ww) + ".mp3", speak_text(ww), f"{wl} #{k}")
            add("vocab", f"{base}_{sfx}{k}.mp3", exen(o), f"{el} #{k}")
    return out

# ----------------------------- 專案資料 -----------------------------
class Project:
    def __init__(self, root):
        self.root = Path(root)
        self.vdir = self.root / "audio" / "daily" / "vocab"
        self.wdir = self.root / "audio" / "daily" / "words"
        self.pool = self.root / POOL_DIR
        self.entries = []          # list of dict(e, item, qid, ctx)
        self.load()

    def dirpath(self, d):
        return self.vdir if d == "vocab" else self.wdir

    def load(self):
        data = json.loads((self.root / "daily.json").read_text(encoding="utf-8-sig"))
        items = data["items"] if isinstance(data, dict) else data
        seen = set()
        for x in items:
            if not isinstance(x, dict) or "week" not in x or "day" not in x: continue
            for v in x.get("extra_vocab") or []:
                if not isinstance(v, dict): continue
                t = str(v.get("text") or v.get("word") or "").strip()
                if not t or norm(t) in seen: continue
                seen.add(norm(t))
                typ = v.get("type") or ("phrase" if re.search(r"\s", t) else "word")
                e = dict(v); e["text"] = t; e["type"] = typ
                ctx = sentence_of(str(x.get("passage") or ""), t) if typ != "sentence" else None
                self.entries.append(dict(e=e, item=x, qid=art_id(x), ctx=ctx))

    def find(self, terms):
        if any(t.strip() == "*" for t in terms): return list(self.entries), []
        got, miss = [], []
        for t in terms:
            hit = [x for x in self.entries if norm(x["e"]["text"]) == norm(t)]
            if not hit: hit = [x for x in self.entries if norm(t) in norm(x["e"]["text"])][:5]
            (got.extend(h for h in hit if h not in got) if hit else miss.append(t))
        return got, miss

    # --- 孤兒池（orphan_pool/）：pool_index.json ＝ 程式用的資料；孤兒總表.txt／.csv ＝ 給你看的總表，每次異動自動重寫 ---
    def pool_index(self):
        p = self.pool / "pool_index.json"
        try: return json.loads(p.read_text(encoding="utf-8"))
        except Exception: return {}

    def pool_save(self, idx):
        self.pool.mkdir(exist_ok=True)
        (self.pool / "pool_index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")
        self.pool_summary(idx)

    def pool_summary(self, idx):
        names = sorted(idx, key=natkey)
        L = [f"孤兒檔總表　共 {len(names)} 個　更新：{datetime.now():%Y-%m-%d %H:%M}",
             "（改檔名、改文字、搬入、補位之後會自動更新；請用 vocab_audio_check.py 的「📂 孤兒池」管理）", ""]
        for i, n in enumerate(names, 1):
            r = idx[n]
            L += [f"[{i}] {n}", f"    文字：{r.get('text', '')}",
                  f"    來源：{r.get('entry', '') or '（手動放入）'}｜原檔名 {r.get('src', '')}｜原用途 {r.get('was', '') or '—'}｜{WHY_TXT.get(r.get('why'), '')}｜{r.get('date', '')}", ""]
        try:
            (self.pool / "孤兒總表.txt").write_text("\n".join(L), encoding="utf-8")
        except Exception: pass
        try:
            import csv
            with open(self.pool / "孤兒總表.csv", "w", encoding="utf-8-sig", newline="") as f:
                w = csv.writer(f); w.writerow(["檔名", "文字", "來源詳解", "原檔名", "原用途", "原因", "日期"])
                for n in names:
                    r = idx[n]; w.writerow([n, r.get("text", ""), r.get("entry", ""), r.get("src", ""), r.get("was", ""), WHY_TXT.get(r.get("why"), ""), r.get("date", "")])
        except Exception: pass        # csv 正被 Excel 開著時寫不進去，txt 仍會更新

    def pool_add(self, src, text, d, entry_text, move=True, why="", was=""):
        """把 src 放進孤兒池（預設搬移），並在總表登記文字。回傳池裡的路徑。"""
        self.pool.mkdir(exist_ok=True)
        idx = self.pool_index()
        name, i = src.name, 2
        while (self.pool / name).exists():
            name = f"{src.stem}_{i}{src.suffix}"; i += 1
        dst = self.pool / name
        (shutil.move if move else shutil.copy2)(str(src), str(dst))
        idx[name] = dict(text=text, dir=d, entry=entry_text, src=src.name, was=was, why=why, size=dst.stat().st_size,
                         date=datetime.now().strftime("%Y-%m-%d %H:%M"))
        self.pool_save(idx)
        return dst

    def pool_rename(self, old, new):
        idx = self.pool_index()
        (self.pool / old).rename(self.pool / new)
        idx[new] = idx.pop(old) if old in idx else dict(text="", entry="", src=old, was="", why="manual", date=datetime.now().strftime("%Y-%m-%d %H:%M"))
        self.pool_save(idx)

    def pool_set_text(self, name, text):
        idx = self.pool_index()
        if name in idx:
            idx[name]["text"] = text; idx[name]["edited"] = True; self.pool_save(idx)

    def pool_sync(self, transcribe=None, log=print):
        """讓總表和資料夾一致：檔案不見了→從總表移除；你在檔案總管改了檔名（大小相同）→沿用原文字；
        手動放進來的新 mp3 →（有給 transcribe 時）聽寫後登記。"""
        idx = self.pool_index(); changed = False; now = datetime.now().strftime("%Y-%m-%d %H:%M")
        files = {f.name: f for f in self.pool.glob("*.mp3")} if self.pool.is_dir() else {}
        missing = [n for n in idx if n not in files]
        new = [n for n in files if n not in idx]
        for n in list(new):
            sz = files[n].stat().st_size
            m = next((o for o in missing if idx[o].get("size") == sz), None)
            if m:
                idx[n] = idx.pop(m); missing.remove(m); new.remove(n); changed = True; log(f"偵測到改名：{m} → {n}")
        for m in missing:
            idx.pop(m); changed = True; log(f"孤兒池已沒有這個檔，從總表移除：{m}")
        for n in new:
            if transcribe is None: continue
            text = transcribe(files[n]); changed = True; log(f"新檔登記：{n} → {text[:60]}")
            idx[n] = dict(text=text, dir="vocab", entry="", src=n, was="", why="manual", size=files[n].stat().st_size, date=now)
        for n, r in idx.items():
            if n in files and r.get("size") != files[n].stat().st_size: r["size"] = files[n].stat().st_size; changed = True
        if changed or (self.pool.is_dir() and not (self.pool / "孤兒總表.txt").exists()): self.pool_save(idx)
        return idx

    def write_manifest(self, log=print):
        for d in (self.vdir, self.wdir):
            if not d.is_dir(): continue
            files = sorted(f.name for f in d.glob("*.mp3") if ok_file(f))
            (d / "index.json").write_text(json.dumps(dict(v=int(time.time()), files=files), ensure_ascii=False, indent=1), encoding="utf-8")
            log(f"已更新 {d.relative_to(self.root)}/index.json（{len(files)} 個檔）")

    def log_rename(self, old, new):
        p = self.root / "voices-log.json"
        try:
            j = json.loads(p.read_text(encoding="utf-8-sig"))
            files = j.get("files")
            ok, nk = old.relative_to(self.root).as_posix(), new.relative_to(self.root).as_posix()
            if isinstance(files, dict) and ok in files:
                files[nk] = files.pop(ok)
                p.write_text(json.dumps(j, ensure_ascii=False, indent=1), encoding="utf-8")
        except Exception:
            pass

# ----------------------------- 聽寫 -----------------------------
class Transcriber:
    def __init__(self, root, model_name, log=print):
        self.root, self.model_name, self.log, self.model = Path(root), model_name, log, None
        try: self.cache = json.loads((self.root / CACHE_NAME).read_text(encoding="utf-8"))
        except Exception: self.cache = {}

    def _model(self):
        if self.model is None:
            try: import faster_whisper
            except ImportError:
                self.log("第一次使用：安裝 faster-whisper（需要網路，稍等）…")
                subprocess.check_call([sys.executable, "-m", "pip", "install", "faster-whisper"])
            from faster_whisper import WhisperModel
            self.log(f"載入模型 {self.model_name}（第一次會下載）…")
            self.model = WhisperModel(self.model_name, device="cpu", compute_type="int8")
        return self.model

    def __call__(self, path):
        path = Path(path); st = path.stat()
        key = path.relative_to(self.root).as_posix() if self.root in path.parents else str(path)
        c = self.cache.get(key)
        if c and c.get("size") == st.st_size and c.get("mtime") == int(st.st_mtime) and c.get("model") == self.model_name:
            return c["text"]
        segs, _ = self._model().transcribe(str(path), language="en", beam_size=5, condition_on_previous_text=False)
        text = " ".join(s.text.strip() for s in segs).strip()
        self.cache[key] = dict(size=st.st_size, mtime=int(st.st_mtime), model=self.model_name, text=text)
        return text

    def save(self):
        try: (self.root / CACHE_NAME).write_text(json.dumps(self.cache, ensure_ascii=False), encoding="utf-8")
        except Exception: pass

# ----------------------------- 分析 -----------------------------
SUF_TXT = {"e": "例句", "c": "搭配例句", "cf": "易混淆例句", "cp": "搭配片語", "cw": "易混淆單字", "f": "屈折變化字", "fx": "屈折變化例句",
           "m": "相關字", "mx": "相關字例句", "d": "衍生字", "p": "詞性例句", "pw": "詞性單字", "s": "多義例句", "sw": "多義單字",
           "sm": "近義片語", "sx": "近義片語例句", "kw": "值得注意的字", "pr": "同義改寫", "en": "英文解說", "en2": "英文解說 #2", "lm": "原形"}
KIND_TXT = {"ok": "✅ 正常", "move": "🔀 錯置", "fillm": "🧩 孤兒補位", "fillc": "🧩 池補位", "eject": "⚠ 不符",
            "orphan": "👻 孤兒", "missing": "❌ 缺檔"}
ACTIONABLE = {"move", "fillm", "fillc", "eject", "orphan"}

def analyze(prj, targets, transcribe, include_words=True, log=print):
    """回傳 rows（list of dict）。transcribe(path)->str。"""
    slots = {}      # (dir,name) -> slot
    for t in targets:
        for s in build_slots(t["e"], t["ctx"]):
            if s["dir"] == "words" and not include_words: continue
            k = (s["dir"], s["name"])
            if k in slots:
                if s["label"] not in slots[k]["label"]: slots[k]["label"] += " / " + s["label"]
                continue
            s.update(entry=t["e"], qid=t["qid"], item=t["item"], key=k)
            slots[k] = s
    log(f"共 {len(slots)} 個 🔊 格子，開始聽寫已存在的 mp3…")
    for i, (k, s) in enumerate(slots.items(), 1):
        p = prj.dirpath(k[0]) / k[1]
        s["path"] = p
        s["exists"] = ok_file(p)
        if s["exists"]:
            s["heard"] = transcribe(p)
            s["sim"] = sim(s["heard"], s["text"])
            s["ok"] = s["sim"] >= thr(s["text"])
            log(f"  [{i}/{len(slots)}] {k[1]} → {s['heard'][:60]}")
    # 孤兒：vocab/ 裡檔名像這個詳解、但沒有格子用到
    bases = {slug(t["e"]["text"]): t["e"] for t in targets}
    rx = re.compile(r"^(" + "|".join(re.escape(b) for b in bases) + r")(?:_" + SUFFIXES + r"\d*)?\.mp3$") if bases else None
    srcs = []       # 可搬動的來源：dict(kind, path, heard, dir, slotkey, entry, label)
    for k, s in slots.items():
        if s["exists"] and not s["ok"]:
            srcs.append(dict(kind="bad", path=s["path"], heard=s["heard"], dir=k[0], slotkey=k, entry=s["entry"], label=s["label"]))
    if rx and prj.vdir.is_dir():
        for f in sorted(prj.vdir.glob("*.mp3")):
            m = rx.match(f.name)
            if not m or ("vocab", f.name) in slots or not ok_file(f): continue
            heard = transcribe(f)
            log(f"  孤兒 {f.name} → {heard[:60]}")
            srcs.append(dict(kind="orphan", path=f, heard=heard, dir="vocab", slotkey=None, entry=bases[m.group(1)], label="孤兒檔"))
    for n, r in prj.pool_index().items():
        q = prj.pool / n
        if q.exists(): srcs.append(dict(kind="pool", path=q, heard=r.get("text", ""), dir=r.get("dir", "vocab"), slotkey=None,
                                        entry=None, label="孤兒池"))
    # 目標格：缺檔的、或檔案內容不對的
    tgts = [k for k, s in slots.items() if not s["exists"] or not s["ok"]]
    pairs = []
    for si, sc in enumerate(srcs):
        for k in tgts:
            if k[0] != sc["dir"] or k == sc["slotkey"]: continue
            v = sim(sc["heard"], slots[k]["text"])
            if v >= thr(slots[k]["text"]): pairs.append((v, si, k))
    pairs.sort(key=lambda x: -x[0])
    used_src, claimed, assign = set(), {}, {}
    for v, si, k in pairs:
        if si in used_src or k in claimed: continue
        used_src.add(si); claimed[k] = si; assign[si] = (k, v)
    rows = []
    def row(**kw):
        d = dict(kind="ok", label="", name="", dir="", src=None, dst=None, heard="", expect="", sim=None, checked=False,
                 note="", entry=None, qid="", was="")
        d.update(kw); d["actionable"] = d["kind"] in ACTIONABLE; rows.append(d)
    for si, sc in enumerate(srcs):
        if si in assign:
            k, v = assign[si]; s = slots[k]
            if sc["kind"] == "bad":
                row(kind="move", label=f"{sc['label']} → {s['label']}", name=sc["path"].name, dir=sc["dir"], src=sc["path"], dst=s["path"],
                    heard=sc["heard"], expect=s["text"], sim=v, checked=True, entry=s["entry"],
                    note=f"改名為 {s['path'].name}" + ("（目標位置原有檔案不對，會一起處理）" if s["exists"] else ""))
            elif sc["kind"] == "orphan":
                row(kind="fillm", label=f"孤兒 → {s['label']}", name=sc["path"].name, dir=sc["dir"], src=sc["path"], dst=s["path"],
                    heard=sc["heard"], expect=s["text"], sim=v, checked=True, entry=s["entry"], note=f"改名為 {s['path'].name}")
            else:
                row(kind="fillc", label=f"孤兒池 → {s['label']}", name=sc["path"].name, dir=sc["dir"], src=sc["path"], dst=s["path"],
                    heard=sc["heard"], expect=s["text"], sim=v, checked=True, entry=s["entry"], note=f"從孤兒池複製為 {s['path'].name}")
    for si, sc in enumerate(srcs):
        if si in assign or sc["kind"] == "pool": continue
        if sc["kind"] == "bad":
            s = slots[sc["slotkey"]]
            best = max((sim(sc["heard"], x["text"]) for x in slots.values() if x["dir"] == sc["dir"] and x["key"] != sc["slotkey"]), default=0)
            stale = s["sim"] >= STALE_SIM
            displaced = sc["slotkey"] in claimed
            row(kind="eject", label=s["label"], name=sc["path"].name, dir=sc["dir"], src=sc["path"], heard=sc["heard"], expect=s["text"],
                sim=s["sim"], checked=displaced, entry=s["entry"], was=s["label"],
                note=("被別的檔案要走位，需先移出。" if displaced else "") +
                     ("疑似詳解文字改過、mp3 是舊的。" if stale else "內容和這個詳解完全無關。") + "搬到孤兒池（總表會記錄文字）後，auto-speech 會重錄這格。")
        else:
            dup = next((x for x in slots.values() if x["exists"] and x["ok"] and x["dir"] == "vocab" and sim(sc["heard"], x["text"]) >= 0.92), None)
            sm = re.search(r"_(" + SUFFIXES + r")(\d*)\.mp3$", sc["path"].name)
            was = (SUF_TXT.get(sm.group(1), sm.group(1)) + (" #" + sm.group(2) if sm.group(2) else "")) if sm else "單字／整句"
            row(kind="orphan", label=("內容與「" + dup["label"] + "」相同（重複）" if dup else "沒有格子用到") + f"｜原用途：{was}", name=sc["path"].name, dir="vocab",
                src=sc["path"], heard=sc["heard"], expect="", checked=True, entry=sc["entry"], was=was, note="搬到 orphan_pool/，文字登記在孤兒總表，可交給 AI 納入詳解")
    for k, s in slots.items():
        if s["exists"] and s["ok"]:
            row(kind="ok", label=s["label"], name=k[1], dir=k[0], src=s["path"], heard=s["heard"], expect=s["text"], sim=s["sim"], entry=s["entry"])
        elif not s["exists"] and k not in claimed:
            row(kind="missing", label=s["label"], name=k[1], dir=k[0], dst=s["path"], expect=s["text"], entry=s["entry"],
                note="沒有 mp3 也沒有可補的孤兒 → 用 auto-speech.py 補錄")
    order = {"move": 0, "fillm": 1, "fillc": 2, "eject": 3, "orphan": 4, "missing": 5, "ok": 6}
    rows.sort(key=lambda r: (order[r["kind"]], r["name"]))
    return rows

# ----------------------------- 套用 -----------------------------
def apply_rows(prj, rows, log=print):
    sel = [r for r in rows if r["checked"] and r["kind"] in ACTIONABLE]
    if not sel: return 0
    undo, n = [], 0
    for r in sel:                                           # 1. 不符、孤兒 → 搬到孤兒池（不符的先搬，騰出格子）
        if r["kind"] in ("eject", "orphan") and r["src"].exists():
            q = prj.pool_add(r["src"], r["heard"], r["dir"], r["entry"]["text"], move=True, why=r["kind"], was=r["was"])
            undo.append(dict(op="move", frm=str(q), to=str(r["src"]))); n += 1
            log(f"搬到孤兒池：{r['name']}" + (f" → {q.name}" if q.name != r["name"] else ""))
    moves = [r for r in sel if r["kind"] in ("move", "fillm") and r["src"].exists()]   # 2. 改名（兩段式，互換／循環都安全）
    tmp = []
    for i, r in enumerate(moves):
        t = r["src"].with_name(f".__chk{i}.tmp"); r["src"].rename(t); tmp.append(t)
    for r, t in zip(moves, tmp):
        if r["dst"].exists():
            t.rename(r["src"]); log(f"✗ 目標被占用，略過：{r['dst'].name}（請先處理該檔）"); continue
        t.rename(r["dst"]); prj.log_rename(r["src"], r["dst"])
        undo.append(dict(op="move", frm=str(r["dst"]), to=str(r["src"]))); n += 1
        log(f"改名：{r['src'].name} → {r['dst'].name}")
    for r in sel:                                           # 3. 孤兒池 → 補進格子（搬出池，總表同步移除）
        if r["kind"] == "fillc" and r["src"].exists():
            if r["dst"].exists(): log(f"✗ 目標已有檔案，略過：{r['dst'].name}"); continue
            idx = prj.pool_index(); rec = idx.pop(r["src"].name, None)
            shutil.move(str(r["src"]), str(r["dst"]))
            prj.pool_save(idx)
            undo.append(dict(op="move", frm=str(r["dst"]), to=str(r["src"]), pool_rec=rec)); n += 1
            log(f"池補位：{r['src'].name} → {r['dst'].name}")
    if undo:
        prj.pool.mkdir(exist_ok=True)
        (prj.pool / f"undo_{datetime.now():%Y%m%d_%H%M%S}.json").write_text(json.dumps(undo, ensure_ascii=False, indent=1), encoding="utf-8")
    prj.pool_sync(None, log)
    prj.write_manifest(log)
    return n

def undo_last(prj, log=print):
    fs = sorted(prj.pool.glob("undo_*.json")) if prj.pool.is_dir() else []
    if not fs: log("沒有可復原的紀錄。"); return False
    f = fs[-1]
    ops = json.loads(f.read_text(encoding="utf-8"))
    mv = [o for o in ops if o["op"] == "move" and Path(o["frm"]).exists()]
    for o in ops:
        if o["op"] == "move" and not Path(o["frm"]).exists(): log(f"（略過）{Path(o['frm']).name} 已不在原處（可能被改過檔名），請到孤兒池處理")
    for o in reversed([o for o in ops if o["op"] == "copy"]):
        try:
            if Path(o["to"]).exists(): Path(o["to"]).unlink()
        except Exception as ex:
            log(f"✗ 復原失敗 {o}: {ex}")
    tmp = []
    for i, o in enumerate(mv):                                        # 搬動：兩段式，互換也安全
        t = Path(o["frm"]).with_name(f".__undo{i}.tmp"); Path(o["frm"]).rename(t); tmp.append(t)
    idx = prj.pool_index()
    for o, t in zip(mv, tmp):
        if Path(o["to"]).exists():
            t.rename(o["frm"]); log(f"✗ 無法復原（原位已有檔）：{Path(o['to']).name}"); continue
        t.rename(o["to"]); prj.log_rename(Path(o["frm"]), Path(o["to"]))
        if o.get("pool_rec") is not None: idx[Path(o["to"]).name] = o["pool_rec"]   # 從孤兒池補位的，放回池裡並恢復總表
    prj.pool_save(idx)
    f.rename(f.with_suffix(".done"))
    prj.pool_sync(None, log)                                          # 搬回原位的，從孤兒總表移除
    prj.write_manifest(log)
    log(f"已復原：{f.name}")
    return True

# ----------------------------- 孤兒 → AI -----------------------------
def write_prompt(prj, t, orphans, log=print):
    """t＝prj.entries 的一筆；orphans＝[dict(file, transcript, was)]。寫出提示詞與逐字稿 json，回傳提示詞路徑。"""
    e = t["e"]; week, day = t["item"]["week"], t["item"]["day"]
    s = slug(e["text"]); prj.pool.mkdir(exist_ok=True)
    (prj.pool / f"ai_orphans_{s}.json").write_text(json.dumps(dict(entry=e["text"], orphans=orphans), ensure_ascii=False, indent=1), encoding="utf-8")
    lines = [
        f"你是 TOEIC 英語教材編輯。下面是「{e['text']}」的既有詳解（extra_vocab 一筆），以及一批已經錄好 mp3、但目前詳解沒有用到的「孤兒句子」（由語音辨識得到的逐字稿）。",
        "請把這些句子善用進這筆詳解裡，讓 mp3 可以直接沿用，不必重錄。",
        "",
        "規則：",
        "1. 逐字稿的英文要「一字不改」（連標點、大小寫都照抄）放進詳解當作英文句子。若逐字稿明顯是辨識錯誤、不通順，或與這個字無關，就略過它，並在回覆的 changes 說明略過哪一句、為什麼。",
        "2. 每句依內容與 was（它原本的用途）選最適合的欄位：examples、collocations[].example、family[].example、senses[].example、similar[].example、confusable[].example 等；補上符合該字義的中文 zh。",
        "3. 新句子一律「附加在該陣列的最後面」。不要刪除、改寫、重新排序任何既有項目——音檔檔名是依陣列順序編號的，改順序會造成音檔錯位。",
        "4. 其他欄位（ipa、pos、zh、en、note…）都照原樣保留。",
        f"5. 請產生一個可下載的 JSON 檔案 w{week}d{day}_extra.json（UTF-8、純 JSON、不要包 markdown 程式碼框）；若無法產生檔案，才改輸出單一 json 程式碼區塊。內容格式：",
        f'   {{ "week": {week}, "day": {day}, "extra_vocab": [ {{ 這一筆完整詳解（含新增的句子） }} ] }}',
        "",
        "【孤兒句子】", json.dumps(orphans, ensure_ascii=False, indent=2), "",
        "【既有詳解（完整保留，只在陣列後面附加）】", json.dumps(e, ensure_ascii=False, indent=2), "",
        "合併後我會再跑一次檢查工具，新句子的缺檔格會自動由孤兒池的 mp3 補上。"]
    p = prj.pool / f"ai_prompt_{s}.txt"
    p.write_text("\n".join(lines), encoding="utf-8")
    log(f"已產生：{p.relative_to(prj.root)}（{len(orphans)} 句）")
    return p

def export_for_ai(prj, rows, log=print):
    """把「有勾選」的孤兒／不符檔案的逐字稿寫成提示詞（依所屬詳解分組）。回傳 [提示詞檔路徑]。"""
    groups = {}
    for r in rows:
        if r["kind"] in ("orphan", "eject") and r["checked"] and r["entry"] is not None and r["heard"]:
            groups.setdefault(norm(r["entry"]["text"]), []).append(dict(file=r["name"], transcript=r["heard"], was=r["was"] or r["label"]))
    outs = []
    for key, orphans in groups.items():
        t = next((t for t in prj.entries if norm(t["e"]["text"]) == key), None)
        if t: outs.append(write_prompt(prj, t, orphans, log))
    return outs

def export_pool_for_ai(prj, names, log=print):
    """孤兒池視窗選取的檔 → 提示詞（依池裡登記的「來源詳解」分組；手動放入、沒有來源的略過）。"""
    idx = prj.pool_index(); groups = {}; skipped = []
    for n in names:
        r = idx.get(n) or {}
        if r.get("entry") and r.get("text"): groups.setdefault(norm(r["entry"]), []).append(dict(file=n, transcript=r["text"], was=r.get("was", "")))
        else: skipped.append(n)
    outs = []
    for key, orphans in groups.items():
        t = next((t for t in prj.entries if norm(t["e"]["text"]) == key), None)
        if t: outs.append(write_prompt(prj, t, orphans, log))
    if skipped: log("沒有來源詳解、已略過：" + "、".join(skipped))
    return outs

def report_text(rows):
    L = []
    for r in rows:
        L.append(f"{KIND_TXT[r['kind']]}\t{r['label']}\t{r['name']}\tsim={'' if r['sim'] is None else round(r['sim'], 2)}\t聽到：{r['heard']}\t應為：{r['expect']}\t{r['note']}")
    return "\n".join(L)

# ----------------------------- 視窗 -----------------------------
def run_gui(prj, init_terms):
    import tkinter as tk
    from tkinter import ttk, messagebox
    win = tk.Tk(); win.title("詳解音檔 對稿／孤兒 檢查"); win.geometry("1180x720")
    q = queue.Queue(); state = dict(rows=[], busy=False)
    top = ttk.Frame(win, padding=8); top.pack(fill="x")
    ttk.Label(top, text="要檢查的詳解（單字／片語／句子，一行一個或用逗號分隔；* ＝全部）").pack(anchor="w")
    box = tk.Text(top, height=3, font=("Consolas", 11)); box.pack(fill="x", pady=4); box.insert("1.0", "\n".join(init_terms))
    opt = ttk.Frame(top); opt.pack(fill="x")
    ttk.Label(opt, text="辨識模型").pack(side="left")
    mv = tk.StringVar(value=MODEL); ttk.Combobox(opt, textvariable=mv, values=["base.en", "small.en", "tiny.en"], width=9, state="readonly").pack(side="left", padx=4)
    wv = tk.BooleanVar(value=True); ttk.Checkbutton(opt, text="含共用單字庫 words/", variable=wv).pack(side="left", padx=8)
    okv = tk.BooleanVar(value=False); ttk.Checkbutton(opt, text="顯示正常的", variable=okv, command=lambda: fill()).pack(side="left", padx=8)
    scan_b = ttk.Button(opt, text="🔍 掃描", command=lambda: scan()); scan_b.pack(side="right")
    cols = ("chk", "kind", "label", "name", "sim", "heard", "expect")
    tree = ttk.Treeview(win, columns=cols, show="headings", selectmode="browse")
    for c, t, w in (("chk", "選", 36), ("kind", "類型", 90), ("label", "欄位／動作", 190), ("name", "檔名", 200), ("sim", "相似", 48), ("heard", "mp3 聽到的", 320), ("expect", "詳解上的文字", 320)):
        tree.heading(c, text=t); tree.column(c, width=w, anchor="w", stretch=(c in ("heard", "expect")))
    tree.pack(fill="both", expand=True, padx=8)
    det = tk.StringVar(); ttk.Label(win, textvariable=det, wraplength=1140, justify="left").pack(fill="x", padx=8, pady=2)
    bar = ttk.Frame(win, padding=8); bar.pack(fill="x")
    logb = tk.Text(win, height=7, font=("Consolas", 9)); logb.pack(fill="x", padx=8, pady=(0, 8))
    def log(m): q.put(("log", str(m)))
    def say(m): logb.insert("end", m + "\n"); logb.see("end")
    def fill():
        tree.delete(*tree.get_children())
        for i, r in enumerate(state["rows"]):
            if r["kind"] == "ok" and not okv.get(): continue
            tree.insert("", "end", iid=str(i), values=("☑" if r["checked"] else ("☐" if r["actionable"] else ""), KIND_TXT[r["kind"]], r["label"], r["name"],
                        "" if r["sim"] is None else f"{r['sim']:.2f}", r["heard"], r["expect"]))
        c = {}
        for r in state["rows"]: c[r["kind"]] = c.get(r["kind"], 0) + 1
        det.set("　".join(f"{KIND_TXT[k]} {c[k]}" for k in KIND_TXT if k in c) or "（沒有結果）")
    def on_click(ev):
        if tree.identify_region(ev.x, ev.y) != "cell": return
        iid = tree.identify_row(ev.y)
        if not iid: return
        r = state["rows"][int(iid)]
        if tree.identify_column(ev.x) == "#1" and r["actionable"]:
            r["checked"] = not r["checked"]; tree.set(iid, "chk", "☑" if r["checked"] else "☐")
    def on_sel(ev):
        s = tree.selection()
        if s:
            r = state["rows"][int(s[0])]
            det.set(f"{KIND_TXT[r['kind']]}｜{r['label']}｜{r['name']}\n聽到：{r['heard']}\n應為：{r['expect']}\n{r['note']}")
    def play():
        s = tree.selection()
        if not s: return
        r = state["rows"][int(s[0])]; p = r["src"] or r["dst"]
        if p and Path(p).exists():
            try:
                if sys.platform.startswith("win"): os.startfile(str(p))
                else: subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(p)])
            except Exception as ex: say(f"無法開啟：{ex}")
    tree.bind("<Button-1>", on_click, add="+"); tree.bind("<<TreeviewSelect>>", on_sel); tree.bind("<Double-1>", lambda e: play() if tree.identify_column(e.x) != "#1" else None)
    def worker(terms, model, inc):
        try:
            targets, miss = prj.find(terms)
            if miss: log("找不到這些詳解：" + "、".join(miss))
            if not targets: q.put(("done", [])); return
            log("檢查：" + "、".join(t["e"]["text"] for t in targets[:12]) + ("…" if len(targets) > 12 else ""))
            tr = Transcriber(prj.root, model, log)
            rows = analyze(prj, targets, tr, inc, log); tr.save()
            q.put(("done", rows))
        except Exception as ex:
            import traceback; log(traceback.format_exc()); q.put(("done", []))
    def scan():
        if state["busy"]: return
        raw = box.get("1.0", "end"); terms = [t.strip() for t in re.split(r"[\n,，;；]+", raw) if t.strip()]
        if not terms: messagebox.showinfo("提示", "請先輸入要檢查的詳解。"); return
        state["busy"] = True; scan_b.state(["disabled"]); say("—— 開始掃描 ——")
        threading.Thread(target=worker, args=(terms, mv.get(), wv.get()), daemon=True).start()
    def poll():
        try:
            while True:
                k, v = q.get_nowait()
                if k == "log": say(v)
                else:
                    state["rows"] = v; state["busy"] = False; scan_b.state(["!disabled"]); fill(); say("—— 掃描完成 ——")
        except queue.Empty: pass
        win.after(150, poll)
    def apply():
        n = sum(1 for r in state["rows"] if r["checked"] and r["actionable"])
        if not n: messagebox.showinfo("提示", "沒有勾選任何項目。"); return
        if not messagebox.askyesno("確認", f"要套用 {n} 個勾選的動作嗎？\n（可用「復原上一次」還原）"): return
        say(f"套用 {apply_rows(prj, state['rows'], say)} 個動作。重新掃描中…"); scan()
    def to_ai():
        outs = export_for_ai(prj, state["rows"], say)
        if not outs: messagebox.showinfo("提示", "目前沒有勾選的孤兒／不符檔案可交給 AI（請先在表格勾選）。"); return
        win.clipboard_clear(); win.clipboard_append(outs[0].read_text(encoding="utf-8"))
        messagebox.showinfo("完成", f"已產生 {len(outs)} 份提示詞（在 {POOL_DIR}/）。\n第一份已複製到剪貼簿，直接貼給 AI。\n\n拿到 w?d?_extra.json 後用 json_merge.py 合併，再回來掃描一次。")
    def export():
        p = prj.root / "audio_check_report.txt"; p.write_text(report_text(state["rows"]), encoding="utf-8"); say(f"已匯出 {p.name}")
    def undo():
        if messagebox.askyesno("復原", "復原上一次套用的動作？"): undo_last(prj, say); scan()
    # ---------------- 📂 孤兒池管理視窗 ----------------
    holder = {}
    def get_tr():
        if holder.get("m") != mv.get(): holder["t"] = Transcriber(prj.root, mv.get(), log); holder["m"] = mv.get()
        return holder["t"]
    def bg(fn, done):
        res = {}
        def w():
            try: res["v"] = fn()
            except Exception as ex:
                import traceback; res["e"] = traceback.format_exc()
        th = threading.Thread(target=w, daemon=True); th.start()
        def chk():
            if th.is_alive(): win.after(200, chk)
            else: done(res)
        chk()
    def open_pool():
        from tkinter import simpledialog
        pw = tk.Toplevel(win); pw.title("孤兒池總表（orphan_pool/）"); pw.geometry("1100x600")
        ttk.Label(pw, text="這裡列出孤兒池裡所有 mp3 與它念的文字。改檔名、改文字都會自動更新「孤兒總表.txt／.csv」。　雙擊＝試聽", padding=6).pack(anchor="w")
        pc = ("name", "text", "entry", "was", "why", "date")
        pt = ttk.Treeview(pw, columns=pc, show="headings", selectmode="extended")
        for c, t, w in (("name", "檔名", 210), ("text", "文字（mp3 念的）", 430), ("entry", "來源詳解", 90), ("was", "原用途", 110), ("why", "原因", 130), ("date", "日期", 110)):
            pt.heading(c, text=t); pt.column(c, width=w, anchor="w", stretch=(c == "text"))
        pt.pack(fill="both", expand=True, padx=8)
        pst = tk.StringVar(); ttk.Label(pw, textvariable=pst, padding=6).pack(anchor="w")
        def load(msg=None):
            idx = prj.pool_index(); pt.delete(*pt.get_children())
            for n in sorted(idx, key=natkey):
                r = idx[n]
                pt.insert("", "end", iid=n, values=(n, r.get("text", "") + ("　✎" if r.get("edited") else ""), r.get("entry", ""), r.get("was", ""), WHY_TXT.get(r.get("why"), ""), r.get("date", "")))
            pst.set(msg or f"共 {len(idx)} 個孤兒檔")
        def sel1():
            s_ = pt.selection()
            if len(s_) != 1: messagebox.showinfo("提示", "請先選一個檔案。", parent=pw); return None
            return s_[0]
        def sync():
            pst.set("同步中…（有新檔時會聽寫，請稍候）")
            def done(res):
                if "e" in res: say(res["e"]); pst.set("同步失敗，詳見主視窗記錄")
                else: get_tr().save(); load("同步完成")
            bg(lambda: prj.pool_sync(get_tr(), log), done)
        def rename():
            n = sel1()
            if not n: return
            new = simpledialog.askstring("改檔名", f"{n}\n新的檔名（.mp3 可省略）：", initialvalue=n, parent=pw)
            if not new or new.strip() == n: return
            new = new.strip()
            if not new.lower().endswith(".mp3"): new += ".mp3"
            if re.search(r'[\\/:*?"<>|]', new): messagebox.showerror("檔名不合法", "不能含 \\ / : * ? \" < > |", parent=pw); return
            if (prj.pool / new).exists(): messagebox.showerror("檔名重複", f"{new} 已經存在。", parent=pw); return
            prj.pool_rename(n, new); load(f"已改名 {n} → {new}，總表已更新")
        def edit_text():
            n = sel1()
            if not n: return
            cur = prj.pool_index().get(n, {}).get("text", "")
            new = simpledialog.askstring("改文字", f"{n}\n這個 mp3 實際念的英文（辨識錯了就在這裡修正）：", initialvalue=cur, parent=pw)
            if new is None or new.strip() == cur: return
            prj.pool_set_text(n, new.strip()); load(f"已更新 {n} 的文字，總表已更新")
        def retr():
            names = list(pt.selection())
            if not names: messagebox.showinfo("提示", "請先選取要重新辨識的檔案（可多選）。", parent=pw); return
            pst.set(f"用 {mv.get()} 重新辨識 {len(names)} 個檔…")
            def job():
                tr = get_tr(); idx = prj.pool_index()
                for n in names:
                    if n in idx and (prj.pool / n).exists(): idx[n]["text"] = tr(prj.pool / n); idx[n].pop("edited", None)
                prj.pool_save(idx); tr.save()
            bg(job, lambda res: (say(res["e"]) if "e" in res else None, load("重新辨識完成")))
        def play_p():
            n = sel1()
            if not n: return
            f = prj.pool / n
            try:
                if sys.platform.startswith("win"): os.startfile(str(f))
                else: subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(f)])
            except Exception as ex: say(f"無法開啟：{ex}")
        def to_ai_pool():
            names = list(pt.selection())
            if not names: messagebox.showinfo("提示", "請先選取要交給 AI 的孤兒檔（可多選，Ctrl／Shift）。", parent=pw); return
            outs = export_pool_for_ai(prj, names, say)
            if not outs: messagebox.showinfo("提示", "選到的檔案沒有「來源詳解」，無法產生提示詞。", parent=pw); return
            win.clipboard_clear(); win.clipboard_append(outs[0].read_text(encoding="utf-8"))
            messagebox.showinfo("完成", f"已產生 {len(outs)} 份提示詞（在 {POOL_DIR}/），第一份已複製到剪貼簿，直接貼給 AI。", parent=pw)
        def open_sum():
            f = prj.pool / "孤兒總表.txt"
            if not f.exists(): prj.pool_save(prj.pool_index())
            try:
                if sys.platform.startswith("win"): os.startfile(str(f))
                else: subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(f)])
            except Exception as ex: say(f"無法開啟：{ex}")
        pt.bind("<Double-1>", lambda e: play_p())
        pb = ttk.Frame(pw, padding=8); pb.pack(fill="x")
        for t, c in (("🔄 同步資料夾", sync), ("✏ 改檔名", rename), ("📝 改文字", edit_text), ("🔁 重新辨識選取", retr), ("🔊 試聽", play_p),
                     ("👻 選取 → AI 維護", to_ai_pool), ("📄 開啟總表.txt", open_sum)):
            ttk.Button(pb, text=t, command=c).pack(side="left", padx=4)
        load(); pw.after(200, lambda: bg(lambda: prj.pool_sync(None, log), lambda res: load()))   # 先靜默對齊（不聽寫）
    for t, c in (("▶ 套用勾選的項目", apply), ("🔊 試聽選取", play), ("👻 孤兒 → AI 維護", to_ai), ("復原上一次", undo), ("📂 孤兒池", open_pool), ("匯出報告", export),
                 ("重建 index.json", lambda: prj.write_manifest(say))):
        ttk.Button(bar, text=t, command=c).pack(side="left", padx=4)
    win.after(150, poll)
    if init_terms: win.after(300, scan)
    win.mainloop()

def find_root():
    here = Path(__file__).resolve().parent
    for c in (here, here.parent, Path.cwd()):
        if (c / "daily.json").exists(): return c
    try:
        import tkinter as tk
        from tkinter import filedialog
        r = tk.Tk(); r.withdraw()
        f = filedialog.askopenfilename(title="找不到 daily.json，請選擇它", filetypes=[("daily.json", "*.json")])
        r.destroy()
        if f: return Path(f).parent
    except Exception: pass
    return None

def main():
    root = find_root()
    if not root:
        print("找不到 daily.json。請把這支程式放在 daily.json 同一層。"); input("按 Enter 結束"); return
    prj = Project(root)
    print(f"專案：{root}（共 {len(prj.entries)} 筆詳解）")
    run_gui(prj, [a for a in sys.argv[1:] if not a.startswith("-")])

if __name__ == "__main__":
    main()
