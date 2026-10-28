# DECISION: desvíos de FASE_3 respecto al backlog

Fecha: 2026-10-24

## T1 — `add_manual_game`

- El input no lleva `source: 'manual'`: sería un parámetro con un único valor posible.
- `metadata` unifica lo que pedía el backlog (`genres`, `releaseYear`, `developer`) con lo que ya lee el
  `ManualProvider` (`tags`, `priceUSD`, `description`, `storeUrl`). Los `genres` cuentan como tags para el match del
  perfil y para `search_games`. Contrato: `manualMetadataSchema` (`src/providers/manual-metadata.ts`).
- Rechaza un nombre que ya existe (manual o Steam, comparando normalizado). El backlog solo dice "cada call crea una
  fila" (`idempotentHint: false`); dos filas con el mismo nombre harían ambiguo a `review_game`. Los exactos distintos
  pasan (`Portal 2 (Xbox 360)`).
- `external_id` es un UUID generado: `ManualProvider.fetch(externalId)` lo usa y `games.external_id` no es UNIQUE.
- Sigue el diseño pedido: no entra en `user_library` (no sale en `list_my_games`). Como consecuencia, los juegos manuales
  se excluyen de `recommend_purchase` (ver `DECISION_FASE2_DESVIOS.md`).

## T2 — `search_games`

- Busca en `name`, `metadata->>tags` y `metadata->>genres` con `ilike` (no `to_tsvector`: para nombres cortos y tags
  sueltos el match parcial es lo que se espera).
- Devuelve también `gameId`: sin él `delete_game` (que pide el UUID) no tiene de dónde sacarlo. `list_my_games`
  también devuelve `gameId` por la misma razón.
- **No verificado contra un PostgREST real**: el filtro `or=(name.ilike."…",metadata->>tags.ilike."…")` con valores
  entrecomillados sigue la sintaxis documentada de PostgREST, pero los tests solo comprueban el string generado.

## T3 — publicación npm (preparada, no publicada)

- Se quita `"private": true` y se agrega `publishConfig.access = public` (paquete con scope). **`npm publish` no se
  ejecutó.** `prepack` corre `pnpm build`.
- `files` es la lista blanca (`dist`, `README.md`, `LICENSE`); `.npmignore` es una segunda red (el de la raíz no filtra
  dentro de `files`). `repository`/`bugs`/`homepage` salen del remoto `origin`. `author` es `fmarcosdev` (nombre completo
  no disponible): revisarlo antes de publicar.
- El schema tiene que viajar con el paquete aunque `src/` no: `build` copia `schema.sql` y `migrations/` a `dist/db/`.
- `build` ahora limpia `dist/` primero: `tsc` no borra, y el tarball habría llevado los placeholders viejos
  (`dist/tools/greet.tool.js`). El build de publicación no emite `.d.ts` ni sourcemaps (es un binario).
- `src/main.ts` lleva shebang (es el `bin`). `npm pack` auditado: 82 archivos, sin `src/`, `.env*`, `.claude/`, tests,
  maps ni secretos; el `dist` empaquetado arranca por stdio y expone las 9 tools.
- Se agregó `.dockerignore` (regla del proyecto para todo repo con Dockerfile).

## T4 — backup semanal

- `unref: true` en **ambos** jobs: se descubrió que con el cron activo (producción) el proceso no terminaba al cerrarse
  stdin del cliente MCP — un proceso huérfano por sesión.
- Formato: `{ version: 1, exportedAt, userId, reviews: [{ id, text, autoRank, extractedTags, createdAt, updatedAt,
game }] }`. Escritura a archivo temporal + `rename`, permisos `0600` (el texto de las reseñas es del usuario).
- Fecha del nombre = calendario **local** (a las 03:00 un `toISOString()` podría caer en el día anterior).
- Directorio: `$XDG_DATA_HOME/hylian-mcp/backups` si `XDG_DATA_HOME` está definido (entra por `env.ts`), si no
  `~/.hylian-mcp/backups` como pide el backlog.
- No hay restauración automática: el procedimiento manual está en `docs/flows.md`.
- Solo corre mientras el cliente MCP tiene el server abierto (stdio lanza el proceso por sesión).

## T5 — docs

`docs/flows.md` tiene los 12 flujos documentados con tools y mensajes reales, pero **verificados con dobles**, no contra
una cuenta real: el criterio "probados" queda parcial. La tabla de troubleshooting cita mensajes que el código emite
(salvo el de tabla inexistente, que es el de PostgREST para una tabla fuera de su schema cache).

## Pendiente con credenciales / decisión del dueño

- Correr `schema.sql` en Supabase y probar los flujos de `docs/flows.md` con la cuenta real.
- `npm publish` (y confirmar `author`, versión y nombre del paquete).
- Una tool para listar reseñas: hoy `edit_review`/`delete_review` dependen de tener el `reviewId` de la conversación.
