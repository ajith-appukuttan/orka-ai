import type { Page } from 'playwright';
import sharp from 'sharp';

/**
 * Take a full-page screenshot.
 */
export async function takeScreenshot(page: Page): Promise<Buffer> {
  return page.screenshot({ type: 'png', fullPage: false }) as Promise<Buffer>;
}

/**
 * Take a screenshot of a specific region and return as base64.
 */
export async function takeRegionScreenshot(
  page: Page,
  region: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  const fullScreenshot = await page.screenshot({ type: 'png', fullPage: false });

  // Crop using sharp
  const cropped = await sharp(fullScreenshot)
    .extract({
      left: Math.max(0, Math.round(region.x)),
      top: Math.max(0, Math.round(region.y)),
      width: Math.max(1, Math.round(region.width)),
      height: Math.max(1, Math.round(region.height)),
    })
    .png()
    .toBuffer();

  return cropped;
}
