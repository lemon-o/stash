import os
import sys
import json
import re
import base64
import hashlib
import sqlite3
import tempfile
import time
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

IGNORED_SYSTEM_DIRS = {
    "@eadir", ".@eadir", "#recycle", "@recycle", ".@__thumb",
    "__macosx", ".thumbnails", "$recycle.bin", "system volume information",
    ".trashes", ".spotlight-v100", ".fseventsd", ".temporaryitems"
}

def is_ignored_path(path):
    if not path:
        return False
    norm = os.path.normpath(path).replace("\\", "/")
    parts = norm.split("/")
    for p in parts:
        if p.strip().lower() in IGNORED_SYSTEM_DIRS:
            return True
    base = os.path.basename(norm).strip()
    lower_base = base.lower()
    if lower_base in {".ds_store", "thumbs.db", "ehthumbs.db", "ehthumbs_vista.db", "desktop.ini", ".nomedia"}:
        return True
    if base.startswith("._"):
        return True
    upper_base = base.upper()
    if (upper_base.startswith("SYNOFILE_THUMB_") or
        upper_base.startswith("SYNOPHOTO_THUMB_") or
        upper_base.startswith("SYNOPHOTO_FILM_") or
        upper_base.startswith("@SYNOEASTREAM")):
        return True
    return False

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

    def graphql(self, query, variables=None, retries=3):
        payload = {"query": query}
        if variables is not None:
            payload["variables"] = variables
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self.graphql_url, data=data, headers=self.headers)
        last_error = None
        for attempt in range(retries):
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    res = json.loads(resp.read().decode("utf-8"))
                    if res.get("errors"):
                        raise Exception(f"GraphQL error: {res['errors']}")
                    return res.get("data", {})
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8")
                last_error = Exception(f"HTTP {e.code}: {err_body}")
                if attempt < retries - 1 and e.code in {500, 502, 503, 504}:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise last_error
            except Exception as e:
                last_error = e
                if attempt < retries - 1:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise last_error

    def get_all_groups(self):
        query = """
        query GetAllGroups {
            findGroups(filter: { per_page: -1 }) {
                count
                groups {
                    id
                    name
                    front_image_path
                    scene_count
                }
            }
        }
        """
        try:
            data = self.graphql(query)
            groups = data.get("findGroups", {}).get("groups", [])
            group_map = {}
            for g in groups:
                key = g["name"].strip().lower()
                # If duplicates exist in list, prioritize the one with highest scene_count or with front_image
                if key not in group_map:
                    group_map[key] = g
                else:
                    existing = group_map[key]
                    if (g.get("scene_count") or 0) > (existing.get("scene_count") or 0) or (g.get("front_image_path") and not existing.get("front_image_path")):
                        group_map[key] = g
            return group_map
        except Exception as e:
            log.LogDebug(f"GraphQL get_all_groups failed ({e}), falling back to SQLite...")
            db_path = get_sqlite_path()
            if os.path.exists(db_path):
                try:
                    conn = sqlite3.connect(db_path)
                    cur = conn.cursor()
                    rows = cur.execute("SELECT id, name, front_image_blob FROM groups").fetchall()
                    conn.close()
                    group_map = {}
                    for gid, gname, fblob in rows:
                        if gname:
                            group_map[gname.strip().lower()] = {
                                "id": str(gid),
                                "name": gname,
                                "front_image_path": fblob,
                                "scene_count": 0
                            }
                    return group_map
                except Exception:
                    pass
            return {}

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
        try:
            data = self.graphql(mutation, {"input": inp})
            return data.get("groupCreate")
        except Exception as e:
            if front_image:
                log.LogWarning(f"带封面创建集合【{name}】失败: {e}，正在尝试不带封面创建...")
                try:
                    data = self.graphql(mutation, {"input": {"name": name}})
                    created = data.get("groupCreate")
                    if created and created.get("id"):
                        try:
                            self.update_group_cover(created["id"], front_image)
                        except Exception as e2:
                            log.LogWarning(f"后续补充设置集合封面失败: {e2}")
                    return created
                except Exception as e3:
                    log.LogError(f"即使不带封面创建集合【{name}】亦失败: {e3}")
                    raise e3
            raise e

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

    def destroy_group(self, group_id):
        mutation = """
        mutation DestroyGroup($input: GroupDestroyInput!) {
            groupDestroy(input: $input)
        }
        """
        inp = {"id": str(group_id)}
        data = self.graphql(mutation, {"input": inp})
        return data.get("groupDestroy")

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
    
    Collection logic:
      A collection corresponds to the 1st-level subfolder directly under the matched library root.
      Any files nested deeper under that subfolder belong to that same top-level collection.
      Files located directly in the root of the library are excluded.
    """
    if not file_path or is_ignored_path(file_path):
        return False, None, None

    norm_file = os.path.normpath(file_path)
    real_file = resolve_real_path(norm_file)

    # 1. Match against configured library roots
    matched_root = None
    sorted_roots = sorted(library_roots, key=lambda r: len(r), reverse=True)
    for r in sorted_roots:
        norm_r = os.path.normcase(os.path.normpath(r).rstrip("\\/")) + os.sep
        n_file = os.path.normcase(norm_file)
        if n_file.startswith(norm_r):
            matched_root = r
            break
        if real_file:
            r_file = os.path.normcase(real_file)
            r_root_val = resolve_real_path(r) or r
            r_root = os.path.normcase(os.path.normpath(r_root_val).rstrip("\\/")) + os.sep
            if r_file.startswith(r_root):
                matched_root = r
                break

    if matched_root:
        try:
            rel = os.path.relpath(norm_file, matched_root)
        except Exception:
            rel = os.path.relpath(real_file, resolve_real_path(matched_root))

        parts = os.path.normpath(rel).split(os.sep)
        # parts[0] is the top-level directory directly under library root
        if len(parts) <= 1:
            # File is directly in library root -> not a subfolder collection
            return False, None, None

        col_name = parts[0].strip()
        if not col_name or is_ignored_path(col_name):
            return False, None, None

        col_dir = os.path.join(matched_root, parts[0])
        return True, col_name, col_dir

    # 2. Fallback if no library root was matched
    parent = os.path.dirname(norm_file)
    if not parent or parent == norm_file:
        return False, None, None

    drive, tail = os.path.splitdrive(parent)
    if tail in ("", "\\", "/"):
        return False, None, None

    base_parent = os.path.basename(parent)
    if MULTIPART_RE.match(base_parent):
        grandparent = os.path.dirname(parent)
        g_drive, g_tail = os.path.splitdrive(grandparent)
        if grandparent and g_tail not in ("", "\\", "/"):
            parent = grandparent

    norm_parent = os.path.normcase(os.path.normpath(parent))
    real_parent = os.path.normcase(resolve_real_path(parent))
    if norm_parent in library_roots or real_parent in library_roots:
        return False, None, None

    col_name = os.path.basename(parent).strip()
    if not col_name or is_ignored_path(col_name):
        return False, None, None

    return True, col_name, parent


class AutoGroupLock:
    """
    Cross-platform, multi-process mutual exclusion file lock.
    Guarantees thread-safe and process-safe group creation and deduplication.
    """
    def __init__(self, lock_file=None, timeout=60):
        if lock_file is None:
            self.lock_file = os.path.join(tempfile.gettempdir(), "stash_auto_group.lock")
        else:
            self.lock_file = lock_file
        self.timeout = timeout
        self.fd = None

    def __enter__(self):
        start_time = time.time()
        while True:
            try:
                self.fd = os.open(self.lock_file, os.O_CREAT | os.O_RDWR)
                if sys.platform == "win32":
                    import msvcrt
                    msvcrt.locking(self.fd, msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return self
            except (OSError, IOError):
                if self.fd is not None:
                    try:
                        os.close(self.fd)
                    except Exception:
                        pass
                    self.fd = None
                if time.time() - start_time > self.timeout:
                    log.LogWarning(f"等待自动集合互斥锁超时 ({self.timeout}s)，继续执行以防死锁")
                    return self
                time.sleep(0.05)

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.fd is not None:
            try:
                if sys.platform == "win32":
                    import msvcrt
                    os.lseek(self.fd, 0, os.SEEK_SET)
                    msvcrt.locking(self.fd, msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(self.fd, fcntl.LOCK_UN)
            except Exception:
                pass
            try:
                os.close(self.fd)
            except Exception:
                pass
            self.fd = None


def cleanup_duplicate_groups(client):
    """
    Scans for duplicate groups having identical normalized names.
    Consolidates scene associations into the primary group and deletes redundant groups.
    """
    try:
        query = """
        query GetAllGroupsWithScenes {
            findGroups(filter: { per_page: -1 }) {
                count
                groups {
                    id
                    name
                    front_image_path
                    scene_count
                }
            }
        }
        """
        data = client.graphql(query)
        groups = data.get("findGroups", {}).get("groups", [])
        if not groups:
            return

        name_groups = {}
        for g in groups:
            name = (g.get("name") or "").strip()
            if not name:
                continue
            norm_name = name.lower()
            if norm_name not in name_groups:
                name_groups[norm_name] = []
            name_groups[norm_name].append(g)

        db_path = get_sqlite_path()
        for norm_name, dups in name_groups.items():
            if len(dups) <= 1:
                continue

            # Prioritize: highest scene count, has front cover, lowest ID
            dups.sort(
                key=lambda x: (
                    -(x.get("scene_count") or 0),
                    0 if x.get("front_image_path") else 1,
                    int(x.get("id", 999999))
                )
            )
            primary = dups[0]
            redundant = dups[1:]

            display_name = primary.get("name")
            primary_id = primary["id"]
            redundant_ids = [r["id"] for r in redundant]

            log.LogInfo(f"检测到重复集合【{display_name}】共 {len(dups)} 个 (主集合 ID: {primary_id}, 冗余 ID: {redundant_ids})，正在自动合并关联短片并清理冗余...")

            if os.path.exists(db_path):
                try:
                    conn = sqlite3.connect(db_path)
                    cur = conn.cursor()
                    for r in redundant:
                        rid = int(r["id"])
                        scenes = cur.execute("SELECT scene_id, scene_index FROM groups_scenes WHERE group_id = ?", (rid,)).fetchall()
                        for sid, sidx in scenes:
                            cur.execute(
                                "INSERT OR IGNORE INTO groups_scenes (group_id, scene_id, scene_index) VALUES (?, ?, ?)",
                                (int(primary_id), sid, sidx)
                            )
                        cur.execute("DELETE FROM groups_scenes WHERE group_id = ?", (rid,))
                    conn.commit()
                    conn.close()
                except Exception as e:
                    log.LogWarning(f"合并重复集合短片关系时发生错误: {e}")

            for r in redundant:
                rid = r["id"]
                try:
                    client.destroy_group(rid)
                    log.LogInfo(f"已清理冗余重复集合 ID #{rid}")
                except Exception as e:
                    log.LogWarning(f"删除冗余集合 #{rid} 失败: {e}")

    except Exception as e:
        log.LogWarning(f"清理重复集合时发生错误: {e}")


def find_cover_image_on_disk(folder_dir, col_name):
    if not folder_dir:
        return None
    folder_dir = resolve_real_path(folder_dir)
    if not os.path.exists(folder_dir):
        return None

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
            if is_ignored_path(entry):
                continue
            if pat.match(entry):
                img_path = os.path.join(folder_dir, entry)
                if os.path.isfile(img_path):
                    return file_to_data_uri(img_path)

    for entry in entries:
        if is_ignored_path(entry):
            continue
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
    try:
        from PIL import Image, ImageStat
        import io
        im = Image.open(io.BytesIO(raw_bytes)).convert("L")
        stat = ImageStat.Stat(im)
        mean = stat.mean[0]
        stddev = stat.stddev[0]
        extrema = im.getextrema()
        min_val, max_val = extrema[0], extrema[1]

        is_black = (mean < 20.0 and max_val < 45.0) or mean < 15.0
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


def is_ts_masquerading_as_mp4(file_path):
    real_path = resolve_real_path(file_path)
    if not real_path or not os.path.exists(real_path):
        return False
    ext = os.path.splitext(real_path)[1].lower()
    if ext not in [".mp4", ".m4v"]:
        return False
    try:
        with open(real_path, "rb") as f:
            header = f.read(16)
            if header and len(header) > 0 and header[0] == 0x47:
                return True
            if header and len(header) >= 3 and header[:3] == b"FLV":
                return True
    except Exception:
        pass
    return False


def heal_video_file(file_path):
    real_path = resolve_real_path(file_path)
    if not real_path or not os.path.exists(real_path):
        return False
    if not is_ts_masquerading_as_mp4(real_path):
        return False

    temp_path = real_path + ".tmp_heal.mp4"
    bak_path = real_path + ".bak_heal"

    try:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        if os.path.exists(bak_path):
            os.remove(bak_path)
    except Exception:
        pass

    log.LogInfo(f"[AutoHeal] 发现伪装格式或时间戳损坏视频: {real_path}，正在无损换封装为 FastStart MP4...")

    creationflags = 0
    if sys.platform == "win32":
        creationflags = 0x08000000  # CREATE_NO_WINDOW

    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-i", real_path,
        "-c", "copy",
        "-movflags", "+faststart",
        temp_path
    ]

    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=creationflags, timeout=300)
        if res.returncode != 0 or not os.path.exists(temp_path) or os.path.getsize(temp_path) == 0:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            log.LogWarning(f"[AutoHeal] ffmpeg 无损修复失败 ({res.returncode}): {res.stderr.decode('utf-8', errors='ignore')}")
            return False

        # Atomic replacement
        os.rename(real_path, bak_path)
        try:
            os.rename(temp_path, real_path)
            if os.path.exists(bak_path):
                os.remove(bak_path)
            log.LogInfo(f"[AutoHeal] 视频自愈修复完成: {real_path} (已转为标准 FastStart MP4)")
            return True
        except Exception as e:
            if os.path.exists(bak_path):
                os.rename(bak_path, real_path)
            if os.path.exists(temp_path):
                os.remove(temp_path)
            log.LogWarning(f"[AutoHeal] 替换文件失败: {e}")
            return False
    except Exception as e:
        log.LogWarning(f"[AutoHeal] 修复异常: {e}")
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


def get_or_create_group(client, col_name, folder_dir, scene_id, file_path, groups_map):
    """
    Process-safe, idempotent group lookup and creation.
    Guarantees no duplicate groups will ever be created.
    """
    col_key = col_name.strip().lower()
    group = groups_map.get(col_key) if groups_map is not None else None

    if group:
        if not group.get("front_image_path"):
            log.LogInfo(f"集合 【{col_name}】 暂无封面图，正在自动生成...")
            cover_data_uri = resolve_group_cover(folder_dir, col_name, scene_id, file_path)
            if cover_data_uri:
                client.update_group_cover(group["id"], cover_data_uri)
                group["front_image_path"] = "updated"
                log.LogInfo(f"成功为集合 【{col_name}】 设置封面图")
        return group

    # Synchronize creation with inter-process lock
    with AutoGroupLock():
        # Double check database directly under lock
        db_path = get_sqlite_path()
        existing = None
        if os.path.exists(db_path):
            try:
                conn = sqlite3.connect(db_path)
                c = conn.cursor()
                row = c.execute(
                    "SELECT id, name, front_image_blob FROM groups WHERE LOWER(TRIM(name)) = ? ORDER BY id ASC LIMIT 1",
                    (col_key,)
                ).fetchone()
                conn.close()
                if row:
                    existing = {
                        "id": str(row[0]),
                        "name": row[1],
                        "front_image_path": row[2]
                    }
            except Exception as e:
                log.LogDebug(f"SQLite check failed: {e}")

        if not existing:
            latest_groups = client.get_all_groups()
            if col_key in latest_groups:
                existing = latest_groups[col_key]

        if existing:
            group = existing
            if groups_map is not None:
                groups_map[col_key] = group
            if not group.get("front_image_path"):
                cover_data_uri = resolve_group_cover(folder_dir, col_name, scene_id, file_path)
                if cover_data_uri:
                    client.update_group_cover(group["id"], cover_data_uri)
                    group["front_image_path"] = "updated"
            return group

        # Truly does not exist anywhere -> create it
        log.LogInfo(f"创建新集合: 【{col_name}】")
        cover_data_uri = resolve_group_cover(folder_dir, col_name, scene_id, file_path)
        new_group = client.create_group(col_name, front_image=cover_data_uri)
        if new_group:
            group = new_group
            if groups_map is not None:
                groups_map[col_key] = group
            log.LogInfo(f"集合创建成功: 【{col_name}】(ID: {group['id']})")
            return group

    return None


def process_scene(scene, client, library_roots, groups_map, fix_scene_thumb=False):
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

    # 🎯 AutoHeal: 自动检测并修复伪装成 MP4 的 TS 直播流或损坏视频
    if heal_video_file(file_path):
        try:
            client.graphql(
                "mutation MetadataScan($input: ScanMetadataInput!) { metadataScan(input: $input) }",
                {"input": {"paths": [file_path], "rescan": True}}
            )
        except Exception as e:
            log.LogDebug(f"Trigger metadataScan after heal failed: {e}")

    is_subfolder, col_name, folder_dir = determine_collection_info(file_path, library_roots)
    if not is_subfolder or not col_name:
        return

    group = get_or_create_group(client, col_name, folder_dir, scene_id, file_path, groups_map)
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


def resolve_folder_cover(cur, fold_id, fold_path, col_dir, col_name):
    """
    为子文件夹自动寻找最佳封面图：
    1. 磁盘物理封面（poster/cover/folder/front/文件夹名/首张图片）
    2. 文件夹内的短片封面（SQLite 数据库中的 scene cover_blob）
    3. 文件夹内的图片（本地磁盘文件或 Stash 生成的缩略图 data/generated/thumbnails）
    4. 文件夹内的短片 ffmpeg 抽取清晰帧或生成的截图
    """
    # 1. 检查物理磁盘中的图片文件
    for d in (col_dir, fold_path):
        if d:
            cover = find_cover_image_on_disk(d, col_name)
            if cover:
                return cover

    # 2. 检查该文件夹（或其递归子文件夹）下是否已有短片并提取其封面
    try:
        scene_rows = cur.execute("""
            WITH RECURSIVE folder_tree(id, path) AS (
                SELECT id, path FROM folders WHERE id = ?
                UNION ALL
                SELECT f.id, f.path FROM folders f JOIN folder_tree ft ON f.parent_folder_id = ft.id
            )
            SELECT DISTINCT s.id, ft.path, fl.basename
            FROM folder_tree ft
            JOIN files fl ON fl.parent_folder_id = ft.id
            JOIN scenes_files sf ON sf.file_id = fl.id
            JOIN scenes s ON s.id = sf.scene_id
            LIMIT 5
        """, (fold_id,)).fetchall()
        for s_row in scene_rows:
            sid, fpath, fname = s_row
            cover = get_scene_cover_from_sqlite(sid)
            if cover:
                return cover
            vpath = os.path.join(fpath, fname) if fpath and fname else None
            if vpath and os.path.exists(vpath):
                cover = extract_frame_ffmpeg(vpath)
                if cover:
                    return cover
    except Exception as e:
        log.LogDebug(f"提取短片封面失败: {e}")

    # 3. 检查该文件夹（或其递归子文件夹）下是否包含图片
    try:
        img_rows = cur.execute("""
            WITH RECURSIVE folder_tree(id, path) AS (
                SELECT id, path FROM folders WHERE id = ?
                UNION ALL
                SELECT f.id, f.path FROM folders f JOIN folder_tree ft ON f.parent_folder_id = ft.id
            )
            SELECT DISTINCT fl.id, fl.basename, ft.path
            FROM folder_tree ft
            JOIN files fl ON fl.parent_folder_id = ft.id
            JOIN images_files ifl ON ifl.file_id = fl.id
            ORDER BY fl.basename ASC
        """, (fold_id,)).fetchall()

        if img_rows:
            best_fid = None
            best_bname = None
            best_fpath = None
            cover_patterns = [
                re.compile(r"^(poster|cover|folder|front)\.(jpe?g|png|webp)$", re.IGNORECASE),
                re.compile(rf"^{re.escape(col_name)}\.(jpe?g|png|webp)$", re.IGNORECASE),
                re.compile(r"^0*1\.(jpe?g|png|webp)$", re.IGNORECASE),
                re.compile(r".*(poster|cover|folder|front).*\.(jpe?g|png|webp)$", re.IGNORECASE),
            ]
            for pat in cover_patterns:
                for fid, bname, fpath in img_rows:
                    if pat.match(bname or ""):
                        best_fid = fid
                        best_bname = bname
                        best_fpath = fpath
                        break
                if best_fid:
                    break
            if not best_fid:
                best_fid = img_rows[0][0]
                best_bname = img_rows[0][1]
                best_fpath = img_rows[0][2]

            # 3a. 尝试从本地磁盘读取该图片
            for d in (best_fpath, col_dir, fold_path):
                if d and best_bname:
                    cand = os.path.join(resolve_real_path(d) or d, best_bname)
                    if os.path.exists(cand):
                        uri = file_to_data_uri(cand)
                        if uri:
                            return uri

            # 3b. 尝试从已生成的缩略图 (generated/thumbnails) 读取
            fp_row = cur.execute(
                "SELECT fingerprint FROM files_fingerprints WHERE file_id = ? AND type = 'md5'",
                (best_fid,)
            ).fetchone()
            if fp_row and fp_row[0]:
                md5 = fp_row[0]
                db_dir = os.path.dirname(get_sqlite_path())
                gen_dir = os.path.join(db_dir, "generated")
                if not os.path.exists(gen_dir):
                    gen_dir = os.path.abspath(os.path.join(os.getcwd(), "data", "generated"))
                thumb_candidates = [
                    os.path.join(gen_dir, "thumbnails", md5[:2], md5[2:4], f"{md5}_640.jpg"),
                    os.path.join(gen_dir, "thumbnails", md5[:2], md5[2:4], f"{md5}_1280.jpg"),
                    os.path.join(gen_dir, "thumbnails", md5[:2], md5[2:4], f"{md5}.jpg"),
                ]
                for tc in thumb_candidates:
                    if os.path.exists(tc):
                        uri = file_to_data_uri(tc)
                        if uri:
                            return uri
    except Exception as e:
        log.LogDebug(f"提取图片封面失败: {e}")

    # 4. 检查是否有生成的截图 (generated/screenshots)
    try:
        vid_rows = cur.execute("""
            WITH RECURSIVE folder_tree(id) AS (
                SELECT ?
                UNION ALL
                SELECT f.id FROM folders f JOIN folder_tree ft ON f.parent_folder_id = ft.id
            )
            SELECT DISTINCT fl.id
            FROM folder_tree ft
            JOIN files fl ON fl.parent_folder_id = ft.id
            JOIN scenes_files sf ON sf.file_id = fl.id
            LIMIT 1
        """, (fold_id,)).fetchall()
        for vrow in vid_rows:
            fp_row = cur.execute(
                "SELECT fingerprint FROM files_fingerprints WHERE file_id = ? AND type = 'oshash'",
                (vrow[0],)
            ).fetchone()
            if fp_row and fp_row[0]:
                oshash = fp_row[0]
                db_dir = os.path.dirname(get_sqlite_path())
                gen_dir = os.path.join(db_dir, "generated")
                if not os.path.exists(gen_dir):
                    gen_dir = os.path.abspath(os.path.join(os.getcwd(), "data", "generated"))
                ss_cand = os.path.join(gen_dir, "screenshots", f"{oshash}.jpg")
                if os.path.exists(ss_cand):
                    uri = file_to_data_uri(ss_cand)
                    if uri:
                        return uri
    except Exception as e:
        log.LogDebug(f"提取视频截图封面失败: {e}")

    return None


def sync_folder_collections(client, library_roots=None):
    """
    遍历媒体库中所有子文件夹，确保每个子文件夹都在系统中创建了对应的“集合”（Group/Collection）。
    无论是包含短片、包含图片、还是包含子目录，均根据子文件夹名称自动创建集合，
    设置封面图，并将该文件夹（及其子文件夹）内的所有短片全部关联到该集合中。
    """
    db_path = get_sqlite_path()
    if not os.path.exists(db_path):
        return

    if library_roots is None:
        library_roots = get_library_roots(client)

    log.LogInfo("开始根据媒体库子文件夹自动检查与补全“集合”...")

    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()

        # 查询所有子文件夹 (排除无上级目录的物理根目录)
        folders = cur.execute("""
            SELECT id, path, parent_folder_id, basename
            FROM folders
            WHERE parent_folder_id IS NOT NULL
        """).fetchall()

        if not folders:
            conn.close()
            return

        groups_map = client.get_all_groups()

        created_groups = 0
        updated_covers = 0
        linked_scenes_total = 0

        # 按文件夹逐个检查或创建集合
        for fold_id, fold_path, parent_id, basename in folders:
            if is_ignored_path(fold_path):
                continue

            norm_path = os.path.normcase(os.path.normpath(fold_path)) if fold_path else ""
            real_path = os.path.normcase(resolve_real_path(fold_path) or "")
            if norm_path in library_roots or real_path in library_roots:
                continue

            # 确定该文件夹所属的集合名称及目录
            dummy_file = os.path.join(fold_path, "media")
            is_sub, col_name, col_dir = determine_collection_info(dummy_file, library_roots)
            if not is_sub or not col_name:
                col_name = (basename or os.path.basename(fold_path) or "").strip()
                col_dir = fold_path

            if not col_name or is_ignored_path(col_name):
                continue

            col_key = col_name.strip().lower()

            # 1. 检查集合是否已经存在
            group = groups_map.get(col_key)
            if not group:
                # 检查 SQLite 中是否有该集合
                grow = cur.execute(
                    "SELECT id, name, front_image_blob FROM groups WHERE LOWER(TRIM(name)) = ? ORDER BY id ASC LIMIT 1",
                    (col_key,)
                ).fetchone()
                if grow:
                    group = {
                        "id": str(grow[0]),
                        "name": grow[1],
                        "front_image_path": grow[2]
                    }
                    groups_map[col_key] = group

            # 2. 如果不存在，则创建集合并设置封面
            if not group:
                with AutoGroupLock():
                    # 再次确认以防并发重复创建
                    grow = cur.execute(
                        "SELECT id, name, front_image_blob FROM groups WHERE LOWER(TRIM(name)) = ? ORDER BY id ASC LIMIT 1",
                        (col_key,)
                    ).fetchone()
                    if grow:
                        group = {
                            "id": str(grow[0]),
                            "name": grow[1],
                            "front_image_path": grow[2]
                        }
                    else:
                        cover_uri = resolve_folder_cover(cur, fold_id, fold_path, col_dir, col_name)
                        new_grp = None
                        try:
                            new_grp = client.create_group(col_name, front_image=cover_uri)
                        except Exception as ce:
                            log.LogWarning(f"通过 API 创建集合【{col_name}】失败: {ce}，尝试直接写入数据库...")
                            try:
                                now_str = time.strftime("%Y-%m-%d %H:%M:%S")
                                cur.execute(
                                    "INSERT INTO groups (name, created_at, updated_at) VALUES (?, ?, ?)",
                                    (col_name, now_str, now_str)
                                )
                                conn.commit()
                                gid = cur.lastrowid
                                new_grp = {"id": str(gid), "name": col_name, "front_image_path": None}
                                if cover_uri:
                                    try:
                                        if "," in cover_uri:
                                            raw_b64 = cover_uri.split(",", 1)[1]
                                            img_bytes = base64.b64decode(raw_b64)
                                            csum = hashlib.md5(img_bytes).hexdigest()
                                            cur.execute("INSERT OR REPLACE INTO blobs (checksum, blob) VALUES (?, ?)", (csum, img_bytes))
                                            cur.execute("UPDATE groups SET front_image_blob = ? WHERE id = ?", (csum, gid))
                                            conn.commit()
                                            new_grp["front_image_path"] = csum
                                    except Exception:
                                        pass
                            except Exception as dbe:
                                log.LogError(f"写入集合【{col_name}】到数据库失败: {dbe}")

                        if new_grp:
                            group = new_grp
                            created_groups += 1
                            log.LogInfo(f"根据子文件夹自动创建新集合: 【{col_name}】 (ID: #{group['id']})")

                    if group:
                        groups_map[col_key] = group

            if not group:
                continue

            group_id = int(group["id"])

            # 3. 如果集合存在但没有封面，补全封面
            if not group.get("front_image_path"):
                cover_uri = resolve_folder_cover(cur, fold_id, fold_path, col_dir, col_name)
                if cover_uri:
                    try:
                        client.update_group_cover(group_id, cover_uri)
                        group["front_image_path"] = "updated"
                        updated_covers += 1
                        log.LogInfo(f"为集合 【{col_name}】 补全设置封面图")
                    except Exception as e:
                        log.LogDebug(f"更新集合封面失败: {e}")

            # 4. 确保该子文件夹（及子目录）下的所有短片均与该集合关联
            scene_ids = cur.execute("""
                WITH RECURSIVE folder_tree(id) AS (
                    SELECT ?
                    UNION ALL
                    SELECT f.id FROM folders f JOIN folder_tree ft ON f.parent_folder_id = ft.id
                )
                SELECT DISTINCT sf.scene_id
                FROM folder_tree ft
                JOIN files fl ON fl.parent_folder_id = ft.id
                JOIN scenes_files sf ON sf.file_id = fl.id
            """, (fold_id,)).fetchall()

            for (s_id,) in scene_ids:
                linked = cur.execute(
                    "SELECT 1 FROM groups_scenes WHERE group_id = ? AND scene_id = ? LIMIT 1",
                    (group_id, s_id)
                ).fetchone()
                if not linked:
                    cur.execute(
                        "INSERT OR IGNORE INTO groups_scenes (group_id, scene_id, scene_index) VALUES (?, ?, NULL)",
                        (group_id, s_id)
                    )
                    linked_scenes_total += 1

        conn.commit()
        conn.close()

        if created_groups > 0 or updated_covers > 0 or linked_scenes_total > 0:
            log.LogInfo(f"子文件夹“集合”自动检查完成！新建集合: {created_groups} 个，补全封面: {updated_covers} 个，关联短片: {linked_scenes_total} 部。")
        else:
            log.LogDebug("所有子文件夹集合已处于最新状态，无需变更。")

    except Exception as e:
        log.LogWarning(f"自动创建与整理集合发生错误: {e}")


def sync_folder_galleries(client, library_roots=None):
    """
    遍历媒体库中所有包含图片的目录子文件夹，根据文件夹名称自动创建或更新“图库”（Galleries），
    设置图库标题为子文件夹名称，提取首图/海报作为图库封面，并将文件夹内所有图片全部归类到该图库中。
    同时如果该文件夹内存在短片（Scene），也会自动将图库与短片关联。
    """
    db_path = get_sqlite_path()
    if not os.path.exists(db_path):
        return

    if library_roots is None:
        library_roots = get_library_roots(client)

    log.LogInfo("开始根据媒体库图片子文件夹自动创建与整理“图库”...")

    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()

        # 查询所有包含图片的文件夹
        folders = cur.execute("""
            SELECT DISTINCT fold.id, fold.path, fold.parent_folder_id, fold.basename
            FROM folders fold
            JOIN files f ON f.parent_folder_id = fold.id
            JOIN images_files ifl ON ifl.file_id = f.id
        """).fetchall()

        if not folders:
            conn.close()
            log.LogInfo("未发现包含图片的文件夹")
            return

        created_galleries = 0
        updated_galleries = 0

        for fold_id, fold_path, parent_id, basename in folders:
            # 1. 忽略系统垃圾与缩略图目录（如 @eaDir, .thumbnails 等）
            if is_ignored_path(fold_path):
                continue

            # 2. 排除媒体库直属根目录（根目录下的散图不作为独立图库）
            if parent_id is None:
                continue

            norm_path = os.path.normcase(os.path.normpath(fold_path)) if fold_path else ""
            real_path = os.path.normcase(resolve_real_path(fold_path) or "")
            if norm_path in library_roots or real_path in library_roots:
                continue

            # 3. 提取图库名称（优先使用 basename，其次文件夹名）
            title = (basename or os.path.basename(fold_path) or "").strip()
            if not title or is_ignored_path(title):
                continue

            target_folder_id = fold_id

            # 4. 检查该文件夹是否已有图库
            grow = cur.execute("SELECT id, title FROM galleries WHERE folder_id = ?", (target_folder_id,)).fetchone()
            if grow:
                gallery_id = grow[0]
                curr_title = (grow[1] or "").strip()
                if not curr_title and title:
                    cur.execute("UPDATE galleries SET title = ?, updated_at = datetime('now') WHERE id = ?", (title, gallery_id))
                    updated_galleries += 1
                    log.LogInfo(f"更新图库 #{gallery_id} 标题为 【{title}】")
            else:
                now_str = time.strftime("%Y-%m-%d %H:%M:%S")
                cur.execute(
                    "INSERT INTO galleries (folder_id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                    (target_folder_id, title, now_str, now_str)
                )
                gallery_id = cur.lastrowid
                created_galleries += 1
                log.LogInfo(f"根据子文件夹自动创建新图库: 【{title}】 (ID: #{gallery_id})")

            # 5. 将该文件夹内的所有图片关联到图库中
            img_rows = cur.execute("""
                SELECT DISTINCT i.id, f.basename
                FROM images i
                JOIN images_files ifl ON ifl.image_id = i.id
                JOIN files f ON ifl.file_id = f.id
                WHERE f.parent_folder_id = ?
                ORDER BY f.basename ASC
            """, (fold_id,)).fetchall()

            if not img_rows:
                continue

            existing_img_ids = set(
                r[0] for r in cur.execute("SELECT image_id FROM galleries_images WHERE gallery_id = ?", (gallery_id,)).fetchall()
            )

            cover_row = cur.execute(
                "SELECT image_id FROM galleries_images WHERE gallery_id = ? AND cover = 1 LIMIT 1", (gallery_id,)
            ).fetchone()
            has_cover = cover_row is not None

            # 寻找最佳封面图（优先 poster / cover / 0001 / 第一张图）
            best_cover_img_id = None
            cover_patterns = [
                re.compile(r"^(poster|cover|folder|front)\.(jpe?g|png|webp)$", re.IGNORECASE),
                re.compile(rf"^{re.escape(title)}\.(jpe?g|png|webp)$", re.IGNORECASE),
                re.compile(r"^0*1\.(jpe?g|png|webp)$", re.IGNORECASE),
                re.compile(r".*(poster|cover|folder|front).*\.(jpe?g|png|webp)$", re.IGNORECASE),
            ]
            for pat in cover_patterns:
                for img_id, bname in img_rows:
                    if pat.match(bname or ""):
                        best_cover_img_id = img_id
                        break
                if best_cover_img_id:
                    break
            if not best_cover_img_id and img_rows:
                best_cover_img_id = img_rows[0][0]

            for img_id, bname in img_rows:
                if img_id not in existing_img_ids:
                    is_cover = 1 if (not has_cover and img_id == best_cover_img_id) else 0
                    if is_cover:
                        has_cover = True
                    cur.execute(
                        "INSERT OR IGNORE INTO galleries_images (gallery_id, image_id, cover) VALUES (?, ?, ?)",
                        (gallery_id, img_id, is_cover)
                    )

            if not has_cover and best_cover_img_id:
                cur.execute(
                    "UPDATE galleries_images SET cover = 1 WHERE gallery_id = ? AND image_id = ?",
                    (gallery_id, best_cover_img_id)
                )
                has_cover = True
                log.LogInfo(f"为图库 【{title}】 设置封面图 (Image ID #{best_cover_img_id})")

            # 6. 同文件夹若有短片，自动关联短片与图库
            scene_rows = cur.execute("""
                SELECT DISTINCT s.id
                FROM scenes s
                JOIN scenes_files sf ON sf.scene_id = s.id
                JOIN files f ON sf.file_id = f.id
                WHERE f.parent_folder_id = ?
            """, (fold_id,)).fetchall()
            for s_id, in scene_rows:
                cur.execute(
                    "INSERT OR IGNORE INTO scenes_galleries (scene_id, gallery_id) VALUES (?, ?)",
                    (s_id, gallery_id)
                )

        conn.commit()
        conn.close()

        log.LogInfo(f"子文件夹“图库”自动整理完成！新建图库: {created_galleries} 个，更新/补全: {updated_galleries} 个。")
    except Exception as e:
        log.LogWarning(f"自动创建与整理图库发生错误: {e}")


def run_full(client):
    log.LogInfo("开始根据媒体库子文件夹自动整理集合与图库封面...")
    # First: Clean up any duplicate groups
    with AutoGroupLock():
        cleanup_duplicate_groups(client)

    library_roots = get_library_roots(client)
    log.LogDebug(f"媒体库根目录: {library_roots}")

    # 1. 首先遍历媒体库所有子文件夹，确保每个子文件夹都创建集合并关联短片
    sync_folder_collections(client, library_roots)

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
            log.LogProgress(((i + 1) / max(1, total)) * 0.7)

    # 2. 自动处理图片文件夹与图库
    sync_folder_galleries(client, library_roots)
    log.LogProgress(1.0)

    log.LogInfo("根据子文件夹自动创建集合与图库完成！")


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


def run_heal_videos(client):
    log.LogInfo("开始全媒体库视频格式与时间戳自愈检测（修复伪装 TS 与卡顿视频）...")
    scenes = client.get_all_scenes()
    total = len(scenes)
    fixed = 0
    paths_to_rescan = []
    for i, scene in enumerate(scenes):
        files = scene.get("files", [])
        if files:
            fpath = files[0].get("path")
            if fpath and heal_video_file(fpath):
                fixed += 1
                paths_to_rescan.append(fpath)
        if (i + 1) % 5 == 0 or i == total - 1:
            log.LogProgress((i + 1) / max(1, total))

    if paths_to_rescan:
        log.LogInfo(f"正在更新已修复的 {len(paths_to_rescan)} 个视频元数据...")
        try:
            client.graphql(
                "mutation MetadataScan($input: ScanMetadataInput!) { metadataScan(input: $input) }",
                {"input": {"paths": paths_to_rescan, "rescan": True}}
            )
        except Exception as e:
            log.LogDebug(f"Trigger batch metadataScan failed: {e}")

    log.LogInfo(f"全媒体库视频自愈检测完成！共自动修复了 {fixed} 个卡顿/伪装视频。")


def get_scene_from_sqlite(scene_id):
    db_path = get_sqlite_path()
    if not os.path.exists(db_path):
        return None
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cur = conn.cursor()
        row = cur.execute("""
            SELECT s.id, s.title, f.id, f.path, f.basename
            FROM scenes s
            JOIN scenes_files sf ON sf.scene_id = s.id
            JOIN files f ON f.id = sf.file_id
            WHERE s.id = ?
            ORDER BY sf.file_id ASC LIMIT 1
        """, (scene_id,)).fetchone()
        if not row:
            conn.close()
            return None
        sid, title, fid, fpath, fbasename = row
        g_rows = cur.execute("""
            SELECT sg.group_id, g.name, sg.scene_index
            FROM scenes_groups sg
            JOIN groups g ON g.id = sg.group_id
            WHERE sg.scene_id = ?
        """, (scene_id,)).fetchall()
        groups = [{"group": {"id": str(gid), "name": gname}, "scene_index": sidx} for gid, gname, sidx in g_rows]
        conn.close()
        return {
            "id": str(sid),
            "title": title or "",
            "files": [{"id": str(fid), "path": fpath, "basename": fbasename}],
            "groups": groups,
            "paths": {}
        }
    except Exception as e:
        log.LogDebug(f"get_scene_from_sqlite failed: {e}")
        return None


def run_hook(client, hook_context):
    scene_id = hook_context.get("id")
    if not scene_id:
        return
    log.LogInfo(f"检测到新短片创建或更新 (ID: {scene_id})，正在执行子文件夹归类...")
    library_roots = get_library_roots(client)
    groups_map = client.get_all_groups()

    scene = client.get_scene(scene_id)
    if not scene or not scene.get("files"):
        scene = get_scene_from_sqlite(scene_id)

    if scene:
        process_scene(scene, client, library_roots, groups_map, fix_scene_thumb=False)
        log.LogInfo(f"短片 #{scene_id} 集合归类处理完成")
    else:
        log.LogWarning(f"未能获取到短片 #{scene_id} 的信息，无法进行子文件夹归类")

    # 触发子文件夹集合全量同步，确保新子文件夹合集不被漏掉
    sync_folder_collections(client, library_roots)


def run_image_hook(client, hook_context):
    image_id = hook_context.get("id") if hook_context else None
    log.LogInfo(f"检测到新图片创建或更新 (ID: {image_id})，正在执行集合与图库归类...")
    library_roots = get_library_roots(client)
    sync_folder_collections(client, library_roots)
    sync_folder_galleries(client, library_roots)
    if image_id:
        log.LogInfo(f"图片 #{image_id} 集合与图库归类处理完成")


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
        if mode == "heal_videos":
            run_heal_videos(client)
        elif mode == "fix_thumbnails":
            run_fix_thumbnails(client)
        elif mode == "image_hook" or (hook_context and hook_context.get("type") == "image"):
            run_image_hook(client, hook_context)
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
