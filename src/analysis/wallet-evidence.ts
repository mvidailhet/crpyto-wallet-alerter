import { getAddress, type Address } from "viem";

import type { DecodedV3Swap } from "../types/evm.js";
import type { SaveWalletEvidenceInput, WalletChain } from "../storage/simulation-storage.js";
import type { HistoricalReplayPair } from "./replay-snapshots.js";
import { aggregateWalletSummaries } from "./summaries.js";
import { inferTargetTokenTrade } from "./trades.js";

export type DeriveHistoricalRunnerEvidenceOptions = {
  pair: HistoricalReplayPair;
  swaps: DecodedV3Swap[];
  chain?: WalletChain;
  maxWallets?: number;
};

/**
 * Turn reconstructed swap logs for a manually labelled runner pair into wallet
 * evidence events, so historical runner behavior can mark interesting wallets
 * without any live trading data. Wallets are returned largest-buyer first;
 * `maxWallets` keeps only the leading buyers.
 */
export function deriveHistoricalRunnerEvidence({
  pair,
  swaps,
  chain = "robinhood",
  maxWallets,
}: DeriveHistoricalRunnerEvidenceOptions): SaveWalletEvidenceInput[] {
  const tokenAddress = getAddress(pair.tokenAddress);
  const pairAddress = getAddress(pair.pairAddress);

  const trades = swaps
    .filter((swap) => getAddress(swap.pool) === pairAddress)
    .map((swap) => inferTargetTokenTrade(swap, tokenAddress as Address))
    .filter((trade): trade is NonNullable<typeof trade> => trade !== undefined);

  const summaries = aggregateWalletSummaries(trades);
  const selected = maxWallets === undefined ? summaries : summaries.slice(0, maxWallets);

  return selected.map((summary) => ({
    id: `historical-runner-buy:${chain}:${pairAddress}:${summary.buyer}`,
    wallet: summary.buyer,
    chain,
    kind: "historical-runner-buy",
    observedAt: summary.firstBuyTimestamp,
    source: "historical-replay",
    detail: {
      pair: pairAddress,
      tokenAddress,
      symbol: pair.symbol,
      buyCount: summary.buyCount,
      totalTargetTokenBought: summary.totalTargetTokenBought.toString(),
    },
  }));
}
