import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildReplayAnalysisRows, type ReplayAnalysisRow } from "../analysis/replay-results.js";
import type {
  MarketSnapshotRecord,
  ResumeState,
  SimulatedPositionRecord,
  TradeSetupRecord,
} from "../storage/simulation-storage.js";

export type GenerateSimulationReportsOptions = {
  reportsDirectory?: string;
  generatedAt?: Date;
  replayStrategyVersionIds?: string[];
};

export type GeneratedSimulationReports = {
  htmlPath: string;
  csvPath: string;
};

type PositionReportRow = {
  strategyVersionId: string;
  tradeSetupId: string;
  pair: string;
  setupCreatedAt: Date;
  positionId: string;
  status: string;
  openedAt: Date;
  entryMarketCapUsd: number | undefined;
  allocationPercent: number | undefined;
  stopLossMarketCapUsd: number | undefined;
  takeProfitMarketCapUsd: number | undefined;
  closedAt: Date | undefined;
  exitMarketCapUsd: number | undefined;
  exitReason: string | undefined;
  realizedPnlMultiple: number | undefined;
  unrealizedPnlMultiple: number | undefined;
  maxUpsideMultiple: number | undefined;
  maxDrawdownPercent: number | undefined;
  moonbagPercent: number | undefined;
};

type ChartMarker = {
  pair: string;
  at: Date;
  type: string;
  label: string;
};

export async function generateSimulationReports(
  state: ResumeState,
  options: GenerateSimulationReportsOptions = {},
): Promise<GeneratedSimulationReports> {
  const reportsDirectory = options.reportsDirectory ?? join(process.cwd(), "reports");
  const generatedAt = options.generatedAt ?? new Date();
  const basename = `simulation-${formatFileTimestamp(generatedAt)}`;
  const htmlPath = join(reportsDirectory, `${basename}.html`);
  const csvPath = join(reportsDirectory, `${basename}.csv`);
  const rows = buildPositionRows(state);
  const replayRows = buildReplayAnalysisRows(state, options.replayStrategyVersionIds);
  const markers = buildChartMarkers(state);

  await mkdir(reportsDirectory, { recursive: true });
  await writeFile(csvPath, renderCsv(state, rows, replayRows), "utf8");
  await writeFile(htmlPath, renderHtml(state, rows, replayRows, markers, generatedAt), "utf8");

  return { htmlPath, csvPath };
}

function buildPositionRows(state: ResumeState): PositionReportRow[] {
  const setupsById = new Map(state.tradeSetups.map((setup) => [setup.id, setup]));
  const snapshotsByPair = groupSnapshotsByPair(state.marketSnapshots);

  return state.simulatedPositions.map((position) => {
    const setup = setupsById.get(position.tradeSetupId);
    const snapshots = setup ? (snapshotsByPair.get(setup.pair) ?? []) : [];
    const entryMarketCapUsd = numberEntry(position, "marketCapUsd");
    const closedAt = dateEntry(position, "closedAt");
    const exitMarketCapUsd = numberEntry(position, "exitMarketCapUsd");
    const latestMarketCapUsd = latestSnapshotMarketCap(snapshots);
    const highMarketCapUsd = maxSnapshotMarketCap(snapshots);
    const lowMarketCapUsd = minSnapshotMarketCap(snapshots);

    return {
      strategyVersionId: position.strategyVersionId,
      tradeSetupId: position.tradeSetupId,
      pair: setup?.pair ?? "",
      setupCreatedAt: setup?.createdAt ?? position.openedAt,
      positionId: position.id,
      status: position.status,
      openedAt: position.openedAt,
      entryMarketCapUsd,
      allocationPercent: numberEntry(position, "allocationPercent"),
      stopLossMarketCapUsd: numberEntry(position, "stopLossMarketCapUsd"),
      takeProfitMarketCapUsd: numberEntry(position, "takeProfitMarketCapUsd"),
      closedAt,
      exitMarketCapUsd,
      exitReason: stringEntry(position, "exitReason"),
      realizedPnlMultiple: pnlMultiple(entryMarketCapUsd, exitMarketCapUsd),
      unrealizedPnlMultiple: pnlMultiple(entryMarketCapUsd, latestMarketCapUsd),
      maxUpsideMultiple: ratioMultiple(entryMarketCapUsd, highMarketCapUsd),
      maxDrawdownPercent: drawdownPercent(entryMarketCapUsd, lowMarketCapUsd),
      moonbagPercent: numberEntry(position, "moonbagPercent"),
    };
  });
}

function buildChartMarkers(state: ResumeState): ChartMarker[] {
  const setupsById = new Map(state.tradeSetups.map((setup) => [setup.id, setup]));
  const setupMarkers = state.tradeSetups.map((setup) => ({
    pair: setup.pair,
    at: setup.createdAt,
    type: "setup-created",
    label: setup.id,
  }));
  const positionMarkers = state.simulatedPositions.flatMap((position) => {
    const pair = setupsById.get(position.tradeSetupId)?.pair ?? "";
    const markers: ChartMarker[] = [
      {
        pair,
        at: position.openedAt,
        type: "fill",
        label: position.id,
      },
    ];
    const closedAt = dateEntry(position, "closedAt");
    const exitReason = stringEntry(position, "exitReason");
    if (closedAt && exitReason) {
      markers.push({
        pair,
        at: closedAt,
        type: exitReason,
        label: position.id,
      });
    }
    return markers;
  });
  const snapshotMarkers = state.marketSnapshots.flatMap((snapshot) => {
    const markers: ChartMarker[] = [];
    if (snapshot.metrics.momentumWarning === true) {
      markers.push({
        pair: snapshot.pair,
        at: snapshot.capturedAt,
        type: "momentum-warning",
        label: "Momentum warning",
      });
    }
    if (numberMetric(snapshot, "athMarketCapUsd") !== undefined) {
      markers.push({
        pair: snapshot.pair,
        at: snapshot.capturedAt,
        type: "ath",
        label: "ATH",
      });
    }
    return markers;
  });

  return [...setupMarkers, ...positionMarkers, ...snapshotMarkers].sort(
    (left, right) => left.at.getTime() - right.at.getTime() || left.type.localeCompare(right.type),
  );
}

function renderCsv(
  state: ResumeState,
  rows: PositionReportRow[],
  replayRows: ReplayAnalysisRow[],
) {
  const headers = [
    "strategyVersionId",
    "tradeSetupId",
    "pair",
    "setupCreatedAt",
    "positionId",
    "status",
    "openedAt",
    "entryMarketCapUsd",
    "allocationPercent",
    "stopLossMarketCapUsd",
    "takeProfitMarketCapUsd",
    "closedAt",
    "exitMarketCapUsd",
    "exitReason",
    "realizedPnlMultiple",
    "unrealizedPnlMultiple",
    "maxUpsideMultiple",
    "maxDrawdownPercent",
    "moonbagPercent",
  ];
  const positionLines = [
    "positions",
    headers.join(","),
    ...rows.map((row) =>
      [
        row.strategyVersionId,
        row.tradeSetupId,
        row.pair,
        formatEuropeParisDateTime(row.setupCreatedAt),
        row.positionId,
        row.status,
        formatEuropeParisDateTime(row.openedAt),
        row.entryMarketCapUsd,
        row.allocationPercent,
        row.stopLossMarketCapUsd,
        row.takeProfitMarketCapUsd,
        row.closedAt ? formatEuropeParisDateTime(row.closedAt) : undefined,
        row.exitMarketCapUsd,
        row.exitReason,
        row.realizedPnlMultiple,
        row.unrealizedPnlMultiple,
        row.maxUpsideMultiple,
        row.maxDrawdownPercent,
        row.moonbagPercent,
      ]
        .map((value) => escapeCsvCell(formatCsvValue(value)))
        .join(","),
    ),
  ];
  const scanGapLines = [
    "",
    "scanGaps",
    "scanner,startedAt,endedAt,reason",
    ...state.scanGaps.map((gap) =>
      [
        gap.scanner,
        formatEuropeParisDateTime(gap.startedAt),
        formatEuropeParisDateTime(gap.endedAt),
        gap.reason,
      ]
        .map((value) => escapeCsvCell(formatCsvValue(value)))
        .join(","),
    ),
  ];
  const dataSourceFailureLines = [
    "",
    "dataSourceFailures",
    "adapter,scanner,failedAt,consecutiveFailures,nextRetryAt,recoveredAt,error",
    ...state.dataSourceFailures.map((failure) =>
      [
        failure.adapter,
        failure.scanner,
        formatEuropeParisDateTime(failure.failedAt),
        failure.consecutiveFailures,
        formatEuropeParisDateTime(failure.nextRetryAt),
        failure.recoveredAt ? formatEuropeParisDateTime(failure.recoveredAt) : undefined,
        failure.error,
      ]
        .map((value) => escapeCsvCell(formatCsvValue(value)))
        .join(","),
    ),
  ];
  const skippedPairLines = [
    "",
    "skippedPairs",
    "scanner,pair,scannedAt,reason,details",
    ...state.skippedPairSummaries.map((summary) =>
      [
        summary.scanner,
        summary.pair,
        formatEuropeParisDateTime(summary.scannedAt),
        summary.reason,
        JSON.stringify(summary.details),
      ]
        .map((value) => escapeCsvCell(formatCsvValue(value)))
        .join(","),
    ),
  ];
  const replayAnalysisLines = [
    "",
    "replayAnalysis",
    "strategyVersionId,pair,symbol,label,outcome",
    ...replayRows.map((row) =>
      [row.strategyVersionId, row.pair, row.symbol, row.label, row.outcome]
        .map((value) => escapeCsvCell(formatCsvValue(value)))
        .join(","),
    ),
  ];
  return `${[
    ...positionLines,
    ...scanGapLines,
    ...dataSourceFailureLines,
    ...skippedPairLines,
    ...replayAnalysisLines,
    ...buildWalletInsightCsvSections(state),
  ].join("\n")}\n`;
}

/**
 * The interesting-wallet / wallet-evidence / manual-tag CSV blocks, shared by
 * the full simulation report and the `replay-pairs wallets` command. Each block
 * is preceded by a blank line, matching the other report sections.
 */
export function buildWalletInsightCsvSections(state: ResumeState): string[] {
  const csvRow = (values: Array<string | number | Date | undefined>) =>
    values.map((value) => escapeCsvCell(formatCsvValue(value))).join(",");

  return [
    "",
    "interestingWallets",
    "wallet,chain,updatedAt,evidence",
    ...state.interestingWallets.map((wallet) =>
      csvRow([
        wallet.wallet,
        wallet.chain,
        formatEuropeParisDateTime(wallet.updatedAt),
        JSON.stringify(wallet.evidence),
      ]),
    ),
    "",
    "walletEvidence",
    "wallet,chain,kind,observedAt,source,detail",
    ...state.walletEvidence.map((event) =>
      csvRow([
        event.wallet,
        event.chain,
        event.kind,
        formatEuropeParisDateTime(event.observedAt),
        event.source,
        JSON.stringify(event.detail),
      ]),
    ),
    "",
    "walletTags",
    "wallet,chain,tag,notes,updatedAt",
    ...state.walletTags.map((tag) =>
      csvRow([
        tag.wallet,
        tag.chain,
        tag.tag,
        tag.notes ?? "",
        formatEuropeParisDateTime(tag.updatedAt),
      ]),
    ),
    "",
    "pairTags",
    "pair,chain,tag,notes,updatedAt",
    ...state.pairTags.map((tag) =>
      csvRow([tag.pair, tag.chain, tag.tag, tag.notes ?? "", formatEuropeParisDateTime(tag.updatedAt)]),
    ),
  ];
}

function renderHtml(
  state: ResumeState,
  rows: PositionReportRow[],
  replayRows: ReplayAnalysisRow[],
  markers: ChartMarker[],
  generatedAt: Date,
) {
  const skippedByReason = countBy(state.skippedPairSummaries.map((summary) => summary.reason));
  const totalRealized = rows.reduce((total, row) => total + (row.realizedPnlMultiple ?? 0), 0);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Simulation Report ${escapeHtml(formatEuropeParisDateTime(generatedAt))}</title>
  <style>
    body { color: #1f2937; font-family: Arial, sans-serif; margin: 24px; }
    table { border-collapse: collapse; margin: 16px 0; width: 100%; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
    th { background: #f3f4f6; }
    .summary { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
    .summary div { border: 1px solid #d1d5db; padding: 8px; }
  </style>
</head>
<body>
  <h1>Simulation Summary</h1>
  <p>Generated at ${escapeHtml(formatEuropeParisDateTime(generatedAt))} Europe/Paris.</p>
  <section class="summary">
    <div><strong>Strategy versions</strong><br>${state.strategyVersions.length}</div>
    <div><strong>Trade setups</strong><br>${state.tradeSetups.length}</div>
    <div><strong>Simulated positions</strong><br>${state.simulatedPositions.length}</div>
    <div><strong>Realized PnL multiple</strong><br>${formatNumber(totalRealized)}</div>
  </section>
  ${renderSetupTable(state.tradeSetups)}
  ${renderPositionTable(rows)}
  ${renderScanGapTable(state)}
  ${renderDataSourceFailureTable(state)}
  ${renderSkippedPairsTable(skippedByReason)}
  ${renderSkippedPairDetailsTable(state)}
  ${renderInterestingWalletTables(state)}
  ${renderReplayAnalysisTable(replayRows)}
  ${renderCharts(state, markers)}
  ${renderChartMarkerTable(markers)}
</body>
</html>
`;
}

function renderInterestingWalletTables(state: ResumeState) {
  return `<h2>Interesting wallets</h2>
  <table>
    <thead><tr><th>Wallet</th><th>Chain</th><th>Updated</th><th>Evidence</th></tr></thead>
    <tbody>${state.interestingWallets
      .map(
        (wallet) =>
          `<tr><td>${escapeHtml(wallet.wallet)}</td><td>${escapeHtml(wallet.chain)}</td><td>${escapeHtml(formatEuropeParisDateTime(wallet.updatedAt))}</td><td>${escapeHtml(JSON.stringify(wallet.evidence))}</td></tr>`,
      )
      .join("")}</tbody>
  </table>
  <h2>Wallet evidence</h2>
  <table>
    <thead><tr><th>Wallet</th><th>Chain</th><th>Kind</th><th>Observed</th><th>Source</th><th>Detail</th></tr></thead>
    <tbody>${state.walletEvidence
      .map(
        (event) =>
          `<tr><td>${escapeHtml(event.wallet)}</td><td>${escapeHtml(event.chain)}</td><td>${escapeHtml(event.kind)}</td><td>${escapeHtml(formatEuropeParisDateTime(event.observedAt))}</td><td>${escapeHtml(event.source)}</td><td>${escapeHtml(JSON.stringify(event.detail))}</td></tr>`,
      )
      .join("")}</tbody>
  </table>
  ${renderManualTagTable("Manual wallet tags", "Wallet", state.walletTags.map((tag) => ({ entity: tag.wallet, chain: tag.chain, tag: tag.tag, notes: tag.notes, updatedAt: tag.updatedAt })))}
  ${renderManualTagTable("Manual pair tags", "Pair", state.pairTags.map((tag) => ({ entity: tag.pair, chain: tag.chain, tag: tag.tag, notes: tag.notes, updatedAt: tag.updatedAt })))}`;
}

function renderManualTagTable(
  title: string,
  entityHeader: string,
  rows: Array<{ entity: string; chain: string; tag: string; notes?: string; updatedAt: Date }>,
) {
  return `<h2>${escapeHtml(title)}</h2>
  <table>
    <thead><tr><th>${escapeHtml(entityHeader)}</th><th>Chain</th><th>Tag</th><th>Notes</th><th>Updated</th></tr></thead>
    <tbody>${rows
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.entity)}</td><td>${escapeHtml(row.chain)}</td><td>${escapeHtml(row.tag)}</td><td>${escapeHtml(row.notes ?? "")}</td><td>${escapeHtml(formatEuropeParisDateTime(row.updatedAt))}</td></tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function renderReplayAnalysisTable(rows: ReplayAnalysisRow[]) {
  if (rows.length === 0) {
    return "";
  }
  return `<h2>Replay analysis</h2>
  <table>
    <thead><tr><th>Strategy version</th><th>Pair</th><th>Symbol</th><th>Label</th><th>Outcome</th></tr></thead>
    <tbody>${rows
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.strategyVersionId)}</td><td>${escapeHtml(row.pair)}</td><td>${escapeHtml(row.symbol ?? "")}</td><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.outcome)}</td></tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function renderSetupTable(tradeSetups: TradeSetupRecord[]) {
  return `<h2>Trade setups</h2>
  <table>
    <thead><tr><th>Strategy version</th><th>Trade setup</th><th>Pair</th><th>Created</th><th>Planned buy levels</th></tr></thead>
    <tbody>${tradeSetups
      .map(
        (setup) =>
          `<tr><td>${escapeHtml(setup.strategyVersionId)}</td><td>${escapeHtml(setup.id)}</td><td>${escapeHtml(setup.pair)}</td><td>${escapeHtml(formatEuropeParisDateTime(setup.createdAt))}</td><td>${escapeHtml(JSON.stringify(setup.plannedBuyLevels))}</td></tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function renderPositionTable(rows: PositionReportRow[]) {
  return `<h2>Simulated positions</h2>
  <table>
    <thead><tr><th>Position</th><th>Status</th><th>Entry</th><th>Stop loss</th><th>Take profit</th><th>Exit</th><th>Moonbag</th><th>Realized PnL</th><th>Unrealized PnL</th><th>Max upside</th><th>Max drawdown</th></tr></thead>
    <tbody>${rows
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.positionId)}</td><td>${escapeHtml(row.status)}</td><td>${formatNumber(row.entryMarketCapUsd)}</td><td>${formatNumber(row.stopLossMarketCapUsd)}</td><td>${formatNumber(row.takeProfitMarketCapUsd)}</td><td>${formatNumber(row.exitMarketCapUsd)} ${escapeHtml(row.exitReason ?? "")}</td><td>${formatNumber(row.moonbagPercent)}%</td><td>${formatNumber(row.realizedPnlMultiple)}</td><td>${formatNumber(row.unrealizedPnlMultiple)}</td><td>${formatNumber(row.maxUpsideMultiple)}</td><td>${formatNumber(row.maxDrawdownPercent)}%</td></tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function renderScanGapTable(state: ResumeState) {
  return `<h2>Scan gaps</h2>
  <table>
    <thead><tr><th>Scanner</th><th>Started</th><th>Ended</th><th>Reason</th></tr></thead>
    <tbody>${state.scanGaps
      .map(
        (gap) =>
          `<tr><td>${escapeHtml(gap.scanner)}</td><td>${escapeHtml(formatEuropeParisDateTime(gap.startedAt))}</td><td>${escapeHtml(formatEuropeParisDateTime(gap.endedAt))}</td><td>${escapeHtml(gap.reason)}</td></tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function renderDataSourceFailureTable(state: ResumeState) {
  return `<h2>Data-source failures</h2>
  <table>
    <thead><tr><th>Adapter</th><th>Scanner</th><th>Failed</th><th>Count</th><th>Next retry</th><th>Recovered</th><th>Error</th></tr></thead>
    <tbody>${state.dataSourceFailures
      .map(
        (failure) =>
          `<tr><td>${escapeHtml(failure.adapter)}</td><td>${escapeHtml(failure.scanner)}</td><td>${escapeHtml(formatEuropeParisDateTime(failure.failedAt))}</td><td>${failure.consecutiveFailures}</td><td>${escapeHtml(formatEuropeParisDateTime(failure.nextRetryAt))}</td><td>${escapeHtml(failure.recoveredAt ? formatEuropeParisDateTime(failure.recoveredAt) : "")}</td><td>${escapeHtml(failure.error)}</td></tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function renderSkippedPairsTable(skippedByReason: Map<string, number>) {
  return `<h2>Skipped pairs by reason</h2>
  <table>
    <thead><tr><th>Reason</th><th>Count</th></tr></thead>
    <tbody>${Array.from(skippedByReason.entries())
      .map(
        ([reason, count]) =>
          `<tr><td>${escapeHtml(reason)}</td><td>${escapeHtml(count.toString())}</td></tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function renderSkippedPairDetailsTable(state: ResumeState) {
  return `<h2>Skipped pair details</h2>
  <table>
    <thead><tr><th>Scanner</th><th>Pair</th><th>Scanned</th><th>Reason</th><th>Details</th></tr></thead>
    <tbody>${state.skippedPairSummaries
      .map(
        (summary) =>
          `<tr><td>${escapeHtml(summary.scanner)}</td><td>${escapeHtml(summary.pair)}</td><td>${escapeHtml(formatEuropeParisDateTime(summary.scannedAt))}</td><td>${escapeHtml(summary.reason)}</td><td>${escapeHtml(JSON.stringify(summary.details))}</td></tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function renderCharts(state: ResumeState, markers: ChartMarker[]) {
  const snapshotsByPair = groupSnapshotsByPair(state.marketSnapshots);
  const charts = Array.from(snapshotsByPair.entries())
    .filter(([, snapshots]) =>
      snapshots.some((snapshot) => snapshotHighMarketCap(snapshot) !== undefined),
    )
    .map(([pair, snapshots]) =>
      renderChart(
        pair,
        snapshots,
        markers.filter((marker) => marker.pair === pair),
      ),
    );

  return charts.length === 0 ? "" : `<h2>Charts</h2>${charts.join("")}`;
}

function renderChart(pair: string, snapshots: MarketSnapshotRecord[], markers: ChartMarker[]) {
  const width = 720;
  const height = 180;
  const padding = 24;
  const values = snapshots
    .map((snapshot) => ({
      at: snapshot.capturedAt,
      value: snapshotHighMarketCap(snapshot),
    }))
    .filter((point): point is { at: Date; value: number } => point.value !== undefined);
  if (values.length === 0) {
    return "";
  }

  const minTime = Math.min(...values.map((point) => point.at.getTime()));
  const maxTime = Math.max(...values.map((point) => point.at.getTime()));
  const minValue = Math.min(...values.map((point) => point.value));
  const maxValue = Math.max(...values.map((point) => point.value));
  const points = values.map(
    (point) =>
      `${scale(point.at.getTime(), minTime, maxTime, padding, width - padding)},${scale(
        point.value,
        minValue,
        maxValue,
        height - padding,
        padding,
      )}`,
  );

  return `<h3>${escapeHtml(pair)}</h3>
  <svg role="img" aria-label="Market-cap chart for ${escapeHtml(pair)}" viewBox="0 0 ${width} ${height}">
    <polyline fill="none" stroke="#2563eb" stroke-width="2" points="${points.join(" ")}"></polyline>
    ${markers
      .map((marker) => {
        const nearest = nearestPoint(values, marker.at);
        return `<circle cx="${scale(nearest.at.getTime(), minTime, maxTime, padding, width - padding)}" cy="${scale(nearest.value, minValue, maxValue, height - padding, padding)}" r="4"><title>${escapeHtml(marker.type)} ${escapeHtml(marker.label)}</title></circle>`;
      })
      .join("")}
  </svg>`;
}

function renderChartMarkerTable(markers: ChartMarker[]) {
  return `<h2>Chart markers</h2>
  <table>
    <thead><tr><th>Pair</th><th>Time</th><th>Type</th><th>Label</th></tr></thead>
    <tbody>${markers
      .map(
        (marker) =>
          `<tr><td>${escapeHtml(marker.pair)}</td><td>${escapeHtml(formatEuropeParisDateTime(marker.at))}</td><td>${escapeHtml(marker.type)}</td><td>${escapeHtml(marker.label)}</td></tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function groupSnapshotsByPair(snapshots: MarketSnapshotRecord[]) {
  const grouped = new Map<string, MarketSnapshotRecord[]>();
  for (const snapshot of snapshots) {
    const pairSnapshots = grouped.get(snapshot.pair) ?? [];
    pairSnapshots.push(snapshot);
    grouped.set(snapshot.pair, pairSnapshots);
  }
  return grouped;
}

function latestSnapshotMarketCap(snapshots: MarketSnapshotRecord[]) {
  return snapshots.length === 0
    ? undefined
    : snapshotHighMarketCap(snapshots[snapshots.length - 1]);
}

function maxSnapshotMarketCap(snapshots: MarketSnapshotRecord[]) {
  return maxNumber(snapshots.map(snapshotHighMarketCap));
}

function minSnapshotMarketCap(snapshots: MarketSnapshotRecord[]) {
  return minNumber(snapshots.map(snapshotLowMarketCap));
}

function snapshotHighMarketCap(snapshot: MarketSnapshotRecord) {
  return numberMetric(snapshot, "highMarketCapUsd") ?? numberMetric(snapshot, "marketCapUsd");
}

function snapshotLowMarketCap(snapshot: MarketSnapshotRecord) {
  return numberMetric(snapshot, "lowMarketCapUsd") ?? numberMetric(snapshot, "marketCapUsd");
}

function numberMetric(snapshot: MarketSnapshotRecord, key: string) {
  const value = snapshot.metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberEntry(position: SimulatedPositionRecord, key: string) {
  const value = position.entry[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringEntry(position: SimulatedPositionRecord, key: string) {
  const value = position.entry[key];
  return typeof value === "string" ? value : undefined;
}

function dateEntry(position: SimulatedPositionRecord, key: string) {
  const value = stringEntry(position, key);
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function pnlMultiple(entryMarketCapUsd: number | undefined, marketCapUsd: number | undefined) {
  if (!entryMarketCapUsd || marketCapUsd === undefined) {
    return undefined;
  }
  return (marketCapUsd - entryMarketCapUsd) / entryMarketCapUsd;
}

function ratioMultiple(entryMarketCapUsd: number | undefined, marketCapUsd: number | undefined) {
  if (!entryMarketCapUsd || marketCapUsd === undefined) {
    return undefined;
  }
  return marketCapUsd / entryMarketCapUsd;
}

function drawdownPercent(
  entryMarketCapUsd: number | undefined,
  lowMarketCapUsd: number | undefined,
) {
  if (!entryMarketCapUsd || lowMarketCapUsd === undefined || lowMarketCapUsd >= entryMarketCapUsd) {
    return 0;
  }
  return ((entryMarketCapUsd - lowMarketCapUsd) / entryMarketCapUsd) * 100;
}

function maxNumber(values: Array<number | undefined>) {
  const numbers = values.filter((value): value is number => value !== undefined);
  return numbers.length === 0 ? undefined : Math.max(...numbers);
}

function minNumber(values: Array<number | undefined>) {
  const numbers = values.filter((value): value is number => value !== undefined);
  return numbers.length === 0 ? undefined : Math.min(...numbers);
}

function nearestPoint(points: Array<{ at: Date; value: number }>, at: Date) {
  return points.reduce((nearest, point) =>
    Math.abs(point.at.getTime() - at.getTime()) < Math.abs(nearest.at.getTime() - at.getTime())
      ? point
      : nearest,
  );
}

function scale(value: number, min: number, max: number, low: number, high: number) {
  if (min === max) {
    return (low + high) / 2;
  }
  return low + ((value - min) / (max - min)) * (high - low);
}

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function formatFileTimestamp(date: Date) {
  const parts = parisDateParts(date);
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

function formatEuropeParisDateTime(date: Date) {
  const parts = parisDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function parisDateParts(date: Date) {
  const parts = new Map(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );

  return {
    year: parts.get("year") ?? "0000",
    month: parts.get("month") ?? "00",
    day: parts.get("day") ?? "00",
    hour: parts.get("hour") ?? "00",
    minute: parts.get("minute") ?? "00",
    second: parts.get("second") ?? "00",
  };
}

function formatCsvValue(value: string | number | Date | undefined) {
  if (value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return formatEuropeParisDateTime(value);
  }
  if (typeof value === "number") {
    return formatNumber(value);
  }
  return value;
}

function formatNumber(value: number | undefined) {
  if (value === undefined) {
    return "";
  }
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, "");
}

function escapeCsvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
