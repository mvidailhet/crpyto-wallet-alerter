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

const analysisTimeZone = "Europe/Paris";

export function parseEuropeParisDateWindow(fromInput: string, toInput: string): DateWindow {
  const from = parseEuropeParisBoundary(fromInput, "from");
  const to = parseEuropeParisBoundary(toInput, "to");

  if (to <= from) {
    throw new Error("--to must be after --from");
  }

  return { from, to };
}

function parseEuropeParisBoundary(input: string, field: string): Date {
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(input)) {
    throw new Error(
      `Invalid ${field} date: ${input}. Use Europe/Paris local time without a timezone suffix.`,
    );
  }

  const match = input.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/,
  );
  if (!match) {
    throw new Error(`Invalid ${field} date: ${input}`);
  }

  const [, year, month, day, hour = "00", minute = "00", second = "00", ms = "0"] = match;
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    millisecond: Number(ms.padEnd(3, "0")),
  };
  const parsed = zonedTimeToUtc(parts);

  if (!matchesZonedParts(parsed, parts)) {
    throw new Error(`Invalid ${field} date: ${input}`);
  }

  return parsed;
}

function zonedTimeToUtc(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}) {
  let utcMillis = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );

  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMillis(new Date(utcMillis));
    const nextUtcMillis =
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
        parts.millisecond,
      ) - offset;
    if (nextUtcMillis === utcMillis) break;
    utcMillis = nextUtcMillis;
  }

  return new Date(utcMillis);
}

function getTimeZoneOffsetMillis(date: Date) {
  const parts = getZonedParts(date);
  const zonedMillis = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );

  return zonedMillis - date.getTime();
}

function matchesZonedParts(
  date: Date,
  expected: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
  },
) {
  const actual = getZonedParts(date);
  return (
    actual.year === expected.year &&
    actual.month === expected.month &&
    actual.day === expected.day &&
    actual.hour === expected.hour &&
    actual.minute === expected.minute &&
    actual.second === expected.second &&
    actual.millisecond === expected.millisecond
  );
}

function getZonedParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: analysisTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    millisecond: date.getUTCMilliseconds(),
  };
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
