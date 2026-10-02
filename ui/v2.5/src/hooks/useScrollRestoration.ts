import { useEffect, useRef } from "react";
import { useHistory, useLocation } from "react-router-dom";

// In-memory scroll position cache keyed by location.key and pathname+search
const scrollMap = new Map<string, number>();

const SESSION_STORAGE_PREFIX = "stash_scroll_pos_";

function getSavedScroll(key: string): number | undefined {
  if (scrollMap.has(key)) {
    return scrollMap.get(key);
  }
  try {
    const val = sessionStorage.getItem(`${SESSION_STORAGE_PREFIX}${key}`);
    if (val !== null) {
      const parsed = parseInt(val, 10);
      if (!Number.isNaN(parsed)) {
        scrollMap.set(key, parsed);
        return parsed;
      }
    }
  } catch {}
  return undefined;
}

function saveScroll(key: string, y: number) {
  scrollMap.set(key, y);
  try {
    sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}${key}`, String(y));
  } catch {}
}

// Active restoration session handle
let activeRestorationCleanup: (() => void) | null = null;

function startScrollRestoration(targetY: number) {
  // Cancel previous restoration if one is already in progress
  if (activeRestorationCleanup) {
    activeRestorationCleanup();
    activeRestorationCleanup = null;
  }

  if (targetY <= 0) {
    window.scrollTo(0, 0);
    return;
  }

  let active = true;
  let settledFrames = 0;
  let rafId = 0;
  let observer: MutationObserver | null = null;
  const startTime = performance.now();
  const MAX_DURATION_MS = 2500;

  const cleanup = () => {
    active = false;
    window.removeEventListener("wheel", onUserInteraction);
    window.removeEventListener("touchstart", onUserInteraction);
    window.removeEventListener("keydown", onUserInteraction);
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (activeRestorationCleanup === cleanup) {
      activeRestorationCleanup = null;
    }
  };

  activeRestorationCleanup = cleanup;

  // If user interacts intentionally with wheel, touch, or navigation keys, stop immediately
  const onUserInteraction = (e: Event) => {
    if (e.isTrusted) {
      cleanup();
    }
  };

  window.addEventListener("wheel", onUserInteraction, { passive: true, once: true });
  window.addEventListener("touchstart", onUserInteraction, { passive: true, once: true });
  window.addEventListener("keydown", onUserInteraction, { passive: true, once: true });

  const attemptScroll = () => {
    if (!active) return;

    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);

    if (maxScroll >= targetY) {
      window.scrollTo(0, targetY);
      if (Math.abs(window.scrollY - targetY) <= 3) {
        settledFrames++;
        if (settledFrames >= 5) {
          // Reached target position and confirmed stable across multiple animation frames
          cleanup();
          return;
        }
      } else {
        settledFrames = 0;
      }
    } else {
      // Content has not fully expanded yet; hold and wait for DOM expansion
      settledFrames = 0;
    }

    if (performance.now() - startTime > MAX_DURATION_MS) {
      // Timeout reached: scroll to available maximum and finish
      if (maxScroll > 0) {
        window.scrollTo(0, Math.min(targetY, maxScroll));
      }
      cleanup();
      return;
    }
  };

  // 1. Initial attempt
  attemptScroll();

  // 2. Observe DOM mutations (React mounting/rendering components and list cards)
  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => {
      if (active) {
        attemptScroll();
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    });
  }

  // 3. Animation frame loop
  const loop = () => {
    if (!active) return;
    attemptScroll();
    if (active) {
      rafId = requestAnimationFrame(loop);
    }
  };
  rafId = requestAnimationFrame(loop);
}

export function useScrollRestoration() {
  const history = useHistory();
  const location = useLocation();

  const currentKeyRef = useRef<string>(
    location.key || `${location.pathname}${location.search}`
  );
  const currentPathRef = useRef<string>(
    `${location.pathname}${location.search}`
  );

  // Disable browser automatic scroll restoration to prevent early 0-clamping
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "scrollRestoration" in window.history
    ) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  // Track scroll position continuously for the current location
  useEffect(() => {
    let timeoutId: number | null = null;

    const handleScroll = () => {
      const scrollY = window.scrollY;
      const key = currentKeyRef.current;
      const path = currentPathRef.current;

      if (key) {
        scrollMap.set(key, scrollY);
      }
      if (path) {
        scrollMap.set(path, scrollY);
      }

      // Debounced write to sessionStorage
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        if (key) {
          saveScroll(key, scrollY);
        }
        if (path) {
          saveScroll(path, scrollY);
        }
      }, 100);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  // Listen to history transitions
  useEffect(() => {
    const unlisten = history.listen((newLocation, action) => {
      const scrollY = window.scrollY;
      const prevKey = currentKeyRef.current;
      const prevPath = currentPathRef.current;

      // Immediately save outgoing location's scroll position
      if (prevKey) {
        saveScroll(prevKey, scrollY);
      }
      if (prevPath) {
        saveScroll(prevPath, scrollY);
      }

      const nextKey =
        newLocation.key || `${newLocation.pathname}${newLocation.search}`;
      const nextPath = `${newLocation.pathname}${newLocation.search}`;

      currentKeyRef.current = nextKey;
      currentPathRef.current = nextPath;

      if (action === "PUSH") {
        // Forward navigation to a new page: scroll to top or hash
        if (activeRestorationCleanup) {
          activeRestorationCleanup();
          activeRestorationCleanup = null;
        }

        if (newLocation.hash) {
          const el = document.querySelector(newLocation.hash);
          if (el) {
            el.scrollIntoView();
            return;
          }
        }
        window.scrollTo(0, 0);
      } else if (action === "POP") {
        // Back/Forward navigation: restore previous scroll position
        const targetY =
          getSavedScroll(nextKey) ?? getSavedScroll(nextPath);

        if (targetY !== undefined) {
          startScrollRestoration(targetY);
        } else {
          window.scrollTo(0, 0);
        }
      }
    });

    return () => {
      unlisten();
    };
  }, [history]);
}

export const ScrollRestoration: React.FC = () => {
  useScrollRestoration();
  return null;
};
