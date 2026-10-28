# FASE 0: Limpieza de scaffold

**Status**: ✅ COMPLETA (2026-10-24) — tarea 4 cerrada por decisión, ver [`DECISION_FASE0_DESVIOS.md`](../decisions/DECISION_FASE0_DESVIOS.md)
**Prioridad**: Alta
**Dependencias**: ninguna
**Fuente**: análisis propio del scaffold (joi residue, dist/ en git, placeholders como producto, workspace.yaml huérfano, README miente)

## Objetivo

Quitar ruido del template-mcp para que el producto (hylian-mcp) entre a FASE_1 sin lastre. Esta fase NO agrega features; deja el terreno limpio.

## Tareas

### Tarea 1: Reemplazar joi por zod en env validation ✅

- Archivos: `package.json` (sacar `joi`), `src/config/env.ts` (reescribir con `z`)
- Qué hacer:
  1. `pnpm remove joi`
  2. Reescribir `src/config/env.ts` usando `z.object({...}).parse(process.env)`. Mantener API pública (`export const env = { nodeEnv, transport, port, logLevel }`).
  3. Mantener `abortEarly: false` equivalente con zod (`{ errorMap }` o validación post-parse que liste todos los errores).
  4. Tipar el output con `z.infer<typeof schema>`.
- Referencia: `src/tools/greet.tool.ts` (uso idiomático de zod).

### Tarea 2: Mover placeholders a `src/examples/` ✅

- Archivos: `src/tools/greet.tool.ts`, `src/prompts/summarize.prompt.ts`, `src/resources/server-info.resource.ts`
- Qué hacer:
  1. Crear `src/examples/{tools,prompts,resources}/`.
  2. Mover los 3 archivos preservando la estructura `examples/<module>/<name>.<ext>.ts` y sus specs en `__tests__/`.
  3. Crear `src/examples/index.ts` con función `registerExamples(server)` análoga a los aggregators reales.
  4. `server.ts` debe llamar a `registerExamples(server)` solo si `env.nodeEnv !== 'production'` (no exponer placeholders a usuarios reales).
  5. Actualizar path aliases en `tsconfig.json` + `vitest.config.ts` para incluir `@examples/*`.
- Razón: dejar claro que NO son producto; son referencia de cómo escribir tools/prompts/resources.

### Tarea 3: Sacar `dist/` de git ✅ (ya estaba fuera de git; nada que remover)

- Archivos: `dist/` (ya está en `.gitignore`, falta ejecutar el rm)
- Qué hacer:
  1. `git rm -r --cached dist/`
  2. Verificar que `dist/` no aparece en `git ls-files`.
  3. Commit con `chore: untrack dist/` (no lo comiteo yo — decisión del usuario).
- Razón: build artifact, no debe vivir en el repo.

### Tarea 4: Eliminar `pnpm-workspace.yaml` ✅ (NO ejecutada: el archivo es la allowlist de build de esbuild; sin él `pnpm install` falla)

- Archivo: `pnpm-workspace.yaml`
- Qué hacer:
  1. `git rm pnpm-workspace.yaml`
  2. Verificar que `pnpm install` sigue funcionando sin él.
  3. Commit con `chore: remove orphan pnpm-workspace.yaml`.
- Razón: declara workspace sin packages; causa ambigüedad en install behavior.

### Tarea 5: Agregar dependencias de F1 ✅ (sin `@types/node-cron`: node-cron 4 trae tipos propios)

- Archivo: `package.json`
- Qué hacer:
  1. `pnpm add @supabase/supabase-js undici node-cron`
  2. `pnpm add -D @types/node-cron` (undici es nativo, sin types extra).
  3. Verificar que `pnpm install --frozen-lockfile` sigue pasando.
- Razón: preparar el terreno para FASE_1 sin esperar al medio del sprint.

### Tarea 6: Agregar env keys de F1 ✅

- Archivos: `src/config/constants.ts`, `.env.example`
- Qué hacer:
  1. Agregar a `ENV_KEYS`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `USER_ID`, `STEAM_API_KEY`, `STEAM_ID`.
  2. Agregar a `.env.example` con valores placeholder y comentarios:
     ```
     # Supabase (F1)
     SUPABASE_URL=
     SUPABASE_SERVICE_KEY=
     USER_ID=
     # Steam (F1)
     STEAM_API_KEY=
     STEAM_ID=
     ```
  3. NO incluir valores reales. NO commitear `.env`.
- Razón: documentar las variables que FASE_1 va a leer.

### Tarea 7: Reescribir README.md desde concepto ✅

- Archivo: `README.md`
- Qué hacer:
  1. Reescribir completamente. Eliminar TODO el contenido template (sección "Adding a New Tool", "Client Configuration" de 4 clientes, etc.).
  2. Estructura nueva (≤80 líneas):
     - Qué es (1 párrafo desde concepto)
     - Estado actual (1 línea: scaffold pre-F1)
     - Quick start (clonar, pnpm install, pnpm dev)
     - Tools/Prompts/Resources actuales (link a `src/`)
     - Link a `_CONCEPTO.md` para spec completa
     - Link a `docs/backlog/` para fases
  3. NO mover "Adding a New Tool" — esa info ahora vive en `CLAUDE.md` (ya escrita).
- Razón: el README actual miente sobre qué es el proyecto.

## Orden de ejecución

> Las tareas son independientes entre sí (no hay imports cruzados), pero el README (tarea 7) debe ser el ÚLTIMO porque referencia el estado final del scaffold.

1. Tarea 1 — joi → zod
2. Tarea 2 — move placeholders
3. Tarea 3 — git rm dist
4. Tarea 4 — git rm pnpm-workspace
5. Tarea 5 — add F1 deps
6. Tarea 6 — env keys
7. Tarea 7 — README (último)

## Criterios de Aceptación

- [x] `pnpm type-check` pasa con zod reemplazando joi
- [x] `pnpm test` pasa con placeholders movidos a `src/examples/`
- [x] `git ls-files | grep dist` retorna vacío
- [x] `pnpm install --frozen-lockfile` pasa con las nuevas deps
- [x] `.env.example` lista las 5 variables de F1 (vacías, comentadas)
- [x] `README.md` describe el producto, no el template
- [x] `pnpm lint` limpio
