# Robinhood Wallet Discovery

TypeScript CLI for discovering buyer wallets for a token on Robinhood Chain using direct EVM RPC calls.

The milestone 1 workflow accepts a token address and Europe/Paris date window, discovers Uniswap V3-style pools against configured quote tokens, reads `Swap` logs through RPC, infers target-token buys, and writes wallet summaries to a JSON file.

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
SIMULATION_DATA_DIR=data
STRATEGY_VERSION=baseline-96h
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

Date inputs are interpreted as Europe/Paris wall-clock time to make manual comparisons with Dexscreener easier. Do not include a timezone suffix such as `Z` or `+02:00`.

For example, this scans the Dexscreener-visible minute from `Sep 1 02:01 PM` to `Sep 1 02:02 PM` in Europe/Paris:

```bash
npm run find-buyers -- --token 0x... --from 2026-09-01T14:01:00 --to 2026-09-01T14:02:00
```

Internally that summer timestamp maps to `2026-09-01T12:01:00.000Z` through the block before `2026-09-01T12:02:00.000Z`.

Use raw mode to include decoded MVP trade records:

```bash
npm run find-buyers -- --token 0x... --from 2026-09-01 --to 2026-09-02 --raw
```

Run continuous DEX Screener monitoring:

```bash
npm run monitor
```

The monitor scans Robinhood Chain every 15 minutes using the configured strategy, stores SQLite state under `data/simulation.sqlite` by default, records skipped pair reasons, and updates simulated positions from newly stored snapshots.

### Telegram alerts

Telegram alerts are optional. Set both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env` to enable them; leaving them unset disables only the Telegram adapter and the monitor keeps scanning.

```ini
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=-1001234567890
```

When enabled, the monitor sends one Telegram message for each new trade setup, simulated fill, stop loss, 2x take profit, repeated data-source failure (after three consecutive failed scans, at most once per hour), and a daily summary for the previous Europe/Paris day. Sent alerts are recorded in the `alert_history` table, so repeated scans and restarts never resend the same alert.

Pass `--require-alerts` to make the monitor fail fast when no alert adapter is configured:

```bash
npm run monitor -- --require-alerts
```

### Windows startup

Windows can run the live monitor directly with Node and Task Scheduler. From a PowerShell prompt in the repository root:

```powershell
npm install
.\scripts\register-windows-monitor.ps1
```

The setup registers `RobinhoodWalletAlerterMonitor` to start after boot and after login. It uses the current Windows user as the task principal with the S4U logon type so the boot trigger does not depend on an interactive login session. Run the script from an elevated PowerShell prompt if Windows requires admin rights to register that principal. By default it uses repo-local paths: `data\simulation.sqlite` for SQLite state, `data\` for runtime data, and `logs\monitor.log` for monitor output.

Use Windows-friendly paths when the runtime files should live outside the checkout:

```powershell
.\scripts\register-windows-monitor.ps1 `
  -DataDirectory "$env:LOCALAPPDATA\robinhood-wallet-alerter\data" `
  -DatabasePath "$env:LOCALAPPDATA\robinhood-wallet-alerter\data\simulation.sqlite" `
  -LogDirectory "$env:LOCALAPPDATA\robinhood-wallet-alerter\logs" `
  -TaskUser "$env:USERDOMAIN\$env:USERNAME"
```

Verify the task without WSL or Docker:

```powershell
Get-ScheduledTask -TaskName RobinhoodWalletAlerterMonitor
Start-ScheduledTask -TaskName RobinhoodWalletAlerterMonitor
Get-Content .\logs\monitor.log -Tail 40
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
