import { initializeSimulationStorage } from "../storage/simulation-storage.js";
import type { SimulateTradeSetupsResult } from "../storage/simulation-storage.js";
import type { StrategyConfig } from "../strategies/configs.js";

export type DexScreenerToken = {
  address: string;
  name: string;
  symbol: string;
};

export type DexScreenerPair = {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: DexScreenerToken;
  quoteToken: DexScreenerToken;
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  volume?: {
    h1?: number;
  };
  liquidity?: {
    usd?: number;
  };
};

export type DexScreenerMonitorScanResult = {
  snapshotsStored: number;
  skippedPairs: number;
  simulation: SimulateTradeSetupsResult;
};

export type RunDexScreenerMonitorOnceOptions = {
  databasePath?: string;
  dataDirectory?: string;
  strategy: StrategyConfig;
  fetchPairs?: () => Promise<DexScreenerPair[]>;
  capturedAt?: Date;
  blockNumber?: bigint;
  scannerName?: string;
};

export type StartDexScreenerMonitorOptions = RunDexScreenerMonitorOnceOptions & {
  runOnce?: () => Promise<void>;
  stop?: () => void;
  writeLine?: (line: string) => void;
};

const robinhoodChainId = "robinhood";
const defaultScannerName = "dex-screener-monitor";

export async function runDexScreenerMonitorOnce(options: RunDexScreenerMonitorOnceOptions) {
  const capturedAt = options.capturedAt ?? new Date();
  const blockNumber = options.blockNumber ?? BigInt(Math.floor(capturedAt.getTime() / 1000));
  const scanner = options.scannerName ?? defaultScannerName;
  const pairs = (await (options.fetchPairs ?? fetchDexScreenerRobinhoodPairs)())
    .filter((pair) => pair.chainId === robinhoodChainId)
    .sort((left, right) => oneHourVolumeUsd(right) - oneHourVolumeUsd(left))
    .slice(0, options.strategy.topPairsByOneHourVolume);
  const storage = initializeSimulationStorage({
    databasePath: options.databasePath,
    dataDirectory: options.dataDirectory,
  });

  try {
    for (const pair of pairs) {
      storage.saveMarketSnapshot({
        pair: pair.pairAddress,
        capturedAt,
        blockNumber,
        metrics: toSnapshotMetrics(pair, capturedAt),
      });

      const skippedReason = skippedPairReason(pair, capturedAt, options.strategy);
      if (skippedReason) {
        storage.saveSkippedPairSummary({
          id: `${scanner}:${pair.pairAddress}:${capturedAt.toISOString()}:${skippedReason}`,
          scanner,
          pair: pair.pairAddress,
          scannedAt: capturedAt,
          reason: skippedReason,
          details: toSnapshotMetrics(pair, capturedAt),
        });
      }
    }

    const simulation = storage.simulateTradeSetups(options.strategy);
    storage.saveScanHealth({
      scanner,
      lastScannedAt: capturedAt,
      lastScannedBlock: blockNumber,
      status: "ok",
    });

    return {
      snapshotsStored: pairs.length,
      skippedPairs: pairs.filter((pair) => skippedPairReason(pair, capturedAt, options.strategy))
        .length,
      simulation,
    };
  } finally {
    storage.close();
  }
}

export function startDexScreenerMonitor(options: StartDexScreenerMonitorOptions) {
  let stopped = false;
  let running = false;
  const intervalMs = options.strategy.scanIntervalMinutes * 60 * 1000;
  const runOnce =
    options.runOnce ??
    (async () => {
      const result = await runDexScreenerMonitorOnce(options);
      options.writeLine?.(
        `Stored ${result.snapshotsStored} snapshot(s), skipped ${result.skippedPairs} pair(s), created ${result.simulation.tradeSetupsCreated} trade setup(s), opened ${result.simulation.positionsOpened} simulated position(s).`,
      );
    });

  const tick = async () => {
    if (stopped || running) {
      return;
    }
    running = true;
    try {
      await runOnce();
    } finally {
      running = false;
    }
  };

  const immediateTimer = setTimeout(() => void tick(), 0);
  const intervalTimer = setInterval(() => void tick(), intervalMs);

  return {
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      clearTimeout(immediateTimer);
      clearInterval(intervalTimer);
      options.stop?.();
    },
  };
}

export async function fetchDexScreenerRobinhoodPairs(): Promise<DexScreenerPair[]> {
  const response = await fetch("https://api.dexscreener.com/latest/dex/search?q=robinhood");
  if (!response.ok) {
    throw new Error(`DEX Screener request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { pairs?: unknown };
  if (!Array.isArray(payload.pairs)) {
    return [];
  }
  return payload.pairs.filter(isDexScreenerPair);
}

function toSnapshotMetrics(pair: DexScreenerPair, capturedAt: Date) {
  const pairAgeHours =
    pair.pairCreatedAt === undefined
      ? undefined
      : (capturedAt.getTime() - pair.pairCreatedAt) / 3_600_000;
  const marketCapUsd = pair.marketCap ?? pair.fdv;

  return {
    chainId: pair.chainId,
    dexId: pair.dexId,
    url: pair.url,
    baseToken: pair.baseToken,
    quoteToken: pair.quoteToken,
    priceUsd: pair.priceUsd === undefined ? undefined : Number.parseFloat(pair.priceUsd),
    marketCapUsd,
    fdvUsd: pair.fdv,
    athMarketCapUsd: marketCapUsd,
    athCapturedAt:
      pair.pairCreatedAt === undefined
        ? capturedAt.toISOString()
        : new Date(pair.pairCreatedAt).toISOString(),
    pairAgeHours,
    liquidityUsd: pair.liquidity?.usd,
    oneHourVolumeUsd: oneHourVolumeUsd(pair),
  };
}

function skippedPairReason(pair: DexScreenerPair, capturedAt: Date, strategy: StrategyConfig) {
  const metrics = toSnapshotMetrics(pair, capturedAt);
  if (metrics.pairAgeHours === undefined || metrics.pairAgeHours < strategy.minimumPairAgeHours) {
    return "too-young";
  }
  if (metrics.liquidityUsd === undefined || metrics.liquidityUsd < strategy.minimumLiquidityUsd) {
    return "low-liquidity";
  }
  if (
    metrics.oneHourVolumeUsd === undefined ||
    metrics.oneHourVolumeUsd < strategy.minimumOneHourVolumeUsd
  ) {
    return "low-volume";
  }
  if (metrics.marketCapUsd === undefined) {
    return "missing-market-cap";
  }
  return undefined;
}

function oneHourVolumeUsd(pair: DexScreenerPair) {
  return pair.volume?.h1 ?? 0;
}

function isDexScreenerPair(value: unknown): value is DexScreenerPair {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.chainId === robinhoodChainId &&
    typeof value.dexId === "string" &&
    typeof value.url === "string" &&
    typeof value.pairAddress === "string" &&
    isToken(value.baseToken) &&
    isToken(value.quoteToken)
  );
}

function isToken(value: unknown): value is DexScreenerToken {
  return (
    isRecord(value) &&
    typeof value.address === "string" &&
    typeof value.name === "string" &&
    typeof value.symbol === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
