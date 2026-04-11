import { getCdpPort } from './chromeLauncher.js';
import WebSocket from 'ws';

export interface CdpTarget {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl: string;
}

/**
 * List all real page tabs (excludes DevTools, chrome://, extensions).
 */
export async function listTabs(): Promise<CdpTarget[]> {
  const port = getCdpPort();
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = (await response.json()) as CdpTarget[];
  return targets.filter(
    (t) =>
      t.type === 'page' &&
      !t.url.startsWith('devtools://') &&
      !t.url.startsWith('chrome://') &&
      !t.url.startsWith('chrome-extension://') &&
      t.webSocketDebuggerUrl,
  );
}

export async function getActiveTab(): Promise<CdpTarget | null> {
  const tabs = await listTabs();
  return tabs[0] || null;
}

// ─── Persistent CDP Connection ─────────────────────────
let activeWs: WebSocket | null = null;
let activeWsUrl: string | null = null;
let msgId = 1;
const pendingCallbacks = new Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>();

function getConnection(wsUrl: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    // Reuse if already connected to the same tab
    if (activeWs && activeWsUrl === wsUrl && activeWs.readyState === WebSocket.OPEN) {
      resolve(activeWs);
      return;
    }

    // Close old connection
    if (activeWs) {
      try {
        activeWs.close();
      } catch {}
      activeWs = null;
    }

    const ws = new WebSocket(wsUrl);
    activeWsUrl = wsUrl;

    ws.on('open', () => {
      activeWs = ws;
      resolve(ws);
    });

    ws.on('message', (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pendingCallbacks.has(msg.id)) {
        const cb = pendingCallbacks.get(msg.id)!;
        pendingCallbacks.delete(msg.id);
        if (msg.error) {
          cb.reject(new Error(msg.error.message));
        } else {
          cb.resolve(msg.result);
        }
      }
    });

    ws.on('error', (err: Error) => {
      reject(err);
      activeWs = null;
    });

    ws.on('close', () => {
      activeWs = null;
      // Reject all pending
      for (const [id, cb] of pendingCallbacks) {
        cb.reject(new Error('WebSocket closed'));
        pendingCallbacks.delete(id);
      }
    });
  });
}

async function cdp(
  wsUrl: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const ws = await getConnection(wsUrl);
  const id = msgId++;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCallbacks.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 10000);

    pendingCallbacks.set(id, {
      resolve: (v) => {
        clearTimeout(timeout);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timeout);
        reject(e);
      },
    });

    ws.send(JSON.stringify({ id, method, params }));
  });
}

// ─── Inspector Operations ──────────────────────────────

export async function injectInspector(wsUrl: string): Promise<void> {
  await cdp(wsUrl, 'Runtime.enable');
  await cdp(wsUrl, 'Page.enable');

  await cdp(wsUrl, 'Runtime.evaluate', {
    expression: `
      (function() {
        if (window.__orkaInspector) return;
        window.__orkaInspector = true;

        var ov = document.createElement('div');
        ov.id = '__orka-ov';
        ov.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #10a37f;background:rgba(16,163,127,0.08);display:none;transition:all 60ms ease;';
        document.documentElement.appendChild(ov);

        var lb = document.createElement('div');
        lb.id = '__orka-lb';
        lb.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:#10a37f;color:white;font:11px monospace;padding:2px 8px;border-radius:3px;display:none;';
        document.documentElement.appendChild(lb);

        var badge = document.createElement('div');
        badge.id = '__orka-badge';
        badge.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#10a37f;color:white;font:12px system-ui;padding:6px 14px;border-radius:20px;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
        badge.textContent = 'Orka Inspect Mode';
        document.documentElement.appendChild(badge);

        var hoveredEl = null;

        document.addEventListener('mousemove', function(e) {
          var el = document.elementFromPoint(e.clientX, e.clientY);
          if (!el || el===ov || el===lb || el===badge) return;
          hoveredEl = el;
          var r = el.getBoundingClientRect();
          ov.style.display='block'; ov.style.left=r.x+'px'; ov.style.top=r.y+'px';
          ov.style.width=r.width+'px'; ov.style.height=r.height+'px';
          lb.style.display='block'; lb.style.left=r.x+'px'; lb.style.top=Math.max(0,r.y-22)+'px';
          lb.textContent = el.tagName.toLowerCase() + (el.id ? '#'+el.id : '') + (el.className && typeof el.className==='string' ? '.'+el.className.split(' ')[0] : '');
        }, true);

        document.addEventListener('click', function(e) {
          if (!hoveredEl) return;
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
          var el = hoveredEl;
          var getSelector = function(el) {
            if (el.id) return '#' + el.id;
            var p=[],c=el;
            while(c&&c!==document.body){var s=c.tagName.toLowerCase();if(c.className&&typeof c.className==='string'){var cls=c.className.trim().split(/\\\\s+/).slice(0,2).join('.');if(cls)s+='.'+cls;}p.unshift(s);c=c.parentElement;}
            return p.join(' > ');
          };
          var getDomPath = function(el) {
            var p=[],c=el;
            while(c&&c!==document){p.unshift((c.tagName?c.tagName.toLowerCase():'')+(c.id?'#'+c.id:''));c=c.parentNode;}
            return p.join(' > ');
          };
          var rect = el.getBoundingClientRect();
          window.__orkaLastSelection = {
            selector: getSelector(el), domPath: getDomPath(el),
            textContent: (el.textContent||'').trim().substring(0,500),
            boundingBox: {x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)},
            ariaRole: el.getAttribute('role'), tagName: el.tagName.toLowerCase(),
            className: typeof el.className==='string'?el.className:'', id: el.id||'',
            pageUrl: window.location.href, pageTitle: document.title
          };
        }, true);
      })()
    `,
  });
}

export async function removeInspector(wsUrl: string): Promise<void> {
  await cdp(wsUrl, 'Runtime.evaluate', {
    expression: `
      (function() {
        ['__orka-ov','__orka-lb','__orka-badge'].forEach(function(id){
          var el=document.getElementById(id);if(el)el.remove();
        });
        window.__orkaInspector = false;
      })()
    `,
  });
}

export async function getLastSelection(wsUrl: string): Promise<Record<string, unknown> | null> {
  const result = (await cdp(wsUrl, 'Runtime.evaluate', {
    expression: 'JSON.stringify(window.__orkaLastSelection || null)',
    returnByValue: true,
  })) as { result: { value: string } };

  const value = result?.result?.value;
  if (!value || value === 'null') return null;

  // Clear after reading
  await cdp(wsUrl, 'Runtime.evaluate', {
    expression: 'window.__orkaLastSelection = null',
  });

  return JSON.parse(value);
}

export async function captureScreenshot(wsUrl: string): Promise<string> {
  const result = (await cdp(wsUrl, 'Page.captureScreenshot', {
    format: 'png',
  })) as { data: string };
  return result.data;
}

/**
 * Close the persistent connection.
 */
export function closeCdpConnection(): void {
  if (activeWs) {
    try {
      activeWs.close();
    } catch {}
    activeWs = null;
    activeWsUrl = null;
  }
}
