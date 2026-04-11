import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import { config } from '../config.js';
import { INSPECTOR_CLIENT_SCRIPT } from './inspectorClient.js';

interface LiveSession {
  id: string;
  url: string;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  lastScreenshotAt: number;
  onElementSelected?: (metadata: Record<string, unknown>) => void;
}

let browser: Browser | null = null;
const liveSessions = new Map<string, LiveSession>();

export async function initLiveBrowser(): Promise<void> {
  if (browser) return;
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });
  console.info('Live preview browser initialized');
}

/**
 * Create a live preview session.
 * Playwright handles all auth/redirects/CSP natively.
 * Returns initial screenshot.
 */
export async function createLiveSession(id: string, url: string): Promise<{ screenshot: string }> {
  if (!browser) throw new Error('Browser not initialized');
  if (liveSessions.size >= config.maxSessions) {
    throw new Error(`Max sessions (${config.maxSessions}) reached`);
  }

  const context = await browser.newContext({
    viewport: { width: config.screenshot.maxWidth, height: config.screenshot.maxHeight },
    ignoreHTTPSErrors: true,
    // Disable CSP so we can inject our inspector
    bypassCSP: true,
  });

  const page = await context.newPage();

  // Navigate (handles SSO redirects, OAuth flows, etc. natively)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  // Inject inspector script that communicates via a custom event
  await page.addScriptTag({
    content: createLiveInspectorScript(),
  });

  // Expose function for element selection callback
  await page.exposeFunction('__orkaElementCallback', (metadataJson: string) => {
    const session = liveSessions.get(id);
    if (session?.onElementSelected) {
      session.onElementSelected(JSON.parse(metadataJson));
    }
  });

  const screenshot = await page.screenshot({ type: 'png', fullPage: false });

  const session: LiveSession = {
    id,
    url,
    context,
    page,
    createdAt: Date.now(),
    lastScreenshotAt: Date.now(),
  };

  liveSessions.set(id, session);

  return { screenshot: screenshot.toString('base64') };
}

/**
 * Take a fresh screenshot of the current page state.
 */
export async function getLiveScreenshot(id: string): Promise<string | null> {
  const session = liveSessions.get(id);
  if (!session) return null;

  const screenshot = await session.page.screenshot({ type: 'png', fullPage: false });
  session.lastScreenshotAt = Date.now();
  return screenshot.toString('base64');
}

/**
 * Click at a position in the page.
 * In inspect mode, this triggers element selection.
 * In normal mode, this navigates/interacts.
 */
export async function clickAt(
  id: string,
  x: number,
  y: number,
  inspectMode: boolean,
): Promise<{ element?: Record<string, unknown>; screenshot: string } | null> {
  const session = liveSessions.get(id);
  if (!session) return null;

  if (inspectMode) {
    // Get element at position
    const metadata = await session.page.evaluate(
      ([cx, cy]: [number, number]) => {
        const el = document.elementFromPoint(cx, cy);
        if (!el) return null;

        function getSelector(el: Element): string {
          if (el.id) return '#' + el.id;
          const path: string[] = [];
          let current: Element | null = el;
          while (current && current !== document.body) {
            let seg = current.tagName.toLowerCase();
            if (current.className && typeof current.className === 'string') {
              const cls = current.className.trim().split(/\s+/).slice(0, 2).join('.');
              if (cls) seg += '.' + cls;
            }
            path.unshift(seg);
            current = current.parentElement;
          }
          return path.join(' > ');
        }

        function getDomPath(el: Element): string {
          const path: string[] = [];
          let current: Node | null = el;
          while (current && current !== document) {
            const tag = (current as Element).tagName?.toLowerCase() || '';
            const id = (current as Element).id ? '#' + (current as Element).id : '';
            path.unshift(tag + id);
            current = current.parentNode;
          }
          return path.join(' > ');
        }

        const rect = el.getBoundingClientRect();
        return {
          selector: getSelector(el),
          domPath: getDomPath(el),
          textContent: (el.textContent || '').trim().substring(0, 500),
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          ariaRole: el.getAttribute('role'),
          tagName: el.tagName.toLowerCase(),
          className: typeof el.className === 'string' ? el.className : '',
          id: el.id || '',
          pageUrl: window.location.href,
        };
      },
      [x, y] as [number, number],
    );

    const screenshot = await session.page.screenshot({ type: 'png', fullPage: false });
    return {
      element: metadata ?? undefined,
      screenshot: screenshot.toString('base64'),
    };
  } else {
    // Normal click — interact with the page
    await session.page.mouse.click(x, y);
    // Wait for navigation/changes
    await session.page.waitForTimeout(1000);
    // Re-inject inspector (page may have navigated)
    try {
      await session.page.addScriptTag({ content: createLiveInspectorScript() });
    } catch {
      // Page may not be ready yet
    }
    const screenshot = await session.page.screenshot({ type: 'png', fullPage: false });
    return { screenshot: screenshot.toString('base64') };
  }
}

/**
 * Scroll the page.
 */
export async function scrollPage(
  id: string,
  deltaX: number,
  deltaY: number,
): Promise<string | null> {
  const session = liveSessions.get(id);
  if (!session) return null;

  await session.page.mouse.wheel(deltaX, deltaY);
  await session.page.waitForTimeout(300);
  const screenshot = await session.page.screenshot({ type: 'png', fullPage: false });
  return screenshot.toString('base64');
}

/**
 * Navigate to a URL within the session.
 */
export async function navigateTo(id: string, url: string): Promise<string | null> {
  const session = liveSessions.get(id);
  if (!session) return null;

  await session.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  try {
    await session.page.addScriptTag({ content: createLiveInspectorScript() });
  } catch {
    // ignore
  }
  const screenshot = await session.page.screenshot({ type: 'png', fullPage: false });
  session.url = url;
  return screenshot.toString('base64');
}

/**
 * Get current page URL (may have changed due to navigation).
 */
export function getCurrentUrl(id: string): string | null {
  const session = liveSessions.get(id);
  if (!session) return null;
  return session.page.url();
}

/**
 * Destroy a live session.
 */
export async function destroyLiveSession(id: string): Promise<void> {
  const session = liveSessions.get(id);
  if (!session) return;
  await session.context.close();
  liveSessions.delete(id);
}

export function getLiveSessionCount(): number {
  return liveSessions.size;
}

/**
 * Inspector script for live preview mode.
 * Adds visual highlight overlay (no click interception — that's handled by Playwright).
 */
function createLiveInspectorScript(): string {
  return `
    (function() {
      if (window.__orkaLiveInspector) return;
      window.__orkaLiveInspector = true;
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #10a37f;background:rgba(16,163,127,0.08);display:none;transition:all 80ms ease;';
      document.body.appendChild(ov);
      const lb = document.createElement('div');
      lb.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:#10a37f;color:white;font:11px monospace;padding:2px 6px;border-radius:3px;display:none;';
      document.body.appendChild(lb);
      document.addEventListener('mousemove', e => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el === ov || el === lb) return;
        const r = el.getBoundingClientRect();
        ov.style.display='block'; ov.style.left=r.x+'px'; ov.style.top=r.y+'px';
        ov.style.width=r.width+'px'; ov.style.height=r.height+'px';
        lb.style.display='block'; lb.style.left=r.x+'px'; lb.style.top=Math.max(0,r.y-20)+'px';
        lb.textContent = el.tagName.toLowerCase() + (el.id ? '#'+el.id : '');
      }, true);
    })();
  `;
}
