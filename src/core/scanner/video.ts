import { stat } from 'node:fs/promises';
import path from 'node:path';
import { sha256OfFile } from './checksum';
import { probeVideoFile } from '@/core/video/ffmpeg';

/** Video formats DeshiA can ingest as frame sources (read-only). */
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm'] as const;

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
};

export function isSupportedVideo(filePath: string): boolean {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return (VIDEO_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Inspect a read-only video source. Width/height/fps/count are best-effort:
 * ffprobe may be absent, in which case 0 dimensions and a null probe are
 * returned so the file is still imported and playable in the browser.
 */
export async function analyzeVideo(filePath: string): Promise<{
  width: number;
  height: number;
  detectedFormat: string;
  mimeType: string;
  durationMs: number | null;
  fps: number | null;
  frameCount: number | null;
  checksum: string;
  fileSize: number;
  modifiedAt: number;
}> {
  const [info, checksum, probe] = await Promise.all([
    stat(filePath),
    sha256OfFile(filePath),
    probeVideoFile(filePath),
  ]);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return {
    width: probe?.width ?? 0,
    height: probe?.height ?? 0,
    detectedFormat: `video/${ext}`,
    mimeType: MIME[ext] ?? 'video/octet-stream',
    durationMs: probe?.durationMs ?? null,
    fps: probe?.fps ?? null,
    frameCount: probe?.frameCount ?? null,
    checksum,
    fileSize: info.size,
    modifiedAt: Math.round(info.mtimeMs),
  };
}
