import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * End-to-end: the full annotation loop.
 *
 *   create workspace → scan → annotate (distinct box colors) → save draft →
 *   reopen / resume → submit → verify output files on disk → next image.
 *
 * This test drives the real Next.js server (the same webview Tauri hosts) with
 * real better-sqlite3 + sharp + filesystem, so it must run on a machine where
 * those native modules load (i.e. the developer's Mac / CI), not the agent
 * sandbox. Native folder dialogs are unavailable in a plain browser, so we type
 * absolute paths into the workspace form's path inputs (see native-dialog.ts).
 */

// A minimal but valid 2x2 PNG (sharp can read its metadata). The exact pixels
// are irrelevant — only that it is a real, decodable image.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8Dwn4EIwDiqEAAI7QP/f5tqLwAAAABJRU5ErkJggg==';

function makeFixtures(): { root: string; sourceDir: string; outputDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'deshia-e2e-'));
  const sourceDir = join(root, 'source');
  // The exporter creates a `DeshiA_Output/` tree *inside* the chosen output
  // dir (see core/filesystem/paths.ts → outputRoot), so point at a plain dir.
  const outputDir = join(root, 'out');
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });
  const png = Buffer.from(TINY_PNG_BASE64, 'base64');
  // Two source images so the loop has a "next image" after the first submit.
  writeFileSync(join(sourceDir, 'rickshaw_back_01.png'), png);
  writeFileSync(join(sourceDir, 'rickshaw_back_02.png'), png);
  return { root, sourceDir, outputDir };
}

// PLACEHOLDER_E2E_BODY

test.describe('DeshiA annotation loop', () => {
  test('create → scan → annotate (distinct colors) → save/resume → submit', async ({ page }) => {
    const fx = makeFixtures();

    // 1. Welcome → create a workspace (type paths; no native picker in-browser).
    await page.goto('/');
    await page.getByPlaceholder('Rickshaw dataset').fill('E2E Rickshaw');
    await page.getByPlaceholder('/path/to/source/images').fill(fx.sourceDir);
    await page.getByPlaceholder('/path/to/output').fill(fx.outputDir);
    await page.getByRole('button', { name: 'Create workspace' }).click();
    await page.waitForURL(/\/workspace\/[^/]+$/);

    // 2. Scan the source folder → both images imported.
    await page.getByRole('button', { name: /Scan source/ }).click();
    await expect(page.getByText(/2 imported/)).toBeVisible({ timeout: 30_000 });

    // 3. Enter the annotation workbench.
    await page.getByRole('button', { name: /Start annotating/ }).click();
    await page.waitForURL(/\/annotate/);

    // 4. Choose class + view (drives the component list from the schema).
    await page.locator('select').first().selectOption({ label: 'Rickshaw' });
    await page.locator('select').nth(1).selectOption({ label: 'Back' });

    const bodyItem = page.locator('li', { hasText: 'Rickshaw Body' });
    const rearItem = page.locator('li', { hasText: 'Rear Drive Assembly' });
    await expect(bodyItem).toBeVisible();
    await expect(rearItem).toBeVisible();

    // Distinct components must get visibly distinct box colors (golden rule #6).
    const bodyColor = await bodyItem.locator('span.h-3.w-3').first().evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const rearColor = await rearItem.locator('span.h-3.w-3').first().evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bodyColor).not.toEqual(rearColor);

    // PLACEHOLDER_E2E_DRAW

    // 5. Draw one box per required component by arming it and dragging on the
    // canvas. The two draws are placed in different regions so the second
    // mousedown lands on empty image, not the first box.
    const canvasArea = page.locator('section canvas').first();
    await expect(canvasArea).toBeVisible();
    const area = await canvasArea.boundingBox();
    if (!area) throw new Error('Canvas area has no bounding box.');

    const drag = async (fx0: number, fy0: number, fx1: number, fy1: number) => {
      await page.mouse.move(area.x + area.width * fx0, area.y + area.height * fy0);
      await page.mouse.down();
      await page.mouse.move(area.x + area.width * fx1, area.y + area.height * fy1, { steps: 10 });
      await page.mouse.up();
    };

    await bodyItem.getByRole('button', { name: /Draw box/ }).click();
    await drag(0.1, 0.1, 0.45, 0.45);

    await rearItem.getByRole('button', { name: /Draw box/ }).click();
    await drag(0.55, 0.55, 0.9, 0.9);

    // Both boxes recorded; validation is satisfied.
    await expect(page.getByText(/Boxes \(2\)/)).toBeVisible();
    await expect(page.getByText('Ready to submit.')).toBeVisible();

    // 6. Save a draft, then reload to prove the draft is recovered (resume).
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByText(/Boxes \(2\)/)).toBeVisible({ timeout: 15_000 });

    // 7. Submit → the strict transaction writes + verifies output files, marks
    // the image ANNOTATED, and advances to the next pending image.
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.waitForURL(/\/annotate|\/workspace\/[^/]+$/, { timeout: 30_000 });

    // 8. Verify Pascal VOC output on disk: an annotation XML was written under
    // DeshiA_Output/ANNOTATED/rickshaw/back/annotations.
    const dir = join(fx.outputDir, 'DeshiA_Output', 'ANNOTATED', 'rickshaw', 'back', 'annotations');
    expect(existsSync(dir)).toBeTruthy();
    const xmls = readdirSync(dir).filter((f) => f.endsWith('.xml'));
    expect(xmls.length).toBeGreaterThanOrEqual(1);
  });
});
