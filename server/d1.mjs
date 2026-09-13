// A D1-shaped wrapper over node:sqlite, so the shop's queries run unchanged on a
// plain server. Only the surface the app actually uses is implemented: prepare,
// bind, first, all, run and batch.
import {DatabaseSync} from 'node:sqlite';

const clean = values => values.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

class Statement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) {
    return new Statement(this.db, this.sql, clean(values));
  }
  #prepared() {
    return this.db.prepare(this.sql);
  }
  async first(column) {
    const row = this.#prepared().get(...this.values);
    if (row === undefined) return null;
    return column === undefined ? row : (row[column] ?? null);
  }
  async all() {
    return {success: true, results: this.#prepared().all(...this.values), meta: {}};
  }
  async run() {
    const r = this.#prepared().run(...this.values);
    return {
      success: true,
      results: [],
      meta: {changes: Number(r.changes ?? 0), last_row_id: Number(r.lastInsertRowid ?? 0)},
    };
  }
  // Used by batch(), which must stay inside one transaction.
  runSync() {
    const statement = this.#prepared();
    // A statement that returns rows has to be read with all(); run() throws on it.
    try {
      const r = statement.run(...this.values);
      return {success: true, results: [], meta: {changes: Number(r.changes ?? 0), last_row_id: Number(r.lastInsertRowid ?? 0)}};
    } catch (e) {
      if (!/use\s+.*(all|get)|does not return data|returns data/i.test(String(e.message))) throw e;
      return {success: true, results: statement.all(...this.values), meta: {changes: 0}};
    }
  }
}

export class D1 {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA busy_timeout = 5000');
  }
  prepare(sql) {
    return new Statement(this.db, sql);
  }
  // All-or-nothing, like D1: one failing statement rolls the whole batch back.
  async batch(statements) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(s => s.runSync());
      this.db.exec('COMMIT');
      return results;
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch { /* already rolled back */ }
      throw e;
    }
  }
  async exec(sql) {
    this.db.exec(sql);
    return {count: 0, duration: 0};
  }
  close() {
    this.db.close();
  }
}
