import videojs, { VideoJsPlayer } from "video.js";

function formatTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

class TouchGesturesPlugin extends videojs.getPlugin("plugin") {
  private speedHudEl!: HTMLElement;
  private scrubHudEl!: HTMLElement;

  private touchStartX = 0;
  private touchStartY = 0;
  private seekStartTime = 0;
  private targetSeekTime = 0;
  private originalRate = 1;
  private longPressTimer: any = null;
  private gestureState: "IDLE" | "SPEEDING" | "SEEKING" = "IDLE";

  constructor(player: VideoJsPlayer) {
    super(player);

    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);

    player.ready(() => {
      this.initUI();
      this.bindEvents();
    });

    this.on("dispose", () => {
      this.unbindEvents();
      if (this.speedHudEl?.parentNode) {
        this.speedHudEl.parentNode.removeChild(this.speedHudEl);
      }
      if (this.scrubHudEl?.parentNode) {
        this.scrubHudEl.parentNode.removeChild(this.scrubHudEl);
      }
    });
  }

  private initUI() {
    const rootEl = this.player.el();

    // 1. Long-press 2X Speed HUD (Bilibili style top capsule)
    this.speedHudEl = videojs.dom.createEl("div", {
      className: "vjs-gesture-speed-hud vjs-gesture-hidden",
    }) as HTMLElement;
    this.speedHudEl.innerHTML = `
      <span class="vjs-gesture-speed-icon">▶▶</span>
      <span class="vjs-gesture-speed-text">2.0X 倍速播放中</span>
    `;

    // 2. Scrubbing HUD (Bilibili style center progress card)
    this.scrubHudEl = videojs.dom.createEl("div", {
      className: "vjs-gesture-scrub-hud vjs-gesture-hidden",
    }) as HTMLElement;
    this.scrubHudEl.innerHTML = `
      <div class="vjs-gesture-scrub-delta">+0s</div>
      <div class="vjs-gesture-scrub-time">00:00 / 00:00</div>
      <div class="vjs-gesture-scrub-track">
        <div class="vjs-gesture-scrub-fill" style="width: 0%;"></div>
      </div>
    `;

    rootEl.appendChild(this.speedHudEl);
    rootEl.appendChild(this.scrubHudEl);
  }

  private bindEvents() {
    const el = this.player.el() as any;
    if (!el) return;
    el.addEventListener("touchstart", this.onTouchStart as any, { passive: false });
    el.addEventListener("touchmove", this.onTouchMove as any, { passive: false });
    el.addEventListener("touchend", this.onTouchEnd as any, { passive: true });
    el.addEventListener("touchcancel", this.onTouchEnd as any, { passive: true });
  }

  private unbindEvents() {
    const el = this.player.el() as any;
    if (!el) return;
    el.removeEventListener("touchstart", this.onTouchStart as any);
    el.removeEventListener("touchmove", this.onTouchMove as any);
    el.removeEventListener("touchend", this.onTouchEnd as any);
    el.removeEventListener("touchcancel", this.onTouchEnd as any);
  }

  private onTouchStart(e: TouchEvent) {
    if (e.touches.length > 1) {
      this.clearLongPress();
      return;
    }

    const target = e.target as HTMLElement;
    // Don't intercept touches on control bar, settings panel, modal dialogs, or buttons
    if (
      target.closest(".vjs-control-bar") ||
      target.closest(".vjs-yt-settings-panel") ||
      target.closest(".vjs-modal-dialog") ||
      target.closest(".vjs-menu") ||
      target.closest(".vjs-button")
    ) {
      return;
    }

    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.seekStartTime = this.player.currentTime() || 0;
    this.targetSeekTime = this.seekStartTime;
    this.originalRate = this.player.playbackRate() || 1;
    this.gestureState = "IDLE";

    // Setup 320ms long-press timer for 2x speed
    this.clearLongPress();
    this.longPressTimer = setTimeout(() => {
      // If video is not completely stopped/error and still touching
      if (this.gestureState === "IDLE" && !this.player.error()) {
        this.gestureState = "SPEEDING";
        this.player.playbackRate(2.0);
        this.showSpeedHud();
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try {
            navigator.vibrate(30);
          } catch {
            // ignore vibrate errors
          }
        }
      }
    }, 320);
  }

  private onTouchMove(e: TouchEvent) {
    if (e.touches.length > 1) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;

    // Check if horizontal movement is dominant
    if (this.gestureState === "IDLE") {
      if (Math.abs(deltaX) > 14 && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
        this.clearLongPress();
        this.gestureState = "SEEKING";
      }
    } else if (this.gestureState === "SPEEDING") {
      // Transition from long-press 2X to scrubbing if dragged horizontally
      if (Math.abs(deltaX) > 18) {
        this.player.playbackRate(this.originalRate);
        this.hideSpeedHud();
        this.gestureState = "SEEKING";
      }
    }

    if (this.gestureState === "SEEKING") {
      if (e.cancelable) {
        e.preventDefault();
      }

      const duration = this.player.duration() || 0;
      if (duration <= 0) return;

      const screenWidth = window.innerWidth || 360;
      // Proportional scrub: full screen width swipe spans 60s to 300s
      const scrubRange = Math.max(60, Math.min(300, duration * 0.25));
      const deltaRatio = deltaX / (screenWidth * 0.7);
      const deltaSeconds = deltaRatio * scrubRange;

      this.targetSeekTime = Math.max(
        0,
        Math.min(duration, this.seekStartTime + deltaSeconds)
      );

      this.updateScrubHud(deltaSeconds, this.targetSeekTime, duration);
      this.showScrubHud();
    }
  }

  private onTouchEnd() {
    this.clearLongPress();

    if (this.gestureState === "SPEEDING") {
      this.player.playbackRate(this.originalRate);
      this.hideSpeedHud();
    } else if (this.gestureState === "SEEKING") {
      this.player.currentTime(this.targetSeekTime);
      this.hideScrubHud();
    }

    this.gestureState = "IDLE";
  }

  private clearLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private showSpeedHud() {
    this.speedHudEl.classList.remove("vjs-gesture-hidden");
    this.speedHudEl.classList.add("vjs-gesture-visible");
  }

  private hideSpeedHud() {
    this.speedHudEl.classList.remove("vjs-gesture-visible");
    this.speedHudEl.classList.add("vjs-gesture-hidden");
  }

  private showScrubHud() {
    this.scrubHudEl.classList.remove("vjs-gesture-hidden");
    this.scrubHudEl.classList.add("vjs-gesture-visible");
  }

  private hideScrubHud() {
    this.scrubHudEl.classList.remove("vjs-gesture-visible");
    this.scrubHudEl.classList.add("vjs-gesture-hidden");
  }

  private updateScrubHud(deltaSeconds: number, targetTime: number, duration: number) {
    const deltaEl = this.scrubHudEl.querySelector(".vjs-gesture-scrub-delta");
    const timeEl = this.scrubHudEl.querySelector(".vjs-gesture-scrub-time");
    const fillEl = this.scrubHudEl.querySelector(
      ".vjs-gesture-scrub-fill"
    ) as HTMLElement;

    const roundDelta = Math.round(deltaSeconds);
    const sign = roundDelta >= 0 ? "+" : "";
    if (deltaEl) {
      deltaEl.textContent = `${sign}${roundDelta}s`;
    }
    if (timeEl) {
      timeEl.textContent = `${formatTimestamp(targetTime)} / ${formatTimestamp(duration)}`;
    }
    if (fillEl && duration > 0) {
      const pct = Math.max(0, Math.min(100, (targetTime / duration) * 100));
      fillEl.style.width = `${pct}%`;
    }
  }
}

videojs.registerPlugin("touchGestures", TouchGesturesPlugin);

declare module "video.js" {
  interface VideoJsPlayer {
    touchGestures: () => TouchGesturesPlugin;
  }
  interface VideoJsPlayerPluginOptions {
    touchGestures?: object;
  }
}

export default TouchGesturesPlugin;
