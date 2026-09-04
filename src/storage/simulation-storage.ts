import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

type JsonObject = Record<string, unknown>;

export type SimulationStorageOptions = {
  databasePath?: string;
  dataDirectory?: string;
};

export type StrategyVersionRecord = {
  id: string;
  name: string;
  createdAt: Date;
  parameters: JsonObject;
};

export type ScanHealthRecord = {
  scanner: string;
  lastScannedAt: Date;
  lastScannedBlock: bigint;
  status: string;
};

export type MarketSnapshotRecord = {
  pair: string;
  capturedAt: Date;
  blockNumber: bigint;
  metrics: JsonObject;
};

export type InterestingWalletRecord = {
  wallet: string;
  updatedAt: Date;
  evidence: JsonObject;
};

export type TradeSetupRecord = {
  id: string;
  strategyVersionId: string;
  pair: string;
  createdAt: Date;
  plannedBuyLevels: unknown[];
  trigger: JsonObject;
};

export type SimulatedPositionRecord = {
  id: string;
  tradeSetupId: string;
  strategyVersionId: string;
  openedAt: Date;
  entry: JsonObject;
  status: string;
};

export type ScanGapRecord = {
  id: string;
  scanner: string;
  startedAt: Date;
  endedAt: Date;
  reason: string;
};

export type SkippedPairSummaryRecord = {
  id: string;
  scanner: string;
  pair: string;
  scannedAt: Date;
  reason: string;
  details: JsonObject;
};

export type AlertHistoryRecord = {
  id: string;
  tradeSetupId: string;
  sentAt: Date;
  channel: string;
  payload: JsonObject;
};

export type ResumeState = {
  strategyVersions: StrategyVersionRecord[];
  scanHealth: ScanHealthRecord[];
  marketSnapshots: MarketSnapshotRecord[];
  interestingWallets: InterestingWalletRecord[];
  tradeSetups: TradeSetupRecord[];
  simulatedPositions: SimulatedPositionRecord[];
  scanGaps: ScanGapRecord[];
  skippedPairSummaries: SkippedPairSummaryRecord[];
  alertHistory: AlertHistoryRecord[];
};

type StrategyVersionRow = {
  id: string;
  name: string;
  created_at: string;
  parameters_json: string;
};

type ScanHealthRow = {
  scanner: string;
  last_scanned_at: string;
  last_scanned_block: string;
  status: string;
};

type MarketSnapshotRow = {
  pair: string;
  captured_at: string;
  block_number: string;
  metrics_json: string;
};

type InterestingWalletRow = {
  wallet: string;
  updated_at: string;
  evidence_json: string;
};

type TradeSetupRow = {
  id: string;
  strategy_version_id: string;
  pair: string;
  created_at: string;
  planned_buy_levels_json: string;
  trigger_json: string;
};

type SimulatedPositionRow = {
  id: string;
  trade_setup_id: string;
  strategy_version_id: string;
  opened_at: string;
  entry_json: string;
  status: string;
};

type ScanGapRow = {
  id: string;
  scanner: string;
  started_at: string;
  ended_at: string;
  reason: string;
};

type SkippedPairSummaryRow = {
  id: string;
  scanner: string;
  pair: string;
  scanned_at: string;
  reason: string;
  details_json: string;
};

type AlertHistoryRow = {
  id: string;
  trade_setup_id: string;
  sent_at: string;
  channel: string;
  payload_json: string;
};

export function resolveSimulationDatabasePath(options: SimulationStorageOptions = {}) {
  return (
    options.databasePath ??
    join(options.dataDirectory ?? join(process.cwd(), "data"), "simulation.sqlite")
  );
}

export function initializeSimulationStorage(options: SimulationStorageOptions = {}) {
  const databasePath = resolveSimulationDatabasePath(options);
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(schemaSql);

  return {
    databasePath,

    close() {
      database.close();
    },

    listTables() {
      return database
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map((row) => (row as { name: string }).name);
    },

    saveStrategyVersion(record: StrategyVersionRecord) {
      database
        .prepare(
          `INSERT INTO strategy_versions (id, name, created_at, parameters_json)
           VALUES (@id, @name, @createdAt, @parametersJson)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             created_at = excluded.created_at,
             parameters_json = excluded.parameters_json`,
        )
        .run({
          id: record.id,
          name: record.name,
          createdAt: toUtc(record.createdAt),
          parametersJson: JSON.stringify(record.parameters),
        });
    },

    saveScanHealth(record: ScanHealthRecord) {
      database
        .prepare(
          `INSERT INTO scan_health (scanner, last_scanned_at, last_scanned_block, status)
           VALUES (@scanner, @lastScannedAt, @lastScannedBlock, @status)
           ON CONFLICT(scanner) DO UPDATE SET
             last_scanned_at = excluded.last_scanned_at,
             last_scanned_block = excluded.last_scanned_block,
             status = excluded.status`,
        )
        .run({
          scanner: record.scanner,
          lastScannedAt: toUtc(record.lastScannedAt),
          lastScannedBlock: record.lastScannedBlock.toString(),
          status: record.status,
        });
    },

    saveMarketSnapshot(record: MarketSnapshotRecord) {
      database
        .prepare(
          `INSERT INTO market_snapshots (pair, captured_at, block_number, metrics_json)
           VALUES (@pair, @capturedAt, @blockNumber, @metricsJson)
           ON CONFLICT(pair, captured_at) DO UPDATE SET
             block_number = excluded.block_number,
             metrics_json = excluded.metrics_json`,
        )
        .run({
          pair: record.pair,
          capturedAt: toUtc(record.capturedAt),
          blockNumber: record.blockNumber.toString(),
          metricsJson: JSON.stringify(record.metrics),
        });
    },

    saveInterestingWallet(record: InterestingWalletRecord) {
      database
        .prepare(
          `INSERT INTO interesting_wallets (wallet, updated_at, evidence_json)
           VALUES (@wallet, @updatedAt, @evidenceJson)
           ON CONFLICT(wallet) DO UPDATE SET
             updated_at = excluded.updated_at,
             evidence_json = excluded.evidence_json`,
        )
        .run({
          wallet: record.wallet,
          updatedAt: toUtc(record.updatedAt),
          evidenceJson: JSON.stringify(record.evidence),
        });
    },

    saveTradeSetup(record: TradeSetupRecord) {
      database
        .prepare(
          `INSERT INTO trade_setups (
             id, strategy_version_id, pair, created_at, planned_buy_levels_json, trigger_json
           )
           VALUES (@id, @strategyVersionId, @pair, @createdAt, @plannedBuyLevelsJson, @triggerJson)
           ON CONFLICT(id) DO UPDATE SET
             strategy_version_id = excluded.strategy_version_id,
             pair = excluded.pair,
             created_at = excluded.created_at,
             planned_buy_levels_json = excluded.planned_buy_levels_json,
             trigger_json = excluded.trigger_json`,
        )
        .run({
          id: record.id,
          strategyVersionId: record.strategyVersionId,
          pair: record.pair,
          createdAt: toUtc(record.createdAt),
          plannedBuyLevelsJson: JSON.stringify(record.plannedBuyLevels),
          triggerJson: JSON.stringify(record.trigger),
        });
    },

    saveSimulatedPosition(record: SimulatedPositionRecord) {
      database
        .prepare(
          `INSERT INTO simulated_positions (
             id, trade_setup_id, strategy_version_id, opened_at, entry_json, status
           )
           VALUES (@id, @tradeSetupId, @strategyVersionId, @openedAt, @entryJson, @status)
           ON CONFLICT(id) DO UPDATE SET
             trade_setup_id = excluded.trade_setup_id,
             strategy_version_id = excluded.strategy_version_id,
             opened_at = excluded.opened_at,
             entry_json = excluded.entry_json,
             status = excluded.status`,
        )
        .run({
          id: record.id,
          tradeSetupId: record.tradeSetupId,
          strategyVersionId: record.strategyVersionId,
          openedAt: toUtc(record.openedAt),
          entryJson: JSON.stringify(record.entry),
          status: record.status,
        });
    },

    saveScanGap(record: ScanGapRecord) {
      database
        .prepare(
          `INSERT INTO scan_gaps (id, scanner, started_at, ended_at, reason)
           VALUES (@id, @scanner, @startedAt, @endedAt, @reason)
           ON CONFLICT(id) DO UPDATE SET
             scanner = excluded.scanner,
             started_at = excluded.started_at,
             ended_at = excluded.ended_at,
             reason = excluded.reason`,
        )
        .run({
          id: record.id,
          scanner: record.scanner,
          startedAt: toUtc(record.startedAt),
          endedAt: toUtc(record.endedAt),
          reason: record.reason,
        });
    },

    saveSkippedPairSummary(record: SkippedPairSummaryRecord) {
      database
        .prepare(
          `INSERT INTO skipped_pair_summaries (id, scanner, pair, scanned_at, reason, details_json)
           VALUES (@id, @scanner, @pair, @scannedAt, @reason, @detailsJson)
           ON CONFLICT(id) DO UPDATE SET
             scanner = excluded.scanner,
             pair = excluded.pair,
             scanned_at = excluded.scanned_at,
             reason = excluded.reason,
             details_json = excluded.details_json`,
        )
        .run({
          id: record.id,
          scanner: record.scanner,
          pair: record.pair,
          scannedAt: toUtc(record.scannedAt),
          reason: record.reason,
          detailsJson: JSON.stringify(record.details),
        });
    },

    saveAlertHistory(record: AlertHistoryRecord) {
      database
        .prepare(
          `INSERT INTO alert_history (id, trade_setup_id, sent_at, channel, payload_json)
           VALUES (@id, @tradeSetupId, @sentAt, @channel, @payloadJson)
           ON CONFLICT(id) DO UPDATE SET
             trade_setup_id = excluded.trade_setup_id,
             sent_at = excluded.sent_at,
             channel = excluded.channel,
             payload_json = excluded.payload_json`,
        )
        .run({
          id: record.id,
          tradeSetupId: record.tradeSetupId,
          sentAt: toUtc(record.sentAt),
          channel: record.channel,
          payloadJson: JSON.stringify(record.payload),
        });
    },

    getResumeState(): ResumeState {
      return {
        strategyVersions: database
          .prepare("SELECT * FROM strategy_versions ORDER BY created_at, id")
          .all()
          .map((row) => toStrategyVersionRecord(row as StrategyVersionRow)),
        scanHealth: database
          .prepare("SELECT * FROM scan_health ORDER BY scanner")
          .all()
          .map((row) => toScanHealthRecord(row as ScanHealthRow)),
        marketSnapshots: database
          .prepare("SELECT * FROM market_snapshots ORDER BY captured_at, pair")
          .all()
          .map((row) => toMarketSnapshotRecord(row as MarketSnapshotRow)),
        interestingWallets: database
          .prepare("SELECT * FROM interesting_wallets ORDER BY updated_at, wallet")
          .all()
          .map((row) => toInterestingWalletRecord(row as InterestingWalletRow)),
        tradeSetups: database
          .prepare("SELECT * FROM trade_setups ORDER BY created_at, id")
          .all()
          .map((row) => toTradeSetupRecord(row as TradeSetupRow)),
        simulatedPositions: database
          .prepare("SELECT * FROM simulated_positions ORDER BY opened_at, id")
          .all()
          .map((row) => toSimulatedPositionRecord(row as SimulatedPositionRow)),
        scanGaps: database
          .prepare("SELECT * FROM scan_gaps ORDER BY started_at, id")
          .all()
          .map((row) => toScanGapRecord(row as ScanGapRow)),
        skippedPairSummaries: database
          .prepare("SELECT * FROM skipped_pair_summaries ORDER BY scanned_at, id")
          .all()
          .map((row) => toSkippedPairSummaryRecord(row as SkippedPairSummaryRow)),
        alertHistory: database
          .prepare("SELECT * FROM alert_history ORDER BY sent_at, id")
          .all()
          .map((row) => toAlertHistoryRecord(row as AlertHistoryRow)),
      };
    },
  };
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS strategy_versions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  parameters_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_health (
  scanner TEXT PRIMARY KEY,
  last_scanned_at TEXT NOT NULL,
  last_scanned_block TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  pair TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  block_number TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  PRIMARY KEY (pair, captured_at)
);

CREATE TABLE IF NOT EXISTS interesting_wallets (
  wallet TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  evidence_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_setups (
  id TEXT PRIMARY KEY,
  strategy_version_id TEXT NOT NULL,
  pair TEXT NOT NULL,
  created_at TEXT NOT NULL,
  planned_buy_levels_json TEXT NOT NULL,
  trigger_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS simulated_positions (
  id TEXT PRIMARY KEY,
  trade_setup_id TEXT NOT NULL,
  strategy_version_id TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  entry_json TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_gaps (
  id TEXT PRIMARY KEY,
  scanner TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skipped_pair_summaries (
  id TEXT PRIMARY KEY,
  scanner TEXT NOT NULL,
  pair TEXT NOT NULL,
  scanned_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  details_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_history (
  id TEXT PRIMARY KEY,
  trade_setup_id TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  channel TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
`;

function toUtc(value: Date) {
  return value.toISOString();
}

function parseJson<T>(value: string) {
  return JSON.parse(value) as T;
}

function toStrategyVersionRecord(row: StrategyVersionRow): StrategyVersionRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: new Date(row.created_at),
    parameters: parseJson<JsonObject>(row.parameters_json),
  };
}

function toScanHealthRecord(row: ScanHealthRow): ScanHealthRecord {
  return {
    scanner: row.scanner,
    lastScannedAt: new Date(row.last_scanned_at),
    lastScannedBlock: BigInt(row.last_scanned_block),
    status: row.status,
  };
}

function toMarketSnapshotRecord(row: MarketSnapshotRow): MarketSnapshotRecord {
  return {
    pair: row.pair,
    capturedAt: new Date(row.captured_at),
    blockNumber: BigInt(row.block_number),
    metrics: parseJson<JsonObject>(row.metrics_json),
  };
}

function toInterestingWalletRecord(row: InterestingWalletRow): InterestingWalletRecord {
  return {
    wallet: row.wallet,
    updatedAt: new Date(row.updated_at),
    evidence: parseJson<JsonObject>(row.evidence_json),
  };
}

function toTradeSetupRecord(row: TradeSetupRow): TradeSetupRecord {
  return {
    id: row.id,
    strategyVersionId: row.strategy_version_id,
    pair: row.pair,
    createdAt: new Date(row.created_at),
    plannedBuyLevels: parseJson<unknown[]>(row.planned_buy_levels_json),
    trigger: parseJson<JsonObject>(row.trigger_json),
  };
}

function toSimulatedPositionRecord(row: SimulatedPositionRow): SimulatedPositionRecord {
  return {
    id: row.id,
    tradeSetupId: row.trade_setup_id,
    strategyVersionId: row.strategy_version_id,
    openedAt: new Date(row.opened_at),
    entry: parseJson<JsonObject>(row.entry_json),
    status: row.status,
  };
}

function toScanGapRecord(row: ScanGapRow): ScanGapRecord {
  return {
    id: row.id,
    scanner: row.scanner,
    startedAt: new Date(row.started_at),
    endedAt: new Date(row.ended_at),
    reason: row.reason,
  };
}

function toSkippedPairSummaryRecord(row: SkippedPairSummaryRow): SkippedPairSummaryRecord {
  return {
    id: row.id,
    scanner: row.scanner,
    pair: row.pair,
    scannedAt: new Date(row.scanned_at),
    reason: row.reason,
    details: parseJson<JsonObject>(row.details_json),
  };
}

function toAlertHistoryRecord(row: AlertHistoryRow): AlertHistoryRecord {
  return {
    id: row.id,
    tradeSetupId: row.trade_setup_id,
    sentAt: new Date(row.sent_at),
    channel: row.channel,
    payload: parseJson<JsonObject>(row.payload_json),
  };
}
