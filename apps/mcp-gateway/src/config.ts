export const config = {
  port: parseInt(process.env.PORT || '4001', 10),
  defaultTimeoutMs: parseInt(process.env.DEFAULT_TOOL_TIMEOUT_MS || '10000', 10),
  maxRetries: parseInt(process.env.MAX_TOOL_RETRIES || '2', 10),
};
