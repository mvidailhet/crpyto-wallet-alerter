import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AlertAdapter } from "../alerts/adapter.js";
import { dispatchMonitorAlerts, planMonitorAlerts } from "../alerts/monitor-alerts.js";
import { initializeSimulationStorage } from "../storage/simulation-storage.js";
import type { ResumeState } from "../storage/simulation-storage.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function createTempDir() {
  const directory = await mkdtemp(join(tmpdir(), "wallet-alerter-alerts-"));
  tempDirs.push(directory);
  return directory;
}

function emptyState(): ResumeState {
  return {
    strategyVersions: [],
    scanHealth: [],
    dataSourceFailures: [],
    marketSnapshots: [],
    interestingWallets: [],
    manualReplayPairs: [],
    tradeSetups: [],
    simulatedPositions: [],
    scanGaps: [],
    skippedPairSummaries: [],
    alertHistory: [],
  };
}

const now = new Date("2026-09-05T09:00:00.000Z");

describe("planMonitorAlerts", () => {
  it("plans an alert for each recent trade setup, fill, stop-loss, and take-profit", () => {
    const state = emptyState();
    state.tradeSetups = [
      {
        id: "baseline:0xpair",
        strategyVersionId: "baseline",
        pair: "0xpair",
        createdAt: new Date("2026-09-04T12:00:00.000Z"),
        plannedBuyLevels: [],
        trigger: { athMarketCapUsd: 20_000_000 },
      },
    ];
    state.simulatedPositions = [
      {
        id: "baseline:0xpair:1000000",
        tradeSetupId: "baseline:0xpair",
        strategyVersionId: "baseline",
        openedAt: new Date("2026-09-04T13:00:00.000Z"),
        entry: {
          marketCapUsd: 1_000_000,
          exitReason: "stop-loss",
          closedAt: "2026-09-04T15:00:00.000Z",
        },
        status: "closed",
      },
      {
        id: "baseline:0xpair:2000000",
        tradeSetupId: "baseline:0xpair",
        strategyVersionId: "baseline",
        openedAt: new Date("2026-09-04T14:00:00.000Z"),
        entry: {
          marketCapUsd: 2_000_000,
          exitReason: "take-profit",
          closedAt: "2026-09-04T16:00:00.000Z",
        },
        status: "moonbag",
      },
    ];

    const kinds = planMonitorAlerts(state, { now }).map((alert) => alert.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(["trade-setup", "fill", "fill", "stop-loss", "take-profit"]),
    );
  });

  it("skips backlog events older than the lookback window", () => {
    const state = emptyState();
    state.tradeSetups = [
      {
        id: "baseline:0xold",
        strategyVersionId: "baseline",
        pair: "0xold",
        createdAt: new Date("2026-09-01T09:00:00.000Z"),
        plannedBuyLevels: [],
        trigger: {},
      },
    ];

    const kinds = planMonitorAlerts(state, { now }).map((alert) => alert.kind);
    expect(kinds).not.toContain("trade-setup");
  });

  it("plans a repeated-failure alert only when an adapter reaches the failure threshold", () => {
    const state = emptyState();
    state.dataSourceFailures = [
      failure({ adapter: "dex-screener", consecutiveFailures: 3 }),
      failure({ adapter: "climbing", consecutiveFailures: 2 }),
      failure({ adapter: "long-outage", consecutiveFailures: 9 }),
      failure({ adapter: "recovered", consecutiveFailures: 3, recoveredAt: now }),
    ];

    const failureAlerts = planMonitorAlerts(state, { now }).filter(
      (alert) => alert.kind === "repeated-failure",
    );
    expect(failureAlerts.map((alert) => alert.subject)).toEqual(["data-source:dex-screener"]);
  });

  it("plans one daily summary for the previous Europe/Paris day", () => {
    const state = emptyState();
    state.scanGaps = [
      {
        id: "gap-1",
        scanner: "dex-screener-monitor",
        startedAt: new Date("2026-09-04T11:45:00.000Z"),
        endedAt: new Date("2026-09-04T12:00:00.000Z"),
        reason: "data-source-failure:dex-screener",
      },
    ];

    const summaryAlerts = planMonitorAlerts(state, { now }).filter(
      (alert) => alert.kind === "daily-summary",
    );
    expect(summaryAlerts).toHaveLength(1);
    expect(summaryAlerts[0]?.id).toBe("daily-summary:2026-09-04");
    expect(summaryAlerts[0]?.text).toContain("1 data-source failure(s)");
  });
});

describe("dispatchMonitorAlerts", () => {
  it("sends each planned alert once and persists it so restarts do not resend", async () => {
    const databasePath = join(await createTempDir(), "simulation.sqlite");
    const seed = initializeSimulationStorage({ databasePath });
    try {
      seed.saveTradeSetup({
        id: "baseline:0xpair",
        strategyVersionId: "baseline",
        pair: "0xpair",
        createdAt: new Date("2026-09-04T12:00:00.000Z"),
        plannedBuyLevels: [],
        trigger: { athMarketCapUsd: 20_000_000 },
      });
    } finally {
      seed.close();
    }

    const send = vi.fn<AlertAdapter["send"]>().mockResolvedValue(undefined);
    const adapter: AlertAdapter = { channel: "telegram", send };

    const first = initializeSimulationStorage({ databasePath });
    let firstCount: number;
    try {
      firstCount = await dispatchMonitorAlerts({ storage: first, adapters: [adapter], now });
    } finally {
      first.close();
    }
    expect(firstCount).toBe(send.mock.calls.length);
    expect(send.mock.calls.filter(([text]) => text.includes("baseline:0xpair"))).toHaveLength(1);

    send.mockClear();
    const second = initializeSimulationStorage({ databasePath });
    try {
      const secondCount = await dispatchMonitorAlerts({
        storage: second,
        adapters: [adapter],
        now: new Date("2026-09-05T09:15:00.000Z"),
      });
      expect(secondCount).toBe(0);
      expect(send).not.toHaveBeenCalled();
    } finally {
      second.close();
    }
  });

  it("keeps an alert unrecorded when delivery fails so it retries on the next scan", async () => {
    const databasePath = join(await createTempDir(), "simulation.sqlite");
    const send = vi
      .fn<AlertAdapter["send"]>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue(undefined);
    const adapter: AlertAdapter = { channel: "telegram", send };

    const first = initializeSimulationStorage({ databasePath });
    try {
      await dispatchMonitorAlerts({ storage: first, adapters: [adapter], now });
    } finally {
      first.close();
    }

    send.mockClear();
    const second = initializeSimulationStorage({ databasePath });
    try {
      await dispatchMonitorAlerts({
        storage: second,
        adapters: [adapter],
        now: new Date("2026-09-05T09:15:00.000Z"),
      });
      expect(send).toHaveBeenCalledTimes(1);
      expect(second.getResumeState().alertHistory).toHaveLength(1);
    } finally {
      second.close();
    }
  });
});

function failure(overrides: { adapter: string; consecutiveFailures: number; recoveredAt?: Date }) {
  return {
    adapter: overrides.adapter,
    scanner: "dex-screener-monitor",
    failedAt: new Date("2026-09-05T08:30:00.000Z"),
    consecutiveFailures: overrides.consecutiveFailures,
    nextRetryAt: new Date("2026-09-05T08:45:00.000Z"),
    recoveredAt: overrides.recoveredAt,
    error: "rate limited",
  };
}
