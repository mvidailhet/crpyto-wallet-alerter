# Robinhood Wallet Alerter

The project finds Robinhood Chain meme-coin trade setups, records market history, and simulates how strategy triggers would have performed before any real trading automation is added.

## Language

**Trade Setup**:
A token pair that currently matches a strategy well enough to review or simulate as a possible trade.
_Avoid_: Signal, coin, runner

**Planned Buy Level**:
A market-cap or price level where a trade setup would open a simulated position if reached.
_Avoid_: Limit order

**Pair**:
The specific on-chain market used for price, liquidity, volume, and chart analysis.
_Avoid_: Token market, coin

**Token**:
The asset being considered across one or more pairs.
_Avoid_: Coin

**Trigger**:
An observed event or condition that causes the system to create or update a trade setup.
_Avoid_: Signal

**Interesting Wallet**:
A wallet worth watching because its past behavior may improve trade setup quality.
_Avoid_: Smart wallet, alpha wallet

**Wallet Evidence**:
The observed behavior that explains why an interesting wallet is worth watching.
_Avoid_: Wallet score explanation

**Simulation**:
A paper-trading evaluation of what would have happened if the system had acted on historical triggers.
_Avoid_: Backtest, trading bot

**Historical Replay**:
A simulation run against reconstructed past market history for a manually selected set of runner pairs.
_Avoid_: Full backtest, universe backfill

**Strategy Version**:
An immutable named set of strategy parameters used to create trade setups and simulated positions.
_Avoid_: Settings, config tweak

**Skipped Pair**:
A pair that was considered by a scanner run but excluded from trade setup creation with a recorded reason.
_Avoid_: Filtered coin

**Simulated Position**:
A paper-traded entry opened when a trade setup reaches one of its planned buy levels.
_Avoid_: Real position, order

**Stop Loss**:
The simulated exit level where a simulated position is closed after a fixed loss from its entry.
_Avoid_: Risk limit

**Take Profit**:
The simulated exit level where enough of a simulated position is sold to recover the initial entry cost.
_Avoid_: Sell target

**Moonbag**:
The remaining simulated position after the take profit has recovered the initial entry cost.
_Avoid_: Runner, free bag

**Momentum Warning**:
A non-executing event that marks where momentum-exit conditions appeared to weaken a simulated position.
_Avoid_: Sell signal

**Scan Gap**:
A time window where live market snapshots were missed because the scanner was not running or could not fetch data.
_Avoid_: Outage

**Adapter**:
A source-specific integration that fetches or reconstructs market, wallet, or alert data for the project.
_Avoid_: Provider, API client
