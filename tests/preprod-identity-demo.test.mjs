import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryPreprodCapturedMailbox,
  PREPROD_DEMO_MODE,
  PasswordlessPreprodIdentityService,
  PreprodDemoError,
  passwordlessDemoAcknowledgement,
} from "../lib/preprod/identity-demo.ts";

const account = Object.freeze({
  id: "account_demo_adam",
  email: "adam@ajluxury.demo.invalid",
  displayName: "Adam Démo",
});

function fixture() {
  const mailbox = new InMemoryPreprodCapturedMailbox(PREPROD_DEMO_MODE);
  const service = new PasswordlessPreprodIdentityService({
    mode: PREPROD_DEMO_MODE,
    mailbox,
    accounts: [account],
  });
  return { mailbox, service };
}

function request(requestId, email = account.email, now = "2099-08-12T10:00:00.000Z") {
  return { requestId, email, now };
}

test("identity demo fails closed outside PREPROD_DEMO and accepts only reserved demo mailboxes", async () => {
  assert.throws(
    () => new InMemoryPreprodCapturedMailbox("production"),
    (error) => error instanceof PreprodDemoError && error.code === "PREPROD_ONLY",
  );
  assert.throws(
    () => new PasswordlessPreprodIdentityService({
      mode: PREPROD_DEMO_MODE,
      mailbox: new InMemoryPreprodCapturedMailbox(PREPROD_DEMO_MODE),
      accounts: [{ ...account, email: "adam@example.com" }],
    }),
    (error) => error instanceof PreprodDemoError && error.code === "INVALID_INPUT",
  );
});

test("known and unknown demo accounts receive the same acknowledgement without enumeration", async () => {
  const { mailbox, service } = fixture();
  const known = await service.requestAccess(request("known"));
  const unknown = await service.requestAccess(
    request("unknown", "unknown@ajluxury.demo.invalid"),
  );
  assert.deepEqual(known, passwordlessDemoAcknowledgement);
  assert.deepEqual(unknown, passwordlessDemoAcknowledgement);
  const messages = await mailbox.list();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].recipientEmail, account.email);
});

test("request replay is idempotent and conflicting reuse fails closed", async () => {
  const { mailbox, service } = fixture();
  await service.requestAccess(request("replay"));
  await service.requestAccess(request("replay"));
  assert.equal((await mailbox.list()).length, 1);
  await assert.rejects(
    service.requestAccess(request("replay", "other@ajluxury.demo.invalid")),
    (error) => error instanceof PreprodDemoError && error.code === "IDEMPOTENCY_CONFLICT",
  );
});

test("captured access is single-use, creates a bounded session and supports sign-out", async () => {
  const { mailbox, service } = fixture();
  await service.requestAccess(request("consume"));
  const [message] = await mailbox.list();
  const token = new URL(message.accessPath, "https://preprod.invalid").searchParams.get("token");
  assert.ok(token);
  assert.equal(service.challengeEvidence()[0].tokenHash.includes(token), false);

  const session = await service.consumeAccess({
    token,
    now: "2099-08-12T10:01:00.000Z",
  });
  assert.ok(session);
  assert.equal(session.account.id, account.id);
  assert.equal((await mailbox.list()).length, 0);
  assert.equal(
    await service.consumeAccess({ token, now: "2099-08-12T10:02:00.000Z" }),
    null,
  );
  assert.equal(
    (await service.authenticateSession({
      sessionToken: session.sessionToken,
      now: "2099-08-12T10:20:00.000Z",
    }))?.id,
    account.id,
  );
  assert.equal(
    await service.signOut({
      sessionToken: session.sessionToken,
      now: "2099-08-12T10:21:00.000Z",
    }),
    true,
  );
  assert.equal(
    await service.authenticateSession({
      sessionToken: session.sessionToken,
      now: "2099-08-12T10:22:00.000Z",
    }),
    null,
  );
});

test("expired access and sessions fail closed and the admin summary exposes counts only", async () => {
  const { mailbox, service } = fixture();
  await service.requestAccess(request("expired"));
  const [message] = await mailbox.list();
  const token = new URL(message.accessPath, "https://preprod.invalid").searchParams.get("token");
  assert.ok(token);
  assert.equal(
    await service.consumeAccess({ token, now: "2099-08-12T10:15:00.000Z" }),
    null,
  );
  assert.equal(await mailbox.purgeExpired("2099-08-12T10:15:00.000Z"), 1);
  assert.deepEqual(
    await service.readAdminSummary("2099-08-12T10:15:00.000Z"),
    {
      demoAccounts: 1,
      activeChallenges: 0,
      activeSessions: 0,
      capturedMessages: 0,
    },
  );
});

test("hostile payload shapes and accessors are rejected without execution", async () => {
  const { service } = fixture();
  let getterCalls = 0;
  const hostile = {};
  Object.defineProperty(hostile, "email", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return account.email;
    },
  });
  await assert.rejects(
    service.requestAccess(hostile),
    (error) => error instanceof PreprodDemoError && error.code === "INVALID_INPUT",
  );
  assert.equal(getterCalls, 0);
  assert.equal(
    await service.authenticateSession({
      sessionToken: "not-a-token",
      now: "2099-08-12T10:00:00.000Z",
      unexpected: true,
    }),
    null,
  );
});
