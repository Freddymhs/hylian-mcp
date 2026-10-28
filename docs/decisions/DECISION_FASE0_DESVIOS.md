# DECISION: desvíos de FASE_0 respecto al backlog

Fecha: 2026-10-24

## Tarea 4 — `pnpm-workspace.yaml` se mantiene

El backlog pedía borrarlo por "huérfano". Probado: sin el archivo, `pnpm install --frozen-lockfile`
falla con `ERR_PNPM_IGNORED_BUILDS` (esbuild@0.27.7). En pnpm 12 la aprobación de scripts de build
(`allowBuilds`) vive ahí; `package.json` → `pnpm.onlyBuiltDependencies` no se lee. Además, pnpm
recrea el archivo con un placeholder (`esbuild: set this to true or false`) si falta.

No declara workspace ni packages: es solo la allowlist de build. Se conserva con `esbuild: true`.
Criterio de aceptación "`pnpm install` sigue funcionando sin él" no es alcanzable hoy.

## Tarea 3 — `dist/` ya estaba fuera de git

`git ls-files dist` devuelve 0 archivos y `.gitignore` lo cubre; no había nada que `git rm`.

## Tarea 5 — no se instala `@types/node-cron`

`node-cron` 4.x trae sus propios tipos (`dist/node-cron.d.ts`); `@types/node-cron` 3.0.11 es de la
v3 y no corresponde. `engines.node` sube a `>=22.19` porque `undici` 8 lo exige.
