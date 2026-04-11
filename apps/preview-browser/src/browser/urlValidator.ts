import { config } from '../config.js';

/**
 * Validate that a URL is in the allowlist.
 * Handles URLs with or without scheme.
 */
export function isUrlAllowed(rawUrl: string): boolean {
  try {
    // Add scheme if missing
    let url = rawUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }

    const parsed = new URL(url);
    const hostname = parsed.hostname;

    const allowed = config.allowedHosts.some((pattern) => {
      // Exact match
      if (hostname === pattern) return true;

      // Wildcard match (e.g., *.staging.*)
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        return regex.test(hostname);
      }

      return false;
    });

    if (!allowed) {
      console.info(
        `URL rejected: hostname "${hostname}" not in allowlist [${config.allowedHosts.join(', ')}]`,
      );
    }

    return allowed;
  } catch (err) {
    console.error(`URL validation failed for "${rawUrl}":`, err);
    return false;
  }
}

/**
 * Normalize a URL to ensure it has a scheme.
 */
export function normalizeUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  return url;
}
