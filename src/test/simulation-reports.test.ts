import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { generateSimulationReports } from "../reports/simulation-reports.js";
import { initializeSimulationStorage } from "../storage/simulation-storage.js";

const tempDirs: string[] = [];

async function createTempDir() {
  const directory = await mkdtemp(join(tmpdir(), "wallet-alerter-reports-"));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("simulation reports", () => {
  it("writes timestamped HTML and CSV reports for stored simulation results", async () => {
    const dataDirectory = await createTempDir();
    const reportsDirectory = join(dataDirectory, "reports");
    const storage = initializeSimulationStorage({
      databasePath: join(dataDirectory, "simulation.sqlite"),
    });

    try {
      storage.saveStrategyVersion({
        id: "baseline-report",
        name: "Baseline Report",
        createdAt: new Date("2026-09-01T08:00:00.000Z"),
        parameters: { takeProfitMultiple: 2 },
      });
      storage.saveMarketSnapshot({
        pair: "0x00000000000000000000000000000000000000aa",
        capturedAt: new Date("2026-09-01T10:00:00.000Z"),
        blockNumber: 100n,
        metrics: {
          marketCapUsd: 16_000_000,
          athMarketCapUsd: 20_000_000,
          lowMarketCapUsd: 15_000_000,
          highMarketCapUsd: 20_500_000,
          momentumWarning: true,
        },
      });
      storage.saveTradeSetup({
        id: "setup-1",
        strategyVersionId: "baseline-report",
        pair: "0x00000000000000000000000000000000000000aa",
        createdAt: new Date("2026-09-01T10:00:00.000Z"),
        plannedBuyLevels: [{ marketCapUsd: 13_000_000, allocationPercent: 25 }],
        trigger: { kind: "stored-market-snapshot", marketCapUsd: 16_000_000 },
      });
      storage.saveSimulatedPosition({
        id: "position-1",
        tradeSetupId: "setup-1",
        strategyVersionId: "baseline-report",
        openedAt: new Date("2026-09-01T11:00:00.000Z"),
        entry: {
          marketCapUsd: 13_000_000,
          allocationPercent: 25,
          stopLossMarketCapUsd: 9_000_000,
          takeProfitMarketCapUsd: 26_000_000,
          closedAt: "2026-09-01T12:00:00.000Z",
          exitMarketCapUsd: 26_000_000,
          exitReason: "take-profit",
          moonbagPercent: 50,
        },
        status: "moonbag",
      });
      storage.saveScanGap({
        id: "gap-1",
        scanner: "live-monitor",
        startedAt: new Date("2026-09-01T09:00:00.000Z"),
        endedAt: new Date("2026-09-01T09:15:00.000Z"),
        reason: "process-restart",
      });
      storage.saveSkippedPairSummary({
        id: "skip-1",
        scanner: "live-monitor",
        pair: "0x00000000000000000000000000000000000000bb",
        scannedAt: new Date("2026-09-01T09:20:00.000Z"),
        reason: "low-liquidity",
        details: { liquidityUsd: 500 },
      });

      await mkdir(reportsDirectory);
      const report = await generateSimulationReports(storage.getResumeState(), {
        reportsDirectory,
        generatedAt: new Date("2026-09-01T13:30:00.000Z"),
      });

      expect(report.htmlPath).toBe(join(reportsDirectory, "simulation-20260901-153000.html"));
      expect(report.csvPath).toBe(join(reportsDirectory, "simulation-20260901-153000.csv"));
      expect(await readdir(reportsDirectory)).toEqual([
        "simulation-20260901-153000.csv",
        "simulation-20260901-153000.html",
      ]);

      const html = await readFile(report.htmlPath, "utf8");
      expect(html).toContain("Simulation Summary");
      expect(html).toContain("Trade setups");
      expect(html).toContain("Simulated positions");
      expect(html).toContain("Scan gaps");
      expect(html).toContain("Skipped pairs by reason");
      expect(html).toContain("Chart markers");
      expect(html).toContain("setup-created");
      expect(html).toContain("fill");
      expect(html).toContain("take-profit");
      expect(html).toContain("momentum-warning");
      expect(html).toContain("ath");

      const csv = await readFile(report.csvPath, "utf8");
      expect(csv).toContain(
        "strategyVersionId,tradeSetupId,pair,setupCreatedAt,positionId,status,openedAt,entryMarketCapUsd,allocationPercent,stopLossMarketCapUsd,takeProfitMarketCapUsd,closedAt,exitMarketCapUsd,exitReason,realizedPnlMultiple,unrealizedPnlMultiple,maxUpsideMultiple,maxDrawdownPercent,moonbagPercent",
      );
      expect(csv).toContain(
        "baseline-report,setup-1,0x00000000000000000000000000000000000000aa,2026-09-01T12:00:00,position-1,moonbag,2026-09-01T13:00:00,13000000,25,9000000,26000000,2026-09-01T14:00:00,26000000,take-profit,1,0.58,1.58,0,50",
      );
    } finally {
      storage.close();
    }
  });
});
