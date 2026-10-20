import { useState, useEffect, useCallback } from "react";

export interface IAccountUser {
  id: number;
  username: string;
  is_admin: boolean;
  password_hash?: string;
  created_at?: string;
}

export interface IUserSceneActivity {
  scene_id?: number;
  resume_time: number;
  play_duration?: number;
  play_count?: number;
  last_played_at: number; // timestamp in milliseconds
}

export type UserActivityMap = Record<string, IUserSceneActivity>;

const STORAGE_KEY_CURRENT_USER = "stash_current_user";
const STORAGE_KEY_USERS = "stash_user_accounts";

// Authoritative in-memory state: 100% server-driven, zero watch history in localStorage
let memoryActivityMap: UserActivityMap = {};
let memoryLoadedUserId: number | null = null;
let fetchPromise: Promise<UserActivityMap> | null = null;

// Purge any legacy client localStorage activity keys
try {
  if (typeof window !== "undefined" && window.localStorage) {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith("stash_user_activity_")) {
        localStorage.removeItem(key);
      }
    }
  }
} catch {}

export function getCurrentUser(): IAccountUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.username) return parsed;
    }
  } catch {}

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

export async function fetchUserActivityFromServer(
  force = false
): Promise<UserActivityMap> {
  const user = getCurrentUser();
  const uid = user?.id || 1;
  const uname = user?.username ? user.username.toLowerCase() : "default";

  if (!force && memoryLoadedUserId === uid && Object.keys(memoryActivityMap).length > 0) {
    return memoryActivityMap;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
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
          memoryActivityMap = serverAct;
          memoryLoadedUserId = uid;
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("stash:user_activity_updated", {
                detail: { user_id: uid, username: uname },
              })
            );
          }
        }
      }
    } catch (e) {
      console.warn("[userActivity] Failed to fetch server activity:", e);
    } finally {
      fetchPromise = null;
    }
    return memoryActivityMap;
  })();

  return fetchPromise;
}

export async function ensureUserActivityLoaded(): Promise<UserActivityMap> {
  const user = getCurrentUser();
  const uid = user?.id || 1;
  if (memoryLoadedUserId === uid && Object.keys(memoryActivityMap).length > 0) {
    return memoryActivityMap;
  }
  return fetchUserActivityFromServer();
}

export function getUserResumeTime(sceneId: string | number): number {
  const sid = String(sceneId);
  const act = memoryActivityMap[sid];
  if (act && typeof act.resume_time === "number" && act.resume_time > 0) {
    return act.resume_time;
  }
  return 0;
}

export async function getOrFetchUserResumeTime(
  sceneId: string | number
): Promise<number> {
  const sid = String(sceneId);
  if (memoryActivityMap[sid] !== undefined) {
    return memoryActivityMap[sid].resume_time || 0;
  }
  await ensureUserActivityLoaded();
  return memoryActivityMap[sid]?.resume_time || 0;
}

export function getUserPlayCount(sceneId: string | number): number {
  const sid = String(sceneId);
  const act = memoryActivityMap[sid];
  if (act && typeof act.play_count === "number") {
    return act.play_count;
  }
  return 0;
}

export function getUserActivityMap(): UserActivityMap {
  return { ...memoryActivityMap };
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
  const uname = user?.username ? user.username.toLowerCase() : "default";
  const uid = user?.id || 1;
  const sid = String(sceneId);
  const now = Date.now();

  // 1. Instantly update in-memory runtime cache for responsive UI
  const existing = memoryActivityMap[sid] || {
    scene_id: parseInt(sid, 10),
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

  memoryActivityMap[sid] = existing;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("stash:user_activity_updated", {
        detail: { user_id: uid, username: uname, scene_id: sid },
      })
    );
  }

  // 2. Persist to authoritative SQLite backend database
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
    console.error("[userActivity] Failed to persist activity to server:", e);
  }
}

export function useSceneUserResumeTime(sceneId: string | number): number {
  const [resumeTime, setResumeTime] = useState<number>(() =>
    getUserResumeTime(sceneId)
  );

  useEffect(() => {
    let mounted = true;
    const handleUpdate = () => {
      if (mounted) {
        setResumeTime(getUserResumeTime(sceneId));
      }
    };

    window.addEventListener("stash:user_activity_updated", handleUpdate);
    return () => {
      mounted = false;
      window.removeEventListener("stash:user_activity_updated", handleUpdate);
    };
  }, [sceneId]);

  return resumeTime;
}

export function useUserActivity() {
  const [currentUser, setCurrentUser] = useState<IAccountUser | null>(() =>
    getCurrentUser()
  );
  const [activities, setActivities] = useState<UserActivityMap>(() => ({
    ...memoryActivityMap,
  }));
  const [loading, setLoading] = useState<boolean>(
    () => memoryLoadedUserId !== currentUser?.id
  );

  const refresh = useCallback(() => {
    const cur = getCurrentUser();
    setCurrentUser(cur);
    setLoading(true);
    fetchUserActivityFromServer(true).then((synced) => {
      setActivities({ ...synced });
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    const cur = getCurrentUser();
    setCurrentUser(cur);

    fetchUserActivityFromServer().then((synced) => {
      if (mounted) {
        setActivities({ ...synced });
        setLoading(false);
      }
    });

    const handleUpdate = () => {
      if (mounted) {
        setActivities({ ...memoryActivityMap });
      }
    };

    window.addEventListener("stash:user_activity_updated", handleUpdate);
    return () => {
      mounted = false;
      window.removeEventListener("stash:user_activity_updated", handleUpdate);
    };
  }, [currentUser?.username]);

  return {
    currentUser,
    activities,
    loading,
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
    refetch: refresh,
  };
}

// Initialise background server prefetch as soon as JS bundle is loaded
if (typeof window !== "undefined") {
  fetchUserActivityFromServer().catch(() => {});
}
