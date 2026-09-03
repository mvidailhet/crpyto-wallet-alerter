# Use SQLite For Simulation State

The project now needs market snapshots, trade setup history, interesting-wallet state, alert history, and simulated positions. We will introduce SQLite for this state, superseding the discovery-milestone constraint in ADR-0007 that avoided a database while buyer discovery was still JSON-only.
