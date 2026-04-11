import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { config } from './config.js';
import {
  initBrowser,
  createSession,
  getSession,
  destroySession,
  getSessionCount,
} from './browser/pool.js';
import {
  injectInspector as injectPlaywrightInspector,
  getElementAtPosition,
} from './browser/inspector.js';
import { takeScreenshot, takeRegionScreenshot } from './browser/screenshot.js';
import { isUrlAllowed, normalizeUrl } from './browser/urlValidator.js';
import { proxyAndInject } from './browser/proxy.js';
import {
  initLiveBrowser,
  createLiveSession,
  getLiveScreenshot,
  clickAt,
  scrollPage,
  navigateTo,
  getCurrentUrl,
  destroyLiveSession,
  getLiveSessionCount,
} from './browser/livePreview.js';
import {
  createScreencastSession,
  handleClientConnection,
  destroyScreencastSession,
  getScreencastSessionCount,
} from './browser/screencast.js';
import {
  launchChrome,
  isChromeRunning,
  isChromeAvailable,
  closeChrome,
} from './browser/chromeLauncher.js';
import {
  listTabs,
  getActiveTab,
  injectInspector,
  removeInspector,
  getLastSelection,
  captureScreenshot,
} from './browser/cdpClient.js';
import { WebSocketServer } from 'ws';
import http from 'node:http';

const app = express();
app.use(cors());
app.use(express.json());

// Track proxy sessions (URL -> sessionId mapping)
const proxySessions = new Map<string, { id: string; targetUrl: string }>();

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    activeSessions: getSessionCount(),
    proxySessions: proxySessions.size,
    liveSessions: getLiveSessionCount(),
    screencastSessions: getScreencastSessionCount(),
  });
});

// ─── Chrome Browser (real window + CDP) ─────────────────────

// Launch a real Chrome window (or reuse existing)
app.post('/chrome/launch', async (req, res) => {
  const { url } = req.body;
  try {
    const result = await launchChrome(url);
    res.json({ status: 'launched', ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to launch Chrome' });
  }
});

// Check Chrome status
app.get('/chrome/status', async (_req, res) => {
  res.json({ running: await isChromeAvailable() });
});

// List open tabs
app.get('/chrome/tabs', async (_req, res) => {
  if (!(await isChromeAvailable())) {
    res.status(400).json({ error: 'Chrome not running' });
    return;
  }
  try {
    const tabs = await listTabs();
    res.json({ tabs });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list tabs' });
  }
});

// Enable inspect mode on the active tab
app.post('/chrome/inspect/enable', async (_req, res) => {
  if (!(await isChromeAvailable())) {
    res.status(400).json({ error: 'Chrome not running' });
    return;
  }
  try {
    const tab = await getActiveTab();
    if (!tab) {
      res.status(404).json({ error: 'No active tab found' });
      return;
    }
    await injectInspector(tab.webSocketDebuggerUrl);
    res.json({ ok: true, tab: { id: tab.id, title: tab.title, url: tab.url } });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to enable inspect' });
  }
});

// Disable inspect mode
app.post('/chrome/inspect/disable', async (_req, res) => {
  if (!(await isChromeAvailable())) {
    res.status(400).json({ error: 'Chrome not running' });
    return;
  }
  try {
    const tab = await getActiveTab();
    if (tab) await removeInspector(tab.webSocketDebuggerUrl);
    res.json({ ok: true });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to disable inspect' });
  }
});

// Poll for selected element
app.get('/chrome/inspect/selection', async (_req, res) => {
  if (!(await isChromeAvailable())) {
    res.status(400).json({ error: 'Chrome not running' });
    return;
  }
  try {
    const tab = await getActiveTab();
    if (!tab) {
      res.status(404).json({ error: 'No active tab' });
      return;
    }
    const selection = await getLastSelection(tab.webSocketDebuggerUrl);
    if (!selection) {
      res.json({ selection: null });
      return;
    }

    // Also capture a screenshot for visual context
    let screenshot: string | null = null;
    try {
      screenshot = await captureScreenshot(tab.webSocketDebuggerUrl);
    } catch {
      /* non-fatal */
    }

    res.json({ selection, screenshot });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get selection' });
  }
});

// Close Chrome
app.post('/chrome/close', (_req, res) => {
  closeChrome();
  res.json({ ok: true });
});

// ─── Screencast sessions (WebSocket-streamed live browser) ──

// Create screencast session — returns session ID for WebSocket connection
app.post('/screencast-sessions', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required' });
    return;
  }
  const normalizedUrl = normalizeUrl(url);
  if (!isUrlAllowed(normalizedUrl)) {
    res
      .status(403)
      .json({ error: `URL not allowed. Allowed hosts: ${config.allowedHosts.join(', ')}` });
    return;
  }
  try {
    const id = crypto.randomUUID();
    await createScreencastSession(id, normalizedUrl);
    // Client should connect to ws://host:port/screencast/:id
    res.json({ id, wsUrl: `/screencast/${id}` });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to create screencast session' });
  }
});

// Destroy screencast session
app.delete('/screencast-sessions/:id', async (req, res) => {
  await destroyScreencastSession(String(req.params.id));
  res.json({ ok: true });
});

// ─── Live Preview sessions (Playwright-rendered, handles SSO/auth) ──

// Create live session — returns initial screenshot
app.post('/live-sessions', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required' });
    return;
  }
  const normalizedUrl = normalizeUrl(url);
  if (!isUrlAllowed(normalizedUrl)) {
    res
      .status(403)
      .json({ error: `URL not allowed. Allowed hosts: ${config.allowedHosts.join(', ')}` });
    return;
  }
  try {
    const id = crypto.randomUUID();
    const result = await createLiveSession(id, normalizedUrl);
    res.json({ id, url: normalizedUrl, screenshot: result.screenshot });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to create live session' });
  }
});

// Get current screenshot
app.get('/live-sessions/:id/screenshot', async (req, res) => {
  const screenshot = await getLiveScreenshot(String(req.params.id));
  if (!screenshot) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ screenshot });
});

// Click at position (inspect mode or normal navigation)
app.post('/live-sessions/:id/click', async (req, res) => {
  const { x, y, inspectMode } = req.body;
  if (typeof x !== 'number' || typeof y !== 'number') {
    res.status(400).json({ error: 'x, y are required' });
    return;
  }
  try {
    const result = await clickAt(String(req.params.id), x, y, !!inspectMode);
    if (!result) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Click failed' });
  }
});

// Scroll
app.post('/live-sessions/:id/scroll', async (req, res) => {
  const { deltaX, deltaY } = req.body;
  const screenshot = await scrollPage(String(req.params.id), deltaX || 0, deltaY || 0);
  if (!screenshot) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ screenshot });
});

// Navigate
app.post('/live-sessions/:id/navigate', async (req, res) => {
  const { url } = req.body;
  const screenshot = await navigateTo(String(req.params.id), url);
  if (!screenshot) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ screenshot, currentUrl: getCurrentUrl(String(req.params.id)) });
});

// Get current URL
app.get('/live-sessions/:id/url', (req, res) => {
  const url = getCurrentUrl(String(req.params.id));
  if (!url) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ url });
});

// Destroy live session
app.delete('/live-sessions/:id', async (req, res) => {
  await destroyLiveSession(String(req.params.id));
  res.json({ ok: true });
});

// ─── Proxy-based sessions (live iframe) ─────────────────

// Create a proxy session — returns an iframe URL
app.post('/proxy-sessions', (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  const normalizedUrl = normalizeUrl(url);

  if (!isUrlAllowed(normalizedUrl)) {
    res.status(403).json({
      error: `URL not allowed. Allowed hosts: ${config.allowedHosts.join(', ')}`,
    });
    return;
  }

  const id = crypto.randomUUID();
  proxySessions.set(id, { id, targetUrl: normalizedUrl });

  const proxyUrl = `/proxy/${id}/`;

  res.json({ id, proxyUrl, targetUrl: normalizedUrl });
});

// Proxy route — serves the target page with inspector injected
app.get('/proxy/:sessionId/*', (req, res) => {
  const sessionId = String(req.params.sessionId);
  const proxySession = proxySessions.get(sessionId);

  if (!proxySession) {
    res.status(404).json({ error: 'Proxy session not found' });
    return;
  }

  proxyAndInject(
    proxySession.targetUrl,
    `${req.protocol}://${req.get('host')}/proxy/${sessionId}`,
    sessionId,
    req,
    res,
  );
});

// Proxy root (no trailing path)
app.get('/proxy/:sessionId', (req, res) => {
  const sessionId = String(req.params.sessionId);
  const proxySession = proxySessions.get(sessionId);

  if (!proxySession) {
    res.status(404).json({ error: 'Proxy session not found' });
    return;
  }

  proxyAndInject(
    proxySession.targetUrl,
    `${req.protocol}://${req.get('host')}/proxy/${sessionId}`,
    sessionId,
    req,
    res,
  );
});

// Delete proxy session
app.delete('/proxy-sessions/:id', (req, res) => {
  proxySessions.delete(String(req.params.id));
  res.json({ ok: true });
});

// ─── Playwright-based sessions (screenshot) ─────────────

// Create a new preview session
app.post('/sessions', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  const normalizedUrl = normalizeUrl(url);

  if (!isUrlAllowed(normalizedUrl)) {
    res.status(403).json({
      error: `URL not allowed. Allowed hosts: ${config.allowedHosts.join(', ')}`,
    });
    return;
  }

  try {
    const id = crypto.randomUUID();
    const session = await createSession(id, normalizedUrl);
    await injectPlaywrightInspector(session.page);
    const screenshot = await takeScreenshot(session.page);

    res.json({
      id: session.id,
      url: session.url,
      screenshot: screenshot.toString('base64'),
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to create session' });
  }
});

// Get full page screenshot
app.get('/sessions/:id/screenshot', async (req, res) => {
  const session = getSession(String(req.params.id));
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  try {
    const screenshot = await takeScreenshot(session.page);
    res.json({ screenshot: screenshot.toString('base64') });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Screenshot failed' });
  }
});

// Get screenshot of a specific region
app.post('/sessions/:id/screenshot-region', async (req, res) => {
  const session = getSession(String(req.params.id));
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  const { x, y, width, height } = req.body;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    res.status(400).json({ error: 'x, y, width, height are required numbers' });
    return;
  }
  try {
    const screenshot = await takeRegionScreenshot(session.page, { x, y, width, height });
    res.json({ screenshot: screenshot.toString('base64') });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Region screenshot failed' });
  }
});

// Get element info at coordinates
app.post('/sessions/:id/element-at', async (req, res) => {
  const session = getSession(String(req.params.id));
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  const { x, y } = req.body;
  if (typeof x !== 'number' || typeof y !== 'number') {
    res.status(400).json({ error: 'x, y coordinates are required' });
    return;
  }
  try {
    const metadata = await getElementAtPosition(session.page, x, y);
    if (!metadata) {
      res.status(404).json({ error: 'No element found at position' });
      return;
    }
    let elementScreenshot: string | null = null;
    if (metadata.boundingBox.width > 0 && metadata.boundingBox.height > 0) {
      const crop = await takeRegionScreenshot(session.page, metadata.boundingBox);
      elementScreenshot = crop.toString('base64');
    }
    res.json({ element: metadata, screenshot: elementScreenshot });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Element info failed' });
  }
});

// Destroy a session
app.delete('/sessions/:id', async (req, res) => {
  await destroySession(String(req.params.id));
  res.json({ ok: true });
});

// Start server
async function start() {
  await initBrowser();
  await initLiveBrowser();

  const httpServer = http.createServer(app);

  // WebSocket server for screencast streaming
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://localhost:${config.port}`);
    const match = url.pathname.match(/^\/screencast\/([^/]+)$/);

    if (match) {
      const sessionId = match[1];
      wss.handleUpgrade(request, socket, head, (ws) => {
        const connected = handleClientConnection(sessionId, ws);
        if (!connected) {
          ws.close(4004, 'Session not found');
        }
      });
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(config.port, () => {
    console.info(`Preview Browser Service running at http://localhost:${config.port}`);
    console.info(`Allowed hosts: ${config.allowedHosts.join(', ')}`);
    console.info(`Modes: screencast (WS /screencast/:id), live, proxy, screenshot`);
  });
}

start().catch((err) => {
  console.error('Failed to start Preview Browser Service:', err);
  process.exit(1);
});
