import { describe, expect, it } from "vitest";

import { aggregateWalletSummaries } from "../analysis/summaries.js";
import { inferTargetTokenTrade } from "../analysis/trades.js";
import type { DecodedV3Swap, TargetTokenTrade } from "../types/evm.js";

const baseSwap: DecodedV3Swap = {
  pool: "0x00000000000000000000000000000000000000aa",
  transactionHash: "0x1000000000000000000000000000000000000000000000000000000000000000",
  blockNumber: 1n,
  timestamp: new Date("2026-09-01T12:00:00.000Z"),
  token0: "0x0000000000000000000000000000000000000001",
  token1: "0x0000000000000000000000000000000000000002",
  amount0: -100n,
  amount1: 200n,
  transactionFrom: "0x00000000000000000000000000000000000000b0",
};

describe("V3 buy/sell inference", () => {
  it("treats negative target token amount as a buy", () => {
    expect(inferTargetTokenTrade(baseSwap, baseSwap.token0)).toMatchObject({
      buyer: baseSwap.transactionFrom,
      targetAmountBought: 100n,
      quoteToken: baseSwap.token1,
      quoteAmountSpent: 200n,
    });
  });

  it("ignores swaps where the target token moved into the pool", () => {
    expect(
      inferTargetTokenTrade({ ...baseSwap, amount0: 100n, amount1: -200n }, baseSwap.token0),
    ).toBeUndefined();
  });
});

describe("wallet summary aggregation", () => {
  it("aggregates buys by transaction-from wallet", () => {
    const trades: TargetTokenTrade[] = [
      {
        buyer: baseSwap.transactionFrom,
        transactionHash: baseSwap.transactionHash,
        timestamp: new Date("2026-09-01T12:00:00.000Z"),
        targetAmountBought: 100n,
        quoteToken: baseSwap.token1,
        quoteAmountSpent: 200n,
        pool: baseSwap.pool,
      },
      {
        buyer: baseSwap.transactionFrom,
        transactionHash: "0x2000000000000000000000000000000000000000000000000000000000000000",
        timestamp: new Date("2026-09-01T13:00:00.000Z"),
        targetAmountBought: 300n,
        quoteToken: baseSwap.token1,
        quoteAmountSpent: 600n,
        pool: baseSwap.pool,
      },
    ];

    const [summary] = aggregateWalletSummaries(trades);

    expect(summary.buyCount).toBe(2);
    expect(summary.totalTargetTokenBought).toBe(400n);
    expect(summary.quoteTotals.get(baseSwap.token1)).toBe(800n);
    expect(summary.firstBuyTimestamp.toISOString()).toBe("2026-09-01T12:00:00.000Z");
    expect(summary.lastBuyTimestamp.toISOString()).toBe("2026-09-01T13:00:00.000Z");
    expect(summary.transactionHashes).toHaveLength(2);
  });
});
