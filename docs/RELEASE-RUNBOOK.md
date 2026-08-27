# AJ Luxury — release and rollback runbook

## Release gate

### Canonical launch inventory

The launch gate uses the verified current physical stock, not the historical
initial purchase quantity:

- 756 units initially recorded;
- 4 units already sold and 3 gifts already given, leaving 749 physical units;
- 23 additional units reserved for gifts at launch, for 26 gifts in total;
- 726 units sellable now, exactly 242 per colour.

| Colour | S | M | L | XL | Sellable |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pourpre | 24 | 100 | 85 | 33 | 242 |
| Lilas | 24 | 99 | 86 | 33 | 242 |
| Rose | 24 | 100 | 85 | 33 | 242 |
| **Total** | **72** | **299** | **256** | **99** | **726** |

This launch allocation comes from Adam's instruction applied to the verified
stock sheet; it is not presented as a supplier fact. The remaining 23-gift
reserve is Pourpre 2/2/2/2, Lilas 2/1/2/2 and Rose 2/2/2/2 for S/M/L/XL.
Together with the three M gifts already given (Pourpre 1, Lilas 1, Rose 1), all
variants have two total gift units except Pourpre M and Rose M, which have three.
Dynamic packs continue to draw from these sellable variants, including packs
whose pieces share the same colour.

The stock-owner approval in the launch manifest records Adam CHABBI's dated
relay of Jérémy SCHEPPLER's verbal approval. The signer identifier preserves
that provenance explicitly; it is not presented as a direct electronic
signature by Jérémy.

The controlled stock import must be executed once, through its owner-only and
idempotent route, from the exact controlled Worker version that is recorded by
the stock attestation. Never rewrite that manifest to make a later runtime
appear to be the importer. A reviewed code-only controlled upgrade may instead
set the exact pair `COMMERCE_STOCK_EVIDENCE_RELEASE_SHA` and
`COMMERCE_STOCK_EVIDENCE_VERSION_ID` to the original attested source. Both
values are required, the new code SHA still needs both human approvals, and the
new version must keep the import route closed. Live promotion keeps that same
immutable stock-evidence pair and separately sets
`COMMERCE_PROMOTED_FROM_RELEASE_SHA` and
`COMMERCE_PROMOTED_FROM_VERSION_ID` to the exact controlled runtime provenance
written immutably on the first order. The private owner-only
controlled order may defer the mediator,
monitoring-alert approval and operator-MFA gates by the release owner's dated
decision. All three remain mandatory before promotion to public `live` commerce;
the controlled exception never represents those tasks as completed.

### Provider identity attestation

The release evidence must bind the runtime to these verified public identities;
credentials remain secret and are never copied into this runbook:

- Stripe account `acct_1U4iFTC0NIklfc9C`;
- Sendcloud integration `612109` (`AJ Luxury Site officiel`);
- Sendcloud sender address `884432` (`AJ Luxury`, Belmont 67130, France);
- verified Resend domain `ajluxurystore.com`.

Any different identity closes the release gate pending a new dated verification.

### Controlled runtime matrix

`cloudflare.controlled.jsonc` remains the isolated rehearsal Worker: it uses a
separate D1 and private Sites origin and can never become the source of public
release evidence. The first real order on the official domain instead runs the
`aj-luxury-production` Worker in `controlled` mode, on the production D1, with
`COMMERCE_ORIGIN=https://ajluxurystore.com`. Its immutable stock/provider proof,
order provenance and later `live` promotion therefore stay on the same D1 and
the same canonical origin. Public traffic remains owner-restricted until that
order is reconciled and the live gates pass.

The private Sites environment supplies `COMMERCE_BACKEND_ORIGIN`, an exact
`COMMERCE_STOREFRONT_ORIGINS_JSON` containing only the private Sites origin,
`COMMERCE_SITES_OWNER_AUTH_ENABLED=true`, its exact owner-auth origin, and the
approved owner identity. The Sites bridge and Worker share the proxy and
controlled-HMAC secrets through their secret stores. No secret is copied into a
config file, release note or evidence bundle.

Before the controlled order, the release owner records and verifies these
runtime-only groups against the exact release SHA and Worker version:

- release, Adam/Jérémy, stock-manifest and public provider identity attestations;
- Stripe live settlement, webhook verification and controlled payment-session
  enablement;
- Sendcloud outbound shipment creation, sender attestation and delivery-reference
  vault key version;
- Resend webhook verification plus transactional dispatch enabled in
  `controlled` mode;
- late-payment refund dispatch, reservation expiry, returns, shipment handover
  and reporting activation; operator MFA may be deferred only in `controlled`;
- the four controlled rate-limit bindings and the exact private bridge origin.

Flags such as `PRODUCTION_STOCK_IMPORT_ENABLED`,
`CONTROLLED_PAYMENT_SESSION_ENABLED`, `OUTBOUND_SHIPMENT_CREATION_ENABLED`,
`TRANSACTIONAL_EMAIL_DISPATCH_ENABLED`, `TRANSACTIONAL_EMAIL_DISPATCH_MODE`,
`LATE_PAYMENT_REFUND_DISPATCH_ENABLED`, `RESERVATION_EXPIRY_ENABLED`,
`RETURNS_WORKFLOW_ENABLED`, `SHIPMENT_HANDOVER_ENABLED`,
`COMMERCE_REPORTING_ENABLED` and `OPERATOR_ADMIN_MFA_ENABLED` are runtime release
decisions, not claims pre-signed in the committed config. The health response
must remain closed if any gate required for the current mode, schema proof or
identity is missing. The narrow `controlled` exception does not apply to
`live`: unresolved mediator details, monitoring approval or operator MFA keep
public commerce closed.

### First controlled order evidence

Before any public promotion, retain one
redacted, timestamped evidence packet for the owner-only controlled order. It
must prove all of the following against one order ID without storing credentials
or card data:

1. health is ready on the exact SHA/version and the private Sites bridge reaches
   only the controlled Worker and D1;
2. the 12-line stock manifest is attested at 749 physical, 23 remaining gift
   reserve and 726 sellable, and the chosen unit or same-colour/mixed-colour pack
   decrements only its real variants;
3. the selected Sendcloud offer has a positive EUR price from V3, or an exact
   country/weight/dimensions/carrier/mode V2 fallback receipt;
4. Stripe records the expected EUR amount once, the webhook becomes processed,
   the order becomes paid and the stock movement is committed atomically;
5. exactly one `order_confirmation` and one `payment_confirmation` outbox row
   reach `sent`; the detailed order message contains lines, discounts, delivery,
   total, tax zero, article 293 B and the immutable CGV version/hash snapshot;
6. label creation is performed only for the real parcel. `label_ready` creates
   no shipment email. After the parcel is physically handed to the carrier, the
   owner-only handover route records the real tracking event and queues exactly
   one shipment confirmation; replaying the same event queues no second email;
7. provider receipts, D1 rows and audit events reconcile to the same order,
   payment, shipment and idempotency references.

### Controlled rollback and reconciliation

If any step is ambiguous, close new checkout traffic and preserve the controlled
D1 and provider receipts. Never delete or recreate a paid order to obtain a
clean retry. Reconcile Stripe payment/refund state first, then D1 order and stock
movements, then the two paid-order emails, then Sendcloud label/tracking state.
Unknown Stripe or Sendcloud outcomes require provider lookup and manual review;
they must never trigger a blind second charge, refund or label. Email retries use
the retained provider idempotency key. Restore the previous Worker and private
Sites versions together only after recording which D1 state they continue to
serve. A future live Worker must retain
the exact `COMMERCE_PROMOTED_FROM_RELEASE_SHA` plus
`COMMERCE_PROMOTED_FROM_VERSION_ID` written on the first order, while the
separate stock-evidence pair remains bound to the immutable importer.

A production release is anchored by both:

1. an immutable Git commit SHA containing only the approved AJ Luxury scope;
2. a saved Sites version linked to that exact SHA.

Before deployment, the release owner records the candidate SHA, the new Sites
version ID and the currently deployed Sites version ID in the release handoff.
The handoff must also record the dated approval from Adam CHABBI and then the
dated approval from Jérémy SCHEPPLER, both explicitly tied to that exact SHA and
that exact Sites version. Without both approvals, the candidate remains in the
test environment and production stays read-only.
The gate requires a successful build, lint, complete automated test suite,
responsive visual QA, and a clean runtime-reference audit.

## Production verification

After deployment, verify the public domain:

- the expected release marker is present in HTML;
- public HTML carries the expected shared `Cache-Control` policy without any
  `caches.default` permission error in the Worker logs;
- every hero URL uses `/media/`; posters respond successfully and an MP4
  request with `Range: bytes=0-1023` returns `206`, `Content-Range`,
  `Accept-Ranges: bytes` and exactly 1,024 bytes;
- `/media/i18n/en.json?v=v5` is immutable JSON with `nosniff`;
- `/images/review/*` and `/media/images/review/*` do not expose review proofs;
- `docs/internal/**` and client evidence are not bundled, routed or publicly served;
- no console error, broken image, horizontal overflow or language regression;
- private commerce routes remain excluded from shared HTML caching.

Do not close the release until the deployment status is successful and these
checks pass on `https://ajluxurystore.com`.

## Canonical and defensive domains

`ajluxurystore.com` is the sole production canonical domain. The registered
`ajluxurystore.fr` domain is a defensive asset and is outside a normal
application release: never publish a duplicate site or create mail service on
it by implication.

Any future `.fr` redirect requires a separately approved domain handoff tied to
`docs/internal/DOMAIN-PROTECTION-FR-2026-08-10.md`. It must cover the DNS and the
HTTP redirect service, HTTPS on the apex and `www`, a one-hop permanent `301` or
`308` redirect to the `.com`, an immediately prior zone snapshot, the explicit
e-mail policy, verification evidence and a documented rollback. Without that
exact handoff and Adam’s then Jérémy’s approval, leave the `.fr` unchanged.

## Application rollback

If a blocking regression appears, redeploy the immediately previous successful
Sites version recorded in the release handoff. Do not rebuild it and do not
change DNS. Its Worker bundle, static assets and HTML cache policy must be
restored together as one immutable unit.

Then repeat the media Range, cache-policy and responsive smoke checks above.
Keep the failed commit and Sites version available for diagnosis; remediate
through a new commit and a new Sites version rather than mutating an existing
release.

## DNS rollback

DNS changes are outside normal application rollback. Use the scoped domain
rollback procedure only when the incident is demonstrably DNS-related. Never
mix a DNS rollback with an application rollback without recording both actions.
Treat the `.com` and `.fr` zones independently; never restore one by copying the
other zone wholesale.
