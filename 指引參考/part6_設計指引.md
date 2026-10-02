# Part 6 段落填空：給 AI 的設計指引

> 用途：把本文件整份交給 AI（Claude Code、ChatGPT 等），請它為 TOEIC Daily Coach 新增 **Part 6 段落填空** 模組。
> 同時附上現有的範本檔：`part5.html`、`part5.js`、`part5.json`、`index.html`、`audio_scan.py`、`json_merge.py`。
> 本文件有兩個用途：(A) 請 AI 寫網頁與工具程式（第 1、5–9 節）；(B) 請 AI 寫題目（第 2–4 節、第 10 節）。

---

## 1. 專案背景與不可破壞的既有慣例

這是靜態網站（GitHub Pages，**檔名大小寫有區別**），Tailwind CDN + `style.css`，不使用打包工具、不使用框架。Part 6 要和 Part 5 長得一樣、行為一致，請直接以 `part5.js` 當骨架改寫，不要重新發明。

| 項目 | Part 5 現況（Part 6 照做，僅改名） |
|---|---|
| 檔案 | `part5.html`（只有一個 `<main id="main">`）、`part5.js`（單檔）、`part5.json` → 新增 `part6.html`、`part6.js`、`part6.json` |
| 深淺色 | `KEY='toeicCoachV2'`，**只讀寫 `dark`**，不得覆蓋其他欄位 |
| 作答紀錄 | `localStorage['toeicPart5V1']` 內含 `rec / saved / rot / stat` → Part 6 用 `toeicPart6V1`，同樣四個欄位 |
| 題庫格式 | `{ "_spec": {...}, "items": [...] }`；`_spec` 內含 domains、tiers、points、traps、entry_schema、rules，維護頁的「AI 寫題目指令」從 `_spec` 組出來 |
| id 規則 | `d{1-7}-{3位數}-{e\|m\|h}`（主題 d1–d7 與 Part 5 相同：辦公室、餐廳飲食、商店購物、街道與交通、工地與倉庫、旅館與居家、戶外與公園；e/m/h＝初/中/高） |
| 難度 | 初級 500–550、中級 600–650、高級 700–800（`level:{score,cefr,tier,why}`，cefr 對照沿用 `part5.js` 的 `cefr()`） |
| 音訊 | 單一共用 `Audio` 元素、使用者點擊才播、切題／離開／分頁隱藏一定 `stop()`；有 mp3 就播 mp3，沒有就用瀏覽器 TTS（依 `voice` 選男女聲）；自成一體，不依賴 `audio.js`。直接複製 `part5.js` 第 72–134 行那一段（`AU`、`P`、`auLoad`、`speakOnce`、`playSent`、`stop`、`togglePlay`、`setRate`、`paintAudio`、`pagehide`／`visibilitychange`），把 `p5` 改成 `p6`。 |
| 練習時播音檔 | 練習模式作答前就有手動「▶ 播放」按鈕與 0.75×／1×／1.25×；**會念出答案是刻意的設計**（使用者要求）；模擬測驗模式不顯示播放鈕 |
| 維護頁 | 題數矩陣（主題×難度，格內「題數 · 🎧音檔完整數」）、考點題數與建議占比（偏少標黃）、「給 AI 的寫題目指令」（可複製）、單題展開檢視、「複製本格缺的音檔清單」 |
| 合併工具 | `json_merge.py` 以 Profile 類別擴充；副檔檔名前綴 `p5_` → 本模組用 `p6_`；寫入前自動備份 |
| 音檔掃描 | `audio/audio_scan.py` 產生 `audio/index.json`；網頁只對 `complete` 的題目用 mp3 |

**不要做的事**：不要改動 Part 1–5 的行為；不要引入新的 localStorage key 命名風格；不要把 `dark` 以外的資料寫進 `toeicCoachV2`；不要新增外部 CDN（除了現有 Tailwind）。

---

## 2. 考試規格（本模組依據）

資料來源：Prep Edu〈TOEIC Reading Part 6〉整理，加上現行多益 Reading 的標準版式。

- **4 篇文章 × 每篇 4 個空格 = 16 題**，每題 4 個選項 (A)–(D)。
- 每篇通常有 **1 題「句子插入」**（4 個選項是 4 個完整句子），其餘為文法題、詞彙題、連接詞／轉折詞題。
- 文章類型（參考網頁歸納）：公告 notice、書信／電子郵件 letter／email、文章 article、廣告 ad、說明指南 instructions、內部備忘錄 memo。本題庫用 `doc` 欄位標記：`email｜letter｜memo｜notice｜article｜ad｜instructions`。
- 三大考點：**文法**（詞性、動詞時態與語態、介系詞與連接詞）、**詞彙**（同義近義、形近字、搭配詞）、**語境理解／語意連貫**（轉折詞、插入句）。
- 網頁的建議解題流程（要融入 `clue.steps` 與介面提示的語氣）：①快速掃讀 30–45 秒抓文章類型與語氣 ②先做文法與詞彙題，句子插入留到最後 ③聚焦空格前後 2–3 個詞找線索 ④用刪去法。
- 網頁點出的華語學習者陷阱，要實際設計進干擾項：只看單字不看語境、時態標記詞不敏感、轉折詞功能混淆、插入句只憑語感。

> 備註：網頁標題寫「4 大題型」，內文實際只說明 3 種（文法／詞彙／句子插入）。本指引把「連接詞／轉折詞」獨立成第 4 類 `transition`，因為它的解題方式（要讀前後句）和一般文法題不同。

### 時間（本專案自訂，非官方）

Reading 共 75 分鐘、100 題（Part 5 約 11 分鐘、Part 6 約 8 分鐘）。Part 6 每篇建議作答時間：初級 100 秒、中級 120 秒、高級 140 秒（含讀文章）。模擬測驗限時 = 各篇秒數加總；單題停留超過該篇秒數的一半會在結果頁標記「偏慢」。

---

## 3. 題目設計規則

### 3.1 考點代碼 `point`

沿用 Part 5 的代碼與中文名，新增兩個：

| kind | point | 中文 | 全題庫建議占比（每個空格計） |
|---|---|---|---|
| grammar | wordform 詞性 10–12%、tense 時態 8–10%、voice 語態 3–4%、agree 主詞動詞一致 2–3%、verbform 不定詞／動名詞／分詞 3–4%、conj 連接詞 vs 介系詞 4–5%、prep 介系詞 3–4%、pronoun 代名詞 3–4%、relative 關係詞 1–2%、quant 數量詞 1–2% | 文法合計約 40–48% |
| vocab | vmeaning 語意辨析 8–10%、vcolloc 搭配詞 6–8%、vconfuse 易混淆字 2–3% | 約 16–21% |
| transition | transition 連接副詞／轉折詞（However、Therefore、In addition、As a result、For example、Meanwhile…） | 8–12% |
| insert | insert 句子插入 | 25%（每篇剛好 1 題） |

### 3.2 單篇組成規則（寫題時逐條自檢）

1. 每篇**剛好 4 個空格**，標記為 `[[1]]`～`[[4]]`，在內文**依閱讀順序**各出現一次。
2. **剛好 1 題 `insert`**；其餘 3 題至少 1 題文法、至少 1 題 vocab 或 transition；同一個 `point` 在同一篇最多出現 2 次。
3. 空格分散：不要 4 個全在同一段；每個句子最多 1 個空格；`insert` 空格必須是**句首**，且不能是全文第一句或結尾署名。
4. **至少 2 題無法只看同一句就答對**（需要前後句、標頭、日期、主旨或代名詞指涉）。每題標 `scope`：`local`（空格前後 3–5 字）、`near`（同句其他部分或相鄰句）、`far`（跨段、標頭或標題）。`scope` 全是 `local` 的文章視為不合格，因為那就變成 Part 5。
5. 標頭 `head`（To／From／Date／Subject、公告標題、廣告標語）算文章的一部分，可以藏線索（例如時態題靠 Date）。
6. 文章要像真的商務文件：有明確來源、對象、目的與後續行動；除人名、公司名外不用真實品牌；email 地址用 `.example` 網域。

### 3.3 難度分級

| 等級 | 字數（含答案，不含標頭） | 段落 | 設計重點 |
|---|---|---|---|
| 初級 500–550 | 80–110 | 2–3 | 文法題線索在空格前後 3 字內；單字題用高頻詞；插入句有明顯代名詞或 this／these＋名詞線索 |
| 中級 600–650 | 100–140 | 3 | 時態或代名詞需看前後句；詞彙題要讀前半句；插入句靠轉折詞或前後主題；至少 1 題 `far` |
| 高級 700–800 | 130–180 | 3–4 | 插入句線索隱微（時間順序、對比、答覆問題）；轉折詞需跨段判斷；干擾句與主題相關且文法正確 |

字數是設計目標，不是官方標準；`json_merge.py` 超出範圍只給警告。

### 3.4 選項設計

**非插入題**（文法、詞彙、轉折）：每個空格 **1 個正解 + 7 個干擾項**。網頁每次作答顯示 4 個（正解 + 隨機 3 個干擾項），輪替機制沿用 Part 5 的 `deal()`（bag 輪替、至少 1 個 `near`、wordform 至少 2 個同字根、正解位置不與上次相同），輪替鍵改用 `題目id#空格編號`。

> 為什麼是 7 而不是 Part 5 的 11：一篇有 4 個空格，若每格 11 個要寫 44 個「必須明確錯誤」的選項，AI 出錯率會明顯升高。7 個仍能輪替兩次以上。若你想改回 11，只要改 `_spec.rules` 與驗證數字。

- 干擾項要有層次：至少 2 個 `near:true`；wordform 至少 3 個 `fam:'root'`（同字根變化）；vocab 全部同詞性、語意或搭配不合；transition 要包含**邏輯功能不同**的轉折詞（因果、對比、遞進、舉例、時間），不能放兩個功能相近而同時成立的詞。
- **唯一解檢查**：把每個干擾項代回整篇（不只是那一句）都必須明確錯誤，原因寫在 `why`；不能有兩個選項同時成立，也不能有一個干擾項在「換個讀法」下成立。
- 干擾項不得與正解、彼此重複（不分大小寫）。
- 某個空格的答案不得依賴另一個空格的答案才能判定。

**插入題**：**1 個正解句 + 3 個干擾句**（固定 4 句，只洗牌順序）。

- 4 句都文法正確、語氣與文體一致。
- 正解句必須和前後文有**至少一條明確連結**：代名詞或指示詞（this／those／they）、轉折詞（however／as a result）、重複的關鍵名詞、時間或步驟順序、回答前文隱含的問題。
- 每個干擾句必須因下列其中一個原因而錯（`trap`），且 3 個干擾句至少用 2 種不同原因：
  - `topic` 話題跳離
  - `reference` 代名詞或指示詞沒有可指涉的對象，或指涉錯誤
  - `sequence` 時間或步驟順序不合
  - `contradiction` 與文中資訊矛盾
  - `logic` 因果、對比等邏輯連接不合
  - `redundant` 重複前後句已說的內容
  - `tone` 語氣或對象不符
- 至少 1 個干擾句要「看起來相關」（同主題），避免只靠話題就能排除。

### 3.5 其他品質規則

- 句子是自然的商務英文，不過度生僻；`zh` 翻譯通順，**以答案填入後的全文翻譯**，逐段對應 `body`。
- 同一批題目不要重複：`tag`、標頭主旨／標題、`vocab.word`、首句都不得與已有題目重複。
- 不確定的題目放進 `issues`；無法達到規格時回傳 `{"skip":"原因"}`，不要硬湊。
- 數字、日期、星期必須一致（需要星期時用程式或日曆驗證，不憑感覺）。

---

## 4. 資料格式 `part6.json`

### 4.1 `_spec`（放在 `part6.json` 最上層，維護頁從這裡組 AI 指令）

```json
{
  "purpose": "多益 Part 6 段落填空題庫；一題＝一篇文章（4 個空格）；非插入題 1 正解＋7 干擾項（網頁每次顯示 4 個），插入題 1 正解句＋3 干擾句。",
  "schema_version": 1,
  "domains": {
    "d1": {"name": "辦公室", "scenes": ["office"]},
    "d2": {"name": "餐廳飲食", "scenes": ["restaurant"]},
    "d3": {"name": "商店購物", "scenes": ["store"]},
    "d4": {"name": "街道與交通", "scenes": ["street", "station"]},
    "d5": {"name": "工地與倉庫", "scenes": ["workplace"]},
    "d6": {"name": "旅館與居家", "scenes": ["hotel", "home"]},
    "d7": {"name": "戶外與公園", "scenes": ["outdoor"]}
  },
  "docs": {"email": "電子郵件", "letter": "書信", "memo": "備忘錄", "notice": "公告", "article": "文章", "ad": "廣告", "instructions": "說明指南"},
  "tiers": {
    "easy": {"score": "500–550", "guide": "80–110 字；2–3 段；文法線索在空格前後 3 字內；插入句有明顯代名詞或 this/these＋名詞線索；建議作答 100 秒"},
    "medium": {"score": "600–650", "guide": "100–140 字；3 段；時態或代名詞需看前後句；詞彙題讀前半句；至少 1 題 scope=far；建議作答 120 秒"},
    "hard": {"score": "700–800", "guide": "130–180 字；3–4 段；插入句線索隱微；轉折詞需跨段判斷；干擾句與主題相關且文法正確；建議作答 140 秒"}
  },
  "points": {
    "wordform": {"kind": "grammar", "name": "詞性", "share": "10–12%"},
    "tense": {"kind": "grammar", "name": "時態", "share": "8–10%"},
    "voice": {"kind": "grammar", "name": "語態", "share": "3–4%"},
    "agree": {"kind": "grammar", "name": "主詞動詞一致", "share": "2–3%"},
    "verbform": {"kind": "grammar", "name": "不定詞／動名詞／分詞", "share": "3–4%"},
    "conj": {"kind": "grammar", "name": "連接詞 vs 介系詞", "share": "4–5%"},
    "prep": {"kind": "grammar", "name": "介系詞", "share": "3–4%"},
    "pronoun": {"kind": "grammar", "name": "代名詞／所有格", "share": "3–4%"},
    "relative": {"kind": "grammar", "name": "關係詞", "share": "1–2%"},
    "quant": {"kind": "grammar", "name": "數量詞／限定詞", "share": "1–2%"},
    "vmeaning": {"kind": "vocab", "name": "語意辨析", "share": "8–10%"},
    "vcolloc": {"kind": "vocab", "name": "搭配詞", "share": "6–8%"},
    "vconfuse": {"kind": "vocab", "name": "易混淆字", "share": "2–3%"},
    "transition": {"kind": "transition", "name": "連接詞／轉折詞", "share": "8–12%"},
    "insert": {"kind": "insert", "name": "句子插入", "share": "25%"}
  },
  "biz": {"hr": "人事", "marketing": "行銷", "finance": "財務", "manufacturing": "製造", "it": "資訊", "general": "通用"},
  "traps": {
    "pos": "詞性不符", "tense": "時態不符", "voice": "語態不符", "agree": "一致性錯誤", "form": "動詞形式錯誤",
    "case": "代名詞格或限定詞錯誤", "structure": "連接詞與介系詞結構不符", "logic": "邏輯關係不符（原因／對比／條件）",
    "confusable": "形似音近", "collocation": "搭配錯誤", "meaning": "語意不符",
    "topic": "話題跳離", "reference": "指涉不明或錯誤", "sequence": "順序不合", "contradiction": "與文中資訊矛盾",
    "redundant": "重複前後句", "tone": "語氣或對象不符"
  },
  "entry_schema": "{id:d{1-7}-{3位數}-{e|m|h}, domain, scene(須屬於 domains[domain].scenes), biz(選填), doc, tag(中文簡述,不重複), level:{score,cefr,tier,why}, voice:'F'|'M', head:[0–5行標頭字串], body:[2–4個段落字串,[[1]]–[[4]]各出現一次且依序], zh:[與body同長,答案填入後的中文翻譯], questions:[剛好4題{n:1–4, kind:'grammar'|'vocab'|'transition'|'insert', point, tag, scope:'local'|'near'|'far', answer:{t,zh,pos,why(以「正解：」開頭)}, distractors:[非insert剛好7個、insert剛好3個 {t,zh,pos(insert免),trap,near,fam('root'|'other',insert免),why}], clue:{text(須為head或body的原文片段),steps:[4句]}}], vocab:[3–5個{word,ipa,pos,col,zh}], say(選填,朗讀全文用,預設=標頭＋body填入答案), issues(選填)}",
  "rules": {
    "composition": "每篇剛好 4 空格、剛好 1 題 insert；其餘至少 1 題文法、至少 1 題 vocab 或 transition；同一 point 同篇最多 2 次；空格依序、分散、每句最多 1 個；insert 空格在句首且不是全文第一句。",
    "context": "每篇至少 2 題不能只看同一句就答對（scope 為 near 或 far）；scope 全是 local 的文章不合格。",
    "distractors": "非插入題 1 正解＋7 干擾項：至少 2 個 near:true；wordform 至少 3 個 fam:'root'；vocab 同詞性；transition 要涵蓋不同邏輯功能且不能兩個同時成立。插入題 1 正解句＋3 干擾句：4 句皆文法正確；3 個干擾句至少用 2 種 trap；至少 1 個看似相關。",
    "unique": "每個干擾項代回整篇都必須明確錯誤，原因寫在 why；不能有兩個選項同時成立；空格答案不得依賴另一空格的答案。",
    "style": "自然商務英文；除人名公司名外不用真實品牌；email 用 .example 網域；zh 為答案填入後的全文翻譯；字數依難度。",
    "dedupe": "tag、標頭主旨或標題、vocab.word、首句不得與已有題目重複。",
    "uncertain": "不確定的放進 issues；無法達到規格時回傳 {\"skip\":\"原因\"}。",
    "output": "輸出單一合法 JSON 陣列（UTF-8、不加程式碼區塊標記）。"
  }
}
```

### 4.2 完整範例（中級、memo，4 題：tense／vocab／insert／wordform）

```json
{
  "id": "d1-001-m",
  "domain": "d1",
  "scene": "office",
  "biz": "general",
  "doc": "memo",
  "tag": "新停車證領取辦法",
  "level": {"score": 650, "cefr": "B1+", "tier": "medium", "why": "時態題需對照標頭日期、插入句靠 however 的對比關係，其餘兩題線索在同句內。"},
  "voice": "F",
  "head": ["To: All Staff", "From: Karen Lopez, Office Manager", "Date: March 4", "Subject: New Parking Arrangements"],
  "body": [
    "Beginning April 1, employees [[1]] their parking passes at the front desk instead of the security office. This change is intended to shorten the wait for visitors who arrive in the morning. Passes can be collected at any time during business hours.",
    "Because the lot has only 120 spaces, the number of passes is strictly [[2]]. [[3]] Carpool groups, however, will receive priority, so please register yours by March 20.",
    "Thank you for your [[4]] during this transition. The security office will remain open for all other requests. Questions should be sent to Ms. Lopez at klopez@brightwave.example."
  ],
  "zh": [
    "從 4 月 1 日起，員工將改到櫃檯領取停車證，不再到保全室領取。這項變更是為了縮短早上來訪的訪客的等候時間。停車證在營業時間內隨時都能領取。",
    "由於停車場只有 120 個車位，停車證的數量受到嚴格限制。證件不會保留給特定部門或職稱。不過，共乘小組將享有優先權，請在 3 月 20 日前登記你們的小組。",
    "感謝各位在這段過渡期的配合。保全室仍會受理其他所有申請。如有疑問，請寄到 Lopez 女士的信箱 klopez@brightwave.example。"
  ],
  "questions": [
    {
      "n": 1, "kind": "grammar", "point": "tense", "tag": "未來時間點用未來式", "scope": "far",
      "answer": {"t": "will collect", "zh": "將會領取", "pos": "v.", "why": "正解：標頭日期是 3 月 4 日，Beginning April 1 指向未來，用未來式。"},
      "distractors": [
        {"t": "collected", "zh": "領取了", "pos": "v.", "trap": "tense", "near": true, "fam": "root", "why": "過去式，與未來的 April 1 矛盾。"},
        {"t": "have collected", "zh": "已經領取", "pos": "v.", "trap": "tense", "near": true, "fam": "root", "why": "現在完成式不能搭配未來起算的時間。"},
        {"t": "had collected", "zh": "（當時）已領取", "pos": "v.", "trap": "tense", "near": false, "fam": "root", "why": "過去完成式需要另一個過去時間點。"},
        {"t": "were collecting", "zh": "當時正在領取", "pos": "v.", "trap": "tense", "near": false, "fam": "root", "why": "過去進行式，時間錯誤。"},
        {"t": "have been collecting", "zh": "一直在領取", "pos": "v.", "trap": "tense", "near": false, "fam": "root", "why": "現在完成進行式，與 Beginning April 1 的新規定不符。"},
        {"t": "collecting", "zh": "領取（動名詞／分詞）", "pos": "v.", "trap": "form", "near": true, "fam": "root", "why": "句子缺少定位動詞，不能只放分詞。"},
        {"t": "to collect", "zh": "去領取", "pos": "v.", "trap": "form", "near": false, "fam": "root", "why": "不定詞不能作為句子的主要動詞。"}
      ],
      "clue": {"text": "Beginning April 1", "steps": ["選項同字根且全是動詞變化 → 時態／動詞形式題", "Beginning April 1 是未來時間，再對照標頭 Date: March 4", "過去式、完成式、進行式都與未來時間衝突，分詞與不定詞缺少定位動詞", "代入 will collect，句意為「從 4 月 1 日起員工將領取」，通順"]}
    },
    {
      "n": 2, "kind": "vocab", "point": "vmeaning", "tag": "車位少 → 數量受限", "scope": "near",
      "answer": {"t": "limited", "zh": "有限的", "pos": "adj.", "why": "正解：前半句說只有 120 個車位，所以停車證數量受到限制。"},
      "distractors": [
        {"t": "unlimited", "zh": "無限的", "pos": "adj.", "trap": "meaning", "near": true, "fam": "other", "why": "與「只有 120 個車位」矛盾。"},
        {"t": "expanded", "zh": "擴大的", "pos": "adj.", "trap": "meaning", "near": true, "fam": "other", "why": "車位有限，不會是擴大。"},
        {"t": "abundant", "zh": "充裕的", "pos": "adj.", "trap": "meaning", "near": false, "fam": "other", "why": "與車位少的原因相反。"},
        {"t": "optional", "zh": "非必要的", "pos": "adj.", "trap": "meaning", "near": false, "fam": "other", "why": "數量不能是「選擇性」，語意不通。"},
        {"t": "flexible", "zh": "有彈性的", "pos": "adj.", "trap": "collocation", "near": false, "fam": "other", "why": "strictly flexible 搭配矛盾。"},
        {"t": "unnecessary", "zh": "不必要的", "pos": "adj.", "trap": "meaning", "near": false, "fam": "other", "why": "與句意無關。"},
        {"t": "endless", "zh": "無止盡的", "pos": "adj.", "trap": "meaning", "near": false, "fam": "other", "why": "與有限車位矛盾。"}
      ],
      "clue": {"text": "the lot has only 120 spaces", "steps": ["選項都是形容詞 → 詞彙題（語意辨析）", "Because the lot has only 120 spaces 說明原因：車位很少", "unlimited、expanded、abundant、endless 都與原因相反，optional、flexible、unnecessary 與 strictly 搭配不通", "代入 strictly limited，語意和搭配都自然"]}
    },
    {
      "n": 3, "kind": "insert", "point": "insert", "tag": "however 前面需要先有對比的規則", "scope": "near",
      "answer": {"t": "Passes will not be reserved for particular departments or job titles.", "zh": "停車證不會保留給特定部門或職稱。", "why": "正解：下一句 Carpool groups, however 的 however 需要前一句提出一般規則，共乘才是例外。"},
      "distractors": [
        {"t": "The lot was repainted last month by an outside contractor.", "zh": "停車場上個月由外包商重新畫線。", "trap": "topic", "near": true, "why": "話題跳到維修，與停車證數量無關，也無法和 however 形成對比。"},
        {"t": "Passes will continue to be issued by the security office after April 1.", "zh": "4 月 1 日後停車證仍由保全室核發。", "trap": "contradiction", "near": true, "why": "與第一段 instead of the security office 矛盾。"},
        {"t": "As a result, the cafeteria will open one hour earlier.", "zh": "因此，自助餐廳將提早一小時開放。", "trap": "logic", "near": false, "why": "As a result 沒有對應的原因，內容也與停車無關。"}
      ],
      "clue": {"text": "Carpool groups, however,", "steps": ["四個選項都是完整句子 → 句子插入題，留到最後做", "後一句有 however，表示前一句是一般規則、共乘是例外", "與 repainting 無關、與第一段矛盾、As a result 沒有原因，三者都排除", "代入正解，兩句形成「不保留給特定單位 → 但共乘優先」的對比，連貫"]}
    },
    {
      "n": 4, "kind": "grammar", "point": "wordform", "tag": "your 後面接名詞", "scope": "local",
      "answer": {"t": "cooperation", "zh": "合作；配合", "pos": "n.", "why": "正解：所有格 your 後面需要名詞。"},
      "distractors": [
        {"t": "cooperate", "zh": "合作", "pos": "v.", "trap": "pos", "near": true, "fam": "root", "why": "原形動詞不能接在 your 後面。"},
        {"t": "cooperates", "zh": "合作（第三人稱單數）", "pos": "v.", "trap": "pos", "near": false, "fam": "root", "why": "動詞不能接在 your 後面。"},
        {"t": "cooperated", "zh": "合作了", "pos": "v.", "trap": "pos", "near": false, "fam": "root", "why": "過去式動詞，詞性不符。"},
        {"t": "cooperative", "zh": "合作的", "pos": "adj.", "trap": "pos", "near": true, "fam": "root", "why": "形容詞後面還需要名詞，這裡沒有。"},
        {"t": "cooperatively", "zh": "合作地", "pos": "adv.", "trap": "pos", "near": true, "fam": "root", "why": "副詞不能放在 for your 之後當名詞。"},
        {"t": "cooperator", "zh": "合作者", "pos": "n.", "trap": "meaning", "near": false, "fam": "root", "why": "單數可數名詞前需要冠詞，且語意是「人」，不符。"},
        {"t": "cooperators", "zh": "合作者們", "pos": "n.", "trap": "meaning", "near": false, "fam": "root", "why": "語意是「人」，感謝的是配合行為。"}
      ],
      "clue": {"text": "Thank you for your", "steps": ["選項同字根 → 詞性題", "for your ＋ ___ ＋ during → 需要名詞", "動詞、形容詞、副詞都排除；cooperator(s) 是「人」，語意不符", "代入 cooperation，Thank you for your cooperation 是固定說法"]}
    }
  ],
  "vocab": [
    {"word": "priority", "ipa": "/praɪˈɔːrəti/", "pos": "n.", "col": "receive priority", "zh": "優先權"},
    {"word": "transition", "ipa": "/trænˈzɪʃn/", "pos": "n.", "col": "during the transition", "zh": "過渡期"},
    {"word": "reserve", "ipa": "/rɪˈzɜːrv/", "pos": "v.", "col": "reserve a space", "zh": "保留"}
  ]
}
```

### 4.3 朗讀文字（TTS 與錄音稿共用）

預設朗讀文字 = `head` 各行以句點串接 + `body` 把 `[[n]]` 換成各題正解（插入題換成完整正解句）。有特殊念法時才填 `say`（整篇的完整朗讀文字，不得含 `[[`）。寫題目時請避開 TTS 容易念錯的寫法：不要用 `10-12`、`&`、縮寫的 `Mr.` 以外的點號縮寫，日期與時間用自然寫法（`March 4`、`9:00 A.M.`）。

---

## 5. 網頁行為（`part6.html`／`part6.js`）

`part6.html` 與 `part5.html` 相同，只改 `<title>` 與 `<script src="part6.js">`。

### 5.1 首頁
- 篩選：主題（D1–D7）、難度、文章類型（`doc`）、考點（文法／詞彙／轉折／插入，點開後細分 `point`）。
- 按鈕：「練習（N 篇）」、「模擬測驗（1 篇）」、「模擬測驗 完整版（4 篇・16 題・約 8 分鐘，題庫 ≥ 4 篇才顯示）」、「錯題複習（N 篇）」。
- 列表：每篇顯示 id、tag、難度、文章類型、上次結果（✓ 4/4、✗ 2/4、尚未作答）。

### 5.2 練習模式（一篇一畫面）
1. 上方是文章卡：標頭＋段落。空格以圓角標籤 `(1)`～`(4)` 顯示，點標籤會捲到對應題目。
2. 文章卡下方有「▶ 播放整篇」＋速度 0.75×／1×／1.25×＋標示「錄音檔／機器發音（會念出答案）」。播放時按鈕變「⏹ 停止」。
3. 文章下方依序列出 4 題，每題顯示 4 個選項（輪替規則見 3.4）。插入題的選項是整句，用卡片樣式。
4. 每題作答後：該空格在文章中即時填入所選詞（對綠錯紅），並顯示該選項的 `why`；正確時顯示正解的 `why`。
5. 4 題都答完才出現「解析區」：每題的 `clue.steps`、線索片段在文章中高亮、全文中文翻譯（收合）、`vocab` 單字（點擊用 TTS 唸，沿用 `speakWord`）、每題的完整選項庫（看完整選項庫，標示本次出現與否、`near`、`trap`）、`scope` 標籤、用時。
6. 提示列（可收合）呈現網頁建議的解題流程：先掃讀、先易後難、插入題最後做。
7. 「再做一次」（換一組選項）與「下一篇」。

### 5.3 模擬測驗模式
- 不顯示任何對錯、不顯示播放鈕；有題號格（第 1–16 題）、「待檢查」旗標、上一／下一篇、交卷。
- 倒數時限 = 各篇建議秒數加總；只提示、不強制（沿用 Part 5 `clockInfo`）。
- 作答時文章中的空格即時顯示所選詞（讓考生能檢查整體通順），但不顯示對錯。

### 5.4 結果頁
- 總分 c/n、答對率、平均每篇用時、超過建議時間的篇數。
- 各 `kind`（文法／詞彙／轉折／插入）與各 `point` 正確率；最常中的陷阱（`trap`）排行；各 `scope` 正確率（用來看「需要讀上下文的題」是否特別弱）。
- 答錯的題以「篇」為單位列出，可展開（沿用 `reviewH` 的 `<details>` 樣式，內含選項庫與音檔區塊）；答錯的空格自動加入錯題複習。

### 5.5 記錄（`toeicPart6V1`）
- `rec[題目id#n] = {ok, k, secs, t}`；`saved[題目id#n] = true`（錯題）；`rot[題目id#n] = {bag,last}`；`stat[題目id#n] = {shown[],picked[]}`。
- 錯題複習以篇為單位：整篇重做，上次答錯的空格在文章中標黃。

### 5.6 維護頁
- 矩陣：主題 × 難度，格內「題數 · 🎧音檔完整數」。
- 統計：`kind` 與 `point` 題數（以「空格」計）與建議占比，偏少者標黃；文章類型題數；`scope` 分布。
- 新增題目：選主題、難度、文章類型、篇數（1／2／3／5）、「本批必含的考點」（可複選，選填）→ 產生「給 AI 的寫題目指令」（第 10 節模板）並可複製。
- 單篇展開：文章、答案、干擾項（含 trap／near／root 標示）、選項曝光統計、音檔面板（有／缺、試聽、複製檔名、複製朗讀稿、男女聲）。
- 「複製本格缺的清單」格式：`{id}.mp3 | 朗讀稿 | M或F`。

---

## 6. 音檔規格

- 一篇一檔：`audio/p6/{id}.mp3`，內容是**答案填入後的整篇**（標頭 → 正文；插入句也要念出來）。若有 `say` 欄位就念 `say`。
- 單一說話者，語速自然；`voice` 決定機器發音的男女聲，也是錄音時的建議性別。
- 網頁邏輯與 Part 5 相同：`audio/index.json` 的 `p6.complete` 含該題 id → 用 mp3；否則 TTS；兩者皆無則顯示「這個瀏覽器沒有機器發音，也還沒有音檔」。
- 逐段跟讀不在第一版範圍（整篇 mp3 沒有段落時間點）。要做的話請另案使用機器發音逐段念＋靜音等待。

### `audio_scan.py` 要新增的區塊

放在 Part 5 區塊之後（並同步更新檔案開頭的說明文字、`for part in (...)` 的孤兒檔迴圈）：

```python
# Part 6：audio/p6/{id}.mp3（一篇一檔，朗讀答案填入的整篇；say 欄位若有則朗讀 say）
exp = {}
for it in items('part6.json'):
    if isinstance(it, dict) and it.get('id') and isinstance(it.get('body'), list):
        exp[it['id']] = [it['id'] + '.mp3']
c, p, o = check(os.path.join(AUD, 'p6'), exp, 'audio/p6')
out['p6'] = {'complete': c, 'partial': {}, 'orphans': o}
print('p6：文章 %d，音檔完整 %d，缺 %d，孤兒檔 %d' % (len(exp), len(c), len(exp) - len(c), len(o)))
```

並把最後的 `for part in ('p1', 'p2', 'p3', 'p4', 'p5', 'daily')` 改成包含 `'p6'`。

---

## 7. 整合修改清單

1. **`index.html`**：Part 6 那一項加上 `href: 'part6.html'`，並補 `sub: '4 篇 × 4 題 · 句子插入 · 文章音檔'`（維持與 Part 5 相同的欄位）。
2. **`audio/audio_scan.py`**：見第 6 節。
3. **`json_merge.py`**：新增 `Part6` Profile（仿 `Part5`，約第 981–1150 行）：
   - `name='part6'`、`title='Part 6 填空'`、`main_name='part6.json'`、`backup_prefix='part6'`、副檔判斷 `fname.lower().startswith('p6_')`。
   - 在 `PROFILES`、`ORDER`、自動偵測、用法說明、模組開頭註解都加入 `part6`。
   - 驗證規則見第 8 節。
   - `done_note` 提示：合併後重新整理網頁；音檔放 `audio/p6/{id}.mp3` 後執行 `audio_scan.py`。
4. **新增** `audio/p6/`（空資料夾，附 `.gitkeep`）。

---

## 8. `json_merge.py` 的 Part 6 驗證規則

**錯誤（擋下不合併）**
- `id` 符合 `d{1-7}-{3位數}-{e|m|h}`、在主檔與副檔內不重複；`domain` 與 id 一致；`scene` 屬於該 domain；`level.tier` 與 id 尾碼一致；`score` 在該難度範圍內，`cefr` 與 score 對得上。
- `doc` 在 `_spec.docs` 內；`voice` 為 F／M；`head` 為字串陣列；`body` 2–4 段；`zh` 與 `body` 同長。
- `[[1]]`～`[[4]]` 在 `body` 內各出現一次且依序；`questions` 剛好 4 題、`n` 為 1–4；`kind` 與 `point` 對應 `_spec.points`；**剛好 1 題 `insert`**。
- 非插入題：`distractors` 剛好 7 個；插入題：剛好 3 個。每個干擾項有 `t`、`zh`、`trap`（在 `_spec.traps` 內）、`why`；非插入題另需 `pos`、`near`、`fam`。
- 選項文字（不分大小寫）彼此不重複，也不與正解重複。
- 非插入題 `near:true` 至少 2 個；`wordform` 題 `fam:'root'` 至少 3 個；`vocab` 題 `pos` 全部一致。
- `answer.why` 以「正解：」開頭；`clue.steps` 剛好 4 句；`clue.text` 必須是 `head` 或 `body` 的原文片段。
- 把每題正解填回後，全文不得殘留 `[[`；`insert` 空格的 `[[n]]` 必須在句首（前面是句號／問號／驚嘆號＋空白，或段首）且不在全文第一句。
- `vocab` 3–5 個，每個有 `word、ipa、pos、col、zh`。

**警告（提示但可合併）**
- 填入答案後的 `body` 字數超出該難度範圍。
- `scope` 全是 `local`，或沒有任何 `near`／`far`。
- 沒有 `vocab` 或 `transition` 題；同一 `point` 出現 3 次以上。
- 插入題 3 個干擾句只用了 1 種 `trap`。
- `tag`、標頭主旨、首句、`vocab.word` 與已有題目雷同（用 `difflib` 相似度 ≥ 0.85）。
- `say` 存在但含 `[[`。

---

## 9. 交付順序與驗收清單

**建議分階段（每階段都要能獨立運作）**
1. `part6.json`（含 `_spec` 與至少 3 篇範例：初、中、高各 1）＋ `part6.html` ＋ `part6.js` 的練習模式與音訊。
2. 模擬測驗與結果頁。
3. 維護頁與 AI 寫題目指令。
4. `json_merge.py`、`audio_scan.py`、`index.html` 整合。

**驗收清單**
- [ ] `index.html` 點 Part 6 能進入；深淺色切換與其他頁同步，且不會清掉作答紀錄。
- [ ] 練習：作答前可手動播放；有 mp3 播 mp3，無 mp3 用 TTS；切題、離開、切換分頁都會停止播放；速度鍵有效。
- [ ] 插入題的選項可閱讀、可洗牌；其他題每次作答出現 4 個選項，同一題重做時干擾項會輪替；正解位置不與上次相同。
- [ ] 作答後文章空格即時填入所選詞；解析區的 `clue.text` 在文章中有高亮。
- [ ] 測驗模式沒有播放鈕、沒有對錯提示；交卷後結果頁數字正確（用 3 篇範例手算比對）。
- [ ] 錯題複習以篇為單位，答錯的空格標黃。
- [ ] 維護頁矩陣數字、`kind`／`point` 統計、缺音檔清單與 `audio/index.json` 一致。
- [ ] `json_merge.py` 能擋下：缺一個空格標記、兩題 insert、干擾項數量不對、`clue.text` 不在原文、`[[3]]` 不在句首。
- [ ] `audio_scan.py` 能列出 p6 的完整／缺／孤兒檔，大小寫不符與 0 KB 空檔會警告。
- [ ] Part 1–5 沒有被改動、沒有新增外部資源。

---

## 10. 「給 AI 的寫題目指令」模板（維護頁自動組出）

網頁照 `part5.js` 的 `promptText()` 組字串；以下是模板，`{}` 由程式代入。

```
請為多益 Part 6 段落填空寫 {n} 篇（每篇一篇文章、4 個空格；非插入題 1 正解＋7 干擾項，插入題 1 正解句＋3 干擾句），輸出為單一 JSON 陣列，規格在最後，不需要另外附 part6.json。

- 主題：{D1 辦公室}（scene 須屬於：{office}）；可選填 biz。
- 文章類型：{memo}（doc 欄位照填）。
- 難度：{中級}（id 尾碼 m）｜level.score 只能填：{600（cefr B1）、650（cefr B1+）}｜{_spec.tiers.medium.guide}
- 考點：{只出…／不限；各考點現有「空格」題數與建議占比；請優先補數量最少者}。
- id 依序使用：{d1-002-m、d1-003-m…}（domain 填 d1，level.tier 填 medium）；voice 填 F 或 M。
- 每篇剛好 4 空格 [[1]]–[[4]]、剛好 1 題 insert；其餘規則見下方 rules。
- clue.steps 依四步驟各寫一句：掃描選項判斷題型 → 分析空格前後線索 → 刪去法 → 代入驗證（插入題改為：判斷為插入題留到最後 → 找前後連結線索 → 逐句排除 → 代入檢查連貫）。
- {rules 逐條列出}
- 已用過的 vocab（不得重複）：{…}
- 已用過的 tag（不得重複）：{…}
- 已有的標頭主旨或標題與首句（不要雷同）：{…}
- 輸出方式：建立檔案 p6_{首個id}_x{n}.json（只含一個合法 JSON 陣列、UTF-8、不加程式碼區塊標記）；無法建檔才輸出單一 json 程式碼區塊。

【規格：part6.json 的 _spec 精簡版】
{精簡 JSON}
```

**寫完請 AI 自我檢查**（把這段加在指令最後也可以）：逐篇逐空格把每個干擾項代回整篇，確認只有 1 個選項成立；確認 `[[1]]`–`[[4]]` 依序各 1 次；確認至少 2 題 `scope` 為 `near` 或 `far`；確認 `clue.text` 是原文片段；確認數字與日期一致。有任何不確定寫進 `issues`。
