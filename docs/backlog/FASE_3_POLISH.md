# FASE 3: Polish + publicación

**Status**: 🟡 IMPLEMENTADA CON DOBLES (2026-10-24) — `npm publish` NO ejecutado; faltan pruebas con cuenta real; desvíos en [`DECISION_FASE3_DESVIOS.md`](../decisions/DECISION_FASE3_DESVIOS.md)
**Prioridad**: Baja
**Dependencias**: FASE_2 (todas las features core funcionando)
**Fuente**: `../_CONCEPTO.md` F3 (pasos 19-23)

## Objetivo

Instalable via npm. Buscás juegos en tu DB. Backup automático. Listo para usar en otro device.

## Tareas

### Tarea 1: Tool `add_manual_game` ✅

- Archivos: `src/tools/add-manual-game.tool.ts` (nuevo)
- Qué hacer:
  1. Zod input: `{ name: string, source: 'manual', metadata?: { genres?: string[], releaseYear?: number, developer?: string } }`.
  2. Inserta en `games` con `source = 'manual'`, `steam_appid = NULL`.
  3. Si querés jugarlo, llamar después `list_my_games` no lo va a mostrar (no está en `user_library`) — diseño consciente: la tool es para catálogo, no para "lo que tenés".
  4. Annotations: `idempotentHint: false` (cada call crea una fila).

### Tarea 2: Tool `search_games` ✅

- Archivos: `src/tools/search-games.tool.ts` (nuevo)
- Qué hacer:
  1. Zod input: `{ query: string, source?: 'all' | 'steam' | 'manual', limit?: number }`.
  2. Full-text search en `games.name` + `games.metadata->>'tags'`. Usar `ilike` o `to_tsvector` de Postgres.
  3. Devuelve hasta `limit` (default 20) con `name`, `source`, `steam_appid`, `tags`.
  4. Annotations: `readOnlyHint: true`.

### Tarea 3: Setup `npm publish` ✅

- Archivos: `package.json`, `.npmignore` (nuevo), `README.md` (versión final)
- Qué hacer:
  1. `package.json`:
     - `"bin": { "hylian-mcp": "dist/main.js" }` (permite `npx hylian-mcp`).
     - `"files": ["dist", "README.md", "LICENSE"]` (no incluir `src`).
     - `"repository"`, `"bugs"`, `"homepage"` apuntando al repo.
     - `"keywords": ["mcp", "model-context-protocol", "steam", "gaming"]`.
     - `"license": "MIT"`.
  2. `.npmignore` excluye: `src/`, `__tests__/`, `.env*`, `.claude/`, `.serena/`, `.github/`, `coverage/`, `*.log`.
  3. README final: install + config + troubleshooting.
  4. Test local: `npm pack` y verificar que el tarball no incluye secretos.
- Referencia: `https://docs.npmjs.com/cli/v10/configuring-npm/package-json`.

### Tarea 4: Backup automático (export JSON semanal) ✅

- Archivos: `src/jobs/weekly-backup.ts` (nuevo), `src/main.ts` (registrar cron)
- Qué hacer:
  1. `node-cron` schedule `'0 3 * * 0'` (3 AM domingos).
  2. Export: `SELECT * FROM reviews WHERE user_id = $env.userId AND deleted_at IS NULL` + metadata de juegos relacionados.
  3. Output: `~/.hylian-mcp/backups/reviews-YYYY-MM-DD.json` (XDG-aware).
  4. Retention: mantener últimos 12 backups, borrar el resto.
  5. Logging: success con path, error con razón.
  6. NO commitear backups al repo.

### Tarea 5: Troubleshooting + docs de uso ✅

- Archivos: `README.md` (sección final), `docs/flows.md` (revisar y llenar)
- Qué hacer:
  1. README: agregar sección "Troubleshooting" con los 5 errores más probables (Supabase URL inválida, Steam API key vencida, schema no migrado, user_id no es UUID, MCP_TRANSPORT mal configurado).
  2. README: ejemplo de `.env` completo con valores placeholder.
  3. `docs/flows.md`: el dev (vos) llena cada flujo con pasos reales después de probar cada feature.
  4. Crear `LICENSE` (MIT) si no existe.
- Referencia: `docs/flows.md` template ya creado.

## Criterios de Aceptación

- [x] `add_manual_game` persiste y `search_games` lo encuentra — con dobles
- [x] `npm pack` produce tarball sin `src/` ni `.env*` ni `.claude/` — auditado (82 archivos); **publish pendiente del dueño**
- [x] Backup se ejecuta según schedule y se puede restaurar manualmente desde el JSON — schedule `0 3 * * 0` validado con node-cron, escritura y restauración probadas contra el filesystem
- [x] README tiene sección troubleshooting accionable
- [ ] `docs/flows.md` tiene al menos 8 flujos probados y documentados — 12 documentados y cubiertos por tests con dobles; **falta probarlos contra Supabase/Steam reales**
- [x] `pnpm test` 100% verde
- [x] `pnpm lint` limpio
