# Diagramas de Componentes (Flowcharts)

Propósito: mapa estable del sistema. Actualizar solo si cambia topología.

## Contexto (alto nivel)

```mermaid
flowchart LR
    User([Usuario]) -->|escribe reseñas<br/>pide recomendaciones| ClaudeCode[Claude Code<br/>MCP client]
    ClaudeCode -->|stdio: JSON-RPC<br/>o http: Streamable| HylianMCP[hylian-mcp<br/>MCP server]
    HylianMCP -->|SQL via<br/>service_role key| Supabase[(Supabase<br/>Postgres)]
    HylianMCP -->|REST<br/>Web API| SteamAPI[Steam Web API]
    HylianMCP -->|REST<br/>Store API| SteamStore[Steam Store API]

    classDef external fill:#f9f,stroke:#333,stroke-width:2px
    classDef service fill:#bbf,stroke:#333,stroke-width:2px
    classDef data fill:#bfb,stroke:#333,stroke-width:2px

    class ClaudeCode,HylianMCP service
    class Supabase data
    class SteamAPI,SteamStore external
```

## Componentes principales

```mermaid
flowchart TB
    subgraph Cliente["Cliente MCP"]
        User([Usuario]) --> CC[Claude Code / OpenCode / Cursor]
    end

    subgraph HylianMCP["hylian-mcp (Node 22 + TS estricto)"]
        Main[main.ts<br/>transport selection]
        Server[server.ts<br/>createServer factory]

        subgraph Tools["tools/ (LLM-callable)"]
            T1[sync_library]
            T2[review_game]
            T3[list_my_games]
            T4[edit/delete review/game]
            T5[recommend_purchase]
            T6[add_manual_game]
            T7[search_games]
        end

        subgraph Resources["resources/ (read-only)"]
            R1[server-info]
        end

        subgraph Prompts["prompts/ (templates)"]
            P1[summarize]
        end

        subgraph Services["services/ (lógica)"]
            S1[Steam client<br/>undici]
            S2[Profile aggregate]
            S3[Scoring]
        end

        subgraph Providers["providers/ (orquestación)"]
            PR1[SteamProvider]
            PR2[ManualProvider]
        end

        subgraph DB["db/ (data layer)"]
            D1[Supabase client<br/>service_role]
        end

        subgraph Jobs["jobs/ (cron)"]
            J1[daily-sync<br/>node-cron 4 AM]
            J2[weekly-backup<br/>node-cron dom 3 AM]
        end

        subgraph Config["config/ + common/"]
            C1[env validation<br/>zod]
            C2[logger<br/>pino → stderr]
        end
    end

    subgraph Externo["Servicios externos"]
        SUP[(Supabase<br/>Postgres)]
        SW[Steam Web API]
        SS[Steam Store API]
    end

    CC <-->|stdio/http| Main
    Main --> Server
    Server --> Tools
    Server --> Resources
    Server --> Prompts

    T1 --> S1
    T1 --> D1
    T2 --> D1
    T3 --> D1
    T4 --> D1
    T5 --> S2
    T5 --> S3
    T5 --> PR1
    T5 --> PR2
    T6 --> D1
    T7 --> D1

    S1 --> SW
    PR1 --> SW
    PR1 --> SS
    PR2 --> D1

    D1 -->|SQL| SUP

    J1 --> T1
    J2 --> D1

    C1 -.->|env| Main
    C2 -.->|logs| Tools
    C2 -.->|logs| Services
    C2 -.->|logs| Jobs

    classDef client fill:#ffd,stroke:#333
    classDef external fill:#f9f,stroke:#333,stroke-width:2px
    classDef data fill:#bfb,stroke:#333,stroke-width:2px
    class User,CC client
    class SW,SS external
    class SUP data
```

## Flujo: escribir reseña → recomendación

```mermaid
sequenceDiagram
    participant U as Usuario
    participant CC as Claude Code
    participant MCP as hylian-mcp
    participant DB as Supabase
    participant S as Steam API

    U->>CC: "Reseña de Hollow Knight: masterpiece, 95/100, metroidvania souls-like"
    CC->>MCP: tools/call review_game
    MCP->>DB: INSERT reviews
    DB-->>MCP: reviewId
    MCP-->>CC: { reviewId, textLength: 32, autoRank: 95 }

    Note over MCP: trigger: profile re-aggregate (async)

    U->>CC: "Recomiéndame juegos para comprar"
    CC->>MCP: tools/call recommend_purchase
    MCP->>DB: SELECT user_profile, user_library
    MCP->>S: GET /appdetails?appids=...
    S-->>MCP: candidatos con tags + precios
    MCP->>MCP: score(candidates, profile.tag_weights)
    MCP-->>CC: top 10 con score, tags, precio
    CC-->>U: "Te recomiendo Blasphemous (87/100 match), Dead Cells (82)..."
```

## Notas

- **Single-user, sin Auth**: el `service_role` key bypasea RLS. No hay signup/login.
- **Stdout = protocolo MCP**: TODO logging va a stderr. No `console.log` en código de app.
- **Cron solo en producción o con opt-in**: `MCP_CRON_ENABLED=true` en dev.
- **Backups locales**: `~/.hylian-mcp/backups/`, no commiteados.
