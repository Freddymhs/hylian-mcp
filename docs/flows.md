# Flow Validation Document — hylian-mcp

> Describe cómo funciona la app para el usuario final.
>
> Última actualización: 2026-10-29
>
> **Estado de verificación:** cada flujo está cubierto por tests automáticos con dobles (Supabase vía cliente real
> con `fetch` falso, Steam vía `MockAgent`, tools vía `InMemoryTransport`). **2026-10-28/29, contra Supabase local**
> (`supabase start`) con el build por stdio: pasan reseñas (escribir, editar, borrar), catálogo y búsqueda,
> `delete_game`, el backup (solo reseñas activas, `0600`), `recommend_purchase` contra la Steam Store real,
> `rank_games` y `sync_library` contra la Steam Web API real (219 juegos; el re-sync trae 0 nuevos).
> **Falta:** repetirlo en un proyecto Supabase en la nube. Cada flujo cita el spec que lo respalda.

---

## Convenciones

- **Precondiciones**: qué debe existir antes de ejecutar el flujo
- **Pasos**: acciones del usuario (escribir al LLM, qué invoca el LLM, etc.)
- **Resultado esperado**: qué ve/obtiene el usuario al completar
- **Casos borde**: situaciones alternativas relevantes

> En este proyecto, el "usuario" no interactúa con UI: habla con el LLM del cliente MCP (Claude Code, OpenCode, Cursor) y el LLM invoca tools. Cada flujo describe: lo que el usuario dice → lo que el LLM debería invocar → lo que el usuario ve de vuelta.

---

## [Módulo: Setup inicial]

### [Flujo: instalar y arrancar el server]

**Precondiciones:**

- Node.js 22.19+, un proyecto Supabase y las claves de Steam (ver README → Instalación).
- `src/db/schema.sql` ejecutado en el SQL Editor de Supabase.

**Pasos:**

1. Registrar el server con `claude mcp add … -- npx -y @fmarcosdev/hylian-mcp` incluyendo `NODE_ENV=production` y las 5 variables.
2. Abrir el cliente MCP; el server arranca por stdio.
3. Pedir al LLM: "¿qué tools de hylian tenés?".

**Resultado esperado:**

- El cliente lista 10 tools: `sync_library`, `review_game`, `edit_review`, `delete_review`, `list_my_games`, `search_games`, `add_manual_game`, `delete_game`, `recommend_purchase`, `rank_games`. Sin `greet` ni prompts/resources de ejemplo.

**Casos borde:**

- Variable con formato inválido: el server sale con `Config validation error: <VAR>: <motivo>` (todas las inválidas juntas).
- Sin credenciales: arranca igual; cada tool falla al usarse con `Missing environment variable(s): …`.
- Sin `NODE_ENV=production`: aparecen las tools de ejemplo y los jobs no corren.
- Cerrar el cliente termina el proceso (el cron no lo mantiene vivo).

_Respaldo: `src/__tests__/server.spec.ts`, `src/config/__tests__/env.spec.ts`, `src/services/__tests__/container.spec.ts`._

---

## [Módulo: Sync de biblioteca Steam]

### [Flujo: primera sincronización]

**Precondiciones:**

- `STEAM_API_KEY`, `STEAM_ID`, Supabase y `USER_ID` configurados; perfil Steam con _game details_ públicos.

**Pasos:**

1. Usuario: "sincronizá mi biblioteca de Steam".
2. El LLM invoca `sync_library` (sin argumentos).

**Resultado esperado:**

- Respuesta `{ "synced": N, "newGames": N, "totalPlaytime": H }` (horas con un decimal). `list_my_games` ya muestra los juegos.

**Casos borde:**

- Perfil privado: `Steam returned no library data: the profile game details are private, or STEAM_ID is wrong`.
- HTTP 403: `check STEAM_API_KEY`. 5xx de Steam: reintenta 3 veces (200/500/1500 ms). Sin respuesta en 10 s: error de timeout.
- Cuenta sin juegos: `{ synced: 0, newGames: 0, totalPlaytime: 0 }`.

_Respaldo: `src/services/steam/__tests__/client.spec.ts`, `src/services/__tests__/library-sync.spec.ts`, `src/tools/__tests__/sync-library.tool.spec.ts`, `src/__tests__/e2e-fase1.spec.ts`._

---

### [Flujo: re-sync después de comprar juego]

**Precondiciones:**

- Al menos una sincronización previa.

**Pasos:**

1. Comprar el juego en Steam.
2. Usuario: "volvé a sincronizar" → `sync_library`.

**Resultado esperado:**

- `newGames` cuenta solo los juegos nuevos; el resto se actualiza (horas, última vez jugado) sin duplicar filas. Las reseñas existentes no se tocan.

**Casos borde:**

- Se puede ejecutar cuantas veces se quiera (idempotente). El sync diario de las 04:00 hace lo mismo sin intervención.
- Un juego que ya no está en Steam no se borra de tu biblioteca.

_Respaldo: `library-sync.spec.ts` ("is idempotent", "counts only unseen appids"), `daily-sync.spec.ts`._

---

## [Módulo: Reseñas]

### [Flujo: escribir primera reseña]

**Precondiciones:**

- El juego está en el catálogo (sync o `add_manual_game`).

**Pasos:**

1. Usuario: "reseña de Hollow Knight: obra maestra, 95/100, metroidvania souls-like".
2. El LLM invoca `review_game` con `gameName`, `text`, `autoRank: 95` y `extractedTags: ["metroidvania", "souls-like"]` (el análisis lo hace el LLM del cliente; el server guarda lo que recibe).

**Resultado esperado:**

- `{ reviewId, gameName, textLength, autoRank }`. El perfil de gustos se recalcula.

**Casos borde:**

- Nombre parcial: se resuelve si es único (`hollow` → Hollow Knight). Si coincide con varios (`counter`), error con la lista y pide el nombre completo; si ya hay un nombre exacto, gana.
- Juego inexistente: `Game "X" not found. Run sync_library first or use add_manual_game`.
- Rank fuera de 0-100 o texto vacío: rechazado por validación. Sin rank ni tags: se guarda igual (`autoRank: null`).
- Cada llamada crea una reseña nueva.

_Respaldo: `src/tools/__tests__/review-game.tool.spec.ts`, `src/services/__tests__/game-lookup.spec.ts`._

---

### [Flujo: editar reseña existente]

**Precondiciones:**

- Tener el `reviewId` devuelto por `review_game` (en la misma conversación).

**Pasos:**

1. Usuario: "subile la nota a 99".
2. El LLM invoca `edit_review` con `reviewId` y `autoRank: 99`.

**Resultado esperado:**

- `{ reviewId, gameName, textLength, autoRank: 99, extractedTags, updatedAt }`; solo cambian los campos enviados; el perfil se recalcula.

**Casos borde:**

- Sin ningún campo a cambiar: `Nothing to update`. Reseña inexistente, borrada o de otro usuario: `Review <id> not found`.
- Repetir la misma edición deja el mismo estado.
- No hay una tool para listar reseñas: si se perdió el `reviewId`, hay que consultarlo en Supabase.

_Respaldo: `src/tools/__tests__/review-management.tool.spec.ts`, `src/db/__tests__/reviews-f2.repository.spec.ts`._

---

### [Flujo: borrar reseña]

**Precondiciones:**

- Tener el `reviewId`.

**Pasos:**

1. Usuario: "borrá esa reseña".
2. El LLM confirma con el usuario e invoca `delete_review`.

**Resultado esperado:**

- `{ reviewId, deleted: true }`. La reseña deja de contar para el perfil, las ediciones y el backup (soft delete: la fila queda con `deleted_at`).

**Casos borde:**

- Borrar dos veces: la segunda da `not found or already deleted`.
- Para borrar un juego entero con sus reseñas: `delete_game` (pide confirmación; borra también biblioteca y reseñas, no se recupera).

_Respaldo: `review-management.tool.spec.ts`, verificación SQL de soft delete/cascade en Postgres 17 local._

---

## [Módulo: Recomendaciones]

### [Flujo: pedir recomendación genérica]

**Precondiciones:**

- Al menos una reseña con `extractedTags`.

**Pasos:**

1. Usuario: "recomendame juegos para comprar".
2. El LLM invoca `recommend_purchase` (sin argumentos; `limit` por defecto 10).

**Resultado esperado:**

- `{ recommendations: [{ gameName, steamAppId, score, matchedTags, priceUSD, storeUrl }], evaluated, skipped, warnings }`, ordenado por score. Excluye lo que ya tenés y los juegos manuales.

**Casos borde:**

- Sin reseñas con tags: error que pide escribirlas.
- `score` es relativo: el mejor candidato de esa corrida es 100.
- Steam Store caída o con rate limit: `warnings` / `skipped` lo informan; con todas las búsquedas caídas, error.
- Puede tardar varios segundos (hasta 24 consultas de detalle a la Store).

_Respaldo: `src/services/recommend/__tests__/*.spec.ts`, `src/tools/__tests__/recommend-purchase.tool.spec.ts`, `src/__tests__/e2e-fase2.spec.ts`._

---

### [Flujo: pedir recomendación con filtro de precio]

**Precondiciones:**

- Las mismas del flujo anterior.

**Pasos:**

1. Usuario: "algo tipo metroidvania por menos de 15 dólares".
2. El LLM invoca `recommend_purchase` con `criteria: "metroidvania"` y `maxPrice: 15`.

**Resultado esperado:**

- Solo candidatos con precio conocido ≤ 15 USD. Con `criteria`, la búsqueda usa solo ese término; el ranking sigue siendo por tu perfil.

**Casos borde:**

- Precio desconocido (no listado, otra moneda): excluido cuando hay `maxPrice`.
- Gratis cuenta como 0. Sin resultados: lista vacía, no error.

_Respaldo: `recommend.spec.ts` ("honours maxPrice", "uses the criteria as the only search term")._

---

### [Flujo: rankear una lista propia]

**Precondiciones:**

- Al menos una reseña con `extractedTags`.

**Pasos:**

1. Usuario pega una lista ("¿cuáles de estos ports VR me gustarían?").
2. El LLM invoca `rank_games` con `games: [{ name, tags }]`, infiriendo los tags de cada juego.

**Resultado esperado:**

- `{ ranked: [{ name, score, matchedTags }], unmatched: [name] }`. No guarda nada ni consulta ninguna tienda.

**Casos borde:**

- Sin reseñas con tags: el mismo error que `recommend_purchase`.
- `unmatched` = sin tags en común con el perfil: desconocido, no disgusto.
- `score` es relativo al mejor de esa lista.

_Respaldo: `src/tools/__tests__/rank-games.tool.spec.ts`. Probado 2026-10-28 por stdio contra Supabase local._

---

## [Módulo: Catálogo y búsqueda]

### [Flujo: agregar juego no-Steam]

**Precondiciones:**

- Ninguna especial.

**Pasos:**

1. Usuario: "agregá Tunic de Switch, aventura estilo Zelda, 2022".
2. El LLM invoca `add_manual_game` con `name: "Tunic (Switch)"` y `metadata: { genres: ["adventure"], tags: ["zelda-like"], releaseYear: 2022 }`.
3. Luego puede reseñarlo con `review_game`.

**Resultado esperado:**

- `{ gameId, name, source: "manual", externalId }`. Queda en el catálogo, no en `list_my_games`, y nunca se recomienda.

**Casos borde:**

- Nombre ya existente (manual o Steam): error; usar un nombre distinto (p. ej. con la plataforma).
- Año fuera de 1950-2100, precio negativo o URL inválida: rechazado.

_Respaldo: `src/tools/__tests__/catalog.tool.spec.ts`._

---

### [Flujo: buscar en biblioteca por nombre]

**Precondiciones:**

- Catálogo con juegos (sync y/o manuales).

**Pasos:**

1. Usuario: "¿tengo algo de Portal?" / "mostrame los juegos zelda-like".
2. El LLM invoca `search_games` con `query` (y opcionalmente `source`, `limit`).

**Resultado esperado:**

- `{ returned, games: [{ gameId, name, source, steamAppId, tags }] }` por coincidencia parcial e insensible a mayúsculas en nombre, tags o géneros. No consulta Steam.

**Casos borde:**

- `limit` por defecto 20 (máx 100). Sin coincidencias: `{ returned: 0, games: [] }`.
- Los juegos de Steam no traen tags (solo nombre). Para ver tiempo jugado, `list_my_games`.

_Respaldo: `catalog.tool.spec.ts`, `src/db/__tests__/games-catalog.repository.spec.ts`. La sintaxis `or=(…ilike…)` con `metadata->>tags` no se probó contra un PostgREST real._

---

## [Módulo: Mantenimiento]

### [Flujo: backup automático]

**Precondiciones:**

- `NODE_ENV=production` (o `MCP_CRON_ENABLED=true`) y el cliente MCP con el server abierto el domingo a las 03:00.

**Pasos:**

1. Nada: el job `weekly-backup` corre solo.

**Resultado esperado:**

- Archivo `~/.hylian-mcp/backups/reviews-AAAA-MM-DD.json` (o bajo `$XDG_DATA_HOME/hylian-mcp/backups/`), permisos `0600`, con cada reseña activa y los datos de su juego. Se conservan los últimos 12.

**Casos borde:**

- Falla (DB caída, disco): se loguea el motivo y el server sigue.
- Dos corridas el mismo día sobrescriben el mismo archivo.
- Si el cliente no estuvo abierto en ese horario, ese domingo no hay backup.

_Respaldo: `src/jobs/__tests__/weekly-backup.spec.ts`._

---

### [Flujo: restaurar desde backup]

**Precondiciones:**

- Un `reviews-*.json` y una base donde faltan las reseñas.

**Pasos:**

1. Asegurar que los juegos existen: `sync_library` para los de Steam, `add_manual_game` para los manuales (mismo nombre).
2. Por cada entrada de `reviews` del JSON, volver a crear la reseña: `review_game` con `game.name`, `text`, `autoRank` y `extractedTags` (o un `INSERT` en `reviews` con el `game_id` actual).

**Resultado esperado:**

- Las reseñas vuelven con su texto, rank y tags. Los `id` y fechas originales no se conservan si se usa `review_game`.

**Casos borde:**

- Entradas con `game: null`: el juego ya no existía; hay que recrearlo a mano.
- No hay un comando de restauración automática.

_Respaldo: `weekly-backup.spec.ts` ("can restore the reviews into a database that lost them")._
