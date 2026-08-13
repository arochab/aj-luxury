import assert from "node:assert/strict";
import test from "node:test";

import {
  CLIENT_VALIDATED_PARCEL_MAX_ITEMS,
  CLIENT_VALIDATED_PARCEL_SOURCE,
  isClientValidatedParcelProfile,
  resolveClientValidatedParcelProfile,
} from "../lib/commerce/parcel-profiles.ts";

const expected = Object.freeze([
  [1, "AJL_ENVELOPE_1_ITEM_V1", 150],
  [2, "AJL_ENVELOPE_2_ITEMS_V1", 250],
  [3, "AJL_ENVELOPE_3_ITEMS_V1", 350],
]);

test("client-validated parcel profiles preserve the rounded-up measurements", () => {
  assert.equal(CLIENT_VALIDATED_PARCEL_MAX_ITEMS, 3);
  assert.equal(CLIENT_VALIDATED_PARCEL_SOURCE, "client-validated-2026-08-13");
  for (const [quantity, profileCode, weightGrams] of expected) {
    const profile = resolveClientValidatedParcelProfile([{ quantity }]);
    assert.deepEqual(profile, {
      profileCode,
      sourceVersion: "client-validated-2026-08-13",
      itemCount: quantity,
      weightGrams,
      lengthMm: 400,
      widthMm: 320,
      heightMm: 40,
    });
    assert.equal(Object.isFrozen(profile), true);
    assert.equal(isClientValidatedParcelProfile(profile), true);
  }
});

test("multi-line carts resolve by total quantity, never by line count", () => {
  assert.equal(
    resolveClientValidatedParcelProfile([{ quantity: 1 }, { quantity: 1 }])
      ?.weightGrams,
    250,
  );
  assert.equal(
    resolveClientValidatedParcelProfile([
      { quantity: 1 },
      { quantity: 1 },
      { quantity: 1 },
    ])?.weightGrams,
    350,
  );
  assert.equal(
    resolveClientValidatedParcelProfile([{ quantity: 2 }, { quantity: 1 }])
      ?.profileCode,
    "AJL_ENVELOPE_3_ITEMS_V1",
  );
});

test("unmeasured or hostile quantities fail closed without running accessors", () => {
  for (const lines of [
    [],
    [{ quantity: 0 }],
    [{ quantity: -1 }],
    [{ quantity: 1.5 }],
    [{ quantity: Number.MAX_SAFE_INTEGER }],
    [{ quantity: 4 }],
    [{ quantity: 3 }, { quantity: 1 }],
    [{ quantity: "1" }],
    [{}],
    null,
  ]) {
    assert.equal(resolveClientValidatedParcelProfile(lines), null);
  }

  let getterRuns = 0;
  const accessor = {};
  Object.defineProperty(accessor, "quantity", {
    enumerable: true,
    get() {
      getterRuns += 1;
      return 1;
    },
  });
  assert.equal(resolveClientValidatedParcelProfile([accessor]), null);
  assert.equal(getterRuns, 0);

  const hostile = new Proxy({ quantity: 1 }, {
    getOwnPropertyDescriptor() {
      throw new Error("hostile descriptor");
    },
  });
  assert.equal(resolveClientValidatedParcelProfile([hostile]), null);
  const hostileProfile = new Proxy({}, {
    getPrototypeOf() {
      throw new Error("hostile prototype");
    },
  });
  assert.equal(isClientValidatedParcelProfile(hostileProfile), false);
});

test("forged profiles cannot pass the persistence boundary", () => {
  const valid = resolveClientValidatedParcelProfile([{ quantity: 2 }]);
  assert.ok(valid);
  assert.equal(isClientValidatedParcelProfile({ ...valid, weightGrams: 200 }), false);
  assert.equal(isClientValidatedParcelProfile({ ...valid, extra: true }), false);
  assert.equal(isClientValidatedParcelProfile(Object.create(valid)), false);
});
