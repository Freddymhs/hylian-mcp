# DECISION: criterios y desvíos de FASE_2

Fecha: 2026-10-24

## T1 — providers

- `fetch`/`search` devuelven `Result<Game, ProviderError>`, no `Promise<Game>` (misma convención que el resto: sin throw).
- `SteamProvider` usa solo la Store API (metadata). Los datos del usuario (Web API) siguen en el cliente del sync.
- `ManualProvider` lee `games` con `source = 'manual'`. El contrato de `games.metadata` para esos juegos vive en
  `src/providers/manual-metadata.ts` (SSOT; lo escribe `add_manual_game`, ver `DECISION_FASE3_DESVIOS.md`).
  Metadata ilegible degrada a "sin datos extra", no oculta el juego.
- `GameProviderService`: orden = prioridad (manual antes que Steam); dedupe por nombre normalizado; si un provider
  falla y otro responde, devuelve resultado parcial con `failures`.
- Los hits de `search` de Steam son livianos (`detailed: false`, sin tags): hay que llamar `fetch` para tags y precio final.
- **La Store API no está documentada por Valve.** Las formas (`storesearch`, `appdetails`) salen de la referencia de la
  comunidad (wiki.teamfortress.com/wiki/User:RJackson/StorefrontAPI) y de respuestas reales; tiene rate limit (HTTP 429).

## Vocabulario de tags (límite conocido)

`appdetails` expone _géneros_ y _categorías_ ("Action", "Single-player"), no los tags de usuario de Steam
("Metroidvania", "Souls-like"). El match perfil↔candidato usa los nombres normalizados (minúsculas, sin puntuación:
"Souls-like" = "souls like") **más** los tags del perfil que aparecen como palabra completa en la descripción corta.
Los tags que el usuario/LLM pone en las reseñas rinden más si se parecen al vocabulario de Steam. No verificado con
una cuenta real.

## T3 — `delete_review` es soft delete

Columna `reviews.deleted_at`. `schema.sql` la incluye (instalaciones nuevas); para bases creadas con la versión de
FASE_1: `src/db/migrations/0002_reviews_soft_delete.sql` (idempotente). Toda lectura de reseñas filtra
`deleted_at IS NULL` (perfil, edición, borrado). `updated_at`/`deleted_at` se sellan con el reloj de la app:
PostgREST no puede mandar `NOW()`.

## T4 — `delete_game`

Cascade por FK (`user_library`, `reviews`). La respuesta no informa cuántas filas cayeron. Un juego Steam que
sigue en la biblioteca reaparece en el próximo `sync_library` con otro UUID y sin reseñas; la descripción del tool
se lo dice al cliente y le exige confirmar con el usuario antes de llamar.

## T5 — perfil

`weight(tag) = Σ rank de las reseñas con el tag / total de reseñas activas` (el divisor cuenta también las sin tags).
Sin rank = 50. Tags normalizados y deduplicados por reseña. Caché en `user_profile`, TTL 24 h.
Se recalcula (forzado) tras `review_game`, `edit_review`, `delete_review` y `delete_game`; si el recálculo falla se
loguea y la operación sobre la reseña igual termina bien.

## T6 — scoring

`raw = Σ tag_weights[tag]` de los tags del candidato presentes en el perfil. **Normalización relativa**: el mejor
candidato de la corrida es 100. Un candidato sin ningún tag en común no se recomienda. Descarta lo que ya está en la
biblioteca (por appid o por nombre normalizado). Consecuencia: el score es comparativo, no absoluto; el criterio de
aceptación "scores > 50" depende del pool de candidatos.

## T7 — `recommend_purchase`

- `criteria`: si viene, es el **único** término de búsqueda; si no, se buscan los 5 tags de mayor peso. El ranking
  siempre usa el perfil.
- `maxPrice` (USD): se descartan antes del detalle los hits con precio conocido mayor; después del detalle se exige
  precio conocido y ≤ máximo (precio desconocido = excluido).
- Presupuesto contra la Store API: 24 candidatos con detalle como máximo, 4 en paralelo; los que fallan se cuentan en
  `skipped`. Los candidatos hallados por más de un término van primero.
- Sin perfil (sin reseñas con tags) devuelve un error que pide escribirlas.
- Los juegos manuales **nunca se recomiendan** y su nombre oculta al homónimo de Steam: son cosas que el usuario ya
  conoce (se agregan para reseñarlas). Se excluyen por nombre de _todos_ los manuales (`listManualNames`), no solo los
  que matchean el término de búsqueda. Si un provider falla y otro responde, la salida lleva `warnings`.

## Pendiente con credenciales reales

`recommend_purchase` contra la Store real con la cuenta del usuario (50+ juegos, 10+ reseñas), y verificar que las
formas de `storesearch`/`appdetails` siguen siendo las de los fixtures.
