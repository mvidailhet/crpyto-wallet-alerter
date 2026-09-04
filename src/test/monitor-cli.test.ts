import { describe, expect, it, vi } from "vitest";

import { runMonitorCommand } from "../cli/monitor.js";
import type { AppConfig } from "../config/env.js";
import type { StrategyConfig } from "../strategies/configs.js";

const strategy: StrategyConfig = {
  version: "baseline-test",
  chain: "robinhood",
  scanIntervalMinutes: 15,
  topPairsByOneHourVolume: 50,
  minimumPairAgeHours: 96,
  minimumLiquidityUsd: 250_000,
  minimumOneHourVolumeUsd: 100_000,
  athMarketCapUsd: { minimum: 7_000_000, maximum: 25_000_000 },
  currentMarketCapWithinAthPercent: 30,
  athAgeHours: { minimum: 12, maximum: 168 },
  plannedBuyLevels: [{ athPullbackPercent: 35, allocationPercent: 100 }],
  maximumActiveTradeSetups: 10,
};

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    rpcUrl: "https://rpc.example",
    logChunkSize: 1000n,
    rpcTimeoutMs: 10_000,
    strategyVersion: "baseline-test",
    ...overrides,
  };
}

describe("monitor command", () => {
  it("starts the monitor without alert adapters when Telegram is unconfigured", async () => {
    const start = vi.fn().mockReturnValue({ stop: vi.fn() });
    const writeLine = vi.fn();

    await runMonitorCommand({
      args: [],
      config: config(),
      strategy,
      start,
      writeLine,
      registerShutdown: false,
    });

    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][0].alertAdapters).toEqual([]);
    expect(writeLine).toHaveBeenCalledWith("Telegram alerts disabled (no credentials configured).");
  });

  it("passes a Telegram adapter to the monitor when credentials are configured", async () => {
    const start = vi.fn().mockReturnValue({ stop: vi.fn() });

    await runMonitorCommand({
      args: [],
      config: config({ telegram: { botToken: "123:abc", chatId: "-100" } }),
      strategy,
      start,
      writeLine: vi.fn(),
      registerShutdown: false,
    });

    expect(
      start.mock.calls[0][0].alertAdapters.map((adapter: { channel: string }) => adapter.channel),
    ).toEqual(["telegram"]);
  });

  it("fails fast when alerts are required but no adapter is configured", async () => {
    await expect(
      runMonitorCommand({
        args: ["--require-alerts"],
        config: config(),
        strategy,
        start: vi.fn(),
        writeLine: vi.fn(),
        registerShutdown: false,
      }),
    ).rejects.toThrow("No alert adapter is configured");
  });
});
