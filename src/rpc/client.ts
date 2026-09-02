import { createPublicClient, http } from "viem";

import { robinhoodChain } from "../chains/robinhood.js";

export function createRobinhoodClient(rpcUrl: string, timeoutMs = 10_000) {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl, {
      retryCount: 1,
      timeout: timeoutMs,
    }),
  });
}
