import type { AlertAdapter } from "./adapter.js";
import type {
  AlertHistoryRecord,
  ResumeState,
  SimulatedPositionRecord,
} from "../storage/simulation-storage.js";

export type MonitorAlertKind =
  "trade-setup" | "fill" | "stop-loss" | "take-profit" | "repeated-failure" | "daily-summary";

export type PlannedAlert = {
  id: string;
  // Doubles as alert_history.trade_setup_id: the trade setup id for setup and
  // position alerts, or a synthetic subject for adapter and summary alerts.
  subject: string;
  kind: MonitorAlertKind;
  text: string;
};

export type PlanMonitorAlertsOptions = {
  now: Date;
};

// Fixed by ADR-0020: a repeated-failure alert fires once an adapter has failed
// this many consecutive scans. Event alerts older than the lookback window are
// treated as backlog and skipped so enabling alerts on a running monitor does
// not replay the whole history.
const repeatedFailureThreshold = 3;
const eventAlertLookbackHours = 24;

export function planMonitorAlerts(
  state: ResumeState,
  options: PlanMonitorAlertsOptions,
): PlannedAlert[] {
  const pairBySetupId = new Map(state.tradeSetups.map((setup) => [setup.id, setup.pair]));
  const alerts: PlannedAlert[] = [];

  for (const setup of state.tradeSetups) {
    if (!isRecentEvent(setup.createdAt, options.now)) {
      continue;
    }
    alerts.push({
      id: `trade-setup:${setup.id}`,
      subject: setup.id,
      kind: "trade-setup",
      text: `New trade setup ${setup.id} on pair ${setup.pair}.`,
    });
  }

  for (const position of state.simulatedPositions) {
    const pair = pairBySetupId.get(position.tradeSetupId) ?? "";
    if (isRecentEvent(position.openedAt, options.now)) {
      alerts.push({
        id: `fill:${position.id}`,
        subject: position.tradeSetupId,
        kind: "fill",
        text: `Simulated fill ${position.id} on pair ${pair} at market cap ${formatUsd(
          numberEntry(position, "marketCapUsd"),
        )}.`,
      });
    }

    const exitReason = stringEntry(position, "exitReason");
    const closedAt = dateEntry(position, "closedAt");
    if (
      (exitReason === "stop-loss" || exitReason === "take-profit") &&
      closedAt !== undefined &&
      isRecentEvent(closedAt, options.now)
    ) {
      alerts.push({
        id: `${exitReason}:${position.id}`,
        subject: position.tradeSetupId,
        kind: exitReason,
        text:
          exitReason === "stop-loss"
            ? `Stop loss hit for ${position.id} on pair ${pair}.`
            : `Take profit (2x) reached for ${position.id} on pair ${pair}.`,
      });
    }
  }

  for (const failure of state.dataSourceFailures) {
    if (
      failure.recoveredAt !== undefined ||
      failure.consecutiveFailures !== repeatedFailureThreshold
    ) {
      continue;
    }
    alerts.push({
      id: `repeated-failure:${failure.adapter}:${failure.failedAt.toISOString()}`,
      subject: `data-source:${failure.adapter}`,
      kind: "repeated-failure",
      text: `Adapter ${failure.adapter} has failed ${failure.consecutiveFailures} scans in a row: ${failure.error}`,
    });
  }

  const summaryDate = previousParisDate(options.now);
  const summary = summarizeParisDay(state, summaryDate);
  alerts.push({
    id: `daily-summary:${summaryDate}`,
    subject: "daily-summary",
    kind: "daily-summary",
    text:
      `Daily summary ${summaryDate} (Europe/Paris): ${summary.tradeSetups} new trade setup(s), ` +
      `${summary.fills} fill(s), ${summary.stopLosses} stop loss(es), ` +
      `${summary.takeProfits} take profit(s), ${summary.dataSourceFailures} data-source failure(s).`,
  });

  return alerts;
}

export type DailyAlertSummary = {
  tradeSetups: number;
  fills: number;
  stopLosses: number;
  takeProfits: number;
  dataSourceFailures: number;
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
};

export async function dispatchMonitorAlerts(params: DispatchMonitorAlertsParams): Promise<number> {
  const { storage, adapters, now } = params;
  if (adapters.length === 0) {
    return 0;
  }

  const state = storage.getResumeState();
  const alreadySent = new Set(state.alertHistory.map((record) => record.id));
  const planned = planMonitorAlerts(state, { now });

  let sent = 0;
  for (const alert of planned) {
    for (const adapter of adapters) {
      const id = `${alert.id}:${adapter.channel}`;
      if (alreadySent.has(id)) {
        continue;
      }

      try {
        await adapter.send(alert.text);
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
        payload: { kind: alert.kind, text: alert.text },
      });
      alreadySent.add(id);
      sent += 1;
    }
  }

  return sent;
}

function summarizeParisDay(state: ResumeState, date: string): DailyAlertSummary {
  const closedOn = (position: SimulatedPositionRecord, reason: string) => {
    if (stringEntry(position, "exitReason") !== reason) {
      return false;
    }
    const closedAt = dateEntry(position, "closedAt");
    return closedAt !== undefined && parisDateString(closedAt) === date;
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
    dataSourceFailures: state.scanGaps.filter(
      (gap) =>
        gap.reason.startsWith("data-source-failure:") && parisDateString(gap.endedAt) === date,
    ).length,
  };
}

function isRecentEvent(at: Date, now: Date): boolean {
  return now.getTime() - at.getTime() <= eventAlertLookbackHours * 60 * 60 * 1000;
}

function numberEntry(position: SimulatedPositionRecord, key: string): number | undefined {
  const value = position.entry[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringEntry(position: SimulatedPositionRecord, key: string): string | undefined {
  const value = position.entry[key];
  return typeof value === "string" ? value : undefined;
}

function dateEntry(position: SimulatedPositionRecord, key: string): Date | undefined {
  const value = stringEntry(position, key);
  if (value === undefined) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
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
