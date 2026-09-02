import { describe, expect, it } from "vitest";

import { generatePoolCandidates } from "../dex/v3/pools.js";

describe("pool discovery candidate generation", () => {
  it("generates every quote-token and fee-tier combination", () => {
    const candidates = generatePoolCandidates(
      "0x0000000000000000000000000000000000000001",
      ["0x0000000000000000000000000000000000000002", "0x0000000000000000000000000000000000000003"],
      [500, 3000],
    );

    expect(candidates).toEqual([
      {
        token: "0x0000000000000000000000000000000000000001",
        quoteToken: "0x0000000000000000000000000000000000000002",
        fee: 500,
      },
      {
        token: "0x0000000000000000000000000000000000000001",
        quoteToken: "0x0000000000000000000000000000000000000002",
        fee: 3000,
      },
      {
        token: "0x0000000000000000000000000000000000000001",
        quoteToken: "0x0000000000000000000000000000000000000003",
        fee: 500,
      },
      {
        token: "0x0000000000000000000000000000000000000001",
        quoteToken: "0x0000000000000000000000000000000000000003",
        fee: 3000,
      },
    ]);
  });
});
