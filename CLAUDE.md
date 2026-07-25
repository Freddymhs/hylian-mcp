# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What this is

`@fmarcosdev/hylian-mcp` — MCP server (single-user, local-first) for managing a personal Steam gaming library. The product spec lives in `docs/_CONCEPTO.md` and defines F1-F3. **Do not treat the top-level `README.md` as authoritative** — it is template residue and still describes the project as `template-mcp`; cross-check product claims against `_CONCEPTO.md`.

Current code state: scaffold from `template-mcp` with one placeholder tool (`greet`), one prompt (`summarize`), one resource (`server-info`). F1 (Supabase + Steam sync + review tools) has not started. The placeholders exist to validate the MCP plumbing — they are NOT the product.

## Source of truth hierarchy

1. `docs/_CONCEPTO.md` — product spec, schema, F1-F3 phases, stack decisions.
2. `package.json` engines + deps — runtime requirements.
3. `tsconfig.json` path aliases + strict config.
4. This file.

When a global rule, the concept, and the code disagree: the concept wins. Open a task to reconcile, do not silently edit the spec.

## Commands

```bash
pnpm dev              # tsx watch src/main.ts (hot reload)
pnpm build            # tsc -p tsconfig.build.json + tsc-alias (path resolution)
pnpm start            # node dist/main.js
pnpm type-check       # tsc --noEmit
pnpm lint             # eslint src/
pnpm format           # prettier --write "src/**/*.ts"
pnpm test             # vitest run (all)
pnpm test -- greet    # vitest run filtered (single file or test name)
pnpm test:cov         # vitest run --coverage
```

CI (`.github/workflows/ci.yml`) runs `install --frozen-lockfile` → `lint` → `build` → `test` on push/PR to main/master. Pre-commit (Husky) runs `eslint --fix` + `prettier --write` on staged files only.

## Architecture

```
src/
├── main.ts              transport selection (stdio | http), entrypoint
├── server.ts            createServer() factory — composes tools + resources + prompts
├── config/              env validation (joi) + constants + barrel
├── common/              logger (pino→stderr), error helpers, shared types
├── tools/               MCP tools (LLM-callable). One *.tool.ts per tool + index aggregator
├── resources/           MCP resources (read-only data exposed to LLMs)
└── prompts/             MCP prompts (reusable message templates)
```

**Registration pattern** — every module follows the same shape:

```ts
// src/tools/<name>.tool.ts
export function register<Name>Tool(server: McpServer): void {
  server.registerTool('<name>', { /* schema + annotations */ }, async (args) => { ... });
}

// src/tools/index.ts
export function registerTools(server: McpServer): void {
  register<Name>Tool(server);
}
```

`server.ts` calls the three aggregators (`registerTools` / `registerResources` / `registerPrompts`). To add a new tool: create the file, add the registration to the matching `index.ts`, add a spec in `__tests__/`. No other wiring needed.

**Path aliases** (configured in `tsconfig.json` + `vitest.config.ts` + resolved at build by `tsc-alias`):

| Alias          | Resolves to       |
| -------------- | ----------------- |
| `@config/*`    | `src/config/*`    |
| `@common/*`    | `src/common/*`    |
| `@tools/*`     | `src/tools/*`     |
| `@resources/*` | `src/resources/*` |
| `@prompts/*`   | `src/prompts/*`   |

Always use aliases for cross-directory imports; use relative `./` only within the same folder.

## Critical gotchas

**Logger MUST go to stderr in stdio mode.** Stdout is the MCP JSON-RPC channel. `src/common/logger.ts` already pins `pino.destination(2)` in production; never add a logger that writes to stdout (no `console.log`, no `process.stdout.write` from app code). `console.error` is acceptable for startup-fatal pre-logger errors.

**Env validation: joi is residue.** `_CONCEPTO.md` line 112 declares `Validation | zod` for the product. Joi in `src/config/env.ts` is template inheritance; the F1 env layer will be zod-backed. New env vars go in `src/config/constants.ts` (`ENV_KEYS`) + `env.ts` (schema) — both files, kept in sync.

**HTTP transport has no automated tests.** Unit tests use `InMemoryTransport` from the MCP SDK. The Streamable HTTP path in `main.ts` was verified manually with curl only (per README gaps section). F1 will add integration coverage for the HTTP path.

**`dist/` should not be in git.** It currently is (committed on `master`). `.gitignore` lists it; the commit is an oversight. New builds go to gitignore.

**`pnpm-workspace.yaml` is essentially empty** (only `allowBuilds: esbuild: true`). There is no monorepo. Don't add packages to it without intent — if you do, the install behavior changes.

## Test conventions

- Test files: `src/<module>/__tests__/*.spec.ts` (vitest auto-discovers via `src/**/*.spec.ts`).
- Use `InMemoryTransport` from `@modelcontextprotocol/sdk` to exercise tools/resources/prompts without binding ports.
- Test inputs are Zod schemas already declared on the tool — reuse them in test fixtures, don't redefine.
- Coverage excludes `**/*.spec.ts` and `**/__tests__/**`.

## MCP clients (where to register the server)

The `README.md` "Client Configuration" section lists the JSON snippet for Claude Code, Claude Desktop, Cursor, and VS Code Copilot. Each expects `node /absolute/path/to/dist/main.js` as the command. The `package.json` `main` is `dist/main.js` — that is the contract.
