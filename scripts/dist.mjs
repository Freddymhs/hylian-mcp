// Build helpers for the npm package. Plain Node so they run the same on every OS.
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const DIST_DIR = 'dist';
const SQL_SOURCES = ['src/db/schema.sql', 'src/db/migrations'];
const SQL_TARGET_DIR = `${DIST_DIR}/db`;

const commands = {
  // tsc never deletes: files from removed sources would end up in the tarball.
  clean: () => rmSync(DIST_DIR, { recursive: true, force: true }),
  // The schema must ship with the package: users run it once against their Supabase.
  'copy-sql': () => {
    mkdirSync(SQL_TARGET_DIR, { recursive: true });
    SQL_SOURCES.forEach((source) => {
      const name = source.split('/').pop();
      cpSync(source, `${SQL_TARGET_DIR}/${name}`, { recursive: true });
    });
  },
};

const [name] = process.argv.slice(2);
const command = commands[name];
if (!command) {
  console.error(`Unknown command "${name}". Use: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}
command();
