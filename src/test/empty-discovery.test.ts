import { describe, expect, it } from "vitest";
import type { Address, PublicClient } from "viem";
import { zeroAddress } from "viem";

import { discoverV3Pools } from "../dex/v3/pools.js";

describe("empty discovery result behavior", () => {
  it("returns success with warnings when configured pools are absent", async () => {
    const client = {
      async readContract() {
        return zeroAddress;
      },
    } as unknown as PublicClient;

    const result = await discoverV3Pools({
      client,
      factory: "0x00000000000000000000000000000000000000f0" as Address,
      token: "0x0000000000000000000000000000000000000001",
      quoteTokens: ["0x0000000000000000000000000000000000000002"],
      feeTiers: [500],
    });

    expect(result.pools).toEqual([]);
    expect(result.warnings).toEqual([
      "No V3 pools found. Checked quote tokens: 0x0000000000000000000000000000000000000002.",
      "Checked fee tiers: 500.",
    ]);
  });
});
