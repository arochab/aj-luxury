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

The controlled stock import must be executed once, through its owner-only and
idempotent route, from the exact controlled Worker version that is recorded by
the stock attestation. Keep `PRODUCTION_STOCK_IMPORT_ENABLED=true` on that
single controlled version: publishing a second controlled version merely to
turn the flag off would change the Worker version ID and invalidate the
attestation. Close the import when promoting the separate `live` version, and
set `COMMERCE_PROMOTED_FROM_VERSION_ID` there to the recorded controlled Worker
version ID. The unresolved mediator blocker still keeps both controlled payment
and public commerce closed until the visible legal terms are finalized.

### Provider identity attestation

The release evidence must bind the runtime to these verified public identities;
credentials remain secret and are never copied into this runbook:

- Stripe account `acct_1U4iFTC0NIklfc9C`;
- Sendcloud integration `612109` (`AJ Luxury Site officiel`);
- Sendcloud sender address `884432` (`AJ Luxury`, Belmont 67130, France);
- verified Resend domain `ajluxurystore.com`.

Any different identity closes the release gate pending a new dated verification.

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
