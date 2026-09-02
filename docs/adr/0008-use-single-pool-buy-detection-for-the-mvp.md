# Use Single-Pool Buy Detection For The MVP

The MVP will identify target-token buys from individual configured V3 pool swaps and group results by transaction hash, without reconstructing full multi-hop routes. This makes buyer discovery useful sooner while preserving enough transaction context to add route-aware analysis later.
