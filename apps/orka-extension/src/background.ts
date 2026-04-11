/**
 * Orka Extension — Background Service Worker
 *
 * Routes messages between content scripts and the Orka UI tab.
 * Handles screenshot capture and cropping.
 */

// Track state
let inspectMode = false;
let orkaTabId: number | null = null;

// Find or remember the Orka UI tab
async function findOrkaTab(): Promise<number | null> {
  if (orkaTabId) {
    try {
      const tab = await chrome.tabs.get(orkaTabId);
      if (tab && tab.url?.includes('localhost:5173')) return orkaTabId;
    } catch {
      orkaTabId = null;
    }
  }

  const tabs = await chrome.tabs.query({ url: 'http://localhost:5173/*' });
  if (tabs.length > 0 && tabs[0].id) {
    orkaTabId = tabs[0].id;
    return orkaTabId;
  }
  return null;
}

// Send message to the Orka UI tab
async function sendToOrkaTab(message: Record<string, unknown>): Promise<void> {
  const tabId = await findOrkaTab();
  if (!tabId) {
    console.warn('Orka UI tab not found. Open http://localhost:5173 first.');
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      source: 'orka-extension',
      ...message,
    });
  } catch {
    // Orka tab might not have a content script listener yet.
    // Fall back to executing a script that posts a message.
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (msg: string) => {
        window.postMessage(JSON.parse(msg), '*');
      },
      args: [JSON.stringify({ source: 'orka-extension', ...message })],
    });
  }
}

// Capture and crop screenshot for the selected element
async function captureElementScreenshot(
  tabId: number,
  boundingBox: { x: number; y: number; width: number; height: number },
): Promise<string | null> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });

    // Crop using OffscreenCanvas
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const dpr = 1; // devicePixelRatio is 1 for captureVisibleTab
    const x = Math.max(0, Math.round(boundingBox.x * dpr));
    const y = Math.max(0, Math.round(boundingBox.y * dpr));
    const w = Math.max(1, Math.round(boundingBox.width * dpr));
    const h = Math.max(1, Math.round(boundingBox.height * dpr));

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });

    // Convert to base64
    const buffer = await croppedBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.error('Screenshot capture failed:', err);
    return null;
  }
}

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'orka_element_selected') {
    // Content script selected an element — capture screenshot and forward to Orka UI
    const tabId = sender.tab?.id;
    if (!tabId) return;

    (async () => {
      const screenshot = await captureElementScreenshot(tabId, message.element.boundingBox);

      await sendToOrkaTab({
        type: 'element_selected',
        element: message.element,
        screenshot,
      });

      // Also respond to the content script
      sendResponse({ ok: true });
    })();

    return true; // async response
  }

  if (message.type === 'orka_get_state') {
    sendResponse({ inspectMode });
    return;
  }

  if (message.type === 'orka_inspect_toggled') {
    inspectMode = message.enabled;
    // Notify all tabs
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id && tab.id !== orkaTabId) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'orka_set_inspect',
              enabled: inspectMode,
            })
            .catch(() => {});
        }
      }
    });
    return;
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-inspect') {
    inspectMode = !inspectMode;

    // Notify all tabs
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'orka_set_inspect',
              enabled: inspectMode,
            })
            .catch(() => {});
        }
      }
    });

    // Notify Orka UI
    sendToOrkaTab({ type: 'inspect_mode_changed', enabled: inspectMode });
  }
});

// Handle external connections from Orka UI (externally_connectable)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'orka_ping') {
    sendResponse({ connected: true, inspectMode });
    return;
  }

  if (message.type === 'orka_set_inspect') {
    inspectMode = message.enabled;
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'orka_set_inspect',
              enabled: inspectMode,
            })
            .catch(() => {});
        }
      }
    });
    sendResponse({ ok: true });
    return;
  }
});

console.log('Orka Visual Intake extension loaded');
