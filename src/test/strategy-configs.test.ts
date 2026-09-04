import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createSimulationDatabase } from "../storage/database.js";
import { persistExecutedStrategyVersion } from "../storage/strategy-versions.js";
import { loadStrategyConfig } from "../strategies/configs.js";

describe("strategy config loading", () => {
  it("loads the baseline-96h strategy from a versioned JSON config file", async () => {
    const strategy = await loadStrategyConfig("baseline-96h");

    expect(strategy).toMatchObject({
      version: "baseline-96h",
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
    });
  });

  it("fails invalid strategy configs with actionable validation errors", async () => {
    const configDirectory = await mkdtemp(join(tmpdir(), "strategy-configs-"));
    await writeFile(
      join(configDirectory, "invalid.json"),
      JSON.stringify({
        version: "invalid",
        chain: "robinhood",
        scanIntervalMinutes: 0,
        plannedBuyLevels: [{ athPullbackPercent: 35, allocationPercent: 40 }],
      }),
      "utf8",
    );

    await expect(loadStrategyConfig("invalid", { configDirectory })).rejects.toThrow(
      "Invalid strategy config invalid:",
    );
    await expect(loadStrategyConfig("invalid", { configDirectory })).rejects.toThrow(
      "scanIntervalMinutes must be greater than 0",
    );
    await expect(loadStrategyConfig("invalid", { configDirectory })).rejects.toThrow(
      "topPairsByOneHourVolume must be a positive integer",
    );
    await expect(loadStrategyConfig("invalid", { configDirectory })).rejects.toThrow(
      "plannedBuyLevels allocationPercent values must total 100",
    );
  });

  it("adds strategy context to malformed JSON errors", async () => {
    const configDirectory = await mkdtemp(join(tmpdir(), "strategy-configs-"));
    await writeFile(join(configDirectory, "broken.json"), "{", "utf8");

    await expect(loadStrategyConfig("broken", { configDirectory })).rejects.toThrow(
      "Invalid strategy config broken: config must be valid JSON",
    );
  });
});

describe("executed strategy version persistence", () => {
  it("copies the exact strategy config JSON for each execution into SQLite immutably", async () => {
    const database = createSimulationDatabase(":memory:");
    const strategy = await loadStrategyConfig("baseline-96h");

    const first = persistExecutedStrategyVersion(database, strategy);
    const second = persistExecutedStrategyVersion(database, {
      ...strategy,
      minimumLiquidityUsd: 500_000,
    });

    expect(first.strategyVersionId).not.toBe(second.strategyVersionId);
    expect(JSON.parse(first.configJson)).toMatchObject({ minimumLiquidityUsd: 250_000 });
    expect(JSON.parse(second.configJson)).toMatchObject({ minimumLiquidityUsd: 500_000 });

    database.close();
  });
});
