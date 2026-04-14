import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CDP_PORT = 9222;

let chromeProcess: ChildProcess | null = null;
let userDataDir: string | null = null;

/**
 * Find Chrome/Chromium executable on the system.
 */
function findChrome(): string {
  const candidates = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux
    'google-chrome',
    'google-chrome-stable',
    'chromium-browser',
    'chromium',
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  for (const candidate of candidates) {
    try {
      if (candidate.startsWith('/') || candidate.startsWith('C:\\')) {
        execSync(`test -f "${candidate}"`, { stdio: 'ignore' });
        return candidate;
      } else {
        execSync(`which ${candidate}`, { stdio: 'ignore' });
        return candidate;
      }
    } catch {
      continue;
    }
  }

  throw new Error(
    'Chrome not found. Install Google Chrome or set CHROME_PATH environment variable.',
  );
}

/**
 * Launch Chrome with remote debugging enabled.
 * Returns the CDP WebSocket URL.
 */
export async function launchChrome(url?: string): Promise<{
  cdpPort: number;
  wsUrl: string;
  pid: number;
}> {
  // If Chrome is already running, reuse it — open the URL in a new tab
  if (chromeProcess || (await isCdpAvailable())) {
    const wsUrl = await waitForCdp(CDP_PORT, 3000);
    // Open URL in existing Chrome if provided
    if (url) {
      try {
        await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, {
          method: 'PUT',
        });
      } catch {
        /* tab may already have the URL */
      }
    }
    return {
      cdpPort: CDP_PORT,
      wsUrl,
      pid: chromeProcess?.pid ?? 0,
    };
  }

  const chromePath = process.env.CHROME_PATH || findChrome();
  userDataDir = mkdtempSync(join(tmpdir(), 'orka-chrome-'));

  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--remote-allow-origins=*`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ];

  if (url) {
    args.push(url);
  }

  console.info(`Launching Chrome: ${chromePath}`);
  console.info(`CDP port: ${CDP_PORT}`);
  console.info(`User data dir: ${userDataDir}`);

  chromeProcess = spawn(chromePath, args, {
    stdio: 'ignore',
    detached: false,
  });

  chromeProcess.on('exit', (code) => {
    console.info(`Chrome exited with code ${code}`);
    chromeProcess = null;
  });

  // Wait for CDP to be ready
  const wsUrl = await waitForCdp(CDP_PORT);

  return {
    cdpPort: CDP_PORT,
    wsUrl,
    pid: chromeProcess.pid!,
  };
}

/**
 * Wait for CDP endpoint to become available.
 */
async function waitForCdp(port: number, timeoutMs = 15000): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      const data = (await response.json()) as { webSocketDebuggerUrl: string };
      return data.webSocketDebuggerUrl;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  throw new Error(`CDP not available on port ${port} after ${timeoutMs}ms`);
}

/**
 * Check if CDP is available (Chrome may be running from a previous session).
 */
async function isCdpAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if Chrome is running.
 */
export function isChromeRunning(): boolean {
  return chromeProcess !== null;
}

/**
 * Check if Chrome is running (including externally launched).
 */
export async function isChromeAvailable(): Promise<boolean> {
  return chromeProcess !== null || (await isCdpAvailable());
}

/**
 * Get the CDP port.
 */
export function getCdpPort(): number {
  return CDP_PORT;
}

/**
 * Close Chrome.
 */
export function closeChrome(): void {
  if (chromeProcess) {
    chromeProcess.kill();
    chromeProcess = null;
  }
}
