#!/usr/bin/env node
import { formatUnits, getAddress, type Address } from "viem";

import { defaultQuoteTokens, defaultV3FeeTiers, robinhoodContracts } from "../chains/robinhood.js";
import { loadConfig } from "../config/env.js";
import { aggregateWalletSummaries } from "../analysis/summaries.js";
import { groupTradesByTransaction, inferTargetTokenTrade } from "../analysis/trades.js";
import { discoverV3Pools } from "../dex/v3/pools.js";
import { fetchTokenMetadata, fetchV3Swaps } from "../dex/v3/swaps.js";
import { createRobinhoodClient } from "../rpc/client.js";
import { parseUtcDateWindow, resolveDateWindowToBlocks } from "../rpc/blocks.js";
import type { TokenMetadata, WalletSummary } from "../types/evm.js";

type CliArgs = {
  token: Address;
  from: string;
  to: string;
  raw: boolean;
};

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const client = createRobinhoodClient(config.rpcUrl);
  const dateWindow = parseUtcDateWindow(cliArgs.from, cliArgs.to);
  const blockWindow = await resolveDateWindowToBlocks(client, dateWindow);

  const discovery = await discoverV3Pools({
    client,
    factory: robinhoodContracts.v3Factory,
    token: cliArgs.token,
    quoteTokens: defaultQuoteTokens,
    feeTiers: defaultV3FeeTiers,
  });

  if (discovery.pools.length === 0) {
    printJson({ wallets: [], warnings: discovery.warnings });
    return;
  }

  const [targetMetadata, swaps] = await Promise.all([
    fetchTokenMetadata(client, cliArgs.token),
    fetchV3Swaps({
      client,
      pools: discovery.pools,
      fromBlock: blockWindow.fromBlock,
      toBlock: blockWindow.toBlock,
      chunkSize: config.logChunkSize,
    }),
  ]);

  const trades = swaps
    .map((swap) => inferTargetTokenTrade(swap, cliArgs.token))
    .filter((trade) => trade !== undefined);
  groupTradesByTransaction(trades);

  const quoteMetadata = new Map<Address, TokenMetadata>();
  for (const quote of defaultQuoteTokens) {
    quoteMetadata.set(getAddress(quote), await fetchTokenMetadata(client, quote));
  }

  const summaries = aggregateWalletSummaries(trades);
  printJson({
    token: renderToken(targetMetadata),
    window: {
      from: dateWindow.from.toISOString(),
      to: dateWindow.to.toISOString(),
      fromBlock: blockWindow.fromBlock.toString(),
      toBlock: blockWindow.toBlock.toString(),
    },
    pools: discovery.pools,
    wallets: summaries.map((summary) =>
      formatWalletSummary(summary, targetMetadata, quoteMetadata),
    ),
    rawTrades: cliArgs.raw ? trades : undefined,
    warnings: trades.length === 0 ? ["No target-token buys found in discovered pools."] : [],
  });
}

function parseArgs(args: string[]): CliArgs {
  const raw = args.includes("--raw") || args.includes("--debug");
  const token = readFlag(args, "--token");
  const from = readFlag(args, "--from");
  const to = readFlag(args, "--to");

  if (!token || !from || !to) {
    throw new Error(
      "Usage: npm run find-buyers -- --token 0x... --from 2026-09-01 --to 2026-09-02",
    );
  }

  return { token: getAddress(token), from, to, raw };
}

function readFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function formatWalletSummary(
  summary: WalletSummary,
  targetMetadata: TokenMetadata,
  quoteMetadata: Map<Address, TokenMetadata>,
) {
  return {
    buyer: summary.buyer,
    buyCount: summary.buyCount,
    totalTargetTokenBought: formatUnits(summary.totalTargetTokenBought, targetMetadata.decimals),
    totalQuoteTokenSpent: [...summary.quoteTotals.entries()].map(([address, amount]) => {
      const metadata = quoteMetadata.get(address);
      return {
        token: metadata ? renderToken(metadata) : { address, symbol: address, decimals: 18 },
        amount: formatUnits(amount, metadata?.decimals ?? 18),
      };
    }),
    firstBuyTimestamp: summary.firstBuyTimestamp.toISOString(),
    lastBuyTimestamp: summary.lastBuyTimestamp.toISOString(),
    transactionHashes: summary.transactionHashes,
  };
}

function renderToken(metadata: TokenMetadata) {
  return {
    address: metadata.address,
    symbol: metadata.symbol,
    decimals: metadata.decimals,
  };
}

function printJson(value: unknown) {
  console.log(
    JSON.stringify(
      value,
      (_key, nestedValue) =>
        typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
