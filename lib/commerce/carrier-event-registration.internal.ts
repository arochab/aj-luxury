import { FulfillmentError } from "./fulfillment-domain.ts";
import type {
  VerifiedCarrierEvent,
  VerifiedCarrierEventClaims,
} from "./verified-carrier-event.ts";

const verifiedCarrierEvents = new WeakSet<object>();
const preprodWorkerRegistrars = new WeakSet<object>();
const sendcloudWorkerRegistrars = new WeakSet<object>();

type NodeTestProcess = Readonly<{
  env?: Readonly<Record<string, string | undefined>>;
  release?: Readonly<{ name?: string }>;
  versions?: Readonly<{ node?: string }>;
}>;

function assertNodeTestRuntime(): void {
  const runtimeProcess = (
    globalThis as typeof globalThis & { process?: NodeTestProcess }
  ).process;
  const testContext = runtimeProcess?.env?.NODE_TEST_CONTEXT;

  if (
    runtimeProcess?.release?.name !== "node" ||
    typeof runtimeProcess.versions?.node !== "string" ||
    typeof testContext !== "string" ||
    testContext.length === 0
  ) {
    throw new FulfillmentError(
      "TRACKING_VERIFICATION_REQUIRED",
      "The internal carrier registration seam is restricted to the Node test runner.",
    );
  }
}

/** Node-test-only seam for the approved local carrier verification adapter. */
export function registerVerifiedCarrierEventForNodeTest(
  claims: VerifiedCarrierEventClaims,
): VerifiedCarrierEvent {
  assertNodeTestRuntime();
  const event = Object.freeze({ ...claims });
  verifiedCarrierEvents.add(event);
  return event as VerifiedCarrierEvent;
}

/** Request-local capability for the private synthetic carrier simulator. */
export function issuePreprodWorkerCarrierRegistrar(
  environment: unknown,
): Readonly<{
  register(
    currentEnvironment: unknown,
    claims: VerifiedCarrierEventClaims,
  ): VerifiedCarrierEvent;
}> {
  if (environment !== "preproduction") {
    throw new FulfillmentError(
      "TRACKING_VERIFICATION_REQUIRED",
      "The synthetic carrier registrar is restricted to preproduction.",
    );
  }
  const capability = Object.freeze({});
  preprodWorkerRegistrars.add(capability);
  return Object.freeze({
    register(currentEnvironment, claims) {
      if (
        currentEnvironment !== "preproduction" ||
        !preprodWorkerRegistrars.has(capability) ||
        claims.providerCode !== "synthetic_demo" ||
        claims.verificationMethod !== "test_adapter"
      ) {
        throw new FulfillmentError(
          "TRACKING_VERIFICATION_REQUIRED",
          "The synthetic carrier event lacks trusted preproduction provenance.",
        );
      }
      const event = Object.freeze({ ...claims });
      verifiedCarrierEvents.add(event);
      return event as VerifiedCarrierEvent;
    },
  });
}

/**
 * Request-local capability for the production Sendcloud webhook verifier.
 *
 * The caller must still validate Sendcloud's HMAC over the exact raw request
 * body before using this registrar. Keeping registration behind a one-shot
 * capability prevents plain application objects from being mistaken for
 * carrier evidence by the fulfillment store.
 */
export function issueSendcloudWorkerCarrierRegistrar(): Readonly<{
  register(claims: VerifiedCarrierEventClaims): VerifiedCarrierEvent;
}> {
  const capability = Object.freeze({});
  sendcloudWorkerRegistrars.add(capability);
  let consumed = false;
  return Object.freeze({
    register(claims) {
      if (
        consumed || !sendcloudWorkerRegistrars.has(capability) ||
        claims.providerCode !== "sendcloud" ||
        claims.verificationMethod !== "carrier_signature"
      ) {
        throw new FulfillmentError(
          "TRACKING_VERIFICATION_REQUIRED",
          "The Sendcloud carrier event lacks trusted production provenance.",
        );
      }
      consumed = true;
      sendcloudWorkerRegistrars.delete(capability);
      const event = Object.freeze({ ...claims });
      verifiedCarrierEvents.add(event);
      return event as VerifiedCarrierEvent;
    },
  });
}

export function isRegisteredVerifiedCarrierEvent(
  event: unknown,
): event is VerifiedCarrierEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    verifiedCarrierEvents.has(event)
  );
}
