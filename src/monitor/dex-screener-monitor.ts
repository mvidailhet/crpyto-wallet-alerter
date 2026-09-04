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
  dataSourceFailuresRecorded: number;
  backoffActive: boolean;
  simulation: SimulateTradeSetupsResult;
};

export type SkippedPairReason = "too-young" | "low-liquidity" | "low-volume" | "missing-market-cap";

export type RunDexScreenerMonitorOnceOptions = {
  databasePath?: string;
  dataDirectory?: string;
  strategy: StrategyConfig;
  fetchPairs?: () => Promise<DexScreenerPair[]>;
  capturedAt?: Date;
  blockNumber?: bigint;
  scannerName?: string;
  adapterName?: string;
};

export type StartDexScreenerMonitorOptions = RunDexScreenerMonitorOnceOptions & {
  runOnce?: () => Promise<void>;
  stop?: () => void;
  writeLine?: (line: string) => void;
};

const robinhoodChainId = "robinhood";
const defaultScannerName = "dex-screener-monitor";
const defaultAdapterName = "dex-screener";
const maximumBackoffMs = 15 * 60 * 1000;

export async function runDexScreenerMonitorOnce(options: RunDexScreenerMonitorOnceOptions) {
  const capturedAt = options.capturedAt ?? new Date();
  const blockNumber = options.blockNumber ?? BigInt(Math.floor(capturedAt.getTime() / 1000));
  const scanner = options.scannerName ?? defaultScannerName;
  const adapter = options.adapterName ?? defaultAdapterName;
  const storage = initializeSimulationStorage({
    databasePath: options.databasePath,
    dataDirectory: options.dataDirectory,
  });

  try {
    const existingFailure = storage
      .getResumeState()
      .dataSourceFailures.find(
        (failure) => failure.adapter === adapter && failure.recoveredAt === undefined,
      );
    if (existingFailure && existingFailure.nextRetryAt > capturedAt) {
      const simulation = storage.simulateTradeSetups(options.strategy);
      storage.saveScanHealth({
        scanner,
        lastScannedAt: capturedAt,
        lastScannedBlock: blockNumber,
        status: `backoff:${adapter}`,
      });
      return {
        snapshotsStored: 0,
        skippedPairs: 0,
        dataSourceFailuresRecorded: 0,
        backoffActive: true,
        simulation,
      };
    }

    let pairs: DexScreenerPair[];
    try {
      pairs = (await (options.fetchPairs ?? fetchDexScreenerRobinhoodPairs)())
        .filter((pair) => pair.chainId === robinhoodChainId)
        .sort((left, right) => oneHourVolumeUsd(right) - oneHourVolumeUsd(left))
        .slice(0, options.strategy.topPairsByOneHourVolume);
    } catch (error) {
      const consecutiveFailures = (existingFailure?.consecutiveFailures ?? 0) + 1;
      const nextRetryAt = new Date(capturedAt.getTime() + backoffMilliseconds(consecutiveFailures));
      const message = error instanceof Error ? error.message : String(error);
      storage.saveDataSourceFailure({
        adapter,
        scanner,
        failedAt: capturedAt,
        consecutiveFailures,
        nextRetryAt,
        error: message,
      });
      storage.saveScanGap({
        id: `${scanner}:${adapter}:${scanGapStartedAt(capturedAt, options.strategy).toISOString()}:${capturedAt.toISOString()}:data-source-failure`,
        scanner,
        startedAt: scanGapStartedAt(capturedAt, options.strategy),
        endedAt: capturedAt,
        reason: `data-source-failure:${adapter}`,
      });
      const simulation = storage.simulateTradeSetups(options.strategy);
      storage.saveScanHealth({
        scanner,
        lastScannedAt: capturedAt,
        lastScannedBlock: blockNumber,
        status: `failed:${adapter}`,
      });
      return {
        snapshotsStored: 0,
        skippedPairs: 0,
        dataSourceFailuresRecorded: 1,
        backoffActive: true,
        simulation,
      };
    }

    storage.saveDataSourceRecovery(adapter, capturedAt);
    let skippedPairs = 0;
    const observedAthByPair = observedAthMarketCaps(storage.getResumeState().marketSnapshots);

    for (const pair of pairs) {
      const metrics = toSnapshotMetrics(pair, capturedAt, observedAthByPair.get(pair.pairAddress));
      storage.saveMarketSnapshot({
        pair: pair.pairAddress,
        capturedAt,
        blockNumber,
        metrics,
      });

      const skippedReason = skippedPairReason(metrics, options.strategy);
      if (skippedReason) {
        skippedPairs += 1;
        storage.saveSkippedPairSummary({
          id: `${scanner}:${pair.pairAddress}:${capturedAt.toISOString()}:${skippedReason}`,
          scanner,
          pair: pair.pairAddress,
          scannedAt: capturedAt,
          reason: skippedReason,
          details: metrics,
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
      skippedPairs,
      dataSourceFailuresRecorded: 0,
      backoffActive: false,
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
        `Stored ${result.snapshotsStored} snapshot(s), skipped ${result.skippedPairs} pair(s), recorded ${result.dataSourceFailuresRecorded} data-source failure(s), created ${result.simulation.tradeSetupsCreated} trade setup(s), opened ${result.simulation.positionsOpened} simulated position(s).`,
      );
    });

  const tick = async () => {
    if (stopped || running) {
      return;
    }
    running = true;
    try {
      await runOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.writeLine?.(`Monitor scan failed: ${message}`);
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

type ObservedAth = {
  marketCapUsd: number;
  capturedAt: string;
};

function toSnapshotMetrics(pair: DexScreenerPair, capturedAt: Date, previousAth?: ObservedAth) {
  const pairAgeHours =
    pair.pairCreatedAt === undefined
      ? undefined
      : (capturedAt.getTime() - pair.pairCreatedAt) / 3_600_000;
  const marketCapUsd = pair.marketCap ?? pair.fdv;
  const observedAth =
    marketCapUsd !== undefined &&
    (previousAth === undefined || marketCapUsd > previousAth.marketCapUsd)
      ? { marketCapUsd, capturedAt: capturedAt.toISOString() }
      : previousAth;

  return {
    chainId: pair.chainId,
    dexId: pair.dexId,
    url: pair.url,
    baseToken: pair.baseToken,
    quoteToken: pair.quoteToken,
    priceUsd: pair.priceUsd === undefined ? undefined : Number.parseFloat(pair.priceUsd),
    marketCapUsd,
    fdvUsd: pair.fdv,
    athMarketCapUsd: observedAth?.marketCapUsd,
    athCapturedAt: observedAth?.capturedAt,
    pairAgeHours,
    liquidityUsd: pair.liquidity?.usd,
    oneHourVolumeUsd: oneHourVolumeUsd(pair),
  };
}

function skippedPairReason(
  metrics: ReturnType<typeof toSnapshotMetrics>,
  strategy: StrategyConfig,
): SkippedPairReason | undefined {
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

function backoffMilliseconds(consecutiveFailures: number) {
  return Math.min(2 ** consecutiveFailures * 60 * 1000, maximumBackoffMs);
}

function scanGapStartedAt(capturedAt: Date, strategy: StrategyConfig) {
  return new Date(capturedAt.getTime() - strategy.scanIntervalMinutes * 60 * 1000);
}

function observedAthMarketCaps(
  snapshots: {
    pair: string;
    capturedAt: Date;
    metrics: Record<string, unknown>;
  }[],
) {
  const observed = new Map<string, ObservedAth>();
  for (const snapshot of snapshots) {
    const marketCapUsd = snapshot.metrics.marketCapUsd;
    if (typeof marketCapUsd !== "number" || !Number.isFinite(marketCapUsd)) {
      continue;
    }

    const existing = observed.get(snapshot.pair);
    if (existing === undefined || marketCapUsd > existing.marketCapUsd) {
      observed.set(snapshot.pair, {
        marketCapUsd,
        capturedAt: snapshot.capturedAt.toISOString(),
      });
    }
  }
  return observed;
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
