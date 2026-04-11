import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import { config } from '../config.js';

interface BrowserSession {
  id: string;
  url: string;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  lastAccessedAt: number;
}

let browser: Browser | null = null;
const sessions = new Map<string, BrowserSession>();

/**
 * Initialize the shared browser instance.
 */
export async function initBrowser(): Promise<void> {
  if (browser) return;
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  console.info('Playwright browser initialized');

  // Cleanup timer for idle sessions
  setInterval(cleanupIdleSessions, 30000);
}

/**
 * Create a new preview session for a URL.
 */
export async function createSession(id: string, url: string): Promise<BrowserSession> {
  if (!browser) throw new Error('Browser not initialized');
  if (sessions.size >= config.maxSessions) {
    throw new Error(`Max sessions (${config.maxSessions}) reached`);
  }

  const context = await browser.newContext({
    viewport: { width: config.screenshot.maxWidth, height: config.screenshot.maxHeight },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  const session: BrowserSession = {
    id,
    url,
    context,
    page,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
  };

  sessions.set(id, session);
  return session;
}

/**
 * Get an existing session.
 */
export function getSession(id: string): BrowserSession | undefined {
  const session = sessions.get(id);
  if (session) {
    session.lastAccessedAt = Date.now();
  }
  return session;
}

/**
 * Destroy a session.
 */
export async function destroySession(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  await session.context.close();
  sessions.delete(id);
}

/**
 * Cleanup sessions that have been idle longer than the timeout.
 */
async function cleanupIdleSessions(): Promise<void> {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastAccessedAt > config.sessionTimeoutMs) {
      console.info(`Cleaning up idle session ${id}`);
      await destroySession(id);
    }
  }
}

/**
 * Get active session count.
 */
export function getSessionCount(): number {
  return sessions.size;
}

/**
 * Shutdown the browser.
 */
export async function closeBrowser(): Promise<void> {
  for (const id of sessions.keys()) {
    await destroySession(id);
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}
