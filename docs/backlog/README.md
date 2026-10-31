# Backlog — hylian-mcp

Backlog estructurado del proyecto. Generado desde `../_CONCEPTO.md` (single-user, local-first, MCP server para gestión de biblioteca gaming).

## Estado actual

**Fase actual:** todas las fases implementadas con dobles (2026-10-24); desde 2026-10-29 probadas contra Supabase local y la Steam API real (`docs/flows.md`) y deployadas en el Mac Mini (`docs/decisions/DECISION_DEPLOY_MAC_MINI.md`).
**Próximo paso:** decidir Supabase cloud (una sola base para PC y Mac Mini) y el `npm publish`. Pendientes en cada `docs/decisions/DECISION_*.md`.

## Fases

| Fase                                  | Nombre                    | Status        | Tareas | Fuente               |
| ------------------------------------- | ------------------------- | ------------- | ------ | -------------------- |
| [FASE_0](./FASE_0_LIMPIEZA.md)        | Limpieza de scaffold      | ✅ COMPLETA   | 7      | residuo template-mcp |
| [FASE_1](./FASE_1_MVP.md)             | MVP funcional             | 🟡 CON DOBLES | 8      | concepto F1 (1-10)   |
| [FASE_2](./FASE_2_RECOMENDACIONES.md) | Recomendaciones + edición | 🟡 CON DOBLES | 7      | concepto F2 (11-18)  |
| [FASE_3](./FASE_3_POLISH.md)          | Polish + publicación      | 🟡 CON DOBLES | 5      | concepto F3 (19-23)  |

Total: **27 tareas** en 4 fases.

## Diagramas de Referencia

| Archivo                                                                        | Tipo                 | Contenido                                                           |
| ------------------------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------- |
| [`../diagrams/DIAGRAMAS_COMPONENTES.md`](../diagrams/DIAGRAMAS_COMPONENTES.md) | Flowcharts (Mermaid) | Topología del sistema: cliente MCP, hylian-mcp, Supabase, Steam API |

Este diagrama es referencia estructural estable. Las fases lo referencian pero no lo repiten. Actualizar solo ante cambios de topología (agregar/quitar servicios o cambiar frontera cliente/servidor).

## Decisiones Técnicas

Carpeta [`../decisions/`](../decisions/) — documentar aquí decisiones arquitectónicas cuando surjan durante el desarrollo.
Formato: `DECISION_[TEMA].md` — explica el POR QUÉ, no el QUÉ.

## Validación de Flujos

| Archivo                      | Propósito                                                       |
| ---------------------------- | --------------------------------------------------------------- |
| [`../flows.md`](../flows.md) | Flujos de usuario documentados manualmente. Guía para QA y E2E. |

Llenar después de probar cada feature. Usar como referencia con `/tools:testing:run-browser-testing`.

## Concepto original

[`../_CONCEPTO.md`](../_CONCEPTO.md) — documento de origen, no editar. Refleja la idea original con la que se generó el backlog.

## Sincronización

Estado técnico del progreso: `../../.claude/backlog-progress.json`.
Comando de sincronización: `/work:backlog:sync` (detecta drift entre este directorio y el JSON).
