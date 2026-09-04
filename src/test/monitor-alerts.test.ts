import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AlertAdapter } from "../alerts/telegram-adapter.js";
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
  it("plans an alert for each new trade setup, fill, stop-loss, and take-profit", () => {
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

  it("plans a repeated-failure alert only for adapters failing at or above the threshold", () => {
    const state = emptyState();
    state.dataSourceFailures = [
      {
        adapter: "dex-screener",
        scanner: "dex-screener-monitor",
        failedAt: new Date("2026-09-05T08:30:00.000Z"),
        consecutiveFailures: 3,
        nextRetryAt: new Date("2026-09-05T08:38:00.000Z"),
        recoveredAt: undefined,
        error: "rate limited",
      },
      {
        adapter: "other",
        scanner: "dex-screener-monitor",
        failedAt: new Date("2026-09-05T08:30:00.000Z"),
        consecutiveFailures: 1,
        nextRetryAt: new Date("2026-09-05T08:32:00.000Z"),
        recoveredAt: undefined,
        error: "blip",
      },
    ];

    const failureAlerts = planMonitorAlerts(state, { now }).filter(
      (alert) => alert.kind === "repeated-failure",
    );
    expect(failureAlerts).toHaveLength(1);
    expect(failureAlerts[0]?.subject).toBe("data-source:dex-screener");
  });

  it("suppresses a repeated-failure alert that was already sent within the cooldown window", () => {
    const state = emptyState();
    state.dataSourceFailures = [
      {
        adapter: "dex-screener",
        scanner: "dex-screener-monitor",
        failedAt: new Date("2026-09-05T08:30:00.000Z"),
        consecutiveFailures: 4,
        nextRetryAt: new Date("2026-09-05T08:46:00.000Z"),
        recoveredAt: undefined,
        error: "rate limited",
      },
    ];
    state.alertHistory = [
      {
        id: "repeated-failure:dex-screener:2026-09-05T08:20:00.000Z:telegram",
        tradeSetupId: "data-source:dex-screener",
        sentAt: new Date("2026-09-05T08:20:00.000Z"),
        channel: "telegram",
        payload: {},
      },
    ];

    const failureAlerts = planMonitorAlerts(state, { now }).filter(
      (alert) => alert.kind === "repeated-failure",
    );
    expect(failureAlerts).toHaveLength(0);
  });

  it("plans one daily summary for the previous Europe/Paris day", () => {
    const summaryAlerts = planMonitorAlerts(emptyState(), { now }).filter(
      (alert) => alert.kind === "daily-summary",
    );
    expect(summaryAlerts).toHaveLength(1);
    expect(summaryAlerts[0]?.id).toBe("daily-summary:2026-09-04");
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
    const setupCalls = send.mock.calls.filter(([message]) =>
      message.subject.startsWith("baseline:0xpair"),
    );
    expect(setupCalls).toHaveLength(1);

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
      const state = second.getResumeState();
      expect(state.alertHistory).toHaveLength(1);
    } finally {
      second.close();
    }
  });
});
