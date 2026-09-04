import type { AlertAdapter } from "./telegram-adapter.js";
import type {
  AlertHistoryRecord,
  DataSourceFailureRecord,
  ResumeState,
  SimulatedPositionRecord,
} from "../storage/simulation-storage.js";

export type MonitorAlertKind =
  "trade-setup" | "fill" | "stop-loss" | "take-profit" | "repeated-failure" | "daily-summary";

export type PlannedAlert = {
  id: string;
  subject: string;
  kind: MonitorAlertKind;
  text: string;
  payload: Record<string, unknown>;
};

export type PlanMonitorAlertsOptions = {
  now: Date;
  repeatedFailureThreshold?: number;
  repeatedFailureCooldownMinutes?: number;
};

const defaultRepeatedFailureThreshold = 3;
const defaultRepeatedFailureCooldownMinutes = 60;

export function planMonitorAlerts(
  state: ResumeState,
  options: PlanMonitorAlertsOptions,
): PlannedAlert[] {
  const threshold = options.repeatedFailureThreshold ?? defaultRepeatedFailureThreshold;
  const cooldownMs =
    (options.repeatedFailureCooldownMinutes ?? defaultRepeatedFailureCooldownMinutes) * 60_000;
  const pairBySetupId = new Map(state.tradeSetups.map((setup) => [setup.id, setup.pair]));
  const alerts: PlannedAlert[] = [];

  for (const setup of state.tradeSetups) {
    alerts.push({
      id: `trade-setup:${setup.id}`,
      subject: setup.id,
      kind: "trade-setup",
      text: `New trade setup ${setup.id} on pair ${setup.pair}.`,
      payload: {
        tradeSetupId: setup.id,
        pair: setup.pair,
        createdAt: setup.createdAt.toISOString(),
        trigger: setup.trigger,
      },
    });
  }

  for (const position of state.simulatedPositions) {
    const pair = pairBySetupId.get(position.tradeSetupId) ?? "";
    const entryMarketCapUsd = numberEntry(position, "marketCapUsd");
    alerts.push({
      id: `fill:${position.id}`,
      subject: position.tradeSetupId,
      kind: "fill",
      text: `Simulated fill ${position.id} on pair ${pair} at market cap ${formatUsd(entryMarketCapUsd)}.`,
      payload: {
        tradeSetupId: position.tradeSetupId,
        positionId: position.id,
        pair,
        openedAt: position.openedAt.toISOString(),
        entryMarketCapUsd,
      },
    });

    const exitReason = stringEntry(position, "exitReason");
    if (exitReason === "stop-loss" || exitReason === "take-profit") {
      alerts.push({
        id: `${exitReason}:${position.id}`,
        subject: position.tradeSetupId,
        kind: exitReason,
        text:
          exitReason === "stop-loss"
            ? `Stop loss hit for ${position.id} on pair ${pair}.`
            : `Take profit (2x) reached for ${position.id} on pair ${pair}.`,
        payload: {
          tradeSetupId: position.tradeSetupId,
          positionId: position.id,
          pair,
          exitMarketCapUsd: numberEntry(position, "exitMarketCapUsd"),
          closedAt: stringEntry(position, "closedAt"),
        },
      });
    }
  }

  for (const failure of state.dataSourceFailures) {
    if (failure.recoveredAt !== undefined || failure.consecutiveFailures < threshold) {
      continue;
    }
    if (recentlyAlerted(state.alertHistory, failure.adapter, options.now, cooldownMs)) {
      continue;
    }
    alerts.push({
      id: `repeated-failure:${failure.adapter}:${failure.failedAt.toISOString()}`,
      subject: `data-source:${failure.adapter}`,
      kind: "repeated-failure",
      text: `Adapter ${failure.adapter} has failed ${failure.consecutiveFailures} scans in a row: ${failure.error}`,
      payload: {
        adapter: failure.adapter,
        scanner: failure.scanner,
        consecutiveFailures: failure.consecutiveFailures,
        failedAt: failure.failedAt.toISOString(),
        error: failure.error,
      },
    });
  }

  const summaryDate = previousParisDate(options.now);
  const summary = summarizeParisDay(state, summaryDate, threshold);
  alerts.push({
    id: `daily-summary:${summaryDate}`,
    subject: "daily-summary",
    kind: "daily-summary",
    text:
      `Daily summary ${summaryDate} (Europe/Paris): ${summary.tradeSetups} new trade setup(s), ` +
      `${summary.fills} fill(s), ${summary.stopLosses} stop loss(es), ` +
      `${summary.takeProfits} take profit(s), ${summary.repeatedFailures} repeated failure(s).`,
    payload: { date: summaryDate, ...summary },
  });

  return alerts;
}

export type DailyAlertSummary = {
  tradeSetups: number;
  fills: number;
  stopLosses: number;
  takeProfits: number;
  repeatedFailures: number;
};

export type AlertStorage = {
  getResumeState(): ResumeState;
  saveAlertHistory(record: AlertHistoryRecord): boolean;
};

export type DispatchMonitorAlertsParams = {
  storage: AlertStorage;
  adapters: AlertAdapter[];
  now: Date;
  writeLine?: (line: string) => void;
} & Pick<PlanMonitorAlertsOptions, "repeatedFailureThreshold" | "repeatedFailureCooldownMinutes">;

export async function dispatchMonitorAlerts(params: DispatchMonitorAlertsParams): Promise<number> {
  const { storage, adapters, now } = params;
  if (adapters.length === 0) {
    return 0;
  }

  const state = storage.getResumeState();
  const alreadySent = new Set(state.alertHistory.map((record) => record.id));
  const planned = planMonitorAlerts(state, {
    now,
    repeatedFailureThreshold: params.repeatedFailureThreshold,
    repeatedFailureCooldownMinutes: params.repeatedFailureCooldownMinutes,
  });

  let sent = 0;
  for (const alert of planned) {
    for (const adapter of adapters) {
      const id = `${alert.id}:${adapter.channel}`;
      if (alreadySent.has(id)) {
        continue;
      }

      try {
        await adapter.send({ subject: alert.subject, text: alert.text });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        params.writeLine?.(`Alert delivery failed (${adapter.channel}): ${message}`);
        continue;
      }

      storage.saveAlertHistory({
        id,
        tradeSetupId: alert.subject,
        sentAt: now,
        channel: adapter.channel,
        payload: { kind: alert.kind, text: alert.text, ...alert.payload },
      });
      alreadySent.add(id);
      sent += 1;
    }
  }

  return sent;
}

function recentlyAlerted(
  alertHistory: AlertHistoryRecord[],
  adapter: string,
  now: Date,
  cooldownMs: number,
): boolean {
  const prefix = `repeated-failure:${adapter}:`;
  return alertHistory.some(
    (record) =>
      record.id.startsWith(prefix) && now.getTime() - record.sentAt.getTime() < cooldownMs,
  );
}

function summarizeParisDay(state: ResumeState, date: string, threshold: number): DailyAlertSummary {
  const closedOn = (position: SimulatedPositionRecord, reason: string) => {
    if (stringEntry(position, "exitReason") !== reason) {
      return false;
    }
    const closedAt = stringEntry(position, "closedAt");
    return closedAt !== undefined && parisDateString(new Date(closedAt)) === date;
  };

  return {
    tradeSetups: state.tradeSetups.filter((setup) => parisDateString(setup.createdAt) === date)
      .length,
    fills: state.simulatedPositions.filter(
      (position) => parisDateString(position.openedAt) === date,
    ).length,
    stopLosses: state.simulatedPositions.filter((position) => closedOn(position, "stop-loss"))
      .length,
    takeProfits: state.simulatedPositions.filter((position) => closedOn(position, "take-profit"))
      .length,
    repeatedFailures: state.dataSourceFailures.filter(
      (failure: DataSourceFailureRecord) =>
        failure.consecutiveFailures >= threshold && parisDateString(failure.failedAt) === date,
    ).length,
  };
}

function numberEntry(position: SimulatedPositionRecord, key: string): number | undefined {
  const value = position.entry[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringEntry(position: SimulatedPositionRecord, key: string): string | undefined {
  const value = position.entry[key];
  return typeof value === "string" ? value : undefined;
}

function formatUsd(value: number | undefined): string {
  return value === undefined ? "unknown" : `$${Math.round(value).toLocaleString("en-US")}`;
}

function previousParisDate(now: Date): string {
  return parisDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

function parisDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
