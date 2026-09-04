import "dotenv/config";

import { robinhoodChain } from "../chains/robinhood.js";

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

export type AppConfig = {
  rpcUrl: string;
  logChunkSize: bigint;
  rpcTimeoutMs: number;
  simulationDatabasePath?: string;
  simulationDataDirectory?: string;
  strategyVersion: string;
  telegram?: TelegramConfig;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rpcUrl = env.ROBINHOOD_RPC_URL ?? robinhoodChain.rpcUrls.default.http[0];
  const logChunkSize = BigInt(env.LOG_CHUNK_SIZE ?? "1000");
  const rpcTimeoutMs = Number.parseInt(env.RPC_TIMEOUT_MS ?? "10000", 10);
  const simulationDatabasePath = env.SIMULATION_DATABASE_PATH;
  const simulationDataDirectory = env.SIMULATION_DATA_DIR;
  const strategyVersion = env.STRATEGY_VERSION ?? "baseline-96h";
  const telegram = loadTelegramConfig(env);

  if (logChunkSize <= 0n) {
    throw new Error("LOG_CHUNK_SIZE must be a positive integer");
  }

  if (!Number.isInteger(rpcTimeoutMs) || rpcTimeoutMs <= 0) {
    throw new Error("RPC_TIMEOUT_MS must be a positive integer");
  }

  return {
    rpcUrl,
    logChunkSize,
    rpcTimeoutMs,
    simulationDatabasePath,
    simulationDataDirectory,
    strategyVersion,
    telegram,
  };
}

function loadTelegramConfig(env: NodeJS.ProcessEnv): TelegramConfig | undefined {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();

  if (!botToken && !chatId) {
    return undefined;
  }
  if (!botToken || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set together");
  }

  return { botToken, chatId };
}
