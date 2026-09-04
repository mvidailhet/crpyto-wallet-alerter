import Database from "better-sqlite3";

export type SimulationDatabase = Database.Database;

export function createSimulationDatabase(path: string): SimulationDatabase {
  const database = new Database(path);
  database.exec(`
    CREATE TABLE IF NOT EXISTS strategy_versions (
      id INTEGER PRIMARY KEY,
      version TEXT NOT NULL UNIQUE,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ) STRICT
  `);
  return database;
}
