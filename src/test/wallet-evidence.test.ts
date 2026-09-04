import { describe, expect, it } from "vitest";

import { deriveHistoricalRunnerEvidence } from "../analysis/wallet-evidence.js";
import type { DecodedV3Swap } from "../types/evm.js";

const tokenAddress = "0x0000000000000000000000000000000000000001";
const quoteToken = "0x0000000000000000000000000000000000000002";
const pairAddress = "0x00000000000000000000000000000000000000aa";
const checksummedPair = "0x00000000000000000000000000000000000000AA";
const otherPair = "0x00000000000000000000000000000000000000bb";
const walletA = "0x0000000000000000000000000000000000000011";
const walletB = "0x0000000000000000000000000000000000000022";

function swap(overrides: Partial<DecodedV3Swap>): DecodedV3Swap {
  return {
    pool: pairAddress,
    transactionHash: "0x1000000000000000000000000000000000000000000000000000000000000000",
    blockNumber: 10n,
    timestamp: new Date("2026-09-01T12:00:00.000Z"),
    token0: tokenAddress,
    token1: quoteToken,
    amount0: -100n,
    amount1: 200n,
    transactionFrom: walletA,
    ...overrides,
  };
}

describe("deriveHistoricalRunnerEvidence", () => {
  it("creates one wallet-evidence event per wallet that bought the runner pair", () => {
    const evidence = deriveHistoricalRunnerEvidence({
      pair: {
        tokenAddress,
        pairAddress,
        symbol: "RUN",
        ranAt: new Date("2026-09-05T00:00:00.000Z"),
      },
      swaps: [
        swap({ transactionFrom: walletA, timestamp: new Date("2026-09-01T12:00:00.000Z") }),
        swap({
          transactionFrom: walletA,
          amount0: -300n,
          timestamp: new Date("2026-09-01T13:00:00.000Z"),
        }),
        swap({
          transactionFrom: walletB,
          amount0: -50n,
          timestamp: new Date("2026-09-01T12:30:00.000Z"),
        }),
        // A sell (positive target amount) is not buy evidence.
        swap({ transactionFrom: walletB, amount0: 10n }),
        // A swap in another pool is not evidence for this pair.
        swap({ transactionFrom: walletA, pool: otherPair }),
      ],
    });

    expect(evidence).toEqual([
      {
        id: `historical-runner-buy:robinhood:${checksummedPair}:${walletA}`,
        wallet: walletA,
        chain: "robinhood",
        kind: "historical-runner-buy",
        observedAt: new Date("2026-09-01T12:00:00.000Z"),
        source: "historical-replay",
        detail: {
          pair: checksummedPair,
          tokenAddress,
          symbol: "RUN",
          buyCount: 2,
          totalTargetTokenBought: "400",
        },
      },
      {
        id: `historical-runner-buy:robinhood:${checksummedPair}:${walletB}`,
        wallet: walletB,
        chain: "robinhood",
        kind: "historical-runner-buy",
        observedAt: new Date("2026-09-01T12:30:00.000Z"),
        source: "historical-replay",
        detail: {
          pair: checksummedPair,
          tokenAddress,
          symbol: "RUN",
          buyCount: 1,
          totalTargetTokenBought: "50",
        },
      },
    ]);
  });

  it("keeps only the largest buyers when maxWallets is set", () => {
    const evidence = deriveHistoricalRunnerEvidence({
      pair: { tokenAddress, pairAddress, ranAt: new Date("2026-09-05T00:00:00.000Z") },
      maxWallets: 1,
      swaps: [
        swap({ transactionFrom: walletA, amount0: -100n }),
        swap({ transactionFrom: walletB, amount0: -900n }),
      ],
    });

    expect(evidence.map((event) => event.wallet)).toEqual([walletB]);
  });
});
