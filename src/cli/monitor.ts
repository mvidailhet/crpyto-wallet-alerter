#!/usr/bin/env node
import { resolveAlertAdapters } from "../alerts/telegram-adapter.js";
import { loadConfig, type AppConfig } from "../config/env.js";
import { startDexScreenerMonitor } from "../monitor/dex-screener-monitor.js";
import { loadStrategyConfig, type StrategyConfig } from "../strategies/configs.js";

export type RunMonitorCommandOptions = {
  args?: string[];
  config?: AppConfig;
  strategy?: StrategyConfig;
  start?: typeof startDexScreenerMonitor;
  writeLine?: (line: string) => void;
};

export async function runMonitorCommand(options: RunMonitorCommandOptions = {}) {
  const args = options.args ?? process.argv.slice(2);
  const requireAlerts = args.includes("--require-alerts");
  const config = options.config ?? loadConfig();
  const strategy = options.strategy ?? (await loadStrategyConfig(config.strategyVersion));
  const writeLine = options.writeLine ?? console.log;
  const start = options.start ?? startDexScreenerMonitor;

  const alertAdapters = resolveAlertAdapters(config, { requireAlerts });
  writeLine(
    alertAdapters.length === 0
      ? "Telegram alerts disabled (no credentials configured)."
      : `Alerts enabled: ${alertAdapters.map((adapter) => adapter.channel).join(", ")}.`,
  );

  return start({
    databasePath: config.simulationDatabasePath,
    dataDirectory: config.simulationDataDirectory,
    strategy,
    alertAdapters,
    writeLine,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMonitorCommand()
    .then((monitor) => {
      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.once(signal, () => {
          monitor.stop();
          process.exitCode = 0;
        });
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
