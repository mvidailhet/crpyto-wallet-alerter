import type { SimulationDatabase } from "./database.js";
import type { StrategyConfig } from "../strategies/configs.js";

export type PersistedStrategyVersion = {
  strategyVersionId: number;
  version: string;
  configJson: string;
};

export function persistExecutedStrategyVersion(
  database: SimulationDatabase,
  strategy: StrategyConfig,
): PersistedStrategyVersion {
  const configJson = JSON.stringify(strategy);
  const result = database
    .prepare("INSERT INTO strategy_versions (version, config_json) VALUES (?, ?)")
    .run(strategy.version, configJson);

  const row = database
    .prepare("SELECT id, version, config_json FROM strategy_versions WHERE id = ?")
    .get(result.lastInsertRowid);

  if (!isStrategyVersionRow(row)) {
    throw new Error(`Strategy version ${strategy.version} was not persisted`);
  }

  return {
    strategyVersionId: row.id,
    version: row.version,
    configJson: row.config_json,
  };
}

function isStrategyVersionRow(
  value: unknown,
): value is { id: number; version: string; config_json: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "version" in value &&
    "config_json" in value &&
    typeof value.id === "number" &&
    typeof value.version === "string" &&
    typeof value.config_json === "string"
  );
}
