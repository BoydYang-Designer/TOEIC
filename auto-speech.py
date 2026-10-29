#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
auto-speech.py  ——  補錄音檔（Part 1～Part 7、Daily 共用）：勾選要補錄的項目，產生缺少的 mp3

用法：把這支檔案放在「有 part1.json…part7.json、daily.json 的資料夾」（或 audio 資料夾裡），直接雙擊執行。
  ・雙擊：先跳出「選擇題庫」視窗（會顯示各題庫還缺幾個檔），選一個進入
  ・指定題庫：python auto-speech.py part3        （也可寫 3、p3、photo、daily）
  ・json_merge.py 合併完成後，會自動用這個方式啟動對應的題庫

  1. 讀題庫 json，檢查 audio/ 底下對應的 mp3 是否存在（存在且大於 1000 bytes 才算有）
  2. 視窗列出有缺的項目，勾選這次要做的（可一次勾前 N 題、依前綴勾 d1 / d2-001、依難度勾 -e / -m / -h）
  3. 按「開始產生」，用 Azure Speech（REST + SSML）錄製並存到正確位置
  4. 做完清單會自動更新，下次再勾下一批；全部做完可執行 Scan總表與音檔.py 更新 index.json

各題庫的檔名規則（必須和網頁與 Scan總表與音檔.py 一致，所以只在 CFG／各 plan_* 函式裡維護一份）：
  part1  audio/p1/{id}-sNN.mp3（pool 順序）＋ audio/A.mp3…E.mp3
  part2  audio/p2/{id}-q.mp3、{id}-sNN.mp3 ＋ audio/A.mp3…E.mp3
  part3  audio/p3/{id}-sNN.mp3（每句對話一檔）
  part4  audio/p4/{id}.mp3（整段獨白一檔）
  part5  audio/p5/{id}.mp3（朗讀答案填入的完整句）
  part6  audio/p6/{id}.mp3（朗讀答案填入的整篇）
  part7  audio/p7/{id}-d{k}.mp3（每份需朗讀的文件一檔）
  daily  audio/daily/w1d1.mp3 ＋ audio/daily/vocab/（詳解項目；做完會重建 vocab/index.json）
         詳解項目的檔名（不含文章 id，詳解搬到別篇或文章被刪都不會變孤兒；舊的 {文章id}-… 檔名請先用 migrate_vocab_names.py 轉換）：
          ‧ 跟著單字：{單字slug}{後綴}.mp3；‧ 跟著句子內容：入庫的整句與「所在句」＝{句子slug}.mp3（無後綴，同一句只錄一次）
          詳解項目的檔名後綴：（無）整句或所在句、_e 例句、_cp／_c 搭配與其例句、_f 屈折變化的字、_fx 屈折變化的例句、_m／_mx 相關字與例句、_cf 易混淆例句（易混淆的字本身走共用庫 words/）、
         _sm／_sx 近義片語與例句、_en 英文解說、_pr 句子的同義改寫、_kw 句中值得注意的字、_d 衍生字、_pw／_p 多詞性的單字與例句、_sw／_s 多義的單字與例句
         ※ 單字類（單字本身、原形、屈折變化、同字族、相關字、搭配片語、多詞性／多義的單字）改放共用庫
           audio/daily/words/{單字}.mp3，同一個字只錄一次；例句與句子放 vocab/（檔名不含文章 id）

聲音：美式四個（Ava／Andrew／Emma／Brian）和字母、詳解用 Azure DragonHD（HD）聲音；英式、澳式維持標準 Neural（TOEIC 聽力有多種口音）。
  ※ HD 聲音不支援 <prosody>，所以 HD 聲音不套用語速設定（rate／VOCAB_RATE／PASSAGE_RATE 只對標準聲音有效）。
  ※ HD 每百萬字元價格約為標準的兩倍，估算費用已分開計算（PRICE_HD_USD_PER_M_CHARS）。
  ※ 換聲音後想把舊檔換成新聲音：加 --redo（聲音不同的檔）或 --redo-all（連沒有紀錄的舊檔）。edge-tts 不支援 HD 名稱。

引擎切換：預設用 DEFAULT_ENGINE；命令列加 --azure 或 --edge 可臨時改；視窗模式的「引擎」下拉選單也能切換。
  azure＝Azure Speech（動用 $200 點數）；edge-tts＝微軟 Edge 免費語音（2026-10-10 起因微軟改版常回 403，修好前請用 azure）。
  --usage 顯示 Azure 點數到期日與本腳本累計用量（記在 azure-usage.json，只是估算，實際以入口網站為準）。

Azure 設定：金鑰與區域只從 Windows 環境變數讀取（絕不寫進程式或專案資料夾）：
  setx SPEECH_KEY "你的金鑰"      setx SPEECH_REGION "eastasia"（小寫、無空格），設定後重開終端機／重新登入
  python auto-speech.py --check-azure   檢查金鑰、區域、8 個聲音是否可用（只合成 5 個字元）

參數：--cli 強制使用文字模式（沒有 tkinter 時會自動使用）；--dry 只列清單不產生；--manifest 只重建 daily 的 vocab/index.json。

版本紀錄：每個產生成功的 mp3 會記到 voices-log.json（放在題庫 json 同一層：聲音、語速、引擎、日期）。
  --redo      除了缺檔，也把「紀錄的聲音／語速和目前設定不同」的檔列入重錄
  --redo-all  再加上「沒有紀錄的舊檔」（這支程式加入紀錄功能之前做的檔）
  視窗模式裡也有「重錄範圍」下拉選單；列表中 ↻ 代表重錄（檔案已存在，會被新版覆蓋）。
"""
import asyncio
import importlib
import json
import os
import queue
import random
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import zlib
from xml.sax.saxutils import escape as xml_escape
from datetime import datetime
from pathlib import Path

# ============================== 設定區（只要改這裡）==============================
CONCURRENCY = 4               # 同時產生幾個檔案（S0 可放心；若資源是 F0 免費層，請改 1～2，並留意 429 限流）
# 順序必須「女、男、女、男…」交替（偶數位＝女聲、奇數位＝男聲）
VOICES = [
    "en-US-Ava:DragonHDLatestNeural",      # 女（美）HD
    "en-US-Andrew:DragonHDLatestNeural",   # 男（美）HD
    "en-US-Emma:DragonHDLatestNeural",     # 女（美）HD
    "en-US-Brian:DragonHDLatestNeural",    # 男（美）HD
    "en-GB-SoniaNeural",                # 女（英）
    "en-GB-RyanNeural",                 # 男（英）
    "en-AU-NatashaNeural",              # 女（澳）
    "en-AU-WilliamNeural",              # 男（澳）
]
LETTER_VOICE = "en-US-Ava:DragonHDLatestNeural"
LETTERS = "ABCDE"             # 選項字母檔：audio/A.mp3 ~ audio/E.mp3（缺才補；Part 1／2 共用）
MAKE_LETTERS = True
DEFAULT_ENGINE = "azure"      # 預設引擎："azure"（用點數）或 "edge-tts"（免費，目前常 403）
AZURE_CREDIT_USD = 200.0      # 免費帳戶點數總額
AZURE_CREDIT_END = "2026-11-09"   # 點數到期日 "YYYY-MM-DD"（入口網站：成本管理 + 帳單 → 點數 可查；通常是註冊日 + 30 天）
USAGE_NAME = "azure-usage.json"   # 本腳本累計的 Azure 字元用量（放在題庫 json 同一層，不含金鑰）
ENGINE = DEFAULT_ENGINE       # 版本紀錄用：換引擎時改這個名字，舊檔就會被視為「舊版」可重錄（edge-tts 舊檔用 --redo 可重錄）
AZURE_FORMAT = "audio-24khz-48kbitrate-mono-mp3"   # 輸出格式（和原本 edge-tts 的 24kHz/48kbps 相同）
AZURE_RETRIES = 5             # 每個檔最多嘗試幾次（429／5xx／網路錯誤才重試）
PAUSE_MS = 300                # Part 7 多人聊天：不同人說話之間停幾毫秒
PRICE_USD_PER_M_CHARS = 15.0  # 只用來「估算」費用（標準 Neural 每百萬字元）；請對照 Azure 定價頁自行修改
PRICE_HD_USD_PER_M_CHARS = 30.0   # HD（DragonHD）聲音每百萬字元的估算價（第三方資料，請對照 Azure 定價頁自行修改）
HD_MARK = ":DragonHD"         # 聲音名稱含這串就視為 HD 聲音
HD_FALLBACK = True         # HD 聲音被拒絕（例如這個區域沒有 HD）時，自動改用同名的 Multilingual 標準聲音，不讓整批失敗
HD_PARAMS = "temperature=0.7" # HD 聲音的隨機度（0～1，越低越穩定、每次念法越一致；預設 1.0）。設成 "" 就不加
LOG_NAME = "voices-log.json"  # 版本紀錄檔（和題庫 json 放同一層）：記每個 mp3 用過的聲音／語速／日期

# 各題庫：file＝題庫 json；sub＝audio 底下的資料夾；rate＝語速（"-10%" 更慢、"+0%" 正常）；
#        timeout＝單一檔案最久等幾秒（None＝不限）；secs＝每個檔約幾秒（只用來估算時間）
CFG = {
    "part1": dict(file="part1.json", sub="p1", rate="-5%", timeout=30, secs=1.5, name="{id}-s{n:02d}.mp3"),
    "part2": dict(file="part2.json", sub="p2", rate="-5%", timeout=30, secs=1.5,
                  name_q="{id}-q.mp3", name="{id}-s{n:02d}.mp3"),
    "part3": dict(file="part3.json", sub="p3", rate="+0%", timeout=30, secs=1.5, name="{id}-s{n:02d}.mp3"),
    "part4": dict(file="part4.json", sub="p4", rate="+0%", timeout=90, secs=8, name="{id}.mp3"),
    "part5": dict(file="part5.json", sub="p5", rate="+0%", timeout=30, secs=1.5, name="{id}.mp3", blank="_____"),
    "part6": dict(file="part6.json", sub="p6", rate="+0%", timeout=90, secs=6, name="{id}.mp3"),
    "part7": dict(file="part7.json", sub="p7", rate="+0%", timeout=90, secs=6, name="{key}.mp3",
                  noaud=("form", "invoice", "schedule", "table")),   # noaud：這些類型不朗讀（與 part7.js 相同）
    "daily": dict(file="daily.json", sub="daily", rate=None, timeout=None, secs=1.5),
}

# Daily 專用
MAKE_PASSAGE = True           # 文章整篇 audio/daily/{id}.mp3
MAKE_VOCAB = True             # 詳解項目本身（單字／片語／句子）
MAKE_CTX = True               # 含該字的那一句
MAKE_EXAMPLES = True          # 詳解頁的例句
MAKE_COLLOC = True            # 常用搭配的片語與例句（collocations[].phrase／example）
MAKE_FORMS = True             # 屈折變化的字（forms[].w，共用庫）＋ 它的例句（forms[].example.en）_fx{k}.mp3（逐篇存放）
MAKE_FAMILY = True            # 相關字（family[].w）與它的例句
MAKE_DERIVED = True           # 衍生字（derived[].w）
MAKE_CONFUSABLE = True        # 易混淆的例句（confusable[].example.en）_cf{k}.mp3
MAKE_SIMILAR = True           # 近義片語（similar）：片語／單字本身發音（共用庫）＋ 例句 _sx{k}.mp3
MAKE_EN = True                # 英文解說（en）整句 _en.mp3（逐篇存放）
MAKE_PARA = True              # 句子的同義改寫（paraphrase[].en）_pr{k}.mp3（逐篇存放）
MAKE_KEYWORDS = True          # 句子詳解的「句中值得注意的字」（key_words[].w），走共用庫
MAKE_POS = True               # 多詞性（pos_uses）：每個詞性的單字發音 _pw{k}.mp3 ＋ 例句 _p{k}.mp3
MAKE_PHRASES = True           # 簡報常用句型（presentation_phrases[].phrase）整句 {句型slug}.mp3（放 vocab/，與網頁 speakPhrase 一致；省略號不念）
MAKE_SENSE = True             # 多義（senses）：每個意思的單字發音 _sw{k}.mp3 ＋ 例句 _s{k}.mp3
PASSAGE_RATE = "-5%"          # 文章語速
VOCAB_RATE = "-10%"           # 單字／句子語速（單字慢一點比較聽得清楚）
PASSAGE_VOICES = VOICES       # 文章：依 id 固定挑一個聲音
VOCAB_VOICE = "en-US-Ava:DragonHDLatestNeural"   # 詳解項目固定同一個聲音
# ================================================================================

HERE = Path(__file__).resolve().parent
VOCAB_SUB = Path("audio") / "daily" / "vocab"
WORDS_SUB = Path("audio") / "daily" / "words"   # 共用單字發音庫：{單字}.mp3，同一個字只錄一次（單字類；例句與句子在 vocab/，檔名不含文章 id）


# ------------------------------- 共用小工具 -------------------------------
def ok_file(p: Path) -> bool:
    return p.exists() and p.stat().st_size > 1000


# ------------------------------- 版本紀錄（voices-log.json） -------------------------------
# STATE["redo"]：0＝只補缺的檔；1＝再加上「紀錄的聲音／語速／引擎和目前設定不同」的檔；2＝再加上「沒有紀錄的舊檔」
STATE = dict(root=None, log={}, redo=0, dirty=0)


def log_path(root) -> Path:
    return Path(root) / LOG_NAME


def begin(root):
    """讀取版本紀錄（每個 plan_* 開頭呼叫）。"""
    root = Path(root)
    STATE["root"] = root
    try:
        j = json.loads(log_path(root).read_text(encoding="utf-8-sig"))
        STATE["log"] = j.get("files") or {} if isinstance(j, dict) else {}
    except (OSError, ValueError):
        STATE["log"] = {}
    STATE["dirty"] = 0


def rel_key(path):
    try:
        return Path(path).relative_to(STATE["root"]).as_posix()
    except (ValueError, TypeError):
        return Path(path).as_posix()


def need(path, sig, rate):
    """回傳 None＝不用做；"new"＝缺檔；"redo"＝檔案在，但版本和目前設定不同（依 STATE["redo"] 決定要不要列入）。
    sig＝聲音（Part 7 多人聊天為各段聲音用 | 相連）。"""
    if not ok_file(path):
        return "new"
    if STATE["redo"] <= 0:
        return None
    rec = STATE["log"].get(rel_key(path))
    if rec is None:
        return "redo" if STATE["redo"] >= 2 else None
    same = rec.get("engine") == ENGINE and rec.get("voice") == sig and (rec.get("rate") or "") == (rate or "")
    return None if same else "redo"


def record(path, sig, rate):
    STATE["log"][rel_key(path)] = dict(voice=sig, rate=rate or "", engine=ENGINE,
                                       date=datetime.now().strftime("%Y-%m-%d %H:%M"))
    STATE["dirty"] += 1


def save_log(root=None):
    root = Path(root or STATE["root"])
    tmp = root / (LOG_NAME + ".tmp")
    data = dict(v=1, files=dict(sorted(STATE["log"].items())))
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(log_path(root))
    STATE["dirty"] = 0


def is_hd(v):
    return HD_MARK in v


def short(v):
    if is_hd(v):
        return v.split("-")[-1].split(":")[0] + " HD"
    return v.split("-")[-1].replace("Neural", "")


def match_key(key, p):
    """前綴比對（d1 / d2-001）；以 - 開頭則比對結尾（-e / -m / -h 依難度）。"""
    key, p = key.lower(), p.lower()
    return key.endswith(p) if p.startswith("-") else key.startswith(p)


def load_items(root: Path, fname):
    data = json.loads((root / fname).read_text(encoding="utf-8-sig"))
    return data["items"] if isinstance(data, dict) else data


def gender_voice(iid, g):
    """依性別（F／M）挑女聲／男聲，同一個 id 固定同一個。"""
    pool = VOICES[1::2] if g == "M" else VOICES[0::2]
    return pool[zlib.crc32(iid.encode("utf-8")) % len(pool)]


def letters_group(audio: Path, rate):
    if not MAKE_LETTERS:
        return None
    jobs = []
    for ch in LETTERS:
        path = audio / f"{ch}.mp3"
        r = need(path, LETTER_VOICE, rate)
        if r:
            jobs.append(dict(item="letters", name=f"{ch}.mp3", text=f"{ch}.", voice=LETTER_VOICE, rate=rate,
                             path=path, redo=(r == "redo")))
    if jobs:
        return dict(key="letters", total=len(LETTERS), voice=LETTER_VOICE, jobs=jobs)
    return None


def clip(text, n=70):
    return text if len(text) <= n else text[:n] + "…"


# =============================== Part 1：照片描述 ===============================
def plan_part1(root: Path):
    """一題的 pool 句子用同一個聲音（依題目 id 固定挑一個），模擬 TOEIC 多種口音。"""
    C = CFG["part1"]
    begin(root)
    items = load_items(root, C["file"])
    audio = root / "audio"
    groups = []
    for it in items:
        if it.get("skip") or not it.get("pool"):
            continue
        iid = it["id"]
        voice = VOICES[zlib.crc32(iid.encode("utf-8")) % len(VOICES)]
        jobs = []
        for i, p in enumerate(it["pool"], 1):
            name = C["name"].format(id=iid, n=i)
            path = audio / C["sub"] / name
            r = need(path, voice, C["rate"])
            if r:
                jobs.append(dict(item=iid, name=name, text=p["t"], voice=voice, path=path, redo=(r == "redo")))
        if jobs:
            groups.append(dict(key=iid, total=len(it["pool"]), voice=voice, jobs=jobs))
    g = letters_group(audio, C["rate"])
    if g:
        groups.append(g)
    return groups


# =============================== Part 2：應答問題 ===============================
def pick_voices_p2(iid):
    """回傳 (問句聲音, 回答聲音)：性別相反，依題目 id 固定。"""
    h = zlib.crc32(iid.encode("utf-8"))
    qi = h % len(VOICES)
    others = [i for i in range(len(VOICES)) if i % 2 != qi % 2]
    return VOICES[qi], VOICES[others[(h >> 8) % len(others)]]


def plan_part2(root: Path):
    C = CFG["part2"]
    begin(root)
    items = load_items(root, C["file"])
    audio = root / "audio"
    groups = []
    for it in items:
        if it.get("skip") or not it.get("pool") or not (it.get("q") or {}).get("t"):
            continue
        iid = it["id"]
        qv, av = pick_voices_p2(iid)
        jobs = []
        name = C["name_q"].format(id=iid)
        path = audio / C["sub"] / name
        r = need(path, qv, C["rate"])
        if r:
            jobs.append(dict(item=iid, name=name, text=it["q"]["t"], voice=qv, path=path, redo=(r == "redo")))
        for i, p in enumerate(it["pool"], 1):
            name = C["name"].format(id=iid, n=i)
            path = audio / C["sub"] / name
            r = need(path, av, C["rate"])
            if r:
                jobs.append(dict(item=iid, name=name, text=p["t"], voice=av, path=path, redo=(r == "redo")))
        if jobs:
            groups.append(dict(key=iid, total=len(it["pool"]) + 1, voice=f"問 {short(qv)} / 答 {short(av)}", jobs=jobs))
    g = letters_group(audio, C["rate"])
    if g:
        groups.append(g)
    return groups


# =============================== Part 3：簡短對話 ===============================
def pick_voices_p3(it):
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


def plan_part3(root: Path):
    C = CFG["part3"]
    begin(root)
    items = load_items(root, C["file"])
    audio = root / "audio"
    groups = []
    for it in items:
        if not isinstance(it, dict) or it.get("skip") or not it.get("id") or not it.get("dialogue"):
            continue
        iid = it["id"]
        vmap = pick_voices_p3(it)
        fallback = VOICES[0]
        jobs = []
        for i, line in enumerate(it["dialogue"], 1):
            name = C["name"].format(id=iid, n=i)
            path = audio / C["sub"] / name
            v = vmap.get(line.get("sp"), fallback)
            r = need(path, v, C["rate"])
            if r:
                jobs.append(dict(item=iid, name=name, text=line["t"], voice=v,
                                 path=path, sp=line.get("sp", "?"), redo=(r == "redo")))
        if jobs:
            vtxt = " / ".join(f"{sp} {short(v)}" for sp, v in vmap.items())
            groups.append(dict(key=iid, total=len(it["dialogue"]), voice=vtxt, jobs=jobs))
    return groups


# =============================== Part 4：簡短獨白 ===============================
def say_text_p4(it):
    """整段獨白：每句英文以空白相連（與 part4.js 的複製錄音稿相同）。"""
    return " ".join(l["t"].strip() for l in it["script"] if l.get("t"))


def plan_part4(root: Path):
    C = CFG["part4"]
    begin(root)
    items = load_items(root, C["file"])
    audio = root / "audio"
    groups = []
    for it in items:
        if (not isinstance(it, dict) or it.get("skip") or not it.get("id")
                or not isinstance(it.get("script"), list) or not it["script"]):
            continue
        iid = it["id"]
        sp = (it.get("speakers") or [{}])[0]          # 依 speakers[0].gender（F／M）選女聲／男聲
        g = "M" if sp.get("gender") == "M" else "F"
        v = gender_voice(iid, g)
        name = C["name"].format(id=iid)
        path = audio / C["sub"] / name
        r = need(path, v, C["rate"])
        if r:
            text = say_text_p4(it)
            job = dict(item=iid, name=name, text=text, voice=v, path=path, sp=g, redo=(r == "redo"))
            groups.append(dict(key=iid, total=1, voice=f"{g} {short(v)}", jobs=[job],
                               sample=f"（{len(it['script'])} 句，{len(text)} 字）{clip(text)}"))
    return groups


# =============================== Part 5：句子填空 ===============================
def say_text_p5(it):
    """與 part5.js 的 sayText 一致：有 say 念 say，否則念答案填入的完整句。"""
    if it.get("say"):
        return it["say"]
    return it["sentence"]["t"].replace(CFG["part5"]["blank"], it["answer"]["t"])


def plan_part5(root: Path):
    C = CFG["part5"]
    BLANK = C["blank"]
    begin(root)
    items = load_items(root, C["file"])
    audio = root / "audio"
    groups = []
    for it in items:
        if (not isinstance(it, dict) or it.get("skip") or not it.get("id")
                or not isinstance(it.get("sentence"), dict) or not (it.get("answer") or {}).get("t")
                or str(it["sentence"].get("t", "")).count(BLANK) != 1):
            continue
        iid = it["id"]
        g = "M" if it.get("voice") == "M" else "F"     # 依題目 voice 欄位（F／M）
        v = gender_voice(iid, g)
        name = C["name"].format(id=iid)
        path = audio / C["sub"] / name
        r = need(path, v, C["rate"])
        if r:
            job = dict(item=iid, name=name, text=say_text_p5(it), voice=v, path=path, sp=g, redo=(r == "redo"))
            groups.append(dict(key=iid, total=1, voice=f"{g} {short(v)}", jobs=[job]))
    return groups


# =============================== Part 6：段落填空 ===============================
def say_text_p6(it):
    """與 part6.js 的 sayText 一致：有 say 念 say，否則念標頭＋各段落（空格填入正解）。"""
    if it.get("say"):
        return str(it["say"])
    ans = {q.get("n"): (q.get("answer") or {}).get("t", "") for q in it.get("questions") or []}
    head = [h for h in (it.get("head") or []) if h]
    parts = [". ".join(head) + "."] if head else []
    parts += [re.sub(r"\[\[(\d)\]\]", lambda m: ans.get(int(m.group(1)), ""), p) for p in it["body"] if isinstance(p, str)]
    return " ".join(parts)


def plan_part6(root: Path):
    C = CFG["part6"]
    begin(root)
    items = load_items(root, C["file"])
    audio = root / "audio"
    groups = []
    for it in items:
        if not isinstance(it, dict) or it.get("skip") or not it.get("id") or not isinstance(it.get("body"), list) or not it["body"]:
            continue
        iid = it["id"]
        g = "M" if it.get("voice") == "M" else "F"     # 依文章 voice 欄位（F／M）
        v = gender_voice(iid, g)
        name = C["name"].format(id=iid)
        path = audio / C["sub"] / name
        r = need(path, v, C["rate"])
        if r:
            text = say_text_p6(it)
            job = dict(item=iid, name=name, text=text, voice=v, path=path, sp=g, redo=(r == "redo"))
            groups.append(dict(key=iid, total=1, voice=f"{g} {short(v)}", jobs=[job],
                               sample=f"（{len(text.split())} 字）{clip(text)}"))
    return groups


# =============================== Part 7：閱讀理解 ===============================
def strip_marks(t):
    """插入題的 [1]–[4] 標記不念（與 part7.js 的 strip 相同）。"""
    return re.sub(r"\s+", " ", re.sub(r"\s*\[[1-4]\]\s*", " ", str(t))).strip()


def voice_of(gender, key, used=0):
    """依性別（F／M）與 key 固定挑一個聲音；used＝同性別已用過幾個（讓同性別的人聲音不同）。"""
    pool = VOICES[1::2] if gender == "M" else VOICES[0::2]
    h = zlib.crc32(key.encode("utf-8"))
    return pool[((h >> 8 if gender == "M" else h) + used) % len(pool)]


def punct(t):
    """片段結尾若不是標點就補句點，串在一起時才會有停頓。"""
    return t if not t or t[-1] in ".,!?:;)\"'" else t + "."


def doc_parts(d, key):
    """回傳 ([(文字, 聲音), ...], 聲音說明)。chat 每則訊息一段，其餘整份一段。"""
    g = "M" if d.get("voice") == "M" else "F"
    if d.get("say") and d.get("kind") != "chat":
        v = voice_of(g, key)
        return [(strip_marks(d["say"]), v)], f"{g} {short(v)}"
    if d.get("kind") == "chat":
        vmap, used, desc = {}, {"F": 0, "M": 0}, []
        for who, gen in (d.get("speakers") or {}).items():
            gg = "M" if gen == "M" else "F"
            vmap[who] = voice_of(gg, key, used[gg])
            used[gg] += 1
            desc.append(f"{who.split()[0]} {short(vmap[who])}")
        dv = voice_of(g, key)
        parts = [(m["t"].strip(), vmap.get(m.get("who"), dv)) for m in d.get("messages") or [] if m.get("t")]
        return parts, " / ".join(desc)
    v = voice_of(g, key)
    lines = [punct(strip_marks(t)) for t in (d.get("head") or []) + (d.get("body") or []) if isinstance(t, str)]
    return [(" ".join(x for x in lines if x), v)], f"{g} {short(v)}"


def plan_part7(root: Path):
    C = CFG["part7"]
    begin(root)
    items = load_items(root, C["file"])
    audio = root / "audio"
    groups = []
    for it in items:
        if not isinstance(it, dict) or it.get("skip") or not it.get("id") or not isinstance(it.get("docs"), list):
            continue
        iid = it["id"]
        jobs, total, vdesc = [], 0, []
        for k, d in enumerate(it["docs"], 1):
            if not isinstance(d, dict) or d.get("read") is False or d.get("kind") in C["noaud"]:
                continue
            total += 1
            key = f"{iid}-d{k}"
            name = C["name"].format(key=key)
            path = audio / C["sub"] / name
            parts, vd = doc_parts(d, key)
            if not parts or not any(t for t, _ in parts):
                continue
            r = need(path, "|".join(v for _, v in parts), C["rate"])
            if not r:
                continue
            text = " ".join(t for t, _ in parts)
            jobs.append(dict(item=iid, name=name, text=text, voice=parts[0][1], parts=parts, path=path,
                             sp=d.get("kind", ""), redo=(r == "redo")))
            vdesc.append(f"d{k} {vd}")
        if jobs:
            groups.append(dict(key=iid, total=total, voice=" | ".join(vdesc), jobs=jobs,
                               sample=f"[{jobs[0]['sp']}] {clip(jobs[0]['text'])}"))
    return groups


# =============================== Daily：每日文章＋詳解 ===============================
def norm(s):
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def fnv6(s):
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"[:6]


def slug(text):
    """檔名規則：必須與網頁 notes.js 的 dnSlug 完全一致，不要改。"""
    k = norm(text)
    s = re.sub(r"[^a-z0-9]+", "-", k).strip("-")
    if s and len(s) <= 40:
        return s
    return s[:40].rstrip("-") + ("-" if s else "") + fnv6(k)


# 切句（與 speak.js 的 splitSent 相同）
ABBR = re.compile(r"\b(Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|Co|Corp|St|No|vs|etc)\.$")
SENT_END = re.compile(r"[.!?]+[\"')\]]*\s+(?=[\"'(\[]?[A-Z0-9])")


def split_sent(p):
    out = []
    for m in re.finditer(r"[^\n]+", p):
        line, base = m.group(0), m.start()

        def push(s, e):
            while s < e and line[s].isspace():
                s += 1
            while e > s and line[e - 1].isspace():
                e -= 1
            if e > s:
                out.append((base + s, base + e))

        st = 0
        for k in SENT_END.finditer(line):
            if ABBR.search(line[st:k.start() + 1]):
                continue
            push(st, k.end())
            st = k.end()
        push(st, len(line))
    return out


def sentence_of(passage, text):
    i = passage.lower().find(str(text).lower())
    if i < 0:
        return None
    for a, b in split_sent(passage):
        if a <= i < b:
            return passage[a:b].strip()
    return None


def speak_text(t):
    return re.sub(r"\.{2,}|…", " ", str(t)).strip()


def art_id(x):
    """文章 id，與網頁 / json_merge.did() 一致：day>=8 是 D8 專案 → w1d8-1、w1d8-2…；其他天 w1d3。"""
    w, d = int(x["week"]), int(x["day"])
    return f"w{w}d8-{d - 7}" if d >= 8 else f"w{w}d{d}"


def load_daily_items(root):
    data = json.loads((root / CFG["daily"]["file"]).read_text(encoding="utf-8-sig"))
    items = data["items"] if isinstance(data, dict) else data
    return [x for x in items if isinstance(x, dict) and "week" in x and "day" in x]


def collect_entries(root, items):
    """詳解項目：extra_vocab ＋ daily-marks*.json。回傳 list of dict(qid, text, type, ctx, examples)"""
    arts = {art_id(x): x for x in items}
    ents = {}
    for qid, x in arts.items():
        for v in x.get("extra_vocab") or []:
            if not isinstance(v, dict):
                continue
            t = str(v.get("text") or v.get("word") or "").strip()
            if t:
                typ = v.get("type") or ("phrase" if re.search(r"\s", t) else "word")
                ents[(qid, norm(t))] = dict(qid=qid, text=t, type=typ, ctx=None, examples=v.get("examples") or [],
                                            collocations=v.get("collocations") or [], forms=v.get("forms") or [],
                                            family=v.get("family") or [], derived=v.get("derived") or [],
                                            confusable=v.get("confusable") or [], similar=v.get("similar") or [],
                                            en=str(v.get("en") or "").strip(), key_words=v.get("key_words") or [], paraphrase=v.get("paraphrase") or [],
                                            pos_uses=v.get("pos_uses") or [], senses=v.get("senses") or [],
                                            lemma=str(v.get("lemma") or "").strip())
    for f in sorted(root.glob("daily-marks*.json")):
        try:
            j = json.loads(f.read_text(encoding="utf-8-sig"))
        except Exception:
            continue
        for m in (j if isinstance(j, list) else (j.get("marks") or [])):
            if not isinstance(m, dict) or m.get("qid") not in arts or not str(m.get("text") or "").strip():
                continue
            t = str(m["text"]).strip()
            k = (m["qid"], norm(t))
            e = ents.setdefault(k, dict(qid=m["qid"], text=t, type=m.get("type") or "word", ctx=None, examples=[],
                                        collocations=[], forms=[], family=[], derived=[], confusable=[], pos_uses=[], senses=[], lemma="", en="", key_words=[], paraphrase=[]))
            if m.get("ctx"):
                e["ctx"] = str(m["ctx"]).strip()
    out = []
    for e in ents.values():
        if e["type"] != "sentence" and not e["ctx"]:
            e["ctx"] = sentence_of(str(arts[e["qid"]].get("passage") or ""), e["text"])
        out.append(e)
    out.sort(key=lambda e: (e["qid"], norm(e["text"])))
    return out


def plan_daily(root: Path):
    """回傳 groups：list of dict(key, kind, total, voice, jobs[])，只包含有缺檔的項目。"""
    begin(root)
    items = load_daily_items(root)
    audio = root / "audio"
    groups = []
    if MAKE_PASSAGE:
        for x in items:
            qid = art_id(x)
            p = str(x.get("passage") or "").strip()
            if not p:
                continue
            path = (root / x["audio"]) if x.get("audio") else audio / "daily" / f"{qid}.mp3"
            voice = PASSAGE_VOICES[zlib.crc32(qid.encode("utf-8")) % len(PASSAGE_VOICES)]
            r = need(path, voice, PASSAGE_RATE)
            if r:
                groups.append(dict(key=qid, kind="文章", total=1, voice=voice, jobs=[
                    dict(name=path.name, text=p, voice=voice, rate=PASSAGE_RATE, path=path, redo=(r == "redo"))]))
    if MAKE_VOCAB or MAKE_CTX or MAKE_EXAMPLES or MAKE_COLLOC or MAKE_FORMS or MAKE_FAMILY or MAKE_DERIVED or MAKE_CONFUSABLE or MAKE_SIMILAR or MAKE_EN or MAKE_PARA or MAKE_KEYWORDS or MAKE_POS or MAKE_SENSE or MAKE_PHRASES:
        vdir = root / VOCAB_SUB
        wdir = root / WORDS_SUB
        seen = set()   # 這次已排進清單的檔（共用單字檔、vocab/ 檔），同一個檔不重複排
        legacy = [f.name for f in vdir.glob("*.mp3") if re.match(r"w\d+d\d+-", f.name)] if vdir.is_dir() else []
        if legacy:
            print(f"⚠ vocab/ 還有 {len(legacy)} 個舊檔名（{legacy[0]} …）。請先執行 migrate_vocab_names.py，否則下面會把它們當成「缺檔」重錄一次。")
        shared = lambda t: f"@{slug(t)}.mp3"   # 「@」開頭＝共用發音庫 words/ 的檔
        for e in collect_entries(root, items):
            base = slug(e["text"])   # 不含文章 id：例句等跟著單字；整句與所在句另用「句子本身」的 slug（見下）
            want = []
            if MAKE_VOCAB:
                want.append((f"{base}.mp3" if e["type"] == "sentence" else shared(e["text"]), speak_text(e["text"])))
            if MAKE_VOCAB and e.get("lemma") and norm(e["lemma"]) != norm(e["text"]):
                want.append((shared(e["lemma"]), speak_text(e["lemma"])))  # 原形的發音
            if MAKE_CTX and e["type"] != "sentence" and e["ctx"]:
                want.append((f"{slug(e['ctx'])}.mp3", e["ctx"]))   # 所在句：依句子內容命名（與入庫的整句共用同一檔）
            if MAKE_EXAMPLES:
                for k, ex in enumerate(e["examples"], 1):
                    en = ex if isinstance(ex, str) else (ex or {}).get("en")
                    if en and str(en).strip():
                        want.append((f"{base}_e{k}.mp3", str(en).strip()))
            if MAKE_COLLOC:
                for k, c in enumerate(e["collocations"], 1):
                    ph = c if isinstance(c, str) else ((c or {}).get("phrase") or (c or {}).get("p"))
                    if isinstance(ph, str) and ph.strip():
                        want.append((shared(ph), speak_text(ph)))
                    en = ((c or {}).get("example") or {}).get("en") if isinstance(c, dict) else None
                    if isinstance(en, str) and en.strip():
                        want.append((f"{base}_c{k}.mp3", en.strip()))
            if MAKE_FORMS:
                for k, f in enumerate(e["forms"], 1):
                    w = f.get("w") if isinstance(f, dict) else None
                    if isinstance(w, str) and w.strip():
                        want.append((shared(w), speak_text(w)))
                    en = (f.get("example") or {}).get("en") if isinstance(f, dict) and isinstance(f.get("example"), dict) else None
                    if isinstance(en, str) and en.strip():   # 屈折變化的例句：檔名 _fx{k}，與 notes.js 詳解頁的 🔊 一致
                        want.append((f"{base}_fx{k}.mp3", en.strip()))
            if MAKE_FAMILY:
                for k, g in enumerate(e["family"], 1):
                    if not isinstance(g, dict):
                        continue
                    if isinstance(g.get("w"), str) and g["w"].strip():
                        want.append((shared(g["w"]), speak_text(g["w"])))
                    en = (g.get("example") or {}).get("en") if isinstance(g.get("example"), dict) else None
                    if isinstance(en, str) and en.strip():
                        want.append((f"{base}_mx{k}.mp3", en.strip()))
            if MAKE_DERIVED:
                for k, d in enumerate(e["derived"], 1):
                    w = d.get("w") if isinstance(d, dict) else None
                    if isinstance(w, str) and w.strip():
                        want.append((shared(w), speak_text(w)))
            if MAKE_CONFUSABLE:
                for k, c in enumerate(e.get("confusable") or [], 1):  # 易混淆：該字／片語本身發音（共用庫）＋ 例句 _cf{k}，與 notes.js 的 🔊 一致
                    cw = (c.get("word") or c.get("phrase")) if isinstance(c, dict) else None
                    if isinstance(cw, str) and cw.strip():
                        want.append((shared(cw), speak_text(cw)))
                    en = (c.get("example") or {}).get("en") if isinstance(c, dict) and isinstance(c.get("example"), dict) else None
                    if isinstance(en, str) and en.strip():
                        want.append((f"{base}_cf{k}.mp3", en.strip()))
            if MAKE_EN and e.get("en"):   # 英文解說整句：逐篇存放，檔名 _en，與 notes.js 的 🔊 一致
                want.append((f"{base}_en.mp3", str(e["en"]).strip()))
            if MAKE_PARA:                 # 句子的同義改寫：逐篇存放，檔名 _pr{k}，與 notes.js 的 🔊 一致
                for k, o in enumerate(e.get("paraphrase") or [], 1):
                    en = o.get("en") if isinstance(o, dict) else (o if isinstance(o, str) else None)
                    if isinstance(en, str) and en.strip():
                        want.append((f"{base}_pr{k}.mp3", en.strip()))
            if MAKE_KEYWORDS:             # 句中值得注意的字：單字走共用庫
                for k, o in enumerate(e.get("key_words") or [], 1):
                    kw = o.get("w") if isinstance(o, dict) else None
                    if isinstance(kw, str) and kw.strip():
                        want.append((shared(kw), speak_text(kw)))
            if MAKE_SIMILAR:
                for k, c in enumerate(e.get("similar") or [], 1):  # 近義片語：本身發音（共用庫）＋ 例句 _sx{k}，與 notes.js 的 🔊 一致
                    if not isinstance(c, dict):
                        continue
                    sw = c.get("phrase") or c.get("word")
                    if isinstance(sw, str) and sw.strip():
                        want.append((shared(sw), speak_text(sw)))
                    en = (c.get("example") or {}).get("en") if isinstance(c.get("example"), dict) else None
                    if isinstance(en, str) and en.strip():
                        want.append((f"{base}_sx{k}.mp3", en.strip()))
            for on, key, wsuf, esuf in ((MAKE_POS, "pos_uses", "pw", "p"), (MAKE_SENSE, "senses", "sw", "s")):
                if not on:
                    continue
                for k, o in enumerate(e[key], 1):  # 每一筆：單字發音（_pw／_sw）＋ 例句（_p／_s）；網頁 notes.js 的 🔊 用同一套檔名
                    if not isinstance(o, dict):
                        continue
                    ww = o.get("w") or e.get("lemma") or e["text"]
                    want.append((shared(ww), speak_text(ww)))  # 變化形（billed）的詳解以原形（bill）為準
                    en = (o.get("example") or {}).get("en") if isinstance(o.get("example"), dict) else None
                    if isinstance(en, str) and en.strip():
                        want.append((f"{base}_{esuf}{k}.mp3", en.strip()))
            jobs = []
            for n, t in want:
                if n.startswith("@"):   # 單字類：共用庫；已存在、或這次已排進別的項目就不重複
                    p = wdir / n[1:]
                    r = need(p, VOCAB_VOICE, VOCAB_RATE)
                    if not r or p in seen:
                        continue
                    seen.add(p)
                else:                   # 例句、所在句、句子：放 vocab/；同一句（所在句／整句／兩個字同一句）只排一次
                    p = vdir / n
                    r = need(p, VOCAB_VOICE, VOCAB_RATE)
                    if not r or p in seen:
                        continue
                    seen.add(p)
                jobs.append(dict(name=p.name, text=t, voice=VOCAB_VOICE, rate=VOCAB_RATE, path=p, redo=(r == "redo")))
            if jobs:
                kind = {"word": "單字", "phrase": "片語", "sentence": "句子"}.get(e["type"], "單字")
                groups.append(dict(key=f"{e['qid']}:{e['text']}", kind=kind, total=len(want), voice=VOCAB_VOICE, jobs=jobs))
        if MAKE_PHRASES:   # 簡報常用句型：每篇一組，整句 mp3 放 vocab/，檔名＝句型內容的 slug（同一句只錄一次）
            for x in items:
                pps = [p.get("phrase") for p in (x.get("presentation_phrases") or []) if isinstance(p, dict)]
                jobs = []
                for ph in pps:
                    if not (isinstance(ph, str) and ph.strip()):
                        continue
                    t = speak_text(ph)
                    t = re.sub(r"\s+", " ", t)
                    p = vdir / f"{slug(t)}.mp3"
                    r = need(p, VOCAB_VOICE, VOCAB_RATE)
                    if not r or p in seen:
                        continue
                    seen.add(p)
                    jobs.append(dict(name=p.name, text=t, voice=VOCAB_VOICE, rate=VOCAB_RATE, path=p, redo=(r == "redo")))
                if jobs:
                    groups.append(dict(key=f"{art_id(x)}:簡報句型", kind="句型", total=len(pps), voice=VOCAB_VOICE, jobs=jobs))
    return groups


def write_manifest(root: Path, log=print):
    """重建 audio/daily/vocab/index.json（網頁靠它知道哪些詳解 mp3 存在，沒有的就用語音合成）。"""
    d = root / VOCAB_SUB
    d.mkdir(parents=True, exist_ok=True)
    files = sorted(f.name for f in d.glob("*.mp3") if ok_file(f))
    (d / "index.json").write_text(json.dumps(dict(v=int(time.time()), files=files), ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"已更新 {d / 'index.json'}（{len(files)} 個檔）")
    w = root / WORDS_SUB
    w.mkdir(parents=True, exist_ok=True)
    wfiles = sorted(f.name for f in w.glob("*.mp3") if ok_file(f))
    (w / "index.json").write_text(json.dumps(dict(v=int(time.time()), files=wfiles), ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"已更新 {w / 'index.json'}（共用單字發音 {len(wfiles)} 個檔）")


# =============================== 題庫表（介面文字與行為差異） ===============================
class Spec:
    def __init__(self, key, title, plan, unit="題", id_hdr="題目", sample_hdr="第一句", voice_w=160, sample_w=520,
                 letters=False, log_style="plain", detail_sp=False, cli_vw=20, prefix_hint="d1 / d2-001 / -e 初級 / -m 中級 / -h 高級",
                 cli_prefix="前綴：d1 或 d2-001　難度：-e / -m / -h", daily=False):
        self.key, self.title, self.plan, self.unit = key, title, plan, unit
        self.id_hdr, self.sample_hdr, self.voice_w, self.sample_w = id_hdr, sample_hdr, voice_w, sample_w
        self.letters, self.log_style, self.detail_sp = letters, log_style, detail_sp
        self.cli_vw, self.prefix_hint, self.cli_prefix, self.daily = cli_vw, prefix_hint, cli_prefix, daily
        self.cfg = CFG[key]

    @property
    def file(self):
        return self.cfg["file"]

    @property
    def sub(self):
        return self.cfg["sub"]

    def est_minutes(self, n_files):
        return max(1, round(n_files * self.cfg["secs"] / CONCURRENCY / 60))

    def log_text(self, job):
        """產生成功時的記錄行文字。"""
        if self.log_style == "sp":
            return f"{job['sp']}: {job['text']}"
        if self.log_style == "cut60…":
            return job["text"][:60] + "…"
        if self.log_style == "cut60":
            return job["text"][:60]
        return job["text"]

    def folder_note(self, root):
        if self.daily:
            return f"專案：{root}　　文章：{root / 'audio' / 'daily'}　　詳解：{root / VOCAB_SUB}"
        if self.letters:
            return f"專案：{root}　　句子存放：{root / 'audio' / self.sub}　　字母存放：{root / 'audio'}"
        return f"專案：{root}　　句子存放：{root / 'audio' / self.sub}"


SPECS = {
    "part1": Spec("part1", "Part 1 照片描述", plan_part1, letters=True,
                  prefix_hint="d1 / d2-001 / -e 初級 / letters", cli_prefix="前綴：d1 或 d2-001　難度：-e / -m / -h　letters"),
    "part2": Spec("part2", "Part 2 應答問題", plan_part2, letters=True, sample_hdr="第一個檔的文字",
                  prefix_hint="d1 / d2-001 / -e 初級 / letters", cli_prefix="前綴：d1 或 d2-001　難度：-e / -m / -h　letters"),
    "part3": Spec("part3", "Part 3 簡短對話", plan_part3, unit="組", id_hdr="題組", sample_hdr="第一個缺檔的文字",
                  voice_w=220, sample_w=460, log_style="sp", detail_sp=True, cli_vw=28),
    "part4": Spec("part4", "Part 4 簡短獨白", plan_part4, sample_hdr="獨白內容", voice_w=220, sample_w=460,
                  log_style="cut60…", cli_vw=12),
    "part5": Spec("part5", "Part 5 句子填空", plan_part5, sample_hdr="朗讀的句子（答案已填入）", voice_w=220, sample_w=460,
                  log_style="sp", detail_sp=True, cli_vw=12),
    "part6": Spec("part6", "Part 6 段落填空", plan_part6, sample_hdr="朗讀內容（答案已填入）", voice_w=220, sample_w=460,
                  log_style="cut60…", cli_vw=12),
    "part7": Spec("part7", "Part 7 閱讀理解", plan_part7, unit="組", sample_hdr="第一份缺檔文件", voice_w=220, sample_w=460,
                  log_style="cut60…", cli_vw=40),
    "daily": Spec("daily", "Daily 每日文章", plan_daily, unit="項", id_hdr="項目", log_style="cut60", daily=True,
                  prefix_hint="w1d1", cli_prefix="前綴：w1d1"),
}
ORDER = ("part1", "part2", "part3", "part4", "part5", "part6", "part7", "daily")
ALIASES = {"photo": "part1", "p1": "part1", "1": "part1", "p2": "part2", "2": "part2", "p3": "part3", "3": "part3",
           "p4": "part4", "4": "part4", "p5": "part5", "5": "part5", "p6": "part6", "6": "part6", "p7": "part7", "7": "part7",
           "d": "daily"}


def resolve_part(name):
    n = str(name).lower().replace(".py", "").replace("-auto-speech", "").strip()
    n = ALIASES.get(n, n)
    return n if n in SPECS else None


def build_plan(part, root: Path):
    """給 json_merge.py 的手動錄製清單使用：part 可以是 part1…part7、daily（photo 也行）。"""
    return SPECS[resolve_part(part)].plan(Path(root))


def find_root(spec=None):
    files = [spec.file] if spec else [s.file for s in SPECS.values()]
    for d in (HERE, HERE.parent, Path.cwd()):
        if any((d / f).exists() for f in files):
            return d
    return None


# ------------------------------- Azure 點數用量（估算） -------------------------------
USAGE = dict(session=0, usd=0.0)


def usage_path(root) -> Path:
    return Path(root) / USAGE_NAME


def load_usage(root):
    try:
        j = json.loads(usage_path(root).read_text(encoding="utf-8-sig"))
        return j if isinstance(j, dict) else {}
    except (OSError, ValueError):
        return {}


def save_usage(root):
    if not USAGE["session"]:
        return
    j = load_usage(root)
    if "usd" not in j:                                   # 舊版紀錄只有字元數，先用標準價換算
        j["usd"] = int(j.get("chars", 0)) / 1e6 * PRICE_USD_PER_M_CHARS
    j["usd"] = round(float(j["usd"]) + USAGE["usd"], 4)
    j["chars"] = int(j.get("chars", 0)) + USAGE["session"]
    j["updated"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    usage_path(root).write_text(json.dumps(j, ensure_ascii=False, indent=1), encoding="utf-8")
    USAGE["session"] = 0
    USAGE["usd"] = 0.0


def credit_line(root):
    uj = load_usage(root)
    chars = int(uj.get("chars", 0))
    used = float(uj["usd"]) if "usd" in uj else chars / 1e6 * PRICE_USD_PER_M_CHARS
    when = "點數到期日未設定（請填 AZURE_CREDIT_END）"
    if AZURE_CREDIT_END:
        try:
            left = (datetime.strptime(AZURE_CREDIT_END, "%Y-%m-%d").date() - datetime.now().date()).days
            when = f"點數到期 {AZURE_CREDIT_END}（" + (f"還剩 {left} 天" if left >= 0 else f"已過期 {-left} 天，Azure 可能已停用") + "）"
        except ValueError:
            when = "AZURE_CREDIT_END 格式應為 YYYY-MM-DD"
    return (f"Azure：{when}；本腳本累計約 {chars:,} 字元 ≈ US${used:.2f} ／ US${AZURE_CREDIT_USD:.0f}"
            f"（{used / AZURE_CREDIT_USD * 100:.1f}%，僅估算，實際請看入口網站「成本管理」）")


# ------------------------------- edge-tts（微軟免費語音；2026-10-10 起常回 403） -------------------------------
def have_edge_tts():
    try:
        importlib.invalidate_caches()
        importlib.import_module("edge_tts")
        return True
    except ImportError:
        return False


async def synth_edge(job, spec, sem, st, log, edge_tts):
    async with sem:
        if st["stop"].is_set():
            st["skipped"] += 1
            return
        job["path"].parent.mkdir(parents=True, exist_ok=True)
        tmp = job["path"].with_suffix(".tmp")
        parts = job.get("parts") or [(job["text"], job["voice"])]
        rate = job.get("rate") or spec.cfg["rate"]
        sig = "|".join(v for _, v in parts)
        timeout = spec.cfg["timeout"]
        err = None
        for _ in range(3):
            tmps = []
            try:
                if len(parts) == 1:
                    await asyncio.wait_for(edge_tts.Communicate(parts[0][0], parts[0][1], rate=rate).save(str(tmp)), timeout)
                else:
                    for n, (text, voice) in enumerate(parts):
                        pt = job["path"].with_suffix(f".p{n}.tmp")
                        tmps.append(pt)
                        await asyncio.wait_for(edge_tts.Communicate(text, voice, rate=rate).save(str(pt)), timeout)
                        if not (pt.exists() and pt.stat().st_size > 1000):
                            raise RuntimeError("產生的檔案太小")
                    with open(tmp, "wb") as out:
                        for pt in tmps:
                            out.write(pt.read_bytes())
                if tmp.exists() and tmp.stat().st_size > 1000:
                    tmp.replace(job["path"])
                    st["ok"] += 1
                    record(job["path"], sig, rate)
                    if STATE["dirty"] >= 20:
                        save_log()
                    log(f"{'↻' if job.get('redo') else '✓'} {job['name']}  {spec.log_text(job)}")
                    return
            except Exception as e:
                err = f"{type(e).__name__} {e}".strip()
            finally:
                for pt in tmps:
                    try:
                        pt.unlink()
                    except OSError:
                        pass
            await asyncio.sleep(1.5)
        st["bad"] += 1
        log(f"✗ 失敗 {job['name']}  ({err})")
        try:
            tmp.unlink()
        except OSError:
            pass


# ------------------------------- 語音產生（Azure Speech REST + SSML） -------------------------------
class AzureFatal(Exception):
    """金鑰／區域／聲音設定錯誤：重試沒有用，整批停止。"""


def azure_conf():
    """從環境變數讀金鑰與區域。回傳 (key, region, 錯誤訊息或 None)。不會把金鑰印出來。"""
    key = os.environ.get("SPEECH_KEY", "").strip()
    region = os.environ.get("SPEECH_REGION", "").strip().lower().replace(" ", "")
    miss = [n for n, v in (("SPEECH_KEY", key), ("SPEECH_REGION", region)) if not v]
    if miss:
        return key, region, ("找不到環境變數 " + "、".join(miss) + "。請在命令提示字元執行：setx SPEECH_KEY \"金鑰\" 和 "
                             "setx SPEECH_REGION \"區域\"，然後關掉所有終端機／編輯器重開（雙擊執行則請登出再登入）。")
    if not re.fullmatch(r"[a-z0-9]+", region):
        return key, region, "SPEECH_REGION 格式不對，應為小寫英數字（例如 eastasia、japaneast），不是「East Asia」。"
    return key, region, None


def tts_url(region):
    return f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"


def prosody_open(rate):
    r = (rate or "").strip()
    return (f'<prosody rate="{xml_escape(r)}">', "</prosody>") if r and r not in ("+0%", "0%") else ("", "")


def clean_text(t):
    t = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", t)   # XML 不允許的控制字元
    return xml_escape(re.sub(r"\s+", " ", t).strip())


def build_ssml(parts, rate):
    """parts＝[(文字, 聲音), ...]。多段用同一份 SSML 的多個 <voice>，一次請求就得到接好的 mp3。"""
    po, pc = prosody_open(rate)
    brk = f'<break time="{PAUSE_MS}ms"/>' if len(parts) > 1 else ""
    body = []
    for i, (text, voice) in enumerate(parts):
        t = clean_text(text)
        if not t:
            raise ValueError("文字是空的")
        hd = is_hd(voice)
        # DragonHD 不支援 <prosody>（語速），所以 HD 聲音不加語速；改用 parameters 控制穩定度
        p1, p2 = ("", "") if hd else (po, pc)
        attr = f' parameters="{xml_escape(HD_PARAMS)}"' if hd and HD_PARAMS else ""
        body.append(f'<voice name="{xml_escape(voice)}"{attr}>{p1}{t}{p2}{brk if i < len(parts) - 1 else ""}</voice>')
    return "<speak version='1.0' xml:lang='en-US'>" + "".join(body) + "</speak>"


def job_chars(job):
    parts = job.get("parts") or [(job["text"], job["voice"])]
    return sum(len(clean_text(t)) for t, _ in parts)


def job_cost(job):
    """估算單一檔的費用（USD）：HD 聲音和標準聲音分開計價。"""
    parts = job.get("parts") or [(job["text"], job["voice"])]
    return sum(len(clean_text(t)) * (PRICE_HD_USD_PER_M_CHARS if is_hd(v) else PRICE_USD_PER_M_CHARS) for t, v in parts) / 1e6


def azure_request(key, region, ssml, timeout):
    """同步呼叫一次；成功回傳 mp3 bytes；失敗丟 urllib.error.HTTPError／URLError。"""
    req = urllib.request.Request(
        tts_url(region), data=ssml.encode("utf-8"), method="POST",
        headers={"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
                 "X-Microsoft-OutputFormat": AZURE_FORMAT, "User-Agent": "toeic-auto-speech"})
    with urllib.request.urlopen(req, timeout=timeout or 60) as r:
        return r.read()


def hd_fallback_voice(v):
    """en-US-Ava:DragonHDLatestNeural → en-US-AvaMultilingualNeural"""
    return v.split(":")[0] + "MultilingualNeural" if is_hd(v) else v


async def azure_synth(parts, rate, timeout, conf):
    """回傳 (mp3 bytes, 實際使用的 parts)。HD 聲音被拒絕（HTTP 400）時，若 HD_FALLBACK 就改用標準聲音重試一次。"""
    try:
        return await azure_synth1(parts, rate, timeout, conf), parts
    except ValueError:
        if not (HD_FALLBACK and any(is_hd(v) for _, v in parts)):
            raise
        parts2 = [(t, hd_fallback_voice(v)) for t, v in parts]
        return await azure_synth1(parts2, rate, timeout, conf), parts2


async def azure_synth1(parts, rate, timeout, conf):
    """含重試／限流（429 依 Retry-After 等待、5xx 與網路錯誤指數退避）。401／403／404／400 不重試。"""
    key, region = conf
    ssml = build_ssml(parts, rate)
    last = None
    for attempt in range(AZURE_RETRIES):
        try:
            return await asyncio.to_thread(azure_request, key, region, ssml, timeout)
        except urllib.error.HTTPError as e:
            code = e.code
            detail = ""
            try:
                detail = e.read().decode("utf-8", "replace")[:300]
            except Exception:
                pass
            if code in (401, 403):
                raise AzureFatal(f"HTTP {code}：金鑰無效、區域和金鑰不符，或此訂用帳戶已停用／額度用完。{detail}")
            if code == 404:
                raise AzureFatal("HTTP 404：端點不存在，請確認 SPEECH_REGION 和資源所在區域一致。")
            if code in (400, 415):
                raise ValueError(f"HTTP {code}：請求被拒絕（SSML 或聲音名稱有問題）{detail}")
            if code == 429 or code >= 500:
                wait = 0.0
                try:
                    wait = float(e.headers.get("Retry-After") or 0)
                except (TypeError, ValueError):
                    pass
                wait = max(wait, min(2 ** attempt, 30)) + random.uniform(0, 1)
                last = f"HTTP {code}"
                await asyncio.sleep(wait)
                continue
            raise RuntimeError(f"HTTP {code} {detail}")
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            last = f"{type(e).__name__} {e}".strip()
            await asyncio.sleep(min(2 ** attempt, 30) + random.uniform(0, 1))
    raise RuntimeError(f"重試 {AZURE_RETRIES} 次仍失敗（{last}）")


async def synth(job, spec, sem, st, log, conf):
    async with sem:
        if st["stop"].is_set():
            st["skipped"] += 1
            return
        job["path"].parent.mkdir(parents=True, exist_ok=True)
        tmp = job["path"].with_suffix(".tmp")
        parts = job.get("parts") or [(job["text"], job["voice"])]   # [(文字, 聲音), ...]；多段在同一份 SSML 內依序朗讀
        rate = job.get("rate") or spec.cfg["rate"]
        sig = "|".join(v for _, v in parts)             # 版本紀錄用的聲音簽名（和 plan 裡的 need() 一致）
        timeout = spec.cfg["timeout"]
        try:
            data, used = await azure_synth(parts, rate, timeout, conf)
            if used is not parts:                        # HD 被拒絕，已改用標準聲音
                sig = "|".join(v for _, v in used)
                log(f"⚠ {job['name']}  HD 聲音被拒絕（這個區域可能沒有 HD），改用標準聲音 {short(used[0][1])}")
            if len(data) <= 1000:
                raise RuntimeError("產生的檔案太小")
            tmp.write_bytes(data)
            tmp.replace(job["path"])
            st["ok"] += 1
            USAGE["session"] += job_chars(job)
            USAGE["usd"] += job_cost(job)
            record(job["path"], sig, rate)
            if STATE["dirty"] >= 20:                     # 每 20 筆存一次，中途當掉也不會全部遺失
                save_log()
            log(f"{'↻' if job.get('redo') else '✓'} {job['name']}  {spec.log_text(job)}")
        except AzureFatal as e:
            st["bad"] += 1
            log(f"✗ 失敗 {job['name']}  ({e})")
            if not st.get("fatal"):
                st["fatal"] = True
                log("✗ 這類錯誤重試沒有用，已停止其餘檔案。請修正設定後再執行（可先跑 --check-azure）。")
                st["stop"].set()
        except Exception as e:
            st["bad"] += 1
            log(f"✗ 失敗 {job['name']}  ({type(e).__name__} {e})".strip())
        finally:
            try:
                tmp.unlink()
            except OSError:
                pass


def generate(jobs, spec, log, progress, stop, root=None):
    """同步執行（給文字模式或背景執行緒呼叫）。回傳 (成功, 失敗, 略過)"""
    if root is not None:
        STATE["root"] = Path(root)
    st = dict(ok=0, bad=0, skipped=0, stop=stop)
    total = len(jobs)

    def lg(m):
        log(m)
        progress(st["ok"] + st["bad"], total)

    if ENGINE == "azure":
        key, region, err = azure_conf()
        if err:
            log("✗ " + err)
            return 0, len(jobs), 0
        chars = sum(job_chars(j) for j in jobs)
        cost = sum(job_cost(j) for j in jobs)
        USAGE["session"] = 0
        USAGE["usd"] = 0.0
        log(f"引擎：Azure Speech　區域 {region}；本次 {total} 個檔、約 {chars:,} 字元"
            f"（估算約 US${cost:.3f}）")
        log(credit_line(STATE["root"]))

        async def go():
            sem = asyncio.Semaphore(CONCURRENCY)
            await asyncio.gather(*(synth(j, spec, sem, st, lg, (key, region)) for j in jobs))
    else:
        if not have_edge_tts():
            log("正在安裝 edge-tts …")
            r = subprocess.run([sys.executable, "-m", "pip", "install", "edge-tts"], capture_output=True, text=True)
            if r.returncode != 0 or not have_edge_tts():
                log("✗ 安裝 edge-tts 失敗，請手動執行：pip install edge-tts")
                return 0, len(jobs), 0
        import edge_tts
        log("引擎：edge-tts（免費）。注意：2026-10-10 起微軟改版，常見 HTTP 403 失敗，與本程式無關。")

        async def go():
            sem = asyncio.Semaphore(CONCURRENCY)
            await asyncio.gather(*(synth_edge(j, spec, sem, st, lg, edge_tts) for j in jobs))

    try:
        asyncio.run(go())
    finally:
        if STATE["dirty"] and STATE["root"]:
            try:
                save_log()
            except OSError as e:
                log(f"✗ 無法寫入版本紀錄 {LOG_NAME}：{e}")
        if ENGINE == "azure" and STATE["root"]:
            try:
                save_usage(STATE["root"])
                log(credit_line(STATE["root"]))
            except OSError as e:
                log(f"✗ 無法寫入用量紀錄 {USAGE_NAME}：{e}")
    return st["ok"], st["bad"], st["skipped"]


def check_azure():
    """--check-azure：驗證金鑰／區域，列出 8 個聲音是否存在，並實際合成一次很短的句子。"""
    key, region, err = azure_conf()
    if err:
        print("✗", err)
        return 1
    print(f"區域：{region}　金鑰：已讀到（長度 {len(key)}，不顯示內容）")
    try:
        req = urllib.request.Request(f"https://{region}.tts.speech.microsoft.com/cognitiveservices/voices/list",
                                     headers={"Ocp-Apim-Subscription-Key": key})
        with urllib.request.urlopen(req, timeout=30) as r:
            have = {v["ShortName"] for v in json.loads(r.read().decode("utf-8"))}
    except urllib.error.HTTPError as e:
        print(f"✗ 讀取聲音清單失敗：HTTP {e.code}（401／403＝金鑰或區域不對；404＝區域名稱錯）")
        return 1
    except Exception as e:
        print(f"✗ 連線失敗：{type(e).__name__} {e}")
        return 1
    bad = 0
    for v in dict.fromkeys(VOICES + [LETTER_VOICE, VOCAB_VOICE]):
        ok = v in have
        note = ""
        if not ok and is_hd(v):          # HD 聲音可能不在清單裡，直接合成一次確認
            global HD_PARAMS
            try:
                azure_request(key, region, build_ssml([("Hello.", v)], "-5%"), 30)
                ok = True
            except Exception as e1:
                saved = HD_PARAMS
                HD_PARAMS = ""
                try:
                    azure_request(key, region, build_ssml([("Hello.", v)], "-5%"), 30)
                    ok, note = True, "　（可用，但 HD_PARAMS 被拒絕，請把 HD_PARAMS 設成 \"\"）"
                except Exception:
                    note = f"　（{region} 不支援這個 HD 聲音或名稱不對：{type(e1).__name__}；可改用 eastus／westeurope／southeastasia 的 Speech 資源）"
                finally:
                    HD_PARAMS = saved
        bad += (not ok)
        print(f"  {'✓' if ok else '✗'} {v}{note}")
    try:
        data = azure_request(key, region, build_ssml([("Hello.", VOICES[-1])], "-5%"), 30)   # 用標準聲音測金鑰／區域
        print(f"✓ 合成測試成功（{len(data):,} bytes，約 6 個字元）")
    except Exception as e:
        print(f"✗ 合成測試失敗：{type(e).__name__} {e}")
        return 1
    print(credit_line(find_root() or HERE))
    print("全部可用。" if not bad else f"有 {bad} 個聲音在 {region} 不可用，請改用別的聲音或區域。")
    return 1 if bad else 0


def run_scan(root: Path, log):
    scan = root / "Scan總表與音檔.py"
    if not scan.exists():
        log("（找不到 Scan總表與音檔.py，請自行更新 index.json）")
        return
    r = subprocess.run([sys.executable, str(scan)], cwd=str(scan.parent), capture_output=True, text=True, input="\n")
    log((r.stdout or "") + (r.stderr or "") or "Scan總表與音檔.py 已執行。")


# ------------------------------- 視窗模式 -------------------------------
def run_gui(root: Path, spec: Spec):
    """回傳 "switch"（按了「切換題庫」）或 None。"""
    import tkinter as tk
    from tkinter import ttk, messagebox

    win = tk.Tk()
    win.title(f"{spec.title} 補錄音檔")
    win.geometry("1000x720")
    S = dict(groups=[], checked=set(), running=False, stop=threading.Event(), result=None)
    q = queue.Queue()
    unit = spec.unit
    kind_btns = {}   # Daily 的「文章／詳解」切換鈕：{True: 文章鈕, False: 詳解鈕}

    ttk.Label(win, text=spec.folder_note(root), foreground="#555").pack(anchor="w", padx=10, pady=(8, 2))

    bar = ttk.Frame(win)
    bar.pack(fill="x", padx=10, pady=4)
    bar2 = ttk.Frame(win)
    bar2.pack(fill="x", padx=10, pady=(0, 4))
    n_var, pre_var = tk.StringVar(value="10"), tk.StringVar()

    tree_f = ttk.Frame(win)
    tree_f.pack(fill="both", expand=True, padx=10)
    if spec.daily:
        cols = ("chk", "key", "kind", "miss", "sample")
        heads, widths = ("勾", spec.id_hdr, "類型", "缺/總", "內容"), (40, 200, 60, 90, 560)
        centered = ("chk", "kind", "miss")
    else:
        cols = ("chk", "id", "miss", "voice", "sample")
        heads, widths = ("勾", spec.id_hdr, "缺/總", "聲音", spec.sample_hdr), (40, 110, 90, spec.voice_w, spec.sample_w)
        centered = ("chk", "miss")
    tree = ttk.Treeview(tree_f, columns=cols, show="headings", selectmode="browse", height=12)
    for c, t, w in zip(cols, heads, widths):
        tree.heading(c, text=t)
        tree.column(c, width=w, anchor="center" if c in centered else "w", stretch=(c == "sample"))
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

    def sample_of(g):
        if spec.daily:
            return g["jobs"][0]["text"][:80].replace("\n", " ")
        return g.get("sample") or g["jobs"][0]["text"]

    def update_summary():
        g = [S["groups"][int(i)] for i in S["checked"]]
        n = sum(len(x["jobs"]) for x in g)
        total = sum(len(x["jobs"]) for x in S["groups"])
        rn = sum(1 for x in g for j in x["jobs"] if j.get("redo"))
        rt = sum(1 for x in S["groups"] for j in x["jobs"] if j.get("redo"))
        summary.config(text=f"已勾選 {len(g)} {unit}，共 {n} 個檔" + (f"（其中 {rn} 個重錄）" if rn else "")
                       + f"，預估約 {spec.est_minutes(n) if n else 0} 分鐘　（全部 {total} 個檔" + (f"，含重錄 {rt} 個" if rt else "") + "）")
        start_btn.config(state="normal" if (n and not S["running"]) else "disabled")
        refresh_kind_btns()

    def row_values(i, g):
        chk = "☑" if str(i) in S["checked"] else "☐"
        rn = sum(1 for j in g["jobs"] if j.get("redo"))
        miss = f"{len(g['jobs'])}/{g['total']}" + (f" ↻{rn}" if rn else "")
        if spec.daily:
            return (chk, g["key"], g["kind"], miss, sample_of(g))
        return (chk, g["key"], miss, g["voice"], sample_of(g))

    def repaint():
        tree.delete(*tree.get_children())
        for i, g in enumerate(S["groups"]):
            tree.insert("", "end", iid=str(i), values=row_values(i, g))
        update_summary()

    def reload_plan():
        S["groups"] = spec.plan(root)
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
        if spec.daily:
            detail.insert("end", f"{g['key']}　聲音 {g['voice']}\n")
            for j in g["jobs"]:
                detail.insert("end", f" {'↻' if j.get('redo') else ' '}{j['name']:<34} {j['text'][:70].replace(chr(10), ' ')}\n")
            return
        folder = (root / "audio") if g["key"] == "letters" else (root / "audio" / spec.sub)
        detail.insert("end", f"{g['key']}　聲音 {g['voice']}　存到 {folder}\n")
        for j in g["jobs"]:
            body = f"{j['sp']}: {j['text']}" if (spec.detail_sp and "sp" in j) else j["text"]
            detail.insert("end", f" {'↻' if j.get('redo') else ' '}{j['name']:<22} {body}\n")

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

    def kind_ids(passage):
        return {str(i) for i, g in enumerate(S["groups"]) if (g["kind"] == "文章") == passage}

    def toggle_kind(passage):
        """該類（文章／詳解）已經全勾 → 全部取消；否則 → 全部勾選。不影響另一類的勾選狀態。"""
        ids = kind_ids(passage)
        if not ids:
            return
        if ids <= S["checked"]:
            S["checked"] -= ids
        else:
            S["checked"] |= ids
        repaint()

    def refresh_kind_btns():
        for passage, btn in kind_btns.items():
            ids = kind_ids(passage)
            name = "文章" if passage else "詳解"
            on = bool(ids) and ids <= S["checked"]
            btn.config(text=(f"☑ 取消全部{name}" if on else f"☐ 勾選全部{name}"),
                       state="normal" if ids else "disabled")

    ttk.Button(bar, text="全選", command=lambda: set_checked(range(len(S["groups"])))).pack(side="left")
    ttk.Button(bar, text="全不選", command=lambda: set_checked([])).pack(side="left", padx=4)
    if spec.daily:
        kind_btns[True] = ttk.Button(bar, text="☐ 勾選全部文章", command=lambda: toggle_kind(True))
        kind_btns[True].pack(side="left")
        kind_btns[False] = ttk.Button(bar, text="☐ 勾選全部詳解", command=lambda: toggle_kind(False))
        kind_btns[False].pack(side="left", padx=4)
    else:
        ttk.Button(bar, text="反選", command=lambda: set_checked(i for i in range(len(S["groups"])) if str(i) not in S["checked"])).pack(side="left")
    ttk.Separator(bar, orient="vertical").pack(side="left", fill="y", padx=10)
    ttk.Label(bar, text="只勾前").pack(side="left")
    ttk.Entry(bar, textvariable=n_var, width=4).pack(side="left", padx=2)
    if spec.daily:
        ttk.Button(bar, text=unit, command=first_n).pack(side="left", padx=2)
    else:
        ttk.Label(bar, text=unit).pack(side="left")
        ttk.Button(bar, text="勾選", command=first_n).pack(side="left", padx=4)
    ttk.Separator(bar, orient="vertical").pack(side="left", fill="y", padx=10)
    ttk.Label(bar, text=f"依前綴勾選（{spec.prefix_hint}）" if not spec.daily else f"依前綴（{spec.prefix_hint}）").pack(side="left")
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
        switch_btn.config(state="disabled")
        redo_cb.config(state="disabled")
        eng_cb.config(state="disabled")
        prog.config(maximum=len(jobs), value=0)
        log(f"—— 開始產生 {len(jobs)} 個檔案（需要網路）——")

        def work():
            try:
                res = generate(jobs, spec, lambda m: q.put(("log", m)), lambda d, t: q.put(("prog", d)), S["stop"], root)
            except Exception as e:
                q.put(("log", f"✗ 發生錯誤：{e}"))
                res = (0, len(jobs), 0)
            q.put(("done", res))

        threading.Thread(target=work, daemon=True).start()

    def finish(res):
        ok, bad, skipped = res
        S["running"] = False
        stop_btn.config(state="disabled")
        switch_btn.config(state="normal")
        redo_cb.config(state="readonly")
        eng_cb.config(state="readonly")
        log(f"—— 完成：成功 {ok}，失敗 {bad}" + (f"，已取消 {skipped}" if skipped else "") + " ——")
        if spec.daily:
            write_manifest(root, log)
        reload_plan()
        if ok and (root / "Scan總表與音檔.py").exists():
            tip = ("要順便執行 Scan總表與音檔.py 更新 audio/index.json 嗎？\n（文章整篇 mp3 有新增時才需要；網頁之後按 Ctrl+F5 重新整理）"
                   if spec.daily else "要順便執行 Scan總表與音檔.py 更新 index.json 嗎？\n（網頁之後按 Ctrl+F5 重新整理）")
            if messagebox.askyesno("更新 index.json", tip):
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
        S["poll_id"] = win.after(100, poll)

    def go_switch():
        if S["running"]:
            return
        S["result"] = "switch"
        if S.get("poll_id"):
            win.after_cancel(S["poll_id"])
        win.destroy()

    start_btn = ttk.Button(act, text="▶ 開始產生勾選的", command=start, state="disabled")
    start_btn.pack(side="left")
    stop_btn = ttk.Button(act, text="■ 停止（做完手上的就停）", command=lambda: (S["stop"].set(), log("要求停止…")), state="disabled")
    stop_btn.pack(side="left", padx=6)
    ttk.Button(act, text="重新掃描", command=lambda: None if S["running"] else reload_plan()).pack(side="left")
    switch_btn = ttk.Button(act, text="切換題庫", command=go_switch)
    switch_btn.pack(side="left", padx=6)
    ttk.Button(act, text="執行 Scan總表與音檔.py", command=lambda: run_scan(root, log)).pack(side="right")
    if spec.daily:
        ttk.Button(act, text="重建 vocab/index.json", command=lambda: write_manifest(root, log)).pack(side="right", padx=4)

    REDO_CHOICES = ["只補缺的檔", "補缺 ＋ 聲音／語速和目前設定不同的檔", "補缺 ＋ 不同的檔 ＋ 沒有紀錄的舊檔"]
    redo_var = tk.StringVar(value=REDO_CHOICES[STATE["redo"]])
    ttk.Label(bar2, text="重錄範圍：").pack(side="left")
    redo_cb = ttk.Combobox(bar2, textvariable=redo_var, values=REDO_CHOICES, state="readonly", width=40)
    redo_cb.pack(side="left")
    ttk.Label(bar2, text=f"　版本紀錄：{LOG_NAME}（↻＝檔案已存在，會被新版覆蓋）", foreground="#555").pack(side="left")

    def on_redo(_e=None):
        if S["running"]:
            redo_var.set(REDO_CHOICES[STATE["redo"]])
            return
        STATE["redo"] = REDO_CHOICES.index(redo_var.get())
        reload_plan()

    redo_cb.bind("<<ComboboxSelected>>", on_redo)

    ENG_CHOICES = ["Azure Speech（動用點數）", "edge-tts（免費，目前常 403）"]
    eng_var = tk.StringVar(value=ENG_CHOICES[0 if ENGINE == "azure" else 1])
    ttk.Label(bar2, text="　引擎：").pack(side="left")
    eng_cb = ttk.Combobox(bar2, textvariable=eng_var, values=ENG_CHOICES, state="readonly", width=26)
    eng_cb.pack(side="left")

    def on_eng(_e=None):
        global ENGINE
        if S["running"]:
            eng_var.set(ENG_CHOICES[0 if ENGINE == "azure" else 1])
            return
        ENGINE = "azure" if eng_var.get() == ENG_CHOICES[0] else "edge-tts"
        log(f"引擎改為：{ENGINE}" + ("　" + credit_line(root) if ENGINE == "azure" else ""))
        reload_plan()

    eng_cb.bind("<<ComboboxSelected>>", on_eng)

    reload_plan()
    log(f"目前引擎：{ENGINE}" + ("　" + credit_line(root) if ENGINE == "azure" else ""))
    if not S["groups"]:
        log("✔ 所有音檔都齊了，沒有需要產生的檔案。")
    poll()
    win.mainloop()
    return S["result"]


def part_status(root: Path, spec: Spec):
    """題庫選擇用：回傳 (可用?, 說明文字)。"""
    if not (root / spec.file).exists():
        return False, f"（找不到 {spec.file}）"
    try:
        n = sum(len(g["jobs"]) for g in spec.plan(root))
    except Exception as e:
        return False, f"（讀取失敗：{type(e).__name__}）"
    return True, (f"缺 {n} 個檔" if n else "✔ 音檔都齊了")


def pick_part_gui(root: Path):
    import tkinter as tk
    from tkinter import ttk

    win = tk.Tk()
    win.title("補錄音檔：選擇題庫")
    win.geometry("520x470")
    ttk.Label(win, text=f"專案：{root}", foreground="#555").pack(anchor="w", padx=12, pady=(10, 6))
    ttk.Label(win, text="要補錄哪個題庫的音檔？", font=("", 11, "bold")).pack(anchor="w", padx=12)
    choice = {"v": None}
    box = ttk.Frame(win)
    box.pack(fill="both", expand=True, padx=12, pady=8)
    for key in ORDER:
        sp = SPECS[key]
        ok, note = part_status(root, sp)
        row = ttk.Frame(box)
        row.pack(fill="x", pady=2)

        def pick(k=key):
            choice["v"] = k
            win.destroy()

        ttk.Button(row, text=sp.title, width=22, command=pick, state="normal" if ok else "disabled").pack(side="left")
        ttk.Label(row, text=note, foreground="#555" if ok else "#a33").pack(side="left", padx=10)
    ttk.Button(win, text="離開", command=win.destroy).pack(pady=(0, 10))
    win.mainloop()
    return SPECS[choice["v"]] if choice["v"] else None


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


def run_cli(root: Path, spec: Spec, dry: bool):
    groups = spec.plan(root)
    if not groups:
        print("✔ 所有音檔都齊了，沒有需要產生的檔案。")
        if spec.daily:
            write_manifest(root)
        return
    total = sum(len(g["jobs"]) for g in groups)
    unit = spec.unit
    all_chars = sum(job_chars(j) for g in groups for j in g["jobs"])
    all_cost = sum(job_cost(j) for g in groups for j in g["jobs"])
    print("=" * 78)
    print(f"題庫       : {spec.title}")
    print(f"專案資料夾 : {root}")
    print(f"引擎       : {ENGINE}" + ("　" + credit_line(root) if ENGINE == "azure" else ""))
    print(f"版本紀錄   : {log_path(root)}　重錄範圍 {STATE['redo']}（0＝只補缺／1＝含版本不同／2＝再含無紀錄舊檔），"
          f"其中重錄 {sum(1 for g in groups for j in g['jobs'] if j.get('redo'))} 個")
    if spec.daily:
        print(f"文章存放   : {root / 'audio' / 'daily'}\n詳解存放   : {root / VOCAB_SUB}\n缺 {total} 個檔")
    else:
        print(f"句子存放   : {root / 'audio' / spec.sub}")
        if spec.letters:
            print(f"字母存放   : {root / 'audio'}")
        print(f"語速 {spec.cfg['rate']}　缺 {total} 個檔")
    print(f"字元估算   : 全部缺的檔共約 {all_chars:,} 字元（約 US${all_cost:.3f}，HD 聲音以 US${PRICE_HD_USD_PER_M_CHARS:.0f}/百萬字元估算，僅供參考）")
    print("=" * 78)
    for n, g in enumerate(groups, 1):
        if spec.daily:
            print(f"{n:>3}. [{g['kind']}] {g['key']:<28} 缺 {len(g['jobs']):>2}/{g['total']:<2} {g['jobs'][0]['text'][:40]!r}")
        else:
            smp = g.get("sample") or g["jobs"][0]["text"]
            print(f"{n:>3}. {g['key']:<12} 缺 {len(g['jobs']):>2}/{g['total']:<2} {g['voice']:<{spec.cli_vw}} {smp}")
    if dry:
        print("\n（--dry 模式：只列清單）")
        return
    print("\n請選擇這次要做哪些（可混用，用逗號分隔）：")
    print(f"  全部：all　　前 N {unit}：前10　　編號：1,3,5-8　　{spec.cli_prefix}　　直接 Enter：取消")
    sel = parse_selection(input("> "), groups)
    if not sel:
        print(f"沒有選任何{unit}，已取消。")
        return
    jobs = [j for i in sel for j in groups[i]["jobs"]]
    print(f"\n將產生 {len(sel)} {unit}、{len(jobs)} 個檔（約 {spec.est_minutes(len(jobs))} 分鐘）。")
    if not spec.daily:
        for i in sel:
            for j in groups[i]["jobs"]:
                if spec.log_style == "cut60…":
                    body = j["text"][:70] + "…"
                elif spec.detail_sp and "sp" in j:
                    body = f"{j['sp']}: {j['text']}"
                else:
                    body = j["text"]
                print(f"   {j['path']}   {body}")
    if input("確定開始？(Y/n) ").strip().lower() in ("n", "no"):
        return
    ok, bad, _ = generate(jobs, spec, print, lambda d, t: None, threading.Event(), root)
    print(f"\n完成：成功 {ok}，失敗 {bad}。")
    if spec.daily:
        write_manifest(root)
    if ok and (root / "Scan總表與音檔.py").exists():
        tip = "要順便執行 Scan總表與音檔.py 更新 audio/index.json 嗎？(Y/n) " if spec.daily else "要順便執行 Scan總表與音檔.py 更新 index.json 嗎？(Y/n) "
        if input(tip).strip().lower() not in ("n", "no"):
            run_scan(root, print)
    print("網頁請按 Ctrl+F5 重新整理。再次執行本程式可以做下一批。")


def pick_part_cli(root: Path):
    print("要補錄哪個題庫的音檔？")
    for n, key in enumerate(ORDER, 1):
        sp = SPECS[key]
        print(f"  {n}. {sp.title:<16} {part_status(root, sp)[1]}")
    ans = input("輸入編號（直接 Enter 離開）> ").strip()
    if ans.isdigit() and 1 <= int(ans) <= len(ORDER):
        return SPECS[ORDER[int(ans) - 1]]
    return resolve_part(ans) and SPECS[resolve_part(ans)]


def main():
    args = sys.argv[1:]
    flags = {a for a in args if a.startswith("--")}
    global ENGINE
    if "--edge" in flags:
        ENGINE = "edge-tts"
    elif "--azure" in flags:
        ENGINE = "azure"
    if "--check-azure" in flags:
        sys.exit(check_azure())
    if "--usage" in flags:
        print(credit_line(find_root() or HERE))
        return
    pos = [a for a in args if not a.startswith("--")]
    if "--redo-all" in flags:
        STATE["redo"] = 2
    elif "--redo" in flags:
        STATE["redo"] = 1
    spec = None
    if pos:
        key = resolve_part(pos[0])
        if not key:
            print("用法：python auto-speech.py [part1|part2|part3|part4|part5|part6|part7|daily] [--cli] [--dry] [--manifest]")
            return
        spec = SPECS[key]
    elif "--manifest" in flags:
        spec = SPECS["daily"]

    root = find_root(spec)
    if not root:
        names = spec.file if spec else "part1.json、part2.json、…、daily.json"
        print(f"找不到 {names}。請把本檔案放在題庫 json 所在的資料夾（或 audio 資料夾內）。")
        input("\n按 Enter 結束…")
        return
    if "--manifest" in flags:
        write_manifest(root)
        return

    want_cli = "--cli" in flags or "--dry" in flags
    if not want_cli:
        try:
            import tkinter  # noqa: F401
        except ImportError:
            print("這台電腦的 Python 沒有 tkinter，改用文字模式。")
            want_cli = True

    if want_cli:
        spec = spec or pick_part_cli(root)
        if not spec:
            return
        run_cli(find_root(spec) or root, spec, "--dry" in flags)
        if "--dry" not in flags:
            try:
                input("\n按 Enter 結束…")
            except EOFError:
                pass
        return

    while True:
        spec = spec or pick_part_gui(root)
        if not spec:
            return
        sroot = find_root(spec)
        if not sroot:
            print(f"找不到 {spec.file}。")
            input("\n按 Enter 結束…")
            return
        if run_gui(sroot, spec) != "switch":
            return
        spec = None


if __name__ == "__main__":
    main()
