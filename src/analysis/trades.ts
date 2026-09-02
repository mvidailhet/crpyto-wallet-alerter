import type { Address } from "viem";
import { getAddress } from "viem";

import type { DecodedV3Swap, TargetTokenTrade } from "../types/evm.js";

export function inferTargetTokenTrade(
  swap: DecodedV3Swap,
  targetToken: Address,
): TargetTokenTrade | undefined {
  const target = getAddress(targetToken);
  const token0 = getAddress(swap.token0);
  const token1 = getAddress(swap.token1);

  if (target !== token0 && target !== token1) {
    return undefined;
  }

  const targetAmount = target === token0 ? swap.amount0 : swap.amount1;
  const quoteAmount = target === token0 ? swap.amount1 : swap.amount0;
  const quoteToken = target === token0 ? token1 : token0;

  if (targetAmount >= 0n) {
    return undefined;
  }

  return {
    buyer: swap.transactionFrom,
    transactionHash: swap.transactionHash,
    timestamp: swap.timestamp,
    targetAmountBought: -targetAmount,
    quoteToken,
    quoteAmountSpent: quoteAmount > 0n ? quoteAmount : undefined,
    pool: swap.pool,
  };
}

export function groupTradesByTransaction(trades: TargetTokenTrade[]) {
  const grouped = new Map<string, TargetTokenTrade[]>();
  for (const trade of trades) {
    const existing = grouped.get(trade.transactionHash) ?? [];
    existing.push(trade);
    grouped.set(trade.transactionHash, existing);
  }
  return grouped;
}
