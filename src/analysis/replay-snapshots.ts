import { getAddress, type Address } from "viem";

import type { DecodedV3Swap } from "../types/evm.js";

export type HistoricalReplayPair = {
  tokenAddress: string;
  pairAddress: string;
  ranAt: Date;
  symbol?: string;
};

export type ReplayCandleResolution = {
  minutes: number;
};

export type ReconstructReplaySnapshotsOptions = {
  pair: HistoricalReplayPair;
  swaps: DecodedV3Swap[];
  resolution: ReplayCandleResolution;
  quoteTokenPricesUsd?: Map<string, number>;
};

export type ReconstructedReplaySnapshot = {
  pair: string;
  capturedAt: Date;
  blockNumber: bigint;
  metrics: {
    source: "historical-replay";
    tokenAddress: string;
    symbol?: string;
    openPriceUsd?: number;
    highPriceUsd?: number;
    lowPriceUsd?: number;
    closePriceUsd?: number;
    oneHourVolumeUsd: number;
    swapCount: number;
    confidence: "medium" | "low";
    lowConfidenceReasons?: string[];
  };
};

export function reconstructReplaySnapshots({
  pair,
  swaps,
  resolution,
  quoteTokenPricesUsd = new Map(),
}: ReconstructReplaySnapshotsOptions): ReconstructedReplaySnapshot[] {
  if (!Number.isInteger(resolution.minutes) || resolution.minutes <= 0) {
    throw new Error("Replay candle resolution must be a positive whole number of minutes");
  }

  const tokenAddress = getAddress(pair.tokenAddress);
  const pairAddress = getAddress(pair.pairAddress);
  const bucketMillis = resolution.minutes * 60_000;
  const candles = new Map<number, CandleBuilder>();

  for (const swap of swaps) {
    if (getAddress(swap.pool) !== pairAddress) {
      continue;
    }

    const price = priceUsdFromSwap(swap, tokenAddress as Address, quoteTokenPricesUsd);
    const bucketStart = Math.floor(swap.timestamp.getTime() / bucketMillis) * bucketMillis;
    const existing = candles.get(bucketStart) ?? {
      prices: [],
      blockNumber: swap.blockNumber,
      oneHourVolumeUsd: 0,
      swapCount: 0,
      lowConfidenceReasons: new Set<string>(),
    };

    existing.blockNumber =
      existing.blockNumber > swap.blockNumber ? existing.blockNumber : swap.blockNumber;
    existing.swapCount += 1;

    if (price) {
      existing.prices.push(price.priceUsd);
      existing.oneHourVolumeUsd += price.volumeUsd;
    } else {
      existing.lowConfidenceReasons.add("missing-quote-price");
    }

    candles.set(bucketStart, existing);
  }

  return Array.from(candles.entries())
    .sort(([left], [right]) => left - right)
    .map(([bucketStart, candle]) =>
      toReplaySnapshot(pair, tokenAddress, pairAddress, bucketStart, candle),
    );
}

type CandleBuilder = {
  prices: number[];
  blockNumber: bigint;
  oneHourVolumeUsd: number;
  swapCount: number;
  lowConfidenceReasons: Set<string>;
};

function toReplaySnapshot(
  pair: HistoricalReplayPair,
  tokenAddress: string,
  pairAddress: string,
  bucketStart: number,
  candle: CandleBuilder,
): ReconstructedReplaySnapshot {
  const [openPriceUsd] = candle.prices;
  const closePriceUsd = candle.prices.at(-1);
  const lowPriceUsd = candle.prices.length > 0 ? Math.min(...candle.prices) : undefined;
  const highPriceUsd = candle.prices.length > 0 ? Math.max(...candle.prices) : undefined;
  const lowConfidenceReasons = Array.from(candle.lowConfidenceReasons).sort();

  const metrics: ReconstructedReplaySnapshot["metrics"] = {
    source: "historical-replay",
    tokenAddress,
    symbol: pair.symbol,
    openPriceUsd,
    highPriceUsd,
    lowPriceUsd,
    closePriceUsd,
    oneHourVolumeUsd: roundUsd(candle.oneHourVolumeUsd),
    swapCount: candle.swapCount,
    confidence: lowConfidenceReasons.length > 0 ? "low" : "medium",
  };
  if (lowConfidenceReasons.length > 0) {
    metrics.lowConfidenceReasons = lowConfidenceReasons;
  }

  return {
    pair: pairAddress,
    capturedAt: new Date(bucketStart),
    blockNumber: candle.blockNumber,
    metrics,
  };
}

function priceUsdFromSwap(
  swap: DecodedV3Swap,
  targetToken: Address,
  quoteTokenPricesUsd: Map<string, number>,
) {
  const token0 = getAddress(swap.token0);
  const token1 = getAddress(swap.token1);
  const targetIsToken0 = targetToken === token0;
  const targetIsToken1 = targetToken === token1;

  if (!targetIsToken0 && !targetIsToken1) {
    return undefined;
  }

  const targetAmount = absolute(targetIsToken0 ? swap.amount0 : swap.amount1);
  const quoteAmount = absolute(targetIsToken0 ? swap.amount1 : swap.amount0);
  const quoteToken = targetIsToken0 ? token1 : token0;
  const quotePriceUsd = quoteTokenPricesUsd.get(quoteToken);

  if (targetAmount === 0n || quoteAmount === 0n || quotePriceUsd === undefined) {
    return undefined;
  }

  const priceUsd = (Number(quoteAmount) * quotePriceUsd) / Number(targetAmount);
  return {
    priceUsd,
    volumeUsd: Number(quoteAmount) * quotePriceUsd,
  };
}

function absolute(value: bigint) {
  return value < 0n ? -value : value;
}

function roundUsd(value: number) {
  return Math.round(value * 100) / 100;
}
