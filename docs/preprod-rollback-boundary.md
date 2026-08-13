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

## Rollback R8

Rollback R8 is the child of the CI-green Bridge B7 commit. It is the only
rollback runtime in this chain that understands the terminal synthetic
migration 0008.

- It contains migration 0008 byte-for-byte from the audited synthetic candidate
  (`SHA-256 794e1c67471427ba3d92e979e79e07a8393244794d7d98b827db6b0fda07b5b5`).
- It retains the same all-method, pre-store closure for every cart, cart-line,
  shipping-quote, order, current-order and test-payment path.
- Health returns `200` only for the exact ordered 0000-through-0008 ledger plus
  the exact `synthetic-demo` / `aj-demo-v1` sentinel whose immutable expiry is
  still in the future. It reports `runtimeMode=post-0008-rollback`, every real
  and simulated capability false, and `launchReadiness=false`.
- Missing, invalid, widened or expired sentinel state, or any ledger drift,
  returns `503`.
- The marker fixes this runtime to the private Sites project and explicitly
  forbids production promotion.

Rollback R8 is not a production candidate. Its existence authorizes no
deployment, Sites version save, source fast-forward, custom domain or D1
migration.
