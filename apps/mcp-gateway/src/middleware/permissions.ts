import type { Request, Response, NextFunction } from 'express';
import { registry } from '../registry/index.js';

export function checkToolPermissions(req: Request, res: Response, next: NextFunction): void {
  const toolId = String(req.params.toolId);
  const tenantIdRaw = req.headers['x-tenant-id'];
  const tenantId: string = Array.isArray(tenantIdRaw)
    ? (tenantIdRaw[0] ?? 'default')
    : (tenantIdRaw ?? 'default');

  const handler = registry.get(toolId);
  if (!handler) {
    res.status(404).json({ error: `Tool ${toolId} not found` });
    return;
  }

  // Check tenant scope
  const tool = handler.tool;
  if (!tool.tenantScopes.includes('*') && !tool.tenantScopes.includes(tenantId)) {
    res.status(403).json({ error: `Tool ${toolId} not available for tenant ${tenantId}` });
    return;
  }

  next();
}
