import type { Address, PublicClient } from "viem";
import { getAddress, zeroAddress } from "viem";

import { v3FactoryAbi } from "./abis.js";
import type { DiscoveredPool, PoolCandidate } from "../../types/evm.js";

export function generatePoolCandidates(
  token: Address,
  quoteTokens: readonly Address[],
  feeTiers: readonly number[],
): PoolCandidate[] {
  return quoteTokens.flatMap((quoteToken) =>
    feeTiers.map((fee) => ({
      token: getAddress(token),
      quoteToken: getAddress(quoteToken),
      fee,
    })),
  );
}

export async function discoverV3Pools(args: {
  client: PublicClient;
  factory: Address;
  token: Address;
  quoteTokens: readonly Address[];
  feeTiers: readonly number[];
}): Promise<{ pools: DiscoveredPool[]; warnings: string[] }> {
  const candidates = generatePoolCandidates(args.token, args.quoteTokens, args.feeTiers);
  const pools: DiscoveredPool[] = [];

  for (const candidate of candidates) {
    const pool = await args.client.readContract({
      address: args.factory,
      abi: v3FactoryAbi,
      functionName: "getPool",
      args: [candidate.token, candidate.quoteToken, candidate.fee],
    });

    if (pool !== zeroAddress) {
      pools.push({ ...candidate, pool: getAddress(pool) });
    }
  }

  const warnings =
    pools.length === 0
      ? [
          `No V3 pools found. Checked quote tokens: ${args.quoteTokens.join(", ")}.`,
          `Checked fee tiers: ${args.feeTiers.join(", ")}.`,
        ]
      : [];

  return { pools, warnings };
}
