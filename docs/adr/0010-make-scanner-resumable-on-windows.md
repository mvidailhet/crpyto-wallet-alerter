# Make Scanner Resumable On Windows

The v1 scanner will run continuously on an always-on Windows machine, with a small Windows startup or scheduled task used only to restart it after reboots. Persistent scan cursors, market snapshots, trade setups, simulated positions, and alert history must live in SQLite so the process can resume where it stopped instead of relying on in-memory state.
