/**
 * Inspector script injected into proxied HTML pages.
 * Communicates with the parent window (Orka UI) via postMessage.
 *
 * This is served as a standalone JS file, not executed in Node.
 */
export const INSPECTOR_CLIENT_SCRIPT = `
(function() {
  if (window.__orkaInspectorLoaded) return;
  window.__orkaInspectorLoaded = true;

  let inspectMode = false;
  let hoveredEl = null;

  // Overlay for hover highlight
  const overlay = document.createElement('div');
  overlay.id = '__orka-overlay';
  overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #10a37f;background:rgba(16,163,127,0.08);transition:all 80ms ease;display:none;';
  document.body.appendChild(overlay);

  // Label
  const label = document.createElement('div');
  label.id = '__orka-label';
  label.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:#10a37f;color:white;font:11px/1.2 monospace;padding:2px 6px;border-radius:3px;display:none;white-space:nowrap;max-width:300px;overflow:hidden;text-overflow:ellipsis;';
  document.body.appendChild(label);

  function getSelector(el) {
    if (el.id) return '#' + el.id;
    let path = [];
    while (el && el !== document.body) {
      let seg = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        const cls = el.className.trim().split(/\\\\s+/).slice(0, 2).join('.');
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
      let seg = el.tagName ? el.tagName.toLowerCase() : '';
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
      className: typeof el.className === 'string' ? el.className : '',
      id: el.id || '',
      pageUrl: window.location.href
    };
  }

  // Listen for inspect mode toggle from parent
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === '__orka_set_inspect') {
      inspectMode = e.data.enabled;
      if (!inspectMode) {
        overlay.style.display = 'none';
        label.style.display = 'none';
        hoveredEl = null;
      }
    }
  });

  document.addEventListener('mousemove', function(e) {
    if (!inspectMode) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay || el === label || (el.id && el.id.startsWith('__orka'))) return;
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
    label.textContent = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
  }, true);

  document.addEventListener('click', function(e) {
    if (!inspectMode || !hoveredEl) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const metadata = getMetadata(hoveredEl);
    // Send to parent window
    window.parent.postMessage({ type: '__orka_element_selected', element: metadata }, '*');
  }, true);

  // Notify parent that inspector is ready
  window.parent.postMessage({ type: '__orka_inspector_ready' }, '*');
})();
`;
