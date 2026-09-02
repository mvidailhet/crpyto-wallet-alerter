# Discover V3 Pools From Configured Quotes And Fees

The initial token discovery workflow will find Uniswap V3-style pools by calling the Robinhood Chain V3 factory for configured quote tokens and standard fee tiers. This keeps token-address input simple without requiring a full historical scan of factory `PoolCreated` events, at the cost of only finding pools covered by the configured quote and fee list.
