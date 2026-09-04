import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  runDexScreenerMonitorOnce,
  startDexScreenerMonitor,
  type DexScreenerPair,
} from "../monitor/dex-screener-monitor.js";
import { initializeSimulationStorage } from "../storage/simulation-storage.js";
import type { StrategyConfig } from "../strategies/configs.js";

const tempDirs: string[] = [];

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
  plannedBuyLevels: [
    { athPullbackPercent: 35, allocationPercent: 25 },
    { athPullbackPercent: 50, allocationPercent: 25 },
    { athPullbackPercent: 65, allocationPercent: 25 },
    { athPullbackPercent: 80, allocationPercent: 25 },
  ],
  maximumActiveTradeSetups: 10,
};

async function createTempDir() {
  const directory = await mkdtemp(join(tmpdir(), "wallet-alerter-monitor-"));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("DEX Screener live monitor", () => {
  it("stores top Robinhood pair snapshots, skipped pair reasons, and resumes without duplicate active setups", async () => {
    const dataDirectory = await createTempDir();
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const capturedAt = new Date("2026-09-04T12:00:00.000Z");
    const seededStorage = initializeSimulationStorage({ databasePath });
    try {
      seededStorage.saveMarketSnapshot({
        pair: "0x0000000000000000000000000000000000000001",
        capturedAt: new Date("2026-09-03T12:00:00.000Z"),
        blockNumber: 100n,
        metrics: {
          marketCapUsd: 20_000_000,
          athMarketCapUsd: 20_000_000,
          athCapturedAt: "2026-09-03T12:00:00.000Z",
          pairAgeHours: 144,
          liquidityUsd: 500_000,
          oneHourVolumeUsd: 200_000,
        },
      });
    } finally {
      seededStorage.close();
    }

    const fetchPairs = vi.fn<() => Promise<DexScreenerPair[]>>().mockResolvedValue([
      pair({
        pairAddress: "0x0000000000000000000000000000000000000001",
        pairCreatedAt: new Date("2026-08-28T12:00:00.000Z").getTime(),
        marketCap: 16_000_000,
        fdv: 16_000_000,
        liquidity: { usd: 500_000 },
        volume: { h1: 600_000 },
      }),
      pair({
        pairAddress: "0x0000000000000000000000000000000000000002",
        pairCreatedAt: new Date("2026-09-04T10:00:00.000Z").getTime(),
        marketCap: 12_000_000,
        fdv: 12_000_000,
        liquidity: { usd: 500_000 },
        volume: { h1: 500_000 },
      }),
      pair({
        pairAddress: "0x0000000000000000000000000000000000000003",
        pairCreatedAt: new Date("2026-08-28T12:00:00.000Z").getTime(),
        marketCap: 14_000_000,
        fdv: 14_000_000,
        liquidity: { usd: 10_000 },
        volume: { h1: 400_000 },
      }),
      pair({
        pairAddress: "0x0000000000000000000000000000000000000004",
        pairCreatedAt: new Date("2026-08-28T12:00:00.000Z").getTime(),
        marketCap: 13_000_000,
        fdv: 13_000_000,
        liquidity: { usd: 500_000 },
        volume: { h1: 10_000 },
      }),
      pair({
        pairAddress: "0x0000000000000000000000000000000000000005",
        pairCreatedAt: new Date("2026-08-28T12:00:00.000Z").getTime(),
        marketCap: undefined,
        fdv: undefined,
        liquidity: { usd: 500_000 },
        volume: { h1: 300_000 },
      }),
    ]);

    expect(
      await runDexScreenerMonitorOnce({
        databasePath,
        strategy,
        fetchPairs,
        capturedAt,
        blockNumber: 123n,
      }),
    ).toMatchObject({
      snapshotsStored: 5,
      skippedPairs: 4,
      simulation: { tradeSetupsCreated: 1 },
    });

    const firstStorage = initializeSimulationStorage({ databasePath });
    try {
      const state = firstStorage.getResumeState();
      expect(state.marketSnapshots.map((snapshot) => snapshot.pair)).toEqual([
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        "0x0000000000000000000000000000000000000003",
        "0x0000000000000000000000000000000000000004",
        "0x0000000000000000000000000000000000000005",
      ]);
      expect(state.skippedPairSummaries.map((summary) => summary.reason).sort()).toEqual([
        "low-liquidity",
        "low-volume",
        "missing-market-cap",
        "too-young",
      ]);
      expect(state.tradeSetups).toHaveLength(1);
      expect(state.tradeSetups[0]?.trigger).toMatchObject({
        athMarketCapUsd: 20_000_000,
      });
    } finally {
      firstStorage.close();
    }

    expect(
      await runDexScreenerMonitorOnce({
        databasePath,
        strategy,
        fetchPairs,
        capturedAt: new Date("2026-09-04T12:15:00.000Z"),
        blockNumber: 124n,
      }),
    ).toMatchObject({
      snapshotsStored: 5,
      skippedPairs: 4,
      simulation: { tradeSetupsCreated: 0, tradeSetupsUpdated: 1 },
    });
  });

  it("runs immediately, survives scan failures, and then scans every configured interval until stopped", async () => {
    vi.useFakeTimers();

    const stop = vi.fn();
    const writeLine = vi.fn();
    const runOnce = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("temporary DEX Screener failure"))
      .mockResolvedValue(undefined);

    const monitor = startDexScreenerMonitor({
      strategy,
      runOnce,
      stop,
      writeLine,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(writeLine).toHaveBeenCalledWith("Monitor scan failed: temporary DEX Screener failure");

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(runOnce).toHaveBeenCalledTimes(2);

    monitor.stop();
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(runOnce).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("persists adapter failures, scan gaps, and adapter backoff without blocking local simulation work", async () => {
    const dataDirectory = await createTempDir();
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const fetchPairs = vi
      .fn<() => Promise<DexScreenerPair[]>>()
      .mockRejectedValueOnce(new Error("DEX Screener rate limit"))
      .mockResolvedValue([
        pair({
          pairAddress: "0x0000000000000000000000000000000000000007",
          volume: { h1: 200_000 },
        }),
      ]);

    await expect(
      runDexScreenerMonitorOnce({
        databasePath,
        strategy,
        fetchPairs,
        capturedAt: new Date("2026-09-04T12:00:00.000Z"),
        blockNumber: 200n,
      }),
    ).resolves.toMatchObject({
      snapshotsStored: 0,
      skippedPairs: 0,
      dataSourceFailures: 1,
      backoffActive: true,
      simulation: { tradeSetupsCreated: 0 },
    });

    await expect(
      runDexScreenerMonitorOnce({
        databasePath,
        strategy,
        fetchPairs,
        capturedAt: new Date("2026-09-04T12:00:30.000Z"),
        blockNumber: 201n,
      }),
    ).resolves.toMatchObject({
      snapshotsStored: 0,
      skippedPairs: 0,
      dataSourceFailures: 0,
      backoffActive: true,
      simulation: { tradeSetupsCreated: 0 },
    });

    expect(fetchPairs).toHaveBeenCalledTimes(1);

    await expect(
      runDexScreenerMonitorOnce({
        databasePath,
        strategy,
        fetchPairs,
        capturedAt: new Date("2026-09-04T12:02:01.000Z"),
        blockNumber: 202n,
      }),
    ).resolves.toMatchObject({
      snapshotsStored: 1,
      dataSourceFailures: 0,
      backoffActive: false,
    });

    const storage = initializeSimulationStorage({ databasePath });
    try {
      const state = storage.getResumeState();
      expect(state.dataSourceFailures).toEqual([
        {
          adapter: "dex-screener",
          scanner: "dex-screener-monitor",
          failedAt: new Date("2026-09-04T12:00:00.000Z"),
          consecutiveFailures: 1,
          nextRetryAt: new Date("2026-09-04T12:02:00.000Z"),
          error: "DEX Screener rate limit",
        },
      ]);
      expect(state.scanGaps).toEqual([
        {
          id: "dex-screener-monitor:dex-screener:2026-09-04T11:45:00.000Z:2026-09-04T12:00:00.000Z:data-source-failure",
          scanner: "dex-screener-monitor",
          startedAt: new Date("2026-09-04T11:45:00.000Z"),
          endedAt: new Date("2026-09-04T12:00:00.000Z"),
          reason: "data-source-failure:dex-screener",
        },
      ]);
      expect(state.scanHealth).toEqual([
        {
          scanner: "dex-screener-monitor",
          lastScannedAt: new Date("2026-09-04T12:02:01.000Z"),
          lastScannedBlock: 202n,
          status: "ok",
        },
      ]);
    } finally {
      storage.close();
    }
  });
});

function pair(overrides: Partial<DexScreenerPair>): DexScreenerPair {
  return {
    chainId: "robinhood",
    dexId: "uniswap",
    url: "https://dexscreener.com/robinhood/test",
    pairAddress: "0x0000000000000000000000000000000000000000",
    baseToken: {
      address: "0x00000000000000000000000000000000000000aa",
      name: "Test Token",
      symbol: "TEST",
    },
    quoteToken: {
      address: "0x00000000000000000000000000000000000000bb",
      name: "Wrapped ETH",
      symbol: "WETH",
    },
    priceUsd: "1",
    fdv: 16_000_000,
    marketCap: 16_000_000,
    pairCreatedAt: new Date("2026-08-28T12:00:00.000Z").getTime(),
    volume: { h1: 150_000 },
    liquidity: { usd: 300_000 },
    ...overrides,
  };
}
