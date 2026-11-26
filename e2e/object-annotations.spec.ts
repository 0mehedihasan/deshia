import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * End-to-end for the generalized Objects editor: create a workspace, draw a
 * labelled object, save/resume, submit, and verify the per-image CVAT XML/ZIP
 * and the dataset-level COCO document on disk.
 */

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8Dwn4EIwDiqEAAI7QP/f5tqLwAAAABJRU5ErkJggg==';

function makeFixtures() {
  const root = mkdtempSync(join(tmpdir(), 'deshia-objects-e2e-'));
  const sourceDir = join(root, 'source');
  const outputDir = join(root, 'out');
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(sourceDir, 'scene_01.png'), Buffer.from(TINY_PNG_BASE64, 'base64'));
  writeFileSync(join(sourceDir, 'scene_02.png'), Buffer.from(TINY_PNG_BASE64, 'base64'));
  return { root, sourceDir, outputDir };
}

test.describe('DeshiA object annotations', () => {
  test('draw → save/resume → submit → verify CVAT/COCO outputs', async ({ page }) => {
    const fx = makeFixtures();

    await page.goto('/');
    await page.getByPlaceholder('Rickshaw dataset').fill('E2E Objects');
    await page.getByPlaceholder('/path/to/source/images').fill(fx.sourceDir);
    await page.getByPlaceholder('/path/to/output').fill(fx.outputDir);
    await page.getByRole('button', { name: 'Create workspace' }).click();
    await page.waitForURL(/\/workspace\/[^/]+$/);
    await page.getByRole('button', { name: /Scan source/ }).click();
    await expect(page.getByText(/2 imported/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /Start annotating/ }).click();
    await page.waitForURL(/\/annotate/);

    // Switch from the Rickshaw component workflow to the generalized editor.
    await page.getByRole('button', { name: 'Objects', exact: true }).click();
    await page
      .getByRole('button', { name: /Rickshaw Body/ })
      .first()
      .click();

    const canvasArea = page.locator('section canvas').first();
    await expect(canvasArea).toBeVisible();
    const area = await canvasArea.boundingBox();
    if (!area) throw new Error('Canvas has no bounding box.');
    await page.mouse.move(area.x + area.width * 0.15, area.y + area.height * 0.15);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.6, area.y + area.height * 0.6, { steps: 8 });
    await page.mouse.up();

    await expect(page.getByText(/Objects \(1\)/)).toBeVisible();
    await expect(page.getByText(/1 object\(s\) valid/)).toBeVisible();

    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByText(/Objects \(1\)/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Submit' }).click();
    await page.waitForURL(/\/annotate|\/workspace\/[^/]+$/, { timeout: 30_000 });

    const annotations = join(
      fx.outputDir,
      'DeshiaA_Output',
      'ANNOTATED',
      'objects',
      'all',
      'annotations',
    );
    expect(existsSync(annotations)).toBeTruthy();
    const files = readdirSync(annotations);
    expect(files.some((f) => f.startsWith('objects_') && f.endsWith('_cvat.xml'))).toBeTruthy();
    expect(files.some((f) => f.startsWith('objects_') && f.endsWith('_cvat.zip'))).toBeTruthy();
    expect(
      existsSync(join(fx.outputDir, 'DeshiaA_Output', 'ANNOTATED', 'annotations.coco.json')),
    ).toBeTruthy();
  });
});
