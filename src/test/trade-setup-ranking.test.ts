import { describe, expect, it } from "vitest";

import { rankTradeSetups } from "../analysis/trade-setup-ranking.js";

const pairA = "0x00000000000000000000000000000000000000aa";
const strategyVersionId = "baseline";

function setup(overrides: Partial<Parameters<typeof rankTradeSetups>[0]["tradeSetups"][number]>) {
  return {
    id: "setup-1",
    strategyVersionId,
    pair: pairA,
    createdAt: new Date("2026-09-01T10:00:00.000Z"),
    plannedBuyLevels: [],
    trigger: {},
    ...overrides,
  };
}

describe("rankTradeSetups", () => {
  it("ranks a trade setup with no wallet evidence and no boost", () => {
    const rankings = rankTradeSetups({
      tradeSetups: [setup({})],
      interestingWallets: [],
      walletEvidence: [],
      walletTags: [],
      pairTags: [],
    });

    expect(rankings).toEqual([
      {
        tradeSetupId: "setup-1",
        pair: pairA,
        score: 0,
        walletBoost: 0,
        walletBoostReasons: [],
        explanation: "No interesting-wallet evidence for this pair.",
      },
    ]);
  });

  it("boosts a trade setup when an interesting wallet has evidence tied to its pair", () => {
    const wallet = "0x0000000000000000000000000000000000000011";
    const observedAt = new Date("2026-09-01T09:00:00.000Z");
    const rankings = rankTradeSetups({
      tradeSetups: [setup({})],
      interestingWallets: [
        { wallet, chain: "robinhood", updatedAt: observedAt, evidence: {} },
      ],
      walletEvidence: [
        {
          id: `historical-runner-buy:robinhood:${pairA}:${wallet}`,
          wallet,
          chain: "robinhood",
          kind: "historical-runner-buy",
          observedAt,
          source: "historical-replay",
          detail: { pair: pairA },
        },
      ],
      walletTags: [],
      pairTags: [],
    });

    expect(rankings).toEqual([
      {
        tradeSetupId: "setup-1",
        pair: pairA,
        score: 10,
        walletBoost: 10,
        walletBoostReasons: [{ wallet, kind: "historical-runner-buy", observedAt }],
        explanation: `Boosted by 1 interesting wallet(s): ${wallet}.`,
      },
    ]);
  });

  it("sorts trade setups with a larger wallet boost first", () => {
    const pairB = "0x00000000000000000000000000000000000000bb";
    const walletX = "0x0000000000000000000000000000000000000011";
    const walletY = "0x0000000000000000000000000000000000000022";
    const observedAt = new Date("2026-09-01T09:00:00.000Z");

    const rankings = rankTradeSetups({
      tradeSetups: [setup({ id: "setup-1", pair: pairA }), setup({ id: "setup-2", pair: pairB })],
      interestingWallets: [
        { wallet: walletX, chain: "robinhood", updatedAt: observedAt, evidence: {} },
        { wallet: walletY, chain: "robinhood", updatedAt: observedAt, evidence: {} },
      ],
      walletEvidence: [
        {
          id: `historical-runner-buy:robinhood:${pairB}:${walletX}`,
          wallet: walletX,
          chain: "robinhood",
          kind: "historical-runner-buy",
          observedAt,
          source: "historical-replay",
          detail: { pair: pairB },
        },
        {
          id: `historical-runner-buy:robinhood:${pairB}:${walletY}`,
          wallet: walletY,
          chain: "robinhood",
          kind: "historical-runner-buy",
          observedAt,
          source: "historical-replay",
          detail: { pair: pairB },
        },
      ],
      walletTags: [],
      pairTags: [],
    });

    expect(rankings.map((ranking) => ranking.tradeSetupId)).toEqual(["setup-2", "setup-1"]);
  });

  it("excludes a wallet tagged ignored from ranking influence", () => {
    const wallet = "0x0000000000000000000000000000000000000011";
    const observedAt = new Date("2026-09-01T09:00:00.000Z");

    const rankings = rankTradeSetups({
      tradeSetups: [setup({})],
      interestingWallets: [
        { wallet, chain: "robinhood", updatedAt: observedAt, evidence: {} },
      ],
      walletEvidence: [
        {
          id: `historical-runner-buy:robinhood:${pairA}:${wallet}`,
          wallet,
          chain: "robinhood",
          kind: "historical-runner-buy",
          observedAt,
          source: "historical-replay",
          detail: { pair: pairA },
        },
      ],
      walletTags: [{ wallet, chain: "robinhood", tag: "ignored", updatedAt: observedAt }],
      pairTags: [],
    });

    expect(rankings).toEqual([
      {
        tradeSetupId: "setup-1",
        pair: pairA,
        score: 0,
        walletBoost: 0,
        walletBoostReasons: [],
        explanation: "No interesting-wallet evidence for this pair.",
      },
    ]);
  });

  it("excludes a pair tagged ignored from ranking influence", () => {
    const wallet = "0x0000000000000000000000000000000000000011";
    const observedAt = new Date("2026-09-01T09:00:00.000Z");

    const rankings = rankTradeSetups({
      tradeSetups: [setup({})],
      interestingWallets: [
        { wallet, chain: "robinhood", updatedAt: observedAt, evidence: {} },
      ],
      walletEvidence: [
        {
          id: `historical-runner-buy:robinhood:${pairA}:${wallet}`,
          wallet,
          chain: "robinhood",
          kind: "historical-runner-buy",
          observedAt,
          source: "historical-replay",
          detail: { pair: pairA },
        },
      ],
      walletTags: [],
      pairTags: [{ pair: pairA, chain: "robinhood", tag: "ignored", updatedAt: observedAt }],
    });

    expect(rankings).toEqual([
      {
        tradeSetupId: "setup-1",
        pair: pairA,
        score: 0,
        walletBoost: 0,
        walletBoostReasons: [],
        explanation: "No interesting-wallet evidence for this pair.",
      },
    ]);
  });
});
