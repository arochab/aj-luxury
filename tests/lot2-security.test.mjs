import assert from "node:assert/strict";
import test from "node:test";

import {
  createOneTimeAccessToken,
  hashOneTimeAccessToken,
  isOneTimeAccessTokenUsable,
  verifyOneTimeAccessToken,
} from "../lib/commerce/account-security.ts";

test("creates random one-time tokens and stores only a SHA-256 hash", async () => {
  const now = new Date("2026-08-10T20:00:00.000Z");
  const first = await createOneTimeAccessToken(now);
  const second = await createOneTimeAccessToken(now);

  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, second.tokenHash);
  assert.equal(first.tokenHash.length, 64);
  assert.equal(first.tokenHash, await hashOneTimeAccessToken(first.token));
  assert.equal(await verifyOneTimeAccessToken(first.token, first.tokenHash), true);
  assert.equal(await verifyOneTimeAccessToken(second.token, first.tokenHash), false);
  assert.equal(await verifyOneTimeAccessToken("x".repeat(10_000), first.tokenHash), false);
  assert.equal(first.expiresAt, "2026-08-10T20:15:00.000Z");
  assert.equal(first.token.includes("="), false);
});

test("rejects consumed, revoked, expired and malformed access records", () => {
  const now = new Date("2026-08-10T20:00:00.000Z");
  assert.equal(
    isOneTimeAccessTokenUsable({
      consumedAt: null,
      revokedAt: null,
      expiresAt: "2026-08-10T20:15:00.000Z",
      now,
    }),
    true,
  );
  assert.equal(
    isOneTimeAccessTokenUsable({
      consumedAt: "2026-08-10T19:59:00.000Z",
      revokedAt: null,
      expiresAt: "2026-08-10T20:15:00.000Z",
      now,
    }),
    false,
  );
  assert.equal(
    isOneTimeAccessTokenUsable({
      consumedAt: null,
      revokedAt: "2026-08-10T19:59:00.000Z",
      expiresAt: "2026-08-10T20:15:00.000Z",
      now,
    }),
    false,
  );
  assert.equal(
    isOneTimeAccessTokenUsable({
      consumedAt: null,
      revokedAt: null,
      expiresAt: "2026-08-10T19:59:00.000Z",
      now,
    }),
    false,
  );
  assert.equal(
    isOneTimeAccessTokenUsable({
      consumedAt: null,
      revokedAt: null,
      expiresAt: "invalid",
      now,
    }),
    false,
  );
});

test("bounds one-time token lifetime", async () => {
  const now = new Date("2026-08-10T20:00:00.000Z");
  await assert.rejects(() => createOneTimeAccessToken(now, 0), /between 1 and 60/);
  await assert.rejects(() => createOneTimeAccessToken(now, 61), /between 1 and 60/);
});
