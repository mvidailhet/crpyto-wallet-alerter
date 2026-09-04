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
      storage.saveDataSourceFailure({
        adapter: "dex-screener",
        scanner: "live-monitor",
        failedAt: new Date("2026-09-01T09:30:00.000Z"),
        consecutiveFailures: 2,
        nextRetryAt: new Date("2026-09-01T09:34:00.000Z"),
        error: "HTTP 429",
      });
      storage.saveSkippedPairSummary({
        id: "skip-1",
        scanner: "live-monitor",
        pair: "0x00000000000000000000000000000000000000bb",
        scannedAt: new Date("2026-09-01T09:20:00.000Z"),
        reason: "low-liquidity",
        details: { liquidityUsd: 500 },
      });
      storage.saveInterestingWallet({
        wallet: "0x00000000000000000000000000000000000000c1",
        updatedAt: new Date("2026-09-01T09:40:00.000Z"),
        evidence: { historicalRunnerBuys: 1 },
      });
      storage.saveWalletEvidence({
        id: "historical-runner-buy:robinhood:0x00000000000000000000000000000000000000aa:0x00000000000000000000000000000000000000c1",
        wallet: "0x00000000000000000000000000000000000000c1",
        kind: "historical-runner-buy",
        observedAt: new Date("2026-09-01T09:35:00.000Z"),
        source: "historical-replay",
        detail: { pair: "0x00000000000000000000000000000000000000aa", buyCount: 2 },
      });
      storage.saveWalletTag({
        wallet: "0x00000000000000000000000000000000000000d2",
        tag: "ignored",
        notes: "known bot",
        updatedAt: new Date("2026-09-01T09:45:00.000Z"),
      });
      storage.savePairTag({
        pair: "0x00000000000000000000000000000000000000aa",
        tag: "interesting",
        updatedAt: new Date("2026-09-01T09:46:00.000Z"),
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
      expect(html).toContain("Data-source failures");
      expect(html).toContain("Skipped pairs by reason");
      expect(html).toContain("Skipped pair details");
      expect(html).toContain("Interesting wallets");
      expect(html).toContain("Wallet evidence");
      expect(html).toContain("Manual wallet tags");
      expect(html).toContain("Manual pair tags");
      expect(html).toContain("historical-runner-buy");
      expect(html).toContain("Chart markers");
      expect(html).toContain("<svg");
      expect(html).toContain("setup-created");
      expect(html).toContain("fill");
      expect(html).toContain("take-profit");
      expect(html).toContain("momentum-warning");
      expect(html).toContain("ath");
      expect(html).toContain("Stop loss");
      expect(html).toContain("Take profit");
      expect(html).toContain("Moonbag");
      expect(html).toContain("0x00000000000000000000000000000000000000bb");
      expect(html).not.toContain("<td>setup-1</td><td>2026-09-01T13:00:00</td><td>fill</td>");

      const csv = await readFile(report.csvPath, "utf8");
      expect(csv).toContain(
        "strategyVersionId,tradeSetupId,pair,setupCreatedAt,positionId,status,openedAt,entryMarketCapUsd,allocationPercent,stopLossMarketCapUsd,takeProfitMarketCapUsd,closedAt,exitMarketCapUsd,exitReason,realizedPnlMultiple,unrealizedPnlMultiple,maxUpsideMultiple,maxDrawdownPercent,moonbagPercent",
      );
      expect(csv).toContain(
        "baseline-report,setup-1,0x00000000000000000000000000000000000000aa,2026-09-01T12:00:00,position-1,moonbag,2026-09-01T13:00:00,13000000,25,9000000,26000000,2026-09-01T14:00:00,26000000,take-profit,1,0.58,1.58,0,50",
      );
      expect(csv).toContain("scanGaps");
      expect(csv).toContain("scanner,startedAt,endedAt,reason");
      expect(csv).toContain("live-monitor,2026-09-01T11:00:00,2026-09-01T11:15:00,process-restart");
      expect(csv).toContain("dataSourceFailures");
      expect(csv).toContain(
        "adapter,scanner,failedAt,consecutiveFailures,nextRetryAt,recoveredAt,error",
      );
      expect(csv).toContain(
        "dex-screener,live-monitor,2026-09-01T11:30:00,2,2026-09-01T11:34:00,,HTTP 429",
      );
      expect(csv).toContain("skippedPairs");
      expect(csv).toContain("scanner,pair,scannedAt,reason,details");
      expect(csv).toContain(
        'live-monitor,0x00000000000000000000000000000000000000bb,2026-09-01T11:20:00,low-liquidity,"{""liquidityUsd"":500}"',
      );
      expect(csv).toContain("interestingWallets");
      expect(csv).toContain("wallet,chain,updatedAt,evidence");
      expect(csv).toContain(
        '0x00000000000000000000000000000000000000c1,robinhood,2026-09-01T11:40:00,"{""historicalRunnerBuys"":1}"',
      );
      expect(csv).toContain("walletEvidence");
      expect(csv).toContain("wallet,chain,kind,observedAt,source,detail");
      expect(csv).toContain(
        '0x00000000000000000000000000000000000000c1,robinhood,historical-runner-buy,2026-09-01T11:35:00,historical-replay,"{""pair"":""0x00000000000000000000000000000000000000aa"",""buyCount"":2}"',
      );
      expect(csv).toContain("walletTags");
      expect(csv).toContain("wallet,chain,tag,notes,updatedAt");
      expect(csv).toContain(
        "0x00000000000000000000000000000000000000d2,robinhood,ignored,known bot,2026-09-01T11:45:00",
      );
      expect(csv).toContain("pairTags");
      expect(csv).toContain("pair,chain,tag,notes,updatedAt");
      expect(csv).toContain(
        "0x00000000000000000000000000000000000000aa,robinhood,interesting,,2026-09-01T11:46:00",
      );
    } finally {
      storage.close();
    }
  });
});
