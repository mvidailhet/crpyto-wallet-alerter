import "dotenv/config";

import { robinhoodChain } from "../chains/robinhood.js";

export type AppConfig = {
  rpcUrl: string;
  logChunkSize: bigint;
  rpcTimeoutMs: number;
  simulationDatabasePath?: string;
  simulationDataDirectory?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rpcUrl = env.ROBINHOOD_RPC_URL ?? robinhoodChain.rpcUrls.default.http[0];
  const logChunkSize = BigInt(env.LOG_CHUNK_SIZE ?? "1000");
  const rpcTimeoutMs = Number.parseInt(env.RPC_TIMEOUT_MS ?? "10000", 10);
  const simulationDatabasePath = env.SIMULATION_DATABASE_PATH;
  const simulationDataDirectory = env.SIMULATION_DATA_DIR;

  if (logChunkSize <= 0n) {
    throw new Error("LOG_CHUNK_SIZE must be a positive integer");
  }

  if (!Number.isInteger(rpcTimeoutMs) || rpcTimeoutMs <= 0) {
    throw new Error("RPC_TIMEOUT_MS must be a positive integer");
  }

  return { rpcUrl, logChunkSize, rpcTimeoutMs, simulationDatabasePath, simulationDataDirectory };
}
