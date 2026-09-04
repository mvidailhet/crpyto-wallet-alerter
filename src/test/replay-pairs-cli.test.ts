import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";
import { getAddress } from "viem";

import { runReplayPairsCommand } from "../cli/replay-pairs.js";
import { initializeSimulationStorage } from "../storage/simulation-storage.js";
import type { MarketSnapshotRecord } from "../storage/simulation-storage.js";
import type { DecodedV3Swap } from "../types/evm.js";

const tempDirs: string[] = [];

async function createTempDir() {
  const directory = await mkdtemp(join(tmpdir(), "wallet-alerter-replay-pairs-"));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("replay pairs command", () => {
  it("imports manual replay pairs from CSV and lists them", async () => {
    const dataDirectory = await createTempDir();
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const csvPath = join(dataDirectory, "pairs.csv");
    const output: string[] = [];

    await writeFile(
      csvPath,
      [
        "tokenAddress,pairAddress,symbol,label,notes,ranAt",
        '0x00000000000000000000000000000000000000aa,0x00000000000000000000000000000000000000bb,RUN,runner,"ran from 100k",2026-08-15T12:00:00.000Z',
        "0x00000000000000000000000000000000000000cc,,FAIL,failed,,2026-08-16T12:00:00.000Z",
      ].join("\n"),
      "utf8",
    );

    await runReplayPairsCommand(["import", "--csv", csvPath], {
      databasePath,
      writeLine: (line) => output.push(line),
    });
    await runReplayPairsCommand(["list"], {
      databasePath,
      writeLine: (line) => output.push(line),
    });

    expect(output).toEqual([
      "Imported 2 manual replay pair(s): 2 inserted, 0 updated.",
      "tokenAddress,pairAddress,symbol,label,notes,ranAt",
      "0x00000000000000000000000000000000000000AA,0x00000000000000000000000000000000000000bb,RUN,runner,ran from 100k,2026-08-15T14:00:00",
      "0x00000000000000000000000000000000000000cc,,FAIL,failed,,2026-08-16T14:00:00",
    ]);
  });

  it("rejects invalid labels before persisting any imported rows", async () => {
    const dataDirectory = await createTempDir();
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const csvPath = join(dataDirectory, "pairs.csv");
    const output: string[] = [];

    await writeFile(
      csvPath,
      [
        "tokenAddress,pairAddress,symbol,label,notes,ranAt",
        "0x00000000000000000000000000000000000000aa,,RUN,runner,,2026-08-15T12:00:00.000Z",
        "0x00000000000000000000000000000000000000cc,,FAIL,winner,,2026-08-16T12:00:00.000Z",
      ].join("\n"),
      "utf8",
    );

    await expect(
      runReplayPairsCommand(["import", "--csv", csvPath], {
        databasePath,
        writeLine: (line) => output.push(line),
      }),
    ).rejects.toThrow('Row 3 has unsupported label "winner"');

    await runReplayPairsCommand(["list"], {
      databasePath,
      writeLine: (line) => output.push(line),
    });

    expect(output).toEqual(["tokenAddress,pairAddress,symbol,label,notes,ranAt"]);
  });

  it("rejects rows without a symbol before persisting any imported rows", async () => {
    const dataDirectory = await createTempDir();
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const csvPath = join(dataDirectory, "pairs.csv");
    const output: string[] = [];

    await writeFile(
      csvPath,
      [
        "tokenAddress,pairAddress,symbol,label,notes,ranAt",
        "0x00000000000000000000000000000000000000aa,,RUN,runner,,2026-08-15T12:00:00.000Z",
        "0x00000000000000000000000000000000000000cc,,,failed,,2026-08-16T12:00:00.000Z",
      ].join("\n"),
      "utf8",
    );

    await expect(
      runReplayPairsCommand(["import", "--csv", csvPath], {
        databasePath,
        writeLine: (line) => output.push(line),
      }),
    ).rejects.toThrow("Row 3 is missing symbol");

    await runReplayPairsCommand(["list"], {
      databasePath,
      writeLine: (line) => output.push(line),
    });

    expect(output).toEqual(["tokenAddress,pairAddress,symbol,label,notes,ranAt"]);
  });

  it("generates timestamped simulation reports", async () => {
    const dataDirectory = await createTempDir();
    const reportsDirectory = join(dataDirectory, "reports");
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const output: string[] = [];
    const storage = initializeSimulationStorage({ databasePath });

    try {
      storage.saveTradeSetup({
        id: "setup-1",
        strategyVersionId: "baseline-cli",
        pair: "0x00000000000000000000000000000000000000aa",
        createdAt: new Date("2026-09-01T10:00:00.000Z"),
        plannedBuyLevels: [{ marketCapUsd: 13_000_000, allocationPercent: 25 }],
        trigger: { kind: "stored-market-snapshot" },
      });
    } finally {
      storage.close();
    }

    await runReplayPairsCommand(["report"], {
      databasePath,
      reportsDirectory,
      generatedAt: new Date("2026-09-01T13:30:00.000Z"),
      writeLine: (line) => output.push(line),
    });

    expect(await readdir(reportsDirectory)).toEqual([
      "simulation-20260901-153000.csv",
      "simulation-20260901-153000.html",
    ]);
    expect(output).toEqual([
      `Wrote simulation reports: ${join(reportsDirectory, "simulation-20260901-153000.html")} and ${join(reportsDirectory, "simulation-20260901-153000.csv")}.`,
    ]);
  });

  it("runs named strategy versions against reconstructed snapshots and reports labeled outcomes", async () => {
    const dataDirectory = await createTempDir();
    const reportsDirectory = join(dataDirectory, "reports");
    const configDirectory = join(dataDirectory, "strategies");
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const csvPath = join(dataDirectory, "pairs.csv");
    const output: string[] = [];
    const strategyConfig = {
      version: "test-replay",
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

    await mkdir(configDirectory, { recursive: true });
    await writeFile(
      join(configDirectory, "test-replay.json"),
      JSON.stringify(strategyConfig),
      "utf8",
    );
    await writeFile(
      csvPath,
      [
        "tokenAddress,pairAddress,symbol,label,notes,ranAt",
        "0x0000000000000000000000000000000000000001,0x00000000000000000000000000000000000000aa,STOP,runner,,2026-09-01T12:00:00.000Z",
        "0x0000000000000000000000000000000000000002,0x00000000000000000000000000000000000000bb,MOON,runner,,2026-09-01T12:00:00.000Z",
        "0x0000000000000000000000000000000000000003,0x00000000000000000000000000000000000000cc,MISS,failed,,2026-09-01T12:00:00.000Z",
      ].join("\n"),
      "utf8",
    );

    await runReplayPairsCommand(["import", "--csv", csvPath], {
      databasePath,
      writeLine: (line) => output.push(line),
    });
    const storage = initializeSimulationStorage({ databasePath });
    try {
      saveReplayMarket(storage, "0x00000000000000000000000000000000000000aa", [
        { at: "2026-09-01T12:00:00.000Z", marketCapUsd: 16_000_000 },
        { at: "2026-09-01T13:00:00.000Z", marketCapUsd: 13_000_000 },
        {
          at: "2026-09-01T14:00:00.000Z",
          lowMarketCapUsd: 8_000_000,
          highMarketCapUsd: 14_000_000,
        },
      ]);
      saveReplayMarket(storage, "0x00000000000000000000000000000000000000bb", [
        { at: "2026-09-01T12:00:00.000Z", marketCapUsd: 16_000_000 },
        { at: "2026-09-01T13:00:00.000Z", marketCapUsd: 13_000_000 },
        {
          at: "2026-09-01T14:00:00.000Z",
          lowMarketCapUsd: 12_000_000,
          highMarketCapUsd: 27_000_000,
        },
      ]);
      saveReplayMarket(storage, "0x00000000000000000000000000000000000000cc", [
        { at: "2026-09-01T12:00:00.000Z", marketCapUsd: 5_000_000 },
      ]);
    } finally {
      storage.close();
    }

    await runReplayPairsCommand(["run", "--strategy", "test-replay"], {
      databasePath,
      reportsDirectory,
      configDirectory,
      generatedAt: new Date("2026-09-01T15:00:00.000Z"),
      writeLine: (line) => output.push(line),
    });

    expect(output).toContain(
      "Ran 1 strategy version(s): 2 triggered, 2 filled, 1 stopped, 1 take-profit hit, 1 moonbag, 1 missed.",
    );
    expect(await readdir(reportsDirectory)).toEqual([
      "simulation-20260901-170000.csv",
      "simulation-20260901-170000.html",
    ]);
    const csv = await readFile(join(reportsDirectory, "simulation-20260901-170000.csv"), "utf8");
    expect(csv).toContain("replayAnalysis");
    expect(csv).toContain("strategyVersionId,pair,symbol,label,outcome");
    expect(csv).toContain(
      "test-replay,0x00000000000000000000000000000000000000AA,STOP,runner,stopped",
    );
    expect(csv).toContain(
      "test-replay,0x00000000000000000000000000000000000000bb,MOON,runner,moonbag",
    );
    expect(csv).toContain(
      "test-replay,0x00000000000000000000000000000000000000cc,MISS,failed,missed",
    );
  });

  it("reconstructs imported pair snapshots and resumes from stored replay progress", async () => {
    const dataDirectory = await createTempDir();
    const databasePath = join(dataDirectory, "simulation.sqlite");
    const csvPath = join(dataDirectory, "pairs.csv");
    const output: string[] = [];
    const fetchedRanges: Array<{ pools: string[]; fromBlock: bigint; toBlock: bigint }> = [];

    await writeFile(
      csvPath,
      [
        "tokenAddress,pairAddress,symbol,label,notes,ranAt",
        "0x0000000000000000000000000000000000000001,0x00000000000000000000000000000000000000aa,RUN,runner,,2026-09-01T12:00:00.000Z",
        "0x0000000000000000000000000000000000000003,,NOPAIR,unknown,,2026-09-01T12:00:00.000Z",
      ].join("\n"),
      "utf8",
    );

    await runReplayPairsCommand(["import", "--csv", csvPath], {
      databasePath,
      writeLine: (line) => output.push(line),
    });
    await runReplayPairsCommand(
      [
        "reconstruct",
        "--from-block",
        "10",
        "--to-block",
        "14",
        "--resolution-minutes",
        "15",
        "--chunk-size",
        "2",
        "--quote-token",
        "0x0000000000000000000000000000000000000002",
        "--quote-price-usd",
        "2",
      ],
      {
        databasePath,
        writeLine: (line) => output.push(line),
        fetchReplaySwaps: async ({ pools, fromBlock, toBlock }) => {
          fetchedRanges.push({ pools: pools.map((pool) => pool.pool), fromBlock, toBlock });
          if (fromBlock === 10n) {
            return [
              replaySwap({ blockNumber: 10n, timestamp: "2026-09-01T12:01:00.000Z" }),
              replaySwap({ blockNumber: 11n, timestamp: "2026-09-01T12:14:00.000Z" }),
            ];
          }
          return [];
        },
      },
    );
    await runReplayPairsCommand(
      [
        "reconstruct",
        "--from-block",
        "10",
        "--to-block",
        "14",
        "--resolution-minutes",
        "15",
        "--chunk-size",
        "2",
        "--quote-token",
        "0x0000000000000000000000000000000000000002",
        "--quote-price-usd",
        "2",
      ],
      {
        databasePath,
        writeLine: (line) => output.push(line),
        fetchReplaySwaps: async ({ pools, fromBlock, toBlock }) => {
          fetchedRanges.push({ pools: pools.map((pool) => pool.pool), fromBlock, toBlock });
          return [replaySwap({ blockNumber: 13n, timestamp: "2026-09-01T12:16:00.000Z" })];
        },
      },
    );

    const storage = initializeSimulationStorage({ databasePath });
    try {
      const state = storage.getResumeState();
      expect(fetchedRanges).toEqual([
        { pools: ["0x00000000000000000000000000000000000000AA"], fromBlock: 10n, toBlock: 11n },
        { pools: ["0x00000000000000000000000000000000000000AA"], fromBlock: 12n, toBlock: 13n },
        { pools: ["0x00000000000000000000000000000000000000AA"], fromBlock: 14n, toBlock: 14n },
      ]);
      expect(state.marketSnapshots).toHaveLength(1);
      expect(state.marketSnapshots[0]).toMatchObject({
        pair: "0x00000000000000000000000000000000000000AA",
        capturedAt: new Date("2026-09-01T12:00:00.000Z"),
        blockNumber: 11n,
        metrics: expect.objectContaining({
          source: "historical-replay",
          confidence: "medium",
          openPriceUsd: 4,
          closePriceUsd: 4,
          swapCount: 2,
        }),
      });
      expect(state.skippedPairSummaries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            scanner: "historical-replay",
            pair: "0x0000000000000000000000000000000000000003",
            reason: "missing-pair-address",
          }),
        ]),
      );
      expect(state.skippedPairSummaries).toHaveLength(1);
    } finally {
      storage.close();
    }

    expect(output).toContain(
      "Reconstructed 1 historical replay snapshot(s), skipped 1 manual replay pair(s).",
    );
    expect(output).toContain(
      "Reconstructed 0 historical replay snapshot(s), skipped 1 manual replay pair(s).",
    );
  });
});

type SwapOverrides = Partial<Omit<DecodedV3Swap, "timestamp">> & {
  timestamp?: Date | string;
};

function replaySwap(overrides: SwapOverrides): DecodedV3Swap {
  const { timestamp: rawTimestamp, ...rest } = overrides;
  const timestamp =
    typeof rawTimestamp === "string"
      ? new Date(rawTimestamp)
      : (rawTimestamp ?? new Date("2026-09-01T12:01:00.000Z"));
  return {
    pool: "0x00000000000000000000000000000000000000AA",
    transactionHash: "0x1000000000000000000000000000000000000000000000000000000000000000",
    blockNumber: 10n,
    timestamp,
    token0: "0x0000000000000000000000000000000000000001",
    token1: "0x0000000000000000000000000000000000000002",
    amount0: -100n,
    amount1: 200n,
    transactionFrom: "0x00000000000000000000000000000000000000b0",
    ...rest,
  };
}

function saveReplayMarket(
  storage: ReturnType<typeof initializeSimulationStorage>,
  pair: string,
  snapshots: Array<
    { at: string } & Partial<
      Pick<MarketSnapshotRecord["metrics"], "marketCapUsd" | "lowMarketCapUsd" | "highMarketCapUsd">
    >
  >,
) {
  snapshots.forEach((snapshot, index) => {
    storage.saveMarketSnapshot({
      pair: getAddress(pair),
      capturedAt: new Date(snapshot.at),
      blockNumber: BigInt(index + 1),
      metrics: {
        source: "historical-replay",
        marketCapUsd: snapshot.marketCapUsd,
        lowMarketCapUsd: snapshot.lowMarketCapUsd,
        highMarketCapUsd: snapshot.highMarketCapUsd,
        athMarketCapUsd: 20_000_000,
        athCapturedAt: "2026-08-31T12:00:00.000Z",
        pairAgeHours: 120,
        liquidityUsd: 300_000,
        oneHourVolumeUsd: 150_000,
      },
    });
  });
}
