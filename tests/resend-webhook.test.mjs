import assert from "node:assert/strict";
import test from "node:test";
import {
  recordVerifiedResendWebhook,
  ResendWebhookError,
} from "../lib/commerce/resend-webhook.ts";

const signingBytes = new TextEncoder().encode("aj-luxury-resend-signing-key-2026");
const signingSecret = `whsec_${Buffer.from(signingBytes).toString("base64")}`;
const eventId = "msg_webhook_12345678";
const timestamp = "1787664000";
const now = "2026-08-25T08:00:00.000Z";

function database() {
  const events = new Map();
  return {
    prepare(sql) {
      let values = [];
      return {
        bind(...bound) {
          values = bound;
          return this;
        },
        async run() {
          assert.match(sql, /INSERT OR IGNORE INTO resend_webhook_events/);
          if (events.has(values[0])) return { meta: { changes: 0 } };
          events.set(values[0], {
            provider_message_id: values[1],
            event_type: values[2],
            occurred_at: values[3],
            payload_sha256: values[4],
          });
          return { meta: { changes: 1 } };
        },
        async first() {
          assert.match(sql, /FROM resend_webhook_events/);
          return events.get(values[0]) ?? null;
        },
      };
    },
  };
}

async function signature(rawBody, at = timestamp) {
  const key = await crypto.subtle.importKey(
    "raw",
    signingBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new TextEncoder().encode(`${eventId}.${at}.${new TextDecoder().decode(rawBody)}`);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed));
  return `v1,${Buffer.from(bytes).toString("base64")}`;
}

function payload() {
  return new TextEncoder().encode(JSON.stringify({
    type: "email.delivered",
    created_at: now,
    data: { email_id: "email_provider_12345678", to: ["customer@example.com"] },
  }));
}

test("a current Svix-signed Resend event is stored once without recipient content", async () => {
  const db = database();
  const rawBody = payload();
  const input = {
    database: db,
    rawBody,
    signingSecret,
    eventId,
    timestamp,
    signature: await signature(rawBody),
    now,
    nowEpochSeconds: Number(timestamp),
  };
  assert.deepEqual(await recordVerifiedResendWebhook(input), { disposition: "applied" });
  assert.deepEqual(await recordVerifiedResendWebhook(input), { disposition: "duplicate" });
});

test("tampered, stale and unsupported Resend events fail closed", async () => {
  const rawBody = payload();
  const base = {
    database: database(),
    rawBody,
    signingSecret,
    eventId,
    timestamp,
    signature: await signature(rawBody),
    now,
    nowEpochSeconds: Number(timestamp),
  };
  await assert.rejects(
    recordVerifiedResendWebhook({ ...base, rawBody: new TextEncoder().encode("{}") }),
    (error) => error instanceof ResendWebhookError && error.code === "INVALID_SIGNATURE",
  );
  await assert.rejects(
    recordVerifiedResendWebhook({ ...base, nowEpochSeconds: Number(timestamp) + 301 }),
    (error) => error instanceof ResendWebhookError && error.code === "INVALID_SIGNATURE",
  );
  const unsupported = new TextEncoder().encode(JSON.stringify({
    type: "domain.updated",
    created_at: now,
    data: { email_id: "email_provider_12345678" },
  }));
  await assert.rejects(
    recordVerifiedResendWebhook({ ...base, rawBody: unsupported, signature: await signature(unsupported) }),
    (error) => error instanceof ResendWebhookError && error.code === "INVALID_PAYLOAD",
  );
});
