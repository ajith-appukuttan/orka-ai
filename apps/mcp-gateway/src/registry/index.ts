import type { RegisteredTool, ToolHandler } from './types.js';

class ToolRegistry {
  private tools = new Map<string, ToolHandler>();

  register(handler: ToolHandler): void {
    if (this.tools.has(handler.tool.id)) {
      throw new Error(`Tool ${handler.tool.id} is already registered`);
    }
    this.tools.set(handler.tool.id, handler);
    console.info(`Registered tool: ${handler.tool.name} (${handler.tool.id})`);
  }

  get(toolId: string): ToolHandler | undefined {
    return this.tools.get(toolId);
  }

  list(): RegisteredTool[] {
    return Array.from(this.tools.values()).map((h) => h.tool);
  }

  listByCategory(category: string): RegisteredTool[] {
    return this.list().filter((t) => t.category === category);
  }

  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }
}

export const registry = new ToolRegistry();
