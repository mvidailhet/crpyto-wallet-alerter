import type {
  InterestingWalletRecord,
  PairTagRecord,
  TradeSetupRecord,
  WalletEvidenceKind,
  WalletEvidenceRecord,
  WalletTagRecord,
} from "../storage/simulation-storage.js";

export type TradeSetupRankingInput = {
  tradeSetups: TradeSetupRecord[];
  interestingWallets: InterestingWalletRecord[];
  walletEvidence: WalletEvidenceRecord[];
  walletTags: WalletTagRecord[];
  pairTags: PairTagRecord[];
};

export type WalletBoostReason = {
  wallet: string;
  kind: WalletEvidenceKind;
  observedAt: Date;
};

export type TradeSetupRanking = {
  tradeSetupId: string;
  pair: string;
  score: number;
  walletBoost: number;
  walletBoostReasons: WalletBoostReason[];
  explanation: string;
};

const walletBoostPerWallet = 10;

// Matches wallets and pairs by address only, not by chain: TradeSetupRecord
// has no chain field to join on, and WalletChain has a single value today.
export function rankTradeSetups(input: TradeSetupRankingInput): TradeSetupRanking[] {
  const ignoredWallets = new Set(
    input.walletTags.filter((tag) => tag.tag === "ignored").map((tag) => tag.wallet),
  );
  const ignoredPairs = new Set(
    input.pairTags.filter((tag) => tag.tag === "ignored").map((tag) => tag.pair),
  );
  const interestingWallets = new Set(
    input.interestingWallets
      .map((wallet) => wallet.wallet)
      .filter((wallet) => !ignoredWallets.has(wallet)),
  );
  const reasonsByPair = new Map<string, WalletBoostReason[]>();
  for (const evidence of input.walletEvidence) {
    if (!interestingWallets.has(evidence.wallet)) {
      continue;
    }
    const pair = typeof evidence.detail.pair === "string" ? evidence.detail.pair : undefined;
    if (!pair || ignoredPairs.has(pair)) {
      continue;
    }
    const reasons = reasonsByPair.get(pair) ?? [];
    reasons.push({ wallet: evidence.wallet, kind: evidence.kind, observedAt: evidence.observedAt });
    reasonsByPair.set(pair, reasons);
  }

  return input.tradeSetups
    .map((setup) => {
      const reasons = reasonsByPair.get(setup.pair) ?? [];
      const distinctWallets = [...new Set(reasons.map((reason) => reason.wallet))];
      const walletBoost = distinctWallets.length * walletBoostPerWallet;

      return {
        tradeSetupId: setup.id,
        pair: setup.pair,
        score: walletBoost,
        walletBoost,
        walletBoostReasons: reasons,
        explanation:
          distinctWallets.length === 0
            ? "No interesting-wallet evidence for this pair."
            : `Boosted by ${distinctWallets.length} interesting wallet(s): ${distinctWallets.join(", ")}.`,
      };
    })
    .sort((left, right) => right.score - left.score || left.tradeSetupId.localeCompare(right.tradeSetupId));
}
