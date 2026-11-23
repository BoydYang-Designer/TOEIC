#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ipa_fill.py — 幫 daily.json 的詳解補上「單字音標 ipa」

補的欄位（只補沒有 ipa 的「單字」，片語不補；已有 ipa 的一律不動）：
  extra_vocab[].senses[]          多義（該詞性的讀音）
  extra_vocab[].confusable[]      易混淆（word／phrase 是單字才補）
  extra_vocab[].similar[]         近義（phrase／word 是單字才補）
  extra_vocab[].collocations[]    常用搭配（phrase 是單字才補，很少）

音標來源，優先順序：
  1. --answer 檔（你或 AI 手動確認的 {單字: 音標}）
  2. 多義：同詞性的 pos_uses → 主字音標（詞性相同時）
  3. 題庫裡這個字已經出現過的音標（主字、forms、family、derived、pos_uses、key_words）
  4. CMUdict（美式）轉成題庫慣用的 IPA 寫法（需要 pip install cmudict）
  念法不只一種、或查不到的字，不會亂填，會寫進 ipa_todo.json，
  並產生 ipa_todo_prompt.txt 讓 AI 只回 {單字: 音標}，存成 ipa_answer.json 後再用 --answer 套用。

用法：
  python ipa_fill.py daily.json                    # 乾跑：只印報告、輸出 ipa_todo.*，不改 daily.json
  python ipa_fill.py daily.json --write            # 真的寫入（先備份成 daily.json.bak_ipa）
  python ipa_fill.py daily.json --answer ipa_answer.json --write
  python ipa_fill.py daily.json --selftest         # 用題庫現有音標檢查 CMUdict 轉換準不準
"""
import argparse, collections, json, os, re, shutil, sys

try:
    import cmudict
    CMU = cmudict.dict()
except Exception:  # 沒裝也能跑，只是少了 CMUdict 這個來源
    CMU = None

# ---------------------------------------------------------------- IPA 工具
# 題庫現有的寫法有兩種並存（ɚ／ər、ɛ／e、g／ɡ、ɝ／ɜːr），比較時先統一成同一寫法
def canon(ipa):
    s = ipa.strip().strip('/')
    for a, b in (('ɝ', 'ɜːr'), ('ɚ', 'ər'), ('ɛ', 'e'), ('g', 'ɡ'), ('ɪə', 'ɪr'), ('ɑr', 'ɑːr'), ('ɔr', 'ɔːr')):
        s = s.replace(a, b)
    return s

def gkey(ipa):
    """判斷「是不是同一種念法」用：忽略次重音、ɪ／ə、字尾 əl／ən 與 l／n 的寫法差異；
    主重音位置與母音仍保留，所以 record 名詞／動詞這種真正不同的念法不會被併在一起"""
    s = canon(ipa).replace('ːː', 'ː').replace('rː', 'r').replace('ˌ', '').replace('ɪ', 'ə').replace('ː', '')
    s = re.sub(r'ə(?=[ln]$)', '', s)
    return re.sub(r'[ə]{2,}', 'ə', s)


ARPA = {
    'AA': 'ɑː', 'AE': 'æ', 'AH': 'ʌ', 'AO': 'ɔː', 'AW': 'aʊ', 'AY': 'aɪ', 'EH': 'e', 'ER': 'ɜːr',
    'EY': 'eɪ', 'IH': 'ɪ', 'IY': 'iː', 'OW': 'oʊ', 'OY': 'ɔɪ', 'UH': 'ʊ', 'UW': 'uː',
    'B': 'b', 'CH': 'tʃ', 'D': 'd', 'DH': 'ð', 'F': 'f', 'G': 'ɡ', 'HH': 'h', 'JH': 'dʒ', 'K': 'k',
    'L': 'l', 'M': 'm', 'N': 'n', 'NG': 'ŋ', 'P': 'p', 'R': 'r', 'S': 's', 'SH': 'ʃ', 'T': 't',
    'TH': 'θ', 'V': 'v', 'W': 'w', 'Y': 'j', 'Z': 'z', 'ZH': 'ʒ',
}
VOWELS = {'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW'}
# 英文音節可以當「詞首子音群」的組合（最大起首原則用）
ONSETS = {
    ('P', 'R'), ('P', 'L'), ('B', 'R'), ('B', 'L'), ('T', 'R'), ('D', 'R'), ('K', 'R'), ('K', 'L'),
    ('G', 'R'), ('G', 'L'), ('F', 'R'), ('F', 'L'), ('TH', 'R'), ('SH', 'R'), ('T', 'W'), ('K', 'W'),
    ('D', 'W'), ('S', 'W'), ('S', 'P'), ('S', 'T'), ('S', 'K'), ('S', 'M'), ('S', 'N'), ('S', 'L'),
    ('S', 'F'), ('HH', 'Y'), ('P', 'Y'), ('B', 'Y'), ('T', 'Y'), ('D', 'Y'), ('K', 'Y'), ('G', 'Y'),
    ('F', 'Y'), ('V', 'Y'), ('M', 'Y'), ('N', 'Y'), ('L', 'Y'), ('S', 'Y'), ('TH', 'W'), ('G', 'W'),
    ('S', 'P', 'R'), ('S', 'P', 'L'), ('S', 'T', 'R'), ('S', 'K', 'R'), ('S', 'K', 'W'), ('S', 'K', 'L'),
    ('S', 'P', 'Y'), ('S', 'T', 'Y'), ('S', 'K', 'Y'),
}


def arpa_to_ipa(phones):
    ph = []  # (base, stress or None)
    for p in phones:
        m = re.match(r'([A-Z]+)([012])?$', p)
        ph.append((m.group(1), m.group(2)))
    # 音節切分：每個母音是一個音節核心；子音群依「最大起首」分給後一個音節
    nuclei = [i for i, (b, _) in enumerate(ph) if b in VOWELS]
    if not nuclei:
        return None
    starts = []  # 每個音節起首（含起首子音）在 ph 的 index
    for k, n in enumerate(nuclei):
        if k == 0:
            starts.append(0)
            continue
        prev = nuclei[k - 1]
        cons = [ph[j][0] for j in range(prev + 1, n)]
        take = 0
        for L in range(min(3, len(cons)), 0, -1):
            if L == 1 or tuple(cons[-L:]) in ONSETS:
                take = L
                break
        starts.append(n - take)
    out = []
    for k, n in enumerate(nuclei):
        st = ph[n][1]
        seg_start = starts[k]
        seg_end = starts[k + 1] if k + 1 < len(nuclei) else len(ph)
        mark = 'ˈ' if st == '1' else ('ˌ' if st == '2' else '')
        if len(nuclei) == 1:
            mark = ''  # 題庫慣例：單音節字不標重音（slɪm、bæn、flɔːr）
        syl = ''
        for j in range(seg_start, seg_end):
            b, s = ph[j]
            if b == 'AH':
                sym = 'ə' if s == '0' else 'ʌ'
            elif b == 'ER':
                sym = 'ər' if s == '0' else 'ɜːr'
            elif b == 'AE' and s == '0':
                sym = 'ə'  # CMUdict 的 ad-／ac-／un- 開頭弱讀
            elif b == 'IY' and s == '0':
                # 後面接子音（restrict、decode）寫 ɪ；字尾或後面接母音（happy、period）寫 i
                sym = 'ɪ' if j + 1 < len(ph) and ph[j + 1][0] not in VOWELS else 'i'
            elif b == 'UW' and s == '0':
                sym = 'u'
            else:
                sym = ARPA[b]
            syl += sym
        out.append(mark + syl)
    res = ''.join(out)
    res = re.sub(r'ɪti$', 'əti', res)  # 題庫慣例：-ity 寫 əti（143 比 3）
    return '/' + res + '/'


def cmu_ipa(word):
    """回傳 [不同念法轉出的 IPA（去重）]；查不到回 []"""
    if CMU is None or word not in CMU:
        return []
    seen, res = set(), []
    for pr in CMU[word]:
        v = arpa_to_ipa(pr)
        if v and gkey(v) not in seen:
            seen.add(gkey(v))
            res.append(v)
    return res


# ---------------------------------------------------------------- 資料處理
OKWORD = re.compile(r"^[a-z][a-z'\-]*$")


def single(s):
    return bool(s) and not re.search(r'\s', str(s).strip())


def key_of(s):
    return str(s).strip().lower()


def load(path):
    raw = open(path, 'rb').read()
    crlf = b'\r\n' in raw
    text = raw.decode('utf-8').replace('\r\n', '\n')
    return json.loads(text), text, crlf


def dump(data, crlf):
    s = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    return s.replace('\n', '\r\n') if crlf else s


def collect_known(data):
    """word -> Counter(ipa)；來自已經有音標的欄位"""
    known = collections.defaultdict(collections.Counter)

    def add(w, ipa):
        if w and ipa and single(w):
            known[key_of(w)][str(ipa).strip()] += 1

    for a in data['items']:
        for e in a.get('extra_vocab') or []:
            if e.get('type', 'word') == 'word':
                add(e.get('text') or e.get('word'), e.get('ipa'))
            for k, wk in (('forms', ('w',)), ('family', ('w',)), ('derived', ('w',)), ('key_words', ('w',))):
                for o in e.get(k) or []:
                    if isinstance(o, dict):
                        add(o.get(wk[0]), o.get('ipa'))
            for o in e.get('pos_uses') or []:
                if isinstance(o, dict):
                    add(o.get('w') or e.get('lemma') or e.get('text'), o.get('ipa'))
            for k in ('confusable', 'similar', 'collocations'):
                for o in e.get(k) or []:
                    if isinstance(o, dict):
                        add(o.get('word') or o.get('phrase') or o.get('p'), o.get('ipa'))  # 已補過的也算
    return known


def group_known(counter):
    """把寫法不同但其實一樣的音標併成一組，每組取最常見的寫法；回傳 [(代表寫法, 次數)]"""
    groups = collections.defaultdict(list)
    for ipa, n in counter.items():
        groups[gkey(ipa)].append((ipa, n))
    res = []
    for g in groups.values():
        g.sort(key=lambda x: -x[1])
        res.append((g[0][0], sum(n for _, n in g)))
    res.sort(key=lambda x: -x[1])
    return res


class Resolver:
    def __init__(self, known, answers):
        self.known, self.answers = known, answers
        self.todo = {}   # word -> {candidates, ctx, where}
        self.from_cmu = {}  # 靠 CMUdict 填的字（輸出成 ipa_filled_cmudict.txt 方便抽查）
        self.bad = {}    # 資料有問題的字

    def ipa_of(self, word, ctx='', where=''):
        w = key_of(word)
        if w in self.answers:
            return self.answers[w], 'answer'
        if not OKWORD.match(w):
            if not re.search(r'[a-z]', w) or re.search(r'[^\x00-\x7f]', w):
                self.bad[word] = where
            self.todo.setdefault(w, {'candidates': [], 'ctx': ctx, 'where': set()})['where'].add(where)
            return None, 'todo'
        gk = group_known(self.known[w]) if w in self.known else []
        if len(gk) == 1:
            return gk[0][0], 'dataset'
        cands = [x[0] for x in gk]
        if not cands:
            cm = cmu_ipa(w)
            if len(cm) == 1:
                self.from_cmu[w] = cm[0]
                return cm[0], 'cmudict'
            cands = cm
        t = self.todo.setdefault(w, {'candidates': cands, 'ctx': ctx, 'where': set()})
        t['where'].add(where)
        if ctx and not t['ctx']:
            t['ctx'] = ctx
        return None, 'todo'


def put(o, ipa, after_key_candidates):
    """把 ipa 插在指定欄位後面，保持欄位順序好讀"""
    items = list(o.items())
    o.clear()
    placed = False
    for k, v in items:
        o[k] = v
        if not placed and k in after_key_candidates:
            o['ipa'] = ipa
            placed = True
    if not placed:
        o['ipa'] = ipa


def process(data, resolver, stats):
    def need(o):
        return isinstance(o, dict) and not (o.get('ipa') and str(o['ipa']).strip())

    for a in data['items']:
        for e in a.get('extra_vocab') or []:
            typ = e.get('type', 'word')
            head = e.get('text') or e.get('word') or ''
            lemma = e.get('lemma') or head
            pos_ipa = {}
            for o in e.get('pos_uses') or []:
                if isinstance(o, dict) and o.get('ipa') and key_of(o.get('w') or lemma) == key_of(lemma):
                    pos_ipa.setdefault(o.get('pos'), o['ipa'])
            if typ == 'word':
                for o in e.get('senses') or []:
                    if not need(o):
                        continue
                    ctx = (o.get('example') or {}).get('en', '')
                    ipa = src = None
                    if key_of(lemma) in resolver.answers:
                        ipa, src = resolver.ipa_of(lemma)
                    elif o.get('pos') in pos_ipa:
                        ipa, src = pos_ipa[o['pos']], 'pos_uses'
                    elif key_of(lemma) == key_of(head) and e.get('ipa') and o.get('pos') == e.get('pos'):
                        ipa, src = e['ipa'], 'main'
                    else:
                        ipa, src = resolver.ipa_of(lemma, ctx, 'senses')
                    if ipa:
                        put(o, ipa, ('pos',))
                        stats[('senses', src)] += 1
                    else:
                        stats[('senses', 'todo')] += 1
            if typ in ('word', 'phrase'):
                for sec, keys in (('confusable', ('word', 'phrase')), ('similar', ('phrase', 'word')), ('collocations', ('phrase', 'p'))):
                    for o in e.get(sec) or []:
                        if not need(o):
                            continue
                        w = next((o[k] for k in keys if o.get(k)), '')
                        if not single(w):
                            continue
                        ipa, src = resolver.ipa_of(w, (o.get('example') or {}).get('en', ''), sec)
                        if ipa:
                            put(o, ipa, keys)
                            stats[(sec, src)] += 1
                        else:
                            stats[(sec, 'todo')] += 1


TODO_PROMPT = """你是英語教材編輯。下面是一份單字清單，請替每個單字給「美式 IPA 音標」。

【寫法（請完全照這個風格，才能和現有題庫一致）】
・用斜線包住，例如 /kənˈfɜːrm/、/ˈskedʒuːl/
・母音用：ɑː、ɔː、iː、uː、oʊ、eɪ、aɪ、ɔɪ、aʊ、æ、e、ɪ、ʊ、ʌ、ə；r 結尾的字尾寫 ər（如 /ˈmænɪdʒər/）
・重音 ˈ（主）、ˌ（次），放在該音節前面；不要加音節點「.」
・g 用 ɡ（U+0261）
・連字號複合字（如 well-kept）：每個部分各寫音標，中間用空格隔開，各自標重音（/wel ˈkept/）；縮寫字母（如 TSA）用字母唸法（/ˌtiː es ˈeɪ/）

【清單】每筆有：
・w：單字
・candidates（可能有）：已知的幾種念法，請依 ctx 的語境挑最符合的那一個（原樣照抄），或自行修正
・ctx（可能有）：這個字出現的例句，用來判斷詞性與念法
{items}

【輸出】
請直接產生一個可下載的 JSON 檔案 ipa_answer.json（UTF-8、純 JSON、不要包 markdown 程式碼框），格式是 {{"單字小寫": "/音標/"}}，清單上每個單字都要有，不要加其他欄位。聊天裡只需一句話說明檔案已產生。若無法產生檔案，才改成只輸出一個 json 程式碼區塊。
"""


def loose(ipa):
    # 只用來評估：忽略重音符號、unstressed ɪ／ə 差異、音節性鼻音／邊音前的 ə
    s = canon(ipa).replace('ˈ', '').replace('ˌ', '').replace('ɪ', 'ə').replace('ː', '')
    return re.sub(r'ə(?=[nlm]\b|[nlm]$)', '', s)


def selftest(data, known):
    if CMU is None:
        print('沒有 cmudict：請先 pip install cmudict'); return
    ok = tot = okl = 0
    bad = []
    for w, cnt in known.items():
        if not OKWORD.match(w):
            continue
        cm = cmu_ipa(w)
        if not cm:
            continue
        tot += 1
        gk = {canon(i) for i, _ in group_known(cnt)}
        gl = {loose(i) for i, _ in group_known(cnt)}
        if any(loose(c) in gl for c in cm):
            okl += 1
        if any(canon(c) in gk for c in cm):
            ok += 1
        elif not any(loose(c) in gl for c in cm) and len(bad) < 40:
            bad.append((w, [g for g in gk][:2], [canon(c) for c in cm][:2]))
    print('CMUdict 轉換 vs 題庫現有音標：%d / %d 完全一致（%.1f%%）' % (ok, tot, 100.0 * ok / max(tot, 1)))
    print('忽略重音位置符號與 ɪ／ə 寫法差異後：%d / %d（%.1f%%）' % (okl, tot, 100.0 * okl / max(tot, 1)))
    print('以下是「連音素都對不上」的字（可能是 CMUdict 與題庫念法不同，值得抽查）：')
    for b in bad:
        print('  不一致', b)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('json')
    ap.add_argument('--write', action='store_true', help='真的寫回 daily.json（先備份）')
    ap.add_argument('--answer', help='ipa_answer.json：{單字: 音標}')
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--force', action='store_true', help='格式無法原樣還原時仍強制寫入')
    args = ap.parse_args()

    data, text, crlf = load(args.json)
    known = collect_known(data)
    if args.selftest:
        selftest(data, known); return
    answers = {}
    if args.answer:
        for k, v in json.load(open(args.answer, encoding='utf-8')).items():
            v = str(v).strip()
            if not v:
                continue
            if not v.startswith('/'):
                v = '/' + v
            if not v.endswith('/'):
                v += '/'
            answers[key_of(k)] = v
    if CMU is None:
        print('⚠ 沒有安裝 cmudict，少一個音標來源（pip install cmudict）；查不到的字會全部進 ipa_todo.json')

    resolver = Resolver(known, answers)
    stats = collections.Counter()
    process(data, resolver, stats)

    print('=== 補音標報告（%s）===' % ('寫入模式' if args.write else '乾跑，不會改 daily.json'))
    for sec in ('senses', 'confusable', 'similar', 'collocations'):
        row = {s: n for (k, s), n in stats.items() if k == sec}
        if row:
            print('%-13s %s' % (sec, '  '.join('%s=%d' % (s, n) for s, n in sorted(row.items()))))
    todo = resolver.todo
    print('待 AI／人工確認的單字：%d 個（寫在 ipa_todo.json）' % len(todo))
    if resolver.bad:
        print('⚠ 這些單字欄位的內容不是純英文單字，請先修資料：', '、'.join(sorted(resolver.bad)))

    base = os.path.dirname(os.path.abspath(args.json))
    if resolver.from_cmu:
        with open(os.path.join(base, 'ipa_filled_cmudict.txt'), 'w', encoding='utf-8') as f:
            f.write('\n'.join('%s\t%s' % (w, v) for w, v in sorted(resolver.from_cmu.items())) + '\n')
        print('靠 CMUdict 填的 %d 個字已列在 ipa_filled_cmudict.txt，建議掃過一遍' % len(resolver.from_cmu))
    if todo:
        items = []
        for w, t in sorted(todo.items()):
            it = {'w': w}
            if t['candidates']:
                it['candidates'] = t['candidates']
            if t['ctx']:
                it['ctx'] = t['ctx']
            items.append(it)
        json.dump({'count': len(items), 'words': items, 'where': {w: sorted(t['where']) for w, t in todo.items()}},
                  open(os.path.join(base, 'ipa_todo.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        lines = '\n'.join('・' + json.dumps(it, ensure_ascii=False) for it in items)
        open(os.path.join(base, 'ipa_todo_prompt.txt'), 'w', encoding='utf-8').write(TODO_PROMPT.format(items=lines))
        print('已輸出 ipa_todo.json、ipa_todo_prompt.txt（把 prompt 貼給 AI → 存成 ipa_answer.json → 加 --answer 再跑一次）')

    if args.write:
        if dump(json.loads(text), crlf) != text.replace('\n', '\r\n' if crlf else '\n'):
            if not args.force:
                print('✗ 這份 JSON 重新輸出後格式和原檔不完全一樣，為了不弄亂 diff 先中止；確定要寫入請加 --force'); sys.exit(1)
        bak = args.json + '.bak_ipa'
        if not os.path.exists(bak):
            shutil.copyfile(args.json, bak)
        with open(args.json, 'w', encoding='utf-8', newline='') as f:
            f.write(dump(data, crlf))
        print('✓ 已寫入 %s（備份：%s）' % (args.json, bak))
    else:
        print('（乾跑：沒有改任何檔。確認報告沒問題後加 --write）')


if __name__ == '__main__':
    main()
