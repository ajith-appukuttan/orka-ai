/**
 * Orka Extension — Content Script
 *
 * Injected into every page. Provides:
 * - Hover highlight overlay
 * - Click-to-select element with metadata capture
 * - Toggled on/off via messages from background
 */

let inspectActive = false;
let hoveredEl: Element | null = null;

// Create overlay elements
const overlay = document.createElement('div');
overlay.id = '__orka-ext-overlay';
overlay.style.cssText =
  'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #10a37f;background:rgba(16,163,127,0.08);display:none;transition:all 60ms ease;';

const label = document.createElement('div');
label.id = '__orka-ext-label';
label.style.cssText =
  'position:fixed;z-index:2147483647;pointer-events:none;background:#10a37f;color:white;font:11px/1.2 monospace;padding:2px 8px;border-radius:3px;display:none;white-space:nowrap;max-width:400px;overflow:hidden;text-overflow:ellipsis;';

const badge = document.createElement('div');
badge.id = '__orka-ext-badge';
badge.style.cssText =
  'position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#10a37f;color:white;font:12px/1 system-ui,sans-serif;padding:6px 12px;border-radius:20px;display:none;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
badge.textContent = 'Orka Inspect Mode';

document.documentElement.appendChild(overlay);
document.documentElement.appendChild(label);
document.documentElement.appendChild(badge);

function getSelector(el: Element): string {
  if (el.id) return '#' + el.id;
  const path: string[] = [];
  let c: Element | null = el;
  while (c && c !== document.body) {
    let seg = c.tagName.toLowerCase();
    if (c.className && typeof c.className === 'string') {
      const cls = c.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (cls) seg += '.' + cls;
    }
    path.unshift(seg);
    c = c.parentElement;
  }
  return path.join(' > ');
}

function getDomPath(el: Element): string {
  const path: string[] = [];
  let c: Node | null = el;
  while (c && c !== document) {
    const tag = (c as Element).tagName?.toLowerCase() || '';
    const id = (c as Element).id ? '#' + (c as Element).id : '';
    path.unshift(tag + id);
    c = c.parentNode;
  }
  return path.join(' > ');
}

function getMetadata(el: Element) {
  const rect = el.getBoundingClientRect();
  return {
    selector: getSelector(el),
    domPath: getDomPath(el),
    textContent: (el.textContent || '').trim().substring(0, 500),
    boundingBox: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    ariaRole: el.getAttribute('role'),
    tagName: el.tagName.toLowerCase(),
    className: typeof el.className === 'string' ? el.className : '',
    id: el.id || '',
    pageUrl: window.location.href,
    pageTitle: document.title,
  };
}

function isOrkaElement(el: Element): boolean {
  const id = el.id || '';
  return id.startsWith('__orka-ext');
}

// Mouse move — update hover highlight
document.addEventListener(
  'mousemove',
  (e) => {
    if (!inspectActive) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOrkaElement(el)) return;

    hoveredEl = el;
    const rect = el.getBoundingClientRect();

    overlay.style.display = 'block';
    overlay.style.left = rect.x + 'px';
    overlay.style.top = rect.y + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    label.style.display = 'block';
    label.style.left = rect.x + 'px';
    label.style.top = Math.max(0, rect.y - 22) + 'px';

    const tagName = el.tagName.toLowerCase();
    const elId = el.id ? '#' + el.id : '';
    const cls =
      el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/)[0]
        : '';
    label.textContent = tagName + elId + cls;
  },
  true,
);

// Click — select element
document.addEventListener(
  'click',
  (e) => {
    if (!inspectActive || !hoveredEl) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const metadata = getMetadata(hoveredEl);

    // Send to background service worker
    chrome.runtime.sendMessage({
      type: 'orka_element_selected',
      element: metadata,
    });
  },
  true,
);

// Listen for messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'orka_set_inspect') {
    inspectActive = message.enabled;

    if (inspectActive) {
      badge.style.display = 'block';
      document.body.style.cursor = 'crosshair';
    } else {
      overlay.style.display = 'none';
      label.style.display = 'none';
      badge.style.display = 'none';
      document.body.style.cursor = '';
      hoveredEl = null;
    }
  }
});

// Get initial state
chrome.runtime.sendMessage({ type: 'orka_get_state' }, (response) => {
  if (response?.inspectMode) {
    inspectActive = true;
    badge.style.display = 'block';
    document.body.style.cursor = 'crosshair';
  }
});
