# Use Versioned Strategy Config Files

Strategy definitions will live in versioned JSON config files, with secrets and runtime endpoints kept in environment variables and each executed strategy version copied into SQLite. This keeps strategy tuning reviewable in git while preserving the exact parameters used for live simulation and historical replay.
