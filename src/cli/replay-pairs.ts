#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { getAddress } from "viem";

import { reconstructReplaySnapshots } from "../analysis/replay-snapshots.js";
import { loadConfig } from "../config/env.js";
import { fetchV3Swaps } from "../dex/v3/swaps.js";
import { generateSimulationReports } from "../reports/simulation-reports.js";
import { chunkBlockRange } from "../rpc/blocks.js";
import { loadStrategyConfig } from "../strategies/configs.js";
import {
  initializeSimulationStorage,
  type ManualReplayPairImport,
  type ManualReplayPairLabel,
  type ManualReplayPairRecord,
  type ResumeState,
} from "../storage/simulation-storage.js";
import type { DecodedV3Swap, DiscoveredPool } from "../types/evm.js";

type ReplayPairsCommandOptions = {
  databasePath?: string;
  dataDirectory?: string;
  reportsDirectory?: string;
  configDirectory?: string;
  generatedAt?: Date;
  writeLine?: (line: string) => void;
  fetchReplaySwaps?: (args: {
    pools: DiscoveredPool[];
    fromBlock: bigint;
    toBlock: bigint;
    chunkSize: bigint;
  }) => Promise<DecodedV3Swap[]>;
};

const labels = new Set<ManualReplayPairLabel>(["runner", "failed", "unknown"]);

export async function runReplayPairsCommand(
  args: string[],
  options: ReplayPairsCommandOptions = {},
) {
  const writeLine = options.writeLine ?? console.log;
  const command = args[0];

  if (command === "import") {
    const csvPath = readFlag(args, "--csv");
    if (!csvPath) {
      throw new Error("Usage: npm run replay-pairs -- import --csv pairs.csv");
    }

    const records = parseManualReplayPairsCsv(await readFile(csvPath, "utf8"));
    const storage = initializeSimulationStorage({
      databasePath: options.databasePath,
      dataDirectory: options.dataDirectory,
    });

    try {
      const result = storage.importManualReplayPairs(records);
      writeLine(
        `Imported ${records.length} manual replay pair(s): ${result.inserted} inserted, ${result.updated} updated.`,
      );
    } finally {
      storage.close();
    }
    return;
  }

  if (command === "list") {
    const storage = initializeSimulationStorage({
      databasePath: options.databasePath,
      dataDirectory: options.dataDirectory,
    });

    try {
      writeLine("tokenAddress,pairAddress,symbol,label,notes,ranAt");
      for (const record of storage.listManualReplayPairs()) {
        writeLine(formatManualReplayPairCsvRow(record));
      }
    } finally {
      storage.close();
    }
    return;
  }

  if (command === "report") {
    const storage = initializeSimulationStorage({
      databasePath: options.databasePath,
      dataDirectory: options.dataDirectory,
    });

    try {
      const report = await generateSimulationReports(storage.getResumeState(), {
        reportsDirectory: options.reportsDirectory,
        generatedAt: options.generatedAt,
      });
      writeLine(`Wrote simulation reports: ${report.htmlPath} and ${report.csvPath}.`);
    } finally {
      storage.close();
    }
    return;
  }

  if (command === "run") {
    const strategyVersions = readRepeatedFlag(args, "--strategy");
    if (strategyVersions.length === 0) {
      throw new Error("Usage: npm run replay-pairs -- run --strategy baseline-96h");
    }

    const storage = initializeSimulationStorage({
      databasePath: options.databasePath,
      dataDirectory: options.dataDirectory,
    });

    try {
      for (const version of strategyVersions) {
        const strategy = await loadStrategyConfig(version, {
          configDirectory: options.configDirectory,
        });
        storage.simulateTradeSetups(strategy);
      }

      const state = storage.getResumeState();
      const summary = summarizeReplayOutcomes(state, strategyVersions);
      const report = await generateSimulationReports(state, {
        reportsDirectory: options.reportsDirectory,
        generatedAt: options.generatedAt,
      });
      writeLine(
        `Ran ${strategyVersions.length} strategy version(s): ${summary.triggered} triggered, ${summary.filled} filled, ${summary.stopped} stopped, ${summary.takeProfitHits} take-profit hit, ${summary.moonbags} moonbag, ${summary.missed} missed.`,
      );
      writeLine(`Wrote simulation reports: ${report.htmlPath} and ${report.csvPath}.`);
    } finally {
      storage.close();
    }
    return;
  }

  if (command === "reconstruct") {
    const fromBlock = readBigIntFlag(args, "--from-block");
    const toBlock = readBigIntFlag(args, "--to-block");
    const resolutionMinutes = readIntegerFlag(args, "--resolution-minutes") ?? 15;
    const chunkSize = readBigIntFlag(args, "--chunk-size") ?? 100n;
    const quoteToken = readFlag(args, "--quote-token");
    const quotePriceUsd = readNumberFlag(args, "--quote-price-usd");
    if (fromBlock === undefined || toBlock === undefined) {
      throw new Error(
        "Usage: npm run replay-pairs -- reconstruct --from-block 1 --to-block 2 [--resolution-minutes 15] [--chunk-size 100] [--quote-token 0x... --quote-price-usd 1]",
      );
    }
    if ((quoteToken === undefined) !== (quotePriceUsd === undefined)) {
      throw new Error("--quote-token and --quote-price-usd must be provided together");
    }
    const quoteTokenPricesUsd =
      quoteToken === undefined || quotePriceUsd === undefined
        ? new Map<string, number>()
        : new Map([[getAddress(quoteToken), quotePriceUsd]]);

    const storage = initializeSimulationStorage({
      databasePath: options.databasePath,
      dataDirectory: options.dataDirectory,
    });

    try {
      let snapshotsStored = 0;
      let skippedPairs = 0;

      for (const replayPair of storage.listManualReplayPairs()) {
        if (!replayPair.pairAddress) {
          storage.saveSkippedPairSummary({
            id: `historical-replay:${replayPair.tokenAddress}:missing-pair-address`,
            scanner: "historical-replay",
            pair: replayPair.tokenAddress,
            scannedAt: new Date(),
            reason: "missing-pair-address",
            details: { symbol: replayPair.symbol, label: replayPair.label },
          });
          skippedPairs += 1;
          continue;
        }

        const pairAddress = getAddress(replayPair.pairAddress);
        const progress = storage.getHistoricalReplayProgress(pairAddress);
        const replayFromBlock =
          progress && progress.toBlock >= fromBlock ? progress.toBlock + 1n : fromBlock;
        if (replayFromBlock > toBlock) {
          continue;
        }

        const pools: DiscoveredPool[] = [
          {
            token: getAddress(replayPair.tokenAddress),
            quoteToken: "0x0000000000000000000000000000000000000000",
            fee: 0,
            pool: pairAddress,
          },
        ];
        let lowConfidenceSnapshots = 0;
        for (const chunk of chunkBlockRange(replayFromBlock, toBlock, chunkSize)) {
          const swaps = await fetchReplaySwaps(options, {
            pools,
            fromBlock: chunk.fromBlock,
            toBlock: chunk.toBlock,
            chunkSize,
          });
          const snapshots = reconstructReplaySnapshots({
            pair: {
              tokenAddress: replayPair.tokenAddress,
              pairAddress,
              symbol: replayPair.symbol,
              ranAt: replayPair.ranAt,
            },
            swaps,
            resolution: { minutes: resolutionMinutes },
            quoteTokenPricesUsd,
          });

          for (const snapshot of snapshots) {
            storage.saveMarketSnapshot(snapshot);
            snapshotsStored += 1;
            if (snapshot.metrics.confidence === "low") {
              lowConfidenceSnapshots += 1;
            }
          }

          storage.saveHistoricalReplayProgress({
            pair: pairAddress,
            fromBlock,
            toBlock: chunk.toBlock,
            updatedAt: new Date(),
          });
        }
        if (lowConfidenceSnapshots > 0) {
          storage.saveSkippedPairSummary({
            id: `historical-replay:${pairAddress}:low-confidence-reconstruction`,
            scanner: "historical-replay",
            pair: pairAddress,
            scannedAt: new Date(),
            reason: "low-confidence-reconstruction",
            details: { lowConfidenceSnapshots },
          });
        }
      }

      writeLine(
        `Reconstructed ${snapshotsStored} historical replay snapshot(s), skipped ${skippedPairs} manual replay pair(s).`,
      );
    } finally {
      storage.close();
    }
    return;
  }

  throw new Error(
    "Usage: npm run replay-pairs -- <import --csv pairs.csv | list | report | reconstruct | run --strategy baseline-96h>",
  );
}

export function parseManualReplayPairsCsv(csv: string): ManualReplayPairImport[] {
  const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim() !== ""));
  const [headers, ...dataRows] = rows;

  if (!headers) {
    throw new Error("CSV must include a header row");
  }

  const headerIndexes = new Map(headers.map((header, index) => [header.trim(), index]));
  for (const requiredHeader of ["tokenAddress", "symbol", "label", "ranAt"]) {
    if (!headerIndexes.has(requiredHeader)) {
      throw new Error(`CSV is missing required header "${requiredHeader}"`);
    }
  }

  return dataRows.map((row, index) => toManualReplayPairImport(row, headerIndexes, index + 2));
}

function toManualReplayPairImport(
  row: string[],
  headerIndexes: Map<string, number>,
  rowNumber: number,
): ManualReplayPairImport {
  const tokenAddress = requiredCell(row, headerIndexes, "tokenAddress", rowNumber);
  const pairAddress = optionalCell(row, headerIndexes, "pairAddress");
  const symbol = requiredCell(row, headerIndexes, "symbol", rowNumber);
  const label = requiredCell(row, headerIndexes, "label", rowNumber);
  const ranAtText = requiredCell(row, headerIndexes, "ranAt", rowNumber);
  const ranAt = new Date(ranAtText);

  try {
    getAddress(tokenAddress);
  } catch {
    throw new Error(`Row ${rowNumber} has invalid tokenAddress "${tokenAddress}"`);
  }

  if (pairAddress) {
    try {
      getAddress(pairAddress);
    } catch {
      throw new Error(`Row ${rowNumber} has invalid pairAddress "${pairAddress}"`);
    }
  }

  if (!labels.has(label as ManualReplayPairLabel)) {
    throw new Error(`Row ${rowNumber} has unsupported label "${label}"`);
  }

  if (Number.isNaN(ranAt.getTime())) {
    throw new Error(`Row ${rowNumber} has invalid ranAt "${ranAtText}"`);
  }

  return {
    tokenAddress,
    pairAddress,
    symbol,
    label: label as ManualReplayPairLabel,
    notes: optionalCell(row, headerIndexes, "notes"),
    ranAt,
  };
}

function requiredCell(
  row: string[],
  headerIndexes: Map<string, number>,
  header: string,
  rowNumber: number,
) {
  const value = optionalCell(row, headerIndexes, header);
  if (!value) {
    throw new Error(`Row ${rowNumber} is missing ${header}`);
  }
  return value;
}

function optionalCell(row: string[], headerIndexes: Map<string, number>, header: string) {
  const index = headerIndexes.get(header);
  const value = index === undefined ? undefined : row[index]?.trim();
  return value ? value : undefined;
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (inQuotes) {
    throw new Error("CSV contains an unclosed quoted field");
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function formatManualReplayPairCsvRow(record: ManualReplayPairRecord) {
  return [
    record.tokenAddress,
    record.pairAddress ?? "",
    record.symbol ?? "",
    record.label,
    record.notes ?? "",
    formatEuropeParisDateTime(record.ranAt),
  ]
    .map(escapeCsvCell)
    .join(",");
}

function escapeCsvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function formatEuropeParisDateTime(date: Date) {
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

  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}T${parts.get("hour")}:${parts.get("minute")}:${parts.get("second")}`;
}

function readFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function readRepeatedFlag(args: string[], flag: string) {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) {
      const value = args[index + 1];
      if (value) {
        values.push(value);
      }
    }
  }
  return values;
}

function summarizeReplayOutcomes(state: ResumeState, strategyVersionIds: string[]) {
  const manualPairsWithAddresses = state.manualReplayPairs.filter(
    (pair): pair is ManualReplayPairRecord & { pairAddress: string } => Boolean(pair.pairAddress),
  );
  const summary = {
    triggered: 0,
    filled: 0,
    stopped: 0,
    takeProfitHits: 0,
    moonbags: 0,
    missed: 0,
  };

  for (const strategyVersionId of strategyVersionIds) {
    for (const pair of manualPairsWithAddresses) {
      const setup = state.tradeSetups.find(
        (candidate) =>
          candidate.strategyVersionId === strategyVersionId && candidate.pair === pair.pairAddress,
      );
      if (!setup) {
        summary.missed += 1;
        continue;
      }

      summary.triggered += 1;
      const positions = state.simulatedPositions.filter(
        (position) => position.tradeSetupId === setup.id,
      );
      if (positions.length > 0) {
        summary.filled += 1;
      }
      if (positions.some((position) => position.entry.exitReason === "stop-loss")) {
        summary.stopped += 1;
      }
      if (positions.some((position) => position.entry.exitReason === "take-profit")) {
        summary.takeProfitHits += 1;
      }
      if (positions.some((position) => position.status === "moonbag")) {
        summary.moonbags += 1;
      }
    }
  }

  return summary;
}

function readBigIntFlag(args: string[], flag: string) {
  const value = readFlag(args, flag);
  return value === undefined ? undefined : BigInt(value);
}

function readIntegerFlag(args: string[], flag: string) {
  const value = readFlag(args, flag);
  return value === undefined ? undefined : Number.parseInt(value, 10);
}

function readNumberFlag(args: string[], flag: string) {
  const value = readFlag(args, flag);
  return value === undefined ? undefined : Number.parseFloat(value);
}

async function fetchReplaySwaps(
  options: ReplayPairsCommandOptions,
  args: {
    pools: DiscoveredPool[];
    fromBlock: bigint;
    toBlock: bigint;
    chunkSize: bigint;
  },
) {
  if (options.fetchReplaySwaps) {
    return options.fetchReplaySwaps(args);
  }
  const config = loadConfig();
  const { createRobinhoodClient } = await import("../rpc/client.js");
  return fetchV3Swaps({
    client: createRobinhoodClient(config.rpcUrl, config.rpcTimeoutMs),
    ...args,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  runReplayPairsCommand(process.argv.slice(2), {
    databasePath: config.simulationDatabasePath,
    dataDirectory: config.simulationDataDirectory,
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
