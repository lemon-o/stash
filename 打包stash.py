# -*- coding: utf-8 -*-
"""
Stash 定制版（fork: lemon-o/stash，分支 custom-ui）一键打包与发布脚本

本项目引擎是 Go 写的自托管 Web 服务，本脚本负责把它装进一个"看起来像独立软件"的
Windows 桌面应用里：pywebview(Edge WebView2) 壳 + 随包前端 + Inno Setup 安装包。
用户不需要浏览器、不需要命令行，装完双击图标即用。

流程（弹窗可勾选产物，命令行也能指定）：
1. 版本号与产物目标确认：以 git tag 为唯一真源，置顶弹窗或命令行指定
2. 环境检查：git / pnpm(corepack) / Inno Setup ISCC / WebView2 运行时 / bin\\stash-win.exe
3. Python 虚拟环境与依赖自愈：.venv + pywebview / pythonnet / pillow / pyinstaller（清华源优先）
4. 前端构建：ui/v2.5 → pnpm install（按需）+ pnpm run build
5. 图标生成：apple-touch-icon.png → 多尺寸 .ico（供壳 exe 与安装包共用）
6. 桌面壳构建：PyInstaller onedir → dist/StashCustom/StashCustom.exe
7. 安装暂存组装：StashCustom.exe + _internal + server\\stash.exe + ui\\build
8. 安装包编译：回填版本号到 desktop/StashCustom.iss → ISCC → 桌面 Setup exe
9. 源码归档至 NAS，以及（可选）推送分支+标签触发 docker-image.yml 出 GHCR 镜像

用法：
    python 打包stash.py                          # 交互模式
    python 打包stash.py 1.1.5 --installer --backup
    python 打包stash.py 1.1.5 --publish           # 另外推送标签触发 CI 镜像
    python 打包stash.py --skip-ui                 # 复用现有 ui/v2.5/build

    -y 跳过所有提问；若同时给了 --publish，将直接 git push（分支与标签）。
    工作区有未提交改动时发布步骤会拒绝执行，不会代为 commit。
"""

import os
import re
import sys
import stat
import json
import shutil
import zipfile
import subprocess
from datetime import datetime

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ---------------- 路径与基本常量 ----------------
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(CURRENT_DIR)

PROJECT_NAME = os.path.basename(CURRENT_DIR)
APP_NAME = "StashCustom"

UI_DIR = os.path.join(CURRENT_DIR, "ui", "v2.5")
UI_BUILD_DIR = os.path.join(UI_DIR, "build")
PACKAGE_JSON = os.path.join(UI_DIR, "package.json")
ICON_SOURCE_PNG = os.path.join(UI_DIR, "public", "apple-touch-icon.png")
DESKTOP_SCRIPT = os.path.join(CURRENT_DIR, "desktop", "stash_desktop.py")
ISS_FILE = os.path.join(CURRENT_DIR, "desktop", f"{APP_NAME}.iss")
EXE_SOURCE = os.path.join(CURRENT_DIR, "bin", "stash-win.exe")

VENV_DIR = os.path.join(CURRENT_DIR, ".venv")
VENV_SCRIPTS = os.path.join(VENV_DIR, "Scripts")
VENV_PYTHON = os.path.join(VENV_SCRIPTS, "python.exe")

DIST_DIR = os.path.join(CURRENT_DIR, "dist")
STAGE_DIR = os.path.join(DIST_DIR, "package")
PYI_OUT_DIR = os.path.join(DIST_DIR, APP_NAME)
ICO_PATH = os.path.join(DIST_DIR, f"{APP_NAME}.ico")

DESKTOP_DIR = os.path.join(os.path.expanduser("~"), "Desktop")
NETWORK_BACKUP_DIR = r"\\sa6400\文档\programming"

BRANCH = "custom-ui"
WORKFLOW_FILE = "docker-image.yml"
IMAGE_REPO = "ghcr.io/lemon-o/stash"
PIP_MIRRORS = ["https://pypi.tuna.tsinghua.edu.cn/simple", "https://pypi.org/simple"]
# 桌面壳运行时依赖：pywebview 需要 pythonnet(clr) 才能驱动 WebView2
PY_DEPS = ["pywebview", "pythonnet", "pillow", "pyinstaller"]


# ---------------- 通用子进程工具 ----------------
def run(cmd, cwd=None, capture=False, env=None):
    """执行命令；Windows 上 npm/pnpm/corepack 是 .cmd 垫片，CreateProcess 只找 .exe，
    所以统一用 shutil.which 把裸命令名补成完整路径。"""
    cmd = list(cmd)
    prog = str(cmd[0])
    if not os.path.isabs(prog) and not os.path.exists(prog):
        resolved = shutil.which(prog)
        if resolved:
            cmd[0] = resolved
    return subprocess.run(cmd, cwd=cwd, env=env, capture_output=capture,
                          text=True, encoding="utf-8", errors="replace")


def git(*args):
    """在仓库根执行 git 命令；失败返回 None"""
    try:
        res = run(["git", *args], cwd=CURRENT_DIR, capture=True)
    except FileNotFoundError:
        return None
    if res.returncode != 0:
        return None
    return res.stdout.strip()


def has_cli(name):
    return bool(shutil.which(name))


def fmt_size(n):
    return f"{n / 1024 / 1024:.1f} MB"


def dir_stats(root):
    count = size = 0
    for base, _dirs, files in os.walk(root):
        for name in files:
            count += 1
            try:
                size += os.path.getsize(os.path.join(base, name))
            except OSError:
                pass
    return count, size


# ---------------- 1. 环境检查 ----------------
def check_environment(need_ui, need_installer):
    print("[2/9] 正在检查构建环境...")
    problems = []
    info = {}

    print(f"  git      : {shutil.which('git') or '未找到（必需）'}")
    if not shutil.which("git"):
        problems.append("未找到 git，无法读取版本号与推送标签。")
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    head = git("rev-parse", "--short", "HEAD")
    print(f"  仓库状态 : 分支 {branch or '未知'} @ {head or '未知'}")

    pnpm_cmd = None
    if has_cli("corepack"):
        pnpm_cmd = ["corepack", "pnpm"]
    elif has_cli("pnpm"):
        pnpm_cmd = ["pnpm"]
    elif has_cli("npx"):
        pnpm_cmd = ["npx", "pnpm"]
    info["pnpm_cmd"] = pnpm_cmd
    if need_ui:
        print(f"  pnpm     : {' '.join(pnpm_cmd) if pnpm_cmd else '未找到（必需）'}")
        if not pnpm_cmd:
            problems.append("未找到 node/pnpm/corepack，无法构建前端 ui/v2.5/build。")

    exe = info["exe"] = resolve_exe_source()
    if os.path.exists(exe):
        print(f"  后端二进制: {os.path.relpath(exe, CURRENT_DIR)}（{fmt_size(os.path.getsize(exe))}）")
    elif need_installer:
        problems.append(
            "未找到 bin\\stash-win.exe（安装包要内置它）。本分支不在本地编译 Go，"
            "请先从 GitHub Actions 产物或上游 Releases 取一个放进 bin\\，或用 --exe 指定。"
        )

    iscc = info["iscc"] = find_iscc_exe() if need_installer else ""
    if need_installer:
        print(f"  Inno Setup: {iscc or '未找到 ISCC.exe（必需）'}")
        if not iscc:
            problems.append("未找到 Inno Setup 6 的 ISCC.exe，无法生成安装包。")
        if not os.path.exists(ISS_FILE):
            problems.append(f"缺少安装脚本 {os.path.relpath(ISS_FILE, CURRENT_DIR)}")
        if not os.path.exists(DESKTOP_SCRIPT):
            problems.append(f"缺少桌面壳源码 {os.path.relpath(DESKTOP_SCRIPT, CURRENT_DIR)}")

    wv2 = find_webview2_runtime()
    print(f"  WebView2 : {wv2 or '未检测到运行时（装机目标机需要它）'}")

    print(f"  go/docker: {'本机可用' if has_cli('go') else '本机未装'} / "
          f"{'本机可用' if has_cli('docker') else '本机未装（镜像由 CI 产出）'}")
    info["nas_ok"] = os.path.exists(NETWORK_BACKUP_DIR)
    print(f"  NAS      : {NETWORK_BACKUP_DIR} " + ("可访问" if info["nas_ok"] else "当前不可访问（归档留在桌面）"))

    if problems:
        print("环境检查未通过：")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)
    return info


def resolve_exe_source():
    for i, arg in enumerate(sys.argv):
        if arg == "--exe" and i + 1 < len(sys.argv):
            return os.path.abspath(sys.argv[i + 1])
    return EXE_SOURCE


def find_iscc_exe():
    """定位 Inno Setup 命令行编译器 ISCC.exe"""
    candidates = []
    for env_key in ("ProgramFiles", "ProgramFiles(x86)"):
        base = os.environ.get(env_key)
        if base:
            for ver in ("Inno Setup 6", "Inno Setup 5"):
                candidates.append(os.path.join(base, ver, "ISCC.exe"))
    local = os.environ.get("LOCALAPPDATA")
    if local:
        for ver in ("Inno Setup 6", "Inno Setup 5"):
            candidates.append(os.path.join(local, "Programs", ver, "ISCC.exe"))
    if os.name == "nt":
        try:
            import winreg

            for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
                try:
                    with winreg.OpenKey(hive, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\ISCC.exe") as k:
                        val = winreg.QueryValue(k, None)
                        if val:
                            candidates.append(os.path.expandvars(val))
                except OSError:
                    pass
        except ImportError:
            pass
    candidates += [os.path.join(d, "ISCC.exe") for d in os.environ.get("PATH", "").split(os.pathsep) if d]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return ""


def find_webview2_runtime():
    """返回已安装的 Edge WebView2 运行时版本目录，找不到返回 ''"""
    for root in (os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\EdgeWebView\Application"),
                 os.path.expandvars(r"%ProgramFiles%\Microsoft\EdgeWebView\Application")):
        if not os.path.isdir(root):
            continue
        for ver in sorted(os.listdir(root), reverse=True):
            if os.path.exists(os.path.join(root, ver, "msedgewebview2.exe")):
                return os.path.join(root, ver)
    return ""


# ---------------- 2. 版本号与目标 ----------------
def read_git_version():
    """返回 (当前描述, 纯 semver, 推荐递增值)"""
    described = git("describe", "--tags", "--exclude", "latest_develop") or ""
    base = git("describe", "--tags", "--abbrev=0", "--exclude", "latest_develop") or ""
    m = re.search(r"v?(\d+)\.(\d+)\.(\d+)", base or described)
    if not m:
        tags = (git("tag", "--list", "v*", "--sort=-v:refname") or "").splitlines()
        base = tags[0] if tags else ""
        m = re.search(r"v?(\d+)\.(\d+)\.(\d+)", base)
    if not m:
        return described or "0.0.0", "0.0.0", "0.1.0"

    current = ".".join(m.groups())
    major, minor, patch = map(int, m.groups())
    patch += 1
    if patch > 9:
        patch, minor = 0, minor + 1
    if minor > 9:
        minor, major = 0, major + 1
    return described or f"v{current}", current, f"{major}.{minor}.{patch}"


def normalize_version(text):
    text = (text or "").strip().lstrip("vV")
    return text if re.match(r"^\d+\.\d+\.\d+$", text) else ""


def ask_cli_flags():
    """解析命令行：显式产物目标、版本号、-y/--skip-ui/--exe"""
    flags = {"installer": False, "backup": False, "publish": False, "yes": False,
             "skip_ui": False, "explicit_any": False, "version": ""}
    for arg in sys.argv[1:]:
        low = arg.lower().strip()
        if low in ("--installer", "--win", "--windows", "--setup"):
            flags["installer"] = flags["explicit_any"] = True
        elif low in ("--backup", "--nas"):
            flags["backup"] = flags["explicit_any"] = True
        elif low in ("--publish", "--image", "--ci"):
            flags["publish"] = flags["explicit_any"] = True
        elif low == "--all":
            flags.update(installer=True, backup=True, publish=True, explicit_any=True)
        elif low in ("-y", "--yes", "--default"):
            flags["yes"] = True
        elif low == "--skip-ui":
            flags["skip_ui"] = True
        elif normalize_version(arg):
            flags["version"] = normalize_version(arg)
    return flags


TARGET_LABELS = {
    "installer": "Windows 安装包",
    "backup": "NAS 源码归档",
    "publish": "CI Docker 镜像",
}


def target_names(selected):
    picked = [TARGET_LABELS[k] for k in ("installer", "backup", "publish") if selected.get(k)]
    return "、".join(picked) or "无"


def confirm_targets(described, default_ver, flags):
    print("[1/9] 确认发布版本与产物目标")
    cli_version = flags.get("version")
    if flags.get("yes"):
        if flags["explicit_any"]:
            selected = {k: flags.get(k, False) for k in TARGET_LABELS}
        else:
            selected = {"installer": True, "backup": True, "publish": False}
        ver = cli_version or default_ver
        print(f"      >> [-y] 自动模式：版本 {ver}，产物 {target_names(selected)}")
        return ver, selected

    print(f"      git 当前版本: {described}，推荐发布版本: {default_ver}")
    print("      >> 正在弹出发布确认窗口（已置顶） <<")
    ver, selected = _tk_dialog(described, default_ver, cli_version, flags)
    if not ver:
        print("      已取消，流程终止。")
        sys.exit(0)
    return ver, selected


def _tk_dialog(described, default_ver, cli_version, flags):
    try:
        import tkinter as tk
        from tkinter import messagebox
    except Exception:
        return _console_prompt(described, default_ver, cli_version, flags)

    result = {}
    try:
        root = tk.Tk()
        root.title("Stash 定制版 · 发布确认")
        root.attributes("-topmost", True)
        root.geometry("480x270")
        root.resizable(False, False)

        tk.Label(root, text=f"git 当前版本: {described}").pack(anchor="w", padx=20, pady=(18, 2))
        tk.Label(root, text="请输入本次发布版本号:").pack(anchor="w", padx=20)
        ver_var = tk.StringVar(value=cli_version or default_ver)
        tk.Entry(root, textvariable=ver_var, font=("Segoe UI", 12)).pack(fill="x", padx=20, pady=4)

        vars_ = {}
        for key in TARGET_LABELS:
            default = flags[key] if (flags["explicit_any"] or key == "publish") else True
            if not flags["explicit_any"] and key != "publish":
                default = True
            v = tk.BooleanVar(value=bool(default))
            vars_[key] = v
            # 推送标签会改动 GitHub 远端，默认不勾选，必须显式选择
            tk.Checkbutton(root, text=TARGET_LABELS[key] + ("  (git push)" if key == "publish" else ""),
                           variable=v).pack(anchor="w", padx=20)

        def on_ok():
            v = normalize_version(ver_var.get())
            if not v:
                messagebox.showwarning("提示", "版本号需形如 1.2.3")
                return
            if not any(x.get() for x in vars_.values()):
                messagebox.showwarning("提示", "请至少勾选一个产物目标")
                return
            result["version"] = v
            result["targets"] = {k: x.get() for k, x in vars_.items()}
            root.destroy()

        def on_cancel():
            result.clear()
            root.destroy()

        btns = tk.Frame(root)
        btns.pack(pady=14)
        tk.Button(btns, text="确定", width=10, command=on_ok).pack(side="left", padx=8)
        tk.Button(btns, text="取消", width=10, command=on_cancel).pack(side="left")
        root.protocol("WM_DELETE_WINDOW", on_cancel)
        root.mainloop()
    except Exception as e:
        print(f"      提示：弹窗不可用 ({e})，切换为控制台交互。")
        return _console_prompt(described, default_ver, cli_version, flags)

    return result.get("version"), result.get("targets")


def _console_prompt(described, default_ver, cli_version, flags):
    try:
        prompt_default = cli_version or default_ver
        print(f"      git 当前版本: {described}")
        inp = input(f"请输入发布版本号 [直接回车使用 {prompt_default}]: ").strip()
        ver = normalize_version(inp) or prompt_default
        if flags["explicit_any"]:
            selected = {k: flags.get(k, False) for k in TARGET_LABELS}
        else:
            selected = {
                "installer": input("构建 Windows 安装包? [Y/n]: ").strip().lower() != "n",
                "backup": input("源码归档至 NAS? [Y/n]: ").strip().lower() != "n",
                "publish": input("推送分支与标签触发 CI 镜像? [y/N]: ").strip().lower() == "y",
            }
        if not any(selected.values()):
            print("至少需要一个目标，默认构建安装包。")
            selected["installer"] = True
        return ver, selected
    except Exception:
        return (cli_version or default_ver), {
            "installer": True, "backup": True, "publish": flags.get("publish", False)
        }


# ---------------- 3. 虚拟环境与 Python 依赖 ----------------
def ensure_python_environment():
    print("\n[3/9] 正在准备桌面壳的 Python 虚拟环境...")

    if sys.prefix != sys.base_prefix:
        venv_py = sys.executable
        print(f"  当前已运行在虚拟环境中: {os.path.dirname(venv_py)}")
    elif os.path.exists(VENV_PYTHON):
        venv_py = VENV_PYTHON
        print(f"  复用已有虚拟环境: {VENV_DIR}")
    else:
        print(f"  正在创建虚拟环境: {VENV_DIR} ...")
        if run([sys.executable, "-m", "venv", VENV_DIR]).returncode != 0:
            print("错误：虚拟环境创建失败，请检查 Python 安装。")
            return ""
        venv_py = VENV_PYTHON

    if run([venv_py, "-m", "pip", "--version"], capture=True).returncode != 0:
        print("  虚拟环境缺少 pip，正在修复 (ensurepip)...")
        run([venv_py, "-m", "ensurepip", "--upgrade"])

    installed = set()
    res = run([venv_py, "-m", "pip", "list", "--format=json"], capture=True)
    if res.returncode == 0:
        try:
            installed = {p["name"].lower().replace("_", "-") for p in json.loads(res.stdout)}
        except Exception:
            installed = set()

    missing = [p for p in PY_DEPS if p.lower().replace("_", "-") not in installed]
    if missing:
        print(f"  缺失依赖: {', '.join(missing)}（优先清华镜像源）")
        ok = False
        for index in PIP_MIRRORS:
            args = [venv_py, "-m", "pip", "install", "-i", index] + missing if index != PIP_MIRRORS[-1] \
                else [venv_py, "-m", "pip", "install"] + missing
            if run(args).returncode == 0:
                ok = True
                break
            print(f"  源 {index} 安装失败，尝试下一个...")
        if not ok:
            print("错误：桌面壳依赖安装失败，请检查网络后重试。")
            return ""
    else:
        print("  pywebview / pyinstaller / pillow 均已安装。")
    return venv_py


# ---------------- 4. 前端构建 ----------------
def build_ui(env_info):
    print("\n[4/9] 正在构建前端 (ui/v2.5 → build)...")
    pnpm = env_info.get("pnpm_cmd") or ["pnpm"]

    try:
        with open(PACKAGE_JSON, "r", encoding="utf-8") as f:
            pm = json.load(f).get("packageManager", "未声明")
        print(f"  packageManager: {pm}")
    except Exception:
        pass

    if not os.path.isdir(os.path.join(UI_DIR, "node_modules")):
        print("  正在安装前端依赖 (pnpm install --frozen-lockfile)...")
        if run([*pnpm, "install", "--frozen-lockfile"], cwd=UI_DIR).returncode != 0:
            print("错误：pnpm install 失败。")
            return False
    else:
        print("  已存在 node_modules，跳过依赖安装。")

    build_env = os.environ.copy()
    build_env.setdefault("NODE_OPTIONS", "--max-old-space-size=4096")
    described = git("describe", "--tags", "--exclude", "latest_develop") or ""
    m = re.search(r"v?(\d+\.\d+\.\d+)", described)
    build_env["VITE_APP_STASH_VERSION"] = m.group(1) if m else "dev"
    build_env["VITE_APP_GITHASH"] = git("rev-parse", "--short", "HEAD") or ""

    print("  正在执行 pnpm run build (vite build)...")
    if run([*pnpm, "run", "build"], cwd=UI_DIR, env=build_env).returncode != 0:
        print("错误：前端构建失败。")
        return False
    if not os.path.exists(os.path.join(UI_BUILD_DIR, "index.html")):
        print("错误：构建结束但未生成 ui/v2.5/build/index.html")
        return False

    count, size = dir_stats(UI_BUILD_DIR)
    print(f"  前端构建完成：ui/v2.5/build（{count} 个文件，{fmt_size(size)}）")
    return True


# ---------------- 5. 图标 ----------------
def build_icon(venv_py):
    print("\n[5/9] 正在生成应用图标 (.ico)...")
    if not os.path.exists(ICON_SOURCE_PNG):
        print(f"  未找到源图标 {os.path.relpath(ICON_SOURCE_PNG, CURRENT_DIR)}，改用系统默认图标。")
        return ""
    os.makedirs(DIST_DIR, exist_ok=True)
    code = (
        "from PIL import Image, features\n"
        f"import sys\n"
        f"src, dst = sys.argv[1], sys.argv[2]\n"
        "ok = features.check('ico')\n"
        f"im = Image.open(src).convert('RGBA')\n"
        "im.save(dst, format='ICO', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])\n"
        "print('ico sizes ok:', ok)\n"
    )
    res = run([venv_py, "-c", code, ICON_SOURCE_PNG, ICO_PATH], capture=True)
    if res.returncode != 0 or not os.path.exists(ICO_PATH):
        print(f"  图标生成失败（安装包仍可用默认图标）: {(res.stderr or '').strip()[:200]}")
        return ""
    print(f"  {os.path.relpath(ICO_PATH, CURRENT_DIR)}（{fmt_size(os.path.getsize(ICO_PATH))}）")
    return ICO_PATH


# ---------------- 6. 桌面壳（PyInstaller） ----------------
def build_desktop_shell(venv_py, ico):
    print("\n[6/9] 正在构建桌面壳 (PyInstaller onedir)...")
    shutil.rmtree(PYI_OUT_DIR, ignore_errors=True)

    cmd = [
        venv_py, "-m", "PyInstaller",
        "--noconfirm", "--clean",
        "--onedir", "--windowed",
        "--name", APP_NAME,
        "--distpath", DIST_DIR,
        "--workpath", os.path.join(DIST_DIR, "pyi-work"),
        "--specpath", os.path.join(DIST_DIR, "pyi-work"),
        DESKTOP_SCRIPT,
    ]
    if ico:
        # --add-data "源;目标目录"，运行时从 _MEIPASS 里按同名取用
        cmd += ["--icon", ico, "--add-data", f"{ico}{os.pathsep}."]
    res = run(cmd, cwd=CURRENT_DIR)
    exe = os.path.join(PYI_OUT_DIR, f"{APP_NAME}.exe")
    if res.returncode != 0 or not os.path.exists(exe):
        print(f"错误：桌面壳构建失败 (返回码 {res.returncode})")
        return ""
    count, size = dir_stats(PYI_OUT_DIR)
    print(f"  {os.path.relpath(exe, CURRENT_DIR)} + _internal（{count} 个文件，{fmt_size(size)}）")
    return exe


# ---------------- 7. 安装暂存组装 ----------------
def assemble_stage(shell_exe, exe_source):
    print("\n[7/9] 正在组装安装包内容...")
    shutil.rmtree(STAGE_DIR, ignore_errors=True)
    shell_dir = os.path.dirname(shell_exe)

    for name in (os.path.basename(shell_exe), "_internal"):
        src = os.path.join(shell_dir, name)
        dst = os.path.join(STAGE_DIR, name)
        (shutil.copytree if os.path.isdir(src) else shutil.copy2)(src, dst)

    os.makedirs(os.path.join(STAGE_DIR, "server"), exist_ok=True)
    shutil.copy2(exe_source, os.path.join(STAGE_DIR, "server", "stash.exe"))

    shutil.copytree(UI_BUILD_DIR, os.path.join(STAGE_DIR, "ui", "build"))

    count, size = dir_stats(STAGE_DIR)
    print(f"  暂存目录 dist/package：{count} 个文件，{fmt_size(size)}")
    print("    StashCustom.exe + _internal\\  桌面壳（WebView2 窗口）")
    print("    server\\stash.exe              Go 后端（复用 bin 下已构建产物）")
    print("    ui\\build\\                    本次构建的定制前端")
    return True


# ---------------- 8. Inno Setup 编译 ----------------
def update_iss_version(ver):
    """回填 desktop/StashCustom.iss 的 MyAppVersion（保持 UTF-8 BOM）"""
    with open(ISS_FILE, "r", encoding="utf-8-sig") as f:
        content = f.read()
    if not re.search(r'#define\s+MyAppVersion\s+"[^"]+"', content):
        print(f"警告：{os.path.basename(ISS_FILE)} 里找不到 MyAppVersion 定义，跳过回填。")
        return False
    content = re.sub(r'#define\s+MyAppVersion\s+"[^"]+"', f'#define MyAppVersion "{ver}"', content)
    with open(ISS_FILE, "w", encoding="utf-8-sig", newline="\r\n") as f:
        f.write(content)
    print(f"  安装脚本 MyAppVersion 已更新为: {ver}")
    return True


def compile_installer(iscc, ver):
    print("\n[8/9] 正在编译 Windows 安装包 (Inno Setup)...")
    update_iss_version(ver)
    res = run([iscc, f"/O{DIST_DIR}", ISS_FILE], cwd=CURRENT_DIR, capture=True)
    built = os.path.join(DIST_DIR, f"{APP_NAME}-Setup-{ver}.exe")
    if res.returncode != 0 or not os.path.exists(built):
        print(f"错误：安装包编译失败 (返回码 {res.returncode})")
        for line in (res.stdout or "").splitlines()[-15:]:
            print(f"    {line}")
        return ""

    final = os.path.join(DESKTOP_DIR, f"{APP_NAME}-Setup-{ver}.exe")
    if os.path.exists(final):
        os.remove(final)
    shutil.move(built, final)
    print(f"  [√] 安装包: {final}（{fmt_size(os.path.getsize(final))}）")
    return final


# ---------------- 9a. 源码归档 ----------------
ARCHIVE_IGNORE_DIRS = {
    ".git", ".venv", "venv", "node_modules", "build", "dist", "__pycache__",
    ".idea", ".vscode", ".gradle", ".local", ".go-cache", "bin",
}
# data/ 下只排除运行期生成物，保留数据库、配置、插件与自定义 CSS
DATA_RUNTIME_DIRS = {"generated", "cache", "blobs", "scraper", "backups", "tmp"}


def backup_source_zip(ver):
    print("\n[9/9-a] 正在归档项目源码至 NAS...")
    zip_name = f"{PROJECT_NAME}.zip"
    temp_zip = os.path.join(DESKTOP_DIR, zip_name)
    if os.path.exists(temp_zip):
        os.remove(temp_zip)

    count = 0
    with zipfile.ZipFile(temp_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, dirs, files in os.walk(CURRENT_DIR):
            dirs[:] = sorted(d for d in dirs if not _archive_skip(root, d))
            for name in sorted(files):
                if name.endswith((".pyc", ".pyo", ".tmp", ".log")) or name == ".DS_Store":
                    continue
                abs_path = os.path.join(root, name)
                rel_path = os.path.relpath(abs_path, CURRENT_DIR).replace(os.sep, "/")
                zf.write(abs_path, f"{PROJECT_NAME}/{rel_path}")
                count += 1

    size = os.path.getsize(temp_zip)
    print(f"  源码归档: {count} 个文件，{fmt_size(size)}")

    if not os.path.exists(NETWORK_BACKUP_DIR):
        print(f"  NAS 不可达，归档保留在桌面: {temp_zip}")
        return ""

    target = os.path.join(NETWORK_BACKUP_DIR, f"{PROJECT_NAME}-v{ver}.zip")
    try:
        if os.path.exists(target):
            os.remove(target)
        shutil.move(temp_zip, target)
        print(f"  [√] 已移至 NAS: {target}")
        return target
    except Exception as e:
        print(f"  移至 NAS 失败: {e}；归档保留在桌面: {temp_zip}")
        return temp_zip


def _archive_skip(root, name):
    if name in ARCHIVE_IGNORE_DIRS or name.startswith(".git") or name.endswith(".tmp"):
        return True
    rel = os.path.relpath(os.path.join(root, name), CURRENT_DIR).replace(os.sep, "/")
    # 只排除 data 顶层的运行期生成物（thumbnails/sprites 之类可随时重生成）
    if os.path.dirname(rel) == "data" and name in DATA_RUNTIME_DIRS:
        return True
    return False


# ---------------- 9b. 触发 CI 镜像 ----------------
def publish_image(ver, auto_yes):
    print("\n[9/9-b] 发布镜像（GitHub Actions docker-image.yml）")

    if git("status", "--porcelain"):
        print("错误：工作区有未提交改动，本脚本不会代为提交。")
        print("请先自行 commit（例如 git add -A && git commit），再重新运行 --publish。")
        return False

    ahead_raw = git("rev-list", "--count", "@{u}..HEAD")
    ahead = int(ahead_raw) if ahead_raw and ahead_raw.isdigit() else 0
    tag_name = f"v{ver}"
    tag_exists = bool(git("tag", "--list", tag_name))

    print(f"  待推送: {BRANCH} 领先远端 {ahead} 个提交；标签 {tag_name}"
          + ("（本地已存在）" if tag_exists else "（将新建）"))
    print(f"  产物: {IMAGE_REPO}:{ver} / :{ver.rsplit('.', 1)[0]} / :latest（冷缓存约 12 分钟）")

    if not auto_yes:
        try:
            ans = input("  确认推送到 GitHub 远端? 输入 yes 继续: ").strip().lower()
        except Exception:
            ans = ""
        if ans != "yes":
            print("  已跳过镜像发布。")
            return False

    if ahead > 0 and run(["git", "push", "origin", BRANCH], cwd=CURRENT_DIR).returncode != 0:
        print(f"错误：推送 {BRANCH} 分支失败。")
        return False
    print(f"  [√] 已推送 {BRANCH} 分支")

    if not tag_exists and run(["git", "tag", "-a", tag_name, "-m", f"Stash 定制版 {ver}"],
                              cwd=CURRENT_DIR).returncode != 0:
        print("错误：创建标签失败。")
        return False
    print(f"  [√] 标签 {tag_name}" + ("（已存在）" if tag_exists else " 已创建"))

    if run(["git", "push", "origin", tag_name], cwd=CURRENT_DIR).returncode != 0:
        print(f"错误：推送标签 {tag_name} 失败。")
        return False
    print(f"  [√] 已推送标签 {tag_name}，流水线开始构建")

    if has_cli("gh"):
        res = run(["gh", "run", "list", "--workflow", WORKFLOW_FILE, "--limit", "1"], capture=True)
        if res.returncode == 0 and res.stdout.strip():
            print("  最新运行:")
            for line in res.stdout.strip().splitlines():
                print(f"    {line}")
    print(f"  进度: https://github.com/lemon-o/stash/actions/workflows/{WORKFLOW_FILE}")
    return True


# ---------------- 清理 ----------------
def _rmtree_onerror(func, path, _exc):
    try:
        os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
        func(path)
    except Exception:
        pass


def cleanup_build_dirs():
    """安装包里已带着所有产物，dist/ 与 PyInstaller 中间目录可以丢弃"""
    print("\n正在清理临时构建目录...")
    cleaned = []
    for d in (DIST_DIR, os.path.join(CURRENT_DIR, "build")):
        if os.path.exists(d):
            try:
                shutil.rmtree(d, onerror=_rmtree_onerror)
                cleaned.append(os.path.relpath(d, CURRENT_DIR))
            except Exception as e:
                print(f"  清理 {os.path.relpath(d, CURRENT_DIR)} 提示: {e}")
    if cleaned:
        print(f"  已清理: {', '.join(cleaned)}（桌面安装包与 NAS 归档保留）")


# ---------------- 主入口 ----------------
def main():
    print("=" * 62)
    print("     Stash 定制版 · 桌面应用构建与发布系统")
    print("=" * 62)

    flags = ask_cli_flags()
    skip_ui = flags["skip_ui"]

    print("")
    described, current_ver, default_ver = read_git_version()
    ver, targets = confirm_targets(described or current_ver, default_ver, flags)
    print(f"  发布版本: {ver}，产物: {target_names(targets)}")

    env_info = check_environment(need_ui=not skip_ui, need_installer=targets["installer"])

    venv_py = ""
    if targets["installer"]:
        venv_py = ensure_python_environment()
        if not venv_py:
            print("Python 环境准备失败，无法构建桌面壳。")
            sys.exit(1)

    if skip_ui:
        if not os.path.exists(os.path.join(UI_BUILD_DIR, "index.html")):
            print("\n[4/9] 错误：--skip-ui 但 ui/v2.5/build 不存在。")
            sys.exit(1)
        count, size = dir_stats(UI_BUILD_DIR)
        print(f"\n[4/9] 跳过前端构建，复用 ui/v2.5/build（{count} 个文件，{fmt_size(size)}）")
    elif not build_ui(env_info):
        print("前端构建失败，流程终止。")
        sys.exit(1)

    setup_exe = shell_exe = ""
    if targets["installer"]:
        ico = build_icon(venv_py)
        shell_exe = build_desktop_shell(venv_py, ico)
        if not shell_exe:
            sys.exit(1)
        if not assemble_stage(shell_exe, env_info["exe"]):
            sys.exit(1)
        setup_exe = compile_installer(env_info["iscc"], ver)
        if not setup_exe:
            sys.exit(1)

    cleanup_build_dirs()

    archived = ""
    if targets["backup"]:
        archived = backup_source_zip(ver)

    published = False
    if targets["publish"]:
        published = publish_image(ver, flags["yes"])
    else:
        print("\n[9/9-b] 未选择镜像发布，跳过（可加 --publish 推送分支与标签触发 CI）")

    print("\n" + "=" * 62)
    print("                      构建成果汇总")
    print("=" * 62)
    if setup_exe:
        print(f"  [√] Windows 安装包 : {setup_exe}")
        print(f"      双击安装后从开始菜单/桌面图标启动，独立窗口内使用，无需浏览器。")
        print(r"      媒体库与配置在 %LOCALAPPDATA%\StashCustom\data（卸载不会删除）")
    if archived:
        print(f"  [√] NAS 源码归档   : {archived}")
    if published:
        print(f"  [√] CI 镜像        : 已推送 v{ver}，等待 {IMAGE_REPO}:{ver}")
    print(f"  [√] 版本标识       : {ver}（{datetime.now().strftime('%Y-%m-%d %H:%M')}）")
    print("=" * 62)

    if not flags["yes"] and (os.environ.get("PROMPT") or sys.stdin.isatty()):
        try:
            input("\n流程已完成，按回车键退出...")
        except Exception:
            pass


if __name__ == "__main__":
    main()
