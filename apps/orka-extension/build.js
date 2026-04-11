import esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');

const commonOptions = {
  bundle: true,
  minify: !watch,
  sourcemap: watch,
  target: 'chrome120',
  format: 'esm',
};

async function build() {
  // Ensure dist exists
  mkdirSync('dist', { recursive: true });

  // Copy static files
  cpSync('manifest.json', 'dist/manifest.json');
  cpSync('popup/popup.html', 'dist/popup.html');
  cpSync('icons', 'dist/icons', { recursive: true });

  // Build content script (IIFE — no module system in content scripts)
  const contentCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['src/content.ts'],
    outfile: 'dist/content.js',
    format: 'iife',
  });

  // Build background service worker
  const bgCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['src/background.ts'],
    outfile: 'dist/background.js',
    format: 'esm',
  });

  // Build popup
  const popupCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['src/popup.ts'],
    outfile: 'dist/popup.js',
    format: 'iife',
  });

  if (watch) {
    await contentCtx.watch();
    await bgCtx.watch();
    await popupCtx.watch();
    console.log('Watching for changes...');
  } else {
    await contentCtx.rebuild();
    await bgCtx.rebuild();
    await popupCtx.rebuild();
    await contentCtx.dispose();
    await bgCtx.dispose();
    await popupCtx.dispose();
    console.log('Build complete → dist/');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
