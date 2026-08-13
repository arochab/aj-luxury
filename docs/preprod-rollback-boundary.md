# Private preproduction rollback boundary

## Bridge B7

Bridge B7 is a fail-closed transition runtime for the private Sites
preproduction project while its D1 database is exactly at migrations 0000
through 0007.

- Every cart, cart-line, shipping-quote, order, current-order and test-payment
  API path returns `503` for every HTTP method before any store or D1 access.
- The same paths stay `404` outside the exact private-preproduction environment
  and origin, also before D1 access.
- Health returns `200` only when the migration ledger is the exact ordered
  0000-through-0007 chain. It reports `runtimeMode=pre-0008-bridge`, all
  commerce and simulation capabilities false, and `launchReadiness=false`.
- Any other database state returns a truthful `503` health response.
- Bridge B7 contains no migration 0008, synthetic-demo marker or hidden
  functional-test branch.

The former positive HTTP API suites were intentionally removed from this
rollback branch because their expected open routes contradict the Bridge
runtime contract. Their evidence and history remain immutable in repository
commits `9e9dbeb3a7016b1d69fed329aa6227065f8afeba` and
`9963c9e7bee552f6b17f9394abf7602904bafe83`. Store, domain, migration, client
and security suites remain in CI. The deployed HTTP authority for this branch
is `tests/preprod-rollback-boundary.test.mjs`, which always invokes the default
built Worker.

This branch is not a production candidate and authorizes no deployment, Sites
version save, source fast-forward, custom domain or D1 migration.
