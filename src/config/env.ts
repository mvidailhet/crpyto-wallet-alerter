import "dotenv/config";

import { robinhoodChain } from "../chains/robinhood.js";

export type AppConfig = {
  rpcUrl: string;
  logChunkSize: bigint;
  rpcTimeoutMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rpcUrl = env.ROBINHOOD_RPC_URL ?? robinhoodChain.rpcUrls.default.http[0];
  const logChunkSize = BigInt(env.LOG_CHUNK_SIZE ?? "1000");
  const rpcTimeoutMs = Number.parseInt(env.RPC_TIMEOUT_MS ?? "10000", 10);

  if (logChunkSize <= 0n) {
    throw new Error("LOG_CHUNK_SIZE must be a positive integer");
  }

  if (!Number.isInteger(rpcTimeoutMs) || rpcTimeoutMs <= 0) {
    throw new Error("RPC_TIMEOUT_MS must be a positive integer");
  }

  return { rpcUrl, logChunkSize, rpcTimeoutMs };
}
