# -*- coding: utf-8 -*-
"""Stash 定制版桌面壳：启动随包后端并以其自己的窗口呈现，不依赖浏览器。

随包布局（安装目录）：
    StashCustom.exe      本壳（PyInstaller onedir）
    server\\stash.exe     Go 后端
    ui\\build\\           随包前端（必须由 STASH_ui 指向，见下方注释）

用户数据固定放在 %LOCALAPPDATA%\\StashCustom\\data，升级/卸载重装都不丢库。
"""

import os
import sys
import time
import socket
import subprocess
import urllib.request
from datetime import datetime

APP_NAME = "StashCustom"
WINDOW_TITLE = "Stash · 极简纯暗黑定制版"
DEFAULT_PORT = 9999
READY_TIMEOUT = 120


# ---------------- 路径 ----------------
def app_dir():
    """随包资源根目录：冻结时为 exe 所在目录，源码运行时为仓库根。"""
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def server_binary():
    base = app_dir()
    if os.path.isdir(os.path.join(base, "server")):
        name = "stash.exe" if sys.platform == "win32" else "stash"
        return os.path.join(base, "server", name)
    # 源码运行时的开发用二进制
    return os.path.join(base, "bin", "stash-win.exe" if sys.platform == "win32" else "stash")


def ui_build_dir():
    base = app_dir()
    packaged = os.path.join(base, "ui", "build")
    if os.path.isdir(packaged):
        return packaged
    return os.path.join(base, "ui", "v2.5", "build")


def data_dir():
    """用户数据根：%LOCALAPPDATA%\\StashCustom\\data（升级/重装不丢库）"""
    if sys.platform == "win32":
        base = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), APP_NAME)
    else:
        base = os.path.join(os.path.expanduser("~"), ".local", "share", APP_NAME)
    path = os.path.join(base, "data")
    os.makedirs(path, exist_ok=True)
    return path


def icon_path():
    """窗口/任务栏图标：冻结时取 PyInstaller 打包进去的 .ico，源码运行时取仓库里的 PNG"""
    if getattr(sys, "frozen", False):
        base = getattr(sys, "_MEIPASS", app_dir())
        names = (f"{APP_NAME}.ico", "StashCustom.ico", "stash.ico")
    else:
        base = os.path.join(app_dir(), "ui", "v2.5", "public")
        names = ("apple-touch-icon.png", "favicon.png")
    for name in names:
        p = os.path.join(base, name)
        if os.path.exists(p):
            return p
    return None


# ---------------- 日志 ----------------
def log_path():
    return os.path.join(os.path.dirname(data_dir()), "desktop.log")


def log(msg):
    try:
        with open(log_path(), "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}\n")
    except Exception:
        pass


def alert(title, text):
    log(f"ALERT {title}: {text}")
    if sys.platform == "win32":
        try:
            import ctypes

            ctypes.windll.user32.MessageBoxW(None, text, title, 0x10 | 0x40000)
            return
        except Exception:
            pass
    print(f"{title}\n{text}")


# ---------------- 服务管理 ----------------
def port_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) != 0


def stash_running(url):
    """已有 Stash 在跑？用它，不再重复启动"""
    try:
        with urllib.request.urlopen(url + "/", timeout=2) as r:
            return b"Stash" in r.read(4096) or r.status == 200
    except Exception:
        return False


def pick_port():
    if port_free(DEFAULT_PORT):
        return DEFAULT_PORT, False
    if stash_running(f"http://127.0.0.1:{DEFAULT_PORT}"):
        return DEFAULT_PORT, True
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1], False


def start_server(port):
    exe = server_binary()
    if not os.path.exists(exe):
        alert(WINDOW_TITLE, f"缺少后端程序：\n{exe}")
        return None

    cfg = os.path.join(data_dir(), "config.yml")
    env = os.environ.copy()
    # 关键：Go 侧把 flag 名 "ui-location" 写进 overrides，读取用的却是配置键
    # "ui_location"，所以 -u/--ui-location 不生效、exe 会退回编译期内嵌的旧前端。
    # 环境变量 STASH_ui 经 envBinds 映射到 ui_location，这条路径是通的。
    env["STASH_ui"] = ui_build_dir()
    env["STASH_HOST"] = "127.0.0.1"
    env["STASH_PORT"] = str(port)
    env["STASH_NOBROWSER"] = "true"

    stdout = open(os.path.join(data_dir(), "server.log"), "ab")
    flags = 0x08000000 if sys.platform == "win32" else 0  # CREATE_NO_WINDOW
    try:
        proc = subprocess.Popen(
            [exe, "-c", cfg, "-u", ui_build_dir()],
            cwd=os.path.dirname(exe),
            env=env,
            stdout=stdout,
            stderr=subprocess.STDOUT,
            creationflags=flags,
        )
    except Exception as e:
        alert(WINDOW_TITLE, f"后端启动失败：\n{e}")
        return None
    log(f"server pid={proc.pid} port={port} ui={ui_build_dir()} config={cfg}")
    return proc


def wait_ready(port, proc):
    url = f"http://127.0.0.1:{port}"
    deadline = time.time() + READY_TIMEOUT
    while time.time() < deadline:
        if proc is not None and proc.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(url + "/", timeout=3) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def stop_server(proc):
    if proc is None or proc.poll() is not None:
        return
    log(f"stopping server pid={proc.pid}")
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        proc.terminate()


# ---------------- 入口 ----------------
def main():
    log("=" * 50)
    log(f"launch frozen={getattr(sys, 'frozen', False)} app_dir={app_dir()}")

    for path, label in ((server_binary(), "后端程序"), (os.path.join(ui_build_dir(), "index.html"), "前端资源")):
        if not os.path.exists(path):
            alert(WINDOW_TITLE, f"安装包不完整，缺少{label}：\n{path}")
            return 1

    port, attached = pick_port()
    proc = None
    if not attached:
        proc = start_server(port)
        if proc is None:
            return 1
    url = f"http://127.0.0.1:{port}"
    log(f"attached={attached} url={url}")

    if not wait_ready(port, proc):
        stop_server(proc)
        alert(WINDOW_TITLE, "后端 120 秒内未就绪。\n详见 " + log_path())
        return 1

    try:
        import webview
    except Exception as e:
        stop_server(proc)
        alert(WINDOW_TITLE, f"桌面窗口组件不可用：\n{e}\n\n请确认已安装 Microsoft Edge WebView2 运行时。")
        return 1

    kwargs = dict(
        title=WINDOW_TITLE,
        url=url,
        width=1500,
        height=920,
        min_size=(1024, 640),
        resizable=True,
    )
    icon = icon_path()
    if icon:
        kwargs["icon"] = icon
    window = webview.create_window(**kwargs)

    try:
        webview.start(debug=os.environ.get("STASH_DESKTOP_DEBUG") == "1")
    finally:
        stop_server(proc)
    log("window closed, exit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
