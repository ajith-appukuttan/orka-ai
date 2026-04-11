import type { ToolHandler } from '../registry/types.js';

export const standardsLookupTool: ToolHandler = {
  tool: {
    id: 'standards-lookup',
    name: 'Standards Lookup',
    description: 'Check organizational standards and guidelines applicable to the project',
    category: 'CONTEXT',
    allowedStages: ['ACTIVE'],
    timeoutMs: 5000,
    requiresConfirmation: false,
    tenantScopes: ['*'],
  },
  execute: async (input) => {
    // TODO: Implement actual standards lookup
    const domain = (input.domain as string) || '';
    return {
      standards: [],
      message: `Standards lookup is not yet configured for domain: ${domain}. Connect to your standards registry.`,
    };
  },
};
