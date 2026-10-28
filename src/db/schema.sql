-- hylian-mcp — Supabase schema (source: docs/_CONCEPTO.md, "Schema Supabase (normalizado)").
--
-- Run it manually, once, by either:
--   1. Supabase dashboard > SQL Editor > paste this file > Run, or
--   2. psql "<DB connection string>" -f src/db/schema.sql
--      (dashboard > Project Settings > Database > Connection string — NOT the
--      SUPABASE_URL, which is the HTTPS API endpoint and does not speak SQL).
--
-- Idempotent where Postgres allows it: indexes use IF NOT EXISTS; tables do not
-- (re-running on an existing schema fails at the first CREATE TABLE, by design).

-- Juegos (catálogo unificado, cualquier fuente)
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  steam_appid INTEGER UNIQUE,
  external_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('steam', 'manual')),
  name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tu biblioteca (lo que tenés)
CREATE TABLE user_library (
  user_id UUID NOT NULL,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  playtime_minutes INTEGER DEFAULT 0,
  last_played TIMESTAMPTZ,
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, game_id)
);

-- Tus reseñas (críticas escritas)
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  auto_rank INTEGER CHECK (auto_rank BETWEEN 0 AND 100),
  extracted_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ -- soft delete (FASE_2); migrations/0002_reviews_soft_delete.sql for older DBs
);

-- Perfil derivado (computado on-demand, cached opcional)
CREATE TABLE user_profile (
  user_id UUID PRIMARY KEY,
  tag_weights JSONB DEFAULT '{}',
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices.
-- games(steam_appid) y user_library(user_id) no llevan índice propio: el UNIQUE de
-- games.steam_appid y el PRIMARY KEY (user_id, game_id) de user_library ya crean uno que los sirve.
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews (user_id);

-- RLS activado sin policies: la anon key (pública) no puede leer ni escribir nada.
-- La service_role key que usa hylian-mcp bypasea RLS, así que el server no se ve afectado.
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
