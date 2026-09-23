import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { imageRepo, workspaceRepo } from '@/db/repositories';
import { isInside } from '@/core/filesystem/paths';

/**
 * Source-image byte server.
 *
 * The annotation canvas cannot read local files directly, so it requests frames
 * through this route. Security: we only ever serve a file that (a) is a known
 * image row and (b) still resolves inside its workspace's read-only source
 * folder — never an arbitrary path. Source images are never modified.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  ensureDatabaseReady();

  const image = imageRepo.getImage(params.id);
  if (!image) return new NextResponse('Not found', { status: 404 });

  const ws = workspaceRepo.getWorkspace(image.workspaceId);
  if (!ws) return new NextResponse('Not found', { status: 404 });

  // Confine reads to the workspace source tree.
  if (!isInside(ws.sourceDir, image.originalPath)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const bytes = await readFile(image.originalPath);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': MIME[image.extension] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new NextResponse('Unreadable', { status: 410 });
  }
}
