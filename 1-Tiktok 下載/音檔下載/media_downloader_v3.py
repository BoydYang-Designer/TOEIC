# -*- coding: utf-8 -*-
"""media_downloader_v3.py — TikTok / YouTube 音檔下載器（v2 升級版）

新增：每下載一個音檔，會在同一個資料夾多產生一份「同檔名 .txt」素材文件，
      內容可以直接貼到 daily.html 的 D8「新增文章」：
        【D8 設定】建議的專案／類型／tag
        【1】貼到「補充要求」欄的文字（請 AI 取標題）
        【2】貼到提示詞最下方「【我的文本】」之後的英文文本
        【3】來源資料（連結、作者、時長、字數、文本來源；不用貼）

文本的取得順序：
  YouTube：手動字幕 → 語音辨識(whisper，若有安裝且你選擇啟用) → 自動字幕(無標點，較不準)
  TikTok ：語音辨識(whisper)；沒有安裝或不啟用時，文本欄會留空，請自己貼

已經有音檔？啟動後選「直接選音檔轉文字」，可一次選多個本機音檔（mp3／m4a／wav…），
只做語音辨識並在音檔旁邊產生同名 .txt 素材文件，不需要下載。

需要：pip install requests yt-dlp ；另外要有 ffmpeg
選用：pip install faster-whisper（建議；或 openai-whisper）→ 才能對沒有字幕的影片產生文本
"""
import os
import re
import glob
import html
import time
import json
import importlib.util
import subprocess
import requests
from tkinter import Tk, messagebox, simpledialog
from tkinter.filedialog import askdirectory, askopenfilenames

# ───────── 可調整的設定 ─────────
PROJECT_NAME = '短影音'        # D8 的專案名稱（會寫在素材文件的建議設定裡）
ASR_MODEL = 'small'            # whisper 模型大小：tiny／base／small／medium（越大越準越慢）
ASR_LANG = 'en'                # 影片語言；英文素材用 'en'，要自動偵測可改成 None
PARA_GAP_SEC = 2.0             # 語音辨識時，停頓超過幾秒就分成新段落
WORDS_LONG = 450               # 超過這個字數，素材文件會提醒偏長
WORDS_SHORT = 40               # 少於這個字數，會提醒偏短

# ===========================
# TikTok 下載相關函數
# ===========================

def extract_video_id(url):
    """從 TikTok URL 中提取影片 ID"""
    patterns = [
        r'tiktok\.com/@[\w\.-]+/video/(\d+)',
        r'tiktok\.com/v/(\d+)',
        r'vm\.tiktok\.com/(\w+)',
        r'vt\.tiktok\.com/(\w+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def clean_filename(filename):
    """清理檔名中的非法字元"""
    filename = re.sub(r'[<>:"/\\|?*]', '', filename)
    filename = ' '.join(filename.split())
    if len(filename) > 100:
        filename = filename[:100]
    return filename if filename else "audio"


def download_with_api1(url):
    """使用 API 方法 1: TikWM - 下載影片音訊"""
    try:
        api_url = "https://www.tikwm.com/api/"
        payload = {"url": url, "hd": 1}
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        response = requests.post(api_url, data=payload, headers=headers, timeout=30)
        if response.status_code == 200:
            data = response.json()
            if data.get('code') == 0 and 'data' in data:
                video_url = data['data'].get('play')      # 影片 URL（含原聲）
                audio_url = data['data'].get('music')     # 背景音樂 URL（備用）
                title = data['data'].get('title', 'tiktok_audio')
                author = data['data'].get('author', {}).get('nickname', 'Unknown')
                duration = data['data'].get('duration')   # 秒（素材文件用）
                if video_url:
                    return {'video_url': video_url, 'audio_url': audio_url, 'title': title,
                            'author': author, 'duration': duration, 'type': 'video'}
                elif audio_url:
                    return {'audio_url': audio_url, 'title': title, 'author': author,
                            'duration': duration, 'type': 'music'}
    except Exception:
        pass
    return None


def download_with_api2(url):
    """使用 API 方法 2: SnapTik"""
    try:
        clean_url = url.split('?')[0] if '?' in url else url
        api_url = "https://snaptik.app/abc2.php"
        payload = {"url": clean_url, "lang": "en"}
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": "https://snaptik.app",
            "Referer": "https://snaptik.app/"
        }
        response = requests.post(api_url, data=payload, headers=headers, timeout=30)
        if response.status_code == 200:
            audio_match = re.search(r'"?(https?://[^"]*\.mp3[^"]*)"?', response.text)
            if audio_match:
                return {'audio_url': audio_match.group(1), 'title': 'TikTok Audio', 'author': 'Unknown'}
    except Exception:
        pass
    return None


def download_with_api3(url):
    """使用 API 方法 3: SSSTik"""
    try:
        api_url = "https://ssstik.io/abc"
        if not extract_video_id(url):
            return None
        payload = {"id": url, "locale": "en", "tt": "temp_token"}
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": "https://ssstik.io",
            "Referer": "https://ssstik.io/"
        }
        response = requests.post(api_url, data=payload, headers=headers, timeout=30)
        if response.status_code == 200:
            audio_match = re.search(r'href="(https?://[^"]*music[^"]*)"', response.text)
            if audio_match:
                return {'audio_url': audio_match.group(1), 'title': 'TikTok Audio', 'author': 'Unknown'}
    except Exception:
        pass
    return None


def get_tiktok_info(url):
    """獲取 TikTok 音檔資訊 → (預設檔名, info)"""
    for api_func in (download_with_api1, download_with_api2, download_with_api3):
        try:
            audio_info = api_func(url)
            if audio_info and (audio_info.get('audio_url') or audio_info.get('video_url')):
                title = clean_filename(audio_info.get('title', 'tiktok_audio'))
                author = clean_filename(audio_info.get('author', 'Unknown'))
                default_filename = f"{author} - {title}" if author and author != 'Unknown' else title
                return default_filename[:100], audio_info
        except Exception:
            continue
    return None, None


def _unique_mp3(save_path, filename):
    """檔案已存在就自動加數字後綴 → (filename, file_path)"""
    file_path = os.path.join(save_path, f"{filename}.mp3")
    if os.path.exists(file_path):
        counter, original = 1, filename
        while os.path.exists(file_path):
            filename = f"{original}_{counter}"
            file_path = os.path.join(save_path, f"{filename}.mp3")
            counter += 1
    return filename, file_path


def download_tiktok_audio(audio_info, save_path, filename):
    """下載 TikTok 音檔 → 成功回傳 mp3 路徑，失敗回傳 None"""
    try:
        video_url = audio_info.get('video_url')
        audio_url = audio_info.get('audio_url')
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.tiktok.com/"
        }
        if video_url:
            download_url = video_url
            print("  使用影片音訊（包含原聲）")
        elif audio_url:
            download_url = audio_url
            print("  使用背景音樂")
        else:
            print("  ✗ 沒有可用的下載來源")
            return None

        response = requests.get(download_url, headers=headers, stream=True, timeout=60)
        if response.status_code != 200:
            return None

        if video_url:
            filename, file_path = _unique_mp3(save_path, filename)
            temp_video_path = os.path.join(save_path, f"{filename}_temp.mp4")
            total_size = int(response.headers.get('content-length', 0))
            downloaded_size = 0
            with open(temp_video_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded_size += len(chunk)
                        if total_size > 0:
                            print(f"\r  下載進度: {downloaded_size / total_size * 100:.1f}%", end='')
            print("\n  正在提取音訊...")
            try:
                result = subprocess.run([
                    'ffmpeg', '-i', temp_video_path, '-vn', '-acodec', 'libmp3lame',
                    '-ab', '192k', '-y', file_path
                ], capture_output=True, text=True)
                if os.path.exists(temp_video_path):
                    os.remove(temp_video_path)
                if result.returncode == 0:
                    print(f"  ✓ 已儲存: {os.path.basename(file_path)}")
                    return file_path
                print("  ✗ 音訊提取失敗")
                if audio_url:
                    print("  嘗試下載背景音樂...")
                    return download_audio_directly(audio_url, save_path, filename, headers)
                return None
            except FileNotFoundError:
                print("  ✗ 需要安裝 ffmpeg")
                print("  提示: 請安裝 ffmpeg 以提取影片音訊")
                if os.path.exists(temp_video_path):
                    os.remove(temp_video_path)
                if audio_url:
                    print("  嘗試下載背景音樂...")
                    return download_audio_directly(audio_url, save_path, filename, headers)
                return None
        return download_audio_directly(download_url, save_path, filename, headers)
    except Exception as e:
        print(f"\n  ✗ 下載失敗: {e}")
        return None


def download_audio_directly(audio_url, save_path, filename, headers):
    """直接下載音訊檔案 → 成功回傳 mp3 路徑，失敗回傳 None"""
    try:
        audio_response = requests.get(audio_url, headers=headers, stream=True, timeout=60)
        if audio_response.status_code != 200:
            return None
        filename, file_path = _unique_mp3(save_path, filename)
        total_size = int(audio_response.headers.get('content-length', 0))
        downloaded_size = 0
        with open(file_path, 'wb') as f:
            for chunk in audio_response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded_size += len(chunk)
                    if total_size > 0:
                        print(f"\r  下載進度: {downloaded_size / total_size * 100:.1f}%", end='')
        print(f"\n  ✓ 已儲存: {os.path.basename(file_path)}")
        return file_path
    except Exception as e:
        print(f"\n  ✗ 下載失敗: {e}")
        return None


# ===========================
# YouTube 下載相關函數
# ===========================

def get_youtube_info(url):
    """獲取 YouTube 影片資訊 → (預設檔名, info)"""
    try:
        import yt_dlp
        with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True, 'skip_download': True}) as ydl:
            info = ydl.extract_info(url, download=False)
            title = clean_filename(info.get('title', 'youtube_audio'))
            uploader = clean_filename(info.get('uploader', 'Unknown'))
            default_filename = f"{uploader} - {title}" if uploader and uploader != 'Unknown' else title
            return default_filename[:100], info
    except ImportError:
        print("  ✗ 需要安裝 yt-dlp: pip install yt-dlp")
        return None, None
    except Exception as e:
        print(f"  ✗ 獲取 YouTube 資訊失敗: {e}")
        return None, None


def download_youtube_audio(url, save_path, filename):
    """下載 YouTube 音檔 → 成功回傳 mp3 路徑，失敗回傳 None"""
    try:
        import yt_dlp
        filename, file_path = _unique_mp3(save_path, filename)
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': file_path[:-4],  # 移除 .mp3
            'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}],
            'quiet': False,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        if not os.path.exists(file_path):
            print("  ✗ 下載完成但找不到 mp3（可能 ffmpeg 轉檔失敗）")
            return None
        print(f"  ✓ 已儲存: {os.path.basename(file_path)}")
        return file_path
    except ImportError:
        print("  ✗ 需要安裝 yt-dlp: pip install yt-dlp")
        print("  ✗ 需要安裝 ffmpeg")
        return None
    except Exception as e:
        print(f"\n  ✗ 下載失敗: {e}")
        return None


# ===========================
# 文本：字幕解析／語音辨識／清理
# ===========================

NOISE_RE = re.compile(r'\[[^\]]*\]|\((?:music|applause|laughter|laughs|cheering)[^)]*\)|[♪♫]+', re.I)


def clean_text(t):
    """去掉 [Music]、♪、>> 等字幕雜訊，合併空白"""
    t = html.unescape(t)
    t = NOISE_RE.sub(' ', t)
    t = re.sub(r'>>+\s*', '', t)
    return re.sub(r'\s+', ' ', t).strip()


def parse_subtitle(path):
    """讀 .vtt／.srt → 一段乾淨文字（去時間碼、編號、標籤，並去掉自動字幕『滾動重複』的行）"""
    with open(path, encoding='utf-8', errors='replace') as f:
        raw = f.read()
    out, last = [], ''
    for line in raw.splitlines():
        s = line.strip()
        if (not s or s == 'WEBVTT' or '-->' in s or re.fullmatch(r'\d+', s)
                or s.startswith(('Kind:', 'Language:', 'NOTE', 'STYLE'))):
            continue
        s = clean_text(re.sub(r'<[^>]+>', '', s))
        if not s or s == last:
            continue
        out.append(s)
        last = s
    return ' '.join(out)


def fetch_youtube_subs(url, save_path, info, want):
    """want＝'manual' 或 'auto'；回傳字幕文字，沒有就回傳 ''"""
    import yt_dlp
    pool = (info.get('subtitles') if want == 'manual' else info.get('automatic_captions')) or {}
    langs = [k for k in pool if k.lower().startswith('en')]
    if not langs:
        return ''
    lang = 'en-orig' if 'en-orig' in langs else ('en' if 'en' in langs else langs[0])
    tmp = os.path.join(save_path, '_subtmp_%d' % int(time.time()))
    opts = {'skip_download': True, 'quiet': True, 'no_warnings': True,
            'writesubtitles': want == 'manual', 'writeautomaticsub': want == 'auto',
            'subtitleslangs': [lang], 'subtitlesformat': 'vtt/srt/best', 'outtmpl': tmp}
    files = []
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])
        files = glob.glob(glob.escape(tmp) + '*.vtt') + glob.glob(glob.escape(tmp) + '*.srt')
        return parse_subtitle(files[0]) if files else ''
    finally:
        for p in files + glob.glob(glob.escape(tmp) + '*'):
            try:
                os.remove(p)
            except OSError:
                pass


_ASR = {}


def asr_available():
    for mod in ('faster_whisper', 'whisper'):
        if importlib.util.find_spec(mod):
            return mod
    return None


def _fw_run(device, mp3_path, vad):
    """faster-whisper 實際執行（generator 要在這裡就跑完，GPU／CUDA 錯誤才會在這裡被抓到）"""
    from faster_whisper import WhisperModel
    key = 'fw_' + device
    if key not in _ASR:
        print(f"  載入 faster-whisper 模型（{ASR_MODEL}，device={device}，第一次會下載）…")
        _ASR[key] = WhisperModel(ASR_MODEL, device=device, compute_type='int8')
    segs, _info = _ASR[key].transcribe(mp3_path, language=ASR_LANG, vad_filter=vad)
    return [(s.start, s.end, s.text.strip()) for s in segs]


def transcribe_audio(mp3_path):
    """語音辨識 → [(start, end, text), ...]
    自動備援：GPU／CUDA 失敗 → 改用 CPU；VAD 把全部濾掉 → 關掉 VAD 再試一次"""
    eng = asr_available()
    if eng == 'faster_whisper':
        last_err = None
        for device in ('auto', 'cpu'):
            try:
                segs = _fw_run(device, mp3_path, True)
                if not segs:
                    print("  （VAD 沒偵測到人聲，關閉 VAD 再試一次…）")
                    segs = _fw_run(device, mp3_path, False)
                return segs
            except Exception as e:
                last_err = e
                print(f"  （device={device} 失敗：{type(e).__name__}: {e}）")
                if device == 'auto':
                    print("  改用 CPU 再試…")
        raise last_err
    if eng == 'whisper':
        import whisper
        if 'm' not in _ASR:
            print(f"  載入 whisper 模型（{ASR_MODEL}，第一次會下載）…")
            _ASR['m'] = whisper.load_model(ASR_MODEL)
        r = _ASR['m'].transcribe(mp3_path, language=ASR_LANG)
        return [(s['start'], s['end'], s['text'].strip()) for s in r['segments']]
    return []


def segments_to_text(segs, gap=PARA_GAP_SEC):
    """辨識結果 → 文字；停頓超過 gap 秒就換段（段落之間空一行，與 daily 的 passage 一致）"""
    paras, cur, last_end = [], [], None
    for st, en, tx in segs:
        if not tx:
            continue
        if last_end is not None and st - last_end >= gap and cur:
            paras.append(' '.join(cur))
            cur = []
        cur.append(tx)
        last_end = en
    if cur:
        paras.append(' '.join(cur))
    return '\n\n'.join(p for p in (clean_text(p) for p in paras) if p)


def get_transcript(url_type, url, info, mp3_path, save_path, use_asr):
    """→ (文本, 來源說明, 時長秒或 None)；任何一步失敗都不會中斷，最差回傳空文本"""
    dur = None
    if url_type == 'youtube':
        try:
            t = fetch_youtube_subs(url, save_path, info, 'manual')
            if t:
                return t, '手動字幕（YouTube）', dur
        except Exception as e:
            print(f"  （手動字幕讀取失敗：{e}）")
    if use_asr:
        try:
            print("  正在語音辨識（較慢，請稍候）…")
            segs = transcribe_audio(mp3_path)
            if segs:
                dur = segs[-1][1]
                return segments_to_text(segs), 'whisper 語音辨識（%s）' % ASR_MODEL, dur
        except Exception as e:
            print(f"  （語音辨識失敗：{e}）")
    if url_type == 'youtube':
        try:
            t = fetch_youtube_subs(url, save_path, info, 'auto')
            if t:
                return t, '自動字幕（YouTube；通常沒有標點、可能有錯字）', dur
        except Exception as e:
            print(f"  （自動字幕讀取失敗：{e}）")
    return '', '', dur


# ===========================
# 素材文件（貼到 D8 用）
# ===========================

NOTE_TEXT = ('這是一支短影音的文本（口語，來自字幕或語音辨識）。'
             'tag 請用 3–6 個字的中文主題加英文關鍵詞，例如「退貨流程 return policy」，'
             '讓我只看標題就知道在講什麼。')


def fmt_dur(sec):
    try:
        sec = int(round(float(sec)))
    except (TypeError, ValueError):
        return '未知'
    return '%d:%02d' % (sec // 60, sec % 60)


def build_doc(meta, text, text_src, mp3_name):
    words = len(re.findall(r"[A-Za-z0-9'’]+", text))
    warn = []
    if not text:
        warn.append('沒有取得文本：請自己把英文文本貼到【2】（可安裝 faster-whisper 讓程式自動辨識）。')
    else:
        if words > WORDS_LONG:
            warn.append(f'文本約 {words} 字，偏長；daily 文章多半不到這個長度，可考慮只取一段。')
        if words < WORDS_SHORT:
            warn.append(f'文本只有約 {words} 字，偏短；請確認是否辨識不完整。')
        if text_src.startswith('自動字幕'):
            warn.append('這是自動字幕：沒有標點、可能有錯字。建議貼給 AI 前先自己看過，AI 會「逐字照抄」進 passage。')
        if text_src.startswith('whisper'):
            warn.append('語音辨識可能有錯字或專有名詞辨識錯誤；AI 會「逐字照抄」，請先自己看過。')
        warn.append('文本中若有片頭／片尾廣告、「按讚訂閱」等字句，請先刪掉再貼。')
    bar = '=' * 54
    sub = '-' * 54
    L = [bar, '短影音素材｜' + os.path.splitext(mp3_name)[0], bar, '',
         f'【D8 設定】專案：{PROJECT_NAME}　類型：按照文本　tag：留空（讓 AI 取）或自己填',
         f'            音檔入庫時請改名成 w?d8-?.mp3（目前：{mp3_name}），放進 audio/daily/', '',
         sub, '【1】貼到「補充要求」欄', sub, NOTE_TEXT, '',
         sub, '【2】貼到提示詞最下方「【我的文本】」之後', sub, text if text else '（沒有文本，請自己貼在這裡）', '',
         sub, '【3】來源資料（參考用，不用貼）', sub,
         f"平台：{meta.get('platform', '')}",
         f"作者：{meta.get('author', '') or '未知'}",
         f"標題（原文）：{meta.get('title', '') or '未知'}",
         f"連結：{meta.get('url', '')}",
         f"時長：{fmt_dur(meta.get('duration'))}　文本字數：約 {words} 字",
         f"文本來源：{text_src or '無'}",
         f"產生時間：{time.strftime('%Y-%m-%d %H:%M:%S')}"]
    if warn:
        L += ['', '⚠ 提醒'] + ['・' + w for w in warn]
    return '\n'.join(L) + '\n'


def write_doc(mp3_path, meta, text, text_src):
    base = os.path.splitext(mp3_path)[0]
    path, n = base + '.txt', 1
    while os.path.exists(path):
        path = f'{base}_{n}.txt'
        n += 1
    with open(path, 'w', encoding='utf-8-sig') as f:
        f.write(build_doc(meta, text, text_src, os.path.basename(mp3_path)))
    return path


# ===========================
# 通用函數
# ===========================

def detect_url_type(url):
    """判斷 URL 類型"""
    u = url.lower()
    if 'tiktok' in u:
        return 'tiktok'
    if 'youtube' in u or 'youtu.be' in u:
        return 'youtube'
    return 'unknown'


def get_media_info(url):
    """獲取媒體資訊 (自動判斷類型)"""
    url_type = detect_url_type(url)
    if url_type == 'tiktok':
        return get_tiktok_info(url), 'tiktok'
    if url_type == 'youtube':
        return get_youtube_info(url), 'youtube'
    return (None, None), 'unknown'


def process_one(url, save_path, use_asr):
    """處理一個連結：取得資訊 → 問檔名 → 下載 → 產生素材文件。成功回傳 (mp3路徑, 文件路徑)，失敗回傳 None"""
    url_type = detect_url_type(url)
    if url_type == 'unknown':
        print(f"\n✗ 不支援的連結類型: {url}")
        messagebox.showwarning("錯誤", "不支援的連結類型\n請使用 TikTok 或 YouTube 連結")
        return None
    print(f"\n處理連結: {url}\n類型: {url_type.upper()}\n正在獲取檔案資訊...")
    (default_filename, media_info), _ = get_media_info(url)
    if not default_filename:
        print("✗ 無法獲取檔案資訊")
        messagebox.showerror("錯誤", "無法獲取檔案資訊\n請檢查連結是否正確")
        return None
    print(f"預設檔名: {default_filename}")

    custom = simpledialog.askstring(
        "編輯檔名",
        f"類型: {url_type.upper()}\n預設檔名: {default_filename}.mp3\n\n"
        f"請輸入檔名 (不含副檔名)：\n"
        f"（要直接當文章音檔可輸入 w5d8-1 這種 id；素材文件會用同一個檔名）",
        initialvalue=default_filename)
    filename = clean_filename(custom.strip()) if custom and custom.strip() else default_filename
    print(f"\n開始下載: {filename}.mp3")

    mp3_path = (download_tiktok_audio(media_info, save_path, filename) if url_type == 'tiktok'
                else download_youtube_audio(url, save_path, filename))
    if not mp3_path:
        return None

    print("  正在整理文本與素材文件…")
    try:
        text, text_src, dur = get_transcript(url_type, url, media_info, mp3_path, save_path, use_asr)
    except Exception as e:
        print(f"  （取得文本失敗：{e}）")
        text, text_src, dur = '', '', None
    if url_type == 'youtube':
        meta = dict(platform='YouTube', author=media_info.get('uploader'), title=media_info.get('title'),
                    duration=media_info.get('duration') or dur)
    else:
        meta = dict(platform='TikTok', author=media_info.get('author'), title=media_info.get('title'),
                    duration=media_info.get('duration') or dur)
    meta['url'] = url
    try:
        doc_path = write_doc(mp3_path, meta, text, text_src)
    except Exception as e:
        print(f"  ✗ 素材文件寫入失敗：{e}")
        return mp3_path, None
    print(f"  ✓ 素材文件: {os.path.basename(doc_path)}（文本來源：{text_src or '無'}）")
    return mp3_path, doc_path


AUDIO_TYPES = [("音訊檔", "*.mp3 *.m4a *.wav *.aac *.flac *.ogg *.opus *.wma *.mp4 *.webm"),
               ("所有檔案", "*.*")]


def process_local_audio(audio_path):
    """處理一個本機音檔：語音辨識 → 產生同名 .txt 素材文件。成功回傳 (音檔路徑, 文件路徑)，失敗回傳 None"""
    name = os.path.basename(audio_path)
    print(f"\n處理本機音檔: {name}")
    try:
        print("  正在語音辨識（較慢，請稍候）…")
        segs = transcribe_audio(audio_path)
    except Exception as e:
        import traceback
        print(f"  ✗ 語音辨識失敗：{type(e).__name__}: {e}")
        traceback.print_exc()
        return None
    if not segs:
        print("  ✗ 沒有辨識到任何內容（可能是沒有人聲，或 ASR_LANG 設定與音檔語言不符）")
        return None
    text = segments_to_text(segs)
    text_src = 'whisper 語音辨識（%s）' % ASR_MODEL
    meta = dict(platform='本機音檔', author='', title=os.path.splitext(name)[0],
                duration=segs[-1][1], url=audio_path)
    try:
        doc_path = write_doc(audio_path, meta, text, text_src)
    except Exception as e:
        print(f"  ✗ 素材文件寫入失敗：{e}")
        return None
    print(f"  ✓ 素材文件: {os.path.basename(doc_path)}")
    return audio_path, doc_path


def run_local_mode():
    """選擇現有音檔 → 直接語音辨識，不下載"""
    if not asr_available():
        print("✗ 沒有安裝 faster-whisper／whisper，無法語音辨識。")
        print("  請執行：pip install faster-whisper")
        messagebox.showerror("缺少語音辨識套件",
                             "找不到 faster-whisper 或 whisper。\n\n請先執行：\npip install faster-whisper")
        return
    files = askopenfilenames(title="選擇要轉文字的音檔（可多選）", filetypes=AUDIO_TYPES)
    if not files:
        print("未選擇音檔，程式結束。")
        return
    print(f"\n已選擇 {len(files)} 個音檔")

    ok_list, fail_count = [], 0
    for f in files:
        r = process_local_audio(f)
        if r:
            ok_list.append(r)
        else:
            fail_count += 1
        print("-" * 60)

    print("\n" + "=" * 60)
    print(f"完成！成功: {len(ok_list)} 個　失敗: {fail_count} 個")
    for audio, doc in ok_list:
        print(f"  ♪ {os.path.basename(audio)}　→　📄 {os.path.basename(doc)}")
    print("=" * 60)
    if ok_list:
        messagebox.showinfo("完成", f"成功 {len(ok_list)} 個、失敗 {fail_count} 個\n\n"
                                    "素材文件（.txt）已存在各音檔所在的資料夾")
    else:
        messagebox.showwarning("轉文字失敗", "沒有成功轉出任何文本")


# ===========================
# 主程式
# ===========================

def main():
    print("=" * 60)
    print("TikTok + YouTube 音檔下載器 v3.1（下載或選現有音檔，自動產生 D8 素材文件）")
    print("=" * 60)

    root = Tk()
    root.withdraw()

    if messagebox.askyesno(
            "選擇模式",
            "您已經有音檔了嗎？\n\n● Yes: 直接選音檔轉文字（不下載）\n● No: 貼連結下載音檔"):
        run_local_mode()
        return

    save_path = askdirectory(title="選擇音檔儲存位置")
    if not save_path:
        print("未選擇儲存位置，程式結束。")
        return
    print(f"\n音檔與素材文件將儲存到: {save_path}\n")

    use_asr = False
    eng = asr_available()
    if eng:
        use_asr = messagebox.askyesno(
            "語音辨識",
            f"偵測到 {eng}。\n\n沒有手動字幕時，要用語音辨識產生文本嗎？\n"
            "（較慢；第一次會下載模型）")
    else:
        print("（沒有安裝 faster-whisper／whisper：沒有手動字幕時，素材文件的文本欄會留空）")
        print("（想自動辨識可執行：pip install faster-whisper）\n")

    batch_mode = messagebox.askyesno(
        "批次下載",
        "您要下載多個音檔嗎？\n\n● Yes: 可連續輸入多個連結\n● No: 只下載一個音檔")

    ok_list, fail_count = [], 0
    if batch_mode:
        print("\n--- 批次下載模式 ---\n請輸入連結（每次輸入一個）\n輸入空白或按取消結束\n")
        while True:
            url = simpledialog.askstring("輸入連結", "請貼上 TikTok 或 YouTube 連結:\n（按取消或留空結束）")
            if not url or not url.strip():
                break
            r = process_one(url.strip(), save_path, use_asr)
            if r:
                ok_list.append(r)
            else:
                fail_count += 1
            print("-" * 60)
            time.sleep(0.5)
    else:
        print("\n--- 單一音檔下載 ---")
        url = simpledialog.askstring("輸入連結", "請貼上 TikTok 或 YouTube 連結:")
        if not url or not url.strip():
            print("未輸入連結，程式結束。")
            return
        r = process_one(url.strip(), save_path, use_asr)
        if r:
            ok_list.append(r)
        else:
            fail_count += 1

    print("\n" + "=" * 60)
    print(f"完成！成功: {len(ok_list)} 個　失敗: {fail_count} 個")
    for mp3, doc in ok_list:
        print(f"  ♪ {os.path.basename(mp3)}" + (f"　→　📄 {os.path.basename(doc)}" if doc else "　（素材文件失敗）"))
    print("=" * 60)
    if ok_list:
        messagebox.showinfo("完成", f"成功 {len(ok_list)} 個、失敗 {fail_count} 個\n\n"
                                    f"儲存位置: {save_path}\n（每個音檔旁邊有同名 .txt 素材文件）")
    else:
        messagebox.showwarning("下載失敗", "沒有成功下載任何音檔")


if __name__ == "__main__":
    main()
