import { useState, useEffect, useCallback } from 'react';

export interface InspectedElement {
  selector: string;
  domPath: string;
  textContent: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  ariaRole: string | null;
  tagName: string;
  className: string;
  id: string;
  pageUrl: string;
  pageTitle: string;
  screenshot: string | null; // base64 PNG of the element
}

/**
 * Hook that listens for messages from the Orka browser extension.
 * The extension sends element selection events via window.postMessage.
 */
export function useExtensionBridge() {
  const [connected, setConnected] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [lastElement, setLastElement] = useState<InspectedElement | null>(null);

  // Listen for messages from the extension
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // Only handle messages from our extension
      if (!e.data || e.data.source !== 'orka-extension') return;

      switch (e.data.type) {
        case 'element_selected':
          if (e.data.element) {
            setLastElement({
              ...e.data.element,
              screenshot: e.data.screenshot || null,
            });
            setConnected(true);
          }
          break;

        case 'inspect_mode_changed':
          setInspectMode(e.data.enabled);
          setConnected(true);
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Check if extension is available (try to ping it)
  useEffect(() => {
    // The extension sets a flag on the window when it's available
    const checkInterval = setInterval(() => {
      // Check for extension by looking for its content script marker
      const marker = document.getElementById('__orka-ext-bridge-marker');
      setConnected(!!marker);
    }, 5000);

    return () => clearInterval(checkInterval);
  }, []);

  const clearLastElement = useCallback(() => {
    setLastElement(null);
  }, []);

  return {
    connected,
    inspectMode,
    lastElement,
    clearLastElement,
  };
}
