import type { Page } from 'playwright';

export interface ElementMetadata {
  selector: string;
  domPath: string;
  textContent: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  ariaRole: string | null;
  tagName: string;
  className: string;
  id: string;
}

/**
 * The inspector script injected into the target page.
 * Provides hover highlight and click-to-select with metadata extraction.
 */
const INSPECTOR_SCRIPT = `
(function() {
  if (window.__orkaInspectorActive) return;
  window.__orkaInspectorActive = true;

  // Overlay element for hover highlight
  const overlay = document.createElement('div');
  overlay.id = '__orka-inspector-overlay';
  overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:999999;border:2px solid #10a37f;background:rgba(16,163,127,0.1);transition:all 0.1s ease;display:none;';
  document.body.appendChild(overlay);

  // Label element
  const label = document.createElement('div');
  label.id = '__orka-inspector-label';
  label.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;background:#10a37f;color:white;font:11px monospace;padding:2px 6px;border-radius:2px;display:none;';
  document.body.appendChild(label);

  let hoveredEl = null;

  function getSelector(el) {
    if (el.id) return '#' + el.id;
    let path = [];
    while (el && el !== document.body) {
      let seg = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        const cls = el.className.trim().split(/\\s+/).slice(0, 2).join('.');
        if (cls) seg += '.' + cls;
      }
      path.unshift(seg);
      el = el.parentElement;
    }
    return path.join(' > ');
  }

  function getDomPath(el) {
    let path = [];
    while (el && el !== document) {
      let seg = el.tagName?.toLowerCase() || '';
      if (el.id) seg += '#' + el.id;
      path.unshift(seg);
      el = el.parentNode;
    }
    return path.join(' > ');
  }

  function getMetadata(el) {
    const rect = el.getBoundingClientRect();
    return {
      selector: getSelector(el),
      domPath: getDomPath(el),
      textContent: (el.textContent || '').trim().substring(0, 500),
      boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      ariaRole: el.getAttribute('role'),
      tagName: el.tagName.toLowerCase(),
      className: el.className || '',
      id: el.id || ''
    };
  }

  document.addEventListener('mousemove', (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay || el === label || el.id?.startsWith('__orka')) return;
    hoveredEl = el;
    const rect = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = rect.x + 'px';
    overlay.style.top = rect.y + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    label.style.display = 'block';
    label.style.left = rect.x + 'px';
    label.style.top = Math.max(0, rect.y - 20) + 'px';
    label.textContent = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : '');
  }, true);

  document.addEventListener('click', (e) => {
    if (!hoveredEl) return;
    e.preventDefault();
    e.stopPropagation();
    const metadata = getMetadata(hoveredEl);
    window.__orkaOnElementSelected(JSON.stringify(metadata));
  }, true);

  // Disable all links and form submissions
  document.addEventListener('submit', (e) => { e.preventDefault(); }, true);
})();
`;

/**
 * Inject the inspector overlay into a page.
 * Returns a promise that resolves when an element is selected.
 */
export async function injectInspector(page: Page): Promise<void> {
  // Expose callback function
  await page.exposeFunction('__orkaOnElementSelected', (metadataJson: string) => {
    const metadata = JSON.parse(metadataJson) as ElementMetadata;
    // Store on the page for retrieval
    (page as unknown as Record<string, unknown>).__lastSelectedElement = metadata;
  });

  await page.evaluate(INSPECTOR_SCRIPT);
}

/**
 * Get the last selected element from a page.
 */
export function getLastSelectedElement(page: Page): ElementMetadata | null {
  return (
    ((page as unknown as Record<string, unknown>).__lastSelectedElement as ElementMetadata) ?? null
  );
}

/**
 * Get element metadata by coordinates (simulates click at position).
 */
export async function getElementAtPosition(
  page: Page,
  x: number,
  y: number,
): Promise<ElementMetadata | null> {
  const metadata = await page.evaluate(
    ([cx, cy]) => {
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
          let seg = (current as Element).tagName?.toLowerCase() || '';
          if ((current as Element).id) seg += '#' + (current as Element).id;
          path.unshift(seg);
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
        className: el.className || '',
        id: el.id || '',
      };
    },
    [x, y] as [number, number],
  );

  return metadata as ElementMetadata | null;
}
