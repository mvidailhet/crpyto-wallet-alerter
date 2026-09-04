#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { getAddress } from "viem";

import { loadConfig } from "../config/env.js";
import {
  initializeSimulationStorage,
  type ManualReplayPairImport,
  type ManualReplayPairLabel,
  type ManualReplayPairRecord,
} from "../storage/simulation-storage.js";

type ReplayPairsCommandOptions = {
  databasePath?: string;
  dataDirectory?: string;
  writeLine?: (line: string) => void;
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

  throw new Error("Usage: npm run replay-pairs -- <import --csv pairs.csv | list>");
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
