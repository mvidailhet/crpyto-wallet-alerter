import { createPublicClient, http } from "viem";

import { robinhoodChain } from "../chains/robinhood.js";

export function createRobinhoodClient(rpcUrl: string) {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl),
  });
}
