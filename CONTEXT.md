# Wallet Alerting

This context defines the language for finding wallets with notable onchain trading behavior and alerting when those wallets act.

## Language

**Interesting Wallet**:
A wallet that bought a specified token during a specified block or date range and is worth reviewing because of measurable trade behavior such as buy size or recurrence.
_Avoid_: Smart wallet, whale, insider, alpha wallet

**Token Discovery Workflow**:
A workflow where the user provides a token address directly, and the system discovers the relevant trading venues before analyzing buyer wallets.
_Avoid_: Pool-only workflow, manual pool lookup

**Analysis Window**:
The user-specified time interval used to search for token buys. Users define it with dates, even though the system resolves those dates to chain block numbers before querying logs.
_Avoid_: Block range, from block, to block

**Europe/Paris Date Window**:
An analysis window interpreted as Europe/Paris wall-clock time so CLI input lines up with Dexscreener's local timestamp display. A date without a time means the Europe/Paris calendar day starting at local midnight.
_Avoid_: UTC input, timezone-suffixed input

**Buyer Wallet**:
The transaction `from` address for a transaction whose decoded swap increased the target token output. This is the MVP definition and may differ from the final recipient in routed or contract-mediated trades.
_Avoid_: Recipient, swap sender, trader

**V3 Pool**:
A Uniswap V3-style liquidity pool that emits swaps with signed token amount deltas and belongs to a factory that creates pools for token pairs and fee tiers.
_Avoid_: V2 pair, V4 pool

**Quote Token**:
A configured token paired against the target token when discovering candidate V3 pools, such as WETH or USDG.
_Avoid_: Base token, paired coin

**Pool Discovery**:
The process of finding V3 pools for a target token by checking configured quote tokens and fee tiers against the V3 factory.
_Avoid_: Full factory indexing, manual pool discovery

**Target Token Buy**:
A V3 swap where the target token amount is negative, meaning the target token moved out of the pool.
_Avoid_: Swap, transfer, purchase

**Wallet Summary**:
The default analysis output grouped by buyer wallet, including buy count, total target token bought, total quote token spent, first and last buy time, and related transaction hashes.
_Avoid_: Raw logs, decoded swaps

**Token Metadata**:
The ERC-20 symbol and decimals used to format raw token amounts at the output boundary.
_Avoid_: Price data, token identity

**RPC Endpoint**:
An EVM JSON-RPC endpoint used for chain reads. The project avoids data-product APIs while allowing the endpoint URL to be configured for public or archive-provider RPC access.
_Avoid_: Paid API, indexer API

**Empty Discovery Result**:
A successful analysis result with no wallets and warnings explaining that no configured pools or qualifying buys were found.
_Avoid_: Error, failure, missing data

**Single-Pool Buy Detection**:
The MVP rule that treats a transaction as a target-token buy when any configured V3 pool swap sends the target token out of that pool, without reconstructing the full multi-hop path.
_Avoid_: Route reconstruction, multi-hop analysis
