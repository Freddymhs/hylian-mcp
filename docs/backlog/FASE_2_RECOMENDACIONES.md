# FASE 2: Recomendaciones + edición

**Status**: 🟡 IMPLEMENTADA CON DOBLES (2026-10-24) — falta la verificación con cuenta real; criterios en [`DECISION_FASE2_DESVIOS.md`](../decisions/DECISION_FASE2_DESVIOS.md)
**Prioridad**: Media
**Dependencias**: FASE_1 (review_game + sync_library funcionando)
**Fuente**: `../_CONCEPTO.md` F2 (pasos 11-18), consolidados en 7 tareas

## Objetivo

Podés editar/eliminar reseñas y juegos, y el sistema te recomienda compras basándose en tu perfil derivado de reseñas.

## Orden de ejecución

> Provider pattern (T1) es base. Tools de edición (T2-T4) independientes entre sí. Profile aggregation (T5) y scoring (T6) son prerequisitos de recommend tool (T7).

1. Tarea 1 — Provider pattern (interface + Steam + Manual)
2. Tareas 2, 3, 4 — edit/delete tools (paralelas)
3. Tarea 5 — Profile aggregation
4. Tarea 6 — Scoring algorithm
5. Tarea 7 — recommend_purchase tool (depende de T5 + T6)

## Tareas

### Tarea 1: Provider pattern ✅

- Archivos: `src/providers/types.ts` (nuevo), `src/providers/steam.provider.ts` (nuevo), `src/providers/manual.provider.ts` (nuevo), `src/providers/index.ts` (nuevo)
- Qué hacer:
  1. Interface `GameProvider { fetch(externalId): Promise<Game>; search(query): Promise<Game[]> }`.
  2. `SteamProvider` usa Steam Store API (NO Web API — Store es para metadata) y Steam Web API para datos de usuario.
  3. `ManualProvider` es para juegos no-Steam: input del usuario como source of truth.
  4. `GameProviderService` orquesta múltiples providers, deduplica por nombre normalizado.
  5. Tests unitarios por provider + test de orquestación.
- Referencia: `_CONCEPTO.md` líneas 76-89 (interface).

### Tarea 2: Tool `edit_review` ✅

- Archivos: `src/tools/edit-review.tool.ts` (nuevo)
- Qué hacer:
  1. Zod input: `{ reviewId: UUID, text?: string, autoRank?: number, extractedTags?: string[] }`.
  2. Update en `reviews` con `updated_at = NOW()`. Validar ownership (user_id match).
  3. Annotations: `destructiveHint: false`, `idempotentHint: true`.

### Tarea 3: Tool `delete_review` ✅

- Archivos: `src/tools/delete-review.tool.ts` (nuevo)
- Qué hacer:
  1. Zod input: `{ reviewId: UUID }`.
  2. Delete con validación de ownership. Soft delete (`deleted_at` column) — agregar migration si no existe.
  3. Annotations: `destructiveHint: true`, `idempotentHint: false`.

### Tarea 4: Tool `delete_game` ✅

- Archivos: `src/tools/delete-game.tool.ts` (nuevo)
- Qué hacer:
  1. Zod input: `{ gameId: UUID }`.
  2. Cascade delete: `user_library` + `reviews` asociadas (ya está en schema por FK CASCADE).
  3. Annotations: `destructiveHint: true`. Confirmación: el LLM del cliente debe pedir confirmación al usuario antes de invocar.

### Tarea 5: Profile aggregation ✅

- Archivos: `src/services/profile/aggregate.ts` (nuevo), `src/services/profile/types.ts` (nuevo)
- Qué hacer:
  1. Lee `reviews` del user, computa `tag_weights: Record<string, number>`.
  2. Ponderación: `weight(tag) = sum(autoRank * count) / total_reviews`. Tags sin rank se cuentan con peso 50 (default).
  3. Cache en `user_profile` con TTL 24h (`computed_at`).
  4. Trigger manual o auto en cada `review_game`/`edit_review`.
  5. Tests con dataset fijo de reseñas.
- Referencia: schema `user_profile` en `_CONCEPTO.md` línea 67-72.

### Tarea 6: Scoring algorithm ✅

- Archivos: `src/services/recommend/score.ts` (nuevo)
- Qué hacer:
  1. Input: `userProfile.tag_weights` + `candidateGames: Game[]` con sus tags.
  2. Score por game: `sum(tag_weights[tag] for tag in candidate.tags if tag in userProfile)`.
  3. Normalización 0-100.
  4. Descarta games ya en `user_library`.
  5. Devuelve top-N ordenados por score.
  6. Tests: perfil conocido → set de candidatos conocido → ranking esperado.

### Tarea 7: Tool `recommend_purchase` ✅

- Archivos: `src/tools/recommend-purchase.tool.ts` (nuevo)
- Qué hacer:
  1. Zod input: `{ criteria?: string, maxPrice?: number, limit?: number (default 10) }`.
  2. Llama `profile.aggregate()` → `recommend.score()` → filtra por maxPrice (vía Steam Store API price check).
  3. Devuelve top-N con: `{ gameName, steamAppId, score, matchedTags, priceUSD, storeUrl }`.
  4. Annotations: `readOnlyHint: true`, `openWorldHint: true` (consulta Steam Store).
  5. Test con InMemoryTransport + providers mockeados.
- Referencia: FASE_1 tests para patrón.

## Criterios de Aceptación

- [x] `edit_review` actualiza y refresca `updated_at`
- [x] `delete_review` y `delete_game` son cascade-safe — soft delete + cascade por FK, verificado en Postgres 17 local
- [x] Profile aggregation con 5+ reseñas fake devuelve `tag_weights` razonable
- [x] Scoring rankea correctamente con dataset controlado
- [ ] `recommend_purchase` con tu cuenta real (50+ juegos, 10+ reseñas) devuelve 5+ sugerencias con scores >50 — **pendiente: requiere Supabase y Steam reales**; cubierto con dobles. Ojo: el score es relativo al mejor candidato
- [x] `pnpm test` 100% verde (incluye nuevos tests)
- [x] `pnpm lint` limpio
