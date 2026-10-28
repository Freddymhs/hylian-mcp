# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What this is

`@fmarcosdev/hylian-mcp` — MCP server (single-user, local-first) for managing a personal Steam gaming library. The product spec lives in `docs/_CONCEPTO.md` and defines F1-F3. Cross-check product claims in `README.md` against `_CONCEPTO.md`.

Current code state: F1-F3 are implemented and tested with doubles (Supabase through the real supabase-js client over a fake `fetch`, Steam through undici `MockAgent`). Nothing has run against a real Supabase project or Steam account yet, and nothing is published to npm. Where the code departs from the backlog, `docs/decisions/DECISION_FASE{0,1,2,3}_DESVIOS.md` says why. The placeholders (`greet`, `summarize`, `server-info`) live in `src/examples/` and are registered only when `NODE_ENV !== 'production'`.

## Source of truth hierarchy

1. `docs/_CONCEPTO.md` — product spec, schema, F1-F3 phases, stack decisions.
2. `package.json` engines + deps — runtime requirements.
3. `tsconfig.json` path aliases + strict config.
4. This file.

When a global rule, the concept, and the code disagree: the concept wins. Open a task to reconcile, do not silently edit the spec.

## Commands

```bash
pnpm dev              # tsx watch, loads .env (--env-file-if-exists)
pnpm build            # clean dist/ → tsc -p tsconfig.build.json → tsc-alias → copy SQL into dist/db
pnpm start            # node dist/main.js, loads .env
pnpm type-check       # tsc --noEmit
pnpm lint             # eslint src/
pnpm format           # prettier --write "src/**/*.ts"
pnpm test             # vitest run (all)
pnpm test -- greet    # vitest run filtered (single file or test name)
pnpm test:cov         # vitest run --coverage
```

CI (`.github/workflows/ci.yml`) runs `install --frozen-lockfile` → `lint` → `build` → `test` on push/PR to main/master. Pre-commit (Husky) runs `eslint --fix` + `prettier --write` on staged files only. `npm pack` runs `prepack` (= `pnpm build`); never `npm publish` without the owner.

## Architecture

```
src/
├── main.ts              entrypoint (shebang: it is the npm `bin`): transport selection + startJobs
├── server.ts            createServer(services?) — composes tools + resources + prompts (+ examples outside production)
├── config/              env validation (zod) + constants + barrel
├── common/              logger (pino→stderr), Result<T,E>, lazy(), chunk(), mapInBatches(), tool result helpers
├── db/                  schema.sql (SSOT) + migrations/, supabase client, one *.repository.ts per aggregate
├── providers/           GameProvider port: SteamProvider (Store API), ManualProvider, GameProviderService
├── services/            use cases: library-sync, game-lookup, profile/ (taste profile), recommend/, steam/ (Web + Store clients), container.ts (lazy DI)
├── jobs/                node-cron jobs: daily-sync (04:00), weekly-backup (Sun 03:00)
├── tools/               MCP tools (LLM-callable). One *.tool.ts per tool + index aggregator
├── resources/           MCP resources (read-only data exposed to LLMs)
├── prompts/             MCP prompts (reusable message templates)
└── examples/            non-production placeholders (greet, summarize, server-info)
```

Flow: tool → `Services` (lazy providers returning `Result`) → repository / client. Errors travel as `Result`; only the tool layer turns them into `toolError(...)`. Nothing under `db/`, `services/` or `providers/` throws for expected failures.

**Registration pattern** — product tools receive the lazy `Services` container:

```ts
// src/tools/<name>.tool.ts
export function register<Name>Tool(server: McpServer, services: Services): void {
  server.registerTool('<name>', { /* schema + annotations */ }, async (args) => { ... });
}

// src/tools/index.ts
export function registerTools(server: McpServer, services: Services): void {
  register<Name>Tool(server, services);
}
```

To add a tool: create the file, register it in `src/tools/index.ts`, add a spec in `src/tools/__tests__/`. A dependency a tool needs goes in `Services` (`src/services/container.ts`) — resolved on first use, so the server boots without credentials and a tool fails with a message naming the missing variable.

**Path aliases** (configured in `tsconfig.json` + `vitest.config.ts` + resolved at build by `tsc-alias`):

| Alias          | Resolves to       |
| -------------- | ----------------- |
| `@config/*`    | `src/config/*`    |
| `@common/*`    | `src/common/*`    |
| `@db/*`        | `src/db/*`        |
| `@providers/*` | `src/providers/*` |
| `@services/*`  | `src/services/*`  |
| `@jobs/*`      | `src/jobs/*`      |
| `@tools/*`     | `src/tools/*`     |
| `@resources/*` | `src/resources/*` |
| `@prompts/*`   | `src/prompts/*`   |
| `@examples/*`  | `src/examples/*`  |

Always use an alias to import across alias roots (`@services/*` from `src/tools/`); inside one alias root, relative paths are the convention (`./steam/index.js`, `../errors.js` within `src/services/**`).

## Critical gotchas

**Logger MUST go to stderr in stdio mode.** Stdout is the MCP JSON-RPC channel. `src/common/logger.ts` already pins `pino.destination(2)` in production; never add a logger that writes to stdout (no `console.log`, no `process.stdout.write` from app code). `console.error` is acceptable for startup-fatal pre-logger errors.

**Env validation is zod.** New env vars go in `src/config/constants.ts` (`ENV_KEYS`) + `src/config/env.ts` (schema) — both files, kept in sync. `.env.example` too.

**Schema changes touch four places:** `src/db/schema.sql` (SSOT, for fresh installs), a new `src/db/migrations/000N_*.sql` (for existing databases), `src/db/types.ts` (hand-written `Database` type — rows must be `type` aliases, not interfaces), and the repository. `build` copies the SQL into `dist/db/` so it ships in the npm tarball.

**Cron must not keep the process alive or write to stdout.** In stdio mode the process must exit when the client closes stdin: every `cron.schedule` passes `unref: true`. node-cron's default logger uses `console.info/debug` (stdout) — always pass `logger: cronLogger`.

**HTTP transport has no automated tests.** Unit tests use `InMemoryTransport` from the MCP SDK. The Streamable HTTP path in `main.ts` was verified manually with curl only, and it has no authentication.

**`pnpm-workspace.yaml` is not a monorepo.** It only holds `allowBuilds: esbuild: true` — pnpm 12 reads the build-script allowlist from there; deleting it breaks `pnpm install` (see `docs/decisions/DECISION_FASE0_DESVIOS.md`). Don't add packages to it.

## Test conventions

- Test files: `src/<module>/__tests__/*.spec.ts` (vitest auto-discovers via `src/**/*.spec.ts`).
- Use `InMemoryTransport` from `@modelcontextprotocol/sdk` to exercise tools/resources/prompts without binding ports. Tool specs build a client with `connectToolsClient(services)` from `src/__tests__/support/mcp-client.ts`.
- Two kinds of doubles, on purpose. **Wire level**: repositories run on the real supabase-js client with a fake `fetch` answering in PostgREST shape (`src/db/__tests__/fake-postgrest.ts`); Steam clients run on undici `MockAgent` with bodies as the API documents them. **Port level**: tools, services and jobs use the in-memory repositories and fake Steam/Store clients in `src/__tests__/support/` — those fakes are for our own ports, never evidence of what an external API returns.
- No `let`, not even in specs: build state with a `setup()` function called at the start of each test (`const { client } = await setup()`), and register cleanup with `onTestFinished(...)` inside it instead of `afterEach`.
- A test that has never failed proves nothing: when adding one for a parser or a query, break the code once and watch it go red.
- Env-dependent modules are tested with `vi.stubEnv` + `vi.resetModules()` + dynamic `import()`.
- Coverage excludes `**/*.spec.ts` and `**/__tests__/**`.

## MCP clients (where to register the server)

`README.md` → Instalación has the `claude mcp add` command (with `NODE_ENV=production`, without which examples are exposed and the jobs do not run). The `package.json` `bin` and `main` point to `dist/main.js` — that is the contract.
