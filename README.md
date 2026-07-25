# template-mcp

MCP (Model Context Protocol) server template with TypeScript, Zod validation, and dual transport support (stdio/HTTP). Compatible with any MCP client: Claude Code, Claude Desktop, Cursor, VS Code Copilot, Windsurf, Cline, and more.

## Features

- **Dual transport**: stdio (local) and Streamable HTTP (remote)
- **TypeScript strict** with ESM modules
- **Zod validation** for tool input schemas
- **Joi env validation** (fail-fast on startup)
- **Pino logging** to stderr (stdio-safe)
- **Modular architecture**: tools, resources, and prompts as separate modules
- **Factory pattern**: `createServer()` for testability
- **Full test suite** with MCP SDK in-memory transport
- **Quality tooling**: ESLint + Prettier + Husky + lint-staged
- **Docker ready**: multi-stage build
- **CI/CD**: GitHub Actions pipeline

## Quick Start

```bash
pnpm install
pnpm dev
```

## Scripts

| Script            | Description                          |
| ----------------- | ------------------------------------ |
| `pnpm dev`        | Start with hot reload (tsx watch)    |
| `pnpm build`      | Compile TypeScript + resolve aliases |
| `pnpm start`      | Run compiled server                  |
| `pnpm test`       | Run tests                            |
| `pnpm lint`       | Lint source code                     |
| `pnpm type-check` | Type check without emit              |

## Configuration

Copy `.env.example` to `.env` and adjust:

| Variable        | Default       | Description                           |
| --------------- | ------------- | ------------------------------------- |
| `MCP_TRANSPORT` | `stdio`       | Transport: `stdio` or `http`          |
| `PORT`          | `3000`        | HTTP port (only for `http` transport) |
| `LOG_LEVEL`     | `info`        | Pino log level                        |
| `NODE_ENV`      | `development` | Environment                           |

## Project Structure

```
src/
├── main.ts              # Entrypoint: transport selection
├── server.ts            # createServer() factory
├── config/              # Env validation + constants
├── common/              # Logger, error helpers, types
├── tools/               # MCP tools (callable by LLMs)
├── resources/           # MCP resources (read-only data)
└── prompts/             # MCP prompts (reusable templates)
```

## Adding a New Tool

1. Create `src/tools/my-tool.tool.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerMyTool(server: McpServer): void {
  server.registerTool(
    'my_tool',
    {
      title: 'My Tool',
      description: 'What this tool does',
      inputSchema: {
        param: z.string().describe('Parameter description'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ param }) => ({
      content: [{ type: 'text', text: `Result: ${param}` }],
    }),
  );
}
```

2. Register in `src/tools/index.ts`:

```typescript
import { registerMyTool } from './my-tool.tool.js';

export function registerTools(server: McpServer): void {
  registerGreetTool(server);
  registerMyTool(server); // add here
}
```

3. Add tests in `src/tools/__tests__/my-tool.tool.spec.ts`

## Client Configuration

### Claude Code

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "template-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/template-mcp/dist/main.js"]
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "template-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/template-mcp/dist/main.js"]
    }
  }
}
```

### Cursor

Add to Cursor Settings > MCP Servers:

```json
{
  "mcpServers": {
    "template-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/template-mcp/dist/main.js"]
    }
  }
}
```

### VS Code (Copilot)

Add to `.vscode/settings.json`:

```json
{
  "mcp": {
    "servers": {
      "template-mcp": {
        "command": "node",
        "args": ["/absolute/path/to/template-mcp/dist/main.js"]
      }
    }
  }
}
```

## Docker

```bash
# Build
docker build -t template-mcp .

# Run (HTTP mode, used for remote access)
docker run -p 3000:3000 template-mcp
```

## Tech Stack

- Node.js 22 + TypeScript (strict, ESM)
- MCP SDK v1 (`@modelcontextprotocol/sdk`)
- Zod (tool input validation)
- Joi (env validation)
- Pino (stderr logging)
- Vitest (testing)
- ESLint + Prettier + Husky

---

## Verificación

Todo lo siguiente está comprobado y funcionando al 100%.

### Calidad de código

| Check               | Comando           |
| ------------------- | ----------------- |
| Lint + formato      | `pnpm lint`       |
| Tipado estricto     | `pnpm type-check` |
| Build (tsc + alias) | `pnpm build`      |

### Tests unitarios (11/11)

```bash
pnpm test
```

| Suite                              | Cubre                                                                |
| ---------------------------------- | -------------------------------------------------------------------- |
| `greet.tool.spec.ts` (5)           | Listado, estilos casual/formal/enthusiastic, rechazo de nombre vacío |
| `server-info.resource.spec.ts` (2) | Listado, campos JSON (name, version, uptime, timestamp)              |
| `summarize.prompt.spec.ts` (4)     | Listado, estilos brief/bullet-points, coerción numérica, defaults    |

Sin red ni puertos — usa `InMemoryTransport` del SDK.

### Runtime — transporte stdio (modo por defecto)

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' \
  | MCP_TRANSPORT=stdio node dist/main.js
```

Respuesta JSON-RPC en stdout, logs en stderr.

### Runtime — transporte HTTP

```bash
MCP_TRANSPORT=http PORT=3100 node dist/main.js &
# Initialize → capturar Mcp-Session-Id del header
# tools/list, resources/list, prompts/list, tools/call greet, resources/read info://server
```

| Endpoint verificado                                     | Resultado esperado                                     |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `tools/call greet` `{"name":"Freddy","style":"casual"}` | `"Hey Freddy! How's it going?"`                        |
| `resources/read info://server`                          | JSON con name, version, uptime, nodeVersion, timestamp |

### Docker

```bash
docker build -t template-mcp .  # multi-stage: base → deps → build → production
docker run -p 3000:3000 template-mcp  # arranca en HTTP mode
```

### CI (GitHub Actions)

`pnpm install` → `pnpm lint` → `pnpm build` → `pnpm test`  
Corre en cada push y PR a main/master.

### Pipeline de commits (local)

`git commit` → husky → lint-staged → `eslint --fix` + `prettier --write` (solo archivos staged)

### Gaps conocidos

- **HTTP transport sin tests automáticos** _(medio)_: los unit tests usan `InMemoryTransport`; el transporte HTTP (`StreamableHTTPServerTransport`) solo se verificó manualmente con curl. Para producción remota añadir tests de integración con sesión real
- **Integración con cliente MCP** _(medio)_: verificar manualmente agregando a `.claude/settings.json` o Cursor y confirmando que tools/resources/prompts aparecen en el cliente
- **Tool inputs extremos** _(bajo)_: strings muy largos, unicode malformado — Zod los rechaza pero el error response no está testeado vía HTTP
- **Sesiones concurrentes** _(bajo)_: fuera del scope de un template
