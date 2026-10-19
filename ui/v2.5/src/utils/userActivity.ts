import { useState, useEffect } from "react";

export interface IAccountUser {
  id: number;
  username: string;
  is_admin: boolean;
  password_hash?: string;
  created_at?: string;
}

export interface IUserSceneActivity {
  resume_time: number;
  play_duration?: number;
  play_count?: number;
  last_played_at: number; // timestamp in milliseconds
}

export type UserActivityMap = Record<string, IUserSceneActivity>;

const STORAGE_KEY_CURRENT_USER = "stash_current_user";
const STORAGE_KEY_USERS = "stash_user_accounts";

export function getCurrentUser(): IAccountUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.username) return parsed;
    }
  } catch {}

  // Fallback: check saved accounts and default to admin or first account
  try {
    const rawUsers = localStorage.getItem(STORAGE_KEY_USERS);
    if (rawUsers) {
      const users: IAccountUser[] = JSON.parse(rawUsers);
      if (Array.isArray(users) && users.length > 0) {
        return users.find((u) => u.is_admin) || users[0];
      }
    }
  } catch {}

  return null;
}

export function getUserActivityStorageKey(user?: IAccountUser | null): string {
  const u = user || getCurrentUser();
  const uname = u?.username ? u.username.toLowerCase() : "default";
  return `stash_user_activity_${uname}`;
}

export function getUserActivityMap(user?: IAccountUser | null): UserActivityMap {
  try {
    const key = getUserActivityStorageKey(user);
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveUserActivityMap(
  map: UserActivityMap,
  user?: IAccountUser | null
): void {
  try {
    const u = user || getCurrentUser();
    const key = getUserActivityStorageKey(u);
    localStorage.setItem(key, JSON.stringify(map));
    window.dispatchEvent(
      new CustomEvent("stash:user_activity_updated", {
        detail: { key, username: u?.username },
      })
    );
  } catch {}
}

export function getUserResumeTime(sceneId: string | number): number {
  const map = getUserActivityMap();
  const sid = String(sceneId);
  const act = map[sid];
  if (act && typeof act.resume_time === "number" && act.resume_time > 0) {
    return act.resume_time;
  }
  return 0;
}

export function getUserPlayCount(sceneId: string | number): number {
  const map = getUserActivityMap();
  const sid = String(sceneId);
  const act = map[sid];
  if (act && typeof act.play_count === "number") {
    return act.play_count;
  }
  return 0;
}

export async function recordUserActivity(
  sceneId: string | number,
  options: {
    resume_time?: number;
    play_duration?: number;
    play_count_inc?: number;
    reset?: boolean;
  }
): Promise<void> {
  const user = getCurrentUser();
  const uname = user?.username || "lemon";
  const uid = user?.id || 1;
  const sid = String(sceneId);

  // 1. Instantly update localStorage
  const map = getUserActivityMap(user);
  const now = Date.now();
  const existing = map[sid] || {
    resume_time: 0,
    play_duration: 0,
    play_count: 0,
    last_played_at: now,
  };

  if (options.reset) {
    existing.resume_time = 0;
    existing.play_duration = 0;
    existing.play_count = 0;
    existing.last_played_at = now;
  } else {
    if (typeof options.resume_time === "number") {
      existing.resume_time = Math.max(0, options.resume_time);
    }
    if (options.play_duration && options.play_duration > 0) {
      existing.play_duration =
        (existing.play_duration || 0) + options.play_duration;
    }
    if (options.play_count_inc && options.play_count_inc > 0) {
      existing.play_count = (existing.play_count || 0) + options.play_count_inc;
    }
    existing.last_played_at = now;
  }

  map[sid] = existing;
  saveUserActivityMap(map, user);

  // 2. Persist to backend
  try {
    await fetch("/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `mutation SaveActivity($plugin_id: ID!, $args: Map) {
          runPluginOperation(plugin_id: $plugin_id, args: $args)
        }`,
        variables: {
          plugin_id: "multi_user",
          args: {
            action: "save_activity",
            user_id: uid,
            username: uname,
            scene_id: parseInt(sid, 10),
            resume_time: options.resume_time ?? existing.resume_time,
            play_duration: options.play_duration ?? 0,
            play_count_inc: options.play_count_inc ?? 0,
            reset: !!options.reset,
          },
        },
      }),
    });
  } catch (e) {
    console.error("Failed to sync activity to backend:", e);
  }
}

export async function syncUserActivityFromBackend(
  user?: IAccountUser | null
): Promise<UserActivityMap> {
  const u = user || getCurrentUser();
  const uname = u?.username || "lemon";
  const uid = u?.id || 1;

  try {
    const res = await fetch("/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `mutation GetActivity($plugin_id: ID!, $args: Map) {
          runPluginOperation(plugin_id: $plugin_id, args: $args)
        }`,
        variables: {
          plugin_id: "multi_user",
          args: {
            action: "get_activity",
            user_id: uid,
            username: uname,
          },
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const serverAct: UserActivityMap =
        data?.data?.runPluginOperation?.activity;
      if (serverAct && typeof serverAct === "object") {
        const local = getUserActivityMap(u);
        const merged: UserActivityMap = { ...local };
        for (const [id, sAct] of Object.entries(serverAct)) {
          const lAct = local[id];
          if (!lAct || (sAct.last_played_at || 0) >= (lAct.last_played_at || 0)) {
            merged[id] = sAct;
          }
        }
        saveUserActivityMap(merged, u);
        return merged;
      }
    }
  } catch (e) {
    console.warn("Failed to fetch activity from backend:", e);
  }

  return getUserActivityMap(u);
}

export function useUserActivity() {
  const [currentUser, setCurrentUser] = useState<IAccountUser | null>(() =>
    getCurrentUser()
  );
  const [activities, setActivities] = useState<UserActivityMap>(() =>
    getUserActivityMap(currentUser)
  );

  useEffect(() => {
    let mounted = true;
    syncUserActivityFromBackend(currentUser).then((synced) => {
      if (mounted) setActivities(synced);
    });

    const handleUpdate = () => {
      const cur = getCurrentUser();
      setCurrentUser(cur);
      setActivities(getUserActivityMap(cur));
    };

    window.addEventListener("stash:user_activity_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      mounted = false;
      window.removeEventListener("stash:user_activity_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [currentUser?.username]);

  return {
    currentUser,
    activities,
    getResumeTime: (sceneId: string | number) => {
      const act = activities[String(sceneId)];
      return act?.resume_time ?? 0;
    },
    recordActivity: (
      sceneId: string | number,
      options: {
        resume_time?: number;
        play_duration?: number;
        play_count_inc?: number;
        reset?: boolean;
      }
    ) => recordUserActivity(sceneId, options),
  };
}
