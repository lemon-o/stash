import videojs, { VideoJsPlayer } from "video.js";

export interface ISource extends videojs.Tech.SourceObject {
  label?: string;
  errored?: boolean;
}

function localizeStreamLabel(
  label?: string,
  directStreamTranslation = "原画"
): string | undefined {
  if (!label) return label;
  if (/^direct\s*stream$/i.test(label.trim()) || label.trim() === "直接串流") {
    return directStreamTranslation;
  }
  if (/direct\s*stream/i.test(label)) {
    return label.replace(/direct\s*stream/gi, directStreamTranslation);
  }
  return label;
}

// Crisp SVGs matching YouTube's player design
const SVG_ICONS = {
  gear: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
  quality: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>`,
  speed: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>`,
  subtitles: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V6h14v12zM7 15h4v-2H7v2zm8 0h2v-2h-2v2zm-8-4h2V9H7v2zm4 0h6V9h-6v2z"/></svg>`,
  audio: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>`,
  back: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`,
};

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const Button = videojs.getComponent("Button");

export class YouTubeSettingsButton extends Button {
  private sources: ISource[] = [];
  public selectedSource: ISource | null = null;
  public isAuto = true;
  private autoLabel = "自动";
  private isOpen = false;
  private currentView: "main" | "quality" | "speed" | "subtitles" | "audio" =
    "main";

  private hdBadgeEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private erroredSources = new Set<string>();

  constructor(player: VideoJsPlayer) {
    super(player, { name: "YouTubeSettingsButton" } as any);

    this.onDocClick = this.onDocClick.bind(this);
    this.onDocKeyDown = this.onDocKeyDown.bind(this);

    // Create the floating YouTube settings panel
    this.panelEl = videojs.dom.createEl("div", {
      className: "vjs-yt-settings-panel vjs-yt-panel-hidden",
    }) as HTMLElement;

    // Prevent interactions inside panel from bubbling to video player
    this.panelEl.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.panelEl.addEventListener("click", (e) => e.stopPropagation());

    player.ready(() => {
      try {
        const root = player.el();
        if (root && !root.contains(this.panelEl)) {
          root.appendChild(this.panelEl);
        }
      } catch (err) {
        console.warn("Failed to append settings panel to player root:", err);
      }
    });

    player.on("ratechange", () => {
      this.updateViewIfOpen();
    });

    player.on("loadedmetadata", () => {
      this.updateBadge();
    });

    player.on("loadstart", () => {
      this.updateBadge();
      this.updateViewIfOpen();
    });

    this.on("dispose", () => {
      this.close();
      if (this.panelEl && this.panelEl.parentNode) {
        this.panelEl.parentNode.removeChild(this.panelEl);
      }
      document.removeEventListener("click", this.onDocClick, true);
      document.removeEventListener("keydown", this.onDocKeyDown);
    });
  }

  buildCSSClass() {
    return `vjs-yt-settings-button ${super.buildCSSClass()}`;
  }

  createEl(tag: string = "button", props?: any, attributes?: any): HTMLButtonElement {
    const el = super.createEl(
      tag || "button",
      {
        className: this.buildCSSClass(),
        type: "button",
        ...props,
      },
      attributes
    ) as HTMLButtonElement;

    const titleText = this.localize("Settings") || "设置";
    el.setAttribute("title", titleText);
    el.setAttribute("aria-label", titleText);

    // Append gear icon span
    const iconSpan = document.createElement("span");
    iconSpan.className = "vjs-yt-settings-icon";
    iconSpan.innerHTML = SVG_ICONS.gear;
    el.appendChild(iconSpan);

    // Append HD / 4K badge span
    const badgeSpan = document.createElement("span");
    badgeSpan.className = "vjs-yt-hd-badge";
    badgeSpan.style.display = "none";
    el.appendChild(badgeSpan);
    this.hdBadgeEl = badgeSpan;

    return el;
  }

  handleClick(event?: videojs.EventTarget.Event) {
    if (event) {
      if (typeof (event as any).preventDefault === "function") {
        (event as any).preventDefault();
      }
      if (typeof event.stopPropagation === "function") {
        event.stopPropagation();
      }
    }
    this.toggle();
  }

  public setSources(sources: ISource[], autoLabel: string = "自动") {
    this.autoLabel = autoLabel;
    this.selectedSource = null;
    this.isAuto = true;
    this.sources = sources;
    this.erroredSources.clear();

    this.updateBadge();
    this.updateViewIfOpen();
  }

  public setSelectedSource(source: ISource) {
    this.isAuto = false;
    this.selectedSource = source;
    this.updateBadge();
    this.updateViewIfOpen();
  }

  public setAutoSelected() {
    this.isAuto = true;
    this.selectedSource = null;
    this.updateBadge();
    this.updateViewIfOpen();
  }

  public markSourceErrored(source: ISource) {
    if (source?.src) {
      this.erroredSources.add(source.src);
      this.updateViewIfOpen();
    }
  }

  public unmarkSourceErrored(source: ISource) {
    if (source?.src) {
      this.erroredSources.delete(source.src);
      this.updateViewIfOpen();
    }
  }

  public toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public open() {
    this.isOpen = true;
    this.currentView = "main";

    // Ensure panelEl is attached to player root
    try {
      const root = this.player().el();
      if (root && !root.contains(this.panelEl)) {
        root.appendChild(this.panelEl);
      }
    } catch {
      // ignore
    }

    this.panelEl.classList.remove("vjs-yt-panel-hidden");
    this.panelEl.classList.add("vjs-yt-panel-visible");
    this.renderPanel();

    requestAnimationFrame(() => {
      document.addEventListener("click", this.onDocClick, true);
      document.addEventListener("keydown", this.onDocKeyDown);
    });
  }

  public close() {
    this.isOpen = false;
    this.panelEl.classList.remove("vjs-yt-panel-visible");
    this.panelEl.classList.add("vjs-yt-panel-hidden");

    document.removeEventListener("click", this.onDocClick, true);
    document.removeEventListener("keydown", this.onDocKeyDown);
  }

  private onDocClick(e: MouseEvent) {
    const target = e.target as Node;
    if (this.panelEl?.contains(target) || this.el()?.contains(target)) {
      return;
    }
    this.close();
  }

  private onDocKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      this.close();
    }
  }

  private updateViewIfOpen() {
    if (this.isOpen) {
      this.renderPanel();
    }
  }

  public updateBadge() {
    if (!this.hdBadgeEl) return;

    let is4K = false;
    let isHD = false;

    const labelToCheck =
      this.selectedSource?.label ||
      this.sources.find((s) => s.label?.includes("2160") || s.label?.includes("⁴ᴷ"))?.label;

    if (labelToCheck && (labelToCheck.includes("2160") || labelToCheck.includes("⁴ᴷ"))) {
      is4K = true;
    } else {
      const anyHD = this.sources.some(
        (s) =>
          s.label?.includes("ᴴᴰ") ||
          s.label?.includes("1080") ||
          s.label?.includes("720") ||
          s.label?.includes("1440")
      );
      const playerHeight = this.player()?.videoHeight() || 0;
      if (anyHD || playerHeight >= 720) {
        isHD = true;
      }
    }

    if (is4K) {
      this.hdBadgeEl.textContent = "4K";
      this.hdBadgeEl.style.display = "block";
    } else if (isHD) {
      this.hdBadgeEl.textContent = "HD";
      this.hdBadgeEl.style.display = "block";
    } else {
      this.hdBadgeEl.style.display = "none";
    }
  }

  private getSubtitleTracks(): TextTrack[] {
    const list = this.player().textTracks();
    if (!list) return [];
    const res: TextTrack[] = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.kind === "subtitles" || t.kind === "captions") {
        res.push(t);
      }
    }
    return res;
  }

  private getAudioTracks(): any[] {
    const list = (this.player() as any).audioTracks?.();
    if (!list) return [];
    const res: any[] = [];
    for (let i = 0; i < list.length; i++) {
      res.push(list[i]);
    }
    return res;
  }

  private getCurrentQualityLabel(): string {
    if (this.isAuto) {
      return this.autoLabel;
    }
    return this.selectedSource?.label || this.autoLabel;
  }

  private getCurrentSpeedLabel(): string {
    const rate = this.player().playbackRate();
    if (Math.abs(rate - 1) < 0.01) {
      return "正常";
    }
    return `${rate}x`;
  }

  private getCurrentSubtitleLabel(): string {
    const tracks = this.getSubtitleTracks();
    const active = tracks.find((t) => t.mode === "showing");
    if (!active) return "关闭";
    return active.label || active.language || "开启";
  }

  private getCurrentAudioLabel(): string {
    const tracks = this.getAudioTracks();
    const active = tracks.find((t) => t.enabled);
    if (!active) return "主音轨";
    return active.label || active.language || "主音轨";
  }

  private renderPanel() {
    this.panelEl.innerHTML = "";

    if (this.currentView === "main") {
      this.renderMainView();
    } else if (this.currentView === "quality") {
      this.renderQualityView();
    } else if (this.currentView === "speed") {
      this.renderSpeedView();
    } else if (this.currentView === "subtitles") {
      this.renderSubtitlesView();
    } else if (this.currentView === "audio") {
      this.renderAudioView();
    }
  }

  private renderMainView() {
    const container = document.createElement("div");
    container.className = "vjs-yt-menu-main";

    // 1. 画质 (Quality)
    const qualityRow = this.createMenuRow({
      iconHtml: SVG_ICONS.quality,
      title: "画质",
      value: this.getCurrentQualityLabel(),
      onClick: () => {
        this.currentView = "quality";
        this.renderPanel();
      },
    });
    container.appendChild(qualityRow);

    // 2. 播放速度 (Playback Speed)
    const speedRow = this.createMenuRow({
      iconHtml: SVG_ICONS.speed,
      title: "播放速度",
      value: this.getCurrentSpeedLabel(),
      onClick: () => {
        this.currentView = "speed";
        this.renderPanel();
      },
    });
    container.appendChild(speedRow);

    // 3. 字幕 (Subtitles - only if video has subtitle tracks)
    const subTracks = this.getSubtitleTracks();
    if (subTracks.length > 0) {
      const subRow = this.createMenuRow({
        iconHtml: SVG_ICONS.subtitles,
        title: "字幕",
        value: this.getCurrentSubtitleLabel(),
        onClick: () => {
          this.currentView = "subtitles";
          this.renderPanel();
        },
      });
      container.appendChild(subRow);
    }

    // 4. 音轨 (Audio Tracks - only if multiple audio tracks exist)
    const audioTracks = this.getAudioTracks();
    if (audioTracks.length > 1) {
      const audioRow = this.createMenuRow({
        iconHtml: SVG_ICONS.audio,
        title: "音轨",
        value: this.getCurrentAudioLabel(),
        onClick: () => {
          this.currentView = "audio";
          this.renderPanel();
        },
      });
      container.appendChild(audioRow);
    }

    this.panelEl.appendChild(container);
  }

  private createMenuRow(opts: {
    iconHtml: string;
    title: string;
    value: string;
    onClick: () => void;
  }): HTMLElement {
    const row = document.createElement("div");
    row.className = "vjs-yt-menu-row";
    row.innerHTML = `
      <div class="vjs-yt-menu-left">
        <span class="vjs-yt-menu-icon">${opts.iconHtml}</span>
        <span class="vjs-yt-menu-title">${opts.title}</span>
      </div>
      <div class="vjs-yt-menu-right">
        <span class="vjs-yt-menu-value">${opts.value}</span>
        <span class="vjs-yt-menu-arrow">${SVG_ICONS.arrow}</span>
      </div>
    `;
    row.addEventListener("click", opts.onClick);
    return row;
  }

  private createSubmenuHeader(title: string): HTMLElement {
    const header = document.createElement("div");
    header.className = "vjs-yt-submenu-header";
    header.innerHTML = `
      <span class="vjs-yt-back-arrow">${SVG_ICONS.back}</span>
      <span class="vjs-yt-submenu-title">${title}</span>
    `;
    header.addEventListener("click", () => {
      this.currentView = "main";
      this.renderPanel();
    });
    return header;
  }

  private renderQualityView() {
    const container = document.createElement("div");
    container.className = "vjs-yt-submenu";

    container.appendChild(this.createSubmenuHeader("画质"));

    const list = document.createElement("div");
    list.className = "vjs-yt-submenu-list";

    // 自动 (Auto)
    const autoItem = document.createElement("div");
    autoItem.className = `vjs-yt-submenu-item ${this.isAuto ? "vjs-yt-selected" : ""}`;
    autoItem.innerHTML = `
      <span class="vjs-yt-check">${SVG_ICONS.check}</span>
      <span class="vjs-yt-item-label">${this.autoLabel}</span>
    `;
    autoItem.addEventListener("click", () => {
      this.setAutoSelected();
      this.trigger("autoselected");
      this.close();
    });
    list.appendChild(autoItem);

    // 具体画质流列表
    for (const source of this.sources) {
      const isSelected = !this.isAuto && this.selectedSource === source;
      const isErrored = this.erroredSources.has(source.src);

      const item = document.createElement("div");
      item.className = `vjs-yt-submenu-item ${isSelected ? "vjs-yt-selected" : ""} ${
        isErrored ? "vjs-yt-item-error" : ""
      }`;
      const displayLabel = localizeStreamLabel(source.label || source.type) || "";
      item.innerHTML = `
        <span class="vjs-yt-check">${SVG_ICONS.check}</span>
        <span class="vjs-yt-item-label">${displayLabel}</span>
      `;
      item.addEventListener("click", () => {
        this.setSelectedSource(source);
        this.trigger("sourceselected", source);
        this.close();
      });
      list.appendChild(item);
    }

    container.appendChild(list);
    this.panelEl.appendChild(container);
  }

  private renderSpeedView() {
    const container = document.createElement("div");
    container.className = "vjs-yt-submenu";

    container.appendChild(this.createSubmenuHeader("播放速度"));

    const list = document.createElement("div");
    list.className = "vjs-yt-submenu-list";

    const currentRate = this.player().playbackRate();

    for (const speed of PLAYBACK_SPEEDS) {
      const isSelected = Math.abs(currentRate - speed) < 0.01;
      const displayLabel = speed === 1 ? "正常" : `${speed}x`;

      const item = document.createElement("div");
      item.className = `vjs-yt-submenu-item ${isSelected ? "vjs-yt-selected" : ""}`;
      item.innerHTML = `
        <span class="vjs-yt-check">${SVG_ICONS.check}</span>
        <span class="vjs-yt-item-label">${displayLabel}</span>
      `;
      item.addEventListener("click", () => {
        this.player().playbackRate(speed);
        this.currentView = "main";
        this.renderPanel();
      });
      list.appendChild(item);
    }

    container.appendChild(list);
    this.panelEl.appendChild(container);
  }

  private renderSubtitlesView() {
    const container = document.createElement("div");
    container.className = "vjs-yt-submenu";

    container.appendChild(this.createSubmenuHeader("字幕"));

    const list = document.createElement("div");
    list.className = "vjs-yt-submenu-list";

    const tracks = this.getSubtitleTracks();
    const hasActive = tracks.some((t) => t.mode === "showing");

    // 关闭选项
    const offItem = document.createElement("div");
    offItem.className = `vjs-yt-submenu-item ${!hasActive ? "vjs-yt-selected" : ""}`;
    offItem.innerHTML = `
      <span class="vjs-yt-check">${SVG_ICONS.check}</span>
      <span class="vjs-yt-item-label">关闭</span>
    `;
    offItem.addEventListener("click", () => {
      tracks.forEach((t) => {
        t.mode = "disabled";
      });
      this.currentView = "main";
      this.renderPanel();
    });
    list.appendChild(offItem);

    // 各字幕轨道
    for (const track of tracks) {
      const isSelected = track.mode === "showing";
      const item = document.createElement("div");
      item.className = `vjs-yt-submenu-item ${isSelected ? "vjs-yt-selected" : ""}`;
      item.innerHTML = `
        <span class="vjs-yt-check">${SVG_ICONS.check}</span>
        <span class="vjs-yt-item-label">${track.label || track.language || "字幕"}</span>
      `;
      item.addEventListener("click", () => {
        tracks.forEach((t) => {
          t.mode = t === track ? "showing" : "disabled";
        });
        this.currentView = "main";
        this.renderPanel();
      });
      list.appendChild(item);
    }

    container.appendChild(list);
    this.panelEl.appendChild(container);
  }

  private renderAudioView() {
    const container = document.createElement("div");
    container.className = "vjs-yt-submenu";

    container.appendChild(this.createSubmenuHeader("音轨"));

    const list = document.createElement("div");
    list.className = "vjs-yt-submenu-list";

    const tracks = this.getAudioTracks();

    for (const track of tracks) {
      const isSelected = track.enabled;
      const item = document.createElement("div");
      item.className = `vjs-yt-submenu-item ${isSelected ? "vjs-yt-selected" : ""}`;
      item.innerHTML = `
        <span class="vjs-yt-check">${SVG_ICONS.check}</span>
        <span class="vjs-yt-item-label">${track.label || track.language || "音轨"}</span>
      `;
      item.addEventListener("click", () => {
        tracks.forEach((t) => {
          t.enabled = t === track;
        });
        this.currentView = "main";
        this.renderPanel();
      });
      list.appendChild(item);
    }

    container.appendChild(list);
    this.panelEl.appendChild(container);
  }
}

class SourceSelectorPlugin extends videojs.getPlugin("plugin") {
  private button: YouTubeSettingsButton;
  private sources: ISource[] = [];
  private selectedIndex = -1;
  private isAuto = true;
  private cleanupTextTracks: HTMLTrackElement[] = [];
  private manualTextTracks: HTMLTrackElement[] = [];

  private manuallySelected = false;
  private shouldAutoplay: () => boolean = () => false;

  constructor(player: VideoJsPlayer) {
    super(player);

    this.button = new YouTubeSettingsButton(player);

    this.button.on("autoselected", () => {
      this.isAuto = true;
      this.manuallySelected = false;

      let targetIndex = this.sources.findIndex((s) => !s.errored);
      if (targetIndex === -1) {
        targetIndex = 0;
      }

      if (this.sources.length === 0) return;

      const targetSource = this.sources[targetIndex];
      if (
        this.selectedIndex === targetIndex &&
        player.currentSrc() === targetSource.src
      ) {
        return;
      }

      this.selectedIndex = targetIndex;
      const currentTime = player.currentTime();
      const paused = player.paused();

      player.src(targetSource);
      player.one("canplay", () => {
        if (paused) {
          player.pause();
        }
        player.currentTime(currentTime);
      });
      if (this.shouldAutoplay() || !paused) {
        player.play();
      }
    });

    this.button.on("sourceselected", (_, source: ISource) => {
      this.selectedIndex = this.sources.indexOf(source);
      if (this.selectedIndex === -1) return;

      this.isAuto = false;
      this.manuallySelected = true;

      source.errored = false;
      this.button.unmarkSourceErrored(source);

      const loadSrc = this.sources[this.selectedIndex];

      const currentTime = player.currentTime();
      const paused = player.paused();

      player.src(loadSrc);
      player.one("canplay", () => {
        if (paused) {
          player.pause();
        }
        player.currentTime(currentTime);
      });
      player.play();
    });

    player.ready(() => {
      try {
        const { controlBar } = player;
        const cbEl = controlBar?.el();
        if (!cbEl) return;

        if (!controlBar.getChild("YouTubeSettingsButton")) {
          controlBar.addChild(this.button);
        }

        const fullscreenToggle = controlBar.getChild("fullscreenToggle");
        if (
          fullscreenToggle &&
          fullscreenToggle.el() &&
          fullscreenToggle.el().parentNode === cbEl
        ) {
          cbEl.insertBefore(this.button.el(), fullscreenToggle.el());
        }
      } catch (err) {
        console.warn("Failed to position YouTubeSettingsButton:", err);
      }
    });

    player.on("loadedmetadata", () => {
      if (!player.videoWidth() && !player.videoHeight()) {
        if (player.error() !== null) return;

        const currentSrc = player.currentSrc();
        if (currentSrc === null) return;

        if (currentSrc.includes(".m3u8") || currentSrc.includes(".mpd")) {
          if (this.shouldAutoplay()) {
            player.play();
          }
        } else {
          player.error(MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED);
          return;
        }
      }
    });

    player.on("error", () => {
      const error = player.error();
      if (!error) return;

      if (
        error.code !== MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED &&
        error.code !== MediaError.MEDIA_ERR_DECODE
      )
        return;

      const currentSource = player.currentSource() as ISource;
      console.log(`Source '${currentSource?.label}' is unsupported`);

      if (currentSource) {
        currentSource.errored = true;
        this.button.markSourceErrored(currentSource);
      }

      if (this.manuallySelected) {
        return;
      }

      if (
        this.selectedIndex !== -1 &&
        this.selectedIndex + 1 < this.sources.length
      ) {
        this.selectedIndex += 1;
        const newSource = this.sources[this.selectedIndex];
        console.log(`Trying next source in playlist: '${newSource.label}'`);

        const currentTime = player.currentTime();
        player.src(newSource);
        player.load();
        player.one("canplay", () => {
          player.currentTime(currentTime);
        });
        if (this.shouldAutoplay()) {
          player.play();
        }
      } else {
        console.log("No more sources in playlist");
      }
    });
  }

  setSources(sources: ISource[], autoLabel: string = "自动") {
    const cleanupTracks = this.cleanupTextTracks.splice(0);
    for (const track of cleanupTracks) {
      this.player.removeRemoteTextTrack(track);
    }

    this.isAuto = true;
    this.manuallySelected = false;
    this.sources = sources;

    this.button.setSources(sources, autoLabel);

    if (sources.length !== 0) {
      this.selectedIndex = 0;
      this.player.src(sources[0]);
    } else {
      this.selectedIndex = -1;
    }
  }

  setShouldAutoplay(fn: () => boolean) {
    this.shouldAutoplay = fn;
  }

  addTextTrack(options: videojs.TextTrackOptions, manualCleanup: boolean) {
    const track = this.player.addRemoteTextTrack(options, manualCleanup);
    if (manualCleanup) {
      this.manualTextTracks.push(track);
    } else {
      this.cleanupTextTracks.push(track);
    }
    return track;
  }
}

videojs.registerComponent("YouTubeSettingsButton", YouTubeSettingsButton);
videojs.registerPlugin("sourceSelector", SourceSelectorPlugin);

declare module "video.js" {
  interface VideoJsPlayer {
    sourceSelector: () => SourceSelectorPlugin;
  }
  interface VideoJsPlayerPluginOptions {
    sourceSelector?: object;
  }
}

export default SourceSelectorPlugin;
