# hylian-mcp

MCP server personal (single-user, local-first) para gestionar tu biblioteca de gaming.
Escribís reseñas de los juegos que jugás; el sistema deriva tu perfil de gustos y recomienda qué comprar.
Sincroniza con la Steam Web API, guarda en Supabase y usa el LLM de tu cliente MCP (Claude Code,
OpenCode, Cursor…) — no trae LLM propio.

## Instalación

Requiere Node.js 22.19+ y un proyecto de [Supabase](https://supabase.com) (free tier alcanza).

1. **Schema**: en Supabase, _SQL Editor_ → pegá y ejecutá [`src/db/schema.sql`](src/db/schema.sql)
   (dentro del paquete npm: `dist/db/schema.sql`). Si tu base viene de la versión anterior a las reseñas
   borrables, aplicá además `src/db/migrations/0002_reviews_soft_delete.sql`.
2. **Claves**: Supabase _Project Settings → API_ (URL y `service_role` / `sb_secret_…`), Steam
   [Web API key](https://steamcommunity.com/dev/apikey) y tu [SteamID64](https://steamid.io). En Steam, el perfil
   debe tener los _game details_ públicos.
3. **`USER_ID`**: un UUID cualquiera que elegís una vez y conservás
   (`node -e "console.log(crypto.randomUUID())"`).
4. **Registrar el server** en tu cliente MCP:

```bash
claude mcp add --scope user hylian-mcp \
  --env NODE_ENV=production \
  --env SUPABASE_URL=https://xxxx.supabase.co \
  --env SUPABASE_SERVICE_KEY=... \
  --env USER_ID=... \
  --env STEAM_API_KEY=... \
  --env STEAM_ID=... \
  -- npx -y @fmarcosdev/hylian-mcp
```

`NODE_ENV=production` importa: oculta las tools de ejemplo (`greet`, `summarize`, `server-info`) y monta los
jobs diarios/semanales. Sin él, el sync y el backup no corren solos.

> El paquete todavía no está publicado en npm. Mientras tanto: clonar, `pnpm install`, `pnpm build` y usar
> `node /ruta/absoluta/dist/main.js` como comando.

## Configuración

| Variable               | Obligatoria | Descripción                                                        |
| ---------------------- | ----------- | ------------------------------------------------------------------ |
| `SUPABASE_URL`         | sí          | URL del proyecto, `https://<ref>.supabase.co`                      |
| `SUPABASE_SERVICE_KEY` | sí          | `service_role` (JWT) o `sb_secret_…`. Bypasea RLS: no la compartas |
| `USER_ID`              | sí          | UUID que scopea tu biblioteca, reseñas y perfil                    |
| `STEAM_API_KEY`        | sync        | 32 caracteres hex                                                  |
| `STEAM_ID`             | sync        | SteamID64, 17 dígitos                                              |
| `NODE_ENV`             | no          | `production` para uso normal (default `development`)               |
| `MCP_CRON_ENABLED`     | no          | `true` monta los jobs también en desarrollo                        |
| `MCP_TRANSPORT`        | no          | `stdio` (default) o `http`                                         |
| `PORT`                 | no          | Puerto del transporte `http` (default 3000)                        |
| `LOG_LEVEL`            | no          | `trace`…`fatal`, `silent` (default `info`; logs a stderr)          |
| `XDG_DATA_HOME`        | no          | Cambia dónde van los backups (ver abajo)                           |

Ejemplo de `.env` para desarrollo (`pnpm dev` lo carga solo; ver [`.env.example`](.env.example)):

```bash
NODE_ENV=development
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_xxxxxxxxxxxxxxxxxxxxxxxx
USER_ID=3f0c2a94-6a43-4a43-9c6e-0c6f3b9a7d11
STEAM_API_KEY=0123456789abcdef0123456789abcdef
STEAM_ID=76561198000000000
```

## Tools

| Tool                 | Qué hace                                                                      |
| -------------------- | ----------------------------------------------------------------------------- |
| `sync_library`       | Trae tus juegos de Steam (upsert; seguro de re-ejecutar)                      |
| `review_game`        | Guarda una reseña (rank 0-100 y tags opcionales)                              |
| `edit_review`        | Cambia texto, rank o tags de una reseña                                       |
| `delete_review`      | Borra una reseña (soft delete)                                                |
| `list_my_games`      | Lista tu biblioteca; filtra jugados/no jugados, ordena por nombre/horas/fecha |
| `search_games`       | Busca en el catálogo por nombre, tag o género                                 |
| `add_manual_game`    | Agrega un juego no-Steam al catálogo                                          |
| `delete_game`        | Borra un juego con su biblioteca y reseñas (pide confirmación)                |
| `recommend_purchase` | Recomienda compras según tu perfil; consulta la Steam Store                   |
| `rank_games`         | Ordena una lista que traés (ports VR, emuladores…) según tu perfil            |

Jobs (solo con `NODE_ENV=production` o `MCP_CRON_ENABLED=true`, y mientras el cliente MCP tenga el server abierto):
sync diario a las 04:00 y backup de reseñas los domingos a las 03:00 en
`~/.hylian-mcp/backups/reviews-AAAA-MM-DD.json` (o `$XDG_DATA_HOME/hylian-mcp/backups/`), últimos 12.

## Troubleshooting

| Síntoma                                                                                       | Causa y arreglo                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Config validation error: SUPABASE_URL: Invalid url` y el server no arranca                   | La URL debe ser la del proyecto (`https://<ref>.supabase.co`), con protocolo y sin `/rest/v1`. Copiala de _Project Settings → API_.                                                                  |
| `Steam error: Steam rejected the request (HTTP 403): check STEAM_API_KEY`                     | Key inválida, revocada o rotada. Generá otra en steamcommunity.com/dev/apikey y actualizá `STEAM_API_KEY`. Si es de formato (`must be 32 hex characters`), revisá que no tenga espacios ni comillas. |
| `Steam returned no library data: the profile game details are private…`                       | Steam → Perfil → _Edit Profile_ → _Privacy Settings_ → _Game details_: **Public**. O `STEAM_ID` pertenece a otra cuenta.                                                                             |
| `Database error (…): Could not find the table 'public.games' in the schema cache`             | `schema.sql` no se ejecutó en ese proyecto. Corrélo en el SQL Editor. Si dice `column reviews.deleted_at does not exist`, aplicá `migrations/0002_reviews_soft_delete.sql`.                          |
| `Config validation error: USER_ID: Invalid uuid` o `Missing environment variable(s): USER_ID` | `USER_ID` debe ser un UUID. Generá uno y **no lo cambies**: cambiarlo deja tu biblioteca y reseñas viejas bajo el id anterior.                                                                       |
| `MCP_TRANSPORT: Invalid enum value. Expected 'stdio' \| 'http'`, o el cliente no conecta      | Valores válidos: `stdio` / `http`. Los clientes locales (Claude Code, Cursor) usan `stdio`: no definas `MCP_TRANSPORT=http` salvo que el cliente apunte a `http://localhost:<PORT>/mcp`.             |
| Aparecen `greet`, `summarize` o `server-info`                                                 | Falta `NODE_ENV=production` en la config del cliente.                                                                                                                                                |
| `recommend_purchase` devuelve pocos resultados o `HTTP 429`                                   | La Steam Store no es una API oficial y limita el ritmo: reintentá en unos minutos. Los tags de tus reseñas rinden más si se parecen a los géneros de Steam (`rpg`, `platformer`, `souls-like`).      |

Los logs van a stderr (stdout es el canal MCP); `LOG_LEVEL` ajusta el detalle.

## Desarrollo

```bash
pnpm install
cp .env.example .env
pnpm dev          # tsx watch, carga .env
pnpm test         # vitest, sin red ni credenciales
pnpm lint && pnpm type-check
pnpm build        # limpia dist/, compila y copia el SQL
```

**Supabase local** (Docker + [Supabase CLI](https://supabase.com/docs/guides/local-development)): el mismo código,
sin proyecto en la nube. `supabase/config.toml` carga `src/db/schema.sql` en la base nueva y apaga realtime,
storage, edge functions, analytics y el SMTP de prueba. Auth queda prendido porque sin él el CLI no entrega las
claves, y Studio (`http://127.0.0.1:54323`) es el panel para ver las tablas.

```bash
supabase start                 # API en http://127.0.0.1:54321
supabase status -o env         # SECRET_KEY → SUPABASE_SERVICE_KEY en .env
supabase db reset              # base limpia, vuelve a cargar schema.sql
```

Pasar a la nube es cambiar `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` en `.env` y correr el schema allá (Instalación,
paso 1).

**Deploy en el Mac Mini** (`.github/workflows/deploy.yml`, runner self-hosted de `fmarcos-labs`): cuando CI pasa en
un push a `master`, el runner actualiza el clon `~/apps/hylian-mcp`, levanta Supabase, aplica las migraciones y
construye `hylian-mcp:local`. El `.env` de ese clon lo crea uno a mano (no está en el repo) y difiere del de
desarrollo en dos líneas: dentro de Docker `127.0.0.1` es el propio contenedor, así que la base se alcanza por el
host, y la imagen trae `http` por defecto.

```bash
SUPABASE_URL=http://host.docker.internal:54321
MCP_TRANSPORT=stdio
```

Claude Code del Mac lanza la imagen (registro único; Docker con ruta absoluta porque el PATH de Claude Code puede
no incluirlo, y `TZ` para que el backup y el cron usen la hora local):

```bash
claude mcp add --scope user hylian-mcp -- "$(command -v docker)" run -i --rm \
  --env-file ~/apps/hylian-mcp/.env -e TZ=America/Santiago \
  -v ~/.hylian-mcp:/home/appuser/.hylian-mcp hylian-mcp:local
```

- [`docs/_CONCEPTO.md`](docs/_CONCEPTO.md) — especificación: dominio, schema, stack.
- [`docs/backlog/`](docs/backlog/) — fases y estado de implementación.
- [`docs/decisions/`](docs/decisions/) — por qué el código se aparta del backlog donde lo hace.
- [`docs/flows.md`](docs/flows.md) — flujos de usuario paso a paso.
- [`CLAUDE.md`](CLAUDE.md) — arquitectura y convenciones para quien contribuya.

## Licencia

[MIT](LICENSE)
