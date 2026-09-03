# Use Conservative Simulation Fills

Simulated positions will open at planned buy levels, stop at the configured stop-loss level, and take profit at the configured take-profit level rather than at later snapshot prices. When coarse snapshots cannot prove whether a stop loss or take profit happened first, the simulation will assume the stop loss happened first so reported performance does not depend on optimistic fill ordering.
