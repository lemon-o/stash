import React, {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import videojs, { VideoJsPlayer, VideoJsPlayerOptions } from "video.js";
import useScript from "src/hooks/useScript";
import "videojs-contrib-dash";
import "videojs-mobile-ui";
import "./touch-gestures";
import { UAParser } from "ua-parser-js";
import { useIntl } from "react-intl";
import "./live";
import "./PlaylistButtons";
import "./source-selector";
import "./persist-volume";
import "./autostart-button";
import "./vjs-i18n";
import { syncControlBarTitles } from "./vjs-i18n";
import MarkersPlugin, { type IMarker } from "./markers";
void MarkersPlugin;
import "./vtt-thumbnails";
import "./big-buttons";
import "./track-activity";
import "./vrmode";
import "./media-session";
import "./wake-sentinel";
import cx from "classnames";
import {
  useSceneSaveActivity,
  useSceneIncrementPlayCount,
  useConfigureInterface,
} from "src/core/StashService";

import * as GQL from "src/core/generated-graphql";
import { ScenePlayerScrubber } from "./ScenePlayerScrubber";
import { useConfigurationContext } from "src/hooks/Config";
import {
  ConnectionState,
  InteractiveContext,
} from "src/hooks/Interactive/context";
import { SceneInteractiveStatus } from "src/hooks/Interactive/status";
import { languageMap } from "src/utils/caption";
import { VIDEO_PLAYER_ID } from "./util";

// @ts-expect-error
import airplay from "@silvermine/videojs-airplay";
// @ts-expect-error
import chromecast from "@silvermine/videojs-chromecast";
import abLoopPlugin from "videojs-abloop";
import ScreenUtils from "src/utils/screen";
import { PatchComponent } from "src/patch";

// register videojs plugins
airplay(videojs);
chromecast(videojs);
abLoopPlugin(window, videojs);

function handleHotkeys(player: VideoJsPlayer, event: videojs.KeyboardEvent) {
  function seekStep(step: number) {
    const time = player.currentTime() + step;
    const duration = player.duration();
    if (time < 0) {
      player.currentTime(0);
    } else if (time < duration) {
      player.currentTime(time);
    } else {
      player.currentTime(duration);
    }
  }

  function seekPercent(percent: number) {
    const duration = player.duration();
    const time = duration * percent;
    player.currentTime(time);
  }

  function seekPercentRelative(percent: number) {
    const duration = player.duration();
    const currentTime = player.currentTime();
    const time = currentTime + duration * percent;
    if (time > duration) return;
    player.currentTime(time);
  }

  function toggleABLooping() {
    const opts = player.abLoopPlugin.getOptions();
    if (!opts.start) {
      opts.start = player.currentTime();
    } else if (!opts.end) {
      opts.end = player.currentTime();
      opts.enabled = true;
    } else {
      opts.start = 0;
      opts.end = 0;
      opts.enabled = false;
    }
    player.abLoopPlugin.setOptions(opts);
  }

  let seekFactor = 10;
  if (event.shiftKey) {
    seekFactor = 5;
  } else if (event.ctrlKey || event.altKey) {
    seekFactor = 60;
  }
  switch (event.which) {
    case 39: // right arrow
      seekStep(seekFactor);
      break;
    case 37: // left arrow
      seekStep(-seekFactor);
      break;
  }

  // toggle player looping with shift+l
  if (event.shiftKey && event.which === 76) {
    player.loop(!player.loop());
    return;
  }

  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }

  const skipButtons = player.skipButtons();
  if (skipButtons) {
    // handle multimedia keys
    switch (event.key) {
      case "MediaTrackNext":
        if (!skipButtons.onNext) return;
        skipButtons.onNext();
        break;
      case "MediaTrackPrevious":
        if (!skipButtons.onPrevious) return;
        skipButtons.onPrevious();
        break;
      // MediaPlayPause handled by videojs
    }
  }

  switch (event.which) {
    case 32: // space
    case 13: // enter
      if (player.paused()) player.play();
      else player.pause();
      break;
    case 77: // m
      player.muted(!player.muted());
      break;
    case 70: // f
      if (player.isFullscreen()) player.exitFullscreen();
      else player.requestFullscreen();
      break;
    case 76: // l
      toggleABLooping();
      break;
    case 38: // up arrow
      player.volume(player.volume() + 0.1);
      break;
    case 40: // down arrow
      player.volume(player.volume() - 0.1);
      break;
    case 48: // 0
      player.currentTime(0);
      break;
    case 49: // 1
      seekPercent(0.1);
      break;
    case 50: // 2
      seekPercent(0.2);
      break;
    case 51: // 3
      seekPercent(0.3);
      break;
    case 52: // 4
      seekPercent(0.4);
      break;
    case 53: // 5
      seekPercent(0.5);
      break;
    case 54: // 6
      seekPercent(0.6);
      break;
    case 55: // 7
      seekPercent(0.7);
      break;
    case 56: // 8
      seekPercent(0.8);
      break;
    case 57: // 9
      seekPercent(0.9);
      break;
    case 221: // ]
      seekPercentRelative(0.1);
      break;
    case 219: // [
      seekPercentRelative(-0.1);
      break;
  }
}

type MarkerFragment = Pick<GQL.SceneMarker, "title" | "seconds"> & {
  primary_tag: Pick<GQL.Tag, "name">;
  tags: Array<Pick<GQL.Tag, "name">>;
};

function getMarkerTitle(marker: MarkerFragment) {
  if (marker.title) {
    return marker.title;
  }

  let ret = marker.primary_tag.name;
  if (marker.tags.length) {
    ret += `, ${marker.tags.map((t) => t.name).join(", ")}`;
  }

  return ret;
}

interface IScenePlayerProps {
  scene: GQL.SceneDataFragment;
  hideScrubberOverride: boolean;
  autoplay?: boolean;
  permitLoop?: boolean;
  initialTimestamp: number;
  sendSetTimestamp: (setTimestamp: (value: number) => void) => void;
  onComplete: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

export const ScenePlayer: React.FC<IScenePlayerProps> = PatchComponent(
  "ScenePlayer",
  ({
    scene,
    hideScrubberOverride,
    autoplay,
    permitLoop = true,
    initialTimestamp: _initialTimestamp,
    sendSetTimestamp,
    onComplete,
    onNext,
    onPrevious,
  }) => {
    const { configuration } = useConfigurationContext();
    const interfaceConfig = configuration?.interface;
    const uiConfig = configuration?.ui;
    const videoRef = useRef<HTMLDivElement>(null);
    const [_player, setPlayer] = useState<VideoJsPlayer>();
    const sceneId = useRef<string>();
    const [sceneSaveActivity] = useSceneSaveActivity();
    const [sceneIncrementPlayCount] = useSceneIncrementPlayCount();
    const [updateInterfaceConfig] = useConfigureInterface();
    const intl = useIntl();

    const [time, setTime] = useState(0);
    const [ready, setReady] = useState(false);

    const {
      interactive: interactiveClient,
      uploadScript,
      currentScript,
      initialised: interactiveInitialised,
      state: interactiveState,
    } = React.useContext(InteractiveContext);

    const [fullscreen, setFullscreen] = useState(false);
    const [showScrubber, setShowScrubber] = useState(false);

    const started = useRef(false);
    const auto = useRef(false);
    // durable autostart intent: unlike `auto`, this is not consumed by the
    // one-shot play effect, so it survives source failover (e.g. transcode fallback)
    const autostartIntent = useRef(false);
    const interactiveReady = useRef(false);
    const minimumPlayPercent = uiConfig?.minimumPlayPercent ?? 0;
    const trackActivity = uiConfig?.trackActivity ?? true;
    const vrTag = uiConfig?.vrTag ?? undefined;

    useScript(
      "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1",
      uiConfig?.enableChromecast
    );

    const file = useMemo(
      () => (scene.files.length > 0 ? scene.files[0] : undefined),
      [scene]
    );

    const maxLoopDuration = interfaceConfig?.maximumLoopDuration ?? 0;
    const looping = useMemo(
      () =>
        !!file?.duration &&
        permitLoop &&
        maxLoopDuration !== 0 &&
        file.duration < maxLoopDuration,
      [file, permitLoop, maxLoopDuration]
    );

    const getPlayer = useCallback(() => {
      if (!_player) return null;
      if (_player.isDisposed()) return null;
      return _player;
    }, [_player]);

    useEffect(() => {
      if (hideScrubberOverride || fullscreen) {
        setShowScrubber(false);
        return;
      }

      const onResize = () => {
        const show = window.innerHeight >= 450 && !ScreenUtils.isMobile();
        setShowScrubber(show);
      };
      onResize();

      window.addEventListener("resize", onResize);

      return () => window.removeEventListener("resize", onResize);
    }, [hideScrubberOverride, fullscreen]);

    useEffect(() => {
      sendSetTimestamp((value: number) => {
        const player = getPlayer();
        if (player && value >= 0) {
          if (player.hasStarted() && player.paused()) {
            player.currentTime(value);
          } else {
            player.play()?.then(() => {
              player.currentTime(value);
            });
          }
        }
      });
    }, [sendSetTimestamp, getPlayer]);

    // Initialize VideoJS player
    useEffect(() => {
      const options: VideoJsPlayerOptions = {
        id: VIDEO_PLAYER_ID,
        controls: true,
        language: intl.locale || "zh-CN",
        controlBar: {
          pictureInPictureToggle: false,
          volumePanel: {
            inline: false,
          },
          chaptersButton: false,
          descriptionsButton: false,
          audioTrackButton: false,
          playbackRateMenuButton: false,
        },
        html5: {
          dash: {
            updateSettings: [
              {
                streaming: {
                  buffer: {
                    bufferTimeAtTopQuality: 30,
                    bufferTimeAtTopQualityLongForm: 30,
                  },
                  gaps: {
                    jumpGaps: false,
                    jumpLargeGaps: false,
                  },
                },
              },
            ],
          },
        },
        nativeControlsForTouch: false,
        playbackRates: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
        inactivityTimeout: ScreenUtils.isMobile() ? 3500 : 2500,
        preload: "none",
        playsinline: true,
        techOrder: ["chromecast", "html5"],
        userActions: {
          hotkeys: function (this: VideoJsPlayer, event) {
            handleHotkeys(this, event);
          },
        },
        plugins: {
          airPlay: {
            addButtonToControlBar: uiConfig?.enableChromecast ?? false,
          },
          chromecast: {},
          vttThumbnails: {
            showTimestamp: true,
          },
          markers: {},
          sourceSelector: {},
          persistVolume: {},
          bigButtons: {},
          touchGestures: {},
          skipButtons: {},
          trackActivity: {},
          vrMenu: {},
          autostartButton: {
            enabled: interfaceConfig?.autostartVideo ?? true,
          },
          abLoopPlugin: {
            start: 0,
            end: false,
            enabled: false,
            loopIfBeforeStart: true,
            loopIfAfterEnd: true,
            pauseAfterLooping: false,
            pauseBeforeLooping: false,
            createButtons: uiConfig?.showAbLoopControls ?? false,
          },
          mediaSession: {},
          wakeSentinel: {},
        },
      };

      const videoEl = document.createElement("video-js");
      videoEl.setAttribute("data-vjs-player", "true");
      videoEl.setAttribute("crossorigin", "anonymous");
      videoEl.classList.add("vjs-big-play-centered");
      videoRef.current!.appendChild(videoEl);

      const vjs = videojs(videoEl, options);

      vjs.ready(() => {
        syncControlBarTitles(vjs);
      });
      vjs.on(
        ["play", "pause", "volumechange", "fullscreenchange"],
        () => {
          syncControlBarTitles(vjs);
        }
      );
      setTimeout(() => {
        syncControlBarTitles(vjs);
      }, 500);

      /* biome-ignore lint/suspicious/noExplicitAny: intentional */
      const settings = (vjs as any).textTrackSettings;
      settings.setValues({
        backgroundColor: "#000",
        backgroundOpacity: "0.5",
      });
      settings.updateDisplay();

      vjs.focus();
      setPlayer(vjs);

      // Video player destructor
      return () => {
        vjs.dispose();
        videoEl.remove();
        setPlayer(undefined);

        // reset sceneId to force reload sources
        sceneId.current = undefined;
      };
      // empty deps - only init once
      // showAbLoopControls is necessary to re-init the player when the config changes
      // Note: interfaceConfig?.autostartVideo is intentionally excluded to prevent
      // player re-initialization when toggling autostart (which would interrupt playback)
      // XXbiome-ignore lint/correctness/useExhaustiveDependencies: intentional
    }, [
      uiConfig?.showAbLoopControls,
      uiConfig?.enableChromecast,
      intl.locale,
    ]);

    useEffect(() => {
      const player = getPlayer();
      if (!player) return;
      player.language(intl.locale || "zh-CN");
      syncControlBarTitles(player);
    }, [intl.locale, getPlayer]);

    useEffect(() => {
      const player = getPlayer();
      if (!player) return;
      const skipButtons = player.skipButtons();
      skipButtons.setForwardHandler(onNext);
      skipButtons.setBackwardHandler(onPrevious);
    }, [getPlayer, onNext, onPrevious]);

    useEffect(() => {
      if (scene.interactive && interactiveInitialised) {
        interactiveReady.current = false;
        uploadScript(scene.paths.funscript || "").then(() => {
          interactiveReady.current = true;
        });
      }
    }, [
      uploadScript,
      interactiveInitialised,
      scene.interactive,
      scene.paths.funscript,
    ]);

    // play the script if video started before script upload finished
    useEffect(() => {
      if (interactiveState !== ConnectionState.Ready) return;
      const player = getPlayer();
      if (!player || player.paused()) return;
      interactiveClient.ensurePlaying(player.currentTime());
    }, [interactiveState, getPlayer, interactiveClient]);

    useEffect(() => {
      const player = getPlayer();
      if (!player) return;

      const vrMenu = player.vrMenu();

      let showButton = false;

      if (vrTag) {
        showButton = scene.tags.some((tag) => vrTag === tag.name);
      }

      vrMenu.setShowButton(showButton);
    }, [getPlayer, scene, vrTag]);

    // Player event handlers
    useEffect(() => {
      const player = getPlayer();
      if (!player) return;

      function canplay(this: VideoJsPlayer) {
        // if we're seeking before starting, don't set the initial timestamp
        // when starting from the beginning, there is a small delay before the event
        // is triggered, so we can't just check if the time is 0
        if (this.currentTime() >= 0.1) {
          return;
        }
      }

      function playing(this: VideoJsPlayer) {
        // This still runs even if autoplay failed on Safari,
        // only set flag if actually playing
        if (!started.current && !this.paused()) {
          started.current = true;
        }
      }

      function loadstart(this: VideoJsPlayer) {
        setReady(true);
      }

      function fullscreenchange(this: VideoJsPlayer) {
        setFullscreen(this.isFullscreen());
      }

      player.on("canplay", canplay);
      player.on("playing", playing);
      player.on("loadstart", loadstart);
      player.on("fullscreenchange", fullscreenchange);

      return () => {
        player.off("canplay", canplay);
        player.off("playing", playing);
        player.off("loadstart", loadstart);
        player.off("fullscreenchange", fullscreenchange);
      };
    }, [getPlayer]);

    // delay before second play event after a play event to adjust for video player issues
    const DELAY_FOR_SECOND_PLAY_MS = 1000;
    const playingTimer = useRef<number>();

    useEffect(() => {
      const player = getPlayer();
      if (!player) return;

      function playing(this: VideoJsPlayer) {
        if (scene.interactive && interactiveReady.current) {
          interactiveClient.play(this.currentTime());
          // trigger a second script play event to adjust for video player issues
          clearTimeout(playingTimer.current);
          playingTimer.current = setTimeout(() => {
            if (this.paused()) return;
            interactiveClient.play(this.currentTime());
          }, DELAY_FOR_SECOND_PLAY_MS);
        }
      }

      function pause(this: VideoJsPlayer) {
        interactiveClient.pause();
      }

      function timeupdate(this: VideoJsPlayer) {
        if (this.paused()) return;
        setTime(this.currentTime());
      }

      player.on("playing", playing);
      player.on("pause", pause);
      player.on("timeupdate", timeupdate);

      return () => {
        player.off("playing", playing);
        player.off("pause", pause);
        player.off("timeupdate", timeupdate);
        clearTimeout(playingTimer.current);
      };
    }, [getPlayer, interactiveClient, scene]);

    useEffect(() => {
      const player = getPlayer();
      if (!player) return;

      // don't re-initialise the player unless the scene has changed
      if (!file || scene.id === sceneId.current) return;

      sceneId.current = scene.id;

      setReady(false);

      // reset on new scene
      player.trackActivity().reset();

      // always stop the interactive client on initialisation
      interactiveClient.pause();

      const isSafari = UAParser().browser.name?.includes("Safari");
      const isLandscape = file.height && file.width && file.width > file.height;
      const mobileUiOptions = {
        fullscreen: {
          enterOnRotate: true,
          exitOnRotate: true,
          lockOnRotate: true,
          lockToLandscapeOnEnter: uiConfig?.disableMobileMediaAutoRotateEnabled
            ? false
            : isLandscape,
        },
        touchControls: {
          disabled: true,
        },
      };
      if (!isSafari) {
        player.mobileUi(mobileUiOptions);
      }

      function isDirect(src: URL) {
        return (
          src.pathname.endsWith("/stream") ||
          src.pathname.endsWith("/stream.mpd") ||
          src.pathname.endsWith("/stream.m3u8") ||
          src.pathname.endsWith("/stream.mkv")
        );
      }

      const { duration } = file;
      const sourceSelector = player.sourceSelector();

      // Native resolution of the video file (e.g. 720, 1080, 2160)
      const videoHeight =
        Math.min(file?.width || 0, file?.height || 0) ||
        file?.height ||
        file?.width ||
        0;

      // 1. Separate direct stream and transcode streams
      const directStreams: typeof scene.sceneStreams = [];
      const transcodeStreams: typeof scene.sceneStreams = [];

      for (const stream of scene.sceneStreams) {
        const src = new URL(stream.url);
        if (isDirect(src)) {
          directStreams.push(stream);
        } else {
          // "不需要两种画质一样的转码格式，哪种转码快用哪种"
          // Filter out WebM; keep MP4 (H.264 is universally faster and hardware accelerated)
          const isWebm =
            src.pathname.endsWith("/stream.webm") ||
            stream.mime_type === "video/webm";
          if (!isWebm) {
            transcodeStreams.push(stream);
          }
        }
      }

      // 2. Direct stream ("原画")
      const primaryDirect =
        directStreams.find((s) =>
          new URL(s.url).pathname.endsWith("/stream")
        ) || directStreams[0];

      const processedDirectStreams = primaryDirect
        ? [
            {
              src: primaryDirect.url,
              type: primaryDirect.mime_type ?? undefined,
              label: intl.formatMessage({
                id: "direct_stream",
                defaultMessage: "原画",
              }),
              offset: false,
              duration,
            },
          ]
        : [];

      // 3. YouTube-style transcode tiers ("其他挡位参考如图YouTube的画质挡位，基于原画往下转码")
      const standardHeightMap: Record<string, number> = {
        FOUR_K: 2160,
        FULL_HD: 1080,
        STANDARD_HD: 720,
        STANDARD: 480,
        LOW: 240,
      };

      function getYouTubeResolutionLabel(height: number): string {
        if (height >= 2160) return "2160p ⁴ᴷ";
        if (height >= 1440) return "1440p ᴴᴰ";
        if (height >= 1080) return "1080p ᴴᴰ";
        if (height >= 720) return "720p";
        if (height >= 480) return "480p";
        if (height >= 360) return "360p";
        if (height >= 240) return "240p";
        if (height >= 144) return "144p";
        return `${height}p`;
      }

      interface TranscodeCandidate {
        stream: (typeof scene.sceneStreams)[0];
        height: number;
        label: string;
      }

      const candidates: TranscodeCandidate[] = [];

      for (const stream of transcodeStreams) {
        const src = new URL(stream.url);
        const isFileTranscode = !isDirect(src);
        if (isFileTranscode && isSafari) continue;

        const resParam = src.searchParams.get("resolution") || "";
        let targetHeight = 0;

        if (resParam === "ORIGINAL") {
          targetHeight = videoHeight;
        } else if (standardHeightMap[resParam]) {
          targetHeight = standardHeightMap[resParam];
        } else {
          const match = stream.label?.match(/\((\d+)p\)/);
          if (match) {
            targetHeight = parseInt(match[1], 10);
          }
        }

        // "基于原画往下转码": only transcode downwards from video's native resolution
        if (videoHeight > 0 && targetHeight > videoHeight) {
          continue;
        }

        if (targetHeight > 0) {
          candidates.push({
            stream,
            height: targetHeight,
            label: getYouTubeResolutionLabel(targetHeight),
          });
        }
      }

      // Sort descending by height (e.g. 2160 -> 1440 -> 1080 -> 720 -> 480 -> 240)
      candidates.sort((a, b) => b.height - a.height);

      // Deduplicate: "不需要两种画质一样的转码格式" (keep only 1 fastest MP4 stream per height)
      const seenHeights = new Set<number>();
      const processedTranscodeStreams: typeof processedDirectStreams = [];

      for (const candidate of candidates) {
        if (seenHeights.has(candidate.height)) {
          continue;
        }
        seenHeights.add(candidate.height);

        const src = new URL(candidate.stream.url);
        processedTranscodeStreams.push({
          src: candidate.stream.url,
          type: candidate.stream.mime_type ?? undefined,
          label: candidate.label,
          offset: !isDirect(src),
          duration,
        });
      }

      const finalSources = [
        ...processedDirectStreams,
        ...processedTranscodeStreams,
      ];

      sourceSelector.setSources(
        finalSources,
        intl.formatMessage({
          id: "auto",
          defaultMessage: "自动",
        })
      );

      function getDefaultLanguageCode() {
        let languageCode = window.navigator.language;

        if (languageCode.indexOf("-") !== -1) {
          languageCode = languageCode.split("-")[0];
        }

        if (languageCode.indexOf("_") !== -1) {
          languageCode = languageCode.split("_")[0];
        }

        return languageCode;
      }

      if (scene.paths.caption && scene.captions && scene.captions.length > 0) {
        const languageCode = getDefaultLanguageCode();
        let hasDefault = false;

        for (const caption of scene.captions) {
          const lang = caption.language_code;
          let label = lang;
          if (languageMap.has(lang)) {
            label = languageMap.get(lang)!;
          }

          label = label + " (" + caption.caption_type + ")";
          const setAsDefault = !hasDefault && languageCode === lang;
          if (setAsDefault) {
            hasDefault = true;
          }
          const captionURL = new URL(scene.paths.caption, window.location.href);
          captionURL.searchParams.set("lang", lang);
          captionURL.searchParams.set("type", caption.caption_type);

          sourceSelector.addTextTrack(
            {
              src: captionURL.toString(),
              kind: "captions",
              srclang: lang,
              label: label,
              default: setAsDefault,
            },
            false
          );
        }
      }

      const alwaysStartFromBeginning =
        uiConfig?.alwaysStartFromBeginning ?? false;
      const resumeTime = scene.resume_time ?? 0;

      let startPosition = _initialTimestamp;
      if (
        !startPosition &&
        !alwaysStartFromBeginning &&
        file.duration > resumeTime
      ) {
        startPosition = resumeTime;
      }

      setTime(startPosition);

      player.load();
      player.focus();

      // Check the autostart button plugin for user preference
      const autostartButton = player.autostartButton();
      const buttonEnabled = autostartButton.getEnabled();
      auto.current =
        autoplay ||
        buttonEnabled ||
        (interfaceConfig?.autostartVideo ?? true) ||
        _initialTimestamp > 0;
      autostartIntent.current = auto.current;

      // let the source selector know whether playback is intended, so it doesn't
      // auto-start during source failover/preload (e.g. transcode fallback in Safari).
      // uses autostartIntent (not auto) because auto is cleared by the one-shot play
      // effect before failover occurs; started covers mid-playback source swaps.
      sourceSelector.setShouldAutoplay(
        () => autostartIntent.current || started.current
      );

      player.ready(() => {
        player.vttThumbnails().src(scene.paths.vtt ?? null);

        if (startPosition) {
          player.currentTime(startPosition);
        }
      });

      started.current = false;
    }, [
      getPlayer,
      file,
      scene,
      interactiveClient,
      autoplay,
      interfaceConfig?.autostartVideo,
      uiConfig?.alwaysStartFromBeginning,
      uiConfig?.disableMobileMediaAutoRotateEnabled,
      _initialTimestamp,
    ]);

    useEffect(() => {
      return () => {
        // stop the interactive client on unmount
        interactiveClient.pause();
      };
    }, [interactiveClient]);

    const loadMarkers = useCallback(() => {
      const player = getPlayer();
      if (!player) return;

      const markerData = scene.scene_markers.map((marker) => ({
        title: getMarkerTitle(marker),
        seconds: marker.seconds,
        end_seconds: marker.end_seconds ?? null,
        primaryTag: marker.primary_tag,
      }));

      const markers = player!.markers();

      const uniqueTagNames = markerData
        .map((marker) => marker.primaryTag.name)
        .filter((value, index, self) => self.indexOf(value) === index);

      // Wait for colors
      markers.findColors(uniqueTagNames);

      const showRangeTags =
        !ScreenUtils.isMobile() && (uiConfig?.showRangeMarkers ?? true);
      const timestampMarkers: IMarker[] = [];
      const rangeMarkers: IMarker[] = [];

      if (!showRangeTags) {
        for (const marker of markerData) {
          timestampMarkers.push(marker);
        }
      } else {
        for (const marker of markerData) {
          if (marker.end_seconds === null) {
            timestampMarkers.push(marker);
          } else {
            rangeMarkers.push(marker);
          }
        }
      }

      requestAnimationFrame(() => {
        markers.addDotMarkers(timestampMarkers);
        markers.addRangeMarkers(rangeMarkers);
      });
    }, [getPlayer, scene, uiConfig]);

    useEffect(() => {
      const player = getPlayer();
      if (!player) return;

      if (scene.paths.screenshot) {
        player.poster(scene.paths.screenshot);
      } else {
        player.poster("");
      }

      // Define the event handler outside the useEffect
      const handleLoadMetadata = () => {
        loadMarkers();
      };

      // Ensure markers are added after player is fully ready and sources are loaded
      if (player.readyState() >= 1) {
        loadMarkers();
      } else {
        player.on("loadedmetadata", handleLoadMetadata);
      }

      return () => {
        player.off("loadedmetadata", handleLoadMetadata);
        const markers = player!.markers();
        markers.clearMarkers();
      };
    }, [getPlayer, scene, loadMarkers]);

    useEffect(() => {
      const player = getPlayer();
      if (!player) return;

      async function saveActivity(resumeTime: number, playDuration: number) {
        if (!scene.id) return;

        await sceneSaveActivity({
          variables: {
            id: scene.id,
            playDuration,
            resume_time: resumeTime,
          },
        });
      }

      async function incrementPlayCount() {
        if (!scene.id) return;

        await sceneIncrementPlayCount({
          variables: {
            id: scene.id,
          },
        });
      }

      const activity = player.trackActivity();
      activity.saveActivity = saveActivity;
      activity.incrementPlayCount = incrementPlayCount;
      activity.minimumPlayPercent = minimumPlayPercent;
      activity.setEnabled(trackActivity);
    }, [
      getPlayer,
      scene,
      trackActivity,
      minimumPlayPercent,
      sceneIncrementPlayCount,
      sceneSaveActivity,
    ]);

    // Sync autostart button with config changes
    useEffect(() => {
      const player = getPlayer();
      if (!player) return;

      async function updateAutoStart(enabled: boolean) {
        await updateInterfaceConfig({
          variables: {
            input: {
              autostartVideo: enabled,
            },
          },
        });
      }

      const autostartButton = player.autostartButton();
      if (autostartButton) {
        autostartButton.syncWithConfig(
          interfaceConfig?.autostartVideo ?? true
        );
        autostartButton.updateAutoStart = updateAutoStart;
      }
    }, [getPlayer, updateInterfaceConfig, interfaceConfig?.autostartVideo]);

    useEffect(() => {
      const player = getPlayer();
      if (!player) return;

      player.loop(looping);
      interactiveClient.setLooping(looping);
    }, [getPlayer, interactiveClient, looping]);

    useEffect(() => {
      const player = getPlayer();
      if (!player || !ready || !auto.current) {
        return;
      }

      // check if we're waiting for the interactive client
      if (
        scene.interactive &&
        interactiveClient.handyKey &&
        currentScript !== scene.paths.funscript
      ) {
        return;
      }

      player.play();
      auto.current = false;
    }, [getPlayer, scene, ready, interactiveClient, currentScript]);

    // Attach handler for onComplete event
    useEffect(() => {
      const player = getPlayer();
      if (!player) return;

      player.on("ended", onComplete);

      return () => player.off("ended");
    }, [getPlayer, onComplete]);

    // set up mediaSession plugin
    useEffect(() => {
      const player = getPlayer();
      if (!player) return;

      // set up mediasession plugin
      // get performer names as array
      const performers = scene?.performers.map((p) => p.name).join(", ");
      player
        .mediaSession()
        .setMetadata(
          scene?.title ?? "Stash",
          scene?.studio?.name ?? performers ?? "Stash",
          scene.paths.screenshot || ""
        );
    }, [getPlayer, scene]);

    const pausedBeforeScrubber = useRef(true);

    function onScrubberScroll() {
      const player = getPlayer();
      if (started.current && player) {
        pausedBeforeScrubber.current = player.paused();
        player.pause();
      }
    }

    function onScrubberSeek(seconds: number) {
      const player = getPlayer();
      if (started.current && player) {
        player.currentTime(seconds);
        if (!pausedBeforeScrubber.current) {
          player.play();
        }
      } else {
        setTime(seconds);
      }
    }

    // Override spacebar to always pause/play
    function onKeyDown(this: HTMLDivElement, event: KeyboardEvent) {
      const player = getPlayer();
      if (!player) return;

      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        if (player.paused()) {
          player.play();
        } else {
          player.pause();
        }
      }
    }

    const isPortrait = file?.height && file?.width && file.height > file.width;

    return (
      <div
        className={cx("VideoPlayer", {
          portrait: isPortrait,
          "no-file": !file,
        })}
        onKeyDownCapture={onKeyDown}
      >
        <div className="video-wrapper" ref={videoRef} />
        {scene.interactive &&
          (interactiveState !== ConnectionState.Ready ||
            getPlayer()?.paused()) && <SceneInteractiveStatus />}
        {file && showScrubber && (
          <ScenePlayerScrubber
            file={file}
            scene={scene}
            time={time}
            onSeek={onScrubberSeek}
            onScroll={onScrubberScroll}
          />
        )}
      </div>
    );
  }
);

export default ScenePlayer;
