import json, sys
w, d = int(sys.argv[1]), int(sys.argv[2])
j = json.load(open('daily.json', encoding='utf-8'))
items = j['items'] if isinstance(j, dict) else j
x = next(i for i in items if i['week'] == w and i['day'] == d)
print(json.dumps({'passage': x['passage'], 'zh': x['zh'], 'timing': x['timing']}, ensure_ascii=False, indent=1))