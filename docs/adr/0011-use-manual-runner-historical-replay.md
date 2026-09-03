# Use Manual Runner Historical Replay

Historical replay will start from a manually supplied list of past runner tokens or pairs, reconstructing market history from Robinhood RPC logs at coarse candle resolution. This avoids relying on public APIs for deep historical OHLC data and avoids the cost of backfilling the entire Robinhood meme-coin universe before the strategy is proven.
