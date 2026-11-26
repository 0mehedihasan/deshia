import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describeFfmpegError, parseVideoProbe, type VideoProbe } from './probe';

/**
 * Optional ffmpeg/ffprobe bridge. Both binaries are looked up on PATH; when
 * they are missing the callers degrade gracefully (no video preview) rather
 * than crashing. Source media is only ever read — frames are produced in
 * memory and written only to the HTTP response cache, never into the source.
 */

const run = promisify(execFile);

const FFMPEG = process.env.DESHIA_FFMPEG ?? 'ffmpeg';
const FFPROBE = process.env.DESHIA_FFPROBE ?? 'ffprobe';

export async function probeVideoFile(filePath: string): Promise<VideoProbe | null> {
  try {
    const { stdout } = await run(
      FFPROBE,
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath],
      { maxBuffer: 8 * 1024 * 1024, timeout: 30_000 },
    );
    return parseVideoProbe(stdout);
  } catch {
    return null;
  }
}

const frameCache = new Map<string, Buffer>();
const FRAME_CACHE_LIMIT = 32;

/** Decode one frame as a downscaled JPEG. Returns null when ffmpeg is absent. */
export async function decodeVideoFrame(
  filePath: string,
  frameNumber: number,
  maxWidth = 1280,
): Promise<Buffer | null> {
  const frame = Math.max(0, Math.trunc(frameNumber));
  const key = `${filePath}:${frame}:${maxWidth}`;
  const cached = frameCache.get(key);
  if (cached) return cached;

  try {
    const { stdout } = await run(
      FFMPEG,
      [
        '-v',
        'error',
        '-i',
        filePath,
        '-vf',
        `select=eq(n\\,${frame}),scale='min(${maxWidth}\\,iw)':-2`,
        '-vsync',
        '0',
        '-frames:v',
        '1',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, timeout: 60_000 },
    );
    const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout), 'binary');
    if (buffer.length === 0) return null;
    if (frameCache.size >= FRAME_CACHE_LIMIT) frameCache.clear();
    frameCache.set(key, buffer);
    return buffer;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`Video frame ${frame} unavailable: ${describeFfmpegError(String(err))}`);
    return null;
  }
}

export function clearFrameCache(): void {
  frameCache.clear();
}
