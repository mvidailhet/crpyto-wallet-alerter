import type {
  ManualReplayPairRecord,
  ResumeState,
  SimulatedPositionRecord,
  TradeSetupRecord,
} from "../storage/simulation-storage.js";

export type ReplayOutcome =
  "missed" | "triggered" | "filled" | "stop-loss" | "take-profit" | "moonbag";

export type ReplayAnalysisRow = {
  strategyVersionId: string;
  pair: string;
  symbol: string | undefined;
  label: string;
  outcome: ReplayOutcome;
};

export type ReplayOutcomeSummary = {
  triggered: number;
  filled: number;
  stopLosses: number;
  takeProfitHits: number;
  moonbags: number;
  missed: number;
};

export function buildReplayAnalysisRows(
  state: ResumeState,
  strategyVersionIds = state.strategyVersions.map((strategy) => strategy.id),
): ReplayAnalysisRow[] {
  if (state.manualReplayPairs.length === 0) {
    return [];
  }

  const positionsBySetupId = groupPositionsBySetupId(state.simulatedPositions);
  return strategyVersionIds.flatMap((strategyVersionId) =>
    state.manualReplayPairs.map((pair) => {
      const setup = findReplaySetup(state.tradeSetups, strategyVersionId, pair);
      const positions = setup ? (positionsBySetupId.get(setup.id) ?? []) : [];
      return {
        strategyVersionId,
        pair: pair.pairAddress ?? pair.tokenAddress,
        symbol: pair.symbol,
        label: pair.label,
        outcome: replayOutcome(setup, positions),
      };
    }),
  );
}

export function summarizeReplayOutcomes(rows: ReplayAnalysisRow[]): ReplayOutcomeSummary {
  const summary: ReplayOutcomeSummary = {
    triggered: 0,
    filled: 0,
    stopLosses: 0,
    takeProfitHits: 0,
    moonbags: 0,
    missed: 0,
  };

  for (const row of rows) {
    if (row.outcome === "missed") {
      summary.missed += 1;
      continue;
    }

    summary.triggered += 1;
    if (row.outcome !== "triggered") {
      summary.filled += 1;
    }
    if (row.outcome === "stop-loss") {
      summary.stopLosses += 1;
    }
    if (row.outcome === "take-profit" || row.outcome === "moonbag") {
      summary.takeProfitHits += 1;
    }
    if (row.outcome === "moonbag") {
      summary.moonbags += 1;
    }
  }

  return summary;
}

function findReplaySetup(
  tradeSetups: TradeSetupRecord[],
  strategyVersionId: string,
  pair: ManualReplayPairRecord,
) {
  if (!pair.pairAddress) {
    return undefined;
  }
  return tradeSetups.find(
    (candidate) =>
      candidate.strategyVersionId === strategyVersionId && candidate.pair === pair.pairAddress,
  );
}

function replayOutcome(
  setup: TradeSetupRecord | undefined,
  positions: SimulatedPositionRecord[],
): ReplayOutcome {
  if (!setup) {
    return "missed";
  }
  if (positions.some((position) => position.status === "moonbag")) {
    return "moonbag";
  }
  if (positions.some((position) => position.entry.exitReason === "take-profit")) {
    return "take-profit";
  }
  if (positions.some((position) => position.entry.exitReason === "stop-loss")) {
    return "stop-loss";
  }
  if (positions.length > 0) {
    return "filled";
  }
  return "triggered";
}

function groupPositionsBySetupId(positions: SimulatedPositionRecord[]) {
  const grouped = new Map<string, SimulatedPositionRecord[]>();
  for (const position of positions) {
    const setupPositions = grouped.get(position.tradeSetupId) ?? [];
    setupPositions.push(position);
    grouped.set(position.tradeSetupId, setupPositions);
  }
  return grouped;
}
