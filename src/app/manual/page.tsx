import Link from 'next/link';
import { ArrowLeft, Keyboard } from 'lucide-react';
import { DeshiaLogo } from '@/components/deshia-logo';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata = { title: 'Manual · DeshiA' };

const shortcuts = [
  [
    '1–9',
    'Pick object tool (Select, Rectangle, Rotated box, Ellipse, Polygon, Polyline, Point, Points, Cuboid)',
  ],
  ['Alt + 1–9', 'Pick the Nth label from the Labels panel'],
  ['?', 'Open this manual'],
  ['Mouse wheel / middle drag', 'Zoom at pointer / pan the canvas'],
  ['Double-click edge / right-click vertex', 'Insert / delete a polygon vertex'],
  ['Ctrl/Cmd + Z', 'Undo the last draft change'],
  ['Ctrl/Cmd + Shift + Z', 'Redo'],
  ['Ctrl/Cmd + A', 'Select every object in the current frame'],
  ['Ctrl/Cmd + C / V', 'Copy and paste selected objects (offset by 2%)'],
  ['Delete / Backspace', 'Remove the selected object, box or mosaic'],
  ['Escape', 'Cancel drawing and clear selection'],
];

export default function ManualPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="flex h-12 items-center justify-between border-b border-border bg-surface px-4">
        <div className="flex items-center gap-2">
          <DeshiaLogo size={20} />
          <span className="text-body font-semibold">DeshiA</span>
          <span className="text-muted">/</span>
          <span className="text-body text-text-secondary">Manual</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-meta text-text-secondary hover:text-text"
          >
            <ArrowLeft size={15} /> Workspaces
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <div>
          <h1 className="text-title font-semibold">Annotation manual</h1>
          <p className="mt-2 text-body text-text-secondary">
            DeshiA is a single-user, offline workstation for computer-vision research. Source media
            is read-only; every export is written to the workspace output tree.
          </p>
        </div>
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-section font-semibold">
            <Keyboard size={18} /> Keyboard shortcuts
          </h2>
          <dl className="mt-4 grid grid-cols-[minmax(9rem,auto)_1fr] gap-x-5 gap-y-3 text-body">
            {shortcuts.map(([keys, description]) => (
              <div key={keys} className="contents">
                <dt className="font-mono text-meta-lg text-primary">{keys}</dt>
                <dd className="text-text-secondary">{description}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-section font-semibold">Drawing and editing</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-body text-text-secondary">
            <li>Choose a label in the left panel, then pick a tool with keys 1–9.</li>
            <li>
              Drag for rectangles (2-point), or toggle 4 pt and click four corners. Rotated boxes,
              ellipses and cuboids use the drag gesture.
            </li>
            <li>
              Click to place polygon/polyline vertices; double-click or press Finish to close the
              path. Hold Shift and drag to draw freehand.
            </li>
            <li>
              Drag vertices to refine shapes. Vertex snapping is on by default; hold Ctrl/Cmd to
              bypass it.
            </li>
            <li>Editing a frame between keyframes promotes it to a real keyframe.</li>
          </ul>
        </section>
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-section font-semibold">Data safety</h2>
          <p className="mt-3 text-body text-text-secondary">
            Drafts autosave to SQLite and are mirrored locally in the browser. After an unexpected
            close, DeshiA offers an explicit Restore or Discard choice. Submission writes and
            verifies every output file before an image is marked annotated; a failed submit keeps
            your work and can be retried.
          </p>
        </section>
      </main>
    </div>
  );
}
