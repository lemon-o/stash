# -*- coding: utf-8 -*-
r"""
Stash（fork: lemon-o/stash，分支 custom-ui）Windows 构建与发布脚本

交付形态与上游一致：常驻系统托盘 + 用默认浏览器打开界面（和 Sunshine 同一种）。
不套壳、不内嵌浏览器、不依赖 Python 运行时——安装目录里只有 Go 引擎本体与定制前端。

    {app}\stash.exe      Go 引擎（GUI 子系统，无控制台窗口；托盘常驻 + 自动开浏览器）
    {app}\ui\build\      定制前端（由 ui_location 指向，改前端不必重编 Go）
    {app}\LICENSE

脚本自身是本机构建工具，不会被打包、也不会分发。

流程（弹窗可勾选产物，命令行也能指定）：
1. 版本号与产物目标确认：以 git tag 为唯一真源，置顶弹窗或命令行指定
2. 环境检查：git / pnpm(corepack) / Inno Setup ISCC / bin\stash-win.exe
3. 前端构建：ui/v2.5 → pnpm install（按需）+ pnpm run build
4. 组装暂存：stash.exe + ui\build → dist\package\
5. 安装包编译：回填版本号到 desktop/Stash.iss → ISCC → 桌面 Setup exe
6. 源码归档至 NAS，以及（可选）推送分支+标签触发 docker-image.yml 出 GHCR 镜像

用法：
    python 打包stash.py                          # 交互模式
    python 打包stash.py 1.1.5 --installer --backup
    python 打包stash.py 1.1.5 --publish           # 另外推送标签触发 CI 镜像
    python 打包stash.py --skip-ui                 # 复用现有 ui/v2.5/build
    python 打包stash.py --keep-dist               # 保留 dist\ 里的暂存内容，便于排查

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
APP_NAME = "Stash"

UI_DIR = os.path.join(CURRENT_DIR, "ui", "v2.5")
UI_BUILD_DIR = os.path.join(UI_DIR, "build")
PACKAGE_JSON = os.path.join(UI_DIR, "package.json")
# 安装包/快捷方式图标直接复用仓库里已签入的 .ico，不再现场生成
ICON_SOURCE_ICO = os.path.join(UI_DIR, "public", "favicon.ico")
ISS_FILE = os.path.join(CURRENT_DIR, "desktop", f"{APP_NAME}.iss")
EXE_SOURCE = os.path.join(CURRENT_DIR, "bin", "stash-win.exe")

DIST_DIR = os.path.join(CURRENT_DIR, "dist")
STAGE_DIR = os.path.join(DIST_DIR, "package")

DESKTOP_DIR = os.path.join(os.path.expanduser("~"), "Desktop")
NETWORK_BACKUP_DIR = r"\\sa6400\文档\programming"

BRANCH = "custom-ui"
WORKFLOW_FILE = "docker-image.yml"
IMAGE_REPO = "ghcr.io/lemon-o/stash"


# ---------------- 通用子进程工具 ----------------
def run(cmd, cwd=None, capture=False, env=None, merge_stderr=False):
    """执行命令；Windows 上 npm/pnpm/corepack 是 .cmd 垫片，CreateProcess 只找 .exe，
    所以统一用 shutil.which 把裸命令名补成完整路径。

    merge_stderr=True 时把子进程 stderr 并入 stdout：pip 的"Looking in indexes /
    Collecting / Downloading"与进度条全部写在 stderr，若外层只抓 stdout（IDE、
    日志包装器、把脚本输出重定向到文件），就会一个字都看不到、误以为进程卡死。"""
    cmd = list(cmd)
    prog = str(cmd[0])
    if not os.path.isabs(prog) and not os.path.exists(prog):
        resolved = shutil.which(prog)
        if resolved:
            cmd[0] = resolved
    extra = {"stderr": subprocess.STDOUT} if (merge_stderr and not capture) else {}
    return subprocess.run(cmd, cwd=cwd, env=env, capture_output=capture,
                          text=True, encoding="utf-8", errors="replace", **extra)


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
    print("[2/6] 正在检查构建环境...")
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
        if not os.path.exists(ICON_SOURCE_ICO):
            problems.append(f"缺少安装包图标 {os.path.relpath(ICON_SOURCE_ICO, CURRENT_DIR)}")

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
             "skip_ui": False, "keep_dist": False, "explicit_any": False, "version": ""}
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
        elif low == "--keep-dist":
            flags["keep_dist"] = True
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
    print("[1/6] 确认发布版本与产物目标")
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
        root.title("Stash · 发布确认")
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


# ---------------- 3. 前端构建 ----------------
def build_ui(env_info):
    print("\n[3/6] 正在构建前端 (ui/v2.5 → build)...")
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


# ---------------- 4. 安装暂存组装 ----------------
def normalize_pe_subsystem(exe_path):
    """把引擎的 PE 子系统从 console(3) 改写成 GUI(2)，等价于 go build -ldflags "-H=windowsgui"。

    为什么必须改：上游 / CI 产出的 stash-win.exe 是 console 子系统。这类程序被「没有控制台的
    父进程」拉起时（安装器完成页的 [Run] 复选框、资源管理器双击、开始菜单快捷方式），Windows
    会去找「默认终端应用」（Win11 上一般是 Windows Terminal）接管那个新建的控制台；交接一旦
    失败，用户看到的就是一条
        [error 2147942632 (0x800700e8) when launching "stash.exe" -c ...]
    错误窗口，而程序其实根本没跑起来——这就是「装完启动不了」的真实成因。引擎自己在
    desktop.Start() 里还会 ShowWindow(SW_HIDE) 把刚建好的控制台藏掉，这个控制台纯属白建。

    改成 GUI 子系统后进程不再申请控制台，这一整类启动失败消失，行为与 Sunshine 一致
    （托盘常驻 + 默认浏览器打开界面）。唯一代价是 stdout 无处可写，因此安装器会预置 logfile，
    把日志落到 %LOCALAPPDATA%\\Stash\\stash.log。

    返回 (旧值, 新值)；已经是 GUI 时返回 None。
    """
    with open(exe_path, "r+b") as f:
        head = f.read(0x400)
        if len(head) < 0x100 or head[:2] != b"MZ":
            raise ValueError(f"{exe_path} 不是有效的 PE 文件（缺少 MZ 头）")
        pe = int.from_bytes(head[0x3C:0x40], "little")
        if head[pe:pe + 4] != b"PE\0\0":
            raise ValueError(f"{exe_path} 不是有效的 PE 文件（缺少 PE 签名）")
        opt = pe + 4 + 20
        magic = int.from_bytes(head[opt:opt + 2], "little")
        if magic not in (0x10B, 0x20B):
            raise ValueError(f"未知的可选头 magic: 0x{magic:04x}")
        # 32 位与 64 位可选头里，Subsystem 都在可选头 +0x44
        sub_off = opt + 0x44
        old = int.from_bytes(head[sub_off:sub_off + 2], "little")
        if old != 3:
            return None
        f.seek(sub_off)
        f.write((2).to_bytes(2, "little"))

    with open(exe_path, "rb") as f:
        f.seek(sub_off)
        new = int.from_bytes(f.read(2), "little")
    if new != 2:
        raise RuntimeError(f"子系统改写失败：期望 2，实际 {new}")
    return old, new


def assemble_stage(exe_source):
    print("\n[4/6] 正在组装安装包内容...")
    shutil.rmtree(STAGE_DIR, ignore_errors=True)
    os.makedirs(STAGE_DIR, exist_ok=True)

    target_exe = os.path.join(STAGE_DIR, "stash.exe")
    shutil.copy2(exe_source, target_exe)
    shutil.copytree(UI_BUILD_DIR, os.path.join(STAGE_DIR, "ui", "build"))
    shutil.copy2(os.path.join(CURRENT_DIR, "LICENSE"), os.path.join(STAGE_DIR, "LICENSE"))

    # 前端产物是 ui_location 的落点，引擎拿它当 statigz 的根目录：目录不存在会直接 panic
    # 秒退。这里先卡一道，免得装出来的包必然启动失败。
    if not os.path.exists(os.path.join(STAGE_DIR, "ui", "build", "index.html")):
        print("错误：ui/build 里没有 index.html，装出来会启动即崩。")
        return False

    res = normalize_pe_subsystem(target_exe)

    count, size = dir_stats(STAGE_DIR)
    print(f"  暂存目录 dist/package：{count} 个文件，{fmt_size(size)}")
    print("    stash.exe      Go 引擎（托盘 + 自动开浏览器）")
    if res:
        print(f"                    PE 子系统 {res[0]} → {res[1]}（console → GUI：不再申请控制台窗口）")
    else:
        print("                    PE 子系统已是 GUI（2），无需改写")
    print("    ui\\build\\      定制前端（安装后由 ui_location 指向，已校验 index.html）")
    return True


# ---------------- 5. Inno Setup 编译 ----------------
def update_iss_version(ver):
    """回填 desktop/Stash.iss 的 MyAppVersion（保持 UTF-8 BOM）"""
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
    print("\n[5/6] 正在编译 Windows 安装包 (Inno Setup)...")
    update_iss_version(ver)
    res = run([iscc, f"/O{DIST_DIR}", ISS_FILE], cwd=CURRENT_DIR, capture=True)
    built = os.path.join(DIST_DIR, f"{APP_NAME}-Setup-{ver}.exe")
    if res.returncode != 0 or not os.path.exists(built):
        print(f"错误：安装包编译失败 (返回码 {res.returncode})")
        for line in (res.stdout or "").splitlines()[-15:]:
            print(f"    {line}")
        return ""

    size = fmt_size(os.path.getsize(built))
    final = os.path.join(DESKTOP_DIR, f"{APP_NAME}-Setup-{ver}.exe")
    try:
        if os.path.exists(final):
            os.remove(final)
        shutil.move(built, final)
        print(f"  [√] 安装包: {final}（{size}）")
    except OSError as e:
        # 桌面不可写（受管控的环境）不代表构建失败，产物留在 dist\ 里同样可用
        final = built
        print(f"  [√] 安装包: {final}（{size}）")
        print(f"      复制到桌面失败（{e.strerror or e}），产物保留在 dist\\")
    return final


# ---------------- 6a. 源码归档 ----------------
ARCHIVE_IGNORE_DIRS = {
    ".git", ".venv", "venv", "node_modules", "build", "dist", "__pycache__",
    ".idea", ".vscode", ".gradle", ".local", ".go-cache", "bin",
}
# data/ 下只排除运行期生成物，保留数据库、配置、插件与自定义 CSS
DATA_RUNTIME_DIRS = {"generated", "cache", "blobs", "scraper", "backups", "tmp"}


def backup_source_zip(ver):
    print("\n[6/6-a] 正在归档项目源码至 NAS...")
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


# ---------------- 6b. 触发 CI 镜像 ----------------
def publish_image(ver, auto_yes):
    print("\n[6/6-b] 发布镜像（GitHub Actions docker-image.yml）")

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

    if not tag_exists and run(["git", "tag", "-a", tag_name, "-m", f"Stash {ver}"],
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


def cleanup_build_dirs(keep=""):
    """装完即弃：清理暂存内容；若安装包还在 dist\\ 里（桌面不可写时产物留在原处），
    则只删暂存目录，保留 Setup exe。"""
    print("\n正在清理临时构建目录...")
    targets = [STAGE_DIR]
    keep_in_dist = ""
    if keep and os.path.exists(keep):
        try:
            keep_in_dist = os.path.commonpath([keep, DIST_DIR]) == DIST_DIR
        except ValueError:
            keep_in_dist = False
    if not keep_in_dist:
        targets.append(DIST_DIR)
    targets.append(os.path.join(CURRENT_DIR, "build"))

    cleaned = []
    for d in targets:
        if os.path.exists(d):
            try:
                shutil.rmtree(d, onerror=_rmtree_onerror)
                cleaned.append(os.path.relpath(d, CURRENT_DIR))
            except Exception as e:
                print(f"  清理 {os.path.relpath(d, CURRENT_DIR)} 提示: {e}")
    if cleaned:
        print(f"  已清理: {', '.join(cleaned)}（安装包与 NAS 归档保留）")


# ---------------- 主入口 ----------------
def main():
    print("=" * 62)
    print("        Stash · Windows 构建与发布（托盘 + 浏览器）")
    print("=" * 62)

    flags = ask_cli_flags()
    skip_ui = flags["skip_ui"]

    print("")
    described, current_ver, default_ver = read_git_version()
    ver, targets = confirm_targets(described or current_ver, default_ver, flags)
    print(f"  发布版本: {ver}，产物: {target_names(targets)}")

    env_info = check_environment(need_ui=not skip_ui, need_installer=targets["installer"])

    if skip_ui:
        if not os.path.exists(os.path.join(UI_BUILD_DIR, "index.html")):
            print("\n[3/6] 错误：--skip-ui 但 ui/v2.5/build 不存在。")
            sys.exit(1)
        count, size = dir_stats(UI_BUILD_DIR)
        print(f"\n[3/6] 跳过前端构建，复用 ui/v2.5/build（{count} 个文件，{fmt_size(size)}）")
    elif not build_ui(env_info):
        print("前端构建失败，流程终止。")
        sys.exit(1)

    setup_exe = ""
    if targets["installer"]:
        if not assemble_stage(env_info["exe"]):
            sys.exit(1)
        setup_exe = compile_installer(env_info["iscc"], ver)
        if not setup_exe:
            sys.exit(1)

    if flags["keep_dist"]:
        print("\n按 --keep-dist 保留 dist\\ 暂存内容（正式构建无需此参数）")
    else:
        cleanup_build_dirs(setup_exe)

    archived = ""
    if targets["backup"]:
        archived = backup_source_zip(ver)

    published = False
    if targets["publish"]:
        published = publish_image(ver, flags["yes"])
    else:
        print("\n[6/6-b] 未选择镜像发布，跳过（可加 --publish 推送分支与标签触发 CI）")

    print("\n" + "=" * 62)
    print("                      构建成果汇总")
    print("=" * 62)
    if setup_exe:
        print(f"  [√] Windows 安装包 : {setup_exe}")
        print(f"      装完从开始菜单/桌面图标启动：系统托盘常驻 + 默认浏览器打开界面。")
        print(r"      默认安装位置 %LOCALAPPDATA%\Programs\Stash（按用户安装，不弹 UAC）")
        print(r"      数据与配置在 %LOCALAPPDATA%\Stash（卸载不会删除）")
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
