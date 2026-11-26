import { NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { imageRepo, workspaceRepo } from '@/db/repositories';
import { isInside } from '@/core/filesystem/paths';
import { decodeVideoFrame } from '@/core/video/ffmpeg';

/**
 * Authenticated-by-ownership frame decoder for local video media. The source
 * file is only read; the decoded JPEG lives in a bounded in-memory cache and is
 * never written into the source tree. When ffmpeg is not installed we return a
 * clear 503 so the UI can show a useful message instead of a blank canvas.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  ensureDatabaseReady();
  const media = imageRepo.getImage(params.id);
  if (!media) return new NextResponse('Not found', { status: 404 });
  if (media.mediaKind !== 'VIDEO') {
    return NextResponse.json({ error: 'Media is not a video.' }, { status: 400 });
  }
  const ws = workspaceRepo.getWorkspace(media.workspaceId);
  if (!ws || !isInside(ws.sourceDir, media.originalPath)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const raw = new URL(request.url).searchParams.get('n') ?? '0';
  const frame = Number(raw);
  if (!Number.isFinite(frame) || frame < 0) {
    return NextResponse.json({ error: 'Invalid frame number.' }, { status: 400 });
  }
  const maxFrame = media.frameCount ? media.frameCount - 1 : Number.MAX_SAFE_INTEGER;
  if (frame > maxFrame) {
    return NextResponse.json({ error: 'Frame is beyond the video length.' }, { status: 400 });
  }

  const bytes = await decodeVideoFrame(media.originalPath, frame);
  if (!bytes) {
    return NextResponse.json(
      {
        error:
          'ffmpeg is unavailable or could not decode this frame. Install ffmpeg to annotate video.',
      },
      { status: 503 },
    );
  }
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=60',
    },
  });
}
