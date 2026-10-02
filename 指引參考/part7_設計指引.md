# Part 7 閱讀理解：給 AI 的設計指引

> 用途：把本文件整份交給 AI（Claude Code、ChatGPT 等），請它為 TOEIC Daily Coach 新增 **Part 7 閱讀理解** 模組。
> 同時附上現有的範本檔：`part5.html`、`part5.js`、`part5.json`、`index.html`、`audio_scan.py`、`json_merge.py`（若已完成 Part 6，也一併附上 `part6.js`）。
> 本文件有兩個用途：(A) 請 AI 寫網頁與工具程式（第 1、5–9 節）；(B) 請 AI 寫題目（第 2–4 節、第 10 節）。

---

## 1. 專案背景與不可破壞的既有慣例

這是靜態網站（GitHub Pages，**檔名大小寫有區別**），Tailwind CDN + `style.css`，不使用打包工具、不使用框架。Part 7 要和 Part 5／6 長得一樣、行為一致，請以 `part5.js`（或 `part6.js`）當骨架改寫。

| 項目 | Part 5 現況（Part 7 照做，僅改名） |
|---|---|
| 檔案 | 新增 `part7.html`（只有一個 `<main id="main">`）、`part7.js`（單檔）、`part7.json` |
| 深淺色 | `KEY='toeicCoachV2'`，**只讀寫 `dark`** |
| 作答紀錄 | `localStorage['toeicPart7V1']`，欄位 `rec / saved / rot / stat` |
| 題庫格式 | `{ "_spec": {...}, "items": [...] }`，維護頁的 AI 指令從 `_spec` 組出來 |
| id 規則 | `d{1-7}-{3位數}-{e\|m\|h}`（主題 d1–d7 與 Part 5 相同；e/m/h＝初/中/高）。單篇、雙篇、三篇共用同一個編號序列，用 `format` 欄位區分 |
| 難度 | 初級 500–550、中級 600–650、高級 700–800，欄位 `level:{score,cefr,tier,why}` |
| 音訊 | 單一共用 `Audio` 元素、點擊才播、切題／離開／分頁隱藏一定 `stop()`；有 mp3 播 mp3，否則瀏覽器 TTS（依 `voice` 選男女聲）；自成一體，不依賴 `audio.js`。複製 `part5.js` 第 72–134 行那一段，把 `p5` 改成 `p7`，並改成「依文件」播放（見第 6 節）。 |
| 練習時播音檔 | 練習模式作答前就有手動播放鈕與 0.75×／1×／1.25×；模擬測驗不顯示播放鈕 |
| 維護頁 | 題數矩陣、題型統計與建議占比、AI 寫題目指令、單題展開、缺音檔清單 |
| 合併工具 | `json_merge.py` 的 Profile 類別擴充，副檔前綴 `p7_` |
| 音檔掃描 | `audio/audio_scan.py` 產生 `audio/index.json`，網頁只對 `complete` 的題目用 mp3 |

**不要做的事**：不要改動 Part 1–6 的行為；不要把 `dark` 以外的資料寫進 `toeicCoachV2`；不要新增外部 CDN；不要把大量表格資料做成圖片。

---

## 2. 考試規格（本模組依據）

資料來源：Prep Edu〈TOEIC Reading Part 7〉整理，加上現行多益 Reading 標準版式。

### 2.1 結構
- 共 **54 題**：單篇 **29 題**（約 10–11 篇，每篇 2–4 題）、雙篇 **10 題**（2 組 × 5 題）、三篇 **15 題**（3 組 × 5 題）。每題 4 個選項 (A)–(D)。
- 文件類型：email、letter、memo、notice、article、ad、review、web page、form、invoice、schedule、table、**線上聊天／簡訊串（chat）**。

### 2.2 題型（`type`）

| type | 中文 | 常見題幹 | 網頁整理的重點 |
|---|---|---|---|
| purpose | 總覽（主旨、目的、文件性質） | What is the main purpose of…? / Why was this e-mail sent? | 首尾定位：email 看主旨行與第一句；廣告看標題；約 30–45 秒讀完 |
| detail | 細節 | According to the passage… / When／Where／Who／How much | 抓疑問詞與關鍵詞 → 掃讀定位 → 仔細讀前後文；答案常用**同義轉述**（original receipt → proof of purchase）；占比最高（約 40–50%） |
| notTrue | NOT／TRUE | Which is NOT mentioned? / What is true about…? | 三選一排除法；最耗時，建議最後做（約 2–2.5 分鐘） |
| inference | 推論 | What can be inferred about…? / What is implied? / Who is most likely…? | 答案不會直接出現；必須有文中依據，不可過度推論（約 10%） |
| vocab | 詞彙同義 | The word “…” in paragraph 1 is closest in meaning to… | 讀包含該字的整句，用上下文判斷，排除「熟義陷阱」 |
| intent | 說話意圖（僅 chat） | At 10:12 A.M., what does Ms. Park most likely mean when she writes “…”? | 看該句前後訊息與整串脈絡，不是字面意思 |
| insert | 句子插入位置 | In which of the positions marked [1], [2], [3], and [4] does the following sentence best belong? | 找代名詞、轉折詞、時間順序、前後主題連結 |

> `intent` 與 `insert` 在參考網頁中沒有提到，但它們是現行多益 Part 7 的常見題型（訊息串每組通常有 1 題意圖題；全測驗約有數題插入位置題），所以本指引納入。

### 2.3 多篇文章（雙篇、三篇）解題心法
- 網頁的四步驟：①15–20 秒判斷各篇性質並預測關係（如：廣告＋詢問信＋回覆信）②判斷每題的資訊來源是單篇還是整合 ③搜尋共同連結點（人名、公司、產品、時間日期、事件）④交叉比對、用排除法。
- 本題庫用 `src` 標記每題需要哪些文件；`src` 長度 ≥ 2 的就是**整合題**。

### 2.4 時間（本專案自訂，非官方）

> 參考網頁的時間分配表（單篇 35–40 分、雙篇 15–18 分、三篇 20–25 分）加總 70–83 分鐘，已超過 Reading 整段（Part 5–7 共 100 題）的 75 分鐘，不能直接採用。本專案改用：Part 5 約 11 分鐘、Part 6 約 8 分鐘，剩約 56 分鐘給 Part 7。

- 建議作答時間：單篇 **60 秒／題**、雙篇與三篇 **65 秒／題**（含讀文章）。一組的限時 = 題數 × 該秒數。
- 單題停留超過 **120 秒** 在結果頁標「偏慢」（網頁建議超過 2 分鐘仍無把握就先猜）。
- 網頁中的「超過 60% 考生寫不完」等統計數字無出處，不採用，也不要寫進介面。

---

## 3. 題目設計規則

### 3.1 組別與題數

| format | 文件數 | 題數 | 說明 |
|---|---|---|---|
| single | 1 | 2–4 | 一篇文件 |
| double | 2 | 剛好 5 | 兩份相關文件；**至少 2 題為整合題** |
| triple | 3 | 剛好 5 | 三份相關文件；**至少 2 題為整合題**，且至少 1 題需要用到 3 份中的 2 份以上的資訊並比對 |

常見組合（寫雙篇、三篇時挑選）：
- 雙篇：公告＋報名 email、廣告＋評論、文章＋讀者來信、email＋附件（行程表／發票）、職缺＋求職信、通知＋更正 email。
- 三篇：email＋行程表＋表單、廣告＋訂單＋客服回覆、公告＋email＋時間表。

### 3.2 題型比例（全題庫，以「題」計）

| type | 建議占比 | 備註 |
|---|---|---|
| purpose | 10–12% | 單篇組第 1 題常見；多篇組少用 |
| detail | 35–40% | 含整合型細節題 |
| notTrue | 8–10% | 每組最多 1 題 |
| inference | 15–18% | |
| vocab | 5–6% | 每組最多 1 題 |
| intent | 4–6% | 只能出現在 `kind:'chat'` 文件 |
| insert | 4–6% | 每組最多 1 題；文件必須是 ≥ 4 句的散文 |
| 整合題（`src.length≥2`，另計） | ≥ 20% | 只出現在雙篇與三篇 |

### 3.3 出題規則（逐條自檢）

1. **題目大致依資訊在文件中出現的順序排列**；總覽題通常在第一題。整合題放在一組的後半。
2. **正解一律用同義轉述**，不得整句照抄原文；至少 1 個干擾項刻意沿用原文字詞但意思不對（這是真實考題的陷阱模式）。
3. 4 個選項文法結構與長度相近；不使用 *all of the above*；絕對詞（always、never、only）只在 `overreach` 干擾項使用。
4. 每個干擾項必須有明確的錯誤原因（`trap`），並寫在 `why`：
   - `unmentioned` 文中沒提（無中生有）
   - `distort` 扭曲細節（數字、日期、對象、地點被換掉）
   - `opposite` 與原文相反
   - `partial` 只對一半，或只符合其中一份文件
   - `overreach` 過度推論／絕對化
   - `wrongdoc` 張冠李戴：用了另一份文件的資訊（整合題用）
   - `commonmeaning` 熟義陷阱（vocab：選了常見意思，但不符語境）
   - `nearmeaning` 近義但語境不符（vocab）
   - `position` 位置錯誤（insert）
5. **唯一解**：把每個干擾項代回整份文件都必須明確錯誤，不能有兩個選項同時成立。
6. **證據**：每題 `evidence` 至少 1 筆 `{doc, quote}`，`quote` 必須是該文件中**逐字出現**的片段（標頭、段落、訊息、表格儲存格都算）；整合題需 ≥ 2 筆且來自不同文件。notTrue 題要列出那 3 個「有被提到」的選項的證據。網頁作答後會高亮 `quote`。
7. **整合題設計**（任選）：A 文件更改了 B 文件的日期／價格；A 文件提出要求、B 文件回覆；A 是價目表、B 是訂單，需要計算；A 是職缺條件、B 是履歷，找出不符條件；A 是行程表、B 是 email，判斷哪一場。整合題至少 1 個干擾項是「只看其中一份文件就會選的答案」（`partial` 或 `wrongdoc`）。
8. **數字、日期、星期**必須一致；算術與星期用程式驗證，不憑感覺；全題組使用同一種貨幣與 12 小時制（9:00 A.M.）；避免跨時區。
9. 文件要像真的：有來源、對象、目的、後續行動；公司與人名虛構；email 用 `.example` 網域；電話用 `555-01xx`。
10. 同一批題目不要重複：`tag`、文件標頭／標題、`vocab.word`、首句不得與已有題目重複。
11. 不確定的題目放進 `issues`；無法達到規格時回傳 `{"skip":"原因"}`。

### 3.4 各題型細則

**vocab**：`target:{doc,word}` 指定目標字，該字必須在該文件正文中恰好出現 1 次（避免定位歧義）；4 個選項詞性相同；至少 1 個 `commonmeaning`（目標字的常見義，但不符語境）。題幹寫「paragraph N」（N 為該文件 `body` 陣列的第 N 段，含稱呼與署名；不要寫 line）。

**intent**：只能用在 `kind:'chat'`；題幹要含時間與引號內的原句，原句必須逐字出現在該則訊息；選項是「意圖」而非字面翻譯，至少 1 個干擾項是字面義。`target:{doc, msg}`（msg 為 `messages` 的索引）。

**insert**：目標文件的 `body` 內要有 `[1]`～`[4]` 四個位置標記，各出現一次（標記不得出現在 `[1]` 以外的其他用途）；`target.sentence` 是要插入的句子；`options` 固定 4 項對應 [1]–[4]，不洗牌。插入句必須有明確連結（代名詞、轉折詞、時間順序、回答前文問題），其餘 3 個位置各有 `why` 說明為何不通順。標記位置之間的句子必須合法拼回（插入後文法與邏輯成立）。

**notTrue**：選項是 4 個「陳述」，3 個在文中有依據、1 個沒有或與文中矛盾。不要同時出現否定題幹和否定選項。

### 3.5 難度與字數（設計目標，非官方標準）

| 等級 | single 字數 | double 總字數 | triple 總字數 | 設計重點 |
|---|---|---|---|---|
| 初級 500–550 | 80–150 | 200–300 | 300–420 | 題幹關鍵字與原文相同或近似；干擾項明顯錯誤；整合題只需兩處簡單對照 |
| 中級 600–650 | 150–250 | 280–420 | 400–580 | 需同義轉述；1 題推論；整合題需比對日期或條件 |
| 高級 700–800 | 220–350 | 380–520 | 550–750 | 多步推論；NOT 的 3 個依據分散在不同段落；整合題含更正、衝突或計算；干擾項用原文字詞設陷阱 |

字數以 `head` ＋ `body` ＋ `messages` ＋ 表格文字計；`json_merge.py` 超出範圍只給警告。

---

## 4. 資料格式 `part7.json`

### 4.1 `_spec`

```json
{
  "purpose": "多益 Part 7 閱讀理解題庫；一題組＝1–3 份文件＋2–5 題；每題 4 選項（1 正解＋3 干擾項），網頁每次作答只洗牌順序。",
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
  "formats": {
    "single": {"name": "單篇", "docs": 1, "questions": "2–4", "sec_per_q": 60},
    "double": {"name": "雙篇", "docs": 2, "questions": "5", "sec_per_q": 65},
    "triple": {"name": "三篇", "docs": 3, "questions": "5", "sec_per_q": 65}
  },
  "kinds": {"email": "電子郵件", "letter": "書信", "memo": "備忘錄", "notice": "公告", "article": "文章", "ad": "廣告", "review": "評論", "webpage": "網頁", "form": "表單", "invoice": "發票", "schedule": "時間表", "table": "表格", "chat": "線上聊天／簡訊串"},
  "qtypes": {
    "purpose": {"name": "總覽", "share": "10–12%"},
    "detail": {"name": "細節", "share": "35–40%"},
    "notTrue": {"name": "NOT／TRUE", "share": "8–10%"},
    "inference": {"name": "推論", "share": "15–18%"},
    "vocab": {"name": "詞彙同義", "share": "5–6%"},
    "intent": {"name": "說話意圖", "share": "4–6%"},
    "insert": {"name": "句子插入位置", "share": "4–6%"}
  },
  "tiers": {
    "easy": {"score": "500–550", "guide": "single 80–150 字／double 200–300／triple 300–420；題幹關鍵字與原文相近；干擾項明顯錯誤"},
    "medium": {"score": "600–650", "guide": "single 150–250／double 280–420／triple 400–580；需同義轉述；1 題推論；整合題比對日期或條件"},
    "hard": {"score": "700–800", "guide": "single 220–350／double 380–520／triple 550–750；多步推論；NOT 依據分散；整合題含更正、衝突或計算；干擾項用原文字詞設陷阱"}
  },
  "biz": {"hr": "人事", "marketing": "行銷", "finance": "財務", "manufacturing": "製造", "it": "資訊", "general": "通用"},
  "traps": {
    "unmentioned": "文中沒提", "distort": "扭曲細節", "opposite": "與原文相反", "partial": "只對一半／只看一份文件",
    "overreach": "過度推論", "wrongdoc": "張冠李戴（用了另一份文件的資訊）", "commonmeaning": "熟義陷阱",
    "nearmeaning": "近義但語境不符", "position": "位置錯誤"
  },
  "entry_schema": "{id:d{1-7}-{3位數}-{e|m|h}, domain, scene(須屬於 domains[domain].scenes), biz(選填), format:'single'|'double'|'triple', tag(中文簡述,不重複), level:{score,cefr,tier,why}, docs:[依 format 剛好1/2/3份 {kind, label(中文), voice:'F'|'M', read(選填,false=不提供朗讀), head:[0–5行], body:[段落字串](chat以外), messages:[{who,time,t,zh}](chat專用), speakers:{姓名:'F'|'M'}(chat專用), table:{header:[],rows:[[]]}(選填), zh:[與body同長的中文翻譯](chat免), say(選填)}], questions:[single 2–4題/其餘剛好5題 {n, type, stem, stem_zh, src:[文件索引], options:[剛好4個{t,zh,ok,trap(ok=false時),why}], evidence:[{doc,quote}], clue:{text,steps:[4句]}, target(vocab:{doc,word}|intent:{doc,msg}|insert:{doc,sentence,sentence_zh})}], vocab:[3–6個{word,ipa,pos,col,zh}], issues(選填)}",
  "rules": {
    "order": "題目大致依資訊出現順序；總覽題在第一題；整合題在後半。",
    "options": "每題剛好 4 選項、1 正解；正解用同義轉述不得照抄；至少 1 個干擾項沿用原文字詞但意思不對；結構與長度相近；不用 all of the above。",
    "unique": "每個干擾項代回整份文件都必須明確錯誤，why 寫明原因與 trap；不能有兩個選項同時成立。",
    "evidence": "每題 evidence 至少 1 筆，quote 必須是該文件逐字出現的片段；整合題至少 2 筆且來自不同文件；notTrue 要列出 3 個有被提到的選項的依據。",
    "multi": "double、triple 各剛好 5 題，至少 2 題整合題（src 長度≥2），整合題至少 1 個干擾項是只看單一文件會選的答案。",
    "types": "intent 只用在 chat；insert 每組最多 1 題且文件需為 ≥4 句散文、含 [1]–[4]；vocab 每組最多 1 題；notTrue 每組最多 1 題。",
    "numbers": "數字、日期、星期、金額要一致，並用程式驗證；全組同一貨幣與 12 小時制。",
    "style": "文件像真實商務文件；公司與人名虛構；email 用 .example；電話用 555-01xx。",
    "dedupe": "tag、文件標頭或標題、vocab.word、首句不得與已有題目重複。",
    "uncertain": "不確定的放進 issues；無法達到規格時回傳 {\"skip\":\"原因\"}。",
    "output": "輸出單一合法 JSON 陣列（UTF-8、不加程式碼區塊標記）。"
  }
}
```

### 4.2 完整範例（中級、single、email，4 題：purpose／detail／vocab／insert）

```json
{
  "id": "d1-001-m",
  "domain": "d1",
  "scene": "office",
  "biz": "general",
  "format": "single",
  "tag": "訓練教室預約確認",
  "level": {"score": 650, "cefr": "B1+", "tier": "medium", "why": "正解皆為同義轉述；詞彙題是 provided that 的連接詞用法；插入句需用 This 與 that date 的指涉判斷。"},
  "docs": [
    {
      "kind": "email",
      "label": "電子郵件",
      "voice": "F",
      "head": ["To: Daniel Ortiz", "From: Priya Nair", "Date: June 12", "Subject: Training Room Booking"],
      "body": [
        "Dear Mr. Ortiz,",
        "Thank you for contacting the Facilities Department about reserving Training Room B for your team's onboarding session. [1] I am pleased to confirm that the room is available on Tuesday, June 24, from 9:00 A.M. to 3:00 P.M. Our staff will unlock the room at 8:30 A.M. so that your team has time to set up before the session.",
        "The room seats up to 20 people and includes a projector and a video-conferencing system. [2] If you need additional equipment, such as laptops or microphones, please let me know by June 18. [3] Requests received after that date cannot be guaranteed.",
        "Please note that our department does not offer catering. [4] However, you are welcome to arrange for outside food, provided that it is delivered to the loading entrance by 8:30 A.M.",
        "Sincerely,",
        "Priya Nair",
        "Facilities Coordinator, Harlow Logistics"
      ],
      "zh": [
        "Ortiz 先生您好：",
        "感謝您來信詢問為貴團隊的新人訓練預約 B 訓練教室。我很高興確認該教室在 6 月 24 日星期二上午 9:00 至下午 3:00 可以使用。我們的員工會在上午 8:30 開門，讓您的團隊能在課程開始前完成準備。",
        "教室最多可容納 20 人，並備有投影機與視訊會議系統。如果您需要額外設備，例如筆電或麥克風，請在 6 月 18 日前告知我。在那之後收到的需求無法保證能夠滿足。",
        "請注意，本部門不提供餐飲。不過，歡迎您自行安排外送餐點，只要在上午 8:30 前送到裝卸入口即可。",
        "敬祝順心",
        "Priya Nair",
        "Harlow Logistics 設施協調員"
      ]
    }
  ],
  "questions": [
    {
      "n": 1, "type": "purpose",
      "stem": "Why did Ms. Nair write the e-mail?",
      "stem_zh": "Nair 女士為什麼寫這封電子郵件？",
      "src": [0],
      "options": [
        {"t": "To confirm a room reservation", "zh": "確認教室預約", "ok": true, "why": "正解：開頭說明回覆預約詢問，並確認教室可使用。"},
        {"t": "To request payment for equipment", "zh": "請求設備款項", "ok": false, "trap": "unmentioned", "why": "全文沒有提到付款。"},
        {"t": "To announce a change to a training schedule", "zh": "宣布訓練時程變更", "ok": false, "trap": "distort", "why": "信中是確認預約，不是變更時程。"},
        {"t": "To invite Mr. Ortiz to a company event", "zh": "邀請 Ortiz 先生參加公司活動", "ok": false, "trap": "unmentioned", "why": "沒有任何邀請活動的內容。"}
      ],
      "evidence": [{"doc": 0, "quote": "I am pleased to confirm that the room is available"}],
      "clue": {"text": "Subject: Training Room Booking", "steps": ["題幹問 main purpose，屬於總覽題", "看主旨行與第一段：回覆預約詢問", "第二句 I am pleased to confirm 直接點出目的", "其他選項在文中都找不到依據"]}
    },
    {
      "n": 2, "type": "detail",
      "stem": "What is Mr. Ortiz asked to do by June 18?",
      "stem_zh": "Ortiz 先生被要求在 6 月 18 日前做什麼？",
      "src": [0],
      "options": [
        {"t": "Report any extra equipment he needs", "zh": "告知所需的額外設備", "ok": true, "why": "正解：please let me know by June 18 是在說明額外設備的需求。"},
        {"t": "Order food for the session", "zh": "為訓練訂餐", "ok": false, "trap": "distort", "why": "餐點只說可自行安排，且送達時間是 8:30 A.M.，不是 6 月 18 日。"},
        {"t": "Submit a list of attendees", "zh": "提交參加者名單", "ok": false, "trap": "unmentioned", "why": "文中沒有要求名單。"},
        {"t": "Pick up a key from the Facilities office", "zh": "到設施部門領取鑰匙", "ok": false, "trap": "unmentioned", "why": "文中沒有提到鑰匙。"}
      ],
      "evidence": [{"doc": 0, "quote": "please let me know by June 18"}],
      "clue": {"text": "June 18", "steps": ["關鍵詞是 by June 18", "掃讀找到 June 18，在第三段", "往前看：If you need additional equipment…", "同義轉述：let me know → report；additional equipment → extra equipment"]}
    },
    {
      "n": 3, "type": "vocab",
      "stem": "The word “provided” in paragraph 4 is closest in meaning to",
      "stem_zh": "第 4 段中的 “provided” 意思最接近",
      "src": [0],
      "target": {"doc": 0, "word": "provided"},
      "options": [
        {"t": "supplied", "zh": "供應", "ok": false, "trap": "commonmeaning", "why": "provide 的常見動詞義，但此處是 provided that 的連接詞用法。"},
        {"t": "as long as", "zh": "只要", "ok": true, "why": "正解：provided that = as long as，表示條件。"},
        {"t": "even though", "zh": "即使", "ok": false, "trap": "opposite", "why": "表示讓步，與「條件」相反。"},
        {"t": "as soon as", "zh": "一…就", "ok": false, "trap": "nearmeaning", "why": "表示時間先後，不是條件。"}
      ],
      "evidence": [{"doc": 0, "quote": "provided that it is delivered to the loading entrance by 8:30 A.M."}],
      "clue": {"text": "provided that", "steps": ["題幹問單字在語境中的意思", "provided 後面接 that 子句 → 連接詞", "supplied 是熟義陷阱，even though 與 as soon as 語意不符", "代入 as long as it is delivered… 句意通順"]}
    },
    {
      "n": 4, "type": "insert",
      "stem": "In which of the positions marked [1], [2], [3], and [4] does the following sentence best belong?",
      "stem_zh": "下面這個句子最適合放在標示 [1]、[2]、[3]、[4] 的哪個位置？",
      "src": [0],
      "target": {"doc": 0, "sentence": "This allows our staff enough time to prepare the items.", "sentence_zh": "這能讓我們的員工有足夠的時間準備這些物品。"},
      "options": [
        {"t": "[1]", "zh": "位置 1", "ok": false, "trap": "position", "why": "前一句在談預約教室，this 與 the items 沒有對應的指涉。"},
        {"t": "[2]", "zh": "位置 2", "ok": false, "trap": "position", "why": "前一句是教室設備，the items 指的是「額外設備」，此處還沒提到。"},
        {"t": "[3]", "zh": "位置 3", "ok": true, "why": "正解：前一句要求 6 月 18 日前告知額外設備，This 指提前告知，the items 指額外設備；後一句 after that date 也仍然成立。"},
        {"t": "[4]", "zh": "位置 4", "ok": false, "trap": "position", "why": "前一句是不提供餐飲，this 與 the items 無法對應。"}
      ],
      "evidence": [{"doc": 0, "quote": "please let me know by June 18"}, {"doc": 0, "quote": "Requests received after that date"}],
      "clue": {"text": "Requests received after that date", "steps": ["四個選項是位置 → 插入題，留到最後做", "插入句有 This 與 the items，需要前文提供指涉", "只有位置 3 的前一句提出「提前告知額外設備」", "代入後 after that date 仍指向 June 18，順序連貫"]}
    }
  ],
  "vocab": [
    {"word": "onboarding", "ipa": "/ˈɑːnbɔːrdɪŋ/", "pos": "n.", "col": "onboarding session", "zh": "新人報到訓練"},
    {"word": "guarantee", "ipa": "/ˌɡærənˈtiː/", "pos": "v.", "col": "cannot be guaranteed", "zh": "保證"},
    {"word": "loading entrance", "ipa": "/ˈloʊdɪŋ ˈentrəns/", "pos": "n.", "col": "deliver to the loading entrance", "zh": "裝卸入口"}
  ]
}
```

### 4.3 雙篇整合題示意（兩份文件＋兩個整合題；正式題組須有 5 題）

```json
{
  "format": "double",
  "docs": [
    {
      "kind": "notice", "label": "公告", "voice": "M",
      "head": ["Brookfield Community Center", "Spring Pottery Workshops"],
      "body": [
        "Workshops run on Saturdays from April 5 to April 26. Beginners meet at 10:00 A.M.; advanced students meet at 1:00 P.M.",
        "The fee is $80 for members and $110 for non-members. Register by March 28 to receive a free set of tools."
      ],
      "zh": [
        "工作坊於 4 月 5 日至 4 月 26 日的每週六舉行。初學者上午 10:00 上課；進階學員下午 1:00 上課。",
        "費用為會員 80 美元、非會員 110 美元。3 月 28 日前報名可獲贈一套免費工具。"
      ]
    },
    {
      "kind": "email", "label": "電子郵件", "voice": "F",
      "head": ["To: Registration Desk", "From: Leah Kim", "Date: March 30", "Subject: Beginners' workshop"],
      "body": [
        "I joined the center as a member on March 25, and I would like to register for the beginners' workshop today.",
        "Please let me know what time the first session starts and how I can pay."
      ],
      "zh": [
        "我在 3 月 25 日加入中心成為會員，今天想報名初學者工作坊。",
        "請告訴我第一堂課幾點開始，以及我該如何付款。"
      ]
    }
  ],
  "questions": [
    {
      "n": 1, "type": "detail",
      "stem": "How much will Ms. Kim most likely pay for the workshop?",
      "stem_zh": "Kim 女士最有可能要為工作坊付多少錢？",
      "src": [0, 1],
      "options": [
        {"t": "$80", "zh": "80 美元", "ok": true, "why": "正解：公告列出會員價 $80；email 說她 3 月 25 日已成為會員。"},
        {"t": "$110", "zh": "110 美元", "ok": false, "trap": "partial", "why": "這是非會員價；只看公告而忽略 email 中的會員身分才會選。"},
        {"t": "$190", "zh": "190 美元", "ok": false, "trap": "distort", "why": "把兩種費用相加，沒有依據。"},
        {"t": "$30", "zh": "30 美元", "ok": false, "trap": "distort", "why": "把兩種費用相減，沒有依據。"}
      ],
      "evidence": [{"doc": 0, "quote": "The fee is $80 for members and $110 for non-members"}, {"doc": 1, "quote": "I joined the center as a member on March 25"}],
      "clue": {"text": "$80 for members", "steps": ["費用在公告，身分在 email → 整合題", "公告：會員 $80、非會員 $110", "email：Kim 女士 3 月 25 日已加入成為會員", "套用會員價 $80"]}
    },
    {
      "n": 2, "type": "inference",
      "stem": "What is indicated about Ms. Kim?",
      "stem_zh": "關於 Kim 女士，文中指出了什麼？",
      "src": [0, 1],
      "options": [
        {"t": "She will not receive a free set of tools.", "zh": "她不會獲得免費工具。", "ok": true, "why": "正解：公告要求 3 月 28 日前報名才贈工具，email 日期是 3 月 30 日，已逾期。"},
        {"t": "She will attend the 1:00 P.M. session.", "zh": "她會上下午 1:00 的課。", "ok": false, "trap": "distort", "why": "她報名的是初學者班，初學者是上午 10:00。"},
        {"t": "She registered before the deadline.", "zh": "她在截止日前報名。", "ok": false, "trap": "opposite", "why": "email 日期 3 月 30 日晚於 3 月 28 日。"},
        {"t": "She became a member after registering.", "zh": "她在報名後才成為會員。", "ok": false, "trap": "opposite", "why": "她在 3 月 25 日就已是會員，早於今天的報名。"}
      ],
      "evidence": [{"doc": 0, "quote": "Register by March 28 to receive a free set of tools"}, {"doc": 1, "quote": "Date: March 30"}],
      "clue": {"text": "Register by March 28", "steps": ["問「關於她」且需兩份文件 → 整合推論", "公告：3 月 28 日前報名才有工具", "email 標頭日期是 March 30，已超過截止日", "因此推論她拿不到免費工具"]}
    }
  ]
}
```

### 4.4 訊息串（chat）與意圖題示意

```json
{
  "format": "single",
  "docs": [
    {
      "kind": "chat", "label": "線上聊天", "voice": "F",
      "speakers": {"Dana Park": "F", "Marcus Lee": "M"},
      "messages": [
        {"who": "Dana Park", "time": "10:02 A.M.", "t": "Marcus, did the supplier confirm Thursday's delivery?", "zh": "Marcus，供應商確認週四的送貨了嗎？"},
        {"who": "Marcus Lee", "time": "10:05 A.M.", "t": "Not yet. They said they'd call back by noon.", "zh": "還沒。他們說中午前會回電。"},
        {"who": "Dana Park", "time": "10:06 A.M.", "t": "OK. The warehouse crew needs a few hours' notice.", "zh": "好。倉庫人員需要提前幾個小時通知。"},
        {"who": "Marcus Lee", "time": "10:12 A.M.", "t": "Understood. I'll keep my phone close.", "zh": "了解。我會把手機放在身邊。"}
      ]
    }
  ],
  "questions": [
    {
      "n": 1, "type": "intent",
      "stem": "At 10:12 A.M., what does Mr. Lee most likely mean when he writes, “I'll keep my phone close”?",
      "stem_zh": "上午 10:12，Lee 先生寫「I'll keep my phone close」最可能是什麼意思？",
      "src": [0],
      "target": {"doc": 0, "msg": 3},
      "options": [
        {"t": "He will be ready to answer the supplier's call.", "zh": "他會準備好接聽供應商的電話。", "ok": true, "why": "正解：前文說供應商中午前會回電，他要隨時能接。"},
        {"t": "He plans to buy a new phone.", "zh": "他打算買新手機。", "ok": false, "trap": "unmentioned", "why": "文中沒有提到買手機。"},
        {"t": "He wants Ms. Park to call the supplier.", "zh": "他希望 Park 女士打給供應商。", "ok": false, "trap": "distort", "why": "是供應商要回電給他。"},
        {"t": "He is leaving the office for the day.", "zh": "他今天要離開辦公室。", "ok": false, "trap": "overreach", "why": "字面的「放近一點」被過度解讀成離開辦公室。"}
      ],
      "evidence": [{"doc": 0, "quote": "They said they'd call back by noon."}, {"doc": 0, "quote": "I'll keep my phone close."}],
      "clue": {"text": "call back by noon", "steps": ["引號句是意圖題，不能只看字面", "往前找脈絡：供應商中午前會回電", "keep my phone close ＝ 隨時能接到電話", "字面義與無依據的選項都排除"]}
    }
  ]
}
```

---

## 5. 網頁行為（`part7.html`／`part7.js`）

`part7.html` 與 `part5.html` 相同，只改 `<title>` 與 `<script src="part7.js">`。

### 5.1 首頁
- 篩選：主題（D1–D7）、難度、組別（單篇／雙篇／三篇）、題型（purpose／detail／notTrue／inference／vocab／intent／insert）、文件類型。
- 按鈕：「練習（N 組）」、「模擬測驗」（見 5.3）、「錯題複習（N 題）」。
- 列表：每組顯示 id、tag、組別、文件類型標籤、題數、難度、上次結果。

### 5.2 練習模式（一組一畫面）
1. **版面**：桌機（≥ md）左右兩欄：左欄是文件（可捲動），右欄是題目；手機上下排列：文件在上、題目在下。雙篇、三篇用「文件 1／2／3」分頁籤，並有「全部顯示」切換。
2. **文件呈現**：標頭、稱呼、段落（段首顯示小的 ¶1、¶2 供「paragraph N」題參考）；`kind:'chat'` 以對話氣泡呈現（姓名、時間、內容，兩位以上說話者左右或顏色區分）；`table` 以橫向可捲動的表格呈現。
3. **播放**：每份可朗讀的文件（`read !== false`）上方有「▶ 播放這篇」＋0.75×／1×／1.25×＋「錄音檔／機器發音」標示；播放時按鈕變「⏹ 停止」。作答前就能播（Part 7 的文件音檔不含答案）。
4. **題目**：依序顯示題幹與 4 個選項（洗牌，正解位置不與上次相同；`insert` 題不洗牌，選項顯示為 [1]–[4]，並在文件中標記位置）。`vocab` 題在文件中高亮目標字；`intent` 題在對應訊息加框；`insert` 題在題幹下方顯示要插入的句子。
5. **作答後**（每題即時）：標示對錯；顯示每個選項的 `why` 與 `trap` 中文名；用 `evidence.quote` 在文件中高亮並捲動到位；整合題標示「這是整合題：需要文件 1＋2」；`insert` 題把句子插入正確位置顯示。
6. 全組答完後的解析區：每題 `clue.steps`、全文中文翻譯（收合）、`vocab` 單字（點擊 TTS 唸）、本組用時。
7. 介面提示（可收合）：「先瀏覽題目 10–15 秒再讀文章」「NOT 題最後做」「整合題先找共同連結點（人名、日期、產品）」。

### 5.3 模擬測驗模式
- 不顯示對錯、不顯示播放鈕、不高亮證據；有題號格、「待檢查」旗標、上一／下一題、跨組切換、交卷。
- 選項：「單組」、「迷你（1 單篇＋1 雙篇＋1 三篇，約 12–14 題）」、「完整版（依題庫量，目標單篇 29／雙篇 10／三篇 15 題，題庫不足就隱藏）」。
- 倒數時限 = 各組（題數 × 秒數）加總；只提示、不強制。

### 5.4 結果頁
- 總分 c/n、答對率、總用時與平均每題用時、超過 120 秒的題數。
- 各題型正確率、整合題 vs 單篇題正確率、各組別正確率；最常中的陷阱排行（`trap`）。
- 答錯題以「組」為單位列出（沿用 `reviewH` 的 `<details>` 樣式），展開後可看選項與文件證據；答錯的題加入錯題複習。

### 5.5 記錄（`toeicPart7V1`）
- `rec[題目id#n] = {ok, k, secs, t}`；`saved[題目id#n] = true`；`rot[題目id#n] = {last}`；`stat[題目id#n] = {picked:[…4 個計數]}`。
- 錯題複習以組為單位：整組重做，上次答錯的題標黃。

### 5.6 維護頁
- 矩陣：主題 × 難度，格內「組數 · 🎧文件音檔完整數」；另有組別（單／雙／三）與題型題數統計、建議占比、整合題占比（應 ≥ 20%）、偏少標黃。
- 新增題目：選主題、難度、組別、文件類型（可複選）、組數（1／2／3／5）、「本批必含題型」（可複選，選填）→ 產生「給 AI 的寫題目指令」（第 10 節）。
- 單組展開：文件、題目、選項（含 trap）、證據、音檔面板（每份文件的檔名與有／缺）。
- 「複製本格缺的清單」格式：`{檔名}.mp3 | 朗讀稿 | M或F（chat 為 M+F）`。

---

## 6. 音檔規格

- **一份文件一個檔**：`audio/p7/{id}-d1.mp3`、`{id}-d2.mp3`、`{id}-d3.mp3`（d 後面的數字 = `docs` 索引 + 1）。
- **哪些文件要有音檔**：預設只有 `email、letter、memo、notice、article、ad、review、webpage、chat` 要有；`form、invoice、schedule、table` 預設不朗讀（`read:false`，網頁不顯示播放鈕，掃描也不要求）。散文型文件若不想朗讀，也可手動寫 `read:false`。
- **朗讀內容**：`say` 若有就念 `say`；否則念「`head` 各行 → `body` 各段」（insert 題的文件照原文念，不要把插入句念進去）。chat 念 `messages` 的 `t`，**不念姓名與時間**。
- **chat 的聲音**：mp3 建議兩位說話者用不同性別／音色錄在同一檔；機器發音則每則訊息依 `speakers` 設定的 F／M 分別選聲音，訊息之間停 0.4 秒。
- 網頁邏輯與 Part 5 相同：`audio/index.json` 的 `p7.complete` 含 `{id}-d{k}`（該文件所有需要的檔案都有）→ 用 mp3；否則 TTS。因為是「一份文件一個狀態」，索引裡請用**文件鍵**，例如 `complete: ["d1-001-m-d1", …]`，並另有 `partial`（某組的部分文件缺檔）供維護頁顯示。
- 逐句跟讀不在第一版範圍。

### `audio_scan.py` 要新增的區塊

```python
# Part 7：audio/p7/{id}-d{k}.mp3（一份文件一檔；read:false 或表格類文件不要求）
NO_AUDIO_KINDS = {'form', 'invoice', 'schedule', 'table'}
exp, docs_of = {}, {}
for it in items('part7.json'):
    if not (isinstance(it, dict) and it.get('id') and isinstance(it.get('docs'), list)):
        continue
    for k, d in enumerate(it['docs'], 1):
        if not isinstance(d, dict):
            continue
        if d.get('read') is False or d.get('kind') in NO_AUDIO_KINDS:
            continue
        exp['%s-d%d' % (it['id'], k)] = ['%s-d%d.mp3' % (it['id'], k)]
        docs_of.setdefault(it['id'], []).append('%s-d%d' % (it['id'], k))
c, p, o = check(os.path.join(AUD, 'p7'), exp, 'audio/p7')
# 整組是否到齊（維護頁用來顯示 🎧 數）
sets_complete = [i for i, ks in docs_of.items() if all(k in c for k in ks)]
out['p7'] = {'complete': c, 'sets': sets_complete, 'partial': {}, 'orphans': o}
print('p7：文件 %d，音檔完整 %d，缺 %d，孤兒檔 %d；題組整組到齊 %d / %d'
      % (len(exp), len(c), len(exp) - len(c), len(o), len(sets_complete), len(docs_of)))
```

同時更新檔案開頭說明與最後的孤兒檔迴圈（加入 `'p7'`）。

---

## 7. 整合修改清單

1. **`index.html`**：Part 7 那一項加上 `href: 'part7.html'`，並補 `sub: '單篇／雙篇／三篇 · 整合題 · 文件音檔'`。
2. **`audio/audio_scan.py`**：見第 6 節。
3. **`json_merge.py`**：新增 `Part7` Profile（仿 `Part5`，約第 981–1150 行）：`name='part7'`、`title='Part 7 閱讀'`、`main_name='part7.json'`、`backup_prefix='part7'`、副檔判斷 `fname.lower().startswith('p7_')`；在 `PROFILES`、`ORDER`、自動偵測、用法說明、模組開頭註解加入 `part7`；驗證規則見第 8 節；`done_note` 提示音檔放 `audio/p7/{id}-d{k}.mp3`。
4. **新增** `audio/p7/`（空資料夾，附 `.gitkeep`）。

---

## 8. `json_merge.py` 的 Part 7 驗證規則

**錯誤（擋下不合併）**
- `id` 格式、唯一性、`domain`／`scene`／`tier`／`score`／`cefr` 與 Part 5 規則相同。
- `format` 為 single／double／triple；`docs` 數量分別為 1／2／3；`questions` 數量：single 2–4、其餘剛好 5；`n` 連號。
- 每份文件：`kind` 在 `_spec.kinds`；`voice` 為 F／M；`chat` 必須有 `messages` 與 `speakers`，且每則 `who` 都在 `speakers` 內；非 chat 必須有 `body`，且 `zh` 與 `body` 同長。
- 每題：`type` 在 `_spec.qtypes`；`src` 為合法的文件索引；`options` 剛好 4 個、**剛好 1 個 `ok:true`**；錯誤選項有 `trap`（在 `_spec.traps` 內）與 `why`；正解 `why` 以「正解：」開頭；選項文字不重複。
- `evidence` 至少 1 筆；每筆 `quote` 必須逐字出現在對應文件的 `head`、`body`、`messages[].t` 或 `table` 儲存格；整合題（`src` 長度 ≥ 2）至少 2 筆且來自不同文件；`evidence.doc` 必須屬於 `src`。
- `clue.steps` 剛好 4 句；`clue.text` 必須是任一文件的原文片段。
- `vocab` 題：有 `target.doc`、`target.word`，該字在該文件中恰好出現 1 次；選項詞性不另檢查，但至少 1 個 `commonmeaning`。
- `intent` 題：文件 `kind` 必須是 chat；題幹含的引號句與時間必須和 `target.msg` 的訊息逐字一致。
- `insert` 題：目標文件 `body` 中 `[1]`～`[4]` 各恰好出現 1 次；`target.sentence` 存在；`options` 的 `t` 依序為 `[1]`～`[4]`，剛好 1 個 `ok:true`。
- 雙篇／三篇：整合題（`src.length≥2`）至少 2 題；每組 `vocab`、`notTrue`、`insert` 題各最多 1 題。
- `intent` 以外的題型不得以 chat 為唯一文件來源時出現 `insert`。

**警告（提示但可合併）**
- 字數超出難度範圍（依第 3.5 節）。
- 單篇組沒有 `detail`；多篇組全是整合題或全不是。
- 4 個選項長度差超過 2 倍；正解是最長的選項（最近 N 題統計偏高時提醒）。
- 正解與原文有連續 6 個以上相同單字（疑似照抄）。
- `tag`、文件標頭、首句、`vocab.word` 與已有題目雷同（`difflib` 相似度 ≥ 0.85）。
- 星期與日期同時出現時，用 `datetime` 檢查是否與某一年相容（若題組內未指定年份，只檢查「同一星期日期組合在同一年內彼此一致」）。

---

## 9. 交付順序與驗收清單

**建議分階段（每階段都能獨立運作）**
1. `part7.json`（含 `_spec` 與至少 4 組範例：初級單篇、中級單篇、中級雙篇、高級三篇或 chat）＋ `part7.html` ＋ `part7.js` 的練習模式、文件版面、證據高亮、音訊。
2. 模擬測驗與結果頁。
3. 維護頁與 AI 寫題目指令。
4. `json_merge.py`、`audio_scan.py`、`index.html` 整合。

**驗收清單**
- [ ] `index.html` 點 Part 7 能進入；深淺色與其他頁同步，不會清掉作答紀錄。
- [ ] 桌機左右兩欄、手機上下排列；雙篇、三篇有分頁籤與「全部顯示」。
- [ ] 練習：每份可朗讀文件都有播放鈕；有 mp3 播 mp3，否則 TTS（chat 會依說話者換男女聲）；切題、離開、切換分頁都會停止；速度鍵有效；`form／invoice／schedule／table` 沒有播放鈕。
- [ ] 作答後 `evidence.quote` 在文件中高亮並捲動；vocab 目標字高亮；intent 的訊息有框；insert 題把句子插入正確位置。
- [ ] 整合題有「需要文件 1＋2」標示；結果頁有整合題 vs 單篇題正確率。
- [ ] 測驗模式沒有播放鈕、沒有對錯與證據；時限與總題數正確；交卷數字用範例手算比對。
- [ ] 錯題複習以組為單位；維護頁矩陣、題型統計、缺音檔清單與 `audio/index.json` 一致。
- [ ] `json_merge.py` 能擋下：`quote` 不在原文、兩個 `ok:true`、整合題證據只有 1 份文件、`[3]` 缺漏、intent 用在非 chat、雙篇只有 4 題。
- [ ] `audio_scan.py` 能列出 p7 的完整／缺／孤兒檔，並正確略過 `read:false` 與表格類文件。
- [ ] Part 1–6 沒有被改動、沒有新增外部資源。

---

## 10. 「給 AI 的寫題目指令」模板（維護頁自動組出）

網頁照 `part5.js` 的 `promptText()` 組字串；以下是模板，`{}` 由程式代入。

```
請為多益 Part 7 閱讀理解寫 {n} 組（組別：{single／double／triple}），每組的文件與題目規格見下方；輸出為單一 JSON 陣列，規格在最後，不需要另外附 part7.json。

- 主題：{D1 辦公室}（scene 須屬於：{office}）；可選填 biz。
- 組別：{雙篇（2 份文件、剛好 5 題、至少 2 題整合題）}；文件類型建議：{email＋schedule}。
- 難度：{中級}（id 尾碼 m）｜level.score 只能填：{600（cefr B1）、650（cefr B1+）}｜{_spec.tiers.medium.guide}
- 題型：{不限；各題型現有題數與建議占比：…；請優先補數量最少者｜本批必含：inference、insert}。
- id 依序使用：{d1-002-m、d1-003-m…}（domain 填 d1，level.tier 填 medium）；每份文件填 voice（F 或 M）。
- 每題剛好 4 個選項、1 個正解；每個干擾項必須有 trap 與 why；每題至少 1 筆 evidence，quote 必須逐字出現在對應文件；整合題至少 2 筆且來自不同文件。
- clue.steps 依四步驟各寫一句：判斷題型 → 定位關鍵詞或證據 → 排除干擾項 → 代入驗證。
- {rules 逐條列出}
- 已用過的 vocab（不得重複）：{…}
- 已用過的 tag（不得重複）：{…}
- 已有的文件標頭與首句（不要雷同）：{…}
- 輸出方式：建立檔案 p7_{首個id}_x{n}.json（只含一個合法 JSON 陣列、UTF-8、不加程式碼區塊標記）；無法建檔才輸出單一 json 程式碼區塊。

【規格：part7.json 的 _spec 精簡版】
{精簡 JSON}
```

**寫完請 AI 自我檢查**（也可加在指令最後）：
1. 每個 `quote` 逐字複製自文件，沒有改動標點或大小寫。
2. 把每個干擾項代回整份文件，確認只有 1 個選項成立（尤其整合題：單看一份文件會得到哪個錯誤答案？它是否標了 `partial` 或 `wrongdoc`？）。
3. 正解沒有照抄原文；至少 1 個干擾項沿用原文字詞但意思不對。
4. 用程式驗算所有金額、日期、星期與時間。
5. `intent` 只用在 chat；`vocab` 目標字在該文件只出現 1 次；`insert` 的 `[1]`–`[4]` 各 1 次，插入後文法與邏輯成立。
6. 有任何不確定寫進 `issues`；無法達到規格時回傳 `{"skip":"原因"}`。
