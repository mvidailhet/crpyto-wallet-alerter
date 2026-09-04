#!/usr/bin/env node
import { loadConfig } from "../config/env.js";
import { startDexScreenerMonitor } from "../monitor/dex-screener-monitor.js";
import { loadStrategyConfig } from "../strategies/configs.js";

export async function runMonitorCommand() {
  const config = loadConfig();
  const strategy = await loadStrategyConfig(config.strategyVersion);
  const monitor = startDexScreenerMonitor({
    databasePath: config.simulationDatabasePath,
    dataDirectory: config.simulationDataDirectory,
    strategy,
    writeLine: console.log,
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      monitor.stop();
      process.exitCode = 0;
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMonitorCommand().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
