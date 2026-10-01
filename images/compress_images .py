# -*- coding: utf-8 -*-
"""
圖片壓縮小工具
- 雙擊執行,預設掃描「此程式所在資料夾」內大於目標大小的圖片
- 目標大小可選 200 / 500 KB,也可自行輸入任意數字
- 可改選其他資料夾,或直接挑選特定檔案
- 確認清單無誤後按「開始壓縮」
"""
import io
import os
import queue
import shutil
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

# ---------- 自動安裝 Pillow ----------
try:
    from PIL import Image, ImageOps
except ImportError:
    print("找不到 Pillow,正在自動安裝...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image, ImageOps

SUPPORTED = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff")
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_NAME = "原始檔備份"


# ---------- 壓縮核心 ----------
def encode(img, fmt, quality=None, colors=None):
    buf = io.BytesIO()
    if fmt == "JPEG":
        img.convert("RGB").save(buf, "JPEG", quality=quality, optimize=True)
    elif fmt == "WEBP":
        img.save(buf, "WEBP", quality=quality, method=6)
    else:  # PNG
        im = img
        if colors:
            if im.mode == "P":
                pass
            elif im.mode in ("RGBA", "LA") or "transparency" in im.info:
                im = im.convert("RGBA").quantize(colors, method=Image.FASTOCTREE)
            else:
                im = im.convert("RGB").quantize(colors, method=Image.MEDIANCUT)
        im.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def fit(img, fmt, max_bytes):
    """在不縮小尺寸的前提下,嘗試壓到 max_bytes 以內,失敗回傳 None"""
    if fmt in ("JPEG", "WEBP"):
        lo, hi, best = 30, 95, None
        while lo <= hi:
            mid = (lo + hi) // 2
            data = encode(img, fmt, quality=mid)
            if len(data) <= max_bytes:
                best, lo = data, mid + 1
            else:
                hi = mid - 1
        return best
    # PNG:先無損最佳化,再逐步減少顏色
    for colors in (None, 256, 128, 64):
        data = encode(img, "PNG", colors=colors)
        if len(data) <= max_bytes:
            return data
    return None


def compress_image(path, max_bytes):
    """回傳 (資料, 輸出副檔名, 縮放比例)"""
    ext = os.path.splitext(path)[1].lower()
    with Image.open(path) as im:
        img = ImageOps.exif_transpose(im)
        img.load()

    if ext in (".jpg", ".jpeg"):
        fmt, out_ext = "JPEG", ext
    elif ext == ".png":
        fmt, out_ext = "PNG", ext
    elif ext == ".webp":
        fmt, out_ext = "WEBP", ext
    else:  # bmp / tif 轉成 jpg
        fmt, out_ext = "JPEG", ".jpg"

    w, h = img.size
    scale = 1.0
    while True:
        cur = img if scale == 1.0 else img.resize(
            (max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
        data = fit(cur, fmt, max_bytes)
        if data:
            return data, out_ext, scale
        scale *= 0.9
        if min(w, h) * scale < 16:
            raise RuntimeError("無法壓縮到指定大小")


# ---------- GUI ----------
class App:
    def __init__(self, root):
        self.root = root
        root.title("圖片壓縮工具")
        root.geometry("760x680")
        root.minsize(700, 560)

        self.mode = "folder"          # folder / files
        self.folder = SCRIPT_DIR
        self.files = []
        self.candidates = []          # 待壓縮檔案路徑
        self.running = False
        self.q = queue.Queue()

        # 目標大小
        top = ttk.LabelFrame(root, text="1. 目標大小(KB)")
        top.pack(fill="x", padx=10, pady=(10, 4))
        self.target_var = tk.StringVar(value="200")
        self.cb = ttk.Combobox(top, textvariable=self.target_var, width=8,
                               values=("200", "500"))
        self.cb.pack(side="left", padx=8, pady=8)
        ttk.Label(top, text="大於此大小的圖片會被壓到此大小以下(可直接輸入其他數字)"
                  ).pack(side="left")
        self.cb.bind("<<ComboboxSelected>>", lambda e: self.scan())
        self.cb.bind("<Return>", lambda e: self.scan())
        self.cb.bind("<FocusOut>", lambda e: self.scan())

        # 來源
        src = ttk.LabelFrame(root, text="2. 來源(預設為本程式所在資料夾)")
        src.pack(fill="x", padx=10, pady=4)
        self.src_label = ttk.Label(src, text=SCRIPT_DIR, wraplength=700)
        self.src_label.pack(anchor="w", padx=8, pady=(6, 2))
        row = ttk.Frame(src)
        row.pack(fill="x", padx=8, pady=(0, 8))
        ttk.Button(row, text="選擇資料夾", command=self.pick_folder).pack(side="left")
        ttk.Button(row, text="選擇檔案", command=self.pick_files).pack(side="left", padx=6)
        ttk.Button(row, text="還原預設", command=self.reset_default).pack(side="left")
        ttk.Button(row, text="重新掃描", command=self.scan).pack(side="left", padx=6)
        self.sub_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(row, text="包含子資料夾", variable=self.sub_var,
                        command=self.scan).pack(side="left", padx=10)

        # 輸出
        out = ttk.LabelFrame(root, text="3. 輸出方式")
        out.pack(fill="x", padx=10, pady=4)
        ttk.Label(out, text=f"壓縮後的檔案會直接覆蓋原檔位置;原始檔會先移到同資料夾下的「{BACKUP_NAME}」資料夾。",
                  wraplength=700).pack(anchor="w", padx=8, pady=6)

        # 底部區域先 pack(side=bottom),確保按鈕永遠看得到
        self.btn = ttk.Button(root, text="確認,開始壓縮", command=self.start)
        self.btn.pack(side="bottom", pady=(2, 10), ipadx=20, ipady=4)
        self.log = tk.Text(root, height=5, state="disabled")
        self.log.pack(side="bottom", fill="x", padx=10, pady=4)
        self.pb = ttk.Progressbar(root, mode="determinate")
        self.pb.pack(side="bottom", fill="x", padx=10, pady=2)
        self.status = ttk.Label(root, text="")
        self.status.pack(side="bottom", anchor="w", padx=12)

        # 清單
        lst = ttk.LabelFrame(root, text="待壓縮清單(選取後按 Delete 可從清單移除)")
        lst.pack(fill="both", expand=True, padx=10, pady=4)
        self.tree = ttk.Treeview(lst, columns=("name", "size"), show="headings", height=5,
                                 selectmode="extended")
        self.tree.heading("name", text="檔案")
        self.tree.heading("size", text="大小")
        self.tree.column("name", width=560)
        self.tree.column("size", width=100, anchor="e")
        sb = ttk.Scrollbar(lst, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        self.tree.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")
        self.tree.bind("<Delete>", self.remove_selected)

        self.scan()

    # --- 工具 ---
    def get_target(self):
        try:
            v = float(self.target_var.get())
            if v <= 0:
                raise ValueError
            return v
        except ValueError:
            return None

    def write_log(self, text):
        self.log.configure(state="normal")
        self.log.insert("end", text + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    @staticmethod
    def fmt_size(n):
        return f"{n / 1024:.1f} KB" if n < 1024 * 1024 else f"{n / 1024 / 1024:.2f} MB"

    # --- 來源選擇 ---
    def pick_folder(self):
        d = filedialog.askdirectory(initialdir=self.folder, title="選擇資料夾")
        if d:
            self.mode, self.folder = "folder", d
            self.src_label.config(text=d)
            self.scan()

    def pick_files(self):
        exts = " ".join("*" + e for e in SUPPORTED)
        fs = filedialog.askopenfilenames(initialdir=self.folder, title="選擇圖片檔案",
                                         filetypes=[("圖片", exts), ("所有檔案", "*.*")])
        if fs:
            self.mode, self.files = "files", list(fs)
            self.src_label.config(text=f"已選擇 {len(fs)} 個檔案")
            self.scan()

    def reset_default(self):
        self.mode, self.folder = "folder", SCRIPT_DIR
        self.src_label.config(text=SCRIPT_DIR)
        self.scan()

    # --- 掃描 ---
    def scan(self):
        if self.running:
            return
        target = self.get_target()
        self.tree.delete(*self.tree.get_children())
        self.candidates = []
        if target is None:
            self.status.config(text="請輸入有效的目標大小(數字)")
            return
        limit = int(target * 1024)

        paths = []
        if self.mode == "files":
            paths = [p for p in self.files if p.lower().endswith(SUPPORTED)]
        elif self.sub_var.get():
            for dp, dn, fn in os.walk(self.folder):
                dn[:] = [d for d in dn if d != BACKUP_NAME]
                paths += [os.path.join(dp, f) for f in fn if f.lower().endswith(SUPPORTED)]
        else:
            paths = [os.path.join(self.folder, f) for f in os.listdir(self.folder)
                     if f.lower().endswith(SUPPORTED)]

        total = 0
        for p in sorted(paths):
            try:
                size = os.path.getsize(p)
            except OSError:
                continue
            total += 1
            if size > limit:
                self.candidates.append(p)
                shown = os.path.relpath(p, self.folder) if self.mode == "folder" else p
                self.tree.insert("", "end", iid=p, values=(shown, self.fmt_size(size)))
        self.status.config(
            text=f"共找到 {total} 張圖片,其中 {len(self.candidates)} 張大於 {target:g} KB 需要壓縮")

    def remove_selected(self, _=None):
        for iid in self.tree.selection():
            self.tree.delete(iid)
            if iid in self.candidates:
                self.candidates.remove(iid)
        self.status.config(text=f"待壓縮:{len(self.candidates)} 張")

    # --- 壓縮 ---
    def start(self):
        if self.running:
            return
        target = self.get_target()
        if target is None:
            messagebox.showwarning("提醒", "請輸入有效的目標大小(數字)")
            return
        if not self.candidates:
            messagebox.showinfo("提醒", "沒有需要壓縮的圖片")
            return
        msg = f"即將壓縮 {len(self.candidates)} 張圖片到 {target:g} KB 以下。\n"
        msg += f"\n壓縮檔會覆蓋原檔位置,原始檔將移到「{BACKUP_NAME}」資料夾。\n"
        msg += "\n確定開始?"
        if not messagebox.askyesno("確認", msg):
            return
        self.running = True
        self.btn.config(state="disabled")
        self.pb.config(maximum=len(self.candidates), value=0)
        self.poll()
        threading.Thread(target=self.worker, args=(list(self.candidates), target),
                         daemon=True).start()

    def worker(self, files, target):
        max_bytes = int(target * 1024) - 1
        ok = fail = 0
        for i, path in enumerate(files, 1):
            name = os.path.basename(path)
            try:
                before = os.path.getsize(path)
                data, out_ext, scale = compress_image(path, max_bytes)
                folder = os.path.dirname(path)
                stem = os.path.splitext(name)[0]
                out_path = os.path.join(folder, stem + out_ext)
                # 若輸出檔名與「另一個」既有檔案衝突(例如 a.bmp → a.jpg 但已有 a.jpg)
                if os.path.normcase(out_path) != os.path.normcase(path) and os.path.exists(out_path):
                    out_path = os.path.join(folder, stem + "_compressed" + out_ext)

                # 1) 原始檔移到備份資料夾
                bak_dir = os.path.join(folder, BACKUP_NAME)
                os.makedirs(bak_dir, exist_ok=True)
                bak_path = os.path.join(bak_dir, name)
                n = 1
                while os.path.exists(bak_path):
                    bak_path = os.path.join(bak_dir, f"{stem}_{n}{os.path.splitext(name)[1]}")
                    n += 1
                shutil.move(path, bak_path)

                # 2) 寫入壓縮後的檔案;失敗就把原檔移回去
                try:
                    with open(out_path, "wb") as f:
                        f.write(data)
                except Exception:
                    if os.path.exists(out_path):
                        os.remove(out_path)
                    shutil.move(bak_path, path)
                    raise
                note = "" if scale == 1.0 else f"(尺寸縮至 {scale:.0%})"
                line = f"✔ {name}: {self.fmt_size(before)} → {self.fmt_size(len(data))} {note}"
                ok += 1
            except Exception as e:
                line = f"✘ {name}: 失敗 - {e}"
                fail += 1
            self.q.put(("progress", i, line))
        self.q.put(("done", ok, fail))

    def poll(self):
        """在主執行緒定時處理背景執行緒傳來的訊息"""
        try:
            while True:
                msg = self.q.get_nowait()
                if msg[0] == "progress":
                    self.update_progress(msg[1], msg[2])
                else:
                    self.finish(msg[1], msg[2])
                    return
        except queue.Empty:
            pass
        self.root.after(100, self.poll)

    def update_progress(self, i, line):
        self.pb.config(value=i)
        self.write_log(line)
        self.status.config(text=f"處理中 {i}/{len(self.candidates)}")

    def finish(self, ok, fail):
        self.running = False
        self.btn.config(state="normal")
        self.status.config(text=f"完成!成功 {ok} 張,失敗 {fail} 張")
        messagebox.showinfo("完成", f"壓縮完成\n成功:{ok} 張\n失敗:{fail} 張")
        self.scan()


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
