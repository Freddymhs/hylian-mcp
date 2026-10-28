#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { env, TRANSPORT_HTTP } from '@config/index.js';
import { logger } from '@common/logger.js';
import { tryParseJson } from '@common/json.js';
import { createServices } from '@services/index.js';
import { startJobs } from '@jobs/index.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const services = createServices();
  const server = createServer(services);

  if (env.transport === TRANSPORT_HTTP) {
    const { StreamableHTTPServerTransport } =
      await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const { createServer: createHttpServer } = await import('node:http');

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    await server.connect(transport);

    const httpServer = createHttpServer(async (req, res) => {
      if (req.method === 'POST' && req.url === '/mcp') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const body = tryParseJson(Buffer.concat(chunks).toString());
        if (!body.ok) {
          res.writeHead(400).end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }
        await transport.handleRequest(req, res, body.value);
      } else {
        res.writeHead(404).end();
      }
    });

    httpServer.listen(env.port, () => {
      logger.info(
        `MCP server (HTTP) listening on http://localhost:${env.port}/mcp`,
      );
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('MCP server running via stdio');
  }

  startJobs({ services });
}

main().catch((error: unknown) => {
  logger.fatal(error, 'Failed to start MCP server');
  process.exit(1);
});
