#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

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
  output: string;
};

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const client = createRobinhoodClient(config.rpcUrl, config.rpcTimeoutMs);
  const dateWindow = parseUtcDateWindow(cliArgs.from, cliArgs.to);
  console.error(
    `Resolving UTC window ${dateWindow.from.toISOString()} to ${dateWindow.to.toISOString()} to block numbers...`,
  );
  let blockSearchSteps = 0;
  const blockWindow = await resolveDateWindowToBlocks(client, dateWindow, ({ label, mid }) => {
    blockSearchSteps += 1;
    if (blockSearchSteps === 1 || blockSearchSteps % 10 === 0) {
      console.error(`Searching ${label} boundary near block ${mid.toString()}...`);
    }
  });
  console.error(
    `Resolved block range ${blockWindow.fromBlock.toString()}-${blockWindow.toBlock.toString()}.`,
  );

  console.error("Discovering configured V3 pools...");
  const discovery = await discoverV3Pools({
    client,
    factory: robinhoodContracts.v3Factory,
    token: cliArgs.token,
    quoteTokens: defaultQuoteTokens,
    feeTiers: defaultV3FeeTiers,
  });

  if (discovery.pools.length === 0) {
    await writeJsonFile(cliArgs.output, { wallets: [], warnings: discovery.warnings });
    console.error(`Wrote results to ${cliArgs.output}.`);
    return;
  }

  console.error(`Found ${discovery.pools.length} pool(s). Fetching swaps...`);
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
  await writeJsonFile(cliArgs.output, {
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
  console.error(`Wrote results to ${cliArgs.output}.`);
}

function parseArgs(args: string[]): CliArgs {
  const raw = args.includes("--raw") || args.includes("--debug");
  const token = readFlag(args, "--token");
  const from = readFlag(args, "--from");
  const to = readFlag(args, "--to");
  const output = readFlag(args, "--output") ?? "results.json";

  if (!token || !from || !to) {
    throw new Error(
      "Usage: npm run find-buyers -- --token 0x... --from 2026-09-01 --to 2026-09-02 [--output results.json]",
    );
  }

  return { token: getAddress(token), from, to, raw, output };
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

async function writeJsonFile(path: string, value: unknown) {
  await writeFile(
    path,
    JSON.stringify(
      value,
      (_key, nestedValue) =>
        typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
      2,
    ) + "\n",
    "utf8",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
