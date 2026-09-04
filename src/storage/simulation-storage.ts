import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAddress } from "viem";

import type { PlannedBuyLevel, StrategyConfig } from "../strategies/configs.js";

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

export type DataSourceFailureRecord = {
  adapter: string;
  scanner: string;
  failedAt: Date;
  consecutiveFailures: number;
  nextRetryAt: Date;
  recoveredAt?: Date;
  error: string;
};

export type MarketSnapshotRecord = {
  pair: string;
  capturedAt: Date;
  blockNumber: bigint;
  metrics: JsonObject;
};

export type WalletChain = "robinhood";

export type InterestingWalletRecord = {
  wallet: string;
  chain: WalletChain;
  updatedAt: Date;
  evidence: JsonObject;
};

export type SaveInterestingWalletInput = Omit<InterestingWalletRecord, "chain"> & {
  chain?: WalletChain;
};

export type WalletEvidenceRecord = {
  id: string;
  wallet: string;
  chain: WalletChain;
  kind: string;
  observedAt: Date;
  source: string;
  detail: JsonObject;
};

export type SaveWalletEvidenceInput = Omit<WalletEvidenceRecord, "chain"> & {
  chain?: WalletChain;
};

export type ManualTag = "interesting" | "ignored";

export type WalletTagRecord = {
  wallet: string;
  chain: WalletChain;
  tag: ManualTag;
  notes?: string;
  updatedAt: Date;
};

export type SaveWalletTagInput = Omit<WalletTagRecord, "chain"> & { chain?: WalletChain };

export type PairTagRecord = {
  pair: string;
  chain: WalletChain;
  tag: ManualTag;
  notes?: string;
  updatedAt: Date;
};

export type SavePairTagInput = Omit<PairTagRecord, "chain"> & { chain?: WalletChain };

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

export type SimulateTradeSetupsResult = {
  tradeSetupsCreated: number;
  tradeSetupsUpdated: number;
  positionsOpened: number;
  positionsClosed: number;
};

export type SimulateTradeSetupsOptions = {
  pairs?: Set<string>;
  snapshotSource?: string;
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

export type ManualReplayPairLabel = "runner" | "failed" | "unknown";

export type ManualReplayPairImport = {
  tokenAddress: string;
  pairAddress?: string;
  symbol?: string;
  label: ManualReplayPairLabel;
  notes?: string;
  ranAt: Date;
};

export type ManualReplayPairRecord = ManualReplayPairImport;

export type ManualReplayPairImportResult = {
  inserted: number;
  updated: number;
};

export type HistoricalReplayProgressRecord = {
  pair: string;
  fromBlock: bigint;
  toBlock: bigint;
  updatedAt: Date;
};

export type ResumeState = {
  strategyVersions: StrategyVersionRecord[];
  scanHealth: ScanHealthRecord[];
  dataSourceFailures: DataSourceFailureRecord[];
  marketSnapshots: MarketSnapshotRecord[];
  interestingWallets: InterestingWalletRecord[];
  walletEvidence: WalletEvidenceRecord[];
  walletTags: WalletTagRecord[];
  pairTags: PairTagRecord[];
  manualReplayPairs: ManualReplayPairRecord[];
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

type DataSourceFailureRow = {
  adapter: string;
  scanner: string;
  failed_at: string;
  consecutive_failures: number;
  next_retry_at: string;
  recovered_at: string | null;
  error: string;
};

type MarketSnapshotRow = {
  pair: string;
  captured_at: string;
  block_number: string;
  metrics_json: string;
};

type InterestingWalletRow = {
  wallet: string;
  chain: string;
  updated_at: string;
  evidence_json: string;
};

type WalletEvidenceRow = {
  id: string;
  wallet: string;
  chain: string;
  kind: string;
  observed_at: string;
  source: string;
  detail_json: string;
};

type ManualTagRow = {
  chain: string;
  tag: ManualTag;
  notes: string | null;
  updated_at: string;
};

type WalletTagRow = ManualTagRow & { wallet: string };

type PairTagRow = ManualTagRow & { pair: string };

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

type StoredSimulatedPosition = SimulatedPositionRecord & {
  pair: string;
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

type ManualReplayPairRow = {
  id: string;
  token_address: string;
  pair_address: string | null;
  symbol: string | null;
  label: ManualReplayPairLabel;
  notes: string | null;
  ran_at: string;
};

type HistoricalReplayProgressRow = {
  pair: string;
  from_block: string;
  to_block: string;
  updated_at: string;
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
  ensureColumn(database, "data_source_failures", "recovered_at", "TEXT");
  ensureColumn(database, "interesting_wallets", "chain", "TEXT NOT NULL DEFAULT 'robinhood'");

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

    saveDataSourceFailure(record: DataSourceFailureRecord) {
      database
        .prepare(
          `INSERT INTO data_source_failures (
             adapter, scanner, failed_at, consecutive_failures, next_retry_at, recovered_at, error
           )
           VALUES (@adapter, @scanner, @failedAt, @consecutiveFailures, @nextRetryAt, NULL, @error)
           ON CONFLICT(adapter) DO UPDATE SET
             scanner = excluded.scanner,
             failed_at = excluded.failed_at,
             consecutive_failures = excluded.consecutive_failures,
             next_retry_at = excluded.next_retry_at,
             recovered_at = excluded.recovered_at,
             error = excluded.error`,
        )
        .run({
          adapter: record.adapter,
          scanner: record.scanner,
          failedAt: toUtc(record.failedAt),
          consecutiveFailures: record.consecutiveFailures,
          nextRetryAt: toUtc(record.nextRetryAt),
          error: record.error,
        });
    },

    saveDataSourceRecovery(adapter: string, recoveredAt: Date) {
      database
        .prepare(
          `UPDATE data_source_failures
           SET recovered_at = @recoveredAt
           WHERE adapter = @adapter`,
        )
        .run({ adapter, recoveredAt: toUtc(recoveredAt) });
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

    saveHistoricalReplayProgress(record: HistoricalReplayProgressRecord) {
      database
        .prepare(
          `INSERT INTO historical_replay_progress (pair, from_block, to_block, updated_at)
           VALUES (@pair, @fromBlock, @toBlock, @updatedAt)
           ON CONFLICT(pair) DO UPDATE SET
             from_block = excluded.from_block,
             to_block = excluded.to_block,
             updated_at = excluded.updated_at`,
        )
        .run({
          pair: record.pair,
          fromBlock: record.fromBlock.toString(),
          toBlock: record.toBlock.toString(),
          updatedAt: toUtc(record.updatedAt),
        });
    },

    getHistoricalReplayProgress(pair: string): HistoricalReplayProgressRecord | undefined {
      const row = database
        .prepare("SELECT * FROM historical_replay_progress WHERE pair = @pair")
        .get({ pair }) as HistoricalReplayProgressRow | undefined;
      return row ? toHistoricalReplayProgressRecord(row) : undefined;
    },

    saveInterestingWallet(record: SaveInterestingWalletInput) {
      database
        .prepare(
          `INSERT INTO interesting_wallets (wallet, chain, updated_at, evidence_json)
           VALUES (@wallet, @chain, @updatedAt, @evidenceJson)
           ON CONFLICT(wallet) DO UPDATE SET
             chain = excluded.chain,
             updated_at = excluded.updated_at,
             evidence_json = excluded.evidence_json`,
        )
        .run({
          wallet: record.wallet,
          chain: record.chain ?? "robinhood",
          updatedAt: toUtc(record.updatedAt),
          evidenceJson: JSON.stringify(record.evidence),
        });
    },

    saveWalletEvidence(record: SaveWalletEvidenceInput) {
      database
        .prepare(
          `INSERT INTO wallet_evidence (id, wallet, chain, kind, observed_at, source, detail_json)
           VALUES (@id, @wallet, @chain, @kind, @observedAt, @source, @detailJson)
           ON CONFLICT(id) DO UPDATE SET
             wallet = excluded.wallet,
             chain = excluded.chain,
             kind = excluded.kind,
             observed_at = excluded.observed_at,
             source = excluded.source,
             detail_json = excluded.detail_json`,
        )
        .run({
          id: record.id,
          wallet: record.wallet,
          chain: record.chain ?? "robinhood",
          kind: record.kind,
          observedAt: toUtc(record.observedAt),
          source: record.source,
          detailJson: JSON.stringify(record.detail),
        });
    },

    listWalletEvidence(): WalletEvidenceRecord[] {
      return database
        .prepare("SELECT * FROM wallet_evidence ORDER BY observed_at, id")
        .all()
        .map((row) => toWalletEvidenceRecord(row as WalletEvidenceRow));
    },

    saveWalletTag(record: SaveWalletTagInput) {
      database
        .prepare(
          `INSERT INTO wallet_tags (wallet, chain, tag, notes, updated_at)
           VALUES (@wallet, @chain, @tag, @notes, @updatedAt)
           ON CONFLICT(chain, wallet) DO UPDATE SET
             tag = excluded.tag,
             notes = excluded.notes,
             updated_at = excluded.updated_at`,
        )
        .run({
          wallet: record.wallet,
          chain: record.chain ?? "robinhood",
          tag: record.tag,
          notes: optionalText(record.notes),
          updatedAt: toUtc(record.updatedAt),
        });
    },

    listWalletTags(): WalletTagRecord[] {
      return database
        .prepare("SELECT * FROM wallet_tags ORDER BY chain, wallet")
        .all()
        .map((row) => toWalletTagRecord(row as WalletTagRow));
    },

    savePairTag(record: SavePairTagInput) {
      database
        .prepare(
          `INSERT INTO pair_tags (pair, chain, tag, notes, updated_at)
           VALUES (@pair, @chain, @tag, @notes, @updatedAt)
           ON CONFLICT(chain, pair) DO UPDATE SET
             tag = excluded.tag,
             notes = excluded.notes,
             updated_at = excluded.updated_at`,
        )
        .run({
          pair: record.pair,
          chain: record.chain ?? "robinhood",
          tag: record.tag,
          notes: optionalText(record.notes),
          updatedAt: toUtc(record.updatedAt),
        });
    },

    listPairTags(): PairTagRecord[] {
      return database
        .prepare("SELECT * FROM pair_tags ORDER BY chain, pair")
        .all()
        .map((row) => toPairTagRecord(row as PairTagRow));
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
      const result = database
        .prepare(
          `INSERT INTO alert_history (id, trade_setup_id, sent_at, channel, payload_json)
           VALUES (@id, @tradeSetupId, @sentAt, @channel, @payloadJson)
           ON CONFLICT(id) DO NOTHING`,
        )
        .run({
          id: record.id,
          tradeSetupId: record.tradeSetupId,
          sentAt: toUtc(record.sentAt),
          channel: record.channel,
          payloadJson: JSON.stringify(record.payload),
        });
      return result.changes === 1;
    },

    importManualReplayPairs(records: ManualReplayPairImport[]): ManualReplayPairImportResult {
      const findExisting = database.prepare("SELECT id FROM manual_replay_pairs WHERE id = @id");
      const saveReplayPair = database.prepare(
        `INSERT INTO manual_replay_pairs (
           id, token_address, pair_address, symbol, label, notes, ran_at, imported_at
         )
         VALUES (
           @id, @tokenAddress, @pairAddress, @symbol, @label, @notes, @ranAt,
           strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         )
         ON CONFLICT(id) DO UPDATE SET
           token_address = excluded.token_address,
           pair_address = excluded.pair_address,
           symbol = excluded.symbol,
           label = excluded.label,
           notes = excluded.notes,
           ran_at = excluded.ran_at,
           imported_at = excluded.imported_at`,
      );

      const result = { inserted: 0, updated: 0 };
      const importRecords = database.transaction((nestedRecords: ManualReplayPairImport[]) => {
        for (const record of nestedRecords) {
          const normalized = normalizeManualReplayPair(record);
          const exists = findExisting.get({ id: normalized.id }) !== undefined;
          saveReplayPair.run(normalized);
          if (exists) {
            result.updated += 1;
          } else {
            result.inserted += 1;
          }
        }
      });

      importRecords(records);
      return result;
    },

    listManualReplayPairs(): ManualReplayPairRecord[] {
      return database
        .prepare("SELECT * FROM manual_replay_pairs ORDER BY ran_at, token_address, id")
        .all()
        .map((row) => toManualReplayPairRecord(row as ManualReplayPairRow));
    },

    simulateTradeSetups(
      strategy: StrategyConfig,
      options: SimulateTradeSetupsOptions = {},
    ): SimulateTradeSetupsResult {
      const result: SimulateTradeSetupsResult = {
        tradeSetupsCreated: 0,
        tradeSetupsUpdated: 0,
        positionsOpened: 0,
        positionsClosed: 0,
      };
      const snapshots = database
        .prepare("SELECT * FROM market_snapshots ORDER BY pair, captured_at")
        .all()
        .map((row) => toMarketSnapshotRecord(row as MarketSnapshotRow))
        .filter((snapshot) => matchesSimulationOptions(snapshot, options));
      const existingTradeSetupIds = new Set(
        database
          .prepare("SELECT id FROM trade_setups WHERE strategy_version_id = @strategyVersionId")
          .all({ strategyVersionId: strategy.version })
          .map((row) => (row as { id: string }).id),
      );
      const existingPositions = listSimulatedPositionsWithPairs(database, strategy.version);
      const existingPositionIds = new Set(existingPositions.map((position) => position.id));

      database
        .prepare(
          `INSERT INTO strategy_versions (id, name, created_at, parameters_json)
           VALUES (@id, @name, @createdAt, @parametersJson)
           ON CONFLICT(id) DO NOTHING`,
        )
        .run({
          id: strategy.version,
          name: strategy.version,
          createdAt: toUtc(new Date()),
          parametersJson: JSON.stringify(strategy),
        });

      const snapshotsByPair = groupSnapshotsByPair(snapshots);
      for (const position of existingPositions) {
        if (position.status !== "open") {
          continue;
        }

        const pairSnapshots = snapshotsByPair.get(position.pair) ?? [];
        const exit = findConservativeExit(pairSnapshots, position.openedAt, {
          stopLossMarketCapUsd: requiredNumber(position.entry, "stopLossMarketCapUsd"),
          takeProfitMarketCapUsd: requiredNumber(position.entry, "takeProfitMarketCapUsd"),
        });
        if (!exit) {
          continue;
        }

        this.saveSimulatedPosition({
          ...position,
          entry: { ...position.entry, ...exit },
          status: exit.exitReason === "take-profit" ? "moonbag" : "closed",
        });
        result.positionsClosed += 1;
      }

      for (const { pairSnapshots, triggerSnapshot } of selectTradeSetupCandidates(
        snapshotsByPair,
        strategy,
      )) {
        const setupId = `${strategy.version}:${triggerSnapshot.pair}`;
        const athMarketCapUsd = Number(triggerSnapshot.metrics.athMarketCapUsd);
        const plannedBuyLevels = strategy.plannedBuyLevels.map((level) =>
          toPlannedMarketCapLevel(athMarketCapUsd, level),
        );

        this.saveTradeSetup({
          id: setupId,
          strategyVersionId: strategy.version,
          pair: triggerSnapshot.pair,
          createdAt: triggerSnapshot.capturedAt,
          plannedBuyLevels,
          trigger: {
            kind: "stored-market-snapshot",
            capturedAt: toUtc(triggerSnapshot.capturedAt),
            marketCapUsd: triggerSnapshot.metrics.marketCapUsd,
            athMarketCapUsd,
          },
        });

        if (existingTradeSetupIds.has(setupId)) {
          result.tradeSetupsUpdated += 1;
        } else {
          result.tradeSetupsCreated += 1;
          existingTradeSetupIds.add(setupId);
        }

        for (const level of plannedBuyLevels) {
          const positionId = `${setupId}:${level.marketCapUsd}`;
          if (existingPositionIds.has(positionId)) {
            continue;
          }

          const fillSnapshot = pairSnapshots.find(
            (snapshot) =>
              snapshot.capturedAt >= triggerSnapshot.capturedAt &&
              snapshotLowMarketCap(snapshot) <= level.marketCapUsd,
          );
          if (!fillSnapshot) {
            continue;
          }

          const entry = {
            marketCapUsd: level.marketCapUsd,
            allocationPercent: level.allocationPercent,
            stopLossMarketCapUsd: roundMarketCap(level.marketCapUsd * 0.7),
            takeProfitMarketCapUsd: roundMarketCap(level.marketCapUsd * 2),
            moonbagPercent: 0,
          };
          const exit = findConservativeExit(pairSnapshots, fillSnapshot.capturedAt, entry);
          this.saveSimulatedPosition({
            id: positionId,
            tradeSetupId: setupId,
            strategyVersionId: strategy.version,
            openedAt: fillSnapshot.capturedAt,
            entry: exit ? { ...entry, ...exit } : entry,
            status: exit?.exitReason === "take-profit" ? "moonbag" : exit ? "closed" : "open",
          });
          existingPositionIds.add(positionId);
          result.positionsOpened += 1;
          if (exit) {
            result.positionsClosed += 1;
          }
        }
      }

      return result;
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
        dataSourceFailures: database
          .prepare("SELECT * FROM data_source_failures ORDER BY adapter")
          .all()
          .map((row) => toDataSourceFailureRecord(row as DataSourceFailureRow)),
        marketSnapshots: database
          .prepare("SELECT * FROM market_snapshots ORDER BY captured_at, pair")
          .all()
          .map((row) => toMarketSnapshotRecord(row as MarketSnapshotRow)),
        interestingWallets: database
          .prepare("SELECT * FROM interesting_wallets ORDER BY updated_at, wallet")
          .all()
          .map((row) => toInterestingWalletRecord(row as InterestingWalletRow)),
        walletEvidence: this.listWalletEvidence(),
        walletTags: this.listWalletTags(),
        pairTags: this.listPairTags(),
        manualReplayPairs: this.listManualReplayPairs(),
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

function groupSnapshotsByPair(snapshots: MarketSnapshotRecord[]) {
  const grouped = new Map<string, MarketSnapshotRecord[]>();
  for (const snapshot of snapshots) {
    const pairSnapshots = grouped.get(snapshot.pair) ?? [];
    pairSnapshots.push(snapshot);
    grouped.set(snapshot.pair, pairSnapshots);
  }
  return grouped;
}

function matchesSimulationOptions(
  snapshot: MarketSnapshotRecord,
  options: SimulateTradeSetupsOptions,
) {
  if (options.pairs && !options.pairs.has(snapshot.pair)) {
    return false;
  }
  if (options.snapshotSource && snapshot.metrics.source !== options.snapshotSource) {
    return false;
  }
  return true;
}

function selectTradeSetupCandidates(
  snapshotsByPair: Map<string, MarketSnapshotRecord[]>,
  strategy: StrategyConfig,
) {
  return Array.from(snapshotsByPair.values())
    .map((pairSnapshots) => ({
      pairSnapshots,
      triggerSnapshot: pairSnapshots.find((snapshot) => qualifiesForStrategy(snapshot, strategy)),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        pairSnapshots: MarketSnapshotRecord[];
        triggerSnapshot: MarketSnapshotRecord;
      } => candidate.triggerSnapshot !== undefined,
    )
    .sort(
      (left, right) =>
        (numberMetric(right.triggerSnapshot, "oneHourVolumeUsd") ?? 0) -
          (numberMetric(left.triggerSnapshot, "oneHourVolumeUsd") ?? 0) ||
        left.triggerSnapshot.capturedAt.getTime() - right.triggerSnapshot.capturedAt.getTime() ||
        left.triggerSnapshot.pair.localeCompare(right.triggerSnapshot.pair),
    )
    .slice(0, strategy.maximumActiveTradeSetups);
}

function qualifiesForStrategy(snapshot: MarketSnapshotRecord, strategy: StrategyConfig) {
  const marketCapUsd = numberMetric(snapshot, "marketCapUsd");
  const athMarketCapUsd = numberMetric(snapshot, "athMarketCapUsd");
  const pairAgeHours = numberMetric(snapshot, "pairAgeHours");
  const liquidityUsd = numberMetric(snapshot, "liquidityUsd");
  const oneHourVolumeUsd = numberMetric(snapshot, "oneHourVolumeUsd");
  const athAgeHours = hoursSince(snapshot.metrics.athCapturedAt, snapshot.capturedAt);

  return (
    marketCapUsd !== undefined &&
    athMarketCapUsd !== undefined &&
    pairAgeHours !== undefined &&
    liquidityUsd !== undefined &&
    oneHourVolumeUsd !== undefined &&
    athAgeHours !== undefined &&
    pairAgeHours >= strategy.minimumPairAgeHours &&
    liquidityUsd >= strategy.minimumLiquidityUsd &&
    oneHourVolumeUsd >= strategy.minimumOneHourVolumeUsd &&
    athMarketCapUsd >= strategy.athMarketCapUsd.minimum &&
    athMarketCapUsd <= strategy.athMarketCapUsd.maximum &&
    athAgeHours >= strategy.athAgeHours.minimum &&
    athAgeHours <= strategy.athAgeHours.maximum &&
    marketCapUsd >= athMarketCapUsd * (1 - strategy.currentMarketCapWithinAthPercent / 100)
  );
}

function toPlannedMarketCapLevel(athMarketCapUsd: number, level: PlannedBuyLevel) {
  return {
    marketCapUsd: roundMarketCap(athMarketCapUsd * (1 - level.athPullbackPercent / 100)),
    athPullbackPercent: level.athPullbackPercent,
    allocationPercent: level.allocationPercent,
  };
}

function findConservativeExit(
  snapshots: MarketSnapshotRecord[],
  openedAt: Date,
  entry: {
    stopLossMarketCapUsd: number;
    takeProfitMarketCapUsd: number;
  },
) {
  for (const snapshot of snapshots) {
    if (snapshot.capturedAt <= openedAt) {
      continue;
    }

    const low = snapshotLowMarketCap(snapshot);
    const high = snapshotHighMarketCap(snapshot);
    const stopped = low <= entry.stopLossMarketCapUsd;
    const tookProfit = high >= entry.takeProfitMarketCapUsd;

    if (stopped) {
      return {
        closedAt: toUtc(snapshot.capturedAt),
        exitMarketCapUsd: entry.stopLossMarketCapUsd,
        exitReason: "stop-loss",
        moonbagPercent: 0,
      };
    }
    if (tookProfit) {
      return {
        closedAt: toUtc(snapshot.capturedAt),
        exitMarketCapUsd: entry.takeProfitMarketCapUsd,
        exitReason: "take-profit",
        moonbagPercent: 50,
      };
    }
  }
  return undefined;
}

function listSimulatedPositionsWithPairs(
  database: Database.Database,
  strategyVersionId: string,
): StoredSimulatedPosition[] {
  return database
    .prepare(
      `SELECT
         simulated_positions.*,
         trade_setups.pair
       FROM simulated_positions
       JOIN trade_setups ON trade_setups.id = simulated_positions.trade_setup_id
       WHERE simulated_positions.strategy_version_id = @strategyVersionId
       ORDER BY simulated_positions.opened_at, simulated_positions.id`,
    )
    .all({ strategyVersionId })
    .map((row) => {
      const typedRow = row as SimulatedPositionRow & { pair: string };
      return {
        ...toSimulatedPositionRecord(typedRow),
        pair: typedRow.pair,
      };
    });
}

function requiredNumber(value: JsonObject, key: string) {
  const metric = value[key];
  if (typeof metric !== "number" || !Number.isFinite(metric)) {
    throw new Error(`Simulated position entry is missing ${key}`);
  }
  return metric;
}

function snapshotLowMarketCap(snapshot: MarketSnapshotRecord) {
  return (
    numberMetric(snapshot, "lowMarketCapUsd") ??
    numberMetric(snapshot, "marketCapUsd") ??
    Number.POSITIVE_INFINITY
  );
}

function snapshotHighMarketCap(snapshot: MarketSnapshotRecord) {
  return (
    numberMetric(snapshot, "highMarketCapUsd") ??
    numberMetric(snapshot, "marketCapUsd") ??
    Number.NEGATIVE_INFINITY
  );
}

function numberMetric(snapshot: MarketSnapshotRecord, key: string) {
  const value = snapshot.metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function hoursSince(value: unknown, capturedAt: Date) {
  if (typeof value !== "string") {
    return undefined;
  }
  const startedAt = new Date(value);
  if (Number.isNaN(startedAt.getTime())) {
    return undefined;
  }
  return (capturedAt.getTime() - startedAt.getTime()) / 3_600_000;
}

function roundMarketCap(value: number) {
  if (value >= 1_000_000) {
    return Math.round(value / 1_000_000) * 1_000_000;
  }
  if (value >= 100_000) {
    return Math.round(value / 100_000) * 100_000;
  }
  return Math.round(value);
}

function ensureColumn(
  database: Database.Database,
  table: string,
  column: string,
  definition: string,
) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some((existingColumn) => existingColumn.name === column)) {
    return;
  }
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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

CREATE TABLE IF NOT EXISTS data_source_failures (
  adapter TEXT PRIMARY KEY,
  scanner TEXT NOT NULL,
  failed_at TEXT NOT NULL,
  consecutive_failures INTEGER NOT NULL,
  next_retry_at TEXT NOT NULL,
  recovered_at TEXT,
  error TEXT NOT NULL
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
  chain TEXT NOT NULL DEFAULT 'robinhood',
  updated_at TEXT NOT NULL,
  evidence_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_evidence (
  id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'robinhood',
  kind TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source TEXT NOT NULL,
  detail_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_tags (
  wallet TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'robinhood',
  tag TEXT NOT NULL CHECK (tag IN ('interesting', 'ignored')),
  notes TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (chain, wallet)
);

CREATE TABLE IF NOT EXISTS pair_tags (
  pair TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'robinhood',
  tag TEXT NOT NULL CHECK (tag IN ('interesting', 'ignored')),
  notes TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (chain, pair)
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

CREATE TABLE IF NOT EXISTS manual_replay_pairs (
  id TEXT PRIMARY KEY,
  token_address TEXT NOT NULL,
  pair_address TEXT,
  symbol TEXT,
  label TEXT NOT NULL CHECK (label IN ('runner', 'failed', 'unknown')),
  notes TEXT,
  ran_at TEXT NOT NULL,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS historical_replay_progress (
  pair TEXT PRIMARY KEY,
  from_block TEXT NOT NULL,
  to_block TEXT NOT NULL,
  updated_at TEXT NOT NULL
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

function toDataSourceFailureRecord(row: DataSourceFailureRow): DataSourceFailureRecord {
  return {
    adapter: row.adapter,
    scanner: row.scanner,
    failedAt: new Date(row.failed_at),
    consecutiveFailures: row.consecutive_failures,
    nextRetryAt: new Date(row.next_retry_at),
    recoveredAt: row.recovered_at === null ? undefined : new Date(row.recovered_at),
    error: row.error,
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
    chain: (row.chain as WalletChain) ?? "robinhood",
    updatedAt: new Date(row.updated_at),
    evidence: parseJson<JsonObject>(row.evidence_json),
  };
}

function toWalletEvidenceRecord(row: WalletEvidenceRow): WalletEvidenceRecord {
  return {
    id: row.id,
    wallet: row.wallet,
    chain: (row.chain as WalletChain) ?? "robinhood",
    kind: row.kind,
    observedAt: new Date(row.observed_at),
    source: row.source,
    detail: parseJson<JsonObject>(row.detail_json),
  };
}

function toWalletTagRecord(row: WalletTagRow): WalletTagRecord {
  return {
    wallet: row.wallet,
    chain: (row.chain as WalletChain) ?? "robinhood",
    tag: row.tag,
    notes: row.notes ?? undefined,
    updatedAt: new Date(row.updated_at),
  };
}

function toPairTagRecord(row: PairTagRow): PairTagRecord {
  return {
    pair: row.pair,
    chain: (row.chain as WalletChain) ?? "robinhood",
    tag: row.tag,
    notes: row.notes ?? undefined,
    updatedAt: new Date(row.updated_at),
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

function normalizeManualReplayPair(record: ManualReplayPairImport) {
  const tokenAddress = getAddress(record.tokenAddress);
  const pairAddress = record.pairAddress ? getAddress(record.pairAddress) : undefined;

  if (!["runner", "failed", "unknown"].includes(record.label)) {
    throw new Error(`Unsupported manual replay pair label: ${record.label}`);
  }

  if (Number.isNaN(record.ranAt.getTime())) {
    throw new Error(`Invalid manual replay pair ranAt for ${tokenAddress}`);
  }

  return {
    id: `${tokenAddress}:${pairAddress ?? ""}`,
    tokenAddress,
    pairAddress: pairAddress ?? null,
    symbol: optionalText(record.symbol),
    label: record.label,
    notes: optionalText(record.notes),
    ranAt: toUtc(record.ranAt),
  };
}

function optionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toManualReplayPairRecord(row: ManualReplayPairRow): ManualReplayPairRecord {
  return {
    tokenAddress: row.token_address,
    pairAddress: row.pair_address ?? undefined,
    symbol: row.symbol ?? undefined,
    label: row.label,
    notes: row.notes ?? undefined,
    ranAt: new Date(row.ran_at),
  };
}

function toHistoricalReplayProgressRecord(
  row: HistoricalReplayProgressRow,
): HistoricalReplayProgressRecord {
  return {
    pair: row.pair,
    fromBlock: BigInt(row.from_block),
    toBlock: BigInt(row.to_block),
    updatedAt: new Date(row.updated_at),
  };
}
