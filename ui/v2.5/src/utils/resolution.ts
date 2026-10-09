import { ResolutionEnum } from "src/core/generated-graphql";

const stringResolutionMap = new Map<string, ResolutionEnum>([
  ["144p", ResolutionEnum.VeryLow],
  ["240p", ResolutionEnum.Low],
  ["360p", ResolutionEnum.R360P],
  ["480p", ResolutionEnum.Standard],
  ["540p", ResolutionEnum.WebHd],
  ["720p", ResolutionEnum.StandardHd],
  ["1080p", ResolutionEnum.FullHd],
  ["1440p", ResolutionEnum.QuadHd],
  // ["1920p", ResolutionEnum.VrHd],
  ["4k", ResolutionEnum.FourK],
  ["5k", ResolutionEnum.FiveK],
  ["6k", ResolutionEnum.SixK],
  ["7k", ResolutionEnum.SevenK],
  ["8k", ResolutionEnum.EightK],
  ["Huge", ResolutionEnum.Huge],
]);

export const stringToResolution = (
  value?: string | null,
  caseInsensitive?: boolean
) => {
  if (!value) {
    return undefined;
  }

  const ret = stringResolutionMap.get(value);
  if (ret || !caseInsensitive) {
    return ret;
  }

  const asUpper = value.toUpperCase();
  const foundEntry = Array.from(stringResolutionMap.entries()).find((e) => {
    return e[0].toUpperCase() === asUpper;
  });

  if (foundEntry) {
    return foundEntry[1];
  }
};

export const resolutionStrings = Array.from(stringResolutionMap.keys());

/**
 * Given video width and height, returns a clean resolution badge (e.g. "4K", "1440p", "1080p", "720p", "480p").
 * Correctly accounts for cinematic/widescreen letterbox crops (e.g. 1920x800 is 1080p)
 * and vertical/portrait mobile videos (e.g. 720x1280 is 720p).
 */
export function getVideoResolutionLabel(
  width?: number | null,
  height?: number | null
): string | undefined {
  if (!width || !height || width <= 0 || height <= 0) {
    if (height && height > 0) return `${height}p`;
    if (width && width > 0) return `${width}p`;
    return undefined;
  }

  const maxDim = Math.max(width, height);
  const minDim = Math.min(width, height);

  if (maxDim >= 7680 || minDim >= 3840) return "8K";
  if (maxDim >= 6144 || minDim >= 3000) return "6K";
  if (maxDim >= 5120 || minDim >= 2560) return "5K";
  if (maxDim >= 3600 || minDim >= 1900) return "4K";
  if (maxDim >= 2400 || minDim >= 1400) return "1440p";
  if (maxDim >= 1800 || minDim >= 1000) return "1080p";
  if (maxDim >= 1200 || minDim >= 700) return "720p";
  if (maxDim >= 940 || minDim >= 540) return "540p";
  if (maxDim >= 800 || minDim >= 460) return "480p";
  if (maxDim >= 600 || minDim >= 340) return "360p";
  if (maxDim >= 400 || minDim >= 220) return "240p";
  return `${minDim}p`;
}

/**
 * Returns the effective nominal height for transcoding and quality matching (e.g. 2160, 1440, 1080, 720, 480, etc.).
 * Ensures 1080p cropped videos (1920x800) aren't restricted to 720p downwards.
 */
export function getEffectiveVideoHeight(
  width?: number | null,
  height?: number | null
): number {
  if (!width || !height || width <= 0 || height <= 0) {
    return height || width || 0;
  }
  const maxDim = Math.max(width, height);
  const minDim = Math.min(width, height);

  if (maxDim >= 3600 || minDim >= 1900) return 2160;
  if (maxDim >= 2400 || minDim >= 1400) return 1440;
  if (maxDim >= 1800 || minDim >= 1000) return 1080;
  if (maxDim >= 1200 || minDim >= 700) return 720;
  if (maxDim >= 940 || minDim >= 540) return 540;
  if (maxDim >= 800 || minDim >= 460) return 480;
  if (maxDim >= 600 || minDim >= 340) return 360;
  if (maxDim >= 400 || minDim >= 220) return 240;
  return minDim;
}

/**
 * Identifies the main/primary video file among multiple files for a scene.
 * Prioritizes the full video over sample/preview clips and higher resolution.
 */
export function getMainVideoFile<
  T extends {
    duration?: number | null;
    width?: number | null;
    height?: number | null;
    size?: number | null;
  }
>(files?: T[] | null): T | undefined {
  if (!files || files.length === 0) return undefined;
  if (files.length === 1) return files[0];

  return files.reduce((best, f) => {
    const fDur = f.duration || 0;
    const bestDur = best.duration || 0;
    const fPixels = (f.width || 0) * (f.height || 0);
    const bestPixels = (best.width || 0) * (best.height || 0);

    // If one file has substantial duration and the other is a sample (<60s or >2x difference)
    if (fDur > 0 && bestDur === 0) return f;
    if (bestDur > 0 && fDur === 0) return best;
    if (Math.abs(fDur - bestDur) > 120) {
      return fDur > bestDur ? f : best;
    }

    // If duration is comparable, prefer the higher resolution file
    if (fPixels !== bestPixels) {
      return fPixels > bestPixels ? f : best;
    }

    // Fallback to larger file size
    return (f.size || 0) > (best.size || 0) ? f : best;
  }, files[0]);
}

/**
 * Formats duration in seconds to timestamp with Math.round to match player display exactly.
 */
export function formatVideoDuration(
  durationSeconds?: number | null
): string | undefined {
  if (durationSeconds == null || durationSeconds <= 0 || isNaN(durationSeconds)) {
    return undefined;
  }
  const totalSeconds = Math.round(durationSeconds);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);

  const sStr = String(s).padStart(2, "0");
  const mStr = h > 0 ? String(m).padStart(2, "0") : String(m);

  if (h > 0) {
    return `${h}:${mStr}:${sStr}`;
  }
  return `${mStr}:${sStr}`;
}
