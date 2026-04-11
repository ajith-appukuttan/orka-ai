import type { Request, Response, NextFunction } from 'express';

export function auditToolCall(req: Request, _res: Response, next: NextFunction): void {
  const toolId = String(req.params.toolId);
  const tenantId = String(req.headers['x-tenant-id'] ?? 'unknown');
  const sessionId = String(req.headers['x-session-id'] ?? 'unknown');

  console.info(
    JSON.stringify({
      event: 'tool_invocation',
      toolId,
      tenantId,
      sessionId,
      timestamp: new Date().toISOString(),
    }),
  );

  next();
}
