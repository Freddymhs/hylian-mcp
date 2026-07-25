# FASE 1: MVP funcional

**Status**: ⏸️ PENDIENTE
**Prioridad**: Alta
**Dependencias**: FASE_0
**Fuente**: `../_CONCEPTO.md` F1 (10 pasos), consolidados en 8 tareas

## Objetivo

Scaffold corriendo: podés sincronizar tu Steam y escribir reseñas. Single-user, local, sin frontend.

## Orden de ejecución

> Dependencias duras: schema (T2) y env (T1) bloquean client (T3). Steam client (T4) y supabase client (T3) bloquean sync_library (T5). sync_library (T5) bloquea cron (T6) y tools de lectura (T8). Tools de escritura (T7) requieren supabase client (T3).

1. Tarea 1 — env vars
2. Tarea 2 — schema SQL
3. Tarea 3 — supabase client (depende de T1 + T2)
4. Tarea 4 — steam client (independiente de T1-T3)
5. Tarea 5 — sync_library tool (depende de T3 + T4)
6. Tarea 6 — cron 24h (depende de T5)
7. Tarea 7 — review_game tool (depende de T3)
8. Tarea 8 — list_my_games tool (depende de T3) + e2e test

## Tareas

### Tarea 1: Configurar env vars de runtime

- Archivos: `src/config/env.ts` (extender schema zod), `.env.example` (ya tiene placeholders, agregar docs)
- Qué hacer:
  1. Agregar 5 env keys al schema zod: `SUPABASE_URL` (URL), `SUPABASE_SERVICE_KEY` (string min 100), `USER_ID` (UUID), `STEAM_API_KEY` (string 32 hex), `STEAM_ID` (string numérico 17 dígitos).
  2. Exportar `env.supabaseUrl`, `env.supabaseServiceKey`, etc.
  3. `.env.example` documenta cada var con link a dónde conseguirla (Supabase dashboard, Steam API key page).
- Referencia: el schema SQL de Tarea 2.

### Tarea 2: Schema Supabase

- Archivo: `src/db/schema.sql` (nuevo)
- Qué hacer:
  1. Copiar verbatim las 4 tablas de `../_CONCEPTO.md` sección "Schema Supabase (normalizado)".
  2. Agregar índices: `games(steam_appid)`, `reviews(user_id)`, `user_library(user_id)`.
  3. Documentar ejecución manual (`psql $SUPABASE_URL -f schema.sql` o Supabase SQL editor).
- Referencia: `_CONCEPTO.md` líneas 32-72.

### Tarea 3: Cliente Supabase con service role

- Archivos: `src/db/supabase.ts` (nuevo), `src/db/index.ts` (nuevo)
- Qué hacer:
  1. Crear `createSupabaseClient()` factory que retorna `SupabaseClient` con service_role key.
  2. Singleton lazy (no crear hasta primer uso).
  3. Wrapper de errores que loguea con `logger.error` y devuelve `Result<T, DbError>` (no throw).
  4. Tipos: derivar `Database` types de `schema.sql` (manual o `supabase gen types typescript`).
- Referencia: `@supabase/supabase-js` docs.

### Tarea 4: Cliente Steam Web API

- Archivos: `src/services/steam/client.ts` (nuevo), `src/services/steam/types.ts` (nuevo), `src/services/steam/index.ts` (nuevo)
- Qué hacer:
  1. Usar `undici` (nativo, cero deps). NO `node-fetch`.
  2. Wrapper de `GetOwnedGames` (`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=...&steamid=...&include_appinfo=1&include_played_free_games=1`).
  3. Tipos explícitos para `SteamGame`, `SteamOwnedGamesResponse`.
  4. Retry con backoff exponencial para 5xx (3 reintentos, 200ms/500ms/1500ms).
  5. Timeout 10s por request.
- Referencia: `https://developer.valvesoftware.com/wiki/Steam_Web_API`.

### Tarea 5: Tool `sync_library`

- Archivos: `src/tools/sync-library.tool.ts` (nuevo), `src/tools/index.ts` (registrar)
- Qué hacer:
  1. Zod input: sin args (usa `env.steamId` y `env.userId`).
  2. Llama `SteamClient.getOwnedGames()` → upsert en `games` (por `steam_appid`) + `user_library` (por `user_id + game_id`).
  3. Devuelve resumen: `{ synced: N, newGames: M, totalPlaytime: H }`.
  4. Annotations: `destructiveHint: false` (upsert, no destructivo), `idempotentHint: true` (re-correr es seguro), `openWorldHint: true` (llama red).
  5. Test con `InMemoryTransport` mockeando Steam client + Supabase client.
- Referencia: `src/tools/greet.tool.ts` (patrón de tool).

### Tarea 6: Cron diario

- Archivos: `src/jobs/daily-sync.ts` (nuevo), `src/main.ts` (extender con bootstrap)
- Qué hacer:
  1. `node-cron` schedule `'0 4 * * *'` (4 AM local).
  2. Al ejecutar: loguea start, llama `registerSyncLibraryTool` directamente (no vía MCP), loguea resultado.
  3. Solo se monta si `env.nodeEnv === 'production'` o `MCP_CRON_ENABLED=true` (env opt-in para dev).
  4. Manejo de errores: log fatal pero NO mata el proceso.
- Referencia: `node-cron` docs.

### Tarea 7: Tool `review_game`

- Archivos: `src/tools/review-game.tool.ts` (nuevo), `src/tools/index.ts` (registrar)
- Qué hacer:
  1. Zod input: `{ gameName: string, text: string, autoRank?: number (0-100), extractedTags?: string[] }`.
  2. Busca game por nombre en `games` (case-insensitive, partial match).
  3. Si no existe, devuelve error claro: "Game not found. Run sync_library first or use add_manual_game".
  4. Inserta en `reviews` con `user_id` de env.
  5. Devuelve `{ reviewId, gameName, textLength, autoRank }`.
  6. Annotations: `destructiveHint: false`, `idempotentHint: false` (cada call crea una reseña).
- Referencia: `src/tools/sync-library.tool.ts` (patrón de DB).

### Tarea 8: Tool `list_my_games` + test E2E

- Archivos: `src/tools/list-my-games.tool.ts` (nuevo), `src/tools/index.ts` (registrar), `src/__tests__/e2e-fase1.spec.ts` (nuevo)
- Qué hacer:
  1. Tool: Zod input `{ filter?: 'all' | 'played' | 'unplayed', sortBy?: 'name' | 'playtime' | 'lastPlayed' }`. Query a `user_library` join `games`.
  2. Test E2E: `InMemoryTransport` con mocks de SteamClient (devuelve 5 juegos fake) + SupabaseClient (in-memory store). Flujo: initialize → sync_library → review_game → list_my_games. Verificar contenido de cada response.
- Referencia: spec actual `src/tools/__tests__/greet.tool.spec.ts` (patrón vitest).

## Criterios de Aceptación

- [ ] Schema SQL ejecutable en Supabase sin errores
- [ ] `pnpm dev` arranca el server sin crash
- [ ] `sync_library` invocado manualmente trae 1+ juegos de la cuenta Steam real (developer account `76561198020370213` del concepto)
- [ ] `review_game` guarda reseña y devuelve ID
- [ ] `list_my_games` devuelve lista filtrable
- [ ] Cron se monta en producción pero NO en dev (sin `MCP_CRON_ENABLED`)
- [ ] Test E2E pasa: sync → review → list con datos mockeados
- [ ] `pnpm test` 100% verde
- [ ] `pnpm lint` limpio
