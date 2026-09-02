# Robinhood Wallet Discovery

TypeScript CLI for discovering buyer wallets for a token on Robinhood Chain using direct EVM RPC calls.

The milestone 1 workflow accepts a token address and UTC date window, discovers Uniswap V3-style pools against configured quote tokens, reads `Swap` logs through RPC, infers target-token buys, and writes wallet summaries to a JSON file.

## Setup

```bash
npm install
cp .env.example .env
```

`.env` controls the RPC endpoint and log pagination:

```ini
ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com/
LOG_CHUNK_SIZE=1000
RPC_TIMEOUT_MS=10000
```

## Usage

```bash
npm run find-buyers -- --token 0x... --from 2026-09-01 --to 2026-09-02
```

By default, results are written to `results.json`. Console output is reserved for progress and errors.

Choose a different output file with:

```bash
npm run find-buyers -- --token 0x... --from 2026-09-01 --to 2026-09-02 --output cashcat-buyers.json
```

Date-only inputs are interpreted as UTC calendar boundaries. The example scans from `2026-09-01T00:00:00.000Z` through the block before `2026-09-02T00:00:00.000Z`.

Use raw mode to include decoded MVP trade records:

```bash
npm run find-buyers -- --token 0x... --from 2026-09-01 --to 2026-09-02 --raw
```

## Robinhood Chain Assumptions

- Chain ID: `4663`
- Default RPC: `https://rpc.mainnet.chain.robinhood.com/`
- V3 factory: `0x1f7d7550b1b028f7571e69a784071f0205fd2efa`
- Initial quote tokens:
  - WETH: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`
  - USDG: `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`
- Initial V3 fee tiers: `100`, `500`, `3000`, `10000`

Pool discovery calls `getPool(token, quoteToken, fee)` on the V3 factory. If no pools are found, the CLI exits successfully with an empty wallet list and warnings showing the quote tokens and fee tiers checked.

## Output

Default output is `results.json` containing JSON wallet summaries:

- buyer wallet;
- buy count;
- total target token bought;
- total quote token spent where inferable;
- first buy timestamp;
- last buy timestamp;
- transaction hashes.

Raw token amounts stay as `bigint` internally. Formatting happens at the output boundary using ERC-20 `symbol()` and `decimals()`.

## Current Limitations

- Uniswap V3-style pools only.
- Buyer wallet is the transaction `from` address.
- Buy detection is single-pool only: a target-token buy is a swap where the target token amount is negative.
- No V4 support yet.
- No multi-hop route reconstruction.
- No database, full indexer, frontend, watched wallets, or live alerts.
- No Bitquery, GMGN, DEX Screener, or paid data-product API integration.

## Manual Smoke Test

1. Set `ROBINHOOD_RPC_URL` in `.env`.
2. Pick a Robinhood Chain token address expected to have WETH or USDG V3 liquidity.
3. Run:

```bash
npm run find-buyers -- --token 0x... --from 2026-09-01 --to 2026-09-02 --raw
```

If the public RPC limits log ranges, lower `LOG_CHUNK_SIZE` and retry. If the RPC stalls on historical block or log requests, lower `RPC_TIMEOUT_MS` to fail faster or configure a different plain EVM RPC endpoint.

## Development

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
```

Tests cover pure logic only and do not perform live RPC calls.

## Next Milestones

- Add more quote tokens.
- Add V4 support.
- Improve buyer identification.
- Add route reconstruction.
- Add watched wallets and live alerts.
- Add persistence.
