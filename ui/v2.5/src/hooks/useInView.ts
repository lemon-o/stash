import { useState, useEffect, useRef } from "react";

interface IUseInViewOptions {
  rootMargin?: string;
  threshold?: number | number[];
  prefetchDelayMs?: number;
}

export function useInView<T extends HTMLElement = HTMLDivElement>(
  options: IUseInViewOptions = {}
): [React.RefObject<T>, boolean] {
  const {
    rootMargin = "400px",
    threshold = 0,
    prefetchDelayMs = 1200,
  } = options;

  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;

    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(el);

    // If user does not scroll within prefetchDelayMs, prefetch anyway in the background
    let timer: number | null = null;
    if (prefetchDelayMs > 0) {
      timer = window.setTimeout(() => {
        setInView(true);
        observer.disconnect();
      }, prefetchDelayMs);
    }

    return () => {
      observer.disconnect();
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [inView, rootMargin, threshold, prefetchDelayMs]);

  return [ref, inView];
}
