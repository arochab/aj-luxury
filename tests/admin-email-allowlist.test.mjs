import assert from "node:assert/strict";
import test from "node:test";

import {
  adminEmailAllowed,
  configuredAdminEmails,
  REQUIRED_ADMIN_EMAILS,
} from "../worker/admin-email-allowlist.ts";

const exactConfiguration = {
  COMMERCE_ADMIN_ALLOWED_EMAILS_JSON: JSON.stringify([
    "adam.chabbi94@gmail.com",
    "jeremy@ajluxurystore.com",
    "jeremyajluxurystore@gmail.com",
  ]),
};

test("admin allowlist contains exactly the three approved addresses", () => {
  assert.deepEqual(configuredAdminEmails(exactConfiguration), REQUIRED_ADMIN_EMAILS);
  for (const email of REQUIRED_ADMIN_EMAILS) {
    assert.equal(adminEmailAllowed(email.toUpperCase(), exactConfiguration), true);
  }
  assert.equal(adminEmailAllowed("intruder@example.com", exactConfiguration), false);
});

test("admin allowlist fails closed on any omission, addition or duplicate", () => {
  for (const values of [
    REQUIRED_ADMIN_EMAILS.slice(0, 2),
    [...REQUIRED_ADMIN_EMAILS, "intruder@example.com"],
    [REQUIRED_ADMIN_EMAILS[0], REQUIRED_ADMIN_EMAILS[0], REQUIRED_ADMIN_EMAILS[1]],
  ]) {
    const env = { COMMERCE_ADMIN_ALLOWED_EMAILS_JSON: JSON.stringify(values) };
    assert.equal(configuredAdminEmails(env), null);
    assert.equal(adminEmailAllowed(REQUIRED_ADMIN_EMAILS[0], env), false);
  }
});
