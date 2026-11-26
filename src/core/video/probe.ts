/** Pure parser for `ffprobe -show_streams -show_format -of json` output. */

export interface VideoProbe {
  width: number;
  height: number;
  durationMs: number | null;
  fps: number | null;
  frameCount: number | null;
}

function positiveNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

/** Parse ffprobe JSON. Returns null when no usable video stream is present. */
export function parseVideoProbe(json: string): VideoProbe | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const doc = value as Record<string, unknown>;
  const streams = Array.isArray(doc.streams) ? doc.streams : [];
  const stream = streams.find((s) => {
    if (!s || typeof s !== 'object') return false;
    return (s as Record<string, unknown>).codec_type === 'video';
  }) as Record<string, unknown> | undefined;
  if (!stream) return null;
  const width = positiveNumber(stream.width);
  const height = positiveNumber(stream.height);
  if (!width || !height) return null;

  const rate = stream.avg_frame_rate ?? stream.r_frame_rate;
  let fps: number | null = null;
  if (typeof rate === 'string' && rate.includes('/')) {
    const [num, den] = rate.split('/').map(Number);
    if (den && den > 0 && num && num > 0) fps = num / den;
  } else {
    fps = positiveNumber(rate);
  }

  const duration =
    positiveNumber(stream.duration) ??
    positiveNumber((doc.format as Record<string, unknown> | undefined)?.duration);
  const frameCount =
    positiveNumber(stream.nb_frames) ??
    (duration !== null && fps !== null ? Math.round(duration * fps) : null);

  return {
    width: Math.round(width),
    height: Math.round(height),
    durationMs: duration !== null ? Math.round(duration * 1000) : null,
    fps,
    frameCount,
  };
}

/** Parse an ffmpeg error stream into a short, user-safe message. */
export function describeFfmpegError(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const last = lines[lines.length - 1] ?? 'ffmpeg failed';
  return last.length > 200 ? `${last.slice(0, 197)}…` : last;
}
