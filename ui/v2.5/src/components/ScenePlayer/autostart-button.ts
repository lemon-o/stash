import videojs, { VideoJsPlayer } from "video.js";

interface IAutostartButtonOptions {
  enabled?: boolean;
}

interface AutostartButtonOptions extends videojs.ComponentOptions {
  autostartEnabled: boolean;
}

class AutostartButton extends videojs.getComponent("Button") {
  private autostartEnabled: boolean;

  constructor(player: VideoJsPlayer, options: AutostartButtonOptions) {
    super(player, options);
    this.autostartEnabled = options.autostartEnabled;
    this.updateIcon();
  }

  buildCSSClass() {
    return `vjs-autostart-button ${super.buildCSSClass()}`;
  }

  createEl(tag: string = "button", props?: any, attributes?: any): HTMLButtonElement {
    return super.createEl(
      tag || "button",
      {
        className: this.buildCSSClass(),
        type: "button",
        ...props,
      },
      attributes
    ) as HTMLButtonElement;
  }

  public toggle() {
    this.autostartEnabled = !this.autostartEnabled;
    this.updateIcon();
    this.trigger("autostartchanged", { enabled: this.autostartEnabled });
  }

  private updateIcon() {
    this.removeClass("vjs-icon-play-circle");
    this.removeClass("vjs-icon-cancel");

    if (this.autostartEnabled) {
      this.addClass("vjs-icon-play-circle");
      const text = this.localize("Auto-start enabled (click to disable)");
      this.controlText(text);
      this.el()?.setAttribute("title", text);
    } else {
      this.addClass("vjs-icon-cancel");
      const text = this.localize("Auto-start disabled (click to enable)");
      this.controlText(text);
      this.el()?.setAttribute("title", text);
    }
  }

  handleClick(event: Event) {
    // Prevent the click from bubbling up and affecting the video player
    if (event) {
      event.stopPropagation();
    }
    this.toggle();
  }

  public setEnabled(enabled: boolean) {
    this.autostartEnabled = enabled;
    this.updateIcon();
  }
}

class AutostartButtonPlugin extends videojs.getPlugin("plugin") {
  private button: AutostartButton;
  private autostartEnabled: boolean;
  updateAutoStart: (enabled: boolean) => Promise<void> = () => {
    return Promise.resolve();
  };

  constructor(player: VideoJsPlayer, options?: IAutostartButtonOptions) {
    super(player, options);

    this.autostartEnabled = options?.enabled ?? true;

    this.button = new AutostartButton(player, {
      autostartEnabled: this.autostartEnabled,
    });

    player.ready(() => {
      this.ready();
    });
  }

  private ready() {
    try {
      const { controlBar } = this.player;
      const cbEl = controlBar?.el();
      if (!cbEl) return;

      if (!controlBar.getChild("AutostartButton")) {
        controlBar.addChild(this.button);
      }

      const subsCaps = controlBar.getChild("subsCapsButton");
      const settingsBtn = controlBar.getChild("YouTubeSettingsButton");
      const fullscreenToggle = controlBar.getChild("fullscreenToggle");

      // Desired YouTube order: [autostart] -> [subsCaps (if in DOM)] -> [settings] -> [fullscreen]
      if (subsCaps && subsCaps.el() && subsCaps.el().parentNode === cbEl) {
        cbEl.insertBefore(this.button.el(), subsCaps.el());
      } else if (settingsBtn && settingsBtn.el() && settingsBtn.el().parentNode === cbEl) {
        cbEl.insertBefore(this.button.el(), settingsBtn.el());
      } else if (fullscreenToggle && fullscreenToggle.el() && fullscreenToggle.el().parentNode === cbEl) {
        cbEl.insertBefore(this.button.el(), fullscreenToggle.el());
      }
    } catch (err) {
      console.warn("Failed to position AutostartButton:", err);
    }

    // Listen for changes
    this.button.on("autostartchanged", (_, data: { enabled: boolean }) => {
      this.autostartEnabled = data.enabled;
      this.updateAutoStart(this.autostartEnabled);
    });
  }

  public isEnabled(): boolean {
    return this.autostartEnabled;
  }

  public getEnabled(): boolean {
    return this.autostartEnabled;
  }

  public setEnabled(enabled: boolean) {
    this.autostartEnabled = enabled;
    this.button.setEnabled(enabled);
  }

  public syncWithConfig(configEnabled: boolean) {
    // Sync button state with external config changes
    if (this.autostartEnabled !== configEnabled) {
      this.setEnabled(configEnabled);
    }
  }
}

// Register the plugin with video.js.
videojs.registerComponent("AutostartButton", AutostartButton);
videojs.registerPlugin("autostartButton", AutostartButtonPlugin);

declare module "video.js" {
  interface VideoJsPlayer {
    autostartButton: () => AutostartButtonPlugin;
  }
  interface VideoJsPlayerPluginOptions {
    autostartButton?: IAutostartButtonOptions;
  }
}

export default AutostartButtonPlugin;
