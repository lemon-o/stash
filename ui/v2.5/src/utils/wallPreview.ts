export type PreviewMediaType = "image" | "video";

export interface PreviewSource {
  src?: string | null;
  mediaType: PreviewMediaType;
}

export interface SelectedPreviewSource {
  src: string;
  mediaType: PreviewMediaType;
}

export function getFirstValidPreviewSource(
  srcSet: readonly PreviewSource[],
  invalidSrcSet: string[]
): SelectedPreviewSource {
  const validSrcSet = srcSet.filter((s) => s.src);

  if (!validSrcSet.length) {
    return { src: "", mediaType: "image" };
  }

  const selected =
    validSrcSet.find(({ src }) => !invalidSrcSet.includes(src!)) ??
    ([...validSrcSet].pop() as PreviewSource);

  return {
    src: selected.src!,
    mediaType: selected.mediaType,
  };
}

/**
 * 判断视频格式是否可被当前浏览器原生解码（无需后端实时转码）
 */
export function isBrowserDirectDecodable(file?: {
  path?: string;
  video_codec?: string | null;
  audio_codec?: string | null;
}): boolean {
  if (!file?.path) return false;

  const ext = file.path.split(".").pop()?.toLowerCase();
  // 浏览器原生 <video> 标签仅支持 MP4, WebM, MOV, M4V 容器格式
  // MKV, AVI, WMV, FLV, TS 等容器格式无法原生播放
  const supportedContainers = ["mp4", "m4v", "webm", "mov"];
  if (!ext || !supportedContainers.includes(ext)) {
    return false;
  }

  const vCodec = (file.video_codec || "").toLowerCase();
  const aCodec = (file.audio_codec || "").toLowerCase();

  // 部分特殊音频编码（如 DTS, TrueHD, AC3, EAC3 等）在常规浏览器中无法发声或直接导致无法解码
  const problematicAudio = ["dts", "truehd", "eac3", "ac3"];
  if (problematicAudio.some((a) => aCodec.includes(a))) {
    const testVideo = document.createElement("video");
    if (!testVideo.canPlayType(`audio/mp4; codecs="${aCodec}"`)) {
      return false;
    }
  }

  // 网页通用的原生视频编码（H.264 / AVC, VP8, VP9, AV1）
  const standardCodecs = ["h264", "avc", "avc1", "vp8", "vp9", "av1"];
  if (standardCodecs.some((c) => vCodec.includes(c))) {
    return true;
  }

  // 对于 HEVC/H.265，需测试当前环境是否有硬件加速解码支持
  if (vCodec.includes("hevc") || vCodec.includes("h265")) {
    const testVideo = document.createElement("video");
    const canPlay =
      testVideo.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') ||
      testVideo.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"');
    return canPlay === "probably" || canPlay === "maybe";
  }

  // 兜底测试
  if (vCodec) {
    const testVideo = document.createElement("video");
    const mime =
      ext === "webm"
        ? `video/webm; codecs="${vCodec}"`
        : `video/mp4; codecs="${vCodec}"`;
    return Boolean(testVideo.canPlayType(mime));
  }

  return true;
}

/**
 * 获取短片悬停播放的视频源：
 * 1. 原视频时长小于 15 秒且视频格式可以直接解码，则直接播放原视频 (paths.stream)
 * 2. 否则走切片预览逻辑 (paths.preview)，若未生成切片预览则平滑回退
 */
export function getSceneHoverVideoSource(scene?: {
  files?: Array<{
    duration?: number | null;
    path?: string;
    video_codec?: string | null;
    audio_codec?: string | null;
  }>;
  paths: {
    preview?: string | null;
    stream?: string | null;
    screenshot?: string | null;
  };
}): string | undefined {
  if (!scene) return undefined;

  const file = scene.files?.[0];
  const duration = file?.duration ?? 0;

  // 逻辑2：原视频时长小于 15 秒且视频格式可以直接解码，则直接悬停播放原视频
  if (duration > 0 && duration < 15 && isBrowserDirectDecodable(file)) {
    return scene.paths.stream ?? scene.paths.preview ?? undefined;
  }

  // 否则走切片逻辑（若已生成切片则播切片，若未生成切片则平滑回退至 stream）
  return scene.paths.preview || scene.paths.stream || undefined;
}

