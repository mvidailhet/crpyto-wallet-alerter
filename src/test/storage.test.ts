import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  initializeSimulationStorage,
  resolveSimulationDatabasePath,
  type ManualReplayPairImport,
} from "../storage/simulation-storage.js";
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
  const directory = await mkdtemp(join(tmpdir(), "wallet-alerter-storage-"));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("simulation storage initialization", () => {
  it("uses data/simulation.sqlite by default and accepts a Windows-friendly configured path", async () => {
    const dataDirectory = await createTempDir();
    const configuredPath = join(dataDirectory, "configured", "state.sqlite");

    expect(resolveSimulationDatabasePath({ dataDirectory })).toBe(
      join(dataDirectory, "simulation.sqlite"),
    );
    expect(resolveSimulationDatabasePath({ databasePath: configuredPath, dataDirectory })).toBe(
      configuredPath,
    );

    const storage = initializeSimulationStorage({ databasePath: configuredPath });

    try {
      expect(storage.databasePath).toBe(configuredPath);
      expect(storage.listTables()).toEqual([
        "alert_history",
        "data_source_failures",
        "interesting_wallets",
        "manual_replay_pairs",
        "market_snapshots",
        "scan_gaps",
        "scan_health",
        "simulated_positions",
        "skipped_pair_summaries",
        "strategy_versions",
        "trade_setups",
      ]);
    } finally {
      storage.close();
    }
  });

  it("creates trade setups from stored snapshots and applies conservative simulated fills", async () => {
    const dataDirectory = await createTempDir();
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const storage = initializeSimulationStorage({ databasePath });

    try {
      storage.saveMarketSnapshot({
        pair: "0x00000000000000000000000000000000000000aa",
        capturedAt: new Date("2026-09-01T10:00:00.000Z"),
        blockNumber: 100n,
        metrics: {
          marketCapUsd: 16_000_000,
          athMarketCapUsd: 20_000_000,
          athCapturedAt: "2026-08-31T10:00:00.000Z",
          pairAgeHours: 120,
          liquidityUsd: 300_000,
          oneHourVolumeUsd: 150_000,
        },
      });
      storage.saveMarketSnapshot({
        pair: "0x00000000000000000000000000000000000000aa",
        capturedAt: new Date("2026-09-01T11:00:00.000Z"),
        blockNumber: 101n,
        metrics: { marketCapUsd: 10_000_000 },
      });
      storage.saveMarketSnapshot({
        pair: "0x00000000000000000000000000000000000000aa",
        capturedAt: new Date("2026-09-01T12:00:00.000Z"),
        blockNumber: 102n,
        metrics: { lowMarketCapUsd: 6_000_000, highMarketCapUsd: 21_000_000 },
      });

      expect(storage.simulateTradeSetups(strategy)).toEqual({
        tradeSetupsCreated: 1,
        tradeSetupsUpdated: 0,
        positionsOpened: 3,
        positionsClosed: 2,
      });
      expect(storage.simulateTradeSetups(strategy)).toEqual({
        tradeSetupsCreated: 0,
        tradeSetupsUpdated: 1,
        positionsOpened: 0,
        positionsClosed: 0,
      });

      const state = storage.getResumeState();
      expect(state.tradeSetups).toHaveLength(1);
      expect(state.tradeSetups[0]).toMatchObject({
        id: "baseline-test:0x00000000000000000000000000000000000000aa",
        strategyVersionId: "baseline-test",
        pair: "0x00000000000000000000000000000000000000aa",
        createdAt: new Date("2026-09-01T10:00:00.000Z"),
        plannedBuyLevels: [
          { marketCapUsd: 13_000_000, athPullbackPercent: 35, allocationPercent: 25 },
          { marketCapUsd: 10_000_000, athPullbackPercent: 50, allocationPercent: 25 },
          { marketCapUsd: 7_000_000, athPullbackPercent: 65, allocationPercent: 25 },
          { marketCapUsd: 4_000_000, athPullbackPercent: 80, allocationPercent: 25 },
        ],
      });
      expect(state.simulatedPositions).toEqual([
        {
          id: "baseline-test:0x00000000000000000000000000000000000000aa:10000000",
          tradeSetupId: "baseline-test:0x00000000000000000000000000000000000000aa",
          strategyVersionId: "baseline-test",
          openedAt: new Date("2026-09-01T11:00:00.000Z"),
          entry: {
            marketCapUsd: 10_000_000,
            allocationPercent: 25,
            stopLossMarketCapUsd: 7_000_000,
            takeProfitMarketCapUsd: 20_000_000,
            closedAt: "2026-09-01T12:00:00.000Z",
            exitMarketCapUsd: 7_000_000,
            exitReason: "stop-loss",
            moonbagPercent: 0,
          },
          status: "closed",
        },
        {
          id: "baseline-test:0x00000000000000000000000000000000000000aa:13000000",
          tradeSetupId: "baseline-test:0x00000000000000000000000000000000000000aa",
          strategyVersionId: "baseline-test",
          openedAt: new Date("2026-09-01T11:00:00.000Z"),
          entry: {
            marketCapUsd: 13_000_000,
            allocationPercent: 25,
            stopLossMarketCapUsd: 9_000_000,
            takeProfitMarketCapUsd: 26_000_000,
            closedAt: "2026-09-01T12:00:00.000Z",
            exitMarketCapUsd: 9_000_000,
            exitReason: "stop-loss",
            moonbagPercent: 0,
          },
          status: "closed",
        },
        {
          id: "baseline-test:0x00000000000000000000000000000000000000aa:7000000",
          tradeSetupId: "baseline-test:0x00000000000000000000000000000000000000aa",
          strategyVersionId: "baseline-test",
          openedAt: new Date("2026-09-01T12:00:00.000Z"),
          entry: {
            marketCapUsd: 7_000_000,
            allocationPercent: 25,
            stopLossMarketCapUsd: 5_000_000,
            takeProfitMarketCapUsd: 14_000_000,
            moonbagPercent: 0,
          },
          status: "open",
        },
      ]);
    } finally {
      storage.close();
    }
  });

  it("marks take-profit fills as moonbags when the stop loss was not reached first", async () => {
    const dataDirectory = await createTempDir();
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const storage = initializeSimulationStorage({ databasePath });

    try {
      storage.saveMarketSnapshot({
        pair: "0x00000000000000000000000000000000000000bb",
        capturedAt: new Date("2026-09-02T10:00:00.000Z"),
        blockNumber: 200n,
        metrics: {
          marketCapUsd: 14_000_000,
          athMarketCapUsd: 20_000_000,
          athCapturedAt: "2026-09-01T10:00:00.000Z",
          pairAgeHours: 120,
          liquidityUsd: 300_000,
          oneHourVolumeUsd: 150_000,
        },
      });
      storage.saveMarketSnapshot({
        pair: "0x00000000000000000000000000000000000000bb",
        capturedAt: new Date("2026-09-02T11:00:00.000Z"),
        blockNumber: 201n,
        metrics: { lowMarketCapUsd: 13_000_000, highMarketCapUsd: 13_500_000 },
      });
      storage.saveMarketSnapshot({
        pair: "0x00000000000000000000000000000000000000bb",
        capturedAt: new Date("2026-09-02T12:00:00.000Z"),
        blockNumber: 202n,
        metrics: { lowMarketCapUsd: 12_000_000, highMarketCapUsd: 27_000_000 },
      });

      expect(storage.simulateTradeSetups(strategy)).toMatchObject({
        tradeSetupsCreated: 1,
        positionsOpened: 1,
        positionsClosed: 1,
      });
      expect(storage.getResumeState().simulatedPositions).toEqual([
        {
          id: "baseline-test:0x00000000000000000000000000000000000000bb:13000000",
          tradeSetupId: "baseline-test:0x00000000000000000000000000000000000000bb",
          strategyVersionId: "baseline-test",
          openedAt: new Date("2026-09-02T11:00:00.000Z"),
          entry: {
            marketCapUsd: 13_000_000,
            allocationPercent: 25,
            stopLossMarketCapUsd: 9_000_000,
            takeProfitMarketCapUsd: 26_000_000,
            closedAt: "2026-09-02T12:00:00.000Z",
            exitMarketCapUsd: 26_000_000,
            exitReason: "take-profit",
            moonbagPercent: 50,
          },
          status: "moonbag",
        },
      ]);
    } finally {
      storage.close();
    }
  });

  it("updates open simulated positions when later snapshots reach an exit", async () => {
    const dataDirectory = await createTempDir();
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const storage = initializeSimulationStorage({ databasePath });

    try {
      storage.saveMarketSnapshot({
        pair: "0x00000000000000000000000000000000000000cc",
        capturedAt: new Date("2026-09-03T10:00:00.000Z"),
        blockNumber: 300n,
        metrics: {
          marketCapUsd: 14_000_000,
          athMarketCapUsd: 20_000_000,
          athCapturedAt: "2026-09-02T10:00:00.000Z",
          pairAgeHours: 120,
          liquidityUsd: 300_000,
          oneHourVolumeUsd: 150_000,
        },
      });
      storage.saveMarketSnapshot({
        pair: "0x00000000000000000000000000000000000000cc",
        capturedAt: new Date("2026-09-03T11:00:00.000Z"),
        blockNumber: 301n,
        metrics: { marketCapUsd: 13_000_000 },
      });

      expect(storage.simulateTradeSetups(strategy)).toMatchObject({
        positionsOpened: 1,
        positionsClosed: 0,
      });

      storage.saveMarketSnapshot({
        pair: "0x00000000000000000000000000000000000000cc",
        capturedAt: new Date("2026-09-03T12:00:00.000Z"),
        blockNumber: 302n,
        metrics: { marketCapUsd: 8_000_000 },
      });

      expect(storage.simulateTradeSetups(strategy)).toMatchObject({
        tradeSetupsCreated: 0,
        tradeSetupsUpdated: 1,
        positionsOpened: 1,
        positionsClosed: 1,
      });
      expect(storage.getResumeState().simulatedPositions[0]).toMatchObject({
        status: "closed",
        entry: {
          marketCapUsd: 13_000_000,
          closedAt: "2026-09-03T12:00:00.000Z",
          exitMarketCapUsd: 9_000_000,
          exitReason: "stop-loss",
        },
      });
    } finally {
      storage.close();
    }
  });

  it("keeps only the highest-volume active trade setups allowed by the strategy version", async () => {
    const dataDirectory = await createTempDir();
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const storage = initializeSimulationStorage({ databasePath });
    const cappedStrategy = { ...strategy, maximumActiveTradeSetups: 2 };

    try {
      for (const [index, oneHourVolumeUsd] of [120_000, 300_000, 200_000].entries()) {
        storage.saveMarketSnapshot({
          pair: `0x00000000000000000000000000000000000000d${index}`,
          capturedAt: new Date(`2026-09-04T1${index}:00:00.000Z`),
          blockNumber: BigInt(400 + index),
          metrics: {
            marketCapUsd: 14_000_000,
            athMarketCapUsd: 20_000_000,
            athCapturedAt: "2026-09-03T10:00:00.000Z",
            pairAgeHours: 120,
            liquidityUsd: 300_000,
            oneHourVolumeUsd,
          },
        });
      }

      expect(storage.simulateTradeSetups(cappedStrategy)).toMatchObject({
        tradeSetupsCreated: 2,
      });
      expect(storage.getResumeState().tradeSetups.map((setup) => setup.pair)).toEqual([
        "0x00000000000000000000000000000000000000d1",
        "0x00000000000000000000000000000000000000d2",
      ]);
    } finally {
      storage.close();
    }
  });

  it("does not overwrite an existing stored strategy version during duplicate scans", async () => {
    const dataDirectory = await createTempDir();
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const storage = initializeSimulationStorage({ databasePath });

    try {
      storage.saveMarketSnapshot({
        pair: "0x00000000000000000000000000000000000000ee",
        capturedAt: new Date("2026-09-05T10:00:00.000Z"),
        blockNumber: 500n,
        metrics: {
          marketCapUsd: 14_000_000,
          athMarketCapUsd: 20_000_000,
          athCapturedAt: "2026-09-04T10:00:00.000Z",
          pairAgeHours: 120,
          liquidityUsd: 300_000,
          oneHourVolumeUsd: 150_000,
        },
      });

      storage.simulateTradeSetups(strategy);
      storage.simulateTradeSetups({ ...strategy, minimumLiquidityUsd: 1 });

      expect(storage.getResumeState().strategyVersions).toEqual([
        expect.objectContaining({
          id: "baseline-test",
          parameters: expect.objectContaining({ minimumLiquidityUsd: 250_000 }),
        }),
      ]);
    } finally {
      storage.close();
    }
  });

  it("preserves resumable simulation state after reopening the database", async () => {
    const dataDirectory = await createTempDir();
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const firstStorage = initializeSimulationStorage({ databasePath });

    try {
      firstStorage.saveStrategyVersion({
        id: "strategy-v1",
        name: "Robinhood v1",
        createdAt: new Date("2026-09-01T10:00:00.000Z"),
        parameters: { plannedBuyLevelUsd: 100_000 },
      });
      firstStorage.saveScanHealth({
        scanner: "live-monitor",
        lastScannedAt: new Date("2026-09-01T10:01:00.000Z"),
        lastScannedBlock: 123n,
        status: "healthy",
      });
      firstStorage.saveMarketSnapshot({
        pair: "0x00000000000000000000000000000000000000aa",
        capturedAt: new Date("2026-09-01T10:02:00.000Z"),
        blockNumber: 124n,
        metrics: { marketCapUsd: 125_000, liquidityUsd: 80_000 },
      });
      firstStorage.saveInterestingWallet({
        wallet: "0x00000000000000000000000000000000000000b0",
        updatedAt: new Date("2026-09-01T10:02:30.000Z"),
        evidence: { profitableSetups: 2 },
      });
      firstStorage.saveTradeSetup({
        id: "setup-1",
        strategyVersionId: "strategy-v1",
        pair: "0x00000000000000000000000000000000000000aa",
        createdAt: new Date("2026-09-01T10:03:00.000Z"),
        plannedBuyLevels: [{ marketCapUsd: 100_000 }],
        trigger: { kind: "wallet-buy", wallet: "0x00000000000000000000000000000000000000b0" },
      });
      firstStorage.saveSimulatedPosition({
        id: "position-1",
        tradeSetupId: "setup-1",
        strategyVersionId: "strategy-v1",
        openedAt: new Date("2026-09-01T10:04:00.000Z"),
        entry: { marketCapUsd: 100_000 },
        status: "open",
      });
      firstStorage.saveScanGap({
        id: "gap-1",
        scanner: "live-monitor",
        startedAt: new Date("2026-09-01T10:05:00.000Z"),
        endedAt: new Date("2026-09-01T10:10:00.000Z"),
        reason: "process-restart",
      });
      firstStorage.saveSkippedPairSummary({
        id: "skip-1",
        scanner: "live-monitor",
        pair: "0x00000000000000000000000000000000000000bb",
        scannedAt: new Date("2026-09-01T10:11:00.000Z"),
        reason: "low-liquidity",
        details: { liquidityUsd: 500 },
      });
      expect(
        firstStorage.saveAlertHistory({
          id: "alert-1",
          tradeSetupId: "setup-1",
          sentAt: new Date("2026-09-01T10:12:00.000Z"),
          channel: "console",
          payload: { message: "Trade setup created" },
        }),
      ).toBe(true);
      expect(
        firstStorage.saveAlertHistory({
          id: "alert-1",
          tradeSetupId: "setup-1",
          sentAt: new Date("2026-09-01T10:13:00.000Z"),
          channel: "console",
          payload: { message: "Duplicate trade setup created" },
        }),
      ).toBe(false);
      firstStorage.saveDataSourceFailure({
        adapter: "dex-screener",
        scanner: "live-monitor",
        failedAt: new Date("2026-09-01T10:14:00.000Z"),
        consecutiveFailures: 2,
        nextRetryAt: new Date("2026-09-01T10:18:00.000Z"),
        error: "rate limited",
      });
      firstStorage.saveDataSourceFailure({
        adapter: "dex-screener",
        scanner: "live-monitor",
        failedAt: new Date("2026-09-01T10:15:00.000Z"),
        consecutiveFailures: 3,
        nextRetryAt: new Date("2026-09-01T10:23:00.000Z"),
        error: "still rate limited",
      });
    } finally {
      firstStorage.close();
    }

    const reopenedStorage = initializeSimulationStorage({ databasePath });

    try {
      expect(reopenedStorage.getResumeState()).toEqual({
        strategyVersions: [
          {
            id: "strategy-v1",
            name: "Robinhood v1",
            createdAt: new Date("2026-09-01T10:00:00.000Z"),
            parameters: { plannedBuyLevelUsd: 100_000 },
          },
        ],
        scanHealth: [
          {
            scanner: "live-monitor",
            lastScannedAt: new Date("2026-09-01T10:01:00.000Z"),
            lastScannedBlock: 123n,
            status: "healthy",
          },
        ],
        dataSourceFailures: [
          {
            adapter: "dex-screener",
            scanner: "live-monitor",
            failedAt: new Date("2026-09-01T10:15:00.000Z"),
            consecutiveFailures: 3,
            nextRetryAt: new Date("2026-09-01T10:23:00.000Z"),
            error: "still rate limited",
          },
        ],
        marketSnapshots: [
          {
            pair: "0x00000000000000000000000000000000000000aa",
            capturedAt: new Date("2026-09-01T10:02:00.000Z"),
            blockNumber: 124n,
            metrics: { marketCapUsd: 125_000, liquidityUsd: 80_000 },
          },
        ],
        interestingWallets: [
          {
            wallet: "0x00000000000000000000000000000000000000b0",
            updatedAt: new Date("2026-09-01T10:02:30.000Z"),
            evidence: { profitableSetups: 2 },
          },
        ],
        tradeSetups: [
          {
            id: "setup-1",
            strategyVersionId: "strategy-v1",
            pair: "0x00000000000000000000000000000000000000aa",
            createdAt: new Date("2026-09-01T10:03:00.000Z"),
            plannedBuyLevels: [{ marketCapUsd: 100_000 }],
            trigger: { kind: "wallet-buy", wallet: "0x00000000000000000000000000000000000000b0" },
          },
        ],
        simulatedPositions: [
          {
            id: "position-1",
            tradeSetupId: "setup-1",
            strategyVersionId: "strategy-v1",
            openedAt: new Date("2026-09-01T10:04:00.000Z"),
            entry: { marketCapUsd: 100_000 },
            status: "open",
          },
        ],
        scanGaps: [
          {
            id: "gap-1",
            scanner: "live-monitor",
            startedAt: new Date("2026-09-01T10:05:00.000Z"),
            endedAt: new Date("2026-09-01T10:10:00.000Z"),
            reason: "process-restart",
          },
        ],
        skippedPairSummaries: [
          {
            id: "skip-1",
            scanner: "live-monitor",
            pair: "0x00000000000000000000000000000000000000bb",
            scannedAt: new Date("2026-09-01T10:11:00.000Z"),
            reason: "low-liquidity",
            details: { liquidityUsd: 500 },
          },
        ],
        alertHistory: [
          {
            id: "alert-1",
            tradeSetupId: "setup-1",
            sentAt: new Date("2026-09-01T10:12:00.000Z"),
            channel: "console",
            payload: { message: "Trade setup created" },
          },
        ],
      });
    } finally {
      reopenedStorage.close();
    }
  });

  it("imports validated manual replay pairs and updates duplicate rows predictably", async () => {
    const dataDirectory = await createTempDir();
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const storage = initializeSimulationStorage({ databasePath });

    const initialRows: ManualReplayPairImport[] = [
      {
        tokenAddress: "0x00000000000000000000000000000000000000aa",
        pairAddress: "0x00000000000000000000000000000000000000bb",
        symbol: "RUN",
        label: "runner",
        notes: "initial runner note",
        ranAt: new Date("2026-08-15T12:00:00.000Z"),
      },
      {
        tokenAddress: "0x00000000000000000000000000000000000000cc",
        symbol: "FAIL",
        label: "failed",
        ranAt: new Date("2026-08-16T12:00:00.000Z"),
      },
    ];

    try {
      expect(storage.importManualReplayPairs(initialRows)).toEqual({ inserted: 2, updated: 0 });
      expect(
        storage.importManualReplayPairs([
          {
            tokenAddress: "0x00000000000000000000000000000000000000AA",
            pairAddress: "0x00000000000000000000000000000000000000BB",
            symbol: "RUN2",
            label: "unknown",
            notes: "corrected note",
            ranAt: new Date("2026-08-17T12:00:00.000Z"),
          },
        ]),
      ).toEqual({ inserted: 0, updated: 1 });

      expect(storage.listManualReplayPairs()).toEqual([
        {
          tokenAddress: "0x00000000000000000000000000000000000000cc",
          pairAddress: undefined,
          symbol: "FAIL",
          label: "failed",
          notes: undefined,
          ranAt: new Date("2026-08-16T12:00:00.000Z"),
        },
        {
          tokenAddress: "0x00000000000000000000000000000000000000AA",
          pairAddress: "0x00000000000000000000000000000000000000bb",
          symbol: "RUN2",
          label: "unknown",
          notes: "corrected note",
          ranAt: new Date("2026-08-17T12:00:00.000Z"),
        },
      ]);
    } finally {
      storage.close();
    }
  });
});
