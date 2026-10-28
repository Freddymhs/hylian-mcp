# DECISION: desvíos de FASE_1 respecto al backlog

Fecha: 2026-10-24

## T1 — variables de Supabase/Steam son opcionales en el schema

El backlog las lista en el schema zod con formato (URL, UUID, 32 hex, 17 dígitos). Se validan con ese
formato **cuando están presentes**, pero no son obligatorias al arrancar. Razón: el server debe arrancar
(`pnpm dev`, tests, tools de ejemplo) sin credenciales; cada tool falla en su primer uso con un mensaje que
nombra la variable que falta (`Missing environment variable(s): STEAM_API_KEY, STEAM_ID`). Un valor vacío
(`KEY=` del `.env`) cuenta como no definido.

`SUPABASE_SERVICE_KEY`: el backlog pedía "string min 100". Eso rechaza las claves nuevas `sb_secret_...`
(más cortas). Se acepta un JWT legacy de 100+ caracteres **o** el prefijo `sb_secret_`.

`.env` no lo cargaba nada (ni dotenv ni flag). `pnpm dev` y `pnpm start` usan ahora
`--env-file-if-exists=.env` (nativo de Node 22.9+).

## T2 — schema.sql

- El backlog decía `psql $SUPABASE_URL -f schema.sql`. `SUPABASE_URL` es el endpoint HTTPS de la API, no una
  conexión Postgres: se documenta usar el SQL Editor o la _connection string_ de Database settings.
- No se crean índices sobre `games(steam_appid)` ni `user_library(user_id)`: el `UNIQUE` y el prefijo del
  `PRIMARY KEY (user_id, game_id)` ya los proveen. Solo se agrega `reviews(user_id)`.
- Se activa RLS (sin policies) en las 4 tablas: la anon key pública no puede leer ni escribir; `service_role`
  la bypasea. No estaba en el concepto; sin esto las tablas de `public` quedan expuestas vía PostgREST.
- Verificado contra Postgres 17 local (contenedor descartable): aplica sin errores, `ON CONFLICT` conserva
  `metadata` y `acquired_at`, el CHECK de `auto_rank` rechaza 101 y el cascade borra reseñas y biblioteca.
  **No** se corrió en un proyecto Supabase real.

## T3 — arquitectura de acceso a datos

`Result<T, DbError>` + repositorios por puerto (`GameRepository`, `LibraryRepository`, `ReviewRepository`).
Los tools reciben un `Services` con dependencias lazy (`registerTools(server, services)`), no el
`register<Name>Tool(server)` del scaffold. Los tests de repositorio usan el cliente real de supabase-js con
un `fetch` falso que responde con la forma de PostgREST; los tests de tools usan fakes in-memory de los puertos.

## T5/T6 — el cron no llama a `registerSyncLibraryTool`

Esa función solo registra el tool; no sincroniza. La lógica vive en `syncLibrary()` (`src/services/library-sync.ts`)
y la usan el tool y el job. El logger por defecto de node-cron escribe con `console.info/debug` (stdout), que
corrompería el canal JSON-RPC en modo stdio: el job usa un logger que va a pino/stderr.

Limitación conocida: en stdio, el cliente MCP lanza el proceso por sesión, así que el cron solo corre mientras
el cliente lo tiene abierto.

## T7 — `review_game` no adivina

Match exacto (case-insensitive) gana; si no hay exacto, el parcial debe ser único. Si hay varios, error con la
lista de candidatos en lugar de reseñar el juego equivocado. Los `%`/`_`/`\` del nombre se escapan en el `ilike`.

## T8 — `list_my_games` agrega `limit`

Input extra `limit` (default 100, máx 500) y respuesta `{ total, returned, games }`: una biblioteca de miles de
juegos desbordaría el contexto del cliente. `total` permite saber si hubo truncado.

## Unidades

`totalPlaytime` (sync_library) y `playtimeHours` (list_my_games) están en horas con un decimal.

## Criterios que requieren credenciales reales (pendientes)

- Schema ejecutado en un proyecto Supabase real.
- `sync_library` contra la cuenta Steam real (`76561198020370213`, perfil con detalles de juegos públicos).
- `review_game` / `list_my_games` contra Supabase real.
