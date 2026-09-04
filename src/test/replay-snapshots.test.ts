import { describe, expect, it } from "vitest";

import { reconstructReplaySnapshots } from "../analysis/replay-snapshots.js";
import type { DecodedV3Swap } from "../types/evm.js";

const token = "0x0000000000000000000000000000000000000001";
const quote = "0x0000000000000000000000000000000000000002";
const pair = "0x00000000000000000000000000000000000000aa";

describe("historical replay snapshot reconstruction", () => {
  it("aggregates manually selected pair swaps into coarse replay candles", () => {
    const snapshots = reconstructReplaySnapshots({
      pair: {
        tokenAddress: token,
        pairAddress: pair,
        symbol: "RUN",
        ranAt: new Date("2026-09-01T12:00:00.000Z"),
      },
      resolution: { minutes: 15 },
      quoteTokenPricesUsd: new Map([[quote, 2]]),
      swaps: [
        swap({
          amount0: -100n,
          amount1: 200n,
          blockNumber: 10n,
          timestamp: "2026-09-01T12:01:00.000Z",
        }),
        swap({
          amount0: -100n,
          amount1: 300n,
          blockNumber: 11n,
          timestamp: "2026-09-01T12:14:00.000Z",
        }),
        swap({
          amount0: -100n,
          amount1: 150n,
          blockNumber: 12n,
          timestamp: "2026-09-01T12:16:00.000Z",
        }),
      ],
    });

    expect(snapshots).toEqual([
      {
        pair: "0x00000000000000000000000000000000000000AA",
        capturedAt: new Date("2026-09-01T12:00:00.000Z"),
        blockNumber: 11n,
        metrics: {
          source: "historical-replay",
          tokenAddress: token,
          symbol: "RUN",
          openPriceUsd: 4,
          highPriceUsd: 6,
          lowPriceUsd: 4,
          closePriceUsd: 6,
          marketCapUsd: 6,
          highMarketCapUsd: 6,
          lowMarketCapUsd: 4,
          oneHourVolumeUsd: 1000,
          swapCount: 2,
          confidence: "medium",
        },
      },
      expect.objectContaining({
        capturedAt: new Date("2026-09-01T12:15:00.000Z"),
        blockNumber: 12n,
        metrics: expect.objectContaining({
          openPriceUsd: 3,
          closePriceUsd: 3,
          oneHourVolumeUsd: 300,
          swapCount: 1,
        }),
      }),
    ]);
  });

  it("marks candles as low confidence when quote prices are missing", () => {
    const [snapshot] = reconstructReplaySnapshots({
      pair: {
        tokenAddress: token,
        pairAddress: pair,
        ranAt: new Date("2026-09-01T12:00:00.000Z"),
      },
      resolution: { minutes: 60 },
      swaps: [swap({ amount0: -100n, amount1: 200n })],
    });

    expect(snapshot.metrics).toMatchObject({
      confidence: "low",
      lowConfidenceReasons: ["missing-quote-price"],
      oneHourVolumeUsd: 0,
      swapCount: 1,
    });
  });
});

type SwapOverrides = Partial<Omit<DecodedV3Swap, "timestamp">> & {
  timestamp?: Date | string;
};

function swap(overrides: SwapOverrides): DecodedV3Swap {
  const { timestamp: rawTimestamp, ...rest } = overrides;
  const timestamp =
    typeof rawTimestamp === "string"
      ? new Date(rawTimestamp)
      : (rawTimestamp ?? new Date("2026-09-01T12:01:00.000Z"));

  return {
    pool: pair,
    transactionHash: "0x1000000000000000000000000000000000000000000000000000000000000000",
    blockNumber: 1n,
    timestamp,
    token0: token,
    token1: quote,
    amount0: -100n,
    amount1: 200n,
    transactionFrom: "0x00000000000000000000000000000000000000b0",
    ...rest,
  };
}
