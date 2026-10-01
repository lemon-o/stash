import os
import sys
import json
import re
import base64
import sqlite3
import tempfile
import subprocess
import urllib.request
import urllib.error

sys.path.insert(0, os.path.dirname(__file__))
import log

def get_config_port():
    try:
        candidates = []
        cfg_env = os.environ.get("STASH_CONFIG_FILE")
        if cfg_env:
            candidates.append(cfg_env)
        candidates.extend([
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "config.yml")),
            os.path.abspath(os.path.join(os.getcwd(), "config.yml")),
            "/root/.stash/config.yml",
        ])
        for config_path in candidates:
            if os.path.exists(config_path):
                with open(config_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("port:"):
                            return int(line.split(":", 1)[1].strip())
    except Exception:
        pass
    return 9999

def get_sqlite_path():
    candidates = []
    cfg_env = os.environ.get("STASH_CONFIG_FILE")
    if cfg_env:
        candidates.append(os.path.abspath(os.path.join(os.path.dirname(cfg_env), "stash-go.sqlite")))
    candidates.extend([
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "stash-go.sqlite")),
        os.path.abspath(os.path.join(os.getcwd(), "data", "stash-go.sqlite")),
        os.path.abspath(os.path.join(os.getcwd(), "stash-go.sqlite")),
        "/root/.stash/stash-go.sqlite",
    ])
    for c in candidates:
        if os.path.exists(c):
            return c
    return candidates[0]

class StashClient:
    def __init__(self, conn=None):
        if conn:
            scheme = conn.get("Scheme", "http")
            port = conn.get("Port", get_config_port())
            self.base_url = f"{scheme}://localhost:{port}"
            self.session_cookie = conn.get("SessionCookie", {}).get("Value") if conn.get("SessionCookie") else None
            self.api_key = conn.get("ApiKey")
        else:
            port = get_config_port()
            self.base_url = f"http://localhost:{port}"
            self.session_cookie = None
            self.api_key = None

        self.graphql_url = f"{self.base_url}/graphql"
        self.headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.session_cookie:
            self.headers["Cookie"] = f"session={self.session_cookie}"
        if self.api_key:
            self.headers["ApiKey"] = self.api_key

    def graphql(self, query, variables=None):
        payload = {"query": query}
        if variables is not None:
            payload["variables"] = variables
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self.graphql_url, data=data, headers=self.headers)
        try:
            with urllib.request.urlopen(req) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                if res.get("errors"):
                    raise Exception(f"GraphQL error: {res['errors']}")
                return res.get("data", {})
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            raise Exception(f"HTTP {e.code}: {err_body}")

    def get_all_groups(self):
        query = """
        query GetAllGroups {
            findGroups(filter: { per_page: -1 }) {
                count
                groups {
                    id
                    name
                    front_image_path
                }
            }
        }
        """
        data = self.graphql(query)
        groups = data.get("findGroups", {}).get("groups", [])
        group_map = {}
        for g in groups:
            group_map[g["name"].strip().lower()] = g
        return group_map

    def create_group(self, name, front_image=None):
        mutation = """
        mutation CreateGroup($input: GroupCreateInput!) {
            groupCreate(input: $input) {
                id
                name
                front_image_path
            }
        }
        """
        inp = {"name": name}
        if front_image:
            inp["front_image"] = front_image
        data = self.graphql(mutation, {"input": inp})
        return data.get("groupCreate")

    def update_group_cover(self, group_id, front_image):
        mutation = """
        mutation UpdateGroupCover($input: GroupUpdateInput!) {
            groupUpdate(input: $input) {
                id
                front_image_path
            }
        }
        """
        inp = {"id": str(group_id), "front_image": front_image}
        data = self.graphql(mutation, {"input": inp})
        return data.get("groupUpdate")

    def get_scene(self, scene_id):
        query = """
        query GetScene($id: ID!) {
            findScene(id: $id) {
                id
                title
                files {
                    id
                    path
                    basename
                }
                groups {
                    group {
                        id
                        name
                    }
                    scene_index
                }
                paths {
                    screenshot
                }
            }
        }
        """
        data = self.graphql(query, {"id": str(scene_id)})
        return data.get("findScene")

    def get_all_scenes(self):
        query = """
        query GetAllScenes {
            findScenes(filter: { per_page: -1 }) {
                count
                scenes {
                    id
                    title
                    files {
                        id
                        path
                        basename
                    }
                    groups {
                        group {
                            id
                            name
                        }
                        scene_index
                    }
                    paths {
                        screenshot
                    }
                }
            }
        }
        """
        data = self.graphql(query)
        return data.get("findScenes", {}).get("scenes", [])

    def update_scene_groups(self, scene_id, groups):
        mutation = """
        mutation UpdateSceneGroups($input: SceneUpdateInput!) {
            sceneUpdate(input: $input) {
                id
            }
        }
        """
        inp = {
            "id": str(scene_id),
            "groups": groups
        }
        self.graphql(mutation, {"input": inp})

    def update_scene_cover(self, scene_id, cover_image):
        mutation = """
        mutation UpdateSceneCover($input: SceneUpdateInput!) {
            sceneUpdate(input: $input) {
                id
                paths {
                    screenshot
                }
            }
        }
        """
        inp = {"id": str(scene_id), "cover_image": cover_image}
        data = self.graphql(mutation, {"input": inp})
        return data.get("sceneUpdate")


def resolve_real_path(path):
    if not path:
        return path
    if os.path.exists(path):
        return os.path.abspath(path)
    # Check if relative to drive on Windows (e.g. \樱晚 -> D:\樱晚)
    if path.startswith(("\\", "/")):
        for drive in ("D", "C", "E", "F", "G"):
            cand = f"{drive}:{path}"
            if os.path.exists(cand):
                return cand
    return os.path.abspath(path)


def get_library_roots(client):
    roots = set()
    try:
        query = "{ configuration { general { stashes { path } } } }"
        data = client.graphql(query)
        stashes = data.get("configuration", {}).get("general", {}).get("stashes", [])
        for s in stashes:
            p = s.get("path")
            if p:
                roots.add(os.path.normcase(os.path.normpath(p)))
                real_p = resolve_real_path(p)
                if real_p:
                    roots.add(os.path.normcase(os.path.normpath(real_p)))
    except Exception as e:
        log.LogDebug(f"Could not get stashes from config: {e}")

    # Fallback/complement with sqlite root folders
    db_path = get_sqlite_path()
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path)
            c = conn.cursor()
            rows = c.execute("SELECT path FROM folders WHERE parent_folder_id IS NULL").fetchall()
            for r in rows:
                if r[0]:
                    roots.add(os.path.normcase(os.path.normpath(r[0])))
                    real_p = resolve_real_path(r[0])
                    if real_p:
                        roots.add(os.path.normcase(os.path.normpath(real_p)))
            conn.close()
        except Exception as e:
            log.LogDebug(f"Could not get root folders from sqlite: {e}")

    return roots


MULTIPART_RE = re.compile(
    r"^(cd|disc|disk|part|vol|volume|season|s)\s*[-_]?\s*(\d+|[a-z])$|^第\s*[0-9一二三四五六七八九十]+\s*[季部卷]$",
    re.IGNORECASE
)

def determine_collection_info(file_path, library_roots):
    """
    Given a file path and a set of normalized library roots,
    determines:
      - is_subfolder: boolean (True if in a subfolder, False if directly in root library or drive root)
      - collection_name: string or None
      - collection_dir: string or None
    """
    if not file_path:
        return False, None, None

    norm = os.path.normpath(file_path)
    parent = os.path.dirname(norm)
    if not parent or parent == norm:
        return False, None, None

    # Check if parent is a drive root e.g. "D:\" or "\"
    drive, tail = os.path.splitdrive(parent)
    if tail in ("", "\\", "/"):
        return False, None, None

    # Check if parent is a disc/part folder (e.g. CD1, Season 1)
    base_parent = os.path.basename(parent)
    if MULTIPART_RE.match(base_parent):
        grandparent = os.path.dirname(parent)
        g_drive, g_tail = os.path.splitdrive(grandparent)
        if grandparent and g_tail not in ("", "\\", "/"):
            parent = grandparent

    # Check if parent is one of the library roots (二级子文件夹逻辑：仅对媒体库子文件夹创建集合，排除直接位于媒体库根目录下的文件)
    norm_parent = os.path.normcase(os.path.normpath(parent))
    real_parent = os.path.normcase(resolve_real_path(parent))
    if norm_parent in library_roots or real_parent in library_roots:
        # Directly under library root -> not a subfolder collection
        return False, None, None

    col_name = os.path.basename(parent).strip()
    if not col_name:
        return False, None, None

    return True, col_name, parent


def find_cover_image_on_disk(folder_dir, col_name):
    if not folder_dir:
        return None
    folder_dir = resolve_real_path(folder_dir)
    if not os.path.exists(folder_dir):
        return None

    # Search candidates in folder_dir
    patterns = [
        re.compile(r"^(poster|cover|folder|front)\.(jpe?g|png|webp)$", re.IGNORECASE),
        re.compile(rf"^{re.escape(col_name)}\.(jpe?g|png|webp)$", re.IGNORECASE),
        re.compile(r".*(poster|cover|folder|front).*\.(jpe?g|png|webp)$", re.IGNORECASE),
    ]

    try:
        entries = os.listdir(folder_dir)
    except Exception:
        return None

    for pat in patterns:
        for entry in entries:
            if pat.match(entry):
                img_path = os.path.join(folder_dir, entry)
                if os.path.isfile(img_path):
                    return file_to_data_uri(img_path)

    # Any image file in folder
    for entry in entries:
        if entry.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            img_path = os.path.join(folder_dir, entry)
            if os.path.isfile(img_path):
                return file_to_data_uri(img_path)

    return None


def file_to_data_uri(filepath):
    try:
        ext = os.path.splitext(filepath)[1].lower()
        mime = "image/jpeg"
        if ext == ".png":
            mime = "image/png"
        elif ext == ".webp":
            mime = "image/webp"

        with open(filepath, "rb") as f:
            data = f.read()
        b64 = base64.b64encode(data).decode("ascii")
        return f"data:{mime};base64,{b64}"
    except Exception as e:
        log.LogDebug(f"Failed to read image {filepath}: {e}")
        return None


def get_scene_cover_from_sqlite(scene_id):
    db_path = get_sqlite_path()
    if not os.path.exists(db_path):
        return None
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        row = c.execute("""
            SELECT b.blob 
            FROM scenes s 
            JOIN blobs b ON s.cover_blob = b.checksum 
            WHERE s.id = ?
        """, (str(scene_id),)).fetchone()
        conn.close()
        if row and row[0]:
            blob = row[0]
            mime = "image/jpeg"
            if blob.startswith(b"\x89PNG"):
                mime = "image/png"
            elif blob.startswith(b"RIFF") and b"WEBP" in blob[:16]:
                mime = "image/webp"
            b64 = base64.b64encode(blob).decode("ascii")
            return f"data:{mime};base64,{b64}"
    except Exception as e:
        log.LogDebug(f"Could not load cover from sqlite for scene {scene_id}: {e}")
    return None


def is_image_black_or_blank(raw_bytes):
    """
    Evaluates raw image bytes and returns:
      - is_unusable: bool (True if black or blank/solid color)
      - score: float (quality score based on contrast and brightness)
      - mean: float (average luminance 0-255)
      - stddev: float (standard deviation of luminance)
    """
    try:
        from PIL import Image, ImageStat
        import io
        im = Image.open(io.BytesIO(raw_bytes)).convert("L")
        stat = ImageStat.Stat(im)
        mean = stat.mean[0]
        stddev = stat.stddev[0]
        extrema = im.getextrema()
        min_val, max_val = extrema[0], extrema[1]

        # Black frame check: mean too low or maximum brightness still very dark
        is_black = (mean < 20.0 and max_val < 45.0) or mean < 15.0
        # Blank / Solid color frame check: no variance or contrast
        is_blank = stddev < 6.0 or (max_val - min_val) < 15.0

        exp_w = 1.0
        if mean < 40.0:
            exp_w = max(0.1, mean / 40.0)
        elif mean > 220.0:
            exp_w = max(0.1, (255.0 - mean) / 35.0)

        score = stddev * exp_w if not (is_black or is_blank) else 0.0
        return (is_black or is_blank), score, mean, stddev
    except Exception as e:
        log.LogDebug(f"Error evaluating image: {e}")
        return False, 1.0, 50.0, 20.0


def extract_optimal_frame_ffmpeg(video_path, duration=None):
    video_path = resolve_real_path(video_path)
    if not video_path or not os.path.exists(video_path):
        return None

    if duration is None or duration <= 0:
        try:
            cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", video_path]
            res = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=10)
            duration = float(res.decode().strip())
        except Exception:
            duration = 0.0

    candidates = []
    if duration > 0:
        if duration <= 15.0:
            ratios = [0.25, 0.50, 0.75]
        else:
            ratios = [0.20, 0.40, 0.60]
        for r in ratios:
            candidates.append((r, r * duration))
    else:
        candidates = [(0.0, 2.0), (0.0, 5.0), (0.0, 10.0)]

    temp_dir = tempfile.gettempdir()
    best_data_uri = None
    best_score = -1.0
    first_data_uri = None

    for _, t in candidates:
        out_file = os.path.join(temp_dir, f"stash_thumb_{os.getpid()}_{int(t*100)}.jpg")
        try:
            cmd = ["ffmpeg", "-y", "-ss", f"{t:.3f}", "-i", video_path, "-vframes", "1", "-q:v", "2", out_file]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
            if os.path.exists(out_file) and os.path.getsize(out_file) > 0:
                with open(out_file, "rb") as f:
                    raw_bytes = f.read()
                data_uri = f"data:image/jpeg;base64,{base64.b64encode(raw_bytes).decode('ascii')}"
                if first_data_uri is None:
                    first_data_uri = data_uri

                is_unusable, score, mean, stddev = is_image_black_or_blank(raw_bytes)
                # 只要不是黑屏且非纯色空白屏（not is_unusable），立即返回，避免多轮 FFmpeg 串行抽取
                if not is_unusable:
                    log.LogDebug(f"提取到清晰画面 ({os.path.basename(video_path)} @ {t:.2f}s, mean={mean:.1f}, stddev={stddev:.1f})")
                    return data_uri

                if score > best_score:
                    best_score = score
                    best_data_uri = data_uri
        except Exception:
            pass
        finally:
            if os.path.exists(out_file):
                try:
                    os.remove(out_file)
                except Exception:
                    pass

    return best_data_uri or first_data_uri


def extract_frame_ffmpeg(video_path):
    return extract_optimal_frame_ffmpeg(video_path)


def check_and_repair_scene_thumbnail(scene, client):
    scene_id = scene.get("id")
    if not scene_id:
        return False
    files = scene.get("files", [])
    if not files:
        return False
    video_path = files[0].get("path")
    if not video_path:
        return False

    cover_uri = get_scene_cover_from_sqlite(scene_id)
    needs_repair = False
    reason = ""

    if not cover_uri:
        needs_repair = True
        reason = "无封面缩略图"
    else:
        try:
            b64_part = cover_uri.split(",", 1)[1] if "," in cover_uri else cover_uri
            raw_data = base64.b64decode(b64_part)
            is_unusable, score, mean, stddev = is_image_black_or_blank(raw_data)
            if is_unusable or mean < 30.0 or stddev < 15.0:
                needs_repair = True
                reason = f"黑帧/暗帧/空白帧 (mean={mean:.1f}, stddev={stddev:.1f})"
        except Exception:
            pass

    if needs_repair:
        log.LogInfo(f"短片 #{scene_id} ({files[0].get('basename', '')}) 封面检测为{reason}，正在重新抽取清晰无黑帧缩略图...")
        new_cover = extract_optimal_frame_ffmpeg(video_path)
        if new_cover:
            client.update_scene_cover(scene_id, new_cover)
            log.LogInfo(f"成功为短片 #{scene_id} 替换高质量无黑帧缩略图！")
            return True

    return False


def resolve_group_cover(folder_dir, col_name, scene_id, video_path):
    folder_dir = resolve_real_path(folder_dir)
    video_path = resolve_real_path(video_path)

    # Priority 1: Disk image file in subfolder
    cover = find_cover_image_on_disk(folder_dir, col_name)
    if cover:
        log.LogDebug(f"Found disk cover for '{col_name}' in {folder_dir}")
        return cover

    # Priority 2: Scene cover from Stash database
    cover = get_scene_cover_from_sqlite(scene_id)
    if cover:
        log.LogDebug(f"Using scene {scene_id} cover for collection '{col_name}'")
        return cover

    # Priority 3: Extract frame with ffmpeg
    if video_path and os.path.exists(video_path):
        cover = extract_frame_ffmpeg(video_path)
        if cover:
            log.LogDebug(f"Extracted ffmpeg frame from {video_path} for '{col_name}'")
            return cover

    return None


def process_scene(scene, client, library_roots, groups_map, fix_scene_thumb=False):
    # 仅在明确开启核验时修复短片缩略图（扫描与日常入库时 Go 后端已生成封面，避免重复调用 FFmpeg）
    if fix_scene_thumb:
        check_and_repair_scene_thumbnail(scene, client)

    scene_id = scene["id"]
    files = scene.get("files", [])
    if not files:
        return

    primary_file = files[0]
    file_path = primary_file.get("path")
    if not file_path:
        return

    is_subfolder, col_name, folder_dir = determine_collection_info(file_path, library_roots)
    if not is_subfolder or not col_name:
        return

    col_key = col_name.strip().lower()
    group = groups_map.get(col_key)

    # If group does not exist, create it with cover
    if not group:
        log.LogInfo(f"创建新集合: 【{col_name}】")
        cover_data_uri = resolve_group_cover(folder_dir, col_name, scene_id, file_path)
        new_group = client.create_group(col_name, front_image=cover_data_uri)
        if new_group:
            group = new_group
            groups_map[col_key] = group
            log.LogInfo(f"集合创建成功: 【{col_name}】(ID: {group['id']})")
    else:
        # Group exists. Check if it lacks a front cover image
        if not group.get("front_image_path"):
            log.LogInfo(f"集合 【{col_name}】 暂无封面图，正在自动生成...")
            cover_data_uri = resolve_group_cover(folder_dir, col_name, scene_id, file_path)
            if cover_data_uri:
                client.update_group_cover(group["id"], cover_data_uri)
                group["front_image_path"] = "updated"
                log.LogInfo(f"成功为集合 【{col_name}】 设置封面图")

    if not group:
        return

    group_id = str(group["id"])
    existing_groups = scene.get("groups", [])
    already_linked = any(str(g.get("group", {}).get("id")) == group_id for g in existing_groups)

    if not already_linked:
        log.LogInfo(f"将短片 #{scene_id} ({primary_file.get('basename', '')}) 归类到集合 【{col_name}】")
        new_groups_input = []
        for g in existing_groups:
            gid = g.get("group", {}).get("id")
            if gid:
                new_groups_input.append({
                    "group_id": str(gid),
                    "scene_index": g.get("scene_index")
                })
        new_groups_input.append({
            "group_id": group_id,
            "scene_index": None
        })
        client.update_scene_groups(scene_id, new_groups_input)


def run_full(client):
    log.LogInfo("开始根据媒体库子文件夹自动整理集合与封面图...")
    library_roots = get_library_roots(client)
    log.LogDebug(f"媒体库根目录: {library_roots}")
    groups_map = client.get_all_groups()
    log.LogDebug(f"当前已存在集合数量: {len(groups_map)}")

    scenes = client.get_all_scenes()
    total = len(scenes)
    log.LogInfo(f"共发现 {total} 部短片需要检查")

    for i, scene in enumerate(scenes):
        try:
            process_scene(scene, client, library_roots, groups_map, fix_scene_thumb=False)
        except Exception as e:
            log.LogWarning(f"处理短片 #{scene.get('id')} 发生错误: {e}")

        if (i + 1) % 5 == 0 or i == total - 1:
            log.LogProgress((i + 1) / max(1, total))

    log.LogInfo("根据子文件夹自动创建集合与封面图完成！")


def run_fix_thumbnails(client):
    log.LogInfo("开始全媒体库短片缩略图质量检查（消除黑帧与空白帧）...")
    scenes = client.get_all_scenes()
    total = len(scenes)
    fixed = 0
    for i, scene in enumerate(scenes):
        try:
            if check_and_repair_scene_thumbnail(scene, client):
                fixed += 1
        except Exception as e:
            log.LogWarning(f"优化短片 #{scene.get('id')} 缩略图失败: {e}")

        if (i + 1) % 5 == 0 or i == total - 1:
            log.LogProgress((i + 1) / max(1, total))

    log.LogInfo(f"全媒体库短片缩略图优化完成！共优化替换了 {fixed} 部短片的黑帧/空白帧缩略图。")


def run_hook(client, hook_context):
    scene_id = hook_context.get("id")
    if not scene_id:
        return
    log.LogInfo(f"检测到新短片创建或更新 (ID: {scene_id})，正在执行子文件夹归类...")
    library_roots = get_library_roots(client)
    groups_map = client.get_all_groups()

    scene = client.get_scene(scene_id)
    if scene:
        process_scene(scene, client, library_roots, groups_map, fix_scene_thumb=False)
        log.LogInfo(f"短片 #{scene_id} 集合归类处理完成")


def main():
    plugin_input = None
    if not sys.stdin.isatty():
        try:
            raw = sys.stdin.read()
            if raw.strip():
                plugin_input = json.loads(raw)
        except Exception as e:
            log.LogWarning(f"无法从 stdin 读取输入: {e}")

    server_conn = None
    args = {}
    if plugin_input:
        server_conn = plugin_input.get("server_connection")
        args = plugin_input.get("args", {})

    client = StashClient(server_conn)

    mode = args.get("mode")
    hook_context = args.get("hookContext")

    try:
        if mode == "fix_thumbnails":
            run_fix_thumbnails(client)
        elif hook_context and hook_context.get("id"):
            run_hook(client, hook_context)
        elif mode == "hook" and hook_context:
            run_hook(client, hook_context)
        else:
            run_full(client)
    except Exception as e:
        log.LogError(f"自动任务执行失败: {e}")
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

    print(json.dumps({"output": "ok"}))

if __name__ == "__main__":
    main()
