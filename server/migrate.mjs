// Applies the drizzle migrations to the SQLite file the Node server uses.
// Only what is missing is applied, so running it again is harmless.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const MIGRATIONS = [
  ['drizzle/0000_steep_pretty_boy.sql', db => hasTable(db, 'products')],
  ['drizzle/0001_empty_dust.sql', db => hasColumn(db, 'admins', 'recovery_hash')],
  ['drizzle/0002_messy_toxin.sql', db => hasTable(db, 'bundles')],
];

const hasTable = (db, name) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name) !== undefined;
const hasColumn = (db, table, column) =>
  db.prepare('SELECT 1 AS hit FROM pragma_table_info(?) WHERE name=?').get(table, column) !== undefined;

export function migrateSqlite(file, log = console.log) {
  mkdirSync(path.dirname(file), {recursive: true});
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  let applied = 0;
  try {
    for (const [relative, done] of MIGRATIONS) {
      if (done(db)) { log(`already applied: ${relative}`); continue; }
      const sql = readFileSync(path.join(root, relative), 'utf8');
      db.exec('BEGIN');
      try {
        // Drizzle separates statements with this marker; SQLite takes the rest as-is.
        for (const statement of sql.split('--> statement-breakpoint')) {
          if (statement.trim()) db.exec(statement);
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw new Error(`Could not apply ${relative}: ${e.message}`);
      }
      log(`applied: ${relative}`);
      applied++;
    }
  } finally {
    db.close();
  }
  if (!applied) log('Database was already up to date.');
  return applied;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
  migrateSqlite(path.join(dataDir, 'huqa.sqlite'));
}
