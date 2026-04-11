import type { ToolHandler } from '../registry/types.js';

export const templateDiscoveryTool: ToolHandler = {
  tool: {
    id: 'template-discovery',
    name: 'Template Discovery',
    description: 'Search available templates and patterns relevant to the application idea',
    category: 'CONTEXT',
    allowedStages: ['ACTIVE'],
    timeoutMs: 5000,
    requiresConfirmation: false,
    tenantScopes: ['*'],
  },
  execute: async (input) => {
    // TODO: Implement actual template search
    const query = (input.query as string) || '';
    return {
      templates: [
        {
          id: 'placeholder',
          name: 'Placeholder template',
          description: `No templates found for: ${query}`,
          tags: [],
        },
      ],
      message: 'Template discovery is not yet configured. Connect to your template registry.',
    };
  },
};
