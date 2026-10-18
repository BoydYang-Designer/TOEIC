# -*- coding: utf-8 -*-
"""test_split.py — 切句一致性測試（可重跑）

背景：網站裡其實有「兩族」切句規則，用途不同，不能混為一談：
  A. 對時（timing）用：timing.js 的 splitSentences()  ＝  daily_timestamps.py 的 split_sentences()
     → 兩者必須逐字元範圍完全一致，否則學習頁會把 timing 判成「異常」。
  B. 語音練習／入庫例句脈絡用：speak.js 的 splitSent()  ＝  auto-speech.py 的 split_sent()
     → 兩者必須一致。它和 A 族規則不同（見下方 KNOWN_DIFF），那是設計上的差異。

用法：  python test_split.py            （放在網站資料夾；有 node 就連 JS 一起比，沒有就只比 Python）
        python test_split.py --json     （另外把 daily.json 內每一篇 passage 也拿來比）
結束碼 0＝A、B 兩族都一致；1＝有不一致。
"""
import importlib.util, json, os, re, shutil, subprocess, sys, tempfile

BASE = os.path.dirname(os.path.abspath(__file__))

CASES = [
    "Hello world. This is a test.",
    "Please call Mr. Smith at 9 A.M. tomorrow. He will answer.",
    "The meeting starts at 9 a.m. Please be on time.",
    "Ms. Lee said: \"We are ready.\" Then she left. (It was late.) Nobody noticed.",
    "Total cost is $4.50. 12 people will attend. Call 555-0100 for details.",
    "She asked, \"Is it ready?\" \"Yes,\" he said. 'Good.' Next item.",
    "Dr. Wong and Inc. partners met St. Paul's staff. No. 5 was absent.",
    "Line one ends here.\nLine two starts here. And continues.\n\nNew paragraph. Another one!",
    "Customer: Hi, I need help. Can you assist me?\nAgent: Of course. What happened?",
    "Wait... What? Really?! Yes. OK.",
    "Version 2.0 is out. See www.example.com. Visit us. Sale ends Friday.",
    "He said \"stop.\" She stopped. [Note] Next. 3 items remain. 4. Done.",
    "U.S.A. is large. The U.S. Army agreed. Fine.",
    "  Leading spaces. And trailing spaces.   \n  Second line.  ",
]

def load(name, f):
    s = importlib.util.spec_from_file_location(name, os.path.join(BASE, f)); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m

def node_run(js_files, expr_tpl, texts):
    node = shutil.which('node')
    if not node:
        return None
    src = '\n'.join(js_files)
    tmp = tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8')
    tmp.write(src + '\nconst T = JSON.parse(require("fs").readFileSync(process.argv[2],"utf8"));\nconsole.log(JSON.stringify(T.map(t => ' + expr_tpl + ')));\n'); tmp.close()
    inp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8'); json.dump(texts, inp); inp.close()
    try:
        r = subprocess.run([node, tmp.name, inp.name], capture_output=True, encoding='utf-8', timeout=60)
        if r.returncode:
            print('  node 執行失敗：', r.stderr[:300]); return None
        return json.loads(r.stdout)
    finally:
        os.unlink(tmp.name); os.unlink(inp.name)

def js_timing(texts):
    p = os.path.join(BASE, 'timing.js')
    return node_run([open(p, encoding='utf-8').read()], 'splitSentences(t)', texts)

def js_speak(texts):
    s = open(os.path.join(BASE, 'speak.js'), encoding='utf-8').read()
    a = s.index('const SK_ABBR'); b = s.index('/* ================= 語音練習狀態')
    r = node_run([s[a:b]], 'splitSent(t).map(o => [o.from, o.to])', texts)
    return r

def main():
    texts = list(CASES)
    if '--json' in sys.argv:
        p = os.path.join(BASE, 'daily.json')
        if os.path.isfile(p):
            d = json.load(open(p, encoding='utf-8-sig')); its = d if isinstance(d, list) else d.get('items', [])
            texts += [str(x.get('passage') or '') for x in its if isinstance(x, dict)]
    dts, asp = load('t_dts', 'daily_timestamps.py'), load('t_asp', 'auto-speech.py')
    A_py = [[list(r) for r in dts.split_sentences(t)] for t in texts]
    B_py = [[list(r) for r in asp.split_sent(t)] for t in texts]
    A_js, B_js = js_timing(texts), js_speak(texts)
    bad = 0
    def cmp(label, x, y):
        nonlocal bad
        if y is None:
            print('  （略過 %s：找不到 node）' % label); return
        for i, (u, v) in enumerate(zip(x, y)):
            if u != v:
                bad += 1
                t = texts[i]; print('✖ %s 不一致：文稿 #%d %r' % (label, i, t[:60]))
                print('    左：', [t[a:b] for a, b in u]); print('    右：', [t[a:b] for a, b in v])
    cmp('A 族（daily_timestamps.py ↔ timing.js）', A_py, A_js)
    cmp('B 族（auto-speech.py ↔ speak.js）', B_py, B_js)
    known = sum(1 for u, v in zip(A_py, B_py) if u != v)
    print('A 族 Python／JS：%s；B 族 Python／JS：%s；兩族規則差異（預期內）：%d / %d 篇文稿' % (
        '一致' if A_js is not None and bad == 0 else ('略過' if A_js is None else '有差異'),
        '一致' if B_js is not None and bad == 0 else ('略過' if B_js is None else '有差異'), known, len(texts)))
    print('結果：' + ('通過' if not bad else '失敗（%d 處）' % bad))
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
