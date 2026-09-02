import { describe, expect, it } from "vitest";

import {
  chunkBlockRange,
  findFirstBlockAtOrAfter,
  parseEuropeParisDateWindow,
  type BlockTimestampReader,
} from "../rpc/blocks.js";

describe("Europe/Paris date parsing", () => {
  it("interprets date-only inputs as Europe/Paris calendar boundaries", () => {
    const window = parseEuropeParisDateWindow("2026-09-01", "2026-09-02");

    expect(window.from.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-01T22:00:00.000Z");
  });

  it("interprets date-time inputs as Europe/Paris wall-clock time", () => {
    const window = parseEuropeParisDateWindow(
      "2026-09-01T14:01:00",
      "2026-09-01T14:02:00",
    );

    expect(window.from.toISOString()).toBe("2026-09-01T12:01:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-01T12:02:00.000Z");
  });

  it("uses the winter Europe/Paris offset when applicable", () => {
    const window = parseEuropeParisDateWindow(
      "2026-01-01T14:01:00",
      "2026-01-01T14:02:00",
    );

    expect(window.from.toISOString()).toBe("2026-01-01T13:01:00.000Z");
    expect(window.to.toISOString()).toBe("2026-01-01T13:02:00.000Z");
  });

  it("rejects timezone suffixes to avoid mixing UTC and Dexscreener-local inputs", () => {
    expect(() =>
      parseEuropeParisDateWindow("2026-09-01T14:01:00Z", "2026-09-01T14:02:00Z"),
    ).toThrow("Use Europe/Paris local time without a timezone suffix");
  });

  it("rejects inverted windows", () => {
    expect(() => parseEuropeParisDateWindow("2026-09-02", "2026-09-01")).toThrow(
      "--to must be after --from",
    );
  });
});

describe("date-to-block binary search", () => {
  it("finds the first block at or after a timestamp", async () => {
    const timestamps = [100n, 110n, 120n, 130n, 140n];
    const client: BlockTimestampReader = {
      async getBlockNumber() {
        return 4n;
      },
      async getBlock({ blockNumber }) {
        return { timestamp: timestamps[Number(blockNumber)] };
      },
    };

    await expect(findFirstBlockAtOrAfter(client, 4n, 125n)).resolves.toBe(3n);
    await expect(findFirstBlockAtOrAfter(client, 4n, 120n)).resolves.toBe(2n);
  });
});

describe("block range chunking", () => {
  it("splits inclusive block ranges", () => {
    expect(chunkBlockRange(10n, 25n, 7n)).toEqual([
      { fromBlock: 10n, toBlock: 16n },
      { fromBlock: 17n, toBlock: 23n },
      { fromBlock: 24n, toBlock: 25n },
    ]);
  });

  it("returns no chunks for empty ranges", () => {
    expect(chunkBlockRange(10n, 9n, 7n)).toEqual([]);
  });
});
