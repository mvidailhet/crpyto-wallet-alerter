import "dotenv/config";

import { robinhoodChain } from "../chains/robinhood.js";

export type AppConfig = {
  rpcUrl: string;
  logChunkSize: bigint;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rpcUrl = env.ROBINHOOD_RPC_URL ?? robinhoodChain.rpcUrls.default.http[0];
  const logChunkSize = BigInt(env.LOG_CHUNK_SIZE ?? "1000");

  if (logChunkSize <= 0n) {
    throw new Error("LOG_CHUNK_SIZE must be a positive integer");
  }

  return { rpcUrl, logChunkSize };
}
