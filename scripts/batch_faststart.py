# -*- coding: utf-8 -*-
"""
FastStart 批量网络流媒体秒开优化引擎
自动扫描目标目录及其子目录，精准筛选出缺少 FastStart (moov 在尾部) 的 MP4/MOV 文件，
调用 ffmpeg 以无损流复制 (-c copy -movflags +faststart) 将 moov 索引前置。
支持断点续跑、并发多线程、安全原子替换与实时进度输出。
"""

import os
import sys
import time
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


def check_box_order(file_path):
    """
    极速检查 MP4/MOV 文件是否已有 FastStart (moov 在 mdat 前)
    """
    try:
        with open(file_path, "rb") as f:
            header = f.read(16)
            if header and len(header) > 0 and header[0] == 0x47:
                return "ts_disguised"
            if header and len(header) >= 3 and header[:3] == b"FLV":
                return "flv_disguised"
            f.seek(0)
            while True:
                box_hdr = f.read(8)
                if len(box_hdr) < 8:
                    break
                box_size = int.from_bytes(box_hdr[:4], "big")
                box_type = box_hdr[4:8]
                if box_type == b"moov":
                    return "has_faststart"
                if box_type == b"mdat":
                    return "missing_faststart"
                if box_size == 1:
                    ext_size = f.read(8)
                    if len(ext_size) < 8:
                        break
                    box_size = int.from_bytes(ext_size, "big")
                    f.seek(box_size - 16, os.SEEK_CUR)
                elif box_size == 0:
                    break
                else:
                    if box_size < 8:
                        break
                    f.seek(box_size - 8, os.SEEK_CUR)
    except Exception as e:
        return f"error_{e}"
    return "unknown"


def optimize_file(item):
    idx, total, file_path, file_size = item
    fn = os.path.basename(file_path)
    sz_mb = file_size / (1024 * 1024)

    # Double check in case it was already optimized
    status = check_box_order(file_path)
    if status == "has_faststart":
        return idx, fn, sz_mb, 0.0, True, "已具备 FastStart，跳过"

    temp_path = file_path + ".tmp_fs.mp4"
    bak_path = file_path + ".bak_fs"

    # Clean any stale temp
    try:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        if os.path.exists(bak_path):
            os.remove(bak_path)
    except Exception:
        pass

    creationflags = 0x08000000 if sys.platform == "win32" else 0  # CREATE_NO_WINDOW
    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-i", file_path,
        "-c", "copy",
        "-movflags", "+faststart",
        temp_path
    ]

    t0 = time.time()
    try:
        res = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=creationflags,
            timeout=7200  # 2 hours max per file
        )
        elapsed = time.time() - t0
        if res.returncode != 0 or not os.path.exists(temp_path) or os.path.getsize(temp_path) == 0:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            err_msg = res.stderr.decode("utf-8", errors="ignore").strip()
            return idx, fn, sz_mb, elapsed, False, f"ffmpeg 失败: {err_msg}"

        # Atomic replacement
        os.rename(file_path, bak_path)
        try:
            os.rename(temp_path, file_path)
            if os.path.exists(bak_path):
                os.remove(bak_path)
            return idx, fn, sz_mb, elapsed, True, "成功"
        except Exception as e:
            if os.path.exists(bak_path):
                os.rename(bak_path, file_path)
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return idx, fn, sz_mb, elapsed, False, f"替换文件失败: {e}"
    except Exception as e:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        return idx, fn, sz_mb, time.time() - t0, False, f"执行异常: {e}"


def main():
    target_dir = sys.argv[1] if len(sys.argv) > 1 else r"\\sa6400\文档\资源\other\1"
    max_workers = int(sys.argv[2]) if len(sys.argv) > 2 else 2

    print("=" * 65)
    print(f"正在扫描目标目录: {target_dir}")
    print(f"并发工作线程: {max_workers}")
    print("=" * 65)

    candidates = []
    video_exts = {".mp4", ".m4v", ".mov"}

    scan_t0 = time.time()
    for dirpath, dirnames, filenames in os.walk(target_dir):
        for fn in filenames:
            ext = os.path.splitext(fn)[1].lower()
            if ext in video_exts:
                full_path = os.path.join(dirpath, fn)
                st = check_box_order(full_path)
                if st in ["missing_faststart", "ts_disguised"]:
                    sz = os.path.getsize(full_path)
                    candidates.append((full_path, sz))

    # Sort by size ascending (small files first for instant quick wins)
    candidates.sort(key=lambda x: x[1])
    total_files = len(candidates)
    total_bytes = sum(x[1] for x in candidates)
    total_gb = total_bytes / (1024 ** 3)

    print(f"扫描完毕（耗时 {time.time()-scan_t0:.1f}s）。")
    print(f"共发现 {total_files} 个文件需要 FastStart 优化，总容量: {total_gb:.2f} GB\n")

    if total_files == 0:
        print("所有文件均已具备 FastStart 优化，无需处理！")
        return

    items = [(i + 1, total_files, path, sz) for i, (path, sz) in enumerate(candidates)]

    processed_count = 0
    success_count = 0
    fail_count = 0
    processed_bytes = 0
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_item = {executor.submit(optimize_file, item): item for item in items}
        for future in as_completed(future_to_item):
            idx, fn, sz_mb, elapsed, success, msg = future.result()
            processed_count += 1
            cur_bytes = future_to_item[future][3]
            processed_bytes += cur_bytes
            pct = (processed_bytes / total_bytes) * 100

            if success:
                success_count += 1
                speed_str = f"{(sz_mb/elapsed):.1f} MB/s" if elapsed > 0 else "N/A"
                print(f"[{processed_count}/{total_files}] ({pct:5.1f}%) 成功 ({elapsed:.1f}s, {speed_str}): {fn} ({sz_mb:.1f}MB)")
            else:
                fail_count += 1
                print(f"[{processed_count}/{total_files}] ({pct:5.1f}%) 失败: {fn} ({msg})")

            # Flush output so background tasks can read progress in real time
            sys.stdout.flush()

    total_time = time.time() - start_time
    print("\n" + "=" * 65)
    print(f"FastStart 批量优化任务完成！")
    print(f"总耗时: {total_time/60:.1f} 分钟")
    print(f"成功: {success_count} 个，失败: {fail_count} 个，总处理数据: {total_gb:.2f} GB")
    print("=" * 65)


if __name__ == "__main__":
    main()
