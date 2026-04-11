import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { typeDefs } from './schema/typeDefs.js';
import { resolvers } from './schema/resolvers/index.js';
import { config } from './config.js';
import { healthCheck } from './db/pool.js';

async function start() {
  const app = express();
  const httpServer = http.createServer(app);

  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serverCleanup = useServer({ schema }, wsServer as any);

  const server = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await server.start();

  // Health check endpoint
  app.get('/health', async (_req, res) => {
    const dbOk = await healthCheck();
    if (dbOk) {
      res.json({ status: 'ok', db: 'connected' });
    } else {
      res.status(503).json({ status: 'error', db: 'disconnected' });
    }
  });

  app.use(
    '/graphql',
    cors({ origin: config.corsOrigin }),
    express.json(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expressMiddleware(server) as any,
  );

  httpServer.listen(config.port, () => {
    console.info(`Intake API running at http://localhost:${config.port}/graphql`);
    console.info(`Subscriptions at ws://localhost:${config.port}/graphql`);
  });
}

start().catch((err) => {
  console.error('Failed to start Intake API:', err);
  process.exit(1);
});
