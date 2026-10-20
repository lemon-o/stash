import sys
import os
import json
import gzip
import time

try:
    import sqlite3
except ImportError:
    sqlite3 = None

def parse_database_from_config(config_path):
    if not config_path or not os.path.isfile(config_path):
        return None
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("database:"):
                    val = line.split(":", 1)[1].strip().strip("\"'")
                    if val:
                        if not os.path.isabs(val):
                            val = os.path.normpath(os.path.join(os.path.dirname(config_path), val))
                        return val
    except Exception:
        pass
    return None

def get_paths(plugin_input):
    plugin_dir = os.path.dirname(os.path.abspath(__file__))

    # 1. Check server_connection from Stash stdin (Highest Priority!)
    server_conn = plugin_input.get("server_connection", {})
    server_dir = ""
    if isinstance(server_conn, dict):
        server_dir = server_conn.get("Dir") or server_conn.get("dir") or ""

    # 2. Check STASH_CONFIG_FILE environment variable
    env_config = os.environ.get("STASH_CONFIG_FILE", "")
    env_dir = os.path.dirname(os.path.abspath(env_config)) if env_config else ""

    primary_candidates = []
    if server_dir and os.path.isdir(server_dir):
        primary_candidates.append(os.path.abspath(server_dir))
    if env_dir and os.path.isdir(env_dir):
        p = os.path.abspath(env_dir)
        if p not in primary_candidates:
            primary_candidates.append(p)

    # Candidate: /root/.stash (Standard Docker Stash config & DB directory)
    if os.path.isdir("/root/.stash"):
        p = os.path.abspath("/root/.stash")
        if p not in primary_candidates:
            primary_candidates.append(p)

    db_path = None
    data_dir = None

    # Step 1: If primary directory (server_dir / env_dir / /root/.stash) is known,
    # look for config.yml or stash-go.sqlite ONLY in primary candidates first!
    for p_dir in primary_candidates:
        cfg = os.path.join(p_dir, "config.yml")
        if os.path.isfile(cfg):
            pdb = parse_database_from_config(cfg)
            if pdb and os.path.isfile(pdb):
                db_path = pdb
                data_dir = p_dir
                break
        cand_db = os.path.join(p_dir, "stash-go.sqlite")
        if os.path.isfile(cand_db):
            db_path = cand_db
            data_dir = p_dir
            break
        cand_sub_db = os.path.join(p_dir, "data", "stash-go.sqlite")
        if os.path.isfile(cand_sub_db):
            db_path = cand_sub_db
            data_dir = os.path.join(p_dir, "data")
            break

    # If primary candidate was found but no DB file exists yet, anchor it to primary candidate!
    if not db_path and primary_candidates:
        data_dir = primary_candidates[0]
        db_path = os.path.join(data_dir, "stash-go.sqlite")

    # Step 2: Fallback to searching upward and cwd only if no primary candidate exists!
    if not db_path:
        fallback_candidates = []
        cur = plugin_dir
        for _ in range(6):
            if cur not in fallback_candidates and os.path.isdir(cur):
                fallback_candidates.append(cur)
                data_sub = os.path.join(cur, "data")
                if os.path.isdir(data_sub) and data_sub not in fallback_candidates:
                    fallback_candidates.append(data_sub)
            parent = os.path.dirname(cur)
            if parent == cur:
                break
            cur = parent

        cwd_data = os.path.abspath(os.path.join(os.getcwd(), "data"))
        if os.path.isdir(cwd_data) and cwd_data not in fallback_candidates:
            fallback_candidates.append(cwd_data)
        cwd = os.path.abspath(os.getcwd())
        if os.path.isdir(cwd) and cwd not in fallback_candidates:
            fallback_candidates.append(cwd)

        for c in fallback_candidates:
            cfg = os.path.join(c, "config.yml")
            if os.path.isfile(cfg):
                pdb = parse_database_from_config(cfg)
                if pdb and os.path.isfile(pdb):
                    db_path = pdb
                    data_dir = c
                    break
            cand_db = os.path.join(c, "stash-go.sqlite")
            if os.path.isfile(cand_db):
                db_path = cand_db
                data_dir = c
                break
            cand_sub_db = os.path.join(c, "data", "stash-go.sqlite")
            if os.path.isfile(cand_sub_db):
                db_path = cand_sub_db
                data_dir = os.path.join(c, "data")
                break

        if not db_path:
            data_dir = fallback_candidates[0] if fallback_candidates else plugin_dir
            db_path = os.path.join(data_dir, "stash-go.sqlite")

    if not data_dir:
        data_dir = os.path.dirname(os.path.abspath(db_path))

    users_file = os.path.join(data_dir, "users.json")

    # Extra asset paths (if they exist in the environment)
    extra_asset_files = []
    for base in [os.path.join(plugin_dir, "..", "..", ".."), os.getcwd(), "/stash"]:
        b_assets = os.path.join(os.path.abspath(base), "ui", "v2.5", "build", "assets", "users.json")
        p_assets = os.path.join(os.path.abspath(base), "ui", "v2.5", "public", "assets", "users.json")
        for af in [b_assets, p_assets]:
            af_dir = os.path.dirname(af)
            if os.path.isdir(af_dir) and af not in extra_asset_files and af != users_file:
                extra_asset_files.append(af)

    return db_path, data_dir, users_file, extra_asset_files

def get_db_connection(db_path):
    if not sqlite3:
        return None
    if not db_path:
        return None
    try:
        if not os.path.exists(db_path):
            parent = os.path.dirname(db_path)
            if not parent or not os.path.exists(parent):
                return None
        conn = sqlite3.connect(db_path, timeout=15.0)
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
        except Exception:
            pass
        try:
            # Disable foreign keys on this connection to ensure users_scenes_activity
            # updates never fail due to cascade/foreign key constraints in multi-user mode
            conn.execute("PRAGMA foreign_keys = OFF;")
        except Exception:
            pass
        return conn
    except Exception as e:
        sys.stderr.write(f"SQLite connection notice ({db_path}): {e}\n")
        return None

def init_db_schema(conn):
    if not conn:
        return
    try:
        conn.execute("PRAGMA foreign_keys = OFF;")
        c = conn.cursor()
        c.execute("""
        CREATE TABLE IF NOT EXISTS `users` (
          `id` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          `username` VARCHAR(255) NOT NULL UNIQUE,
          `password_hash` VARCHAR(255) NOT NULL,
          `is_admin` BOOLEAN NOT NULL DEFAULT 0,
          `created_at` DATETIME NOT NULL
        )
        """)
        c.execute("""
        CREATE TABLE IF NOT EXISTS `users_scenes_activity` (
          `user_id` INTEGER NOT NULL,
          `scene_id` INTEGER NOT NULL,
          `resume_time` REAL NOT NULL DEFAULT 0,
          `play_duration` REAL NOT NULL DEFAULT 0,
          `play_count` INTEGER NOT NULL DEFAULT 0,
          `last_played_at` INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (`user_id`, `scene_id`)
        )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS `idx_users_scenes_activity_user` ON `users_scenes_activity`(`user_id`, `last_played_at` DESC);")
        # Ensure default admin user 1 exists so foreign key references never fail
        c.execute("INSERT OR IGNORE INTO users (id, username, password_hash, is_admin, created_at) VALUES (1, 'admin', '', 1, CURRENT_TIMESTAMP)")
        conn.commit()
    except Exception as e:
        sys.stderr.write(f"init_db_schema notice: {e}\n")

def get_user_activity_file(data_dir, uid):
    act_dir = os.path.join(data_dir, "activity")
    try:
        os.makedirs(act_dir, exist_ok=True)
    except Exception:
        pass
    return os.path.join(act_dir, f"activity_{uid}.json")

def read_user_activity_file(data_dir, uid):
    fpath = get_user_activity_file(data_dir, uid)
    if os.path.isfile(fpath):
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                d = json.load(f)
                if isinstance(d, dict):
                    return d
        except Exception:
            pass
    return {}

def write_user_activity_file(data_dir, uid, activity_map):
    fpath = get_user_activity_file(data_dir, uid)
    try:
        os.makedirs(os.path.dirname(fpath), exist_ok=True)
        # Directly write to file to prevent atomic rename issues across filesystem mounts
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(activity_map, f, ensure_ascii=False, indent=2)
    except Exception as e:
        sys.stderr.write(f"write_user_activity_file notice: {e}\n")

def main():
    plugin_input = {}
    if not sys.stdin.isatty():
        try:
            raw_bytes = sys.stdin.buffer.read()
            raw = raw_bytes.decode("utf-8", errors="replace")
            if raw.strip():
                plugin_input = json.loads(raw)
        except Exception as e:
            sys.stderr.write(f"Failed to read input: {e}\n")

    args = plugin_input.get("args", {})
    action = args.get("action", "sync")
    users = args.get("users", [])

    db_path, data_dir, users_file, extra_asset_files = get_paths(plugin_input)
    os.makedirs(data_dir, exist_ok=True)

    existing_token = ""
    existing_users = []
    if os.path.exists(users_file):
        try:
            with open(users_file, "r", encoding="utf-8") as f:
                d = json.load(f)
                existing_token = d.get("master_token", "")
                existing_users = d.get("users", [])
        except Exception:
            pass

    # Ensure database schema is ready if DB exists
    conn = get_db_connection(db_path)
    if conn:
        try:
            init_db_schema(conn)
        finally:
            conn.close()

    if action == "save_master_token":
        new_token = args.get("token", "")
        admin_hash = args.get("admin_hash", "")
        if new_token:
            existing_token = new_token
        if admin_hash:
            for u in existing_users:
                if u.get("is_admin") or u.get("id") == 1 or u.get("username", "").lower() == "lemon":
                    u["password_hash"] = admin_hash

        payload = {
            "master_token": existing_token,
            "users": existing_users
        }
        data_bytes = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        all_targets = [users_file] + extra_asset_files
        for p in all_targets:
            try:
                os.makedirs(os.path.dirname(p), exist_ok=True)
                with open(p, "wb") as f:
                    f.write(data_bytes)
            except Exception:
                pass

        print(json.dumps({"output": {"status": "ok", "action": "save_master_token"}}))
        return

    if action == "save_users" and isinstance(users, list):
        payload = {
            "master_token": existing_token,
            "users": users
        }
        data_bytes = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        all_targets = [users_file] + extra_asset_files
        for p in all_targets:
            try:
                os.makedirs(os.path.dirname(p), exist_ok=True)
                with open(p, "wb") as f:
                    f.write(data_bytes)
            except Exception:
                pass

        # Authoritative synchronization to SQLite
        conn = get_db_connection(db_path)
        if conn:
            try:
                conn.execute("PRAGMA foreign_keys = OFF;")
                c = conn.cursor()
                init_db_schema(conn)
                valid_ids = [int(u["id"]) for u in users if "id" in u and u.get("id") is not None]
                if valid_ids:
                    placeholders = ",".join("?" for _ in valid_ids)
                    c.execute(f"DELETE FROM users WHERE id NOT IN ({placeholders})", valid_ids)
                    c.execute(f"DELETE FROM users_scenes_activity WHERE user_id NOT IN ({placeholders})", valid_ids)
                for u in users:
                    uid = u.get("id")
                    uname = u.get("username")
                    phash = u.get("password_hash", "")
                    is_adm = 1 if u.get("is_admin") else 0
                    c.execute("""
                    INSERT INTO users (id, username, password_hash, is_admin, created_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(id) DO UPDATE SET
                        username=excluded.username,
                        password_hash=CASE WHEN excluded.password_hash != '' THEN excluded.password_hash ELSE users.password_hash END,
                        is_admin=excluded.is_admin
                    """, (uid, uname, phash, is_adm))
                conn.commit()
            except Exception as e:
                sys.stderr.write(f"SQLite save_users notice: {e}\n")
            finally:
                conn.close()

        print(json.dumps({"output": {"status": "ok", "count": len(users)}}))
        return

    if action == "save_activity":
        uid = args.get("user_id")
        uname = args.get("username", "")
        if not uid and uname:
            for u in existing_users:
                if u.get("username", "").lower() == uname.lower():
                    uid = u.get("id")
                    break
        if not uid:
            uid = 1

        scene_id = int(args.get("scene_id", 0))
        if scene_id <= 0:
            print(json.dumps({"output": {"status": "error", "message": "invalid scene_id"}}))
            return

        has_resume_time = "resume_time" in args and args["resume_time"] is not None
        req_resume_time = float(args["resume_time"]) if has_resume_time else 0.0
        play_duration = float(args.get("play_duration", 0.0))
        play_count_inc = int(args.get("play_count_inc", 0))
        reset = bool(args.get("reset", False))

        now_ms = int(time.time() * 1000)

        # Read existing record from server file
        current_file_acts = read_user_activity_file(data_dir, uid)
        cur_act = current_file_acts.get(str(scene_id), {})

        prev_resume = float(cur_act.get("resume_time", 0.0))
        prev_dur = float(cur_act.get("play_duration", 0.0))
        prev_cnt = int(cur_act.get("play_count", 0))

        if reset:
            updated_act = {
                "scene_id": scene_id,
                "resume_time": 0.0,
                "play_duration": 0.0,
                "play_count": 0,
                "last_played_at": now_ms
            }
        else:
            eff_resume = req_resume_time if (has_resume_time and req_resume_time >= 2.0) else prev_resume
            updated_act = {
                "scene_id": scene_id,
                "resume_time": eff_resume,
                "play_duration": prev_dur + play_duration,
                "play_count": prev_cnt + play_count_inc,
                "last_played_at": now_ms
            }

        # 1. Authoritative write to SQLite users_scenes_activity (if available)
        conn = get_db_connection(db_path)
        if conn:
            try:
                conn.execute("PRAGMA foreign_keys = OFF;")
                c = conn.cursor()
                init_db_schema(conn)

                # Ensure user exists in users table
                c.execute("""
                INSERT OR IGNORE INTO users (id, username, password_hash, is_admin, created_at)
                VALUES (?, ?, '', ?, CURRENT_TIMESTAMP)
                """, (uid, uname or f"user_{uid}", 1 if uid == 1 else 0))

                if reset:
                    c.execute("""
                    INSERT INTO users_scenes_activity (user_id, scene_id, resume_time, play_duration, play_count, last_played_at)
                    VALUES (?, ?, 0, 0, 0, ?)
                    ON CONFLICT(user_id, scene_id) DO UPDATE SET
                        resume_time = 0,
                        play_duration = 0,
                        play_count = 0,
                        last_played_at = excluded.last_played_at
                    """, (uid, scene_id, now_ms))
                    updated_act = {
                        "scene_id": scene_id,
                        "resume_time": 0.0,
                        "play_duration": 0.0,
                        "play_count": 0,
                        "last_played_at": now_ms
                    }
                else:
                    c.execute("""
                    INSERT INTO users_scenes_activity (user_id, scene_id, resume_time, play_duration, play_count, last_played_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, scene_id) DO UPDATE SET
                        resume_time = CASE
                            WHEN excluded.resume_time >= 2.0 THEN excluded.resume_time
                            ELSE users_scenes_activity.resume_time
                        END,
                        play_duration = users_scenes_activity.play_duration + excluded.play_duration,
                        play_count = users_scenes_activity.play_count + excluded.play_count,
                        last_played_at = excluded.last_played_at
                    """, (uid, scene_id, req_resume_time, play_duration, play_count_inc, now_ms))

                    c.execute("SELECT resume_time, play_duration, play_count, last_played_at FROM users_scenes_activity WHERE user_id = ? AND scene_id = ?", (uid, scene_id))
                    row = c.fetchone()
                    if row:
                        updated_act = {
                            "scene_id": scene_id,
                            "resume_time": float(row[0]),
                            "play_duration": float(row[1]),
                            "play_count": int(row[2]),
                            "last_played_at": int(row[3])
                        }

                # If admin user (uid == 1), keep Stash core scenes.resume_time synchronized
                if uid == 1:
                    try:
                        if reset:
                            c.execute("UPDATE scenes SET resume_time = 0 WHERE id = ?", (scene_id,))
                        elif req_resume_time > 0:
                            c.execute("UPDATE scenes SET resume_time = ? WHERE id = ?", (req_resume_time, scene_id))
                    except Exception:
                        pass

                conn.commit()
            except Exception as e:
                sys.stderr.write(f"SQLite save_activity notice: {e}\n")
            finally:
                conn.close()

        # 2. Dual-persistence: ALWAYS write to server JSON file
        current_file_acts[str(scene_id)] = updated_act
        write_user_activity_file(data_dir, uid, current_file_acts)

        print(json.dumps({"output": {"status": "ok", "user_id": uid, "scene_id": scene_id, "activity": updated_act}}))
        return

    if action == "reset_activity":
        uid = args.get("user_id") or 1
        scene_id = int(args.get("scene_id", 0))
        now_ms = int(time.time() * 1000)

        # 1. Update SQLite
        conn = get_db_connection(db_path)
        if conn and scene_id > 0:
            try:
                conn.execute("PRAGMA foreign_keys = OFF;")
                c = conn.cursor()
                init_db_schema(conn)
                c.execute("""
                INSERT INTO users_scenes_activity (user_id, scene_id, resume_time, play_duration, play_count, last_played_at)
                VALUES (?, ?, 0, 0, 0, ?)
                ON CONFLICT(user_id, scene_id) DO UPDATE SET
                    resume_time = 0,
                    play_duration = 0,
                    play_count = 0,
                    last_played_at = excluded.last_played_at
                """, (uid, scene_id, now_ms))
                if uid == 1:
                    try:
                        c.execute("UPDATE scenes SET resume_time = 0 WHERE id = ?", (scene_id,))
                    except Exception:
                        pass
                conn.commit()
            except Exception as e:
                sys.stderr.write(f"SQLite reset_activity notice: {e}\n")
            finally:
                conn.close()

        # 2. Update server JSON file
        file_acts = read_user_activity_file(data_dir, uid)
        sid_str = str(scene_id)
        if sid_str in file_acts:
            file_acts[sid_str]["resume_time"] = 0.0
            file_acts[sid_str]["play_duration"] = 0.0
            file_acts[sid_str]["play_count"] = 0
            file_acts[sid_str]["last_played_at"] = now_ms
            write_user_activity_file(data_dir, uid, file_acts)

        print(json.dumps({"output": {"status": "ok", "user_id": uid, "scene_id": scene_id}}))
        return

    if action == "get_activity":
        uid = args.get("user_id")
        uname = args.get("username", "")
        if not uid and uname:
            for u in existing_users:
                if u.get("username", "").lower() == uname.lower():
                    uid = u.get("id")
                    break
        if not uid:
            uid = 1

        user_acts = {}
        valid_scene_ids = set()

        # 1. Authoritative fetch from SQLite users_scenes_activity
        conn = get_db_connection(db_path)
        if conn:
            try:
                conn.execute("PRAGMA foreign_keys = OFF;")
                c = conn.cursor()
                init_db_schema(conn)

                # Fetch all existing scene IDs in database to filter out any orphans
                try:
                    c.execute("SELECT id FROM scenes")
                    valid_scene_ids = {str(r[0]) for r in c.fetchall()}
                    # Clean up any orphaned records
                    c.execute("DELETE FROM users_scenes_activity WHERE scene_id NOT IN (SELECT id FROM scenes)")
                    conn.commit()
                except Exception:
                    pass

                c.execute("""
                SELECT users_scenes_activity.scene_id, users_scenes_activity.resume_time, users_scenes_activity.play_duration, users_scenes_activity.play_count, users_scenes_activity.last_played_at
                FROM users_scenes_activity
                INNER JOIN scenes ON scenes.id = users_scenes_activity.scene_id
                WHERE users_scenes_activity.user_id = ?
                ORDER BY users_scenes_activity.last_played_at DESC
                """, (uid,))
                rows = c.fetchall()

                # One-time migration for admin user from legacy scenes table if table is completely empty
                if not rows and uid == 1:
                    try:
                        c.execute("SELECT id, resume_time FROM scenes WHERE resume_time > 0")
                        legacy_scenes = c.fetchall()
                        now_ts = int(time.time() * 1000)
                        for s_row in legacy_scenes:
                            c.execute("""
                            INSERT INTO users_scenes_activity (user_id, scene_id, resume_time, play_duration, play_count, last_played_at)
                            VALUES (1, ?, ?, 0.0, 1, ?)
                            ON CONFLICT(user_id, scene_id) DO UPDATE SET
                                resume_time = excluded.resume_time
                            """, (s_row[0], float(s_row[1]), now_ts))
                        conn.commit()
                        c.execute("""
                        SELECT users_scenes_activity.scene_id, users_scenes_activity.resume_time, users_scenes_activity.play_duration, users_scenes_activity.play_count, users_scenes_activity.last_played_at
                        FROM users_scenes_activity
                        INNER JOIN scenes ON scenes.id = users_scenes_activity.scene_id
                        WHERE users_scenes_activity.user_id = 1
                        ORDER BY users_scenes_activity.last_played_at DESC
                        """)
                        rows = c.fetchall()
                    except Exception as me:
                        sys.stderr.write(f"Migration notice: {me}\n")

                for row in rows:
                    sid = row[0]
                    sid_str = str(sid)
                    user_acts[sid_str] = {
                        "scene_id": sid,
                        "resume_time": float(row[1]),
                        "play_duration": float(row[2]),
                        "play_count": int(row[3]),
                        "last_played_at": int(row[4]) if str(row[4]).isdigit() else int(time.time() * 1000)
                    }

            except Exception as e:
                sys.stderr.write(f"SQLite get_activity notice: {e}\n")
            finally:
                conn.close()

        # 2. Dual-persistence: Read from server JSON file and merge only existing scenes
        file_acts = read_user_activity_file(data_dir, uid)
        for sid_str, f_item in file_acts.items():
            if valid_scene_ids and sid_str not in valid_scene_ids:
                continue
            if sid_str not in user_acts:
                user_acts[sid_str] = f_item
            else:
                u_item = user_acts[sid_str]
                if f_item.get("last_played_at", 0) > u_item.get("last_played_at", 0):
                    user_acts[sid_str] = f_item

        # 3. Bidirectional self-healing: if file had records missing in SQLite, sync them to SQLite
        if file_acts and db_path:
            sync_conn = get_db_connection(db_path)
            if sync_conn:
                try:
                    sync_conn.execute("PRAGMA foreign_keys = OFF;")
                    sc = sync_conn.cursor()
                    for sid_str, act_data in file_acts.items():
                        sc.execute("""
                        INSERT INTO users_scenes_activity (user_id, scene_id, resume_time, play_duration, play_count, last_played_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(user_id, scene_id) DO UPDATE SET
                            resume_time = MAX(users_scenes_activity.resume_time, excluded.resume_time),
                            play_duration = MAX(users_scenes_activity.play_duration, excluded.play_duration),
                            play_count = MAX(users_scenes_activity.play_count, excluded.play_count),
                            last_played_at = MAX(users_scenes_activity.last_played_at, excluded.last_played_at)
                        """, (uid, int(sid_str), float(act_data.get("resume_time", 0.0)), float(act_data.get("play_duration", 0.0)), int(act_data.get("play_count", 0)), int(act_data.get("last_played_at", 0))))
                    sync_conn.commit()
                except Exception:
                    pass
                finally:
                    sync_conn.close()

        # 4. Build sorted continue_watching and history lists from merged user_acts
        sorted_acts = sorted(
            user_acts.values(),
            key=lambda x: x.get("last_played_at", 0),
            reverse=True
        )

        cw_list = [a for a in sorted_acts if float(a.get("resume_time", 0.0)) > 0]
        hist_list = [a for a in sorted_acts if (float(a.get("play_duration", 0.0)) > 0 or int(a.get("play_count", 0)) > 0 or float(a.get("resume_time", 0.0)) > 0)]

        print(json.dumps({
            "output": {
                "status": "ok",
                "user_id": uid,
                "activity": user_acts,
                "continue_watching": cw_list,
                "history": hist_list
            }
        }))
        return

    # Default action: read existing users from SQLite / users.json
    current_users = []
    conn = get_db_connection(db_path)
    if conn:
        try:
            conn.execute("PRAGMA foreign_keys = OFF;")
            c = conn.cursor()
            init_db_schema(conn)
            c.execute("SELECT id, username, password_hash, is_admin, created_at FROM users ORDER BY id ASC")
            db_rows = c.fetchall()
            for r in db_rows:
                current_users.append({
                    "id": r[0],
                    "username": r[1],
                    "password_hash": r[2],
                    "is_admin": bool(r[3]),
                    "created_at": str(r[4])
                })
        except Exception:
            pass
        finally:
            conn.close()

    if not current_users and os.path.exists(users_file):
        try:
            with open(users_file, "r", encoding="utf-8") as f:
                d = json.load(f)
                current_users = d.get("users", [])
        except Exception:
            pass

    print(json.dumps({"output": {"status": "ok", "users": current_users}}))

if __name__ == "__main__":
    main()
