import type { Address, Hash } from "viem";

export type TokenMetadata = {
  address: Address;
  symbol: string;
  decimals: number;
};

export type DateWindow = {
  from: Date;
  to: Date;
};

export type BlockWindow = {
  fromBlock: bigint;
  toBlock: bigint;
};

export type PoolCandidate = {
  token: Address;
  quoteToken: Address;
  fee: number;
};

export type DiscoveredPool = PoolCandidate & {
  pool: Address;
};

export type DecodedV3Swap = {
  pool: Address;
  transactionHash: Hash;
  blockNumber: bigint;
  timestamp: Date;
  token0: Address;
  token1: Address;
  amount0: bigint;
  amount1: bigint;
  transactionFrom: Address;
};

export type TargetTokenTrade = {
  buyer: Address;
  transactionHash: Hash;
  timestamp: Date;
  targetAmountBought: bigint;
  quoteToken?: Address;
  quoteAmountSpent?: bigint;
  pool: Address;
};

export type WalletSummary = {
  buyer: Address;
  buyCount: number;
  totalTargetTokenBought: bigint;
  quoteTotals: Map<Address, bigint>;
  firstBuyTimestamp: Date;
  lastBuyTimestamp: Date;
  transactionHashes: Hash[];
};
