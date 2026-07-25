# template-mcp — Elevator Pitch

## ENGLISH

**Context:**
Building MCP (Model Context Protocol) servers from scratch is error-prone. There are subtle protocol constraints that most tutorials ignore, and setting up testing, Docker, and CI from zero costs hours. This template gives any developer a production-ready starting point for exposing tools, resources, and prompts to any MCP client — Claude Code, Cursor, VS Code Copilot, Windsurf — without falling into the common traps.

**The Decision:**
Dual-transport design: stdio for local clients, Streamable HTTP for remote/Docker deployment — selected at runtime via env var. The trade-off is complexity at startup (`main.ts` dynamically imports the HTTP transport only when needed), but the payoff is a single codebase that works in both contexts without branching logic throughout the app. The factory pattern (`createServer()`) keeps the server itself transport-agnostic, so tests don't need a real port or process.

**One Real Challenge:**
In stdio mode, stdout is the MCP protocol channel. Every JSON-RPC message travels through it. A single stray `console.log` silently corrupts the stream — the client receives malformed JSON and hangs or crashes with no useful error. The solution: Pino is hardwired to `stderr` (fd 2) in all environments, before any configuration is read. This is enforced at the logger module level, not left to convention.

**Why It's Production-Ready:**

- **Tests exercise the real protocol** — 11 specs use `InMemoryTransport` from the official MCP SDK, so tool schemas, input validation, and error responses are tested at the wire layer, not against stubs.
- **Fail-fast configuration** — Joi validates all env vars at process start and exits with a clear error before any server code runs. Bad config never reaches the runtime.
- **CI/CD gates** — GitHub Actions runs lint → build → test on every push. The Docker image uses a multi-stage build that produces a minimal production layer with no dev dependencies.

**The Insight:**
The hardest part of MCP development isn't implementing tools — it's knowing which protocol constraints are silent killers. A template that encodes those constraints structurally is worth more than any amount of documentation.

---

## ESPAÑOL

**Contexto:**
Construir servidores MCP (Model Context Protocol) desde cero es propenso a errores. Existen restricciones de protocolo sutiles que la mayoría de los tutoriales ignoran, y configurar tests, Docker y CI desde cero cuesta horas. Este template le da a cualquier desarrollador un punto de partida listo para producción para exponer tools, resources y prompts a cualquier cliente MCP — Claude Code, Cursor, VS Code Copilot, Windsurf — sin caer en las trampas comunes.

**La Decisión:**
Diseño de transporte dual: stdio para clientes locales, Streamable HTTP para despliegue remoto/Docker — seleccionado en runtime via variable de entorno. El trade-off es complejidad en el arranque (`main.ts` importa el transporte HTTP dinámicamente solo cuando se necesita), pero el beneficio es un único codebase que funciona en ambos contextos sin lógica ramificada en toda la app. El factory pattern (`createServer()`) mantiene el servidor agnóstico al transporte, por lo que los tests no necesitan un puerto real ni un proceso separado.

**Un Reto Real:**
En modo stdio, stdout es el canal del protocolo MCP. Todos los mensajes JSON-RPC viajan por él. Un `console.log` suelto corrompe silenciosamente el stream — el cliente recibe JSON malformado y se cuelga o falla sin ningún error útil. La solución: Pino está hardwired a `stderr` (fd 2) en todos los entornos, antes de que se lea ninguna configuración. Esto se aplica a nivel del módulo de logger, no se deja a convención.

**Por Qué Está Listo para Producción:**

- **Los tests ejercitan el protocolo real** — 11 specs usan `InMemoryTransport` del SDK oficial de MCP, así que los schemas de tools, la validación de inputs y las respuestas de error se testean en la capa de wire, no contra stubs.
- **Configuración fail-fast** — Joi valida todas las variables de entorno al inicio del proceso y sale con un error claro antes de que corra ningún código del servidor. Una mala configuración nunca llega al runtime.
- **Gates de CI/CD** — GitHub Actions ejecuta lint → build → test en cada push. La imagen Docker usa un build multi-stage que produce una capa de producción mínima sin dependencias de desarrollo.

**La Insight:**
La parte más difícil del desarrollo MCP no es implementar tools — es saber qué restricciones del protocolo son silent killers. Un template que codifica esas restricciones estructuralmente vale más que cualquier cantidad de documentación.
