import { FulfillmentError } from "./fulfillment-domain.ts";
import type {
  VerifiedCarrierEvent,
  VerifiedCarrierEventClaims,
} from "./verified-carrier-event.ts";

const verifiedCarrierEvents = new WeakSet<object>();

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

export function isRegisteredVerifiedCarrierEvent(
  event: unknown,
): event is VerifiedCarrierEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    verifiedCarrierEvents.has(event)
  );
}
