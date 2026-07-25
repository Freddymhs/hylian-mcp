> Origen: /home/fmarcosdev/Volumes/Extended/github/DEVELOPMENT/concept-hylian-mcp.md (ideación)

# Concept — hylian-mcp

## Propósito

MCP server personal para gestionar tu biblioteca de gaming. Vos escribís reseñas de los juegos que jugás; el sistema deriva tu perfil de gustos y recomienda juegos nuevos para comprar basándose en ese perfil.

**Single-user, local-first, instalado via npm.**

## Qué es

- MCP server escrito en TypeScript puro (sin framework) + stdio transport
- Storage en Supabase (Postgres cloud, free tier)
- Sync periódico con Steam Web API (1 vez al día)
- Tools MCP para reseña, recomendación, búsqueda en tu biblioteca
- Instalable con `claude mcp add` en cualquier cliente MCP-compatible

## Qué NO es

- Multi-user / red social
- Web UI / Next.js / frontend separado
- Servicio cloud deployado (corre local)
- Asistente con LLM propio (usa el LLM del cliente — Claude Code, OpenCode, etc)
- Reemplazo de Steam Curator / IGDB
- Sistema de achievements / market / trading

## Modelo de dominio

### Schema Supabase (normalizado)

```sql
-- Juegos (catálogo unificado, cualquier fuente)
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  steam_appid INTEGER UNIQUE,
  external_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('steam', 'manual')),
  name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tu biblioteca (lo que tenés)
CREATE TABLE user_library (
  user_id UUID NOT NULL,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  playtime_minutes INTEGER DEFAULT 0,
  last_played TIMESTAMPTZ,
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, game_id)
);

-- Tus reseñas (críticas escritas)
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  auto_rank INTEGER CHECK (auto_rank BETWEEN 0 AND 100),
  extracted_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Perfil derivado (computado on-demand, cached opcional)
CREATE TABLE user_profile (
  user_id UUID PRIMARY KEY,
  tag_weights JSONB DEFAULT '{}',
  computed_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Provider pattern (TS puro)

```typescript
interface GameProvider {
  fetch(externalId: string): Promise<Game>;
  search(query: string): Promise<Game[]>;
}

class SteamProvider implements GameProvider { ... }
class ManualProvider implements GameProvider { ... }

class GameProviderService {
  // orquesta múltiples providers
  // upsert en tabla games unificada
}
```

### Auth strategy

- **Single-user hardcoded**: `USER_ID` en `.env`
- **Service role key**: bypassea RLS, vos sos el único user
- **Sin Supabase Auth**: no hay signup/login
- Cambiar de user = editar `.env`

## Stack (con fuente)

| Capa         | Tech                                 | Fuente                                     |
| ------------ | ------------------------------------ | ------------------------------------------ |
| Runtime      | Node.js 22+                          | [feature]                                  |
| Lenguaje     | TypeScript strict                    | [feature] reglas globales                  |
| Framework    | Ninguno (TS puro)                    | [feature] decisión final — NestJS overkill |
| MCP          | `@modelcontextprotocol/sdk` (stdio)  | [feature] standard                         |
| DB           | Supabase (Postgres)                  | [feature] elección del usuario             |
| DB client    | `@supabase/supabase-js`              | [feature]                                  |
| Auth         | service_role key + `USER_ID` env var | [feature] single-user                      |
| Steam sync   | Steam Web API (REST directo)         | [feature]                                  |
| HTTP client  | `undici` (nativo Node 22+)           | [feature] cero deps extra                  |
| Cron         | `node-cron`                          | [feature] sin framework                    |
| Validation   | `zod`                                | [feature] type-safety                      |
| Logging      | `pino`                               | [feature]                                  |
| Testing      | `vitest`                             | [feature]                                  |
| Distribution | `npm publish`                        | [feature] multi-device                     |

**Sin Ollama. Sin LLM propio. Sin cloud deploy.**

## Fases

### F1 — MVP funcional

Entrega: scaffold corriendo, podés sincronizar Steam y escribir reseñas.

1. Scaffold TS puro + tsconfig strict + estructura base (basado en `template-mcp`)
2. Variables de entorno (`.env.example` con `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `USER_ID`, `STEAM_API_KEY`, `STEAM_ID`)
3. Schema Supabase ejecutado (vía migration SQL manual o script de bootstrap)
4. Supabase client + service role auth + single-user setup
5. Steam Web API client (wrapper para `GetOwnedGames`)
6. `sync_library` tool MCP — upsert de juegos Steam a DB
7. Cron diario (24h) con `node-cron` ejecutando `sync_library`
8. `review_game(name, text)` tool MCP — guarda reseña, devuelve texto para que el LLM del cliente lo analice (sin auto_rank automático en MVP, lo agrega el usuario o queda null)
9. `list_my_games(filter)` tool MCP — query a `user_library` con filtros
10. README mínimo con setup

### F2 — Recommend + Edit

Entrega: podés editar reseñas y recibir recomendaciones de compra.

11. Provider pattern (interface + SteamProvider + ManualProvider)
12. `edit_review(game_id, text)` tool MCP
13. `delete_review(id)` tool MCP
14. `delete_game(id)` tool MCP
15. `recommend_purchase(criteria)` tool MCP
16. Lógica de perfil derivado: agregación de `extracted_tags` ponderada por `auto_rank`
17. Scoring: match entre perfil del usuario y juegos candidatos de Steam catálogo
18. Web search (vía `fetch` a Steam Store API) para enriquecer candidatos

### F3 — Polish

Entrega: instalable via npm, buscás juegos en tu DB.

19. `add_manual_game(name, metadata)` tool MCP
20. `search_games(query)` tool MCP — busca en tu DB por nombre/tags
21. `npm publish` setup completo (`bin` field, `files`, package.json metadata)
22. README completo con install + config + troubleshooting
23. Backup automático (export JSON periódico de reseñas vía cron semanal)

## Practice-wishlist

Techs que este concepto practica:

- **MCP protocol** — nuevo standard de Anthropic [feature]
- **Supabase / Postgres** — DB cloud + RLS [feature]
- **Steam Web API** — integración con third-party API [feature]
- **TypeScript puro (sin framework)** — disciplina de dependency management, stdio transport [feature]

Techs del norte no cubiertas (futuras):

- GraphQL / tRPC (no aplica, MCP es JSON-RPC)
- Vector embeddings / pgvector (out of scope v1)
- Microservicios (single-user no los justifica)

## Fuera de alcance v1

- Multi-user / compartir reseñas
- OAuth / Supabase Auth
- Web UI / frontend separado
- IGDB / otras fuentes de metadata
- LLM local (Ollama) o API de Claude
- Cloud deploy (Render, Fly, Railway)
- Stats personales / dashboards
- Import / export JSON (excepto backup en F3)
- Steam market / achievements / trading
- Notificaciones / recordatorios

## Riesgos

### 1. Gold-plating del stack

NestJS es framework enterprise con módulos, decorators, DI, controllers. Para un MCP server con ~5 tools puede ser overkill.

**Decisión final:** TS puro sin framework. MCP SDK maneja stdio transport, no requiere NestJS ni Express. Validado en `template-mcp`.

### 2. API key de Steam expuesta

La API key está en plaintext en `steam-organizacion-pendiente.md` y fue usada en este chat. Comprometida.

**Mitigación obligatoria:** Rotar ANTES de empezar F1.

### 3. Sin LLM propio = `extracted_tags` y `auto_rank` quedan null

El MVP guarda texto crudo. Si el LLM del cliente no analiza, no hay tags ni rank.

**Decisión consciente:** El usuario llena `extracted_tags` y `auto_rank` opcionalmente, o el LLM del cliente lo hace como parte del flujo conversacional. No bloquea F1.

### 4. Sync diario puede no ser suficiente

Si comprás un juego y querés reseñarlo antes de 24h, tenés que forzar sync manual.

**Mitigación:** Tool `sync_library` se puede invocar manualmente desde el cliente MCP. No es problema.

## Próximo paso cuando se construya

1. Scaffold desde template-mcp (ya hecho — `DEVELOPMENT/hylian-mcp/`)
2. Crear proyecto Supabase (gratis)
3. Ejecutar schema SQL
4. Rotar Steam API key
5. Setup `.env` con credenciales
6. Implementar F1 en orden
7. Testear sync con tu SteamID real (`76561198020370213`)
8. Validar reseña end-to-end

---

**Versión:** 1
**Última actualización:** 2026-07-25
**Origen:** Conversación sobre Steam library organization
