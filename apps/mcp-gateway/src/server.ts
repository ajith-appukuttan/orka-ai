import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { registry } from './registry/index.js';
import { invokeTool } from './services/invoker.js';
import { normalizeResponse } from './services/normalizer.js';
import { checkToolPermissions } from './middleware/permissions.js';
import { auditToolCall } from './middleware/audit.js';

// Register MVP tools
import { templateDiscoveryTool } from './tools/templateDiscovery.js';
import { standardsLookupTool } from './tools/standardsLookup.js';
import { integrationDiscoveryTool } from './tools/integrationDiscovery.js';
import { repoDiscoveryTool } from './tools/repoDiscovery.js';
import { codeSearchTool } from './tools/codeSearch.js';
import { fileReaderTool } from './tools/fileReader.js';
import { githubSearchTool } from './tools/githubSearch.js';
import { figmaDesignTool } from './tools/figmaDesign.js';

registry.register(templateDiscoveryTool);
registry.register(standardsLookupTool);
registry.register(integrationDiscoveryTool);
registry.register(repoDiscoveryTool);
registry.register(codeSearchTool);
registry.register(fileReaderTool);
registry.register(githubSearchTool);
registry.register(figmaDesignTool);

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    tools: registry.list().map((t) => ({ id: t.id, name: t.name })),
  });
});

// List available tools
app.get('/tools', (_req, res) => {
  res.json({ tools: registry.list() });
});

// Get tool details
app.get('/tools/:toolId', (req, res) => {
  const handler = registry.get(req.params.toolId);
  if (!handler) {
    res.status(404).json({ error: 'Tool not found' });
    return;
  }
  res.json({ tool: handler.tool });
});

// Invoke a tool
app.post('/tools/:toolId/invoke', checkToolPermissions, auditToolCall, async (req, res) => {
  const toolId = String(req.params.toolId);
  const { input = {}, sessionId } = req.body;
  const tenantIdRaw = req.headers['x-tenant-id'];
  const tenantId: string = Array.isArray(tenantIdRaw)
    ? (tenantIdRaw[0] ?? 'default')
    : (tenantIdRaw ?? 'default');

  const result = await invokeTool({
    toolId,
    input,
    sessionId,
    tenantId,
  });

  const normalized = normalizeResponse(result);
  res.json(normalized);
});

app.listen(config.port, () => {
  console.info(`MCP Gateway running at http://localhost:${config.port}`);
  console.info(
    `Registered tools: ${registry
      .list()
      .map((t) => t.name)
      .join(', ')}`,
  );
});
