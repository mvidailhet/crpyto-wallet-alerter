import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  initializeSimulationStorage,
  resolveSimulationDatabasePath,
  type ManualReplayPairImport,
} from "../storage/simulation-storage.js";

const tempDirs: string[] = [];

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
      firstStorage.saveAlertHistory({
        id: "alert-1",
        tradeSetupId: "setup-1",
        sentAt: new Date("2026-09-01T10:12:00.000Z"),
        channel: "console",
        payload: { message: "Trade setup created" },
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
