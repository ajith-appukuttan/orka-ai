import type { Request, Response } from 'express';
import { INSPECTOR_CLIENT_SCRIPT } from './inspectorClient.js';

/**
 * Fetch the target URL and rewrite the HTML to inject the inspector script.
 * Also rewrites relative URLs to route through the proxy.
 */
export async function proxyAndInject(
  targetUrl: string,
  proxyBaseUrl: string,
  sessionId: string,
  req: Request,
  res: Response,
): Promise<void> {
  try {
    // Build the full URL for sub-resources
    const targetBase = new URL(targetUrl);
    const requestPath = req.params[0] || '';
    const fullUrl = requestPath ? new URL(requestPath, targetUrl).href : targetUrl;

    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Orka-Preview/1.0',
        Accept: req.headers['accept'] || '*/*',
        'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
        Cookie: req.headers['cookie'] || '',
      },
      redirect: 'follow',
    });

    const contentType = response.headers.get('content-type') || '';

    // For non-HTML resources, just pipe through
    if (!contentType.includes('text/html')) {
      res.status(response.status);
      res.set('Content-Type', contentType);
      // Handle binary vs text
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
      return;
    }

    // For HTML, inject the inspector script
    let html = await response.text();

    // Inject inspector script before </head> or </body>
    const scriptTag = `<script data-orka-inspector="true">${INSPECTOR_CLIENT_SCRIPT}</script>`;

    if (html.includes('</head>')) {
      html = html.replace('</head>', scriptTag + '</head>');
    } else if (html.includes('</body>')) {
      html = html.replace('</body>', scriptTag + '</body>');
    } else {
      html += scriptTag;
    }

    // Rewrite base URL so relative resources load through the proxy
    const baseTag = `<base href="${targetBase.origin}/">`;
    if (html.includes('<head>')) {
      html = html.replace('<head>', '<head>' + baseTag);
    } else if (html.includes('<HEAD>')) {
      html = html.replace('<HEAD>', '<HEAD>' + baseTag);
    }

    // Remove X-Frame-Options and CSP frame-ancestors that would block iframe embedding
    res.status(response.status);
    res.set('Content-Type', 'text/html');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.send(html);
  } catch (err) {
    console.error(`Proxy fetch failed for ${targetUrl}:`, err);
    res.status(502).json({ error: 'Failed to fetch target URL' });
  }
}
