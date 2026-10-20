import sys
import os
import json
import gzip
import sqlite3
import time

def get_paths(plugin_input):
    plugin_dir = os.path.dirname(os.path.abspath(__file__))

    # 1. Check server_connection from Stash stdin
    server_conn = plugin_input.get("server_connection", {})
    server_dir = ""
    if isinstance(server_conn, dict):
        server_dir = server_conn.get("Dir") or server_conn.get("dir") or ""

    # 2. Check STASH_CONFIG_FILE environment variable
    env_config = os.environ.get("STASH_CONFIG_FILE", "")
    env_dir = os.path.dirname(os.path.abspath(env_config)) if env_config else ""

    candidates = []
    if server_dir and os.path.isdir(server_dir):
        candidates.append(os.path.abspath(server_dir))
    if env_dir and os.path.isdir(env_dir):
        candidates.append(os.path.abspath(env_dir))

    # Candidate: ../.. from plugin_dir (e.g. /root/.stash/plugins/multi_user -> /root/.stash)
    p_parent = os.path.abspath(os.path.join(plugin_dir, "..", ".."))
    if os.path.isdir(p_parent):
        candidates.append(p_parent)

    # Candidate: ../../../data (e.g. repo/data/plugins/multi_user -> repo/data)
    repo_data = os.path.abspath(os.path.join(plugin_dir, "..", "..", "..", "data"))
    if os.path.isdir(repo_data):
        candidates.append(repo_data)

    # Candidate: repo/data (from current working directory)
    cwd_data = os.path.abspath(os.path.join(os.getcwd(), "data"))
    if os.path.isdir(cwd_data):
        candidates.append(cwd_data)

    cwd = os.path.abspath(os.getcwd())
    if os.path.isdir(cwd):
        candidates.append(cwd)

    data_dir = candidates[0] if candidates else plugin_dir
    db_path = None
    for c in candidates:
        cand_db = os.path.join(c, "stash-go.sqlite")
        if os.path.isfile(cand_db):
            data_dir = c
            db_path = cand_db
            break
        cand_sub_db = os.path.join(c, "data", "stash-go.sqlite")
        if os.path.isfile(cand_sub_db):
            data_dir = os.path.join(c, "data")
            db_path = cand_sub_db
            break

    if not db_path:
        db_path = os.path.join(data_dir, "stash-go.sqlite")

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
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path, timeout=10.0)
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
        except Exception:
            pass
        return conn
    return None

def init_db_schema(conn):
    if not conn:
        return
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
    conn.commit()

def main():
    plugin_input = {}
    if not sys.stdin.isatty():
        try:
            raw = sys.stdin.read()
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

    # Ensure database schema is ready
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
                        password_hash=excluded.password_hash,
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

        resume_time = float(args.get("resume_time", 0.0))
        play_duration = float(args.get("play_duration", 0.0))
        play_count_inc = int(args.get("play_count_inc", 0))
        reset = bool(args.get("reset", False))

        now_ms = int(time.time() * 1000)
        updated_act = {
            "resume_time": 0.0 if reset else resume_time,
            "play_duration": 0.0 if reset else play_duration,
            "play_count": 0 if reset else play_count_inc,
            "last_played_at": now_ms
        }

        # 1. Authoritative write to SQLite users_scenes_activity
        conn = get_db_connection(db_path)
        if conn:
            try:
                c = conn.cursor()
                init_db_schema(conn)
                if reset:
                    c.execute("""
                    UPDATE users_scenes_activity
                    SET resume_time = 0, play_duration = 0, play_count = 0, last_played_at = ?
                    WHERE user_id = ? AND scene_id = ?
                    """, (now_ms, uid, scene_id))
                    if c.rowcount == 0:
                        c.execute("""
                        INSERT INTO users_scenes_activity (user_id, scene_id, resume_time, play_duration, play_count, last_played_at)
                        VALUES (?, ?, 0, 0, 0, ?)
                        """, (uid, scene_id, now_ms))
                    updated_act = {
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
                        resume_time = excluded.resume_time,
                        play_duration = play_duration + excluded.play_duration,
                        play_count = play_count + excluded.play_count,
                        last_played_at = excluded.last_played_at
                    """, (uid, scene_id, resume_time, play_duration, play_count_inc, now_ms))

                    c.execute("SELECT resume_time, play_duration, play_count, last_played_at FROM users_scenes_activity WHERE user_id = ? AND scene_id = ?", (uid, scene_id))
                    row = c.fetchone()
                    if row:
                        updated_act = {
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
                        elif resume_time > 0:
                            c.execute("UPDATE scenes SET resume_time = ? WHERE id = ?", (resume_time, scene_id))
                    except Exception:
                        pass

                conn.commit()
            except Exception as e:
                sys.stderr.write(f"SQLite save_activity error: {e}\n")
            finally:
                conn.close()

        # 2. Backup to server data directory: activity/activity_{uid}.json
        activity_dir = os.path.join(data_dir, "activity")
        os.makedirs(activity_dir, exist_ok=True)
        act_file = os.path.join(activity_dir, f"activity_{uid}.json")
        user_acts = {}
        if os.path.exists(act_file):
            try:
                with open(act_file, "r", encoding="utf-8") as f:
                    user_acts = json.load(f)
            except Exception:
                pass
        user_acts[str(scene_id)] = updated_act
        try:
            with open(act_file, "w", encoding="utf-8") as f:
                json.dump(user_acts, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

        print(json.dumps({"output": {"status": "ok", "user_id": uid, "scene_id": scene_id, "activity": updated_act}}))
        return

    if action == "reset_activity":
        uid = args.get("user_id") or 1
        scene_id = int(args.get("scene_id", 0))
        now_ms = int(time.time() * 1000)
        conn = get_db_connection(db_path)
        if conn and scene_id > 0:
            try:
                c = conn.cursor()
                init_db_schema(conn)
                c.execute("""
                UPDATE users_scenes_activity
                SET resume_time = 0, play_duration = 0, play_count = 0, last_played_at = ?
                WHERE user_id = ? AND scene_id = ?
                """, (now_ms, uid, scene_id))
                if uid == 1:
                    c.execute("UPDATE scenes SET resume_time = 0 WHERE id = ?", (scene_id,))
                conn.commit()
            except Exception as e:
                sys.stderr.write(f"SQLite reset_activity error: {e}\n")
            finally:
                conn.close()

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
        cw_list = []
        hist_list = []

        # 1. Authoritative fetch from SQLite users_scenes_activity
        conn = get_db_connection(db_path)
        if conn:
            try:
                c = conn.cursor()
                init_db_schema(conn)
                c.execute("""
                SELECT scene_id, resume_time, play_duration, play_count, last_played_at
                FROM users_scenes_activity
                WHERE user_id = ?
                ORDER BY last_played_at DESC
                """, (uid,))
                rows = c.fetchall()

                # One-time migration for admin user from legacy scenes table if table is completely empty
                if not rows and uid == 1:
                    try:
                        c.execute("SELECT id, resume_time FROM scenes WHERE resume_time > 0")
                        legacy_scenes = c.fetchall()
                        now_ts = int(time.time() * 1000)
                        for s_row in legacy_scenes:
                            sid_s = str(s_row[0])
                            r_time = float(s_row[1])
                            c.execute("""
                            INSERT INTO users_scenes_activity (user_id, scene_id, resume_time, play_duration, play_count, last_played_at)
                            VALUES (1, ?, ?, 0.0, 1, ?)
                            ON CONFLICT(user_id, scene_id) DO UPDATE SET
                                resume_time = excluded.resume_time
                            """, (s_row[0], r_time, now_ts))
                        conn.commit()
                        c.execute("""
                        SELECT scene_id, resume_time, play_duration, play_count, last_played_at
                        FROM users_scenes_activity
                        WHERE user_id = 1
                        ORDER BY last_played_at DESC
                        """)
                        rows = c.fetchall()
                    except Exception as me:
                        sys.stderr.write(f"Migration notice: {me}\n")

                # Verify each scene_id actually exists in scenes table to prevent GraphQL query errors
                cand_ids = [r[0] for r in rows if r[0] > 0]
                valid_ids = set()
                if cand_ids:
                    pl = ",".join("?" for _ in cand_ids)
                    c.execute(f"SELECT id FROM scenes WHERE id IN ({pl})", cand_ids)
                    valid_ids = {r[0] for r in c.fetchall()}

                for row in rows:
                    sid = row[0]
                    if sid not in valid_ids:
                        continue
                    sid_str = str(sid)
                    item = {
                        "scene_id": sid,
                        "resume_time": float(row[1]),
                        "play_duration": float(row[2]),
                        "play_count": int(row[3]),
                        "last_played_at": int(row[4]) if str(row[4]).isdigit() else int(time.time() * 1000)
                    }
                    user_acts[sid_str] = item
                    hist_list.append(item)
                    if float(row[1]) > 0:
                        cw_list.append(item)

            except Exception as e:
                sys.stderr.write(f"SQLite get_activity error: {e}\n")
            finally:
                conn.close()

        # Fallback to server JSON file if SQLite had no rows (e.g. freshly created)
        if not user_acts:
            activity_dir = os.path.join(data_dir, "activity")
            act_file = os.path.join(activity_dir, f"activity_{uid}.json")
            if os.path.exists(act_file):
                try:
                    with open(act_file, "r", encoding="utf-8") as f:
                        file_acts = json.load(f)
                        if isinstance(file_acts, dict):
                            user_acts = file_acts
                except Exception:
                    pass

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
