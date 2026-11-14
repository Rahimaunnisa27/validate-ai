import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { runMigrations } from './migrations.ts';

let dbInstance: Database.Database | null = null;

export function initDatabase(customPath?: string): Database.Database {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const targetPath = customPath || config.databasePath;
  if (targetPath !== ':memory:') {
    const dir = path.dirname(path.resolve(targetPath));
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(targetPath);
  db.pragma('foreign_keys = ON');
  if (targetPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }

  runMigrations(db);

  dbInstance = db;
  return db;
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

export function setDbForTesting(db: Database.Database): void {
  dbInstance = db;
}
