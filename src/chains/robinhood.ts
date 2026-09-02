import type { Chain } from "viem";

export const robinhoodChain = {
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.mainnet.chain.robinhood.com/"],
    },
  },
} as const satisfies Chain;

export const robinhoodContracts = {
  v3Factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
} as const;

export const defaultQuoteTokens = [robinhoodContracts.weth, robinhoodContracts.usdg] as const;
export const defaultV3FeeTiers = [100, 500, 3000, 10000] as const;
