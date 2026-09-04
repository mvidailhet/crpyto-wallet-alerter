import type { Address, Hash, PublicClient } from "viem";
import { getAddress } from "viem";

import { erc20Abi, v3PoolAbi, v3SwapEvent } from "./abis.js";
import { chunkBlockRange } from "../../rpc/blocks.js";
import type { DecodedV3Swap, DiscoveredPool, TokenMetadata } from "../../types/evm.js";

export async function fetchTokenMetadata(
  client: PublicClient,
  address: Address,
): Promise<TokenMetadata> {
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
  ]);

  return { address: getAddress(address), symbol, decimals };
}

export async function fetchPoolTokens(client: PublicClient, pool: Address) {
  const [token0, token1] = await Promise.all([
    client.readContract({ address: pool, abi: v3PoolAbi, functionName: "token0" }),
    client.readContract({ address: pool, abi: v3PoolAbi, functionName: "token1" }),
  ]);

  return { token0: getAddress(token0), token1: getAddress(token1) };
}

export async function fetchV3Swaps(args: {
  client: PublicClient;
  pools: DiscoveredPool[];
  fromBlock: bigint;
  toBlock: bigint;
  chunkSize: bigint;
}): Promise<DecodedV3Swap[]> {
  const poolTokens = new Map<Address, Awaited<ReturnType<typeof fetchPoolTokens>>>();
  for (const pool of args.pools) {
    poolTokens.set(pool.pool, await fetchPoolTokens(args.client, pool.pool));
  }

  const swaps: DecodedV3Swap[] = [];
  const chunks = chunkBlockRange(args.fromBlock, args.toBlock, args.chunkSize);

  for (const pool of args.pools) {
    const tokens = poolTokens.get(pool.pool);
    if (!tokens) throw new Error(`Missing tokens for pool ${pool.pool}`);

    for (const chunk of chunks) {
      const logs = await args.client.getLogs({
        address: pool.pool,
        event: v3SwapEvent,
        fromBlock: chunk.fromBlock,
        toBlock: chunk.toBlock,
      });

      for (const log of logs) {
        if (log.args.amount0 === undefined || log.args.amount1 === undefined) {
          throw new Error(`Malformed Swap log ${log.transactionHash}`);
        }

        const [transaction, block] = await Promise.all([
          args.client.getTransaction({ hash: log.transactionHash }),
          args.client.getBlock({ blockNumber: log.blockNumber }),
        ]);

        swaps.push({
          pool: pool.pool,
          transactionHash: log.transactionHash as Hash,
          blockNumber: log.blockNumber,
          timestamp: new Date(Number(block.timestamp) * 1000),
          token0: tokens.token0,
          token1: tokens.token1,
          amount0: log.args.amount0,
          amount1: log.args.amount1,
          sqrtPriceX96: log.args.sqrtPriceX96,
          transactionFrom: getAddress(transaction.from),
        });
      }
    }
  }

  return swaps;
}
