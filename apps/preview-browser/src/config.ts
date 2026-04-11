export const config = {
  port: parseInt(process.env.PORT || '4002', 10),

  // URL allowlist patterns (regex)
  allowedHosts: (
    process.env.ALLOWED_PREVIEW_HOSTS || 'localhost,127.0.0.1,*.asurion.net,*.aws.asurion.net'
  )
    .split(',')
    .map((h) => h.trim()),

  // Max concurrent browser sessions
  maxSessions: parseInt(process.env.MAX_PREVIEW_SESSIONS || '10', 10),

  // Session timeout (ms) — auto-cleanup idle sessions
  sessionTimeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS || '600000', 10), // 10 min

  // Screenshot settings
  screenshot: {
    maxWidth: 1440,
    maxHeight: 900,
    quality: 80,
  },
};
