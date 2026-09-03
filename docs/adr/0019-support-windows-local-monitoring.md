# Support Windows Local Monitoring

The live monitor will run as a local Node process on Windows, with a PowerShell script to register a Windows scheduled task for restart after boot or login. Runtime data will default to a local `data/` directory, generated reports will go to `reports/`, and both will be gitignored except for templates or examples.
