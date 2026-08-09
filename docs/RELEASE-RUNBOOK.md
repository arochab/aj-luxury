# AJ Luxury — release and rollback runbook

## Release gate

A production release is anchored by both:

1. an immutable Git commit SHA containing only the approved AJ Luxury scope;
2. a saved Sites version linked to that exact SHA.

Before deployment, the release owner records the candidate SHA, the new Sites
version ID and the currently deployed Sites version ID in the release handoff.
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
- `/media/i18n/en.json?v=v3` is immutable JSON with `nosniff`;
- `/images/review/*` and `/media/images/review/*` do not expose review proofs;
- no console error, broken image, horizontal overflow or language regression;
- private commerce routes remain excluded from shared HTML caching.

Do not close the release until the deployment status is successful and these
checks pass on `https://ajluxurystore.com`.

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
