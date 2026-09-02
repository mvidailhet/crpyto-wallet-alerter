import type { BlockWindow, DateWindow } from "../types/evm.js";

export type BlockTimestampReader = {
  getBlockNumber(): Promise<bigint>;
  getBlock(args: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
};

export type BlockSearchProgress = (event: {
  label: "from" | "to";
  low: bigint;
  high: bigint;
  mid: bigint;
}) => void;

export function parseUtcDateWindow(fromInput: string, toInput: string): DateWindow {
  const from = parseUtcBoundary(fromInput, "from");
  const to = parseUtcBoundary(toInput, "to");

  if (to <= from) {
    throw new Error("--to must be after --from");
  }

  return { from, to };
}

function parseUtcBoundary(input: string, field: string): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input);
  const parsed = new Date(dateOnly ? `${input}T00:00:00.000Z` : input);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${field} date: ${input}`);
  }

  return parsed;
}

export async function resolveDateWindowToBlocks(
  client: BlockTimestampReader,
  window: DateWindow,
  onProgress?: BlockSearchProgress,
): Promise<BlockWindow> {
  const latest = await client.getBlockNumber();
  const [fromBlock, exclusiveToBlock] = await Promise.all([
    findFirstBlockAtOrAfter(client, latest, toUnixSeconds(window.from), "from", onProgress),
    findFirstBlockAtOrAfter(client, latest, toUnixSeconds(window.to), "to", onProgress),
  ]);

  return {
    fromBlock,
    toBlock: exclusiveToBlock === 0n ? 0n : exclusiveToBlock - 1n,
  };
}

export async function findFirstBlockAtOrAfter(
  client: BlockTimestampReader,
  highBlock: bigint,
  targetTimestamp: bigint,
  label: "from" | "to" = "from",
  onProgress?: BlockSearchProgress,
): Promise<bigint> {
  let low = 0n;
  let high = highBlock;
  let answer = highBlock;

  while (low <= high) {
    const mid = (low + high) / 2n;
    onProgress?.({ label, low, high, mid });
    const block = await client.getBlock({ blockNumber: mid });

    if (block.timestamp >= targetTimestamp) {
      answer = mid;
      if (mid === 0n) break;
      high = mid - 1n;
    } else {
      low = mid + 1n;
    }
  }

  return answer;
}

export function chunkBlockRange(fromBlock: bigint, toBlock: bigint, chunkSize: bigint) {
  if (chunkSize <= 0n) {
    throw new Error("chunkSize must be positive");
  }
  if (toBlock < fromBlock) {
    return [];
  }

  const chunks: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = start + chunkSize - 1n;
    chunks.push({ fromBlock: start, toBlock: end > toBlock ? toBlock : end });
  }
  return chunks;
}

function toUnixSeconds(date: Date): bigint {
  return BigInt(Math.floor(date.getTime() / 1000));
}
