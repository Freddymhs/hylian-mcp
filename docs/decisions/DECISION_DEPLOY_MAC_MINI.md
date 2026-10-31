# DECISION: Supabase local y deploy en el Mac Mini, en vez de Supabase cloud y npm

Fecha: 2026-10-29

## Qué dice el concepto

`_CONCEPTO.md` pide "Storage en Supabase (Postgres cloud, free tier)" y distribución con `npm publish`, y deja fuera
"Servicio cloud deployado (corre local)".

## Qué se hizo y por qué

- **Supabase local** (CLI + Docker, `supabase/config.toml`) en vez de un proyecto cloud. El dueño lo eligió el
  2026-10-28 para tener el server funcionando ya, sin crear el proyecto. Los repositorios solo conocen
  `SUPABASE_URL` y la key: pasar a la nube es cambiar dos líneas del `.env` y correr `schema.sql` allá.
- **Host: el Mac Mini M1**, siempre prendido. Sigue siendo "corre local": máquina propia, nada en un cloud.
- **Deploy por push** (`.github/workflows/deploy.yml`), pedido el 2026-10-29: "hacer commits acá, y que después de
  yo pushear automáticamente debería deployarse". Usa el runner self-hosted de `fmarcos-labs` que ya deploya otros
  repos; por eso el repo vive en esa org (y `package.json` apunta ahí). Corre solo si CI pasó.
- **Imagen Docker en vez de npm**: Claude Code del Mac lanza `hylian-mcp:local` por stdio. El paquete npm sigue sin
  publicarse; el `bin` y `prepack` quedan como estaban.

## Qué queda abierto

- El PC y el Mac Mini tienen cada uno su Supabase local: dos bases separadas hasta que se elija una sola.
