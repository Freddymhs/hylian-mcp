# DECISION: `rank_games`, una tool fuera del concepto

Fecha: 2026-10-28

## Por qué existe

El concepto (`_CONCEPTO.md`, F1-F3) solo recomienda desde la Steam Store. El 2026-10-28 el dueño trajo una lista de
ports VR para Quest (GitHub, questports.vercel.app) y preguntó cuáles le gustarían: ni `recommend_purchase` (solo
Steam Store) ni los juegos manuales (nunca se recomiendan) podían contestarlo. Necesidad real, no supuesta.

## Qué decide

- El cliente trae la lista y los tags de cada juego; el server no busca en ninguna fuente ni guarda nada. Sin LLM
  propio (riesgo 3 del concepto), los tags los infiere el LLM del cliente, igual que `extractedTags`.
- Mismo scoring que `recommend_purchase`: `matchProfile` / `toRelativeScore` en `src/services/recommend/score.ts`, y
  el perfil vacío falla con el mismo mensaje (`loadTagWeights`).
- `unmatched` se devuelve en vez de descartarse: un juego sin tags en común es desconocido, no un disgusto.
