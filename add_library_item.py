#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把「TSL 字庫」虛擬項目加進 daily.json（只需要執行一次；已經有就什麼都不做）。

字庫（week 0 / day 1 / library:true）專門裝「還沒有任何文章用到」的 TSL 單字的通用詳解：
  TSL 總表點一個字 → 詳解頁複製 AI 提示詞 → AI 回傳 w0d1_extra.json → json_merge.py 合併 → 重新執行 Scan總表與音檔.py。
之後有文章用到同一個字，json_merge 的「同一個字全題庫只留一份」規則會把文章補丁併進字庫那一筆。

用法：python add_library_item.py            （處理同資料夾的 daily.json）
      python add_library_item.py 路徑\\daily.json
會先備份成 daily.json.bak_時間，格式與 json_merge.py 相同（UTF-8、縮排 2）。
"""
import json, os, shutil, sys
from datetime import datetime

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'daily.json')
if not os.path.isfile(path):
    sys.exit('找不到 %s' % path)

with open(path, encoding='utf-8') as f:
    data = json.load(f)
items = data if isinstance(data, list) else data.get('items')
if not isinstance(items, list):
    sys.exit('daily.json 格式不認得（要是陣列，或 { "_spec": …, "items": […] }）')

if any(isinstance(x, dict) and x.get('library') for x in items):
    print('daily.json 已經有 TSL 字庫項目，不需要再加。')
    sys.exit(0)
if any(isinstance(x, dict) and x.get('week') == 0 and x.get('day') == 1 for x in items):
    sys.exit('daily.json 已經有 W0D1，但不是字庫項目（沒有 library:true）。請先確認，不要覆蓋。')

lib = {
    'week': 0,
    'day': 1,
    'tag': 'TSL 字庫',
    'library': True,
    'passage': '（TSL 字庫：沒有內文，只放通用詳解）',
}
items.insert(0, lib)

bak = path + '.bak_' + datetime.now().strftime('%Y%m%d_%H%M%S')
shutil.copy2(path, bak)
with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print('已加入 TSL 字庫（W0D1）。備份：%s' % bak)
