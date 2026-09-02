# Use Configurable Plain RPC Endpoints

The project will use plain EVM JSON-RPC through a configurable `ROBINHOOD_RPC_URL` instead of integrating paid data-product APIs. This preserves the direct-RPC architecture while allowing the public Robinhood Chain endpoint to be replaced with an archive/provider RPC if historical reads or rate limits require it.
