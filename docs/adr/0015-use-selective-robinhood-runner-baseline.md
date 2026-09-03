# Use Selective Robinhood Runner Baseline

The baseline strategy will scan Robinhood Chain every 15 minutes, keep the top 50 pairs by 1h volume, require at least 96 hours of pair age, at least $250k liquidity, at least $100k 1h volume, an ATH market cap between $7M and $25M, and current market cap within 30% below ATH. ATH must be at least 12 hours old and no older than 7 days, planned buy levels will be rounded from ATH pullbacks, simulated allocation will be split equally across planned levels, and each strategy version will keep at most 10 active trade setups.
