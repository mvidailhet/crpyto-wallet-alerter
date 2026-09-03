import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  initializeSimulationStorage,
  resolveSimulationDatabasePath,
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
      });
    } finally {
      reopenedStorage.close();
    }
  });
});
