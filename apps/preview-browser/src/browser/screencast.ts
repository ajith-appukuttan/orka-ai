import {
  chromium,
  type Browser,
  type CDPSession,
  type BrowserContext,
  type Page,
} from 'playwright';
import { WebSocket as WsWebSocket } from 'ws';
import { config } from '../config.js';

interface ScreencastSession {
  id: string;
  url: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  cdp: CDPSession;
  clients: Set<WsWebSocket>;
  inspectMode: boolean;
}

const sessions = new Map<string, ScreencastSession>();

/**
 * Create a screencast session.
 * Launches a dedicated browser, starts CDP screencast, and streams frames
 * to connected WebSocket clients.
 */
export async function createScreencastSession(id: string, url: string): Promise<ScreencastSession> {
  if (sessions.size >= config.maxSessions) {
    throw new Error(`Max sessions (${config.maxSessions}) reached`);
  }

  // Launch a dedicated browser per session (isolation)
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  const context = await browser.newContext({
    viewport: { width: config.screenshot.maxWidth, height: config.screenshot.maxHeight },
    ignoreHTTPSErrors: true,
    bypassCSP: true,
  });

  const page = await context.newPage();

  // Get CDP session for low-level control (before navigation so we can screencast immediately)
  const cdp = await page.context().newCDPSession(page);

  const session: ScreencastSession = {
    id,
    url,
    browser,
    context,
    page,
    cdp,
    clients: new Set(),
    inspectMode: false,
  };

  // Start screencast — CDP streams JPEG frames
  cdp.on('Page.screencastFrame', async (params) => {
    const { data, sessionId, metadata } = params;

    // Acknowledge frame so CDP keeps sending
    await cdp.send('Page.screencastFrameAck', { sessionId });

    // Broadcast to all connected WebSocket clients
    const message = JSON.stringify({
      type: 'frame',
      data, // base64 JPEG
      timestamp: metadata.timestamp,
    });

    for (const client of session.clients) {
      if (client.readyState === WsWebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  // Start screencast immediately — frames will show loading/SSO pages too
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 60,
    maxWidth: config.screenshot.maxWidth,
    maxHeight: config.screenshot.maxHeight,
    everyNthFrame: 2,
  });

  // Re-inject inspector overlay after every navigation
  page.on('load', async () => {
    // Small delay to let the page settle (avoid context destroyed errors)
    await new Promise((r) => setTimeout(r, 500));
    try {
      await page.addScriptTag({ content: createInspectorOverlayScript() });
    } catch {
      /* page may still be navigating — overlay will be injected on next load */
    }
  });

  sessions.set(id, session);

  // Navigate — this may trigger SSO redirects, which is fine.
  // The screencast is already streaming so the user sees everything.
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  } catch {
    // Timeout is OK — SSO pages may take long. Screencast is still running.
  }

  // Try to inject inspector after initial load settles
  await new Promise((r) => setTimeout(r, 1000));
  try {
    await page.addScriptTag({ content: createInspectorOverlayScript() });
  } catch {
    /* will be retried on next navigation */
  }
  return session;
}

/**
 * Handle a WebSocket client connection for a session.
 */
export function handleClientConnection(sessionId: string, ws: WsWebSocket): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  session.clients.add(ws);

  // Send current URL
  ws.send(JSON.stringify({ type: 'url', url: session.page.url() }));

  // Handle incoming messages (mouse, keyboard, inspect toggle)
  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      await handleClientMessage(session, msg);
    } catch (err) {
      console.error('Failed to handle client message:', err);
    }
  });

  ws.on('close', () => {
    session.clients.delete(ws);
  });

  return true;
}

/**
 * Handle messages from a WebSocket client.
 */
async function handleClientMessage(
  session: ScreencastSession,
  msg: Record<string, unknown>,
): Promise<void> {
  const { cdp, page } = session;

  switch (msg.type) {
    case 'mousemove':
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: msg.x as number,
        y: msg.y as number,
      });
      break;

    case 'mousedown':
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: msg.x as number,
        y: msg.y as number,
        button: 'left',
        clickCount: 1,
      });
      break;

    case 'mouseup':
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: msg.x as number,
        y: msg.y as number,
        button: 'left',
        clickCount: 1,
      });
      break;

    case 'click':
      if (session.inspectMode) {
        // Inspect mode: get element at position instead of clicking
        const element = await getElementAtPosition(page, msg.x as number, msg.y as number);
        broadcastToClients(session, { type: 'element_selected', element });
      } else {
        // Normal click
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: msg.x as number,
          y: msg.y as number,
          button: 'left',
          clickCount: 1,
        });
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: msg.x as number,
          y: msg.y as number,
          button: 'left',
          clickCount: 1,
        });
      }
      break;

    case 'scroll':
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: (msg.x as number) || 0,
        y: (msg.y as number) || 0,
        deltaX: (msg.deltaX as number) || 0,
        deltaY: (msg.deltaY as number) || 0,
      });
      break;

    case 'keydown':
    case 'keyup':
      await cdp.send('Input.dispatchKeyEvent', {
        type: msg.type === 'keydown' ? 'keyDown' : 'keyUp',
        key: msg.key as string,
        text: (msg.text as string) || undefined,
        code: (msg.code as string) || undefined,
      });
      break;

    case 'keypress':
      if (msg.text) {
        await cdp.send('Input.dispatchKeyEvent', {
          type: 'char',
          text: msg.text as string,
        });
      }
      break;

    case 'set_inspect':
      session.inspectMode = msg.enabled as boolean;
      // Toggle overlay visibility in the page
      await page.evaluate(`
        (function() {
          var ov = document.getElementById('__orka-inspect-overlay');
          if (ov) ov.style.display = ${session.inspectMode} ? 'block' : 'none';
        })()
      `);
      broadcastToClients(session, { type: 'inspect_mode', enabled: session.inspectMode });
      break;

    case 'navigate':
      await page.goto(msg.url as string, { waitUntil: 'domcontentloaded', timeout: 30000 });
      broadcastToClients(session, { type: 'url', url: page.url() });
      break;
  }
}

/**
 * Get element metadata at a position.
 * Uses a string-based evaluate to avoid tsx __name transpilation issues.
 */
async function getElementAtPosition(
  page: Page,
  x: number,
  y: number,
): Promise<Record<string, unknown> | null> {
  return page.evaluate(`
    (function() {
      var cx = ${x}, cy = ${y};
      var el = document.elementFromPoint(cx, cy);
      if (!el) return null;

      var getSelector = function(el) {
        if (el.id) return '#' + el.id;
        var path = [];
        var c = el;
        while (c && c !== document.body) {
          var seg = c.tagName.toLowerCase();
          if (c.className && typeof c.className === 'string') {
            var cls = c.className.trim().split(/\\s+/).slice(0, 2).join('.');
            if (cls) seg += '.' + cls;
          }
          path.unshift(seg);
          c = c.parentElement;
        }
        return path.join(' > ');
      };

      var getDomPath = function(el) {
        var p = [];
        var c = el;
        while (c && c !== document) {
          var tag = c.tagName ? c.tagName.toLowerCase() : '';
          var id = c.id ? '#' + c.id : '';
          p.unshift(tag + id);
          c = c.parentNode;
        }
        return p.join(' > ');
      };

      var rect = el.getBoundingClientRect();
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
    })()
  `);
}

function broadcastToClients(session: ScreencastSession, msg: Record<string, unknown>): void {
  const json = JSON.stringify(msg);
  for (const client of session.clients) {
    if (client.readyState === WsWebSocket.OPEN) {
      client.send(json);
    }
  }
}

/**
 * Destroy a screencast session.
 */
export async function destroyScreencastSession(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  for (const client of session.clients) client.close();
  await session.cdp.send('Page.stopScreencast').catch(() => {});
  await session.browser.close();
  sessions.delete(id);
}

export function getScreencastSessionCount(): number {
  return sessions.size;
}

/**
 * Inspector overlay — just the hover highlight, no click interception.
 */
function createInspectorOverlayScript(): string {
  return `
    (function() {
      if (window.__orkaOverlay) return;
      window.__orkaOverlay = true;
      const ov = document.createElement('div');
      ov.id = '__orka-inspect-overlay';
      ov.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #10a37f;background:rgba(16,163,127,0.08);display:none;transition:all 60ms ease;';
      document.body.appendChild(ov);
      const lb = document.createElement('div');
      lb.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:#10a37f;color:white;font:11px monospace;padding:2px 6px;border-radius:3px;display:none;';
      document.body.appendChild(lb);
      document.addEventListener('mousemove', e => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el === ov || el === lb) return;
        const r = el.getBoundingClientRect();
        ov.style.left=r.x+'px'; ov.style.top=r.y+'px';
        ov.style.width=r.width+'px'; ov.style.height=r.height+'px';
        lb.style.display = ov.style.display;
        lb.style.left=r.x+'px'; lb.style.top=Math.max(0,r.y-20)+'px';
        lb.textContent = el.tagName.toLowerCase() + (el.id ? '#'+el.id : '');
      }, true);
    })();
  `;
}
