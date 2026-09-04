import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type StrategyConfig = {
  version: string;
  chain: "robinhood";
  scanIntervalMinutes: number;
  topPairsByOneHourVolume: number;
  minimumPairAgeHours: number;
  minimumLiquidityUsd: number;
  minimumOneHourVolumeUsd: number;
  athMarketCapUsd: Range;
  currentMarketCapWithinAthPercent: number;
  athAgeHours: Range;
  plannedBuyLevels: PlannedBuyLevel[];
  maximumActiveTradeSetups: number;
};

export type Range = {
  minimum: number;
  maximum: number;
};

export type PlannedBuyLevel = {
  athPullbackPercent: number;
  allocationPercent: number;
};

export type LoadStrategyConfigOptions = {
  configDirectory?: string;
};

const defaultConfigDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "strategies",
);

export async function loadStrategyConfig(
  version: string,
  options: LoadStrategyConfigOptions = {},
): Promise<StrategyConfig> {
  const configDirectory = options.configDirectory ?? defaultConfigDirectory;
  const configPath = join(configDirectory, `${version}.json`);
  const rawConfig = await readFile(configPath, "utf8");
  const parsedConfig = JSON.parse(rawConfig) as unknown;
  return parseStrategyConfig(version, parsedConfig);
}

function parseStrategyConfig(expectedVersion: string, value: unknown): StrategyConfig {
  const errors: string[] = [];

  if (!isRecord(value)) {
    throw new Error(`Invalid strategy config ${expectedVersion}: config must be a JSON object`);
  }

  const config = value;
  requireString(config, "version", errors);
  if (config.version !== undefined && config.version !== expectedVersion) {
    errors.push(`version must match requested strategy version ${expectedVersion}`);
  }
  if (config.chain !== "robinhood") {
    errors.push("chain must be robinhood");
  }

  requirePositiveNumber(config, "scanIntervalMinutes", errors);
  requirePositiveInteger(config, "topPairsByOneHourVolume", errors);
  requirePositiveNumber(config, "minimumPairAgeHours", errors);
  requirePositiveNumber(config, "minimumLiquidityUsd", errors);
  requirePositiveNumber(config, "minimumOneHourVolumeUsd", errors);
  requireRange(config, "athMarketCapUsd", errors);
  requirePositiveNumber(config, "currentMarketCapWithinAthPercent", errors);
  requireRange(config, "athAgeHours", errors);
  requirePositiveInteger(config, "maximumActiveTradeSetups", errors);
  validatePlannedBuyLevels(config.plannedBuyLevels, errors);

  if (errors.length > 0) {
    throw new Error(`Invalid strategy config ${expectedVersion}: ${errors.join("; ")}`);
  }

  return config as StrategyConfig;
}

function requireString(config: Record<string, unknown>, key: string, errors: string[]) {
  if (typeof config[key] !== "string" || config[key].length === 0) {
    errors.push(`${key} must be a non-empty string`);
  }
}

function requirePositiveInteger(config: Record<string, unknown>, key: string, errors: string[]) {
  if (!Number.isInteger(config[key]) || Number(config[key]) <= 0) {
    errors.push(`${key} must be a positive integer`);
  }
}

function requirePositiveNumber(config: Record<string, unknown>, key: string, errors: string[]) {
  if (typeof config[key] !== "number" || !Number.isFinite(config[key]) || config[key] <= 0) {
    errors.push(`${key} must be greater than 0`);
  }
}

function requireRange(config: Record<string, unknown>, key: string, errors: string[]) {
  const range = config[key];
  if (!isRecord(range)) {
    errors.push(`${key} must include minimum and maximum numbers`);
    return;
  }

  const minimum = range.minimum;
  const maximum = range.maximum;
  if (
    typeof minimum !== "number" ||
    typeof maximum !== "number" ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum <= 0 ||
    maximum <= minimum
  ) {
    errors.push(`${key} maximum must be greater than minimum`);
  }
}

function validatePlannedBuyLevels(value: unknown, errors: string[]) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push("plannedBuyLevels must include at least one level");
    return;
  }

  let allocationTotal = 0;
  for (const [index, level] of value.entries()) {
    if (!isRecord(level)) {
      errors.push(`plannedBuyLevels[${index}] must be an object`);
      continue;
    }

    if (
      typeof level.athPullbackPercent !== "number" ||
      !Number.isFinite(level.athPullbackPercent) ||
      level.athPullbackPercent <= 0 ||
      level.athPullbackPercent >= 100
    ) {
      errors.push(`plannedBuyLevels[${index}].athPullbackPercent must be between 0 and 100`);
    }
    if (
      typeof level.allocationPercent !== "number" ||
      !Number.isFinite(level.allocationPercent) ||
      level.allocationPercent <= 0
    ) {
      errors.push(`plannedBuyLevels[${index}].allocationPercent must be greater than 0`);
    } else {
      allocationTotal += level.allocationPercent;
    }
  }

  if (allocationTotal !== 100) {
    errors.push("plannedBuyLevels allocationPercent values must total 100");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
