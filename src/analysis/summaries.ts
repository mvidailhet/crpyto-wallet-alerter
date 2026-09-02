import type { Address } from "viem";

import type { TargetTokenTrade, WalletSummary } from "../types/evm.js";

export function aggregateWalletSummaries(trades: TargetTokenTrade[]): WalletSummary[] {
  const byWallet = new Map<Address, WalletSummary>();

  for (const trade of trades) {
    const existing = byWallet.get(trade.buyer);

    if (!existing) {
      const quoteTotals = new Map<Address, bigint>();
      if (trade.quoteToken && trade.quoteAmountSpent !== undefined) {
        quoteTotals.set(trade.quoteToken, trade.quoteAmountSpent);
      }

      byWallet.set(trade.buyer, {
        buyer: trade.buyer,
        buyCount: 1,
        totalTargetTokenBought: trade.targetAmountBought,
        quoteTotals,
        firstBuyTimestamp: trade.timestamp,
        lastBuyTimestamp: trade.timestamp,
        transactionHashes: [trade.transactionHash],
      });
      continue;
    }

    existing.buyCount += 1;
    existing.totalTargetTokenBought += trade.targetAmountBought;
    if (trade.timestamp < existing.firstBuyTimestamp) existing.firstBuyTimestamp = trade.timestamp;
    if (trade.timestamp > existing.lastBuyTimestamp) existing.lastBuyTimestamp = trade.timestamp;
    if (!existing.transactionHashes.includes(trade.transactionHash)) {
      existing.transactionHashes.push(trade.transactionHash);
    }
    if (trade.quoteToken && trade.quoteAmountSpent !== undefined) {
      existing.quoteTotals.set(
        trade.quoteToken,
        (existing.quoteTotals.get(trade.quoteToken) ?? 0n) + trade.quoteAmountSpent,
      );
    }
  }

  return [...byWallet.values()].sort((a, b) =>
    b.totalTargetTokenBought > a.totalTargetTokenBought ? 1 : -1,
  );
}
