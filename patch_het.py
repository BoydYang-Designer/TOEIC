#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_het.py —— 把「字尾差異不算同字不同音」的防呆，自動套用到 hetero.js 與 auto-speech.py。
用法：放在 hetero.js、auto-speech.py 同一個資料夾，雙擊或執行 python patch_het.py。
會先把原檔備份成 .bak；已經改過就會略過，可重複執行。"""
from pathlib import Path

HERE = Path(__file__).resolve().parent

JS_ADD_OLD = "const htIpaN = s => String(s || '').toLowerCase().replace(/[\\/\\s]/g, '').replace(/[ːˌ]/g, '').replace(/[ɪəɚʌᵻ]/g, 'ə');\n"
JS_ADD_NEW = JS_ADD_OLD + "const htSfx = (a, b) => a !== b && ((b.startsWith(a) && b.length - a.length <= 3) || (a.startsWith(b) && a.length - b.length <= 3)); // 只差字尾（revise／revised）不算不同念法\n"
JS_USE_OLD = "    if (new Set(list.map(r => htIpaN(r.o.ipa))).size < 2) return;\n"
JS_USE_NEW = ("    const vs = [...new Set(list.map(r => htIpaN(r.o.ipa)))];\n"
              "    if (!vs.some((a, i) => vs.some((b, j) => j > i && !htSfx(a, b)))) return;\n")

PY_ADD_OLD = 'def het_say(w, pos):'
PY_ADD_NEW = ('def ipa_sfx(a, b):\n'
              '    """只差字尾（revise／revised）不算不同念法；與網頁 hetero.js 的 htSfx 一致"""\n'
              '    return a != b and ((b.startswith(a) and len(b) - len(a) <= 3) or (a.startswith(b) and len(a) - len(b) <= 3))\n\n\n'
              + PY_ADD_OLD)
PY_USE_OLD = ('        if len({ipa_norm(o["ipa"]) for _, _, _, o in lst}) < 2:\n'
              '            continue\n')
PY_USE_NEW = ('        vs = sorted({ipa_norm(o["ipa"]) for _, _, _, o in lst})\n'
              '        if not any(not ipa_sfx(a, b) for i, a in enumerate(vs) for b in vs[i + 1:]):\n'
              '            continue\n')


def patch(name, steps, marker):
    p = HERE / name
    if not p.exists():
        print(f"✗ 找不到 {name}（請放在同一個資料夾）")
        return
    t = p.read_text(encoding="utf-8")
    if marker in t:
        print(f"－ {name} 已經改過，略過")
        return
    for old, new in steps:
        if old not in t:
            print(f"✗ {name} 找不到要取代的段落，請改用手動修改（可能版本不同）：\n{old}")
            return
        t = t.replace(old, new, 1)
    (HERE / (name + ".bak")).write_text(p.read_text(encoding="utf-8"), encoding="utf-8")
    p.write_text(t, encoding="utf-8")
    print(f"✓ {name} 已修改（原檔備份為 {name}.bak）")


patch("hetero.js", [(JS_ADD_OLD, JS_ADD_NEW), (JS_USE_OLD, JS_USE_NEW)], "htSfx")
patch("auto-speech.py", [(PY_ADD_OLD, PY_ADD_NEW), (PY_USE_OLD, PY_USE_NEW)], "ipa_sfx")
try:
    input("\n按 Enter 結束…")
except EOFError:
    pass
