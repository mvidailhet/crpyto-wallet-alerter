# Test Pure Analysis Logic Without Live RPC In CI

The MVP test suite will cover pure logic such as Europe/Paris date parsing, V3 buy inference, wallet summary aggregation, pool candidate generation, and block-range chunking. Live Robinhood Chain RPC calls will remain manual smoke tests because public endpoint availability, rate limits, and historical access should not determine CI reliability.
