export const config = {
  port: parseInt(process.env.PORT || '4000', 10),

  // Postgres — supports DATABASE_URL or individual vars
  db: process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'orka',
        user: process.env.DB_USER || 'orka',
        password: process.env.DB_PASSWORD || 'orka',
      },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // Claude via Vertex AI
  vertex: {
    projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '',
    region: process.env.GOOGLE_CLOUD_LOCATION || process.env.CLOUD_ML_REGION || 'us-east5',
    model: process.env.CLAUDE_MODEL || 'claude-opus-4-6@default',
  },

  // MCP Gateway
  mcpGateway: {
    url: process.env.MCP_GATEWAY_URL || 'http://localhost:4001',
  },

  // Figma MCP Server
  figmaMcp: {
    url: process.env.FIGMA_MCP_URL || 'http://localhost:4003',
  },

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
